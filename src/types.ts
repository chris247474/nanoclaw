export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath: string; // Path inside container (under /workspace/extra/)
  readonly?: boolean; // Default: true for safety
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
  // If true, non-main groups can only mount read-only regardless of config
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Whether read-write mounts are allowed under this root
  allowReadWrite: boolean;
  // Optional description for documentation
  description?: string;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
  env?: Record<string, string>;
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  isMain?: boolean;
  alwaysProcess?: boolean; // Process every message without trigger (e.g., DM users)
  isDm?: boolean; // DM registration — per-user credential mounts, no admin privileges
  lidJid?: string; // LID JID for DM contacts (e.g., "223952496496782@lid")
  containerConfig?: ContainerConfig;
}

export interface PendingDmRequest {
  jid: string; // Phone JID (e.g., "639524538012@s.whatsapp.net")
  senderName?: string; // Push name from WhatsApp
  requestedAt: string; // ISO timestamp
  triggerMessage: string; // The message that triggered the request
  phone: string; // Phone number part of JID (for folder naming)
}

export interface Session {
  [folder: string]: string;
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  mentions?: string | null;
  media_type?: string | null;
  media_path?: string | null;
}

export interface IpcFileMessage {
  type: 'file';
  chatJid: string;
  filePath: string;       // Relative path within group dir (e.g., "reports/output.pdf")
  caption?: string;
  fileName?: string;      // Override display name
  groupFolder: string;
  timestamp: string;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

// --- Multi-team / Org mode types ---

export interface OrgConfig {
  organization: { id: string; name: string };
  admin: {
    whatsapp_jid?: string;
    whatsapp_group_name?: string;
    model?: string;
  };
  teams: TeamConfig[];
}

export interface TeamConfig {
  id: string;
  name: string;
  whatsapp_jid?: string;
  whatsapp_group_name?: string;
  email?: string;
  credentials: {
    gmail?: string;
    calendar?: string;
    drive?: string;
  };
  drive_folders?: Array<{
    id: string;
    name: string;
    access: 'read-write' | 'read-only';
  }>;
  model?: string;
}
