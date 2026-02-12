import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { loadOrgConfig, findTeamByJid, findTeamByGroupName, isAdminJid, isAdminGroupName } from '../org-config.js';

let tmpDir: string;

function writeConfig(filename: string, content: string): string {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-config-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadOrgConfig', () => {
  it('returns null when file does not exist (personal mode)', () => {
    const result = loadOrgConfig('/nonexistent/path/org.yaml');
    expect(result).toBeNull();
  });

  it('loads a valid org config', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: acme-corp
  name: Acme Corporation

admin:
  whatsapp_group_name: "Acme Management"

teams:
  - id: customer-service
    name: Customer Service
    whatsapp_group_name: "Acme CS Team"
    email: support@acme.com
    credentials:
      gmail: /etc/nanoclaw/acme/cs/gmail-mcp
      calendar: /etc/nanoclaw/acme/cs/calendar-mcp
  - id: operations
    name: Operations
    whatsapp_jid: "120363001234567890@g.us"
    email: ops@acme.com
    credentials:
      gmail: /etc/nanoclaw/acme/ops/gmail-mcp
`);

    const config = loadOrgConfig(configPath);
    expect(config).not.toBeNull();
    expect(config!.organization.id).toBe('acme-corp');
    expect(config!.organization.name).toBe('Acme Corporation');
    expect(config!.admin.whatsapp_group_name).toBe('Acme Management');
    expect(config!.teams).toHaveLength(2);
    expect(config!.teams[0].id).toBe('customer-service');
    expect(config!.teams[0].email).toBe('support@acme.com');
    expect(config!.teams[1].credentials.gmail).toBe('/etc/nanoclaw/acme/ops/gmail-mcp');
  });

  it('loads config with drive_folders', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test-org
  name: Test Org

admin:
  whatsapp_jid: "120363099999999999@g.us"

teams:
  - id: sales
    name: Sales
    credentials:
      drive: /etc/nanoclaw/sales/drive-mcp
    drive_folders:
      - id: "1a2b3c4d"
        name: Customer Docs
        access: read-write
      - id: "5e6f7g8h"
        name: Policies
        access: read-only
`);

    const config = loadOrgConfig(configPath);
    expect(config).not.toBeNull();
    expect(config!.teams[0].drive_folders).toHaveLength(2);
    expect(config!.teams[0].drive_folders![0].access).toBe('read-write');
    expect(config!.teams[0].drive_folders![1].access).toBe('read-only');
  });

  it('throws on missing organization.id', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  name: No ID Corp

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: t1
    name: Team 1
    credentials: {}
`);

    expect(() => loadOrgConfig(configPath)).toThrow();
  });

  it('throws on missing organization.name', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: no-name

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: t1
    name: Team 1
    credentials: {}
`);

    expect(() => loadOrgConfig(configPath)).toThrow();
  });

  it('throws on empty teams array', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: empty-teams
  name: Empty Teams Corp

admin:
  whatsapp_group_name: "Admin"

teams: []
`);

    expect(() => loadOrgConfig(configPath)).toThrow();
  });

  it('throws on duplicate team IDs', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: dup-teams
  name: Dup Teams Corp

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: same-id
    name: Team A
    credentials: {}
  - id: same-id
    name: Team B
    credentials: {}
`);

    expect(() => loadOrgConfig(configPath)).toThrow(/uplicate team/i);
  });

  it('throws on team missing id', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - name: No ID Team
    credentials: {}
`);

    expect(() => loadOrgConfig(configPath)).toThrow();
  });

  it('throws on team missing name', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: no-name
    credentials: {}
`);

    expect(() => loadOrgConfig(configPath)).toThrow();
  });

  it('allows teams with empty credentials object', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: basic
    name: Basic Team
    credentials: {}
`);

    const config = loadOrgConfig(configPath);
    expect(config).not.toBeNull();
    expect(config!.teams[0].credentials).toEqual({});
  });

  it('supports admin with model override', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"
  model: claude-opus-4-6

teams:
  - id: t1
    name: Team 1
    credentials: {}
`);

    const config = loadOrgConfig(configPath);
    expect(config!.admin.model).toBe('claude-opus-4-6');
  });

  it('supports team with model override', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: t1
    name: Team 1
    model: claude-haiku-4-5-20251001
    credentials: {}
`);

    const config = loadOrgConfig(configPath);
    expect(config!.teams[0].model).toBe('claude-haiku-4-5-20251001');
  });
});

describe('findTeamByJid', () => {
  it('finds a team by whatsapp_jid', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: cs
    name: Customer Service
    whatsapp_jid: "120363001111111111@g.us"
    credentials: {}
  - id: ops
    name: Operations
    whatsapp_jid: "120363002222222222@g.us"
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    const team = findTeamByJid(config, '120363002222222222@g.us');
    expect(team).not.toBeNull();
    expect(team!.id).toBe('ops');
  });

  it('returns null for unknown JID', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: cs
    name: Customer Service
    whatsapp_jid: "120363001111111111@g.us"
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    const team = findTeamByJid(config, '999999999@g.us');
    expect(team).toBeNull();
  });
});

describe('findTeamByGroupName', () => {
  it('finds a team by whatsapp_group_name', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: cs
    name: Customer Service
    whatsapp_group_name: "Acme CS Team"
    credentials: {}
  - id: ops
    name: Operations
    whatsapp_group_name: "Acme Ops"
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    const team = findTeamByGroupName(config, 'Acme Ops');
    expect(team).not.toBeNull();
    expect(team!.id).toBe('ops');
  });

  it('returns null for unknown group name', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin"

teams:
  - id: cs
    name: Customer Service
    whatsapp_group_name: "Acme CS Team"
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    const team = findTeamByGroupName(config, 'Unknown Group');
    expect(team).toBeNull();
  });
});

describe('isAdminJid', () => {
  it('returns true for admin JID', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_jid: "120363009999999999@g.us"

teams:
  - id: cs
    name: CS
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    expect(isAdminJid(config, '120363009999999999@g.us')).toBe(true);
  });

  it('returns false for non-admin JID', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_jid: "120363009999999999@g.us"

teams:
  - id: cs
    name: CS
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    expect(isAdminJid(config, '120363001111111111@g.us')).toBe(false);
  });

  it('returns false when admin has no JID configured', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Admin Group"

teams:
  - id: cs
    name: CS
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    expect(isAdminJid(config, '120363001111111111@g.us')).toBe(false);
  });
});

describe('isAdminGroupName', () => {
  it('returns true for admin group name', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Acme Management"

teams:
  - id: cs
    name: CS
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    expect(isAdminGroupName(config, 'Acme Management')).toBe(true);
  });

  it('returns false for non-admin group name', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_group_name: "Acme Management"

teams:
  - id: cs
    name: CS
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    expect(isAdminGroupName(config, 'Some Other Group')).toBe(false);
  });

  it('returns false when admin has no group name configured', () => {
    const configPath = writeConfig('org.yaml', `
organization:
  id: test
  name: Test

admin:
  whatsapp_jid: "120363009999999999@g.us"

teams:
  - id: cs
    name: CS
    credentials: {}
`);

    const config = loadOrgConfig(configPath)!;
    expect(isAdminGroupName(config, 'Any Name')).toBe(false);
  });
});
