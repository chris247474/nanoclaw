import { describe, it, expect } from 'vitest';

describe('media-handler', () => {
  it.todo('getMediaInfo identifies imageMessage');
  it.todo('getMediaInfo identifies documentMessage');
  it.todo('getMediaInfo returns null for text-only messages');
  it.todo('getExtension maps known mimetypes');
  it.todo('downloadAndSaveMedia saves file with timestamp prefix');
  it.todo('downloadAndSaveMedia skips files over MAX_MEDIA_SIZE');
  it.todo('downloadAndSaveMedia skips sticker messages');
});
