import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We need to test buildVolumeMounts which is not exported.
// Instead of refactoring to export it (risky), we test the behavior
// through the exported functions that we'll add for org-mode support.
// For now, test the new getOrgVolumeMounts helper we'll create.
import { getOrgVolumeMounts } from '../container-runner.js';
import type { TeamConfig } from '../types.js';

describe('getOrgVolumeMounts', () => {
  describe('team containers', () => {
    it('returns mounts for a team with gmail credentials', () => {
      const team: TeamConfig = {
        id: 'customer-service',
        name: 'Customer Service',
        email: 'support@acme.com',
        credentials: {
          gmail: '/etc/nanoclaw/acme/cs/gmail-mcp',
        },
      };

      const mounts = getOrgVolumeMounts({ teamConfig: team });
      expect(mounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/acme/cs/gmail-mcp',
            containerPath: '/home/node/.gmail-mcp',
            readonly: false,
          }),
        ]),
      );
    });

    it('returns mounts for a team with all credentials', () => {
      const team: TeamConfig = {
        id: 'ops',
        name: 'Operations',
        credentials: {
          gmail: '/etc/nanoclaw/acme/ops/gmail-mcp',
          calendar: '/etc/nanoclaw/acme/ops/calendar-mcp',
          drive: '/etc/nanoclaw/acme/ops/drive-mcp',
        },
      };

      const mounts = getOrgVolumeMounts({ teamConfig: team });
      expect(mounts).toHaveLength(3);
      expect(mounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/acme/ops/gmail-mcp',
            containerPath: '/home/node/.gmail-mcp',
          }),
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/acme/ops/calendar-mcp',
            containerPath: '/home/node/.config/google-calendar-mcp',
          }),
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/acme/ops/drive-mcp',
            containerPath: '/home/node/.config/google-drive-mcp',
          }),
        ]),
      );
    });

    it('returns empty array for team with no credentials', () => {
      const team: TeamConfig = {
        id: 'basic',
        name: 'Basic Team',
        credentials: {},
      };

      const mounts = getOrgVolumeMounts({ teamConfig: team });
      expect(mounts).toHaveLength(0);
    });

    it('skips undefined credential paths', () => {
      const team: TeamConfig = {
        id: 'partial',
        name: 'Partial Team',
        credentials: {
          gmail: '/etc/nanoclaw/partial/gmail-mcp',
          // calendar and drive not set
        },
      };

      const mounts = getOrgVolumeMounts({ teamConfig: team });
      expect(mounts).toHaveLength(1);
      expect(mounts[0].containerPath).toBe('/home/node/.gmail-mcp');
    });
  });

  describe('admin containers', () => {
    it('mounts all teams credentials at namespaced paths', () => {
      const allTeams: TeamConfig[] = [
        {
          id: 'cs',
          name: 'CS',
          credentials: {
            gmail: '/etc/nanoclaw/cs/gmail-mcp',
            calendar: '/etc/nanoclaw/cs/calendar-mcp',
          },
        },
        {
          id: 'ops',
          name: 'Ops',
          credentials: {
            gmail: '/etc/nanoclaw/ops/gmail-mcp',
            drive: '/etc/nanoclaw/ops/drive-mcp',
          },
        },
      ];

      const mounts = getOrgVolumeMounts({ isAdmin: true, allTeams });
      expect(mounts).toEqual(
        expect.arrayContaining([
          // CS team credentials
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/cs/gmail-mcp',
            containerPath: '/home/node/.gmail-mcp-cs',
            readonly: false,
          }),
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/cs/calendar-mcp',
            containerPath: '/home/node/.config/google-calendar-mcp-cs',
            readonly: false,
          }),
          // Ops team credentials
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/ops/gmail-mcp',
            containerPath: '/home/node/.gmail-mcp-ops',
            readonly: false,
          }),
          expect.objectContaining({
            hostPath: '/etc/nanoclaw/ops/drive-mcp',
            containerPath: '/home/node/.config/google-drive-mcp-ops',
            readonly: false,
          }),
        ]),
      );
      expect(mounts).toHaveLength(4);
    });

    it('returns empty array when admin has no teams', () => {
      const mounts = getOrgVolumeMounts({ isAdmin: true, allTeams: [] });
      expect(mounts).toHaveLength(0);
    });

    it('skips teams with no credentials', () => {
      const allTeams: TeamConfig[] = [
        { id: 'has-creds', name: 'Has Creds', credentials: { gmail: '/etc/gmail' } },
        { id: 'no-creds', name: 'No Creds', credentials: {} },
      ];

      const mounts = getOrgVolumeMounts({ isAdmin: true, allTeams });
      expect(mounts).toHaveLength(1);
      expect(mounts[0].containerPath).toBe('/home/node/.gmail-mcp-has-creds');
    });
  });

  describe('no org context', () => {
    it('returns empty array when no org context is provided', () => {
      const mounts = getOrgVolumeMounts({});
      expect(mounts).toHaveLength(0);
    });
  });
});
