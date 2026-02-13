/**
 * Organization Config — Multi-team B2B support
 *
 * Loads and validates a YAML config that maps teams to WhatsApp groups,
 * Google credentials, and Drive scopes. Returns null if no config exists
 * (personal mode — no behavior change).
 */
import fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type { OrgConfig, TeamConfig } from './types.js';

const DriveFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  access: z.enum(['read-write', 'read-only']),
});

const TeamConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  whatsapp_jid: z.string().optional(),
  whatsapp_group_name: z.string().optional(),
  email: z.string().optional(),
  credentials: z.object({
    gmail: z.string().optional(),
    calendar: z.string().optional(),
    drive: z.string().optional(),
  }),
  drive_folders: z.array(DriveFolderSchema).optional(),
  model: z.string().optional(),
});

const OrgConfigSchema = z.object({
  organization: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  admin: z.object({
    whatsapp_jid: z.string().optional(),
    whatsapp_group_name: z.string().optional(),
    model: z.string().optional(),
  }),
  teams: z.array(TeamConfigSchema).min(1, 'At least one team is required'),
});

/**
 * Load and validate organization config from a YAML file.
 * Returns null if the file doesn't exist (personal mode).
 * Throws on invalid config.
 */
export function loadOrgConfig(configPath: string): OrgConfig | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw);
  const validated = OrgConfigSchema.parse(parsed);

  // Check for duplicate team IDs
  const teamIds = new Set<string>();
  for (const team of validated.teams) {
    if (teamIds.has(team.id)) {
      throw new Error(`Duplicate team ID: "${team.id}"`);
    }
    teamIds.add(team.id);
  }

  return validated as OrgConfig;
}

/** Find a team by WhatsApp JID. */
export function findTeamByJid(config: OrgConfig, jid: string): TeamConfig | null {
  return config.teams.find((t) => t.whatsapp_jid === jid) ?? null;
}

/** Find a team by WhatsApp group name. */
export function findTeamByGroupName(config: OrgConfig, groupName: string): TeamConfig | null {
  return config.teams.find((t) => t.whatsapp_group_name === groupName) ?? null;
}

/** Check if a JID matches the admin group. */
export function isAdminJid(config: OrgConfig, jid: string): boolean {
  return !!config.admin.whatsapp_jid && config.admin.whatsapp_jid === jid;
}

/** Check if a group name matches the admin group. */
export function isAdminGroupName(config: OrgConfig, groupName: string): boolean {
  return !!config.admin.whatsapp_group_name && config.admin.whatsapp_group_name === groupName;
}
