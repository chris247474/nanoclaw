# Plan: File Upload/Download Support for NanoClaw

## Context

NanoClaw currently only handles text messages. Users sending files (PDFs, images, documents) via WhatsApp are ignored — the agent never sees them. The Jerome group (PE due diligence) needs to receive pitch decks and financials, and the agent needs to send reports back. This adds bidirectional file support.

## Prerequisites

- **No `develop` branch exists.** Create one from `personal-setup` (the current working branch with latest changes) before starting any agents.
- **No test framework.** Phase 0 must set up vitest before any TDD work can begin.

```bash
# One-time setup before any agents start
git checkout personal-setup
git checkout -b develop
git push -u origin develop
```

## Architecture

Files flow through the shared group directory (`groups/{folder}/files/`) which is already mounted into containers at `/workspace/group/`. No new mounts needed. IPC JSON references file paths — no binary data in JSON.

```
RECEIVE: WhatsApp → Baileys downloadMediaMessage → groups/{folder}/files/incoming/{file}
         → container sees /workspace/group/files/incoming/{file}
         → agent reads with Read tool (Claude is multimodal — can view images/PDFs)

SEND:    Agent writes file to /workspace/group/ → calls send_file MCP tool
         → IPC JSON with file path → host reads file from shared mount
         → Baileys sock.sendMessage(jid, { document/image/video: Buffer })
```

---

## Agent Team Breakdown

### Dependency Graph

```
Phase 0: Shared Contracts + Test Infrastructure
    │
    ├─── Phase 1 (all parallel, 4 agents)
    │    ├── Feat 1: DB media columns
    │    ├── Feat 2: Media download module
    │    ├── Feat 3: Container send_file MCP tool
    │    └── Feat 4: Host file sender module
    │
    └─── Phase 2 (sequential, 1 agent)
         └── Feat 5: Integration (wires everything into index.ts + container rebuild)
```

### Why this split?

- `src/index.ts` is the biggest conflict risk — both receive and send paths modify it. Extracting `src/media-handler.ts` and `src/file-sender.ts` as new modules lets Phase 1 agents work in parallel on separate files.
- The IPC protocol for file messages is defined in Phase 0 contracts so both sides (container tool and host handler) agree on the schema.
- DB, media download, IPC tool, and file sender have zero cross-dependencies once they share the Phase 0 contracts.

---

## Phase 0: Shared Contracts + Test Infrastructure

**Branch:** `claude/feat-0-shared-contracts`
**Worktree:** `claude/feat-0-shared-contracts`
**Base:** `develop`

### What this agent does:
1. Set up vitest (install, config, npm scripts)
2. Add media fields to `NewMessage` in `src/types.ts`
3. Add config constants to `src/config.ts`
4. Define IPC file message interface in `src/types.ts`
5. Write skeleton test files for each Phase 1 module
6. Commit and push

### Agent Prompt:

```
You are setting up shared contracts and test infrastructure for the NanoClaw file upload/download feature.

## Working Directory
/Users/chris/Projects/nanoclaw

## Your Task

### 1. Set up vitest
- Install vitest as a dev dependency: `npm install -D vitest`
- Create `vitest.config.ts` at project root:
  ```ts
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      globals: true,
      environment: 'node',
    },
  });
  ```
- Add to package.json scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

### 2. Update `src/types.ts` — Add media fields to NewMessage
Add these optional fields to the `NewMessage` interface (after `mentions`):
```ts
media_type?: string | null;
media_path?: string | null;
```

### 3. Add IPC file message interface to `src/types.ts`
Add this interface for the file send IPC protocol:
```ts
export interface IpcFileMessage {
  type: 'file';
  chatJid: string;
  filePath: string;       // Relative path within group dir (e.g., "reports/output.pdf")
  caption?: string;
  fileName?: string;      // Override display name
  groupFolder: string;
  timestamp: string;
}
```

### 4. Update `src/config.ts` — Add media constants
Add after the existing constants:
```ts
export const MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB
export const FILE_RETENTION_DAYS = 30;
```

### 5. Create skeleton test files
Create these empty test files with a single passing placeholder test each:
- `src/__tests__/db.test.ts`
- `src/__tests__/media-handler.test.ts`
- `src/__tests__/file-sender.test.ts`
- `container/agent-runner/src/__tests__/ipc-mcp.test.ts`

### 6. Verify
- Run `npm test` — all placeholder tests should pass
- Run `npm run build` — TypeScript should compile cleanly

### Git
- Branch: `claude/feat-0-shared-contracts` (branched from `develop`)
- Commit message: "feat: add shared contracts and test infrastructure for file upload/download"
- Push to origin
```

---

## Phase 1: Independent Agents (all parallel)

All Phase 1 agents branch from `develop` AFTER Phase 0 has been merged.

---

### Feat 1: DB Media Columns

**Branch:** `claude/feat-1-db-media-columns`
**Worktree:** `claude/feat-1-db-media-columns`
**Files:** `src/db.ts`, `src/__tests__/db.test.ts`

### Agent Prompt:

```
You are adding media column support to the NanoClaw SQLite database.

## Working Directory
/Users/chris/Projects/nanoclaw

## Shared Contracts (already merged to develop)
The `NewMessage` interface in `src/types.ts` now has:
- `media_type?: string | null`
- `media_path?: string | null`

## Your Task

### 1. Write tests FIRST in `src/__tests__/db.test.ts`

Tests should cover:
- Schema migration: `media_type` and `media_path` columns exist after initDatabase()
- `storeMessage()` stores media_type and media_path when provided
- `storeMessage()` stores null for media fields when not provided (backward compat)
- `getNewMessages()` returns media_type and media_path in results
- `getMessagesSince()` returns media_type and media_path in results
- Content extraction includes `documentMessage.caption`

You'll need to mock or create a test database. Use a fresh in-memory SQLite DB for tests.

### 2. Implement changes in `src/db.ts`

**Schema migration (after existing migrations around line 87):**
```ts
try {
  db.exec(`ALTER TABLE messages ADD COLUMN media_type TEXT`);
} catch { /* column already exists */ }

try {
  db.exec(`ALTER TABLE messages ADD COLUMN media_path TEXT`);
} catch { /* column already exists */ }
```

**Update `storeMessage()` (lines 181-218):**
- Add `mediaType` and `mediaPath` parameters (optional)
- Add `documentMessage.caption` to content extraction:
  ```ts
  msg.message?.documentMessage?.caption ||
  ```
- Update INSERT to include media_type, media_path columns
- Pass mediaType and mediaPath to the prepared statement

**Update SELECT queries:**
- `getNewMessages()`: Add `media_type, media_path` to SELECT
- `getMessagesSince()`: Add `media_type, media_path` to SELECT

### 3. Verify
- `npm test` — all tests pass
- `npm run build` — compiles cleanly

### Git
- Branch: `claude/feat-1-db-media-columns` (from develop)
- Commit: "feat: add media_type and media_path columns to messages table"
- Push to origin
```

---

### Feat 2: Media Download Module

**Branch:** `claude/feat-2-media-download`
**Worktree:** `claude/feat-2-media-download`
**Files:** `src/media-handler.ts` (NEW), `src/__tests__/media-handler.test.ts`

### Agent Prompt:

```
You are building the media download module for NanoClaw's file upload feature.

## Working Directory
/Users/chris/Projects/nanoclaw

## Shared Contracts (already merged to develop)
- `MAX_MEDIA_SIZE` (50MB) in `src/config.ts`
- `NewMessage` has `media_type` and `media_path` fields in `src/types.ts`

## Your Task

### 1. Write tests FIRST in `src/__tests__/media-handler.test.ts`

Tests should cover:
- `getMediaInfo()`: correctly identifies imageMessage, videoMessage, audioMessage, documentMessage, returns null for text-only messages
- `getExtension()`: maps mimetypes to extensions (image/jpeg → .jpg, application/pdf → .pdf, etc.), handles unknown mimetypes
- `downloadAndSaveMedia()`:
  - Creates incoming directory if it doesn't exist
  - Saves file with timestamp-prefixed name
  - Returns the saved file path
  - Returns null and stores placeholder content when file exceeds MAX_MEDIA_SIZE
  - Returns null and stores placeholder on download failure
  - Skips sticker messages (returns null)

Mock `downloadMediaMessage` from Baileys for testing.

### 2. Create `src/media-handler.ts`

```ts
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { MAX_MEDIA_SIZE, GROUPS_DIR } from './config.js';
import { logger } from './logger.js';

export interface MediaInfo {
  type: 'image' | 'video' | 'audio' | 'document';
  message: proto.IMessage;
  mimetype: string;
  fileSize: number;
  caption: string;
}

/** Extract media info from a WhatsApp message, or null if text-only */
export function getMediaInfo(msg: proto.IWebMessageInfo): MediaInfo | null { ... }

/** Map mimetype to file extension */
export function getExtension(mimetype: string): string { ... }

/**
 * Download media from WhatsApp and save to group's incoming files directory.
 * Returns the absolute host path to the saved file, or null if skipped/failed.
 */
export async function downloadAndSaveMedia(
  msg: proto.IWebMessageInfo,
  groupFolder: string,
): Promise<{ filePath: string; mediaType: string; caption: string } | null> { ... }
```

Key implementation details:
- Save to `groups/{folder}/files/incoming/{timestamp}-{originalName || random}.{ext}`
- 50MB size check BEFORE downloading (use fileSize from message metadata)
- Catch download errors gracefully — return null, log error
- Skip stickerMessage (return null)
- The container sees this at `/workspace/group/files/incoming/{file}`

### 3. Verify
- `npm test` — all tests pass
- `npm run build` — compiles cleanly

### Git
- Branch: `claude/feat-2-media-download` (from develop)
- Commit: "feat: add media download handler module"
- Push to origin
```

---

### Feat 3: Container send_file MCP Tool

**Branch:** `claude/feat-3-send-file-tool`
**Worktree:** `claude/feat-3-send-file-tool`
**Files:** `container/agent-runner/src/ipc-mcp.ts`, `container/agent-runner/src/__tests__/ipc-mcp.test.ts`

### Agent Prompt:

```
You are adding a send_file MCP tool to the NanoClaw container agent.

## Working Directory
/Users/chris/Projects/nanoclaw

## Shared Contracts (already merged to develop)
The IPC file message format in `src/types.ts`:
```ts
export interface IpcFileMessage {
  type: 'file';
  chatJid: string;
  filePath: string;       // Relative path within group dir
  caption?: string;
  fileName?: string;
  groupFolder: string;
  timestamp: string;
}
```

## Your Task

### 1. Write tests FIRST in `container/agent-runner/src/__tests__/ipc-mcp.test.ts`

Tests should cover:
- `send_file` tool validates file exists before writing IPC
- `send_file` tool rejects paths outside `/workspace/group/` (path traversal prevention)
- `send_file` tool rejects files larger than 50MB
- `send_file` tool writes correct IPC JSON matching IpcFileMessage interface
- `send_file` tool uses atomic write (temp file then rename)

You may need to mock fs operations for testing.

### 2. Add `send_file` tool to `container/agent-runner/src/ipc-mcp.ts`

Add after the existing `send_message` tool (around line 67):

```ts
tool(
  'send_file',
  `Send a file to the current WhatsApp chat. The file must exist within /workspace/group/.
Supports images, documents, videos, and audio. The file type is auto-detected from the extension.
Maximum file size: 50MB.`,
  {
    file_path: z.string().describe('Path to the file within /workspace/group/ (e.g., "/workspace/group/reports/output.pdf")'),
    caption: z.string().optional().describe('Optional caption/message to send with the file'),
    file_name: z.string().optional().describe('Optional display name for the file (defaults to original filename)')
  },
  async (args) => {
    // 1. Validate path is within /workspace/group/
    const resolved = path.resolve(args.file_path);
    if (!resolved.startsWith('/workspace/group/')) {
      return { content: [{ type: 'text', text: 'Error: file_path must be within /workspace/group/' }], isError: true };
    }

    // 2. Validate file exists
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: 'text', text: `Error: file not found: ${resolved}` }], isError: true };
    }

    // 3. Validate file size (50MB limit)
    const stat = fs.statSync(resolved);
    if (stat.size > 50 * 1024 * 1024) {
      return { content: [{ type: 'text', text: `Error: file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB.` }], isError: true };
    }

    // 4. Write IPC file message
    // Use relative path from /workspace/group/ so host can resolve against actual group dir
    const relativePath = path.relative('/workspace/group', resolved);
    const data = {
      type: 'file',
      chatJid,
      filePath: relativePath,
      caption: args.caption,
      fileName: args.file_name || path.basename(resolved),
      groupFolder,
      timestamp: new Date().toISOString()
    };

    const filename = writeIpcFile(MESSAGES_DIR, data);
    return { content: [{ type: 'text', text: `File queued for delivery: ${path.basename(resolved)} (${filename})` }] };
  }
),
```

### 3. Verify
- `npm test` — all tests pass
- `npm run build` — compiles cleanly (check both host and container tsconfig)

### Git
- Branch: `claude/feat-3-send-file-tool` (from develop)
- Commit: "feat: add send_file MCP tool to container agent"
- Push to origin
```

---

### Feat 4: Host File Sender Module

**Branch:** `claude/feat-4-file-sender`
**Worktree:** `claude/feat-4-file-sender`
**Files:** `src/file-sender.ts` (NEW), `src/__tests__/file-sender.test.ts`

### Agent Prompt:

```
You are building the host-side file sending module for NanoClaw.

## Working Directory
/Users/chris/Projects/nanoclaw

## Shared Contracts (already merged to develop)
- `IpcFileMessage` interface in `src/types.ts`
- `MAX_MEDIA_SIZE` in `src/config.ts`
- `GROUPS_DIR` in `src/config.ts`

## Your Task

### 1. Write tests FIRST in `src/__tests__/file-sender.test.ts`

Tests should cover:
- `categorizeMedia()`: maps extensions to Baileys media types (image, video, audio, document)
  - .jpg/.png/.gif/.webp → 'image'
  - .mp4/.mov/.avi → 'video'
  - .mp3/.ogg/.wav → 'audio'
  - everything else → 'document'
- `getMimeType()`: maps extensions to MIME types (jpg → image/jpeg, pdf → application/pdf)
- `sendFileMessage()`:
  - Reads file from disk and sends via Baileys sock.sendMessage
  - Constructs correct Baileys message format based on media type
  - Includes caption when provided
  - Includes fileName for documents
  - Returns false for non-existent files
  - Returns false for files exceeding MAX_MEDIA_SIZE
- `validateFilePath()`:
  - Accepts paths within the group directory
  - Rejects path traversal attempts (../../etc/passwd)
  - Rejects absolute paths outside group dir

Mock Baileys sock.sendMessage for testing.

### 2. Create `src/file-sender.ts`

```ts
import fs from 'fs';
import path from 'path';
import { WASocket } from '@whiskeysockets/baileys';
import { GROUPS_DIR, MAX_MEDIA_SIZE } from './config.js';
import { IpcFileMessage } from './types.js';
import { logger } from './logger.js';

type BaileysMediaType = 'image' | 'video' | 'audio' | 'document';

/** Map file extension to Baileys media category */
export function categorizeMedia(ext: string): BaileysMediaType { ... }

/** Map file extension to MIME type */
export function getMimeType(ext: string): string { ... }

/** Validate that a file path is within the allowed group directory */
export function validateFilePath(filePath: string, groupFolder: string): string | null {
  // Returns resolved absolute path if valid, null if path traversal detected
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
  // 1. Resolve and validate path
  // 2. Check file exists and size
  // 3. Determine media type from extension
  // 4. Read file into Buffer
  // 5. Build Baileys message object:
  //    - image: { image: Buffer, caption }
  //    - video: { video: Buffer, caption }
  //    - audio: { audio: Buffer, mimetype }
  //    - document: { document: Buffer, fileName, caption, mimetype }
  // 6. sock.sendMessage(jid, message)
  // 7. Return true on success, false on error
}
```

### 3. Verify
- `npm test` — all tests pass
- `npm run build` — compiles cleanly

### Git
- Branch: `claude/feat-4-file-sender` (from develop)
- Commit: "feat: add host-side file sender module"
- Push to origin
```

---

## Phase 2: Integration

**Branch:** `claude/feat-5-integration`
**Worktree:** `claude/feat-5-integration`
**Base:** `develop` (after ALL Phase 1 branches merged)
**Files:** `src/index.ts` (primary), container rebuild

### Agent Prompt:

```
You are wiring the file upload/download feature into NanoClaw's main application.

## Working Directory
/Users/chris/Projects/nanoclaw

## Dependencies (all merged to develop)
All of the following modules are implemented and available:

1. **`src/types.ts`** — `NewMessage` has `media_type`, `media_path` fields. `IpcFileMessage` interface defined.
2. **`src/config.ts`** — `MAX_MEDIA_SIZE`, `FILE_RETENTION_DAYS` constants.
3. **`src/db.ts`** — `storeMessage()` accepts `mediaType`, `mediaPath` params. Queries return media fields.
4. **`src/media-handler.ts`** — `downloadAndSaveMedia(msg, groupFolder)` returns `{ filePath, mediaType, caption } | null`.
5. **`src/file-sender.ts`** — `sendFileMessage(sock, ipcMsg, assistantName)` sends files via Baileys.

Read each of these files to understand the exact APIs before implementing.

## Your Task

### 1. Update `src/index.ts` — Receive path (messages.upsert handler)

In the `sock.ev.on('messages.upsert', ...)` handler (around line 827):

- Import `downloadAndSaveMedia` from `./media-handler.js`
- After the existing message processing, detect media messages
- Call `downloadAndSaveMedia(msg, group.folder)` for registered groups
- Pass the returned `mediaType` and `filePath` to `storeMessage()`:
  ```ts
  storeMessage(msg, chatJid, msg.key.fromMe || false, msg.pushName || undefined, mediaResult?.mediaType, mediaResult?.filePath);
  ```

### 2. Update `src/index.ts` — Prompt XML in processMessage()

In `processMessage()` around line 276-285, update the XML generation to include media attributes:

```ts
const lines = missedMessages.map((m) => {
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let attrs = `sender="${escapeXml(m.sender_name)}" time="${m.timestamp}"`;
  if (m.media_type) {
    attrs += ` media_type="${escapeXml(m.media_type)}"`;
    // Convert host path to container path
    const containerPath = m.media_path?.replace(/.*groups\/[^/]+\//, '/workspace/group/');
    if (containerPath) attrs += ` file="${escapeXml(containerPath)}"`;
  }
  return `<message ${attrs}>${escapeXml(m.content)}</message>`;
});
```

### 3. Update `src/index.ts` — IPC file handler

In `startIpcWatcher()` (around line 415), update the message processing to handle file IPC messages:

```ts
if (data.type === 'message' && data.chatJid && data.text) {
  // ... existing message handling
} else if (data.type === 'file' && data.chatJid && data.filePath) {
  // Import and call sendFileMessage
  const { sendFileMessage } = await import('./file-sender.js');
  const targetGroup = registeredGroups[data.chatJid];
  if (isMain || (targetGroup && targetGroup.folder === sourceGroup)) {
    const success = await sendFileMessage(sock, data as IpcFileMessage, ASSISTANT_NAME);
    if (success) {
      logger.info({ chatJid: data.chatJid, file: data.filePath, sourceGroup }, 'IPC file sent');
    }
  } else {
    logger.warn({ chatJid: data.chatJid, sourceGroup }, 'Unauthorized IPC file send blocked');
  }
}
```

### 4. Add file cleanup interval

In `connectWhatsApp()` after the connection opens (around line 796), add a daily cleanup:

```ts
import { FILE_RETENTION_DAYS } from './config.js';

// Periodic cleanup of old incoming files
setInterval(() => {
  const cutoff = Date.now() - FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const group of Object.values(registeredGroups)) {
    const incomingDir = path.join(GROUPS_DIR, group.folder, 'files', 'incoming');
    if (!fs.existsSync(incomingDir)) continue;
    for (const file of fs.readdirSync(incomingDir)) {
      const filePath = path.join(incomingDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        logger.debug({ file: filePath }, 'Cleaned up old media file');
      }
    }
  }
}, 24 * 60 * 60 * 1000); // Daily
```

### 5. Rebuild container
Run `./container/build.sh` to include the new send_file MCP tool.

### 6. Verify
- `npm test` — all tests pass
- `npm run build` — compiles cleanly
- `./container/build.sh` — container builds successfully

### Git
- Branch: `claude/feat-5-integration` (from develop, after Phase 1 merged)
- Commit: "feat: integrate file upload/download into main application"
- Push to origin
```

---

## Post-Completion Merge Order

**Branch:** `claude/merge-branches-0-5`
**Base:** `develop`

Merge order is designed to minimize conflicts. Types/config go first (small, foundational), then independent modules, then the integration that touches index.ts last.

### Merge Steps:

```
Step 1: merge claude/feat-0-shared-contracts → develop
Step 2: merge claude/feat-1-db-media-columns → develop
Step 3: merge claude/feat-2-media-download   → develop
Step 4: merge claude/feat-3-send-file-tool   → develop
Step 5: merge claude/feat-4-file-sender      → develop
Step 6: merge claude/feat-5-integration      → develop
```

### Merge Agent Prompt:

```
You are the merge agent for the NanoClaw file upload/download feature.

## Working Directory
/Users/chris/Projects/nanoclaw

## Your Task

Merge the following branches into develop, IN THIS EXACT ORDER. After each merge:
1. Merge the branch: `git merge <branch>`
2. If conflicts arise, resolve them automatically — prefer the incoming branch's changes for new code, keep existing code for unrelated changes
3. Run `npm test` and `npm run build`
4. If tests or build fail:
   - Adjust LOGIC to match the TESTS, not the other way around
   - If you believe a test itself is wrong, STOP and ask me for approval before changing it. Explain what the test checks and why you want to change it.
5. Only proceed to the next merge after the current one passes all tests and builds clean

### Merge Order:

1. `git checkout develop && git merge claude/feat-0-shared-contracts`
   - This adds types, config, vitest, skeleton tests. Should merge cleanly.
   - Verify: `npm test && npm run build`

2. `git merge claude/feat-1-db-media-columns`
   - DB changes. Possible conflict in db.ts if Phase 0 touched it.
   - Verify: `npm test && npm run build`

3. `git merge claude/feat-2-media-download`
   - New file (media-handler.ts). Should merge cleanly.
   - Verify: `npm test && npm run build`

4. `git merge claude/feat-3-send-file-tool`
   - Container IPC changes. Should merge cleanly.
   - Verify: `npm test && npm run build`

5. `git merge claude/feat-4-file-sender`
   - New file (file-sender.ts). Should merge cleanly.
   - Verify: `npm test && npm run build`

6. `git merge claude/feat-5-integration`
   - HIGHEST CONFLICT RISK — touches index.ts which the base branch also has.
   - Carefully resolve any conflicts in index.ts.
   - Verify: `npm test && npm run build`
   - Run `./container/build.sh` to verify container builds.

### After all merges:
- Create a PR from `develop` back to `main` (or from a dedicated PR branch if preferred)
- PR title: "feat: file upload/download support"
- PR body should summarize all changes across the 6 feature branches
```

---

## Edge Cases

- **Large files**: 50MB limit enforced on both download and send. Skip with `[File too large]` placeholder.
- **Download failures**: Baileys media URLs expire. Catch errors, store `[File download failed: <type>]` as content.
- **Unknown mimetypes**: Still downloaded/sent. Unknown sends default to `document` type in Baileys.
- **Stickers**: Excluded from v1 (small WebP of limited utility).
- **File cleanup**: Periodic cleanup of `files/incoming/` older than 30 days (daily interval).
- **Security**: Path traversal blocked via `path.resolve()` check. Non-main groups restricted to their own directory.
- **IPC authorization**: Same pattern as existing message IPC — non-main groups can only send to their own chat JID.

## Verification (Manual Testing — Post Merge)

1. Send an image to a registered group → check `groups/{folder}/files/incoming/` has the file
2. Send a PDF to the group → verify agent prompt includes the file path with media_type attribute
3. Ask the agent to read the PDF → verify it can access `/workspace/group/files/incoming/{file}`
4. Ask the agent to create and send a file → verify it arrives on WhatsApp
5. Test path traversal: agent tries to send `/etc/passwd` → should be blocked
6. Test large file: send 60MB file → should be skipped with placeholder
7. Test with Jerome group for real PE use case (pitch deck upload)

## Summary

| Phase | Branch | Agent Work | Files |
|-------|--------|-----------|-------|
| 0 | `claude/feat-0-shared-contracts` | Types, config, vitest setup | `src/types.ts`, `src/config.ts`, `vitest.config.ts`, `package.json` |
| 1 | `claude/feat-1-db-media-columns` | DB migration + queries | `src/db.ts`, `src/__tests__/db.test.ts` |
| 1 | `claude/feat-2-media-download` | Media download module | `src/media-handler.ts`, `src/__tests__/media-handler.test.ts` |
| 1 | `claude/feat-3-send-file-tool` | Container MCP tool | `container/agent-runner/src/ipc-mcp.ts` |
| 1 | `claude/feat-4-file-sender` | Host file sender | `src/file-sender.ts`, `src/__tests__/file-sender.test.ts` |
| 2 | `claude/feat-5-integration` | Wire into index.ts | `src/index.ts`, container rebuild |
| Merge | `claude/merge-branches-0-5` | Sequential merge + test | All files |
