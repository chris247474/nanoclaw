/**
 * OAuth Server for NanoClaw
 * Handles per-user Google OAuth flows for DM users.
 * Runs a lightweight HTTP callback server on the host.
 */
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { URL } from 'url';

import { OAuth2Client } from 'google-auth-library';

import {
  DATA_DIR,
  GCP_OAUTH_KEYS_PATH,
  GROUPS_DIR,
  OAUTH_CALLBACK_URL,
  OAUTH_PORT,
  OAUTH_SESSION_TTL_MS,
} from './config.js';
import { logger } from './logger.js';

// --- Types ---

export type OAuthService = 'all' | 'gmail' | 'calendar' | 'drive';

export interface OAuthSession {
  id: string;
  userJid: string;
  groupFolder: string;
  service: OAuthService;
  scopes: string[];
  createdAt: number;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    public code: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'EXCHANGE_FAILED' | 'MISSING_REFRESH_TOKEN' | 'CONFIG_ERROR',
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

// --- Scopes ---

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
];
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
];

// --- State ---

const pendingSessions = new Map<string, OAuthSession>();
let oauthServerStarted = false;
const SESSIONS_FILE = path.join(DATA_DIR, 'oauth_sessions.json');

function persistSessions(): void {
  const entries = Object.fromEntries(pendingSessions);
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(entries, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to persist OAuth sessions');
  }
}

function loadPersistedSessions(): void {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    const now = Date.now();
    for (const [id, session] of Object.entries(raw) as [string, OAuthSession][]) {
      // Skip expired sessions
      if (now - session.createdAt > OAUTH_SESSION_TTL_MS) continue;
      pendingSessions.set(id, session);
    }
    if (pendingSessions.size > 0) {
      logger.info({ count: pendingSessions.size }, 'Restored OAuth sessions from disk');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to load persisted OAuth sessions');
  }
}

// --- Exports ---

export function resolveScopes(service: OAuthService): string[] {
  switch (service) {
    case 'gmail': return [...GMAIL_SCOPES];
    case 'calendar': return [...CALENDAR_SCOPES];
    case 'drive': return [...DRIVE_SCOPES];
    case 'all': return [...GMAIL_SCOPES, ...CALENDAR_SCOPES, ...DRIVE_SCOPES];
  }
}

export function loadOAuthClientConfig(): { clientId: string; clientSecret: string } {
  if (!fs.existsSync(GCP_OAUTH_KEYS_PATH)) {
    throw new OAuthError(
      `GCP OAuth keys not found at ${GCP_OAUTH_KEYS_PATH}. Run the /setup skill first.`,
      'CONFIG_ERROR',
    );
  }

  const raw = JSON.parse(fs.readFileSync(GCP_OAUTH_KEYS_PATH, 'utf-8'));
  const installed = raw.installed || raw.web;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new OAuthError(
      'Invalid GCP OAuth keys file: missing client_id or client_secret',
      'CONFIG_ERROR',
    );
  }

  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
  };
}

function getRedirectUri(): string {
  return `${OAUTH_CALLBACK_URL}/oauth/callback`;
}

export function createOAuthSession(
  userJid: string,
  groupFolder: string,
  service: OAuthService,
): { sessionId: string; authUrl: string } {
  const { clientId, clientSecret } = loadOAuthClientConfig();
  const scopes = resolveScopes(service);
  const sessionId = crypto.randomUUID();

  const session: OAuthSession = {
    id: sessionId,
    userJid,
    groupFolder,
    service,
    scopes,
    createdAt: Date.now(),
  };
  pendingSessions.set(sessionId, session);
  persistSessions();

  const oauth2Client = new OAuth2Client(clientId, clientSecret, getRedirectUri());
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: sessionId,
  });

  logger.info(
    { sessionId, groupFolder, service, scopeCount: scopes.length },
    'OAuth session created',
  );

  return { sessionId, authUrl };
}

export async function handleOAuthCallback(
  state: string,
  code: string,
): Promise<OAuthSession> {
  const session = pendingSessions.get(state);
  if (!session) {
    throw new OAuthError('OAuth session not found or already used', 'SESSION_NOT_FOUND');
  }

  if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) {
    pendingSessions.delete(state);
    persistSessions();
    throw new OAuthError('OAuth session expired. Please request a new link.', 'SESSION_EXPIRED');
  }

  const { clientId, clientSecret } = loadOAuthClientConfig();
  const oauth2Client = new OAuth2Client(clientId, clientSecret, getRedirectUri());

  let tokens: GoogleTokens;
  try {
    const { tokens: rawTokens } = await oauth2Client.getToken(code);
    if (!rawTokens.refresh_token) {
      throw new OAuthError(
        'Google did not return a refresh token. Try revoking app access at myaccount.google.com/permissions and retry.',
        'MISSING_REFRESH_TOKEN',
      );
    }
    tokens = {
      access_token: rawTokens.access_token!,
      refresh_token: rawTokens.refresh_token,
      scope: rawTokens.scope!,
      token_type: rawTokens.token_type!,
      expiry_date: rawTokens.expiry_date!,
    };
  } catch (err) {
    if (err instanceof OAuthError) throw err;
    pendingSessions.delete(state);
    persistSessions();
    throw new OAuthError(
      `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
      'EXCHANGE_FAILED',
    );
  }

  pendingSessions.delete(state);
  persistSessions();

  saveUserTokens(session.groupFolder, session.service, tokens);

  logger.info(
    { sessionId: state, groupFolder: session.groupFolder, service: session.service },
    'OAuth tokens saved successfully',
  );

  return session;
}

export function saveUserTokens(
  groupFolder: string,
  service: OAuthService,
  tokens: GoogleTokens,
): void {
  const credsBase = path.join(GROUPS_DIR, groupFolder, '.credentials');
  const flatTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
  };

  if (service === 'all' || service === 'gmail') {
    const gmailDir = path.join(credsBase, 'gmail-mcp');
    fs.mkdirSync(gmailDir, { recursive: true });
    fs.writeFileSync(
      path.join(gmailDir, 'credentials.json'),
      JSON.stringify(flatTokens, null, 2),
    );
    // Copy shared OAuth keys (needed by Gmail MCP for token refresh)
    if (fs.existsSync(GCP_OAUTH_KEYS_PATH)) {
      fs.copyFileSync(GCP_OAUTH_KEYS_PATH, path.join(gmailDir, 'gcp-oauth.keys.json'));
    }
  }

  if (service === 'all' || service === 'calendar') {
    const calendarDir = path.join(credsBase, 'google-calendar-mcp');
    fs.mkdirSync(calendarDir, { recursive: true });
    // Calendar MCP expects tokens wrapped in { normal: { ... } }
    fs.writeFileSync(
      path.join(calendarDir, 'tokens.json'),
      JSON.stringify({ normal: flatTokens }, null, 2),
    );
    // Copy shared OAuth keys (needed by Calendar MCP for token refresh)
    if (fs.existsSync(GCP_OAUTH_KEYS_PATH)) {
      fs.copyFileSync(GCP_OAUTH_KEYS_PATH, path.join(calendarDir, 'gcp-oauth.keys.json'));
    }
  }

  if (service === 'all' || service === 'drive') {
    const driveDir = path.join(credsBase, 'google-drive-mcp');
    fs.mkdirSync(driveDir, { recursive: true });
    fs.writeFileSync(
      path.join(driveDir, 'tokens.json'),
      JSON.stringify(flatTokens, null, 2),
    );
    // Copy shared OAuth keys (needed by Drive MCP for token refresh)
    if (fs.existsSync(GCP_OAUTH_KEYS_PATH)) {
      fs.copyFileSync(GCP_OAUTH_KEYS_PATH, path.join(driveDir, 'gcp-oauth.keys.json'));
    }
  }
}

export function cleanExpiredSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, session] of pendingSessions) {
    if (now - session.createdAt > OAUTH_SESSION_TTL_MS) {
      pendingSessions.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    persistSessions();
    logger.debug({ removed }, 'Cleaned expired OAuth sessions');
  }
  return removed;
}

// Expose for testing
export function _getPendingSessions(): Map<string, OAuthSession> {
  return pendingSessions;
}

export function _resetForTesting(): void {
  pendingSessions.clear();
  oauthServerStarted = false;
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Google Account Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0fdf4}
.card{text-align:center;padding:2rem;border-radius:1rem;background:white;box-shadow:0 4px 12px rgba(0,0,0,.1);max-width:400px}
h1{color:#16a34a;font-size:1.5rem}p{color:#4b5563;line-height:1.6}</style></head>
<body><div class="card"><h1>Google Account Connected!</h1>
<p>Your Google account has been linked successfully. You can close this tab and return to WhatsApp.</p>
<p>Gmail, Calendar, and Drive tools are now available.</p></div></body></html>`;

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>OAuth Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fef2f2}
.card{text-align:center;padding:2rem;border-radius:1rem;background:white;box-shadow:0 4px 12px rgba(0,0,0,.1);max-width:400px}
h1{color:#dc2626;font-size:1.5rem}p{color:#4b5563;line-height:1.6}</style></head>
<body><div class="card"><h1>Setup Failed</h1>
<p>${message}</p>
<p>Please go back to WhatsApp and try again.</p></div></body></html>`;
}

export function startOAuthServer(
  sendNotification: (jid: string, text: string) => Promise<void>,
  onAuthComplete?: (session: OAuthSession) => Promise<void>,
): http.Server | null {
  if (oauthServerStarted) {
    logger.debug('OAuth server already running, skipping duplicate start');
    return null;
  }
  oauthServerStarted = true;
  loadPersistedSessions();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${OAUTH_PORT}`);

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (url.pathname === '/oauth/callback') {
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        logger.warn({ error }, 'OAuth flow rejected by user');
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(errorHtml('You declined the Google authorization. No changes were made.'));
        return;
      }

      if (!state || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(errorHtml('Missing required parameters.'));
        return;
      }

      try {
        const session = await handleOAuthCallback(state, code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);

        // Notify user via WhatsApp
        const serviceLabel = session.service === 'all'
          ? 'Gmail, Calendar, and Drive'
          : session.service.charAt(0).toUpperCase() + session.service.slice(1);
        await sendNotification(
          session.userJid,
          `Google account connected! ${serviceLabel} tools are now available. Just send me a message to use them.`,
        );

        // Auto-register the user if not already registered
        if (onAuthComplete) {
          await onAuthComplete(session);
        }
      } catch (err) {
        const message = err instanceof OAuthError ? err.message : 'An unexpected error occurred.';
        logger.error({ err }, 'OAuth callback error');
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(errorHtml(message));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  // Session cleanup interval
  const cleanupInterval = setInterval(cleanExpiredSessions, 60_000);
  cleanupInterval.unref();

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        { port: OAUTH_PORT },
        'OAuth server port already in use. Google account setup will be unavailable.',
      );
    } else {
      logger.error({ err }, 'OAuth server error');
    }
  });

  server.listen(OAUTH_PORT, () => {
    logger.info(
      { port: OAUTH_PORT, callbackUrl: OAUTH_CALLBACK_URL },
      'OAuth callback server started',
    );
  });

  return server;
}
