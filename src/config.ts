import path from 'path';

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// Model configuration
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
export const CLAUDE_FALLBACK_MODEL = process.env.CLAUDE_FALLBACK_MODEL || 'claude-haiku-4-5-20251001';

// 3rd party model support (OpenAI, etc.)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL;
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL; // For OpenAI-compatible APIs

// Org config
export const ORG_CONFIG_PATH = process.env.ORG_CONFIG_PATH || 'config/organization.yaml';

// Media/file handling
export const MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB
export const FILE_RETENTION_DAYS = 30;

// OAuth configuration (per-user Google account setup)
export const OAUTH_PORT = parseInt(process.env.OAUTH_PORT || '3847', 10);
export const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL || `http://localhost:${OAUTH_PORT}`;
export const GCP_OAUTH_KEYS_PATH = process.env.GCP_OAUTH_KEYS_PATH ||
  path.join(HOME_DIR, '.gmail-mcp', 'gcp-oauth.keys.json');
export const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
