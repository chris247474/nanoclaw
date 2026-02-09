import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { MAX_MEDIA_SIZE, GROUPS_DIR } from './config.js';
import { logger } from './logger.js';

export interface MediaInfo {
  type: 'image' | 'video' | 'audio' | 'document';
  message: proto.Message.IImageMessage | proto.Message.IVideoMessage | proto.Message.IAudioMessage | proto.Message.IDocumentMessage;
  mimetype: string;
  fileSize: number;
  caption: string;
}

/** Extract media info from a WhatsApp message, or null if text-only/sticker */
export function getMediaInfo(msg: proto.IWebMessageInfo): MediaInfo | null {
  if (!msg.message) return null;
  const m = msg.message;

  // Skip stickers
  if (m.stickerMessage) return null;

  if (m.imageMessage) {
    return {
      type: 'image',
      message: m.imageMessage,
      mimetype: m.imageMessage.mimetype || 'image/jpeg',
      fileSize: Number(m.imageMessage.fileLength || 0),
      caption: m.imageMessage.caption || '',
    };
  }
  if (m.videoMessage) {
    return {
      type: 'video',
      message: m.videoMessage,
      mimetype: m.videoMessage.mimetype || 'video/mp4',
      fileSize: Number(m.videoMessage.fileLength || 0),
      caption: m.videoMessage.caption || '',
    };
  }
  if (m.audioMessage) {
    return {
      type: 'audio',
      message: m.audioMessage,
      mimetype: m.audioMessage.mimetype || 'audio/ogg',
      fileSize: Number(m.audioMessage.fileLength || 0),
      caption: '',
    };
  }
  if (m.documentMessage) {
    return {
      type: 'document',
      message: m.documentMessage,
      mimetype: m.documentMessage.mimetype || 'application/octet-stream',
      fileSize: Number(m.documentMessage.fileLength || 0),
      caption: m.documentMessage.caption || '',
    };
  }

  return null;
}

/** Map mimetype to file extension */
export function getExtension(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/ogg': '.ogg',
    'audio/ogg; codecs=opus': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
    'text/csv': '.csv',
  };
  return map[mimetype] || '.bin';
}

/**
 * Download media from WhatsApp and save to group's incoming files directory.
 * Returns the absolute host path to the saved file, or null if skipped/failed.
 */
export async function downloadAndSaveMedia(
  msg: proto.IWebMessageInfo,
  groupFolder: string,
): Promise<{ filePath: string; mediaType: string; caption: string } | null> {
  const mediaInfo = getMediaInfo(msg);
  if (!mediaInfo) return null;

  // Check size before downloading
  if (mediaInfo.fileSize > MAX_MEDIA_SIZE) {
    logger.warn({ group: groupFolder, size: mediaInfo.fileSize, type: mediaInfo.type }, 'Media too large, skipping');
    return null;
  }

  try {
    // Download the media
    const buffer = await downloadMediaMessage(msg as WAMessage, 'buffer', {}) as Buffer;

    // Double-check actual size
    if (buffer.length > MAX_MEDIA_SIZE) {
      logger.warn({ group: groupFolder, size: buffer.length, type: mediaInfo.type }, 'Downloaded media too large, discarding');
      return null;
    }

    // Build save path
    const ext = getExtension(mediaInfo.mimetype);
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const filename = `${timestamp}-${random}${ext}`;

    const incomingDir = path.join(GROUPS_DIR, groupFolder, 'files', 'incoming');
    fs.mkdirSync(incomingDir, { recursive: true });

    const filePath = path.join(incomingDir, filename);
    fs.writeFileSync(filePath, buffer);

    logger.info({ group: groupFolder, file: filename, type: mediaInfo.type, size: buffer.length }, 'Media saved');

    return {
      filePath,
      mediaType: mediaInfo.type,
      caption: mediaInfo.caption,
    };
  } catch (err) {
    logger.error({ group: groupFolder, type: mediaInfo.type, err }, 'Failed to download media');
    return null;
  }
}
