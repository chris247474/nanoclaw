import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { categorizeMedia, getMimeType, validateFilePath, sendFileMessage } from '../file-sender.js';
import { IpcFileMessage } from '../types.js';
import { MAX_MEDIA_SIZE, GROUPS_DIR } from '../config.js';

describe('file-sender', () => {
  describe('categorizeMedia', () => {
    it('maps image extensions', () => {
      expect(categorizeMedia('.jpg')).toBe('image');
      expect(categorizeMedia('.jpeg')).toBe('image');
      expect(categorizeMedia('.png')).toBe('image');
      expect(categorizeMedia('.gif')).toBe('image');
      expect(categorizeMedia('.webp')).toBe('image');
      expect(categorizeMedia('JPG')).toBe('image'); // Case insensitive
    });

    it('maps video extensions', () => {
      expect(categorizeMedia('.mp4')).toBe('video');
      expect(categorizeMedia('.mov')).toBe('video');
      expect(categorizeMedia('.avi')).toBe('video');
      expect(categorizeMedia('MP4')).toBe('video'); // Case insensitive
    });

    it('maps audio extensions', () => {
      expect(categorizeMedia('.mp3')).toBe('audio');
      expect(categorizeMedia('.ogg')).toBe('audio');
      expect(categorizeMedia('.wav')).toBe('audio');
      expect(categorizeMedia('.m4a')).toBe('audio');
      expect(categorizeMedia('MP3')).toBe('audio'); // Case insensitive
    });

    it('defaults to document for unknown extensions', () => {
      expect(categorizeMedia('.pdf')).toBe('document');
      expect(categorizeMedia('.doc')).toBe('document');
      expect(categorizeMedia('.txt')).toBe('document');
      expect(categorizeMedia('.xlsx')).toBe('document');
      expect(categorizeMedia('.unknown')).toBe('document');
    });
  });

  describe('getMimeType', () => {
    it('maps known image types', () => {
      expect(getMimeType('.jpg')).toBe('image/jpeg');
      expect(getMimeType('.jpeg')).toBe('image/jpeg');
      expect(getMimeType('.png')).toBe('image/png');
      expect(getMimeType('.gif')).toBe('image/gif');
      expect(getMimeType('.webp')).toBe('image/webp');
    });

    it('maps known video types', () => {
      expect(getMimeType('.mp4')).toBe('video/mp4');
      expect(getMimeType('.mov')).toBe('video/quicktime');
      expect(getMimeType('.avi')).toBe('video/x-msvideo');
    });

    it('maps known audio types', () => {
      expect(getMimeType('.mp3')).toBe('audio/mpeg');
      expect(getMimeType('.ogg')).toBe('audio/ogg');
      expect(getMimeType('.wav')).toBe('audio/wav');
      expect(getMimeType('.m4a')).toBe('audio/mp4');
    });

    it('maps known document types', () => {
      expect(getMimeType('.pdf')).toBe('application/pdf');
      expect(getMimeType('.doc')).toBe('application/msword');
      expect(getMimeType('.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(getMimeType('.xls')).toBe('application/vnd.ms-excel');
      expect(getMimeType('.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(getMimeType('.txt')).toBe('text/plain');
      expect(getMimeType('.csv')).toBe('text/csv');
    });

    it('defaults to application/octet-stream for unknown types', () => {
      expect(getMimeType('.unknown')).toBe('application/octet-stream');
      expect(getMimeType('.xyz')).toBe('application/octet-stream');
    });

    it('is case insensitive', () => {
      expect(getMimeType('PDF')).toBe('application/pdf');
      expect(getMimeType('JPG')).toBe('image/jpeg');
    });
  });

  describe('validateFilePath', () => {
    it('returns resolved path for valid paths within group dir', () => {
      const result = validateFilePath('reports/output.pdf', 'testgroup');
      expect(result).toContain('groups/testgroup/reports/output.pdf');
      expect(result).not.toBeNull();
    });

    it('returns resolved path for root-level files', () => {
      const result = validateFilePath('file.txt', 'testgroup');
      expect(result).toContain('groups/testgroup/file.txt');
      expect(result).not.toBeNull();
    });

    it('returns null for path traversal attempts', () => {
      expect(validateFilePath('../../etc/passwd', 'testgroup')).toBeNull();
      expect(validateFilePath('../../../.ssh/id_rsa', 'testgroup')).toBeNull();
      expect(validateFilePath('./../outside.txt', 'testgroup')).toBeNull();
    });

    it('returns null for absolute paths outside group dir', () => {
      expect(validateFilePath('/etc/passwd', 'testgroup')).toBeNull();
      expect(validateFilePath('/Users/user/.ssh/id_rsa', 'testgroup')).toBeNull();
    });

    it('handles paths with .. that resolve inside group dir', () => {
      const result = validateFilePath('subdir/../file.txt', 'testgroup');
      expect(result).toContain('groups/testgroup/file.txt');
      expect(result).not.toBeNull();
    });
  });

  describe('sendFileMessage', () => {
    let testGroupDir: string;
    let mockSock: { sendMessage: ReturnType<typeof vi.fn> };

    beforeAll(() => {
      // Use actual groups directory but with a test group
      testGroupDir = path.join(GROUPS_DIR, 'test-file-sender');
      fs.mkdirSync(testGroupDir, { recursive: true });

      // Create test files
      fs.writeFileSync(path.join(testGroupDir, 'test.jpg'), Buffer.from('fake-image-data'));
      fs.writeFileSync(path.join(testGroupDir, 'test.pdf'), Buffer.from('fake-pdf-data'));
      fs.writeFileSync(path.join(testGroupDir, 'test.mp4'), Buffer.from('fake-video-data'));
      fs.writeFileSync(path.join(testGroupDir, 'test.mp3'), Buffer.from('fake-audio-data'));

      // Create a large file (exceeds MAX_MEDIA_SIZE)
      const largeBuffer = Buffer.alloc(MAX_MEDIA_SIZE + 1);
      fs.writeFileSync(path.join(testGroupDir, 'large.pdf'), largeBuffer);
    });

    beforeEach(() => {
      // Mock socket for each test
      mockSock = { sendMessage: vi.fn().mockResolvedValue({}) };
    });

    afterAll(() => {
      if (testGroupDir && fs.existsSync(testGroupDir)) {
        fs.rmSync(testGroupDir, { recursive: true, force: true });
      }
    });

    it('sends image with correct format', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'test.jpg',
        caption: 'Test image',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(true);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '123456789@s.whatsapp.net',
        expect.objectContaining({
          image: expect.any(Buffer),
          caption: 'TestBot: Test image',
          mimetype: 'image/jpeg',
        })
      );
    });

    it('sends document with fileName', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'test.pdf',
        fileName: 'report.pdf',
        caption: 'Monthly report',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(true);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '123456789@s.whatsapp.net',
        expect.objectContaining({
          document: expect.any(Buffer),
          fileName: 'report.pdf',
          caption: 'TestBot: Monthly report',
          mimetype: 'application/pdf',
        })
      );
    });

    it('sends video with correct format', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'test.mp4',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(true);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '123456789@s.whatsapp.net',
        expect.objectContaining({
          video: expect.any(Buffer),
          mimetype: 'video/mp4',
        })
      );
    });

    it('sends audio with correct format', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'test.mp3',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(true);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '123456789@s.whatsapp.net',
        expect.objectContaining({
          audio: expect.any(Buffer),
          mimetype: 'audio/mpeg',
        })
      );
    });

    it('returns false for non-existent files', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'nonexistent.pdf',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(false);
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
    });

    it('returns false for files exceeding MAX_MEDIA_SIZE', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'large.pdf',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(false);
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
    });

    it('returns false for path traversal attempts', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: '../../etc/passwd',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(false);
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
    });

    it('uses original filename when fileName not provided', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'test.pdf',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(true);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '123456789@s.whatsapp.net',
        expect.objectContaining({
          fileName: 'test.pdf',
        })
      );
    });

    it('handles caption-less messages', async () => {
      const ipcMsg: IpcFileMessage = {
        type: 'file',
        chatJid: '123456789@s.whatsapp.net',
        filePath: 'test.jpg',
        groupFolder: 'test-file-sender',
        timestamp: new Date().toISOString(),
      };

      const result = await sendFileMessage(mockSock as any, ipcMsg, 'TestBot');

      expect(result).toBe(true);
      const call = mockSock.sendMessage.mock.calls[0][1];
      expect(call.caption).toBeUndefined();
    });
  });
});
