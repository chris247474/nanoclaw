import 'dotenv/config';
import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import makeWASocket, {
  DisconnectReason,
  WASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  FILE_RETENTION_DAYS,
  GROUPS_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  ORG_CONFIG_PATH,
  POLL_INTERVAL,
  STORE_DIR,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
import {
  AvailableGroup,
  OrgMountContext,
  killContainer,
  runContainerAgent,
  validateSessionId,
  writeGroupsSnapshot,
  writeOrgContext,
  writeTasksSnapshot,
} from './container-runner.js';
import { writeDiagnosticsSnapshot } from './diagnostics.js';
import { loadOrgConfig, findTeamByJid, findTeamByGroupName, isAdminJid, isAdminGroupName } from './org-config.js';
import {
  getAllChats,
  getAllTasks,
  getLastGroupSync,
  getMessagesSince,
  getNewMessages,
  getTaskById,
  initDatabase,
  setLastGroupSync,
  storeChatMetadata,
  storeMessage,
  updateChatName,
} from './db.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { IpcFileMessage, NewMessage, OrgConfig, RegisteredGroup, Session } from './types.js';
import { loadJson, saveJson } from './utils.js';
import { logger } from './logger.js';
import { downloadAndSaveMedia } from './media-handler.js';
import { addPendingRequest, isPending, loadPendingRequests, removePendingRequest } from './pending-dm.js';
import { createOAuthSession, startOAuthServer, type OAuthService } from './oauth-server.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let sock: WASocket;
let sessions: Session = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let orgConfig: OrgConfig | null = null;
// LID to phone number mapping (WhatsApp now sends LID JIDs for self-chats)
let lidToPhoneMap: Record<string, string> = {};
// Guards to prevent duplicate loops on WhatsApp reconnect
let loopsStarted = false;
let ipcWatcherRunning = false;
// Track IPC messages sent per chat to suppress duplicate final result
let ipcMessagesSent: Record<string, number> = {};
let groupSyncTimerStarted = false;
// Per-group timestamps for independent message processing loops
let groupTimestamps: Record<string, string> = {};
// Timestamp for discovery loop (unregistered chats)
let discoveryTimestamp = '';
// Track which group loops are already running to prevent duplicates
const groupLoopsRunning = new Set<string>();

/**
 * Translate a JID from LID format to phone format if we have a mapping.
 * Returns the original JID if no mapping exists.
 */
function translateJid(jid: string): string {
  if (!jid.endsWith('@lid')) return jid;
  const lidUser = jid.split('@')[0].split(':')[0];
  const phoneJid = lidToPhoneMap[lidUser];
  if (phoneJid) {
    logger.debug({ lidJid: jid, phoneJid }, 'Translated LID to phone JID');
    return phoneJid;
  }
  return jid;
}

async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}

function loadState(): void {
  const statePath = path.join(DATA_DIR, 'router_state.json');
  const state = loadJson<{
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
    admin_timestamps?: Record<string, string>;
    group_timestamps?: Record<string, string>;
    discovery_timestamp?: string;
  }>(statePath, {});
  groupTimestamps = state.group_timestamps || {};
  discoveryTimestamp = state.discovery_timestamp || '';
  lastAgentTimestamp = state.last_agent_timestamp || {};

  // One-time migration from old format (last_timestamp + admin_timestamps)
  if (!state.group_timestamps) {
    if (state.admin_timestamps) Object.assign(groupTimestamps, state.admin_timestamps);
    const fallback = state.last_timestamp || '';
    if (fallback) {
      discoveryTimestamp = fallback;
    }
  }

  sessions = loadJson(path.join(DATA_DIR, 'sessions.json'), {});
  registeredGroups = loadJson(
    path.join(DATA_DIR, 'registered_groups.json'),
    {},
  );

  // Seed LID-to-phone map from registered groups with known lidJid
  for (const [phoneJid, group] of Object.entries(registeredGroups)) {
    if (group.lidJid) {
      const lidUser = group.lidJid.split('@')[0].split(':')[0];
      lidToPhoneMap[lidUser] = phoneJid;
    }
  }

  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  saveJson(path.join(DATA_DIR, 'router_state.json'), {
    group_timestamps: groupTimestamps,
    discovery_timestamp: discoveryTimestamp,
    last_agent_timestamp: lastAgentTimestamp,
  });
  saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
}

function getLatestTimestamp(): string | null {
  const all = Object.values(groupTimestamps);
  return all.length ? all.reduce((a, b) => (a > b ? a : b)) : null;
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  saveJson(path.join(DATA_DIR, 'registered_groups.json'), registeredGroups);

  // Create group folder
  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // DM users: create credential directories and welcome CLAUDE.md
  if (group.isDm) {
    const credsBase = path.join(groupDir, '.credentials');
    fs.mkdirSync(path.join(credsBase, 'gmail-mcp'), { recursive: true });
    fs.mkdirSync(path.join(credsBase, 'google-calendar-mcp'), { recursive: true });
    fs.mkdirSync(path.join(credsBase, 'google-drive-mcp'), { recursive: true });

    const claudeMdPath = path.join(groupDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(
        claudeMdPath,
        `# DM User - ${group.name}\n\nYou are ${ASSISTANT_NAME}, a personal assistant for this user.\n\n## Capabilities\n\n- Gmail access (read, search, send, draft emails via MCP)\n- Google Calendar access (view, create, update, delete events via MCP)\n- Google Drive access (search, read files, read/write Sheets via MCP)\n- Web search and information lookup\n- File operations within your workspace\n- Schedule recurring tasks\n\n## Setup Required\n\nThis is a new DM registration. The user may need to set up Google integrations.\nCredentials are stored in /workspace/group/.credentials/\n\n## Guidelines\n\n- Be helpful and proactive\n- Provide clear, actionable responses\n- Use WhatsApp-friendly formatting\n- Your data is isolated from other users\n\n## Task Progress Updates\n\nWhenever you receive a request, always give the user the following status updates:\n1. That you are starting a task with an ETA\n2. A midway status update when you are 50% done with the task and an ETA till the remaining 50% completion\n`,
      );
    }
  }

  logger.info(
    { jid, name: group.name, folder: group.folder, isDm: group.isDm },
    'Group registered',
  );
}

/**
 * Sync group metadata from WhatsApp.
 * Fetches all participating groups and stores their names in the database.
 * Called on startup, daily, and on-demand via IPC.
 */
async function syncGroupMetadata(force = false): Promise<void> {
  // Check if we need to sync (skip if synced recently, unless forced)
  if (!force) {
    const lastSync = getLastGroupSync();
    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime();
      const now = Date.now();
      if (now - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
        logger.debug({ lastSync }, 'Skipping group sync - synced recently');
        return;
      }
    }
  }

  try {
    logger.info('Syncing group metadata from WhatsApp...');
    const groups = await sock.groupFetchAllParticipating();

    let count = 0;
    for (const [jid, metadata] of Object.entries(groups)) {
      if (metadata.subject) {
        updateChatName(jid, metadata.subject);
        count++;
      }
    }

    setLastGroupSync();
    logger.info({ count }, 'Group metadata synced');
  } catch (err) {
    logger.error({ err }, 'Failed to sync group metadata');
  }
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.jid.endsWith('@g.us'))
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

async function processMessage(msg: NewMessage): Promise<void> {
  let group = registeredGroups[msg.chat_jid];

  // Auto-register new group chats when triggered
  if (!group && msg.chat_jid.endsWith('@g.us')) {
    const content = msg.content.trim();
    const hasTrigger = TRIGGER_PATTERN.test(content);
    let hasMention = false;
    if (msg.mentions && sock?.user?.id) {
      try {
        const mentionedJids: string[] = JSON.parse(msg.mentions);
        const botPhoneJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botLidJid = sock.user.lid ? sock.user.lid.split(':')[0] + '@lid' : '';
        hasMention = mentionedJids.includes(botPhoneJid) || (!!botLidJid && mentionedJids.includes(botLidJid));
      } catch {
        // Ignore JSON parse errors
      }
    }

    if (hasTrigger || hasMention) {
      // Look up group name from chat metadata, fallback to JID prefix
      const allChats = getAllChats();
      const chatInfo = allChats.find((c) => c.jid === msg.chat_jid);
      const groupName = chatInfo?.name || msg.chat_jid.split('@')[0];
      const folder = groupName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || msg.chat_jid.split('@')[0];

      registerGroup(msg.chat_jid, {
        name: groupName,
        folder,
        trigger: `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
      });

      // Store the triggering message now that the group is registered
      storeMessage(
        { key: { id: msg.id, remoteJid: msg.chat_jid, participant: msg.sender }, messageTimestamp: BigInt(Math.floor(new Date(msg.timestamp).getTime() / 1000)), message: { conversation: msg.content } } as any,
        msg.chat_jid,
        false,
        msg.sender_name,
      );

      group = registeredGroups[msg.chat_jid];
    }
  }

  // DM registration request: any unregistered DM → create pending request for admin approval
  if (!group && (msg.chat_jid.endsWith('@s.whatsapp.net') || msg.chat_jid.endsWith('@lid'))) {
    const dmContent = msg.content.trim();

    // Fast-path: handle Google OAuth setup directly without container agent
    if (/\b(set\s*up|connect|link|auth)\b.*\b(google|gmail|calendar|drive)\b/i.test(dmContent) ||
        /\b(google|gmail|calendar|drive)\b.*\b(set\s*up|connect|link|auth)\b/i.test(dmContent)) {
      const phone = msg.chat_jid.split('@')[0];
      const folder = `dm-${phone}`;
      try {
        const service: OAuthService = /\bgmail\b/i.test(dmContent) ? 'gmail'
          : /\bcalendar\b/i.test(dmContent) ? 'calendar'
          : /\bdrive\b/i.test(dmContent) ? 'drive'
          : 'all';
        const { authUrl } = createOAuthSession(msg.chat_jid, folder, service);
        await sendMessage(
          msg.chat_jid,
          `${ASSISTANT_NAME}: To connect your Google account, click this link:\n\n${authUrl}\n\nThis link expires in 10 minutes.`,
        );
        logger.info({ jid: msg.chat_jid, folder, service }, 'OAuth URL sent to unregistered DM user');
      } catch (err) {
        logger.error({ err, jid: msg.chat_jid }, 'Failed to create OAuth session for unregistered DM');
        await sendMessage(msg.chat_jid, `${ASSISTANT_NAME}: Failed to start Google setup. Please try again later.`);
      }
      return;
    }

    if (!isPending(msg.chat_jid)) {
      const phone = msg.chat_jid.split('@')[0];
      addPendingRequest({
        jid: msg.chat_jid,
        senderName: msg.sender_name,
        requestedAt: msg.timestamp,
        triggerMessage: msg.content,
        phone,
      });

      // Notify all admin channels
      await notifyAdmins(
        `${ASSISTANT_NAME}: New DM registration request from ${msg.sender_name || phone} (${phone}).\nMessage: "${dmContent}"\n\nTo approve, use register_group with JID: ${msg.chat_jid}, folder: dm-${phone}`,
      );

      logger.info(
        { jid: msg.chat_jid, phone, senderName: msg.sender_name },
        'DM registration request created',
      );
    }
    return;
  }

  if (!group) {
    logger.debug(
      {
        chat_jid: msg.chat_jid,
        sender: msg.sender,
        registered_jids: Object.keys(registeredGroups),
      },
      'Message from unregistered chat',
    );
    return;
  }

  const content = msg.content.trim();
  const isMainGroup = group.folder === MAIN_GROUP_FOLDER || group.isMain;

  // Fast-path: Google OAuth setup — handle directly without container agent
  if (/\b(set\s*up|connect|link|auth)\b.*\b(google|gmail|calendar|drive)\b/i.test(content) ||
      /\b(google|gmail|calendar|drive)\b.*\b(set\s*up|connect|link|auth)\b/i.test(content)) {
    try {
      const service: OAuthService = /\bgmail\b/i.test(content) ? 'gmail'
        : /\bcalendar\b/i.test(content) ? 'calendar'
        : /\bdrive\b/i.test(content) ? 'drive'
        : 'all';
      const { authUrl } = createOAuthSession(msg.chat_jid, group.folder, service);
      await sendMessage(
        msg.chat_jid,
        `${ASSISTANT_NAME}: To connect your Google account, click this link:\n\n${authUrl}\n\nThis link expires in 10 minutes.`,
      );
      logger.info({ jid: msg.chat_jid, folder: group.folder, service }, 'OAuth URL sent (fast-path)');
    } catch (err) {
      logger.error({ err, jid: msg.chat_jid }, 'Failed to create OAuth session');
      await sendMessage(msg.chat_jid, `${ASSISTANT_NAME}: Failed to start Google setup. Please try again later.`);
    }
    return;
  }

  // Main group responds to all messages; other groups require trigger prefix or @mention
  const hasTrigger = TRIGGER_PATTERN.test(content);

  // Check if bot is mentioned in the message
  // WhatsApp can send mentions as either phone JID (@s.whatsapp.net) or LID (@lid)
  let hasMention = false;
  if (msg.mentions && sock?.user?.id) {
    try {
      const mentionedJids: string[] = JSON.parse(msg.mentions);
      const botPhoneJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const botLidJid = sock.user.lid ? sock.user.lid.split(':')[0] + '@lid' : '';
      hasMention = mentionedJids.includes(botPhoneJid) || (!!botLidJid && mentionedJids.includes(botLidJid));
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Only DMs (alwaysProcess) should auto-respond without trigger/mention
  // Admin groups and non-admin groups both require trigger or mention
  const shouldAlwaysProcess = group.alwaysProcess;
  if (!shouldAlwaysProcess && !hasTrigger && !hasMention) return;

  // Get all messages since last agent interaction so the session has full context
  const sinceTimestamp = lastAgentTimestamp[msg.chat_jid] || '';
  const missedMessages = getMessagesSince(
    msg.chat_jid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  const lines = missedMessages.map((m) => {
    const escapeXml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    let attrs = `sender="${escapeXml(m.sender_name)}" time="${m.timestamp}"`;
    if (m.media_type) {
      attrs += ` media_type="${escapeXml(m.media_type)}"`;
      // Convert host path to container path
      const containerPath = m.media_path?.replace(/.*groups\/[^/]+\//, '/workspace/group/');
      if (containerPath) attrs += ` file="${escapeXml(containerPath)}"`;
    }
    return `<message ${attrs}>${escapeXml(m.content)}</message>`;
  });
  const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

  if (!prompt) return;

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing message',
  );

  await setTyping(msg.chat_jid, true);
  const response = await runAgent(group, prompt, msg.chat_jid);
  await setTyping(msg.chat_jid, false);

  if (response) {
    lastAgentTimestamp[msg.chat_jid] = msg.timestamp;
    // Only send the final result if no IPC messages were already sent during this run
    // (IPC messages already delivered the response progressively)
    const ipcCount = ipcMessagesSent[msg.chat_jid] || 0;
    if (ipcCount === 0) {
      await sendMessage(msg.chat_jid, `${ASSISTANT_NAME}: ${response}`);
    } else {
      logger.info(
        { chatJid: msg.chat_jid, ipcCount, resultLength: response.length },
        'Suppressed final result (already sent via IPC)',
      );
    }
    delete ipcMessagesSent[msg.chat_jid];
  }
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
): Promise<string | null> {
  const isMain = group.folder === MAIN_GROUP_FOLDER || group.isMain === true;
  const rawSessionId = sessions[group.folder];
  const sessionId = validateSessionId(rawSessionId, group.folder);

  // Clean up stale session from memory and disk
  if (rawSessionId && !sessionId) {
    delete sessions[group.folder];
    saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
  }

  // Resolve org-mode context (admin, team, or null for personal mode)
  let orgMountContext: OrgMountContext | undefined;
  let isAdmin = false;
  let teamId: string | undefined;
  let orgTeamIds: string[] | undefined;
  let teamEmail: string | undefined;

  if (orgConfig) {
    // Check if this is the admin group
    isAdmin = isAdminJid(orgConfig, chatJid) || isAdminGroupName(orgConfig, group.name);

    if (isAdmin) {
      orgMountContext = { isAdmin: true, allTeams: orgConfig.teams };
      orgTeamIds = orgConfig.teams.map((t) => t.id);
    } else {
      // Try to match a team by JID, then by group name
      const team = findTeamByJid(orgConfig, chatJid) ?? findTeamByGroupName(orgConfig, group.name);
      if (team) {
        orgMountContext = { teamConfig: team };
        teamId = team.id;
        teamEmail = team.email;
      }
    }
  }

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain || isAdmin,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main/admin group can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain || isAdmin,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Write org context for the agent to read (org mode only)
  if (orgConfig && (isAdmin || teamId)) {
    writeOrgContext(group.folder, {
      orgName: orgConfig.organization.name,
      isAdmin,
      teamId,
      teamName: orgMountContext?.teamConfig?.name,
      teamEmail,
      allTeams: isAdmin
        ? orgConfig.teams.map((t) => ({ id: t.id, name: t.name, email: t.email }))
        : undefined,
    });
  }

  // Write diagnostics snapshot for admin channels
  if (isMain || isAdmin) {
    writeDiagnosticsSnapshot(group.folder, {
      lastMessageProcessed: getLatestTimestamp(),
      registeredGroupsCount: Object.keys(registeredGroups).length,
      whatsappConnected: !!sock?.user,
    }, DATA_DIR);
  }

  try {
    const output = await runContainerAgent(group, {
      prompt,
      sessionId,
      groupFolder: group.folder,
      chatJid,
      isMain: isMain || isAdmin,
      isAdmin,
      teamId,
      orgTeamIds,
      teamEmail,
    }, orgMountContext);

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      await notifyAdminError(group, output.error || 'Unknown error');
      return null;
    }

    return output.result;
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    await notifyAdminError(group, err instanceof Error ? err.message : String(err));
    return null;
  }
}

function getAdminJids(): string[] {
  return Object.keys(registeredGroups).filter(
    (jid) => registeredGroups[jid].folder === MAIN_GROUP_FOLDER || registeredGroups[jid].isMain,
  );
}

async function notifyAdmins(text: string, excludeFolder?: string): Promise<void> {
  for (const jid of getAdminJids()) {
    if (excludeFolder && registeredGroups[jid]?.folder === excludeFolder) continue;
    try {
      await sendMessage(jid, text);
    } catch {
      logger.error({ jid }, 'Failed to send admin notification');
    }
  }
}

async function notifyAdminError(failedGroup: RegisteredGroup, errorSummary: string): Promise<void> {
  // Don't notify about failures in admin groups (prevents infinite loop)
  const isAdminGroup = failedGroup.folder === MAIN_GROUP_FOLDER || failedGroup.isMain;
  if (isAdminGroup) return;

  const truncatedError = errorSummary.slice(0, 200);
  const logHint = `groups/${failedGroup.folder}/logs/`;
  await notifyAdmins(
    `${ASSISTANT_NAME}: [Agent Error] "${failedGroup.name}" failed.\nError: ${truncatedError}\nLogs: ${logHint}`,
  );
}

async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    await sock.sendMessage(jid, { text });
    logger.info({ jid, length: text.length }, 'Message sent');
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}

function startIpcWatcher(): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await sendMessage(
                    data.chatJid,
                    `${ASSISTANT_NAME}: ${data.text}`,
                  );
                  ipcMessagesSent[data.chatJid] = (ipcMessagesSent[data.chatJid] || 0) + 1;
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              } else if (data.type === 'file' && data.chatJid && data.filePath) {
                const { sendFileMessage } = await import('./file-sender.js');
                const targetGroup = registeredGroups[data.chatJid];
                if (isMain || (targetGroup && targetGroup.folder === sourceGroup)) {
                  const success = await sendFileMessage(sock, data as IpcFileMessage, ASSISTANT_NAME);
                  if (success) {
                    logger.info({ chatJid: data.chatJid, file: data.filePath, sourceGroup }, 'IPC file sent');
                  }
                } else {
                  logger.warn({ chatJid: data.chatJid, sourceGroup }, 'Unauthorized IPC file send blocked');
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
    // For request_google_oauth
    service?: string;
    // For kill_container
    targetGroupFolder?: string;
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
): Promise<void> {
  // Import db functions dynamically to avoid circular deps
  const {
    createTask,
    updateTask,
    deleteTask,
    getTaskById: getTask,
  } = await import('./db.js');
  const { CronExpressionParser } = await import('cron-parser');

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.groupFolder
      ) {
        // Authorization: non-main groups can only schedule for themselves
        const targetGroup = data.groupFolder;
        if (!isMain && targetGroup !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetGroup },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        // Resolve the correct JID for the target group (don't trust IPC payload)
        const targetJid = Object.entries(registeredGroups).find(
          ([, group]) => group.folder === targetGroup,
        )?.[0];

        if (!targetJid) {
          logger.warn(
            { targetGroup },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetGroup,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetGroup, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTask(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await syncGroupMetadata(true);
        // Write updated snapshot immediately
        const availableGroups = getAvailableGroups();
        const { writeGroupsSnapshot: writeGroups } =
          await import('./container-runner.js');
        writeGroups(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        // Auto-detect DM registrations by JID suffix
        const isDmReg = data.jid.endsWith('@s.whatsapp.net') || data.jid.endsWith('@lid');

        registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          isDm: isDmReg || undefined,
          alwaysProcess: isDmReg || undefined,
        });

        // If this was a pending DM request, clean it up and notify user
        if (isDmReg) {
          const removed = removePendingRequest(data.jid);
          if (removed) {
            logger.info({ jid: data.jid, phone: removed.phone }, 'Approved pending DM request');
          }
          await sendMessage(
            data.jid,
            `${ASSISTANT_NAME}: Your registration has been approved! I'm now available to help you. Just send me a message anytime.`,
          );
        }
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    case 'deny_dm':
      // Only main group can deny DM requests
      if (!isMain) {
        logger.warn({ sourceGroup }, 'Unauthorized deny_dm attempt blocked');
        break;
      }
      if (data.jid) {
        const denied = removePendingRequest(data.jid);
        if (denied) {
          logger.info({ jid: data.jid, phone: denied.phone }, 'Denied DM request');
        } else {
          logger.warn({ jid: data.jid }, 'No pending DM request found to deny');
        }
      }
      break;

    case 'request_google_oauth': {
      if (!data.chatJid || !data.groupFolder) {
        logger.warn({ data }, 'Invalid request_google_oauth: missing chatJid or groupFolder');
        break;
      }

      // Verify the target group is registered
      const oauthTarget = Object.entries(registeredGroups).find(
        ([, g]) => g.folder === data.groupFolder,
      );
      if (!oauthTarget) {
        logger.warn(
          { groupFolder: data.groupFolder },
          'request_google_oauth rejected: group not registered',
        );
        break;
      }

      // Authorization: source group must match target (or be main)
      if (sourceGroup !== data.groupFolder && !isMain) {
        logger.warn(
          { sourceGroup, targetGroup: data.groupFolder },
          'Unauthorized request_google_oauth attempt blocked',
        );
        break;
      }

      try {
        const service = (data.service || 'all') as OAuthService;
        const { authUrl } = createOAuthSession(
          data.chatJid,
          data.groupFolder,
          service,
        );

        await sendMessage(
          data.chatJid,
          `${ASSISTANT_NAME}: To connect your Google account, click this link:\n\n${authUrl}\n\nThis link expires in 10 minutes.`,
        );

        logger.info(
          { groupFolder: data.groupFolder, service, chatJid: data.chatJid },
          'OAuth URL sent to user',
        );
      } catch (err) {
        logger.error({ err, groupFolder: data.groupFolder }, 'Failed to create OAuth session');
        await sendMessage(
          data.chatJid,
          `${ASSISTANT_NAME}: Failed to start Google setup. Please try again later.`,
        );
      }
      break;
    }

    case 'refresh_diagnostics':
      if (isMain) {
        writeDiagnosticsSnapshot(sourceGroup, {
          lastMessageProcessed: getLatestTimestamp(),
          registeredGroupsCount: Object.keys(registeredGroups).length,
          whatsappConnected: !!sock?.user,
        }, DATA_DIR);
        logger.info({ sourceGroup }, 'Diagnostics refreshed via IPC');
      }
      break;

    case 'kill_container':
      if (isMain && data.targetGroupFolder) {
        const killed = killContainer(data.targetGroupFolder);
        logger.info(
          { targetGroup: data.targetGroupFolder, killed, sourceGroup },
          'Kill container requested via IPC',
        );
      } else if (!isMain) {
        logger.warn({ sourceGroup }, 'Unauthorized kill_container attempt blocked');
      }
      break;

    case 'restart_service':
      if (isMain) {
        logger.info({ sourceGroup }, 'Service restart requested via IPC');
        const restartCmd = process.platform === 'darwin'
          ? `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
          : 'sudo systemctl restart nanoclaw';
        exec(restartCmd, (err) => {
          if (err) logger.error({ err }, 'Failed to restart service');
        });
      } else {
        logger.warn({ sourceGroup }, 'Unauthorized restart_service attempt blocked');
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

async function connectWhatsApp(): Promise<void> {
  const authDir = path.join(STORE_DIR, 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['NanoClaw', 'Chrome', '1.0.0'],
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const msg =
        'WhatsApp authentication required. Run /setup in Claude Code.';
      logger.error(msg);
      exec(
        `osascript -e 'display notification "${msg}" with title "NanoClaw" sound name "Basso"'`,
      );
      setTimeout(() => process.exit(1), 1000);
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      logger.info({ reason, shouldReconnect }, 'Connection closed');

      if (shouldReconnect) {
        logger.info('Reconnecting...');
        connectWhatsApp();
      } else {
        logger.info('Logged out. Run /setup to re-authenticate.');
        process.exit(0);
      }
    } else if (connection === 'open') {
      logger.info('Connected to WhatsApp');
      
      // Build LID to phone mapping from auth state for self-chat translation
      if (sock.user) {
        const phoneUser = sock.user.id.split(':')[0];
        const lidUser = sock.user.lid?.split(':')[0];
        if (lidUser && phoneUser) {
          lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
          logger.debug({ lidUser, phoneUser }, 'LID to phone mapping set');
        }
      }
      
      // Sync group metadata on startup (respects 24h cache)
      syncGroupMetadata().catch((err) =>
        logger.error({ err }, 'Initial group sync failed'),
      );
      // Set up daily sync timer (only once)
      if (!groupSyncTimerStarted) {
        groupSyncTimerStarted = true;
        setInterval(() => {
          syncGroupMetadata().catch((err) =>
            logger.error({ err }, 'Periodic group sync failed'),
          );
        }, GROUP_SYNC_INTERVAL_MS);
      }
      startSchedulerLoop({
        sendMessage,
        registeredGroups: () => registeredGroups,
        getSessions: () => sessions,
      });
      startIpcWatcher();
      startOAuthServer(sendMessage, async (session) => {
        // Auto-register DM user on successful OAuth completion
        if (!registeredGroups[session.userJid]) {
          registerGroup(session.userJid, {
            name: session.groupFolder,
            folder: session.groupFolder,
            trigger: `@${ASSISTANT_NAME}`,
            added_at: new Date().toISOString(),
            isDm: true,
            alwaysProcess: true,
          });
          removePendingRequest(session.userJid);
          logger.info(
            { jid: session.userJid, folder: session.groupFolder },
            'DM user auto-registered after OAuth',
          );
        }
      });
      startAllLoops();

      // Periodic cleanup of old incoming media files
      setInterval(() => {
        const cutoff = Date.now() - FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        for (const group of Object.values(registeredGroups)) {
          const incomingDir = path.join(GROUPS_DIR, group.folder, 'files', 'incoming');
          if (!fs.existsSync(incomingDir)) continue;
          try {
            for (const file of fs.readdirSync(incomingDir)) {
              const filePath = path.join(incomingDir, file);
              const stat = fs.statSync(filePath);
              if (stat.mtimeMs < cutoff) {
                fs.unlinkSync(filePath);
                logger.debug({ file: filePath }, 'Cleaned up old media file');
              }
            }
          } catch (err) {
            logger.error({ err, group: group.folder }, 'Error cleaning up media files');
          }
        }
      }, 24 * 60 * 60 * 1000); // Daily
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Build LID-to-phone mapping for all contacts (not just self)
  sock.ev.on('lid-mapping.update', ({ lid, pn }) => {
    const lidUser = lid.split('@')[0].split(':')[0];
    const phoneJid = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
    lidToPhoneMap[lidUser] = phoneJid;
    logger.debug({ lidUser, phoneJid }, 'LID mapping updated');
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const contact of contacts) {
      if (contact.lid && contact.id?.endsWith('@s.whatsapp.net')) {
        const lidUser = contact.lid.split('@')[0].split(':')[0];
        lidToPhoneMap[lidUser] = contact.id;
      }
    }
    logger.debug({ mapSize: Object.keys(lidToPhoneMap).length }, 'LID map updated from contacts');
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) continue;
      const rawJid = msg.key.remoteJid;
      if (!rawJid || rawJid === 'status@broadcast') continue;

      // Translate LID JID to phone JID if applicable
      const chatJid = translateJid(rawJid);

      const timestamp = new Date(
        Number(msg.messageTimestamp) * 1000,
      ).toISOString();

      // Always store chat metadata for group discovery
      storeChatMetadata(chatJid, timestamp);

      // Store messages for registered groups, all group chats (for auto-registration),
      // pending DM requests, and all DMs (so unregistered users can trigger registration)
      const isDmJid = chatJid.endsWith('@s.whatsapp.net') || chatJid.endsWith('@lid');
      if (registeredGroups[chatJid] || chatJid.endsWith('@g.us') || isPending(chatJid) || isDmJid) {
        // For registered groups, download media if present
        let mediaResult: { filePath: string; mediaType: string; caption: string } | null = null;
        if (registeredGroups[chatJid]) {
          const group = registeredGroups[chatJid];
          mediaResult = await downloadAndSaveMedia(msg, group.folder);
        }

        storeMessage(
          msg,
          chatJid,
          msg.key.fromMe || false,
          msg.pushName || undefined,
          mediaResult?.mediaType,
          mediaResult?.filePath,
        );
      }
    }
  });
}

/**
 * Independent processing loop for a single registered group.
 * Each group gets its own loop so a stuck container in one group
 * never blocks message processing in other groups.
 */
async function startGroupLoop(jid: string): Promise<void> {
  if (groupLoopsRunning.has(jid)) return;
  groupLoopsRunning.add(jid);

  const group = registeredGroups[jid];
  const label = group?.folder || jid;
  logger.info({ jid, folder: label }, 'Starting independent group loop');

  if (!groupTimestamps[jid]) {
    groupTimestamps[jid] = discoveryTimestamp || '';
  }

  while (true) {
    try {
      const { messages } = getNewMessages(
        [jid],
        groupTimestamps[jid],
        ASSISTANT_NAME,
      );

      for (const msg of messages) {
        try {
          await processMessage(msg);
          groupTimestamps[jid] = msg.timestamp;
          saveState();
        } catch (err) {
          logger.error(
            { err, msg: msg.id, jid },
            'Error in group loop, will retry',
          );
          break;
        }
      }
    } catch (err) {
      logger.error({ err, jid }, 'Error in group loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Lightweight discovery loop for unregistered chats.
 * Monitors all group chats and DMs for auto-registration triggers
 * and DM registration requests. Does NOT run containers — only handles
 * registration logic. Once a group is registered, startGroupLoop takes over.
 */
async function startDiscoveryLoop(): Promise<void> {
  while (true) {
    try {
      // Check for newly registered groups and start their loops
      for (const jid of Object.keys(registeredGroups)) {
        if (!groupLoopsRunning.has(jid)) {
          startGroupLoop(jid);
        }
      }

      // Collect unregistered JIDs for auto-registration + DM pending
      const handledJids = new Set(Object.keys(registeredGroups));
      const discoveryJids: string[] = [];
      const allChats = getAllChats();
      for (const chat of allChats) {
        if (!handledJids.has(chat.jid) &&
            (chat.jid.endsWith('@g.us') || chat.jid.endsWith('@s.whatsapp.net') || chat.jid.endsWith('@lid'))) {
          discoveryJids.push(chat.jid);
        }
      }
      for (const req of loadPendingRequests()) {
        if (!handledJids.has(req.jid) && !discoveryJids.includes(req.jid)) {
          discoveryJids.push(req.jid);
        }
      }

      if (discoveryJids.length > 0) {
        const { messages } = getNewMessages(discoveryJids, discoveryTimestamp, ASSISTANT_NAME);

        if (messages.length > 0)
          logger.info({ count: messages.length }, 'New messages (discovery)');
        for (const msg of messages) {
          try {
            await processMessage(msg);
            discoveryTimestamp = msg.timestamp;
            saveState();
          } catch (err) {
            logger.error(
              { err, msg: msg.id },
              'Error in discovery loop, will retry',
            );
            break;
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in discovery loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

async function startAllLoops(): Promise<void> {
  if (loopsStarted) {
    logger.debug('Loops already started, skipping duplicate start');
    return;
  }
  loopsStarted = true;
  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  // Launch independent loops for all registered groups
  for (const jid of Object.keys(registeredGroups)) {
    startGroupLoop(jid);
  }

  // Launch discovery loop (handles unregistered chats + spawns new group loops)
  startDiscoveryLoop();
}

function ensureDockerRunning(): void {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 10000 });
    logger.debug('Docker daemon is running');
  } catch {
    logger.error('Docker daemon is not running');
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: Docker is not running                                  ║');
    console.error('║                                                                ║');
    console.error('║  Agents cannot run without Docker. To fix:                     ║');
    console.error('║  macOS: Start Docker Desktop                                   ║');
    console.error('║  Linux: sudo systemctl start docker                            ║');
    console.error('║                                                                ║');
    console.error('║  Install from: https://docker.com/products/docker-desktop      ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    throw new Error('Docker is required but not running');
  }

  // Clean up stopped NanoClaw containers from previous runs
  try {
    const output = execSync('container ls -a --format {{.Names}}', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    const stale = output
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.startsWith('nanoclaw-'));
    if (stale.length > 0) {
      execSync(`container rm ${stale.join(' ')}`, { stdio: 'pipe' });
      logger.info({ count: stale.length }, 'Cleaned up stopped containers');
    }
  } catch {
    // No stopped containers or ls/rm not supported
  }
}

async function main(): Promise<void> {
  ensureDockerRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Load org config (null = personal mode, no behavior change)
  try {
    orgConfig = loadOrgConfig(path.resolve(ORG_CONFIG_PATH));
    if (orgConfig) {
      logger.info(
        { org: orgConfig.organization.name, teams: orgConfig.teams.length },
        'Org mode active',
      );
    }
  } catch (err) {
    logger.error({ err, configPath: ORG_CONFIG_PATH }, 'Failed to load org config');
    process.exit(1);
  }

  await connectWhatsApp();
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw');
  process.exit(1);
});
