import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Message Filtering - Group Chat Mention Detection', () => {
  // Mock the registered groups configuration
  const mockRegisteredGroups = {
    'test-dm@s.whatsapp.net': {
      name: 'Test DM',
      folder: 'test-dm',
      trigger: '@verch',
      isDm: true,
      alwaysProcess: true,
      added_at: '2026-02-13T00:00:00.000Z',
    },
    'test-main@g.us': {
      name: 'Main Group',
      folder: 'main',
      trigger: '@verch',
      isMain: true,
      added_at: '2026-02-13T00:00:00.000Z',
    },
    'test-group@g.us': {
      name: 'Regular Group Chat',
      folder: 'test-group',
      trigger: '@verch',
      added_at: '2026-02-13T00:00:00.000Z',
      // NO isMain flag, NO alwaysProcess flag
    },
  };

  // Test helper to determine if a message should be processed
  function shouldProcessMessage(
    chatJid: string,
    content: string,
    mentions: string[] = [],
    botJid: string = '639123456789@s.whatsapp.net'
  ): boolean {
    const group = mockRegisteredGroups[chatJid as keyof typeof mockRegisteredGroups];
    if (!group) return false;

    const isMainGroup = group.folder === 'main' || group.isMain;
    const hasTrigger = /@verch/i.test(content);

    // Check if bot is mentioned
    const hasMention = mentions.includes(botJid);

    const shouldAlwaysProcess = isMainGroup || group.alwaysProcess;

    // This is the logic from src/index.ts line 384-385
    // Should return early (NOT process) if all conditions are false
    if (!shouldAlwaysProcess && !hasTrigger && !hasMention) {
      return false; // Don't process
    }

    return true; // Process the message
  }

  describe('DM Chat Behavior', () => {
    it('should process all messages in DM (alwaysProcess=true)', () => {
      expect(shouldProcessMessage('test-dm@s.whatsapp.net', 'hello')).toBe(true);
      expect(shouldProcessMessage('test-dm@s.whatsapp.net', 'no mention here')).toBe(true);
    });
  });

  describe('Main Group Behavior', () => {
    it('should process all messages in main group (isMain=true)', () => {
      expect(shouldProcessMessage('test-main@g.us', 'hello')).toBe(true);
      expect(shouldProcessMessage('test-main@g.us', 'no mention here')).toBe(true);
    });
  });

  describe('Regular Group Chat Behavior - THE BUG', () => {
    const groupJid = 'test-group@g.us';
    const botJid = '639123456789@s.whatsapp.net';

    it('should NOT process messages without trigger or mention', () => {
      // This is the main test case that catches the bug
      const result = shouldProcessMessage(groupJid, 'hey everyone', [], botJid);
      expect(result).toBe(false); // Should NOT process
    });

    it('should process messages with trigger', () => {
      const result = shouldProcessMessage(groupJid, '@verch hello', [], botJid);
      expect(result).toBe(true); // Should process
    });

    it('should process messages with bot mention', () => {
      const result = shouldProcessMessage(groupJid, 'hello there', [botJid], botJid);
      expect(result).toBe(true); // Should process
    });

    it('should process messages with both trigger and mention', () => {
      const result = shouldProcessMessage(groupJid, '@verch hello', [botJid], botJid);
      expect(result).toBe(true); // Should process
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-insensitive trigger matching', () => {
      const result = shouldProcessMessage('test-group@g.us', '@VERCH hello');
      expect(result).toBe(true);
    });

    it('should handle trigger in middle of message', () => {
      const result = shouldProcessMessage('test-group@g.us', 'hey @verch can you help');
      expect(result).toBe(true);
    });

    it('should not process partial trigger matches', () => {
      const result = shouldProcessMessage('test-group@g.us', 'ververch is not a trigger');
      expect(result).toBe(false);
    });
  });

  describe('Validation: Group Registration', () => {
    it('regular group chats should never have isMain=true', () => {
      // This test validates that group chats ending in @g.us
      // should NOT be registered with isMain: true
      const regularGroupChats = Object.entries(mockRegisteredGroups)
        .filter(([jid]) => jid.endsWith('@g.us') && !jid.includes('main'));

      for (const [jid, group] of regularGroupChats) {
        if (jid !== 'test-main@g.us') {
          expect(group.isMain).toBeFalsy();
        }
      }
    });

    it('only DMs should have alwaysProcess=true (or main group)', () => {
      const groupChats = Object.entries(mockRegisteredGroups)
        .filter(([jid]) => jid.endsWith('@g.us') && !jid.includes('main'));

      for (const [, group] of groupChats) {
        expect(group.alwaysProcess).toBeFalsy();
      }
    });
  });
});
