import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proto } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getMediaInfo, getExtension, downloadAndSaveMedia } from '../media-handler.js';

// Mock dependencies
vi.mock('@whiskeysockets/baileys', async () => {
  const actual = await vi.importActual('@whiskeysockets/baileys');
  return {
    ...actual,
    downloadMediaMessage: vi.fn(),
  };
});

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config to use temp directory
vi.mock('../config.js', () => ({
  MAX_MEDIA_SIZE: 50 * 1024 * 1024,
  GROUPS_DIR: path.join(os.tmpdir(), 'nanoclaw-test-media'),
}));

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '../logger.js';
import { MAX_MEDIA_SIZE, GROUPS_DIR } from '../config.js';

describe('media-handler', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), 'nanoclaw-test-media', 'test-group');
    // Clean up temp directory before each test
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getMediaInfo', () => {
    it('identifies imageMessage correctly', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            fileLength:12345,
            caption: 'Test image',
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('image');
      expect(result?.mimetype).toBe('image/jpeg');
      expect(result?.fileSize).toBe(12345);
      expect(result?.caption).toBe('Test image');
    });

    it('identifies videoMessage correctly', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          videoMessage: {
            mimetype: 'video/mp4',
            fileLength:54321,
            caption: 'Test video',
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('video');
      expect(result?.mimetype).toBe('video/mp4');
      expect(result?.fileSize).toBe(54321);
      expect(result?.caption).toBe('Test video');
    });

    it('identifies audioMessage correctly', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          audioMessage: {
            mimetype: 'audio/ogg',
            fileLength:9876,
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('audio');
      expect(result?.mimetype).toBe('audio/ogg');
      expect(result?.fileSize).toBe(9876);
      expect(result?.caption).toBe(''); // Audio has no caption
    });

    it('identifies documentMessage correctly', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          documentMessage: {
            mimetype: 'application/pdf',
            fileLength:100000,
            caption: 'Test document',
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('document');
      expect(result?.mimetype).toBe('application/pdf');
      expect(result?.fileSize).toBe(100000);
      expect(result?.caption).toBe('Test document');
    });

    it('returns null for text-only messages', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          conversation: 'Just a text message',
        },
      };

      const result = getMediaInfo(msg);

      expect(result).toBeNull();
    });

    it('returns null for stickerMessage', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          stickerMessage: {
            mimetype: 'image/webp',
            fileLength:5000,
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result).toBeNull();
    });

    it('returns null for messages without message field', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
      };

      const result = getMediaInfo(msg);

      expect(result).toBeNull();
    });

    it('uses default mimetype for image when missing', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            fileLength:12345,
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result?.mimetype).toBe('image/jpeg');
    });

    it('uses empty string for missing caption', () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            mimetype: 'image/png',
            fileLength:12345,
          },
        },
      };

      const result = getMediaInfo(msg);

      expect(result?.caption).toBe('');
    });
  });

  describe('getExtension', () => {
    it('maps image/jpeg to .jpg', () => {
      expect(getExtension('image/jpeg')).toBe('.jpg');
    });

    it('maps image/png to .png', () => {
      expect(getExtension('image/png')).toBe('.png');
    });

    it('maps video/mp4 to .mp4', () => {
      expect(getExtension('video/mp4')).toBe('.mp4');
    });

    it('maps audio/ogg to .ogg', () => {
      expect(getExtension('audio/ogg')).toBe('.ogg');
    });

    it('maps audio/ogg with codecs to .ogg', () => {
      expect(getExtension('audio/ogg; codecs=opus')).toBe('.ogg');
    });

    it('maps application/pdf to .pdf', () => {
      expect(getExtension('application/pdf')).toBe('.pdf');
    });

    it('maps application/msword to .doc', () => {
      expect(getExtension('application/msword')).toBe('.doc');
    });

    it('maps Office Open XML formats correctly', () => {
      expect(getExtension('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('.docx');
      expect(getExtension('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('.xlsx');
    });

    it('maps text/plain to .txt', () => {
      expect(getExtension('text/plain')).toBe('.txt');
    });

    it('returns .bin for unknown mimetype', () => {
      expect(getExtension('application/unknown')).toBe('.bin');
      expect(getExtension('foo/bar')).toBe('.bin');
    });

    it('handles empty string mimetype', () => {
      expect(getExtension('')).toBe('.bin');
    });
  });

  describe('downloadAndSaveMedia', () => {
    it('creates incoming directory if it does not exist', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            fileLength:1000,
          },
        },
      };

      const buffer = Buffer.from('fake image data');
      vi.mocked(downloadMediaMessage).mockResolvedValue(buffer);

      await downloadAndSaveMedia(msg, 'test-group');

      const incomingDir = path.join(GROUPS_DIR, 'test-group', 'files', 'incoming');
      expect(fs.existsSync(incomingDir)).toBe(true);
    });

    it('saves file with timestamp-prefixed name', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            fileLength:1000,
          },
        },
      };

      const buffer = Buffer.from('fake image data');
      vi.mocked(downloadMediaMessage).mockResolvedValue(buffer);

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).not.toBeNull();
      expect(result?.filePath).toMatch(/\/incoming\/\d+-[a-z0-9]+\.jpg$/);
      expect(result?.mediaType).toBe('image');
      expect(fs.existsSync(result!.filePath)).toBe(true);
    });

    it('returns saved file path, mediaType, and caption', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          documentMessage: {
            mimetype: 'application/pdf',
            fileLength:5000,
            caption: 'Important document',
          },
        },
      };

      const buffer = Buffer.from('fake pdf data');
      vi.mocked(downloadMediaMessage).mockResolvedValue(buffer);

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).not.toBeNull();
      expect(result?.filePath).toContain('/incoming/');
      expect(result?.filePath).toMatch(/\.pdf$/);
      expect(result?.mediaType).toBe('document');
      expect(result?.caption).toBe('Important document');
    });

    it('returns null when file exceeds MAX_MEDIA_SIZE (checks metadata)', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          videoMessage: {
            mimetype: 'video/mp4',
            fileLength:MAX_MEDIA_SIZE + 1000,
          },
        },
      };

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).toBeNull();
      expect(vi.mocked(downloadMediaMessage)).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'test-group',
          size: MAX_MEDIA_SIZE + 1000,
          type: 'video',
        }),
        'Media too large, skipping'
      );
    });

    it('returns null when downloaded buffer exceeds MAX_MEDIA_SIZE', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          videoMessage: {
            mimetype: 'video/mp4',
            fileLength:1000, // Metadata says small
          },
        },
      };

      // But actual download is huge
      const buffer = Buffer.alloc(MAX_MEDIA_SIZE + 1000);
      vi.mocked(downloadMediaMessage).mockResolvedValue(buffer);

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'test-group',
          size: MAX_MEDIA_SIZE + 1000,
          type: 'video',
        }),
        'Downloaded media too large, discarding'
      );

      // Ensure no file was saved
      const incomingDir = path.join(GROUPS_DIR, 'test-group', 'files', 'incoming');
      if (fs.existsSync(incomingDir)) {
        const files = fs.readdirSync(incomingDir);
        expect(files).toHaveLength(0);
      }
    });

    it('returns null on download failure', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            fileLength:1000,
          },
        },
      };

      const error = new Error('Network error');
      vi.mocked(downloadMediaMessage).mockRejectedValue(error);

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'test-group',
          type: 'image',
          err: error,
        }),
        'Failed to download media'
      );
    });

    it('skips sticker messages (returns null)', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          stickerMessage: {
            mimetype: 'image/webp',
            fileLength:5000,
          },
        },
      };

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).toBeNull();
      expect(vi.mocked(downloadMediaMessage)).not.toHaveBeenCalled();
    });

    it('returns null for text-only messages', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          conversation: 'Just text',
        },
      };

      const result = await downloadAndSaveMedia(msg, 'test-group');

      expect(result).toBeNull();
      expect(vi.mocked(downloadMediaMessage)).not.toHaveBeenCalled();
    });

    it('logs success when media is saved', async () => {
      const msg: proto.IWebMessageInfo = {
        key: { remoteJid: 'test@s.whatsapp.net', id: '123' },
        message: {
          imageMessage: {
            mimetype: 'image/png',
            fileLength:2000,
          },
        },
      };

      const buffer = Buffer.from('fake png data');
      vi.mocked(downloadMediaMessage).mockResolvedValue(buffer);

      await downloadAndSaveMedia(msg, 'test-group');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'test-group',
          type: 'image',
          size: buffer.length,
        }),
        'Media saved'
      );
    });
  });
});
