/**
 * Container Runner for NanoClaw
 * Spawns agent execution in Apple Container and handles IPC
 */
import { exec, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
} from './config.js';
import { logger } from './logger.js';
import { validateAdditionalMounts } from './mount-security.js';
import {
  ActiveContainer,
  ContainerErrorSummary,
  RecentContainerRun,
  RegisteredGroup,
  TeamConfig,
} from './types.js';

// --- Container Tracking ---

const activeContainersMap = new Map<
  string,
  { pid: number; startTime: number; groupName: string; promptPreview: string }
>();
const recentRunsBuffer: RecentContainerRun[] = [];
const recentErrorsBuffer: ContainerErrorSummary[] = [];
const MAX_RECENT_RUNS = 20;
const MAX_RECENT_ERRORS = 10;

export function trackContainerStart(
  groupFolder: string,
  info: { pid: number; groupName: string; promptPreview: string },
): void {
  activeContainersMap.set(groupFolder, {
    pid: info.pid,
    startTime: Date.now(),
    groupName: info.groupName,
    promptPreview: info.promptPreview.slice(0, 100),
  });
}

export function trackContainerEnd(
  groupFolder: string,
  result: { durationMs: number; status: 'success' | 'error' | 'timeout'; errorSummary?: string },
): void {
  const entry = activeContainersMap.get(groupFolder);
  activeContainersMap.delete(groupFolder);

  recentRunsBuffer.push({
    groupFolder,
    groupName: entry?.groupName || groupFolder,
    startedAt: entry ? new Date(entry.startTime).toISOString() : new Date().toISOString(),
    durationMs: result.durationMs,
    status: result.status,
    errorSummary: result.errorSummary?.slice(0, 200),
  });
  if (recentRunsBuffer.length > MAX_RECENT_RUNS) recentRunsBuffer.shift();
}

export function trackContainerError(
  groupFolder: string,
  result: { durationMs: number; error: string; type: ContainerErrorSummary['type'] },
): void {
  const entry = activeContainersMap.get(groupFolder);
  activeContainersMap.delete(groupFolder);

  recentRunsBuffer.push({
    groupFolder,
    groupName: entry?.groupName || groupFolder,
    startedAt: entry ? new Date(entry.startTime).toISOString() : new Date().toISOString(),
    durationMs: result.durationMs,
    status: 'error',
    errorSummary: result.error.slice(0, 200),
  });
  if (recentRunsBuffer.length > MAX_RECENT_RUNS) recentRunsBuffer.shift();

  recentErrorsBuffer.push({
    groupFolder,
    timestamp: new Date().toISOString(),
    error: result.error.slice(0, 200),
    type: result.type,
  });
  if (recentErrorsBuffer.length > MAX_RECENT_ERRORS) recentErrorsBuffer.shift();
}

export function getActiveContainers(): ActiveContainer[] {
  const now = Date.now();
  return [...activeContainersMap.entries()].map(([folder, entry]) => ({
    groupFolder: folder,
    groupName: entry.groupName,
    pid: entry.pid,
    startedAt: new Date(entry.startTime).toISOString(),
    elapsedMs: now - entry.startTime,
    promptPreview: entry.promptPreview,
  }));
}

export function getRecentRuns(): RecentContainerRun[] {
  return [...recentRunsBuffer];
}

export function getRecentErrors(): ContainerErrorSummary[] {
  return [...recentErrorsBuffer];
}

export function killContainer(groupFolder: string): boolean {
  const entry = activeContainersMap.get(groupFolder);
  if (!entry) return false;
  try {
    process.kill(entry.pid, 'SIGKILL');
    activeContainersMap.delete(groupFolder);
    logger.info({ groupFolder, pid: entry.pid }, 'Container killed via debug command');
    return true;
  } catch (err) {
    logger.error({ groupFolder, pid: entry.pid, err }, 'Failed to kill container');
    return false;
  }
}

export function resetTracking(): void {
  activeContainersMap.clear();
  recentRunsBuffer.length = 0;
  recentErrorsBuffer.length = 0;
}

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function getHomeDir(): string {
  const home = process.env.HOME || os.homedir();
  if (!home) {
    throw new Error(
      'Unable to determine home directory: HOME environment variable is not set and os.homedir() returned empty',
    );
  }
  return home;
}

export interface ContainerInput {
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

export interface OrgMountContext {
  teamConfig?: TeamConfig;
  isAdmin?: boolean;
  allTeams?: TeamConfig[];
}

/**
 * Build volume mounts for org-mode credentials.
 * - Team container: mount team's own credentials at standard paths
 * - Admin container: mount ALL teams' credentials at namespaced paths
 */
export function getOrgVolumeMounts(ctx: OrgMountContext): VolumeMount[] {
  const mounts: VolumeMount[] = [];

  if (ctx.isAdmin && ctx.allTeams) {
    // Admin: mount each team's credentials at namespaced paths
    for (const team of ctx.allTeams) {
      if (team.credentials.gmail) {
        mounts.push({
          hostPath: team.credentials.gmail,
          containerPath: `/home/node/.gmail-mcp-${team.id}`,
          readonly: false,
        });
      }
      if (team.credentials.calendar) {
        mounts.push({
          hostPath: team.credentials.calendar,
          containerPath: `/home/node/.config/google-calendar-mcp-${team.id}`,
          readonly: false,
        });
      }
      if (team.credentials.drive) {
        mounts.push({
          hostPath: team.credentials.drive,
          containerPath: `/home/node/.config/google-drive-mcp-${team.id}`,
          readonly: false,
        });
      }
    }
  } else if (ctx.teamConfig) {
    // Team: mount own credentials at standard paths
    const creds = ctx.teamConfig.credentials;
    if (creds.gmail) {
      mounts.push({
        hostPath: creds.gmail,
        containerPath: '/home/node/.gmail-mcp',
        readonly: false,
      });
    }
    if (creds.calendar) {
      mounts.push({
        hostPath: creds.calendar,
        containerPath: '/home/node/.config/google-calendar-mcp',
        readonly: false,
      });
    }
    if (creds.drive) {
      mounts.push({
        hostPath: creds.drive,
        containerPath: '/home/node/.config/google-drive-mcp',
        readonly: false,
      });
    }
  }

  return mounts;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
  orgContext?: OrgMountContext,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const homeDir = getHomeDir();
  const projectRoot = process.cwd();

  if (isMain) {
    // Main gets the entire project root mounted
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: false,
    });

    // Main also gets its group folder as the working directory
    mounts.push({
      hostPath: path.join(GROUPS_DIR, group.folder),
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // Other groups only get their own folder
    mounts.push({
      hostPath: path.join(GROUPS_DIR, group.folder),
      containerPath: '/workspace/group',
      readonly: false,
    });

    // Global memory directory (read-only for non-main)
    // Apple Container only supports directory mounts, not file mounts
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Google credentials mounting:
  // - Org mode: use per-team or admin multi-mount from org config
  // - DM users: mount per-user credentials from their group folder
  // - Personal mode main: home-dir credentials (backward compatible)
  if (orgContext && (orgContext.teamConfig || orgContext.isAdmin)) {
    mounts.push(...getOrgVolumeMounts(orgContext));
  } else {
    // Per-group Google credentials (DMs and group chats alike)
    const credsBase = path.join(GROUPS_DIR, group.folder, '.credentials');
    let hasGroupGmail = false;
    let hasGroupCalendar = false;
    let hasGroupDrive = false;

    const gmailCredsDir = path.join(credsBase, 'gmail-mcp');
    if (fs.existsSync(gmailCredsDir)) {
      mounts.push({
        hostPath: gmailCredsDir,
        containerPath: '/home/node/.gmail-mcp',
        readonly: false,
      });
      hasGroupGmail = true;
    }

    const calendarCredsDir = path.join(credsBase, 'google-calendar-mcp');
    if (fs.existsSync(calendarCredsDir)) {
      mounts.push({
        hostPath: calendarCredsDir,
        containerPath: '/home/node/.config/google-calendar-mcp',
        readonly: false,
      });
      hasGroupCalendar = true;
    }

    const driveCredsDir = path.join(credsBase, 'google-drive-mcp');
    if (fs.existsSync(driveCredsDir)) {
      mounts.push({
        hostPath: driveCredsDir,
        containerPath: '/home/node/.config/google-drive-mcp',
        readonly: false,
      });
      hasGroupDrive = true;
    }

    // Main group: fall back to home-dir credentials for services without per-group creds
    if (isMain) {
      if (!hasGroupGmail) {
        const gmailDir = path.join(homeDir, '.gmail-mcp');
        if (fs.existsSync(gmailDir)) {
          mounts.push({
            hostPath: gmailDir,
            containerPath: '/home/node/.gmail-mcp',
            readonly: false,
          });
        }
      }

      if (!hasGroupCalendar) {
        const calendarDir = path.join(homeDir, '.config', 'google-calendar-mcp');
        if (fs.existsSync(calendarDir)) {
          mounts.push({
            hostPath: calendarDir,
            containerPath: '/home/node/.config/google-calendar-mcp',
            readonly: false,
          });
        }
      }

      if (!hasGroupDrive) {
        const gdriveDir = path.join(homeDir, '.config', 'google-drive-mcp');
        if (fs.existsSync(gdriveDir)) {
          mounts.push({
            hostPath: gdriveDir,
            containerPath: '/home/node/.config/google-drive-mcp',
            readonly: false,
          });
        }
      }
    }
  }

  // Per-group Claude sessions directory (isolated from other groups)
  // Each group gets their own .claude/ to prevent cross-group session access
  const groupSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.claude',
  );
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  mounts.push({
    hostPath: groupSessionsDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });

  // Per-group IPC namespace: each group gets its own IPC directory
  // This prevents cross-group privilege escalation via IPC
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Environment file directory (workaround for Apple Container -i env var bug)
  // Only expose specific auth variables needed by Claude Code, not the entire .env
  // Per-group env dirs allow model overrides (admin groups get Opus, others get Sonnet)
  const envDir = path.join(DATA_DIR, 'env', group.folder);
  fs.mkdirSync(envDir, { recursive: true });
  const envFile = path.join(projectRoot, '.env');
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf-8');
    const allowedVars = [
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'CLAUDE_MODEL',
      'CLAUDE_FALLBACK_MODEL',
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'OPENAI_BASE_URL',
      'FIGMA_ACCESS_TOKEN',
    ];
    const filteredLines = envContent.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      return allowedVars.some((v) => trimmed.startsWith(`${v}=`));
    });

    // Non-admin groups: override model to Haiku 4.5 (with extended thinking) and remove fallback
    // (fallback can't be the same as the main model — SDK rejects it)
    if (!isMain) {
      const nonAdminModel = process.env.CLAUDE_FALLBACK_MODEL || 'claude-haiku-4-5-20251001';
      const overriddenLines = filteredLines
        .filter((line) => !line.trim().startsWith('CLAUDE_MODEL=') && !line.trim().startsWith('CLAUDE_FALLBACK_MODEL='))
        .concat(`CLAUDE_MODEL=${nonAdminModel}`);
      filteredLines.length = 0;
      filteredLines.push(...overriddenLines);
    }

    if (filteredLines.length > 0) {
      fs.writeFileSync(
        path.join(envDir, 'env'),
        filteredLines.join('\n') + '\n',
      );
      mounts.push({
        hostPath: envDir,
        containerPath: '/workspace/env-dir',
        readonly: true,
      });
    }
  }

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

function buildContainerArgs(mounts: VolumeMount[], containerName: string): string[] {
  const args: string[] = ['run', '-i', '--rm', '-m', '4G', '--name', containerName];

  // Apple Container: --mount for readonly, -v for read-write
  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(
        '--mount',
        `type=bind,source=${mount.hostPath},target=${mount.containerPath},readonly`,
      );
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  orgContext?: OrgMountContext,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(group, input.isMain, orgContext);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `nanoclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  logger.debug(
    {
      group: group.name,
      containerName,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      group: group.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(GROUPS_DIR, group.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const container = spawn('container', containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Track active container for diagnostics
    if (container.pid) {
      trackContainerStart(group.folder, {
        pid: container.pid,
        groupName: group.name,
        promptPreview: input.prompt.slice(0, 100),
      });
    }

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    container.stdout.on('data', (data) => {
      if (stdoutTruncated) return;
      const chunk = data.toString();
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
      if (chunk.length > remaining) {
        stdout += chunk.slice(0, remaining);
        stdoutTruncated = true;
        logger.warn(
          { group: group.name, size: stdout.length },
          'Container stdout truncated due to size limit',
        );
      } else {
        stdout += chunk;
      }
    });

    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Container stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      logger.error({ group: group.name, containerName }, 'Container timeout, stopping gracefully');
      trackContainerError(group.folder, {
        durationMs: Date.now() - startTime,
        error: `Container timed out after ${group.containerConfig?.timeout || CONTAINER_TIMEOUT}ms`,
        type: 'timeout',
      });
      // Graceful stop: sends SIGTERM, waits, then SIGKILL — lets --rm fire
      exec(`container stop ${containerName}`, { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn({ group: group.name, containerName, err }, 'Graceful stop failed, force killing');
          container.kill('SIGKILL');
        }
      });
    }, group.containerConfig?.timeout || CONTAINER_TIMEOUT);

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `container-${ts}.log`);
        fs.writeFileSync(timeoutLog, [
          `=== Container Run Log (TIMEOUT) ===`,
          `Timestamp: ${new Date().toISOString()}`,
          `Group: ${group.name}`,
          `Container: ${containerName}`,
          `Duration: ${duration}ms`,
          `Exit Code: ${code}`,
        ].join('\n'));

        logger.error(
          { group: group.name, containerName, duration, code },
          'Container timed out',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${group.containerConfig?.timeout || CONTAINER_TIMEOUT}ms`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Container Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      if (isVerbose) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Container Args ===`,
          containerArgs.join(' '),
          ``,
          `=== Mounts ===`,
          mounts
            .map(
              (m) =>
                `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
            )
            .join('\n'),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
          `=== Mounts ===`,
          mounts
            .map((m) => `${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
            .join('\n'),
          ``,
        );

        if (code !== 0) {
          logLines.push(
            `=== Stderr (last 500 chars) ===`,
            stderr.slice(-500),
            ``,
          );
        }
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Container log written');

      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr: stderr.slice(-500),
            logFile,
          },
          'Container exited with error',
        );

        trackContainerError(group.folder, {
          durationMs: duration,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
          type: 'exit_code',
        });

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        trackContainerEnd(group.folder, {
          durationMs: duration,
          status: output.status === 'error' ? 'error' : 'success',
          errorSummary: output.error,
        });

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout: stdout.slice(-500),
            error: err,
          },
          'Failed to parse container output',
        );

        trackContainerError(group.folder, {
          durationMs: duration,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
          type: 'parse_error',
        });

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, containerName, error: err }, 'Container spawn error');
      trackContainerError(group.folder, {
        durationMs: Date.now() - startTime,
        error: `Container spawn error: ${err.message}`,
        type: 'spawn_error',
      });
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

/**
 * Write org context JSON for the container agent to read.
 * Admin sees all teams and capabilities; team sees only its own info.
 */
export function writeOrgContext(
  groupFolder: string,
  orgContext: {
    orgName: string;
    isAdmin: boolean;
    teamId?: string;
    teamName?: string;
    teamEmail?: string;
    allTeams?: Array<{ id: string; name: string; email?: string }>;
  },
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  let context: Record<string, unknown>;

  if (orgContext.isAdmin) {
    context = {
      organization: orgContext.orgName,
      role: 'admin',
      teams: orgContext.allTeams || [],
      capabilities: [
        'Read/send email as any team (use mcp__gmail-{teamId}__* tools)',
        'Search Drive across all teams (use mcp__gdrive-{teamId}__* tools)',
        'Manage calendars for all teams (use mcp__google-calendar-{teamId}__* tools)',
      ],
    };
  } else {
    context = {
      organization: orgContext.orgName,
      role: 'team',
      team: {
        id: orgContext.teamId,
        name: orgContext.teamName,
        email: orgContext.teamEmail,
      },
      capabilities: [
        `Read/send email for ${orgContext.teamEmail || 'this team'} (use mcp__gmail__* tools)`,
        'Access team Drive folders (use mcp__gdrive__* tools)',
        'Manage team calendar (use mcp__google-calendar__* tools)',
      ],
    };
  }

  const contextFile = path.join(groupIpcDir, 'org_context.json');
  fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all groups; others see nothing (they can't activate groups)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
