import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

vi.mock('child_process');
vi.mock('fs');
vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn().mockReturnValue([]),
}));
vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanoclaw-agent:test',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 5000,
  DATA_DIR: '/mock/data',
  GROUPS_DIR: '/mock/groups',
}));
vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { RegisteredGroup } from './types.js';
import type { ContainerInput } from './container-runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProcess() {
  const proc = new EventEmitter() as any;
  proc.stdin = new Writable({
    write: (_chunk: any, _enc: string, cb: () => void) => cb(),
  });
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.kill = vi.fn();
  return proc;
}

function makeGroup(overrides: Partial<RegisteredGroup> = {}): RegisteredGroup {
  return {
    name: 'test-group',
    folder: 'test-group',
    trigger: '@Andy',
    added_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<ContainerInput> = {}): ContainerInput {
  return {
    prompt: 'Hello',
    groupFolder: 'test-group',
    chatJid: '123@g.us',
    isMain: false,
    ...overrides,
  };
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('container-runner', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function importModule() {
    // Re-import fs so mocks are fresh per test via resetModules
    const fs = await import('fs');
    const { spawn } = await import('child_process');
    const mod = await import('./container-runner.js');
    return { mod, fs, spawn };
  }

  function setupFs(fs: typeof import('fs'), globalDirExists = false) {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p as string;
      // The .env file should not exist by default (simplifies tests)
      if (pathStr.endsWith('.env')) return false;
      // Global dir check for non-main groups
      if (pathStr === '/mock/groups/global') return globalDirExists;
      return false;
    });
  }

  // ---------------------------------------------------------------------------
  // runContainerAgent
  // ---------------------------------------------------------------------------
  describe('runContainerAgent', () => {
    it('spawns "container" process with correct args', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput({ isMain: false });

      const promise = mod.runContainerAgent(group, input);

      // Simulate successful output
      process.nextTick(() => {
        const output = JSON.stringify({
          status: 'success',
          result: 'hi',
          newSessionId: 's1',
        });
        mockProc.stdout.push(
          `${OUTPUT_START_MARKER}\n${output}\n${OUTPUT_END_MARKER}\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(spawn).toHaveBeenCalledWith(
        'container',
        expect.arrayContaining(['run', '-i', '--rm']),
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      );

      // Should end with the container image
      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      expect(args[args.length - 1]).toBe('nanoclaw-agent:test');
    });

    it('main group mounts include project root (/workspace/project) and group dir (/workspace/group)', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup({ folder: 'main' });
      const input = makeInput({ isMain: true, groupFolder: 'main' });

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        const output = JSON.stringify({ status: 'success', result: 'ok' });
        mockProc.stdout.push(
          `${OUTPUT_START_MARKER}\n${output}\n${OUTPUT_END_MARKER}\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      await promise;

      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      const argsStr = args.join(' ');

      // Main group should have /workspace/project mount (project root via -v)
      expect(argsStr).toContain('/workspace/project');
      // Main group should have /workspace/group mount
      expect(argsStr).toContain('/workspace/group');
    });

    it('non-main group mounts include only group dir, no project root', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup({ folder: 'other-group' });
      const input = makeInput({ isMain: false, groupFolder: 'other-group' });

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        const output = JSON.stringify({ status: 'success', result: 'ok' });
        mockProc.stdout.push(
          `${OUTPUT_START_MARKER}\n${output}\n${OUTPUT_END_MARKER}\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      await promise;

      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      const argsStr = args.join(' ');

      // Non-main should NOT have /workspace/project
      expect(argsStr).not.toContain('/workspace/project');
      // Should have /workspace/group
      expect(argsStr).toContain('/workspace/group');
    });

    it('non-main group mounts include global memory dir (readonly) when it exists', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs, true); // globalDirExists = true

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup({ folder: 'other-group' });
      const input = makeInput({ isMain: false, groupFolder: 'other-group' });

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        const output = JSON.stringify({ status: 'success', result: 'ok' });
        mockProc.stdout.push(
          `${OUTPUT_START_MARKER}\n${output}\n${OUTPUT_END_MARKER}\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      await promise;

      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      const argsStr = args.join(' ');

      // Should have readonly mount for /workspace/global
      expect(argsStr).toContain('/workspace/global');
      expect(argsStr).toContain('readonly');
    });

    it('writes container input to stdin as JSON', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      const writtenChunks: string[] = [];
      mockProc.stdin = new Writable({
        write(chunk: any, _enc: string, cb: () => void) {
          writtenChunks.push(chunk.toString());
          cb();
        },
      });
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput({ prompt: 'test prompt' });

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        const output = JSON.stringify({ status: 'success', result: 'ok' });
        mockProc.stdout.push(
          `${OUTPUT_START_MARKER}\n${output}\n${OUTPUT_END_MARKER}\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      await promise;

      const written = writtenChunks.join('');
      const parsed = JSON.parse(written);
      expect(parsed.prompt).toBe('test prompt');
      expect(parsed.chatJid).toBe('123@g.us');
    });

    it('parses output between sentinel markers', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput();

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        const payload = {
          status: 'success',
          result: 'parsed correctly',
          newSessionId: 'sess-1',
        };
        // Include noise before and after the markers
        mockProc.stdout.push(
          `some debug noise\n${OUTPUT_START_MARKER}\n${JSON.stringify(payload)}\n${OUTPUT_END_MARKER}\nmore noise\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe('success');
      expect(result.result).toBe('parsed correctly');
      expect(result.newSessionId).toBe('sess-1');
    });

    it('falls back to last line when no sentinel markers present', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput();

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        const payload = { status: 'success', result: 'fallback works' };
        // No sentinel markers, just lines of output
        mockProc.stdout.push(
          `debug line 1\ndebug line 2\n${JSON.stringify(payload)}\n`,
        );
        mockProc.stdout.push(null);
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe('success');
      expect(result.result).toBe('fallback works');
    });

    it('returns error on non-zero exit code with stderr excerpt', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput();

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        mockProc.stderr.push('something went wrong in the container\n');
        mockProc.stderr.push(null);
        mockProc.stdout.push(null);
        mockProc.emit('close', 1);
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe('error');
      expect(result.result).toBeNull();
      expect(result.error).toContain('Container exited with code 1');
      expect(result.error).toContain('something went wrong');
    });

    it('returns error on container timeout and kills process', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput();

      const promise = mod.runContainerAgent(group, input);

      // Advance past the CONTAINER_TIMEOUT (5000ms in our mock config)
      await vi.advanceTimersByTimeAsync(6000);

      const result = await promise;

      expect(result.status).toBe('error');
      expect(result.result).toBeNull();
      expect(result.error).toContain('timed out');
      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('returns error on spawn error', async () => {
      const { mod, fs, spawn } = await importModule();
      setupFs(fs);

      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const group = makeGroup();
      const input = makeInput();

      const promise = mod.runContainerAgent(group, input);

      process.nextTick(() => {
        mockProc.emit('error', new Error('ENOENT: container binary not found'));
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe('error');
      expect(result.result).toBeNull();
      expect(result.error).toContain('Container spawn error');
      expect(result.error).toContain('container binary not found');
    });
  });

  // ---------------------------------------------------------------------------
  // writeTasksSnapshot
  // ---------------------------------------------------------------------------
  describe('writeTasksSnapshot', () => {
    const allTasks = [
      {
        id: '1',
        groupFolder: 'group-a',
        prompt: 'task a',
        schedule_type: 'cron',
        schedule_value: '0 9 * * *',
        status: 'active',
        next_run: '2025-01-02T09:00:00Z',
      },
      {
        id: '2',
        groupFolder: 'group-b',
        prompt: 'task b',
        schedule_type: 'interval',
        schedule_value: '3600000',
        status: 'active',
        next_run: '2025-01-01T01:00:00Z',
      },
      {
        id: '3',
        groupFolder: 'group-a',
        prompt: 'task a2',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00Z',
        status: 'active',
        next_run: null,
      },
    ];

    it('main group sees all tasks', async () => {
      const { mod, fs } = await importModule();
      setupFs(fs);

      mod.writeTasksSnapshot('main', true, allTasks);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/data/ipc/main/current_tasks.json',
        JSON.stringify(allTasks, null, 2),
      );
    });

    it('non-main group only sees own tasks', async () => {
      const { mod, fs } = await importModule();
      setupFs(fs);

      mod.writeTasksSnapshot('group-a', false, allTasks);

      const expected = allTasks.filter((t) => t.groupFolder === 'group-a');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/data/ipc/group-a/current_tasks.json',
        JSON.stringify(expected, null, 2),
      );
    });

    it('creates IPC directory if it does not exist', async () => {
      const { mod, fs } = await importModule();
      setupFs(fs);

      mod.writeTasksSnapshot('new-group', false, []);

      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/data/ipc/new-group', {
        recursive: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // writeGroupsSnapshot
  // ---------------------------------------------------------------------------
  describe('writeGroupsSnapshot', () => {
    const allGroups = [
      {
        jid: '111@g.us',
        name: 'Group One',
        lastActivity: '2025-01-01T00:00:00Z',
        isRegistered: true,
      },
      {
        jid: '222@g.us',
        name: 'Group Two',
        lastActivity: '2025-01-01T01:00:00Z',
        isRegistered: false,
      },
    ];
    const registeredJids = new Set(['111@g.us']);

    it('main group sees all groups, non-main sees empty array', async () => {
      const { mod, fs } = await importModule();
      setupFs(fs);

      // Main group: sees all groups
      mod.writeGroupsSnapshot('main', true, allGroups, registeredJids);

      const mainCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) =>
          (call[0] as string).includes('main/available_groups.json'),
        );
      expect(mainCall).toBeDefined();
      const mainData = JSON.parse(mainCall![1] as string);
      expect(mainData.groups).toHaveLength(2);
      expect(mainData.groups[0].name).toBe('Group One');
      expect(mainData.groups[1].name).toBe('Group Two');
      expect(mainData).toHaveProperty('lastSync');

      vi.mocked(fs.writeFileSync).mockClear();

      // Non-main group: sees empty array
      mod.writeGroupsSnapshot('other-group', false, allGroups, registeredJids);

      const nonMainCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) =>
          (call[0] as string).includes('other-group/available_groups.json'),
        );
      expect(nonMainCall).toBeDefined();
      const nonMainData = JSON.parse(nonMainCall![1] as string);
      expect(nonMainData.groups).toEqual([]);
      expect(nonMainData).toHaveProperty('lastSync');
    });
  });
});
