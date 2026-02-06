import { proto } from '@whiskeysockets/baileys';

import {
  initDatabase,
  storeChatMetadata,
  updateChatName,
  getAllChats,
  getLastGroupSync,
  setLastGroupSync,
  storeMessage,
  getNewMessages,
  getMessagesSince,
  createTask,
  getTaskById,
  getTasksForGroup,
  getAllTasks,
  updateTask,
  deleteTask,
  getDueTasks,
  updateTaskAfterRun,
  logTaskRun,
  getTaskRunLogs,
} from './db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Baileys message object for storeMessage. */
function makeMsg(
  overrides: {
    id?: string;
    participant?: string;
    remoteJid?: string;
    conversation?: string;
    extendedText?: string;
    mentionedJid?: string[];
    timestamp?: number;
    noKey?: boolean;
  } = {},
): proto.IWebMessageInfo {
  if (overrides.noKey) {
    return {
      key: undefined as unknown as proto.IMessageKey,
    } as proto.IWebMessageInfo;
  }

  const msg: proto.IWebMessageInfo = {
    key: {
      id: overrides.id ?? 'msg-001',
      participant: overrides.participant ?? 'user@s.whatsapp.net',
      remoteJid: overrides.remoteJid ?? 'group@g.us',
    },
    messageTimestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    message: {},
  };

  if (overrides.extendedText) {
    msg.message = {
      extendedTextMessage: {
        text: overrides.extendedText,
        contextInfo: overrides.mentionedJid
          ? { mentionedJid: overrides.mentionedJid }
          : undefined,
      },
    };
  } else {
    msg.message = {
      conversation: overrides.conversation ?? 'Hello world',
    };
  }

  return msg;
}

/** Build a scheduled task with sensible defaults. */
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides.id as string) ?? 'task-001',
    group_folder: (overrides.group_folder as string) ?? 'test-group',
    chat_jid: (overrides.chat_jid as string) ?? 'group@g.us',
    prompt: (overrides.prompt as string) ?? 'Say hello',
    schedule_type:
      (overrides.schedule_type as 'cron' | 'interval' | 'once') ?? 'cron',
    schedule_value: (overrides.schedule_value as string) ?? '0 9 * * *',
    context_mode:
      (overrides.context_mode as 'group' | 'isolated') ?? 'isolated',
    next_run:
      overrides.next_run !== undefined
        ? (overrides.next_run as string | null)
        : new Date().toISOString(),
    status: (overrides.status as 'active' | 'paused' | 'completed') ?? 'active',
    created_at: (overrides.created_at as string) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  initDatabase(':memory:');
});

// -- initDatabase -----------------------------------------------------------

describe('initDatabase', () => {
  it('creates all tables (chats, messages, scheduled_tasks, task_run_logs)', () => {
    // If tables didn't exist the following operations would throw
    storeChatMetadata('test@g.us', new Date().toISOString(), 'Test');
    storeMessage(makeMsg(), 'test@g.us', false);
    createTask(makeTask());
    logTaskRun({
      task_id: 'task-001',
      run_at: new Date().toISOString(),
      duration_ms: 100,
      status: 'success',
      result: 'ok',
      error: null,
    });
  });

  it('is idempotent (can be called twice without error)', () => {
    expect(() => initDatabase(':memory:')).not.toThrow();
    // The second call replaces the in-memory DB; basic ops should still work
    storeChatMetadata('x@g.us', new Date().toISOString(), 'X');
    expect(getAllChats()).toHaveLength(1);
  });
});

// -- storeChatMetadata ------------------------------------------------------

describe('storeChatMetadata', () => {
  it('inserts new chat with name', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z', 'My Group');

    const chats = getAllChats();
    expect(chats).toHaveLength(1);
    expect(chats[0]).toEqual({
      jid: 'group@g.us',
      name: 'My Group',
      last_message_time: '2025-01-01T00:00:00.000Z',
    });
  });

  it('updates timestamp to max on conflict', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z', 'Group');
    // Insert an older timestamp — should NOT overwrite
    storeChatMetadata('group@g.us', '2024-06-01T00:00:00.000Z', 'Group');

    const chats = getAllChats();
    expect(chats[0].last_message_time).toBe('2025-01-01T00:00:00.000Z');

    // Insert a newer timestamp — SHOULD overwrite
    storeChatMetadata('group@g.us', '2025-06-01T00:00:00.000Z', 'Group');
    const updated = getAllChats();
    expect(updated[0].last_message_time).toBe('2025-06-01T00:00:00.000Z');
  });

  it('without name uses jid as name', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z');

    const chats = getAllChats();
    expect(chats[0].name).toBe('group@g.us');
  });
});

// -- updateChatName ---------------------------------------------------------

describe('updateChatName', () => {
  it('updates name without changing existing timestamp', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z', 'Old Name');

    updateChatName('group@g.us', 'New Name');

    const chats = getAllChats();
    expect(chats[0].name).toBe('New Name');
    expect(chats[0].last_message_time).toBe('2025-01-01T00:00:00.000Z');
  });
});

// -- getAllChats -------------------------------------------------------------

describe('getAllChats', () => {
  it('returns chats ordered by most recent', () => {
    storeChatMetadata('old@g.us', '2024-01-01T00:00:00.000Z', 'Old');
    storeChatMetadata('new@g.us', '2025-06-01T00:00:00.000Z', 'New');
    storeChatMetadata('mid@g.us', '2025-03-01T00:00:00.000Z', 'Mid');

    const chats = getAllChats();
    expect(chats.map((c) => c.name)).toEqual(['New', 'Mid', 'Old']);
  });
});

// -- getLastGroupSync / setLastGroupSync ------------------------------------

describe('group sync', () => {
  it('getLastGroupSync returns null when no sync recorded', () => {
    expect(getLastGroupSync()).toBeNull();
  });

  it('setLastGroupSync records sync timestamp', () => {
    setLastGroupSync();

    const ts = getLastGroupSync();
    expect(ts).not.toBeNull();
    // Verify it's a valid ISO timestamp (recent)
    const parsed = new Date(ts!);
    expect(parsed.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

// -- storeMessage -----------------------------------------------------------

describe('storeMessage', () => {
  it('stores message with all fields', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z', 'Group');

    const ts = Math.floor(
      new Date('2025-01-15T12:00:00.000Z').getTime() / 1000,
    );
    const msg = makeMsg({
      id: 'msg-100',
      participant: 'alice@s.whatsapp.net',
      extendedText: 'Hello @bob',
      mentionedJid: ['bob@s.whatsapp.net'],
      timestamp: ts,
    });

    storeMessage(msg, 'group@g.us', false, 'Alice');

    const messages = getMessagesSince(
      'group@g.us',
      '2025-01-01T00:00:00.000Z',
      '__none__',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'msg-100',
      chat_jid: 'group@g.us',
      sender: 'alice@s.whatsapp.net',
      sender_name: 'Alice',
      content: 'Hello @bob',
    });
    expect(JSON.parse(messages[0].mentions!)).toEqual(['bob@s.whatsapp.net']);
  });

  it('ignores messages without key (returns early)', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z', 'Group');
    const msg = makeMsg({ noKey: true });

    // Should not throw and should not insert anything
    storeMessage(msg, 'group@g.us', false);

    const messages = getMessagesSince(
      'group@g.us',
      '2000-01-01T00:00:00.000Z',
      '__none__',
    );
    expect(messages).toHaveLength(0);
  });
});

// -- getNewMessages ---------------------------------------------------------

describe('getNewMessages', () => {
  beforeEach(() => {
    storeChatMetadata('group1@g.us', '2025-01-01T00:00:00.000Z', 'G1');
    storeChatMetadata('group2@g.us', '2025-01-01T00:00:00.000Z', 'G2');

    const ts1 = Math.floor(
      new Date('2025-01-10T10:00:00.000Z').getTime() / 1000,
    );
    const ts2 = Math.floor(
      new Date('2025-01-10T11:00:00.000Z').getTime() / 1000,
    );
    const ts3 = Math.floor(
      new Date('2025-01-10T12:00:00.000Z').getTime() / 1000,
    );

    storeMessage(
      makeMsg({ id: 'm1', conversation: 'user msg', timestamp: ts1 }),
      'group1@g.us',
      false,
      'User',
    );
    storeMessage(
      makeMsg({ id: 'm2', conversation: 'BOT: response', timestamp: ts2 }),
      'group1@g.us',
      true,
      'Bot',
    );
    storeMessage(
      makeMsg({ id: 'm3', conversation: 'another user msg', timestamp: ts3 }),
      'group2@g.us',
      false,
      'User2',
    );
  });

  it('returns messages after timestamp, excludes bot messages', () => {
    const { messages, newTimestamp } = getNewMessages(
      ['group1@g.us', 'group2@g.us'],
      '2025-01-01T00:00:00.000Z',
      'BOT',
    );

    // "BOT: response" should be excluded
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.content)).toEqual([
      'user msg',
      'another user msg',
    ]);
    // newTimestamp should be the latest
    expect(newTimestamp).toBe(messages[messages.length - 1].timestamp);
  });

  it('returns empty when no JIDs provided', () => {
    const { messages, newTimestamp } = getNewMessages(
      [],
      '2025-01-01T00:00:00.000Z',
      'BOT',
    );

    expect(messages).toEqual([]);
    expect(newTimestamp).toBe('2025-01-01T00:00:00.000Z');
  });
});

// -- getMessagesSince -------------------------------------------------------

describe('getMessagesSince', () => {
  it('returns messages for specific chat', () => {
    storeChatMetadata('group@g.us', '2025-01-01T00:00:00.000Z', 'Group');

    const ts1 = Math.floor(
      new Date('2025-01-10T10:00:00.000Z').getTime() / 1000,
    );
    const ts2 = Math.floor(
      new Date('2025-01-10T11:00:00.000Z').getTime() / 1000,
    );

    storeMessage(
      makeMsg({ id: 'm1', conversation: 'hello', timestamp: ts1 }),
      'group@g.us',
      false,
      'Alice',
    );
    storeMessage(
      makeMsg({ id: 'm2', conversation: 'BOT: reply', timestamp: ts2 }),
      'group@g.us',
      true,
      'Bot',
    );

    const messages = getMessagesSince(
      'group@g.us',
      '2025-01-01T00:00:00.000Z',
      'BOT',
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('hello');
  });
});

// -- Task CRUD --------------------------------------------------------------

describe('task CRUD', () => {
  it('createTask inserts task with all fields', () => {
    const task = makeTask({ id: 'task-abc' });
    createTask(task);

    const retrieved = getTaskById('task-abc');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('task-abc');
    expect(retrieved!.group_folder).toBe('test-group');
    expect(retrieved!.prompt).toBe('Say hello');
    expect(retrieved!.schedule_type).toBe('cron');
    expect(retrieved!.context_mode).toBe('isolated');
    expect(retrieved!.status).toBe('active');
  });

  it('getTaskById returns undefined for non-existent task', () => {
    expect(getTaskById('nonexistent')).toBeUndefined();
  });

  it('getTasksForGroup returns tasks for specific group', () => {
    createTask(makeTask({ id: 't1', group_folder: 'group-a' }));
    createTask(makeTask({ id: 't2', group_folder: 'group-b' }));
    createTask(makeTask({ id: 't3', group_folder: 'group-a' }));

    const tasks = getTasksForGroup('group-a');
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.group_folder === 'group-a')).toBe(true);
  });

  it('getAllTasks returns all tasks ordered by creation', () => {
    createTask(makeTask({ id: 't1', created_at: '2025-01-01T00:00:00.000Z' }));
    createTask(makeTask({ id: 't2', created_at: '2025-03-01T00:00:00.000Z' }));
    createTask(makeTask({ id: 't3', created_at: '2025-02-01T00:00:00.000Z' }));

    const tasks = getAllTasks();
    expect(tasks).toHaveLength(3);
    // ORDER BY created_at DESC
    expect(tasks.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
  });

  it('updateTask updates only specified fields', () => {
    createTask(
      makeTask({ id: 'task-u', prompt: 'original', status: 'active' }),
    );

    updateTask('task-u', { prompt: 'updated prompt' });

    const task = getTaskById('task-u');
    expect(task!.prompt).toBe('updated prompt');
    expect(task!.status).toBe('active'); // unchanged
  });

  it('updateTask does nothing when no fields provided', () => {
    createTask(makeTask({ id: 'task-noop', prompt: 'unchanged' }));

    updateTask('task-noop', {});

    const task = getTaskById('task-noop');
    expect(task!.prompt).toBe('unchanged');
  });

  it('deleteTask removes task and its run logs', () => {
    createTask(makeTask({ id: 'task-del' }));
    logTaskRun({
      task_id: 'task-del',
      run_at: new Date().toISOString(),
      duration_ms: 50,
      status: 'success',
      result: 'done',
      error: null,
    });

    expect(getTaskById('task-del')).toBeDefined();
    expect(getTaskRunLogs('task-del')).toHaveLength(1);

    deleteTask('task-del');

    expect(getTaskById('task-del')).toBeUndefined();
    expect(getTaskRunLogs('task-del')).toHaveLength(0);
  });
});

// -- getDueTasks ------------------------------------------------------------

describe('getDueTasks', () => {
  it('returns active tasks with next_run <= now', () => {
    const pastTime = new Date(Date.now() - 60000).toISOString();
    const futureTime = new Date(Date.now() + 3600000).toISOString();

    createTask(makeTask({ id: 'due', next_run: pastTime, status: 'active' }));
    createTask(
      makeTask({ id: 'future', next_run: futureTime, status: 'active' }),
    );
    createTask(
      makeTask({ id: 'paused', next_run: pastTime, status: 'paused' }),
    );
    createTask(makeTask({ id: 'no-run', next_run: null, status: 'active' }));

    const dueTasks = getDueTasks();
    expect(dueTasks).toHaveLength(1);
    expect(dueTasks[0].id).toBe('due');
  });
});

// -- updateTaskAfterRun -----------------------------------------------------

describe('updateTaskAfterRun', () => {
  it('sets status to completed when nextRun is null', () => {
    createTask(makeTask({ id: 'once-task', status: 'active' }));

    updateTaskAfterRun('once-task', null, 'Task finished');

    const task = getTaskById('once-task');
    expect(task!.status).toBe('completed');
    expect(task!.next_run).toBeNull();
    expect(task!.last_result).toBe('Task finished');
    expect(task!.last_run).not.toBeNull();
  });
});

// -- logTaskRun / getTaskRunLogs --------------------------------------------

describe('task run logs', () => {
  it('logTaskRun inserts and getTaskRunLogs retrieves in desc order', () => {
    createTask(makeTask({ id: 'task-log' }));

    logTaskRun({
      task_id: 'task-log',
      run_at: '2025-01-01T00:00:00.000Z',
      duration_ms: 100,
      status: 'success',
      result: 'first',
      error: null,
    });
    logTaskRun({
      task_id: 'task-log',
      run_at: '2025-01-02T00:00:00.000Z',
      duration_ms: 200,
      status: 'error',
      result: null,
      error: 'boom',
    });

    const logs = getTaskRunLogs('task-log');
    expect(logs).toHaveLength(2);
    // DESC order: newest first
    expect(logs[0].run_at).toBe('2025-01-02T00:00:00.000Z');
    expect(logs[0].status).toBe('error');
    expect(logs[0].error).toBe('boom');
    expect(logs[1].run_at).toBe('2025-01-01T00:00:00.000Z');
    expect(logs[1].status).toBe('success');
    expect(logs[1].result).toBe('first');
  });

  it('getTaskRunLogs respects limit parameter', () => {
    createTask(makeTask({ id: 'task-lim' }));

    for (let i = 0; i < 5; i++) {
      logTaskRun({
        task_id: 'task-lim',
        run_at: `2025-01-0${i + 1}T00:00:00.000Z`,
        duration_ms: 100,
        status: 'success',
        result: `run-${i}`,
        error: null,
      });
    }

    const logs = getTaskRunLogs('task-lim', 3);
    expect(logs).toHaveLength(3);
  });
});
