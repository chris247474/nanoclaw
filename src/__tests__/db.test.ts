import { describe, it, expect } from 'vitest';

describe('db - media columns', () => {
  it.todo('schema migration adds media_type and media_path columns');
  it.todo('storeMessage stores media_type and media_path when provided');
  it.todo('storeMessage stores null for media fields when not provided');
  it.todo('getNewMessages returns media_type and media_path');
  it.todo('getMessagesSince returns media_type and media_path');
  it.todo('content extraction includes documentMessage.caption');
});
