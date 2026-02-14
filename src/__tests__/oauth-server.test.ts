import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

// vi.hoisted runs before vi.mock hoisting, so these are available in mock factories
const { tmpBase, gcpKeysPath, mockGetToken, mockGenerateAuthUrl } = vi.hoisted(() => {
  const _os = require('os');
  const _path = require('path');
  const _fs = require('fs');
  const _tmpBase = _path.join(_os.tmpdir(), `nanoclaw-oauth-test-${Date.now()}`);
  _fs.mkdirSync(_tmpBase, { recursive: true });
  const _gcpKeysPath = _path.join(_tmpBase, 'gcp-oauth.keys.json');

  return {
    tmpBase: _tmpBase as string,
    gcpKeysPath: _gcpKeysPath as string,
    mockGetToken: vi.fn(),
    mockGenerateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true'),
  };
});

// Mock config values
vi.mock('../config.js', () => ({
  DATA_DIR: tmpBase,
  GROUPS_DIR: tmpBase,
  GCP_OAUTH_KEYS_PATH: gcpKeysPath,
  OAUTH_CALLBACK_URL: 'http://localhost:0',
  OAUTH_PORT: 0,
  OAUTH_SESSION_TTL_MS: 10 * 60 * 1000,
}));

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock google-auth-library with function constructor
vi.mock('google-auth-library', () => ({
  OAuth2Client: function MockOAuth2Client() {
    return {
      getToken: mockGetToken,
      generateAuthUrl: mockGenerateAuthUrl,
    };
  },
}));

import {
  resolveScopes,
  loadOAuthClientConfig,
  createOAuthSession,
  handleOAuthCallback,
  saveUserTokens,
  cleanExpiredSessions,
  startOAuthServer,
  _getPendingSessions,
  _resetForTesting,
  OAuthError,
  type GoogleTokens,
} from '../oauth-server.js';

function writeGcpKeys() {
  fs.writeFileSync(
    gcpKeysPath,
    JSON.stringify({
      installed: {
        client_id: 'test-client-id.apps.googleusercontent.com',
        client_secret: 'test-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    }),
  );
}

const fakeTokens: GoogleTokens = {
  access_token: 'ya29.fake-access-token',
  refresh_token: '1//fake-refresh-token',
  scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
  token_type: 'Bearer',
  expiry_date: Date.now() + 3600_000,
};

describe('oauth-server', () => {
  beforeEach(() => {
    _resetForTesting();
    mockGetToken.mockReset();
    mockGenerateAuthUrl.mockReset();
    mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true');
    writeGcpKeys();
  });

  afterAll(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('resolveScopes', () => {
    it('returns gmail scopes', () => {
      const scopes = resolveScopes('gmail');
      expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
      expect(scopes).toContain('https://www.googleapis.com/auth/gmail.settings.basic');
      expect(scopes).toHaveLength(2);
    });

    it('returns calendar scopes', () => {
      const scopes = resolveScopes('calendar');
      expect(scopes).toContain('https://www.googleapis.com/auth/calendar');
      expect(scopes).toHaveLength(1);
    });

    it('returns drive scopes', () => {
      const scopes = resolveScopes('drive');
      expect(scopes).toContain('https://www.googleapis.com/auth/drive');
      expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(scopes).toContain('https://www.googleapis.com/auth/documents');
      expect(scopes).toContain('https://www.googleapis.com/auth/spreadsheets');
      expect(scopes).toContain('https://www.googleapis.com/auth/presentations');
      expect(scopes).toHaveLength(5);
    });

    it('returns all scopes combined', () => {
      const scopes = resolveScopes('all');
      expect(scopes).toHaveLength(8);
      expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
      expect(scopes).toContain('https://www.googleapis.com/auth/calendar');
      expect(scopes).toContain('https://www.googleapis.com/auth/drive');
    });
  });

  describe('loadOAuthClientConfig', () => {
    it('reads client_id and client_secret from installed app format', () => {
      const cfg = loadOAuthClientConfig();
      expect(cfg.clientId).toBe('test-client-id.apps.googleusercontent.com');
      expect(cfg.clientSecret).toBe('test-client-secret');
    });

    it('reads from web app format', () => {
      fs.writeFileSync(
        gcpKeysPath,
        JSON.stringify({
          web: {
            client_id: 'web-client-id',
            client_secret: 'web-secret',
            redirect_uris: ['http://localhost'],
          },
        }),
      );
      const cfg = loadOAuthClientConfig();
      expect(cfg.clientId).toBe('web-client-id');
    });

    it('throws if file does not exist', () => {
      fs.unlinkSync(gcpKeysPath);
      expect(() => loadOAuthClientConfig()).toThrow(OAuthError);
      expect(() => loadOAuthClientConfig()).toThrow(/not found/);
    });

    it('throws if file is malformed', () => {
      fs.writeFileSync(gcpKeysPath, JSON.stringify({ invalid: true }));
      expect(() => loadOAuthClientConfig()).toThrow(OAuthError);
      expect(() => loadOAuthClientConfig()).toThrow(/missing client_id/);
    });
  });

  describe('createOAuthSession', () => {
    it('creates a session and returns an auth URL', () => {
      const result = createOAuthSession('639123456@s.whatsapp.net', 'dm-639123456', 'all');
      expect(result.sessionId).toBeDefined();
      expect(result.authUrl).toBeDefined();
      expect(_getPendingSessions().has(result.sessionId)).toBe(true);
    });

    it('stores correct session data', () => {
      const result = createOAuthSession('639123456@s.whatsapp.net', 'dm-639123456', 'gmail');
      const session = _getPendingSessions().get(result.sessionId)!;
      expect(session.userJid).toBe('639123456@s.whatsapp.net');
      expect(session.groupFolder).toBe('dm-639123456');
      expect(session.service).toBe('gmail');
      expect(session.scopes).toHaveLength(2);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('calls generateAuthUrl with correct params', () => {
      createOAuthSession('639123456@s.whatsapp.net', 'dm-639123456', 'all');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          prompt: 'consent',
          scope: expect.arrayContaining([
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/drive',
          ]),
          state: expect.any(String),
        }),
      );
    });
  });

  describe('saveUserTokens', () => {
    const groupFolder = 'dm-test-save';

    beforeEach(() => {
      const credsBase = path.join(tmpBase, groupFolder, '.credentials');
      fs.mkdirSync(path.join(credsBase, 'gmail-mcp'), { recursive: true });
      fs.mkdirSync(path.join(credsBase, 'google-calendar-mcp'), { recursive: true });
      fs.mkdirSync(path.join(credsBase, 'google-drive-mcp'), { recursive: true });
    });

    it('saves gmail tokens in flat format', () => {
      saveUserTokens(groupFolder, 'gmail', fakeTokens);
      const creds = JSON.parse(
        fs.readFileSync(
          path.join(tmpBase, groupFolder, '.credentials', 'gmail-mcp', 'credentials.json'),
          'utf-8',
        ),
      );
      expect(creds.access_token).toBe(fakeTokens.access_token);
      expect(creds.refresh_token).toBe(fakeTokens.refresh_token);
      expect(creds.token_type).toBe('Bearer');
      expect(creds.normal).toBeUndefined();
    });

    it('saves calendar tokens wrapped in {normal: ...}', () => {
      saveUserTokens(groupFolder, 'calendar', fakeTokens);
      const raw = JSON.parse(
        fs.readFileSync(
          path.join(tmpBase, groupFolder, '.credentials', 'google-calendar-mcp', 'tokens.json'),
          'utf-8',
        ),
      );
      expect(raw.normal).toBeDefined();
      expect(raw.normal.access_token).toBe(fakeTokens.access_token);
      expect(raw.normal.refresh_token).toBe(fakeTokens.refresh_token);
    });

    it('saves drive tokens in flat format', () => {
      saveUserTokens(groupFolder, 'drive', fakeTokens);
      const raw = JSON.parse(
        fs.readFileSync(
          path.join(tmpBase, groupFolder, '.credentials', 'google-drive-mcp', 'tokens.json'),
          'utf-8',
        ),
      );
      expect(raw.access_token).toBe(fakeTokens.access_token);
      expect(raw.normal).toBeUndefined();
    });

    it('saves all three when service is "all"', () => {
      saveUserTokens(groupFolder, 'all', fakeTokens);
      expect(fs.existsSync(path.join(tmpBase, groupFolder, '.credentials', 'gmail-mcp', 'credentials.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpBase, groupFolder, '.credentials', 'google-calendar-mcp', 'tokens.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpBase, groupFolder, '.credentials', 'google-drive-mcp', 'tokens.json'))).toBe(true);
    });

    it('copies gcp-oauth.keys.json to gmail-mcp dir', () => {
      saveUserTokens(groupFolder, 'gmail', fakeTokens);
      const keysPath = path.join(tmpBase, groupFolder, '.credentials', 'gmail-mcp', 'gcp-oauth.keys.json');
      expect(fs.existsSync(keysPath)).toBe(true);
      const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
      expect(keys.installed.client_id).toBe('test-client-id.apps.googleusercontent.com');
    });

    it('creates directories if they do not exist', () => {
      const newFolder = 'dm-fresh-user';
      saveUserTokens(newFolder, 'all', fakeTokens);
      expect(fs.existsSync(
        path.join(tmpBase, newFolder, '.credentials', 'gmail-mcp', 'credentials.json'),
      )).toBe(true);
    });
  });

  describe('handleOAuthCallback', () => {
    it('exchanges code for tokens and saves them', async () => {
      mockGetToken.mockResolvedValue({ tokens: fakeTokens });
      const { sessionId } = createOAuthSession('639123456@s.whatsapp.net', 'dm-handlecb', 'all');

      const session = await handleOAuthCallback(sessionId, 'fake-auth-code');
      expect(session.userJid).toBe('639123456@s.whatsapp.net');
      expect(session.groupFolder).toBe('dm-handlecb');
      expect(_getPendingSessions().has(sessionId)).toBe(false);
    });

    it('throws SESSION_NOT_FOUND for unknown state', async () => {
      await expect(handleOAuthCallback('unknown-state', 'code')).rejects.toThrow(OAuthError);
      await expect(handleOAuthCallback('unknown-state', 'code')).rejects.toThrow(/not found/);
    });

    it('throws SESSION_EXPIRED for old sessions', async () => {
      const { sessionId } = createOAuthSession('639@s.whatsapp.net', 'dm-expired', 'gmail');
      _getPendingSessions().get(sessionId)!.createdAt = Date.now() - 11 * 60 * 1000;

      await expect(handleOAuthCallback(sessionId, 'code')).rejects.toThrow(/expired/);
      expect(_getPendingSessions().has(sessionId)).toBe(false);
    });

    it('throws MISSING_REFRESH_TOKEN when no refresh token', async () => {
      mockGetToken.mockResolvedValue({
        tokens: { access_token: 'ya29.xxx', refresh_token: null, scope: 'x', token_type: 'Bearer', expiry_date: 0 },
      });
      const { sessionId } = createOAuthSession('639@s.whatsapp.net', 'dm-norefresh', 'gmail');

      await expect(handleOAuthCallback(sessionId, 'code')).rejects.toThrow(/refresh token/);
    });

    it('throws EXCHANGE_FAILED on google API error', async () => {
      mockGetToken.mockRejectedValue(new Error('invalid_grant'));
      const { sessionId } = createOAuthSession('639@s.whatsapp.net', 'dm-fail', 'gmail');

      await expect(handleOAuthCallback(sessionId, 'code')).rejects.toThrow(/Token exchange failed/);
    });
  });

  describe('cleanExpiredSessions', () => {
    it('removes expired sessions', () => {
      const { sessionId } = createOAuthSession('639@s.whatsapp.net', 'dm-clean', 'all');
      _getPendingSessions().get(sessionId)!.createdAt = Date.now() - 11 * 60 * 1000;

      const removed = cleanExpiredSessions();
      expect(removed).toBe(1);
      expect(_getPendingSessions().has(sessionId)).toBe(false);
    });

    it('does not remove fresh sessions', () => {
      createOAuthSession('639@s.whatsapp.net', 'dm-fresh', 'all');
      const removed = cleanExpiredSessions();
      expect(removed).toBe(0);
      expect(_getPendingSessions().size).toBe(1);
    });
  });

  describe('startOAuthServer', () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    let server: http.Server | null = null;
    let port: number;

    // Start once for all server tests
    beforeEach(async () => {
      sendNotification.mockClear();
      if (!server) {
        server = startOAuthServer(sendNotification);
        if (!server) throw new Error('Server not started');
        await new Promise<void>((resolve) => server!.once('listening', resolve));
        const addr = server.address() as { port: number };
        port = addr.port;
      }
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = null;
      }
    });

    function fetch(urlPath: string): Promise<{ status: number; body: string }> {
      return new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}${urlPath}`, (res) => {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode!, body }));
        }).on('error', reject);
      });
    }

    it('responds to /health', async () => {
      const { status, body } = await fetch('/health');
      expect(status).toBe(200);
      expect(body).toBe('ok');
    });

    it('returns 404 for unknown routes', async () => {
      const { status } = await fetch('/unknown');
      expect(status).toBe(404);
    });

    it('returns 400 for callback without params', async () => {
      const { status } = await fetch('/oauth/callback');
      expect(status).toBe(400);
    });

    it('returns 400 for callback with error param', async () => {
      const { status, body } = await fetch('/oauth/callback?error=access_denied');
      expect(status).toBe(400);
      expect(body).toContain('declined');
    });

    it('returns 400 for invalid state', async () => {
      const { status } = await fetch('/oauth/callback?state=invalid&code=test');
      expect(status).toBe(400);
    });

    it('returns 200 and notifies on successful callback', async () => {
      mockGetToken.mockResolvedValue({ tokens: fakeTokens });

      const { sessionId } = createOAuthSession('639@s.whatsapp.net', 'dm-server-test', 'all');

      const { status, body } = await fetch(`/oauth/callback?state=${sessionId}&code=test-code`);
      expect(status).toBe(200);
      expect(body).toContain('Connected');

      // Wait a tick for the async notification
      await new Promise((r) => setTimeout(r, 50));
      expect(sendNotification).toHaveBeenCalledWith(
        '639@s.whatsapp.net',
        expect.stringContaining('Google account connected'),
      );
    });
  });
});
