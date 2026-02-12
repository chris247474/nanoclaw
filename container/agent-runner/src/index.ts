/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 */

import fs from 'fs';
import path from 'path';
import { query, HookCallback, PreCompactHookInput } from '@anthropic-ai/claude-agent-sdk';
import { createIpcMcp } from './ipc-mcp.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  // Org mode fields
  isAdmin?: boolean;
  teamId?: string;
  orgTeamIds?: string[];
  teamEmail?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  // sessions-index.json is in the same directory as the transcript
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(`Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

/**
 * Archive the full transcript to conversations/ before compaction.
 */
function createPreCompactHook(): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        log('No messages to archive');
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const conversationsDir = '/workspace/group/conversations';
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(messages, summary);
      fs.writeFileSync(filePath, markdown);

      log(`Archived conversation to ${filePath}`);
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {};
  };
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
    }
  }

  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : 'Andy';
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + '...'
      : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
    log(`Received input for group: ${input.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  const ipcMcp = createIpcMcp({
    chatJid: input.chatJid,
    groupFolder: input.groupFolder,
    isMain: input.isMain
  });

  let result: string | null = null;
  let newSessionId: string | undefined;

  // Read org context if available (written by host before container launch)
  const orgContextPath = '/workspace/ipc/org_context.json';
  let orgContextPrompt = '';
  if (fs.existsSync(orgContextPath)) {
    try {
      const orgContext = JSON.parse(fs.readFileSync(orgContextPath, 'utf-8'));
      orgContextPrompt = `[ORGANIZATION CONTEXT]\n${JSON.stringify(orgContext, null, 2)}\n[/ORGANIZATION CONTEXT]\n\n`;
      log(`Loaded org context: role=${orgContext.role}, org=${orgContext.organization}`);
    } catch (err) {
      log(`Failed to read org context: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Add progress update instructions for all tasks
  // IMPORTANT: When send_message is used, the final return value is suppressed to avoid duplicates.
  // So if you send progress updates, your final answer MUST also go through send_message.
  let prompt = `[RESPONSE RULES:
- For simple questions (quick lookups, short answers, confirmations): just return your answer directly. Do NOT use mcp__nanoclaw__send_message.
- For tasks taking >30 seconds (research, multi-step operations, file processing): use mcp__nanoclaw__send_message for ALL responses including your final answer. Your return value will be suppressed if any send_message was used.
- Rule: either use send_message for everything OR don't use it at all. Never mix both.]\n\n${orgContextPrompt}${input.prompt}`;

  // Add context for scheduled tasks
  if (input.isScheduledTask) {
    prompt = `[SCHEDULED TASK - You are running automatically, not in response to a user message. Use mcp__nanoclaw__send_message if needed to communicate with the user.]\n\n${prompt}`;
  }

  // Save original env vars for fallback
  const origApiKey = process.env.ANTHROPIC_API_KEY;
  const origBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const origModel = process.env.ANTHROPIC_MODEL;
  const origOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  function setThirdPartyEnv() {
    // Route the Claude Agent SDK to the 3rd party provider
    // by overriding ANTHROPIC_* env vars
    process.env.ANTHROPIC_API_KEY = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_BASE_URL = process.env.OPENAI_BASE_URL;
    process.env.ANTHROPIC_MODEL = process.env.OPENAI_MODEL;
    // Clear OAuth token so it doesn't conflict
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  function restoreClaudeEnv() {
    // Restore original env vars for Claude fallback
    if (origApiKey) {
      process.env.ANTHROPIC_API_KEY = origApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (origBaseUrl) {
      process.env.ANTHROPIC_BASE_URL = origBaseUrl;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }
    if (origModel) {
      process.env.ANTHROPIC_MODEL = origModel;
    } else {
      delete process.env.ANTHROPIC_MODEL;
    }
    if (origOAuthToken) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = origOAuthToken;
    }
  }

  function buildQueryOptions(modelConfig: any = {}) {
    const mcpServers: any = {
      nanoclaw: ipcMcp
    };

    // Google MCP loading:
    // - Admin (org mode): load per-team MCP instances at namespaced paths
    // - Team/Main (org or personal): load MCP if credentials exist at standard paths
    //   (host only mounts credentials if the team/main has them configured)
    if (input.isAdmin && input.orgTeamIds) {
      // Admin: discover and load per-team MCP instances
      for (const teamId of input.orgTeamIds) {
        const teamGmailCreds = `/home/node/.gmail-mcp-${teamId}/credentials.json`;
        if (fs.existsSync(teamGmailCreds)) {
          mcpServers[`gmail-${teamId}`] = {
            command: 'npx',
            args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
            env: {
              GMAIL_MCP_CREDENTIALS_DIR: `/home/node/.gmail-mcp-${teamId}`
            }
          };
        }

        const teamCalendarTokens = `/home/node/.config/google-calendar-mcp-${teamId}/tokens.json`;
        if (fs.existsSync(teamCalendarTokens)) {
          const teamOAuthKeys = `/home/node/.gmail-mcp-${teamId}/gcp-oauth.keys.json`;
          mcpServers[`google-calendar-${teamId}`] = {
            command: 'npx',
            args: ['-y', '@cocal/google-calendar-mcp'],
            env: {
              GOOGLE_OAUTH_CREDENTIALS: teamOAuthKeys,
              GOOGLE_CALENDAR_MCP_TOKEN_PATH: teamCalendarTokens
            }
          };
        }

        const teamDriveTokens = `/home/node/.config/google-drive-mcp-${teamId}/tokens.json`;
        if (fs.existsSync(teamDriveTokens)) {
          const teamOAuthKeys = `/home/node/.gmail-mcp-${teamId}/gcp-oauth.keys.json`;
          mcpServers[`gdrive-${teamId}`] = {
            command: 'npx',
            args: ['-y', '@piotr-agier/google-drive-mcp'],
            env: {
              GOOGLE_DRIVE_OAUTH_CREDENTIALS: teamOAuthKeys,
              GOOGLE_DRIVE_MCP_TOKEN_PATH: teamDriveTokens
            }
          };
        }
      }
    } else {
      // Team or Main (personal mode): load MCP if credentials exist at standard paths
      const gmailCredsPath = '/home/node/.gmail-mcp/credentials.json';
      if (fs.existsSync(gmailCredsPath)) {
        mcpServers['gmail'] = {
          command: 'npx',
          args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp']
        };
      }

      const calendarTokensPath = '/home/node/.config/google-calendar-mcp/tokens.json';
      if (fs.existsSync(calendarTokensPath)) {
        mcpServers['google-calendar'] = {
          command: 'npx',
          args: ['-y', '@cocal/google-calendar-mcp'],
          env: {
            GOOGLE_OAUTH_CREDENTIALS: '/home/node/.gmail-mcp/gcp-oauth.keys.json',
            GOOGLE_CALENDAR_MCP_TOKEN_PATH: calendarTokensPath
          }
        };
      }

      const gdriveTokensPath = '/home/node/.config/google-drive-mcp/tokens.json';
      if (fs.existsSync(gdriveTokensPath)) {
        mcpServers['gdrive'] = {
          command: 'npx',
          args: ['-y', '@piotr-agier/google-drive-mcp'],
          env: {
            GOOGLE_DRIVE_OAUTH_CREDENTIALS: '/home/node/.gmail-mcp/gcp-oauth.keys.json',
            GOOGLE_DRIVE_MCP_TOKEN_PATH: gdriveTokensPath
          }
        };
      }
    }

    // Add Figma MCP if token exists (available to all groups)
    if (process.env.FIGMA_ACCESS_TOKEN) {
      mcpServers['figma'] = {
        command: 'figma-developer-mcp',
        env: {
          FIGMA_ACCESS_TOKEN: process.env.FIGMA_ACCESS_TOKEN
        }
      };
    }

    return {
      ...modelConfig,
      cwd: '/workspace/group',
      resume: input.sessionId,
      allowedTools: [
        'Bash',
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebSearch', 'WebFetch',
        'mcp__nanoclaw__*',
        'mcp__gmail__*',
        'mcp__gmail-*__*',
        'mcp__google-calendar__*',
        'mcp__google-calendar-*__*',
        'mcp__gdrive__*',
        'mcp__gdrive-*__*',
        'mcp__figma__*'
      ],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      settingSources: ['project'] as const,
      mcpServers,
      hooks: {
        PreCompact: [{ hooks: [createPreCompactHook()] }]
      }
    };
  }

  async function runAgent(options: any) {
    for await (const message of query({ prompt, options })) {
      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
        log(`Session initialized: ${newSessionId}`);
      }
      if ('result' in message && message.result) {
        result = message.result as string;
      }
    }
  }

  const useThirdParty = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL && process.env.OPENAI_MODEL);

  try {
    log('Starting agent...');

    if (useThirdParty) {
      log(`Using 3rd party model: ${process.env.OPENAI_MODEL} via ${process.env.OPENAI_BASE_URL}`);
      setThirdPartyEnv();
    } else if (process.env.CLAUDE_MODEL) {
      log(`Using Claude model: ${process.env.CLAUDE_MODEL}`);
    }

    const modelConfig: any = {};
    if (!useThirdParty && process.env.CLAUDE_MODEL) {
      modelConfig.model = process.env.CLAUDE_MODEL;
      if (process.env.CLAUDE_FALLBACK_MODEL) {
        modelConfig.fallbackModel = process.env.CLAUDE_FALLBACK_MODEL;
      }
    }

    await runAgent(buildQueryOptions(modelConfig));

    // Restore env after success
    if (useThirdParty) restoreClaudeEnv();

    log('Agent completed successfully');
    writeOutput({
      status: 'success',
      result,
      newSessionId
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // If 3rd party failed and Claude fallback is available, try Claude
    if (useThirdParty && (origOAuthToken || origApiKey)) {
      log(`Primary model failed: ${errorMessage}`);
      log('Attempting fallback to Claude...');
      restoreClaudeEnv();

      try {
        const claudeConfig: any = {};
        if (process.env.CLAUDE_MODEL) {
          claudeConfig.model = process.env.CLAUDE_MODEL;
        }
        if (process.env.CLAUDE_FALLBACK_MODEL) {
          claudeConfig.fallbackModel = process.env.CLAUDE_FALLBACK_MODEL;
        }

        await runAgent(buildQueryOptions(claudeConfig));

        log('Agent completed successfully with Claude fallback');
        writeOutput({
          status: 'success',
          result,
          newSessionId
        });
        return;
      } catch (fallbackErr) {
        const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        log(`Claude fallback also failed: ${fallbackMessage}`);
        writeOutput({
          status: 'error',
          result: null,
          newSessionId,
          error: `Primary failed: ${errorMessage}. Fallback failed: ${fallbackMessage}`
        });
        process.exit(1);
      }
    }

    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId,
      error: errorMessage
    });
    process.exit(1);
  }
}

main();
