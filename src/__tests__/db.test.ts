import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import { proto } from '@whiskeysockets/baileys';

// Import the functions we're testing
import {
  initDatabase,
  storeMessage,
  getNewMessages,
  getMessagesSince,
  storeChatMetadata,
} from '../db.js';

describe('db - media columns', () => {
  // Use the actual store/messages.db path based on project root
  const dbPath = path.join(process.cwd(), 'store', 'messages.db');

  beforeAll(() => {
    // Initialize the database (idempotent, safe to call multiple times)
    initDatabase();
  });

  it('schema migration adds media_type and media_path columns', () => {
    // Open the database and check if the columns exist
    const db = new Database(dbPath, { readonly: true });
    const tableInfo = db.pragma('table_info(messages)') as Array<{ name: string }>;
    db.close();

    const columnNames = tableInfo.map((col) => col.name);
    expect(columnNames).toContain('media_type');
    expect(columnNames).toContain('media_path');
  });

  it('storeMessage stores media_type and media_path when provided', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const mockMessage = {
      key: {
        id: 'test-media-msg-1',
        remoteJid: 'test-media-chat@g.us',
        fromMe: false,
      },
      message: {
        conversation: 'Test message with media',
      },
      messageTimestamp: BigInt(timestamp),
    } as any;

    // Store chat metadata first to satisfy foreign key constraint
    storeChatMetadata('test-media-chat@g.us', new Date(timestamp * 1000).toISOString());

    storeMessage(
      mockMessage,
      'test-media-chat@g.us',
      false,
      'TestUser',
      'image',
      '/path/to/image.jpg',
    );

    // Query the database to verify the stored data
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT media_type, media_path FROM messages WHERE id = ?')
      .get('test-media-msg-1') as { media_type: string; media_path: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row!.media_type).toBe('image');
    expect(row!.media_path).toBe('/path/to/image.jpg');
  });

  it('storeMessage stores null for media fields when not provided', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const mockMessage = {
      key: {
        id: 'test-media-msg-2',
        remoteJid: 'test-media-chat@g.us',
        fromMe: false,
      },
      message: {
        conversation: 'Test message without media',
      },
      messageTimestamp: BigInt(timestamp),
    } as any;

    // Store chat metadata first to satisfy foreign key constraint
    storeChatMetadata('test-media-chat@g.us', new Date(timestamp * 1000).toISOString());

    // Call without media parameters (backward compatibility)
    storeMessage(mockMessage, 'test-media-chat@g.us', false, 'TestUser');

    // Query the database to verify the stored data
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT media_type, media_path FROM messages WHERE id = ?')
      .get('test-media-msg-2') as { media_type: null; media_path: null } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row!.media_type).toBeNull();
    expect(row!.media_path).toBeNull();
  });

  it('getNewMessages returns media_type and media_path', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const mockMessage = {
      key: {
        id: 'test-media-msg-3',
        remoteJid: 'test-media-chat@g.us',
        fromMe: false,
      },
      message: {
        conversation: 'Test message for getNewMessages',
      },
      messageTimestamp: BigInt(timestamp),
    } as any;

    // Store chat metadata first to satisfy foreign key constraint
    storeChatMetadata('test-media-chat@g.us', new Date(timestamp * 1000).toISOString());

    storeMessage(
      mockMessage,
      'test-media-chat@g.us',
      false,
      'TestUser',
      'video',
      '/path/to/video.mp4',
    );

    const lastTimestamp = new Date((timestamp - 1000) * 1000).toISOString();
    const result = getNewMessages(['test-media-chat@g.us'], lastTimestamp, 'BOT');

    const matchingMessage = result.messages.find((m) => m.id === 'test-media-msg-3');
    expect(matchingMessage).toBeDefined();
    expect(matchingMessage!.media_type).toBe('video');
    expect(matchingMessage!.media_path).toBe('/path/to/video.mp4');
  });

  it('getMessagesSince returns media_type and media_path', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const mockMessage = {
      key: {
        id: 'test-media-msg-4',
        remoteJid: 'test-media-chat-2@g.us',
        fromMe: false,
      },
      message: {
        conversation: 'Test message for getMessagesSince',
      },
      messageTimestamp: BigInt(timestamp),
    } as any;

    // Store chat metadata first to satisfy foreign key constraint
    storeChatMetadata('test-media-chat-2@g.us', new Date(timestamp * 1000).toISOString());

    storeMessage(
      mockMessage,
      'test-media-chat-2@g.us',
      false,
      'TestUser',
      'document',
      '/path/to/doc.pdf',
    );

    const sinceTimestamp = new Date((timestamp - 1000) * 1000).toISOString();
    const messages = getMessagesSince('test-media-chat-2@g.us', sinceTimestamp, 'BOT');

    const matchingMessage = messages.find((m) => m.id === 'test-media-msg-4');
    expect(matchingMessage).toBeDefined();
    expect(matchingMessage!.media_type).toBe('document');
    expect(matchingMessage!.media_path).toBe('/path/to/doc.pdf');
  });

  it('content extraction includes documentMessage.caption', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const mockMessage = {
      key: {
        id: 'test-media-msg-5',
        remoteJid: 'test-media-chat-3@g.us',
        fromMe: false,
      },
      message: {
        documentMessage: {
          caption: 'Document caption text',
        },
      },
      messageTimestamp: BigInt(timestamp),
    } as any;

    // Store chat metadata first to satisfy foreign key constraint
    storeChatMetadata('test-media-chat-3@g.us', new Date(timestamp * 1000).toISOString());

    storeMessage(
      mockMessage,
      'test-media-chat-3@g.us',
      false,
      'TestUser',
      'document',
      '/path/to/doc.pdf',
    );

    // Query the database to verify the content was extracted
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT content FROM messages WHERE id = ?')
      .get('test-media-msg-5') as { content: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row!.content).toBe('Document caption text');
  });
});
