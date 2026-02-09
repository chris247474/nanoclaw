import fs from 'fs';
import path from 'path';
import { WASocket } from '@whiskeysockets/baileys';
import { GROUPS_DIR, MAX_MEDIA_SIZE } from './config.js';
import { IpcFileMessage } from './types.js';
import { logger } from './logger.js';

type BaileysMediaType = 'image' | 'video' | 'audio' | 'document';

/** Map file extension to Baileys media category */
export function categorizeMedia(ext: string): BaileysMediaType {
  const lower = ext.toLowerCase().replace(/^\./, '');
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
  const audioExts = ['mp3', 'ogg', 'wav', 'm4a', 'opus'];

  if (imageExts.includes(lower)) return 'image';
  if (videoExts.includes(lower)) return 'video';
  if (audioExts.includes(lower)) return 'audio';
  return 'document';
}

/** Map file extension to MIME type */
export function getMimeType(ext: string): string {
  const lower = ext.toLowerCase().replace(/^\./, '');
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
  };
  return map[lower] || 'application/octet-stream';
}

/** Validate that a file path is within the allowed group directory. Returns resolved absolute path or null. */
export function validateFilePath(filePath: string, groupFolder: string): string | null {
  const groupDir = path.join(GROUPS_DIR, groupFolder);
  const resolved = path.resolve(groupDir, filePath);
  if (!resolved.startsWith(groupDir + path.sep) && resolved !== groupDir) {
    return null;
  }
  return resolved;
}

/** Send a file to WhatsApp */
export async function sendFileMessage(
  sock: WASocket,
  ipcMsg: IpcFileMessage,
  assistantName: string,
): Promise<boolean> {
  try {
    // 1. Resolve and validate path
    const resolvedPath = validateFilePath(ipcMsg.filePath, ipcMsg.groupFolder);
    if (!resolvedPath) {
      logger.warn({ filePath: ipcMsg.filePath, groupFolder: ipcMsg.groupFolder }, 'Path traversal blocked in file send');
      return false;
    }

    // 2. Check file exists
    if (!fs.existsSync(resolvedPath)) {
      logger.warn({ filePath: resolvedPath }, 'File not found for sending');
      return false;
    }

    // 3. Check file size
    const stat = fs.statSync(resolvedPath);
    if (stat.size > MAX_MEDIA_SIZE) {
      logger.warn({ filePath: resolvedPath, size: stat.size }, 'File too large to send');
      return false;
    }

    // 4. Read file and determine type
    const buffer = fs.readFileSync(resolvedPath);
    const ext = path.extname(resolvedPath);
    const mediaType = categorizeMedia(ext);
    const mimetype = getMimeType(ext);
    const fileName = ipcMsg.fileName || path.basename(resolvedPath);
    const caption = ipcMsg.caption ? `${assistantName}: ${ipcMsg.caption}` : undefined;

    // 5. Build Baileys message based on media type and send
    switch (mediaType) {
      case 'image':
        await sock.sendMessage(ipcMsg.chatJid, { image: buffer, caption, mimetype });
        break;
      case 'video':
        await sock.sendMessage(ipcMsg.chatJid, { video: buffer, caption, mimetype });
        break;
      case 'audio':
        await sock.sendMessage(ipcMsg.chatJid, { audio: buffer, mimetype });
        break;
      case 'document':
      default:
        await sock.sendMessage(ipcMsg.chatJid, { document: buffer, fileName, caption, mimetype });
        break;
    }
    logger.info({ chatJid: ipcMsg.chatJid, fileName, mediaType, size: buffer.length }, 'File sent to WhatsApp');
    return true;
  } catch (err) {
    logger.error({ err, filePath: ipcMsg.filePath }, 'Failed to send file');
    return false;
  }
}
