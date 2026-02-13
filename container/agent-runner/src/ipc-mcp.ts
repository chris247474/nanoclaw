/**
 * IPC-based MCP Server for NanoClaw
 * Writes messages and tasks to files for the host process to pick up
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

export interface IpcMcpContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
}

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

export function createIpcMcp(ctx: IpcMcpContext) {
  const { chatJid, groupFolder, isMain } = ctx;

  return createSdkMcpServer({
    name: 'nanoclaw',
    version: '1.0.0',
    tools: [
      tool(
        'send_message',
        'Send a message to the current WhatsApp group. Use this to proactively share information or updates.',
        {
          text: z.string().describe('The message text to send')
        },
        async (args) => {
          const data = {
            type: 'message',
            chatJid,
            text: args.text,
            groupFolder,
            timestamp: new Date().toISOString()
          };

          const filename = writeIpcFile(MESSAGES_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Message queued for delivery (${filename})`
            }]
          };
        }
      ),

      tool(
        'send_file',
        `Send a file to the current WhatsApp chat. The file must exist within /workspace/group/.
Supports images, documents, videos, and audio. The file type is auto-detected from the extension.
Maximum file size: 50MB.`,
        {
          file_path: z.string().describe('Path to the file within /workspace/group/ (e.g., "/workspace/group/reports/output.pdf")'),
          caption: z.string().optional().describe('Optional caption/message to send with the file'),
          file_name: z.string().optional().describe('Optional display name for the file (defaults to original filename)')
        },
        async (args) => {
          // 1. Validate path is within /workspace/group/
          const resolved = path.resolve(args.file_path);
          if (!resolved.startsWith('/workspace/group/')) {
            return {
              content: [{ type: 'text' as const, text: 'Error: file_path must be within /workspace/group/' }],
              isError: true
            };
          }

          // 2. Validate file exists
          if (!fs.existsSync(resolved)) {
            return {
              content: [{ type: 'text' as const, text: `Error: file not found: ${resolved}` }],
              isError: true
            };
          }

          // 3. Validate file size (50MB limit)
          const stat = fs.statSync(resolved);
          if (stat.size > 50 * 1024 * 1024) {
            return {
              content: [{ type: 'text' as const, text: `Error: file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB.` }],
              isError: true
            };
          }

          // 4. Write IPC file message
          const relativePath = path.relative('/workspace/group', resolved);
          const data = {
            type: 'file',
            chatJid,
            filePath: relativePath,
            caption: args.caption,
            fileName: args.file_name || path.basename(resolved),
            groupFolder,
            timestamp: new Date().toISOString()
          };

          const filename = writeIpcFile(MESSAGES_DIR, data);
          return {
            content: [{ type: 'text' as const, text: `File queued for delivery: ${path.basename(resolved)} (${filename})` }]
          };
        }
      ),

      tool(
        'schedule_task',
        `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE - Choose based on task type:
• "group" (recommended for most tasks): Task runs in the group's conversation context, with access to chat history and memory. Use for tasks that need context about ongoing discussions, user preferences, or previous interactions.
• "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, ask the user. Examples:
- "Remind me about our discussion" → group (needs conversation context)
- "Check the weather every morning" → isolated (self-contained task)
- "Follow up on my request" → group (needs to know what was requested)
- "Generate a daily report" → isolated (just needs instructions in prompt)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
• cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
• interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
• once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
        {
          prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
          schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
          schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
          context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
          target_group: z.string().optional().describe('Target group folder (main only, defaults to current group)')
        },
        async (args) => {
          // Validate schedule_value before writing IPC
          if (args.schedule_type === 'cron') {
            try {
              CronExpressionParser.parse(args.schedule_value);
            } catch (err) {
              return {
                content: [{ type: 'text', text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
                isError: true
              };
            }
          } else if (args.schedule_type === 'interval') {
            const ms = parseInt(args.schedule_value, 10);
            if (isNaN(ms) || ms <= 0) {
              return {
                content: [{ type: 'text', text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
                isError: true
              };
            }
          } else if (args.schedule_type === 'once') {
            const date = new Date(args.schedule_value);
            if (isNaN(date.getTime())) {
              return {
                content: [{ type: 'text', text: `Invalid timestamp: "${args.schedule_value}". Use ISO 8601 format like "2026-02-01T15:30:00.000Z".` }],
                isError: true
              };
            }
          }

          // Non-main groups can only schedule for themselves
          const targetGroup = isMain && args.target_group ? args.target_group : groupFolder;

          const data = {
            type: 'schedule_task',
            prompt: args.prompt,
            schedule_type: args.schedule_type,
            schedule_value: args.schedule_value,
            context_mode: args.context_mode || 'group',
            groupFolder: targetGroup,
            chatJid,
            createdBy: groupFolder,
            timestamp: new Date().toISOString()
          };

          const filename = writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task scheduled (${filename}): ${args.schedule_type} - ${args.schedule_value}`
            }]
          };
        }
      ),

      // Reads from current_tasks.json which host keeps updated
      tool(
        'list_tasks',
        'List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group\'s tasks.',
        {},
        async () => {
          const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

          try {
            if (!fs.existsSync(tasksFile)) {
              return {
                content: [{
                  type: 'text',
                  text: 'No scheduled tasks found.'
                }]
              };
            }

            const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

            const tasks = isMain
              ? allTasks
              : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

            if (tasks.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No scheduled tasks found.'
                }]
              };
            }

            const formatted = tasks.map((t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
              `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`
            ).join('\n');

            return {
              content: [{
                type: 'text',
                text: `Scheduled tasks:\n${formatted}`
              }]
            };
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`
              }]
            };
          }
        }
      ),

      tool(
        'pause_task',
        'Pause a scheduled task. It will not run until resumed.',
        {
          task_id: z.string().describe('The task ID to pause')
        },
        async (args) => {
          const data = {
            type: 'pause_task',
            taskId: args.task_id,
            groupFolder,
            isMain,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task ${args.task_id} pause requested.`
            }]
          };
        }
      ),

      tool(
        'resume_task',
        'Resume a paused task.',
        {
          task_id: z.string().describe('The task ID to resume')
        },
        async (args) => {
          const data = {
            type: 'resume_task',
            taskId: args.task_id,
            groupFolder,
            isMain,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task ${args.task_id} resume requested.`
            }]
          };
        }
      ),

      tool(
        'cancel_task',
        'Cancel and delete a scheduled task.',
        {
          task_id: z.string().describe('The task ID to cancel')
        },
        async (args) => {
          const data = {
            type: 'cancel_task',
            taskId: args.task_id,
            groupFolder,
            isMain,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task ${args.task_id} cancellation requested.`
            }]
          };
        }
      ),

      tool(
        'register_group',
        `Register a new WhatsApp group or approve a pending DM request. Main group only.

For groups: use available_groups.json to find the JID. Folder name should be lowercase with hyphens (e.g., "family-chat").
For DMs: use pending_dm_requests.json to find the JID. Folder name should be "dm-{phone}" (e.g., "dm-639524538012"). DM registrations automatically get always-process and per-user credential isolation.`,
        {
          jid: z.string().describe('The WhatsApp JID (e.g., "120363336345536173@g.us" for groups, "639524538012@s.whatsapp.net" for DMs)'),
          name: z.string().describe('Display name for the group/user'),
          folder: z.string().describe('Folder name (e.g., "family-chat" for groups, "dm-639524538012" for DMs)'),
          trigger: z.string().describe('Trigger word (e.g., "@Andy")')
        },
        async (args) => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only the main group can register new groups.' }],
              isError: true
            };
          }

          const data = {
            type: 'register_group',
            jid: args.jid,
            name: args.name,
            folder: args.folder,
            trigger: args.trigger,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          const isDm = args.jid.endsWith('@s.whatsapp.net') || args.jid.endsWith('@lid');
          return {
            content: [{
              type: 'text',
              text: isDm
                ? `DM registration approved for "${args.name}". They will be notified and can start chatting.`
                : `Group "${args.name}" registered. It will start receiving messages immediately.`
            }]
          };
        }
      ),

      tool(
        'list_pending_dm_requests',
        'List pending DM registration requests awaiting approval. Main group only.',
        {},
        async () => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only the main group can view pending requests.' }],
              isError: true
            };
          }

          const pendingFile = path.join(IPC_DIR, 'pending_dm_requests.json');

          try {
            if (!fs.existsSync(pendingFile)) {
              return { content: [{ type: 'text', text: 'No pending DM requests.' }] };
            }

            const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));

            if (pending.length === 0) {
              return { content: [{ type: 'text', text: 'No pending DM requests.' }] };
            }

            const formatted = pending.map((p: { senderName?: string; phone: string; jid: string; requestedAt: string; triggerMessage: string }) =>
              `- ${p.senderName || p.phone} (${p.phone})\n  JID: ${p.jid}\n  Requested: ${p.requestedAt}\n  Message: "${p.triggerMessage}"`
            ).join('\n\n');

            return { content: [{ type: 'text', text: `Pending DM requests:\n\n${formatted}` }] };
          } catch (err) {
            return {
              content: [{ type: 'text', text: `Error reading pending requests: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true
            };
          }
        }
      ),

      tool(
        'request_google_oauth',
        `Request Google account OAuth setup for the current chat.
Use this when a user wants to connect their Google account (Gmail, Calendar, Drive).
This sends an authorization URL to the chat. After they authorize, Google tools become available automatically.

Service options:
- "all" (recommended): Connect Gmail, Calendar, and Drive in one authorization
- "gmail": Connect only Gmail
- "calendar": Connect only Google Calendar
- "drive": Connect only Google Drive`,
        {
          service: z.enum(['all', 'gmail', 'calendar', 'drive'])
            .default('all')
            .describe('Which Google service(s) to connect'),
        },
        async (args) => {
          const data = {
            type: 'request_google_oauth',
            service: args.service,
            chatJid,
            groupFolder,
            timestamp: new Date().toISOString(),
          };

          const filename = writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text' as const,
              text: `Google OAuth setup initiated for ${args.service}. An authorization link will be sent to the user shortly. (${filename})`,
            }],
          };
        }
      ),

      tool(
        'deny_dm',
        'Deny a pending DM registration request. Main group only.',
        {
          jid: z.string().describe('The WhatsApp JID of the pending request to deny')
        },
        async (args) => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only the main group can deny DM requests.' }],
              isError: true
            };
          }

          const data = {
            type: 'deny_dm',
            jid: args.jid,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return { content: [{ type: 'text', text: `DM request for ${args.jid} denied.` }] };
        }
      ),

      // --- Diagnostic tools (admin only) ---

      tool(
        'get_diagnostics',
        `Get system diagnostics including process health, active containers, recent runs, and errors.
Reads the diagnostics snapshot written by the host before this container launched.
Use this to investigate issues, check what containers are running, and see recent failures.
Main/admin group only.`,
        {},
        async () => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only main/admin group can access diagnostics.' }],
              isError: true,
            };
          }

          const diagPath = path.join(IPC_DIR, 'diagnostics.json');
          if (!fs.existsSync(diagPath)) {
            return {
              content: [{ type: 'text', text: 'No diagnostics snapshot available. This may be the first run.' }],
            };
          }

          try {
            const data = JSON.parse(fs.readFileSync(diagPath, 'utf-8'));
            return {
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: `Error reading diagnostics: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            };
          }
        }
      ),

      tool(
        'refresh_diagnostics',
        'Request the host to refresh the diagnostics snapshot with current data. After calling this, wait a moment then call get_diagnostics to read fresh data. Main/admin only.',
        {},
        async () => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only main/admin group can refresh diagnostics.' }],
              isError: true,
            };
          }

          writeIpcFile(TASKS_DIR, {
            type: 'refresh_diagnostics',
            timestamp: new Date().toISOString(),
          });

          return {
            content: [{ type: 'text', text: 'Diagnostics refresh requested. Use get_diagnostics to read the updated snapshot.' }],
          };
        }
      ),

      tool(
        'kill_stuck_agent',
        'Kill a stuck container agent by group folder name. Use get_diagnostics first to see active containers and identify which one is stuck. Main/admin only.',
        {
          group_folder: z.string().describe('The group folder of the stuck agent (e.g., "family-chat")'),
        },
        async (args) => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only main/admin group can kill agents.' }],
              isError: true,
            };
          }

          writeIpcFile(TASKS_DIR, {
            type: 'kill_container',
            targetGroupFolder: args.group_folder,
            timestamp: new Date().toISOString(),
          });

          return {
            content: [{ type: 'text', text: `Kill request sent for container in group "${args.group_folder}". The container will be terminated.` }],
          };
        }
      ),

      tool(
        'restart_service',
        `Restart the entire NanoClaw service via launchctl. WARNING: This will kill ALL active containers including this one. The service will restart automatically via launchd. Use only as a last resort when the bot is in a bad state. Main/admin only.`,
        {},
        async () => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only main/admin group can restart the service.' }],
              isError: true,
            };
          }

          // Send notification before restart since this container will die
          writeIpcFile(MESSAGES_DIR, {
            type: 'message',
            chatJid,
            text: 'Restarting NanoClaw service now. I will be back online in a few seconds.',
            groupFolder,
            timestamp: new Date().toISOString(),
          });

          writeIpcFile(TASKS_DIR, {
            type: 'restart_service',
            timestamp: new Date().toISOString(),
          });

          return {
            content: [{ type: 'text', text: 'Service restart initiated. This container will terminate shortly.' }],
          };
        }
      )
    ]
  });
}
