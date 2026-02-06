import { vi, type Mock } from 'vitest';

// ── Static mocks (hoisted by Vitest) ──────────────────────────────────────────

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('./db.js', () => ({
  getAllTasks: vi.fn(),
  getDueTasks: vi.fn(),
  getTaskById: vi.fn(),
  logTaskRun: vi.fn(),
  updateTaskAfterRun: vi.fn(),
}));

vi.mock('./container-runner.js', () => ({
  runContainerAgent: vi.fn(),
  writeTasksSnapshot: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('./config.js', () => ({
  GROUPS_DIR: '/mock/groups',
  DATA_DIR: '/mock/data',
  MAIN_GROUP_FOLDER: 'main',
  SCHEDULER_POLL_INTERVAL: 60000,
  TIMEZONE: 'UTC',
}));

// ── Types ─────────────────────────────────────────────────────────────────────

import type { SchedulerDependencies } from './task-scheduler.js';
import type { RegisteredGroup, ScheduledTask } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'task-1',
    group_folder: 'test-group',
    chat_jid: '123@g.us',
    prompt: 'Do something',
    schedule_type: 'cron',
    schedule_value: '*/5 * * * *',
    context_mode: 'isolated',
    next_run: '2024-01-01T00:00:00.000Z',
    last_run: null,
    last_result: null,
    status: 'active',
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGroup(overrides: Partial<RegisteredGroup> = {}): RegisteredGroup {
  return {
    name: 'Test Group',
    folder: 'test-group',
    trigger: '@bot',
    added_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<SchedulerDependencies> = {},
): SchedulerDependencies {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    registeredGroups: vi.fn().mockReturnValue({
      '123@g.us': makeGroup(),
    }),
    getSessions: vi.fn().mockReturnValue({}),
    ...overrides,
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('task-scheduler', () => {
  let startSchedulerLoop: typeof import('./task-scheduler.js').startSchedulerLoop;
  let getDueTasks: Mock;
  let getTaskById: Mock;
  let getAllTasks: Mock;
  let logTaskRun: Mock;
  let updateTaskAfterRun: Mock;
  let runContainerAgent: Mock;
  let writeTasksSnapshot: Mock;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));

    // Reset modules to clear schedulerRunning state
    vi.resetModules();

    // Re-import after resetModules to get fresh module instances
    const scheduler = await import('./task-scheduler.js');
    startSchedulerLoop = scheduler.startSchedulerLoop;

    const db = await import('./db.js');
    getDueTasks = db.getDueTasks as Mock;
    getTaskById = db.getTaskById as Mock;
    getAllTasks = db.getAllTasks as Mock;
    logTaskRun = db.logTaskRun as Mock;
    updateTaskAfterRun = db.updateTaskAfterRun as Mock;

    const containerRunner = await import('./container-runner.js');
    runContainerAgent = containerRunner.runContainerAgent as Mock;
    writeTasksSnapshot = containerRunner.writeTasksSnapshot as Mock;

    // Sensible defaults
    getDueTasks.mockReturnValue([]);
    getAllTasks.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it('prevents duplicate scheduler loop starts', async () => {
    const deps = makeDeps();
    getDueTasks.mockReturnValue([]);

    startSchedulerLoop(deps);
    // Let the first loop iteration run
    await vi.advanceTimersByTimeAsync(0);

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    // getDueTasks should only have been called once (from the first loop tick)
    expect(getDueTasks).toHaveBeenCalledTimes(1);
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it('finds and processes due tasks', async () => {
    const task = makeTask();
    const group = makeGroup();
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'Task done',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(getDueTasks).toHaveBeenCalledTimes(1);
    expect(getTaskById).toHaveBeenCalledWith('task-1');
    expect(runContainerAgent).toHaveBeenCalledWith(
      group,
      expect.objectContaining({
        prompt: 'Do something',
        groupFolder: 'test-group',
        chatJid: '123@g.us',
        isScheduledTask: true,
      }),
    );
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it('skips tasks that are no longer active on re-check', async () => {
    const task = makeTask();
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    // Task was paused between getDueTasks and getTaskById
    getTaskById.mockReturnValue({ ...task, status: 'paused' });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(getTaskById).toHaveBeenCalledWith('task-1');
    expect(runContainerAgent).not.toHaveBeenCalled();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────

  it('logs error when group not found for a task', async () => {
    const task = makeTask({ group_folder: 'nonexistent' });
    const deps = makeDeps({
      registeredGroups: vi.fn().mockReturnValue({}),
    });

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([]);

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-1',
        status: 'error',
        result: null,
        error: 'Group not found: nonexistent',
      }),
    );
    // Should not call runContainerAgent when group is missing
    expect(runContainerAgent).not.toHaveBeenCalled();
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────

  it('calls runContainerAgent with correct group and input', async () => {
    const task = makeTask({
      group_folder: 'test-group',
      chat_jid: '456@g.us',
      prompt: 'Generate report',
    });
    const group = makeGroup({ folder: 'test-group', name: 'Test Group' });
    const deps = makeDeps({
      registeredGroups: vi.fn().mockReturnValue({ '456@g.us': group }),
    });

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'Report generated',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(runContainerAgent).toHaveBeenCalledWith(group, {
      prompt: 'Generate report',
      sessionId: undefined,
      groupFolder: 'test-group',
      chatJid: '456@g.us',
      isMain: false,
      isScheduledTask: true,
    });
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────

  it('handles container error result', async () => {
    const task = makeTask();
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'error',
      result: null,
      error: 'Container crashed',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-1',
        status: 'error',
        error: 'Container crashed',
        result: null,
      }),
    );
    expect(updateTaskAfterRun).toHaveBeenCalledWith(
      'task-1',
      expect.any(String), // nextRun (cron-computed)
      'Error: Container crashed',
    );
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────

  it('handles container success result', async () => {
    const task = makeTask();
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'All done successfully',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-1',
        status: 'success',
        result: 'All done successfully',
        error: null,
      }),
    );
    expect(updateTaskAfterRun).toHaveBeenCalledWith(
      'task-1',
      expect.any(String), // nextRun (cron-computed)
      'All done successfully',
    );
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────

  it('computes next_run for cron tasks', async () => {
    const task = makeTask({
      schedule_type: 'cron',
      schedule_value: '0 9 * * *', // Every day at 09:00 UTC
    });
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'Done',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    const nextRunArg = updateTaskAfterRun.mock.calls[0][1] as string;
    expect(nextRunArg).not.toBeNull();
    // Current fake time is 2024-06-15T12:00:00Z, next 09:00 UTC is 2024-06-16T09:00:00Z
    const nextRunDate = new Date(nextRunArg);
    expect(nextRunDate.getUTCHours()).toBe(9);
    expect(nextRunDate.getUTCMinutes()).toBe(0);
    expect(nextRunDate > new Date('2024-06-15T12:00:00.000Z')).toBe(true);
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────────

  it('computes next_run for interval tasks', async () => {
    const intervalMs = 300000; // 5 minutes
    const task = makeTask({
      schedule_type: 'interval',
      schedule_value: String(intervalMs),
    });
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'Done',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    const nextRunArg = updateTaskAfterRun.mock.calls[0][1] as string;
    expect(nextRunArg).not.toBeNull();
    const nextRunDate = new Date(nextRunArg);
    // Should be ~5 minutes from the current fake time
    const expectedTime =
      new Date('2024-06-15T12:00:00.000Z').getTime() + intervalMs;
    // Allow small tolerance for execution time within the fake timer
    expect(Math.abs(nextRunDate.getTime() - expectedTime)).toBeLessThan(1000);
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────────

  it('sets next_run to null for once tasks', async () => {
    const task = makeTask({
      schedule_type: 'once',
      schedule_value: '2024-06-15T12:00:00.000Z',
    });
    const deps = makeDeps();

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'One-time task done',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(updateTaskAfterRun).toHaveBeenCalledWith(
      'task-1',
      null, // no next_run for once tasks
      'One-time task done',
    );
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────────

  it('uses group session when context_mode is group', async () => {
    const task = makeTask({ context_mode: 'group' });
    const deps = makeDeps({
      getSessions: vi.fn().mockReturnValue({
        'test-group': 'session-abc-123',
      }),
    });

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'Done with session',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(runContainerAgent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        sessionId: 'session-abc-123',
      }),
    );
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────────

  it('creates fresh session when context_mode is isolated', async () => {
    const task = makeTask({ context_mode: 'isolated' });
    const deps = makeDeps({
      getSessions: vi.fn().mockReturnValue({
        'test-group': 'session-abc-123',
      }),
    });

    getDueTasks.mockReturnValue([task]);
    getTaskById.mockReturnValue(task);
    getAllTasks.mockReturnValue([task]);
    runContainerAgent.mockResolvedValue({
      status: 'success',
      result: 'Done isolated',
    });

    startSchedulerLoop(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(runContainerAgent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        sessionId: undefined,
      }),
    );
  });
});
