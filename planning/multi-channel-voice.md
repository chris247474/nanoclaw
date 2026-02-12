# Multi-Channel + Eleven Labs Voice Support

## Context

NanoClaw is currently a WhatsApp-only agent system. The host process (`src/index.ts`, ~1080 lines) is tightly coupled to Baileys (WhatsApp library) — `sendMessage()` calls `sock.sendMessage()` directly, `processMessage()` checks WhatsApp-specific mention formats (LID JIDs, phone JIDs), and `sendFileMessage()` takes a `WASocket` as its first parameter.

The container/agent side is already channel-agnostic: it receives XML-formatted messages and sends responses via file-based IPC (`send_message`, `send_file` tools). Only the host needs to know which channel to route to.

Non-admin users can now DM the bot directly (`isDm: true`, `alwaysProcess: true` on `RegisteredGroup`). DM registration works via admin approval (`PendingDmRequest` in [src/pending-dm.ts](src/pending-dm.ts)). DM users get per-user credential dirs and access to Gmail, Calendar, Drive. Currently, DM detection is WhatsApp-specific (checks `@s.whatsapp.net` / `@lid` suffixes), and admin notifications are hardcoded to `sendMessage()` on the WhatsApp main chat.

**Goal:** Add a channel abstraction layer, then implement Telegram (first), Eleven Labs voice (second), with Messenger and Viber as future additions. Per-channel isolation (each channel connection = its own group). Local dev first (polling for Telegram, ngrok later for webhook channels). DM users on ANY channel must have full access to all integrations (Gmail, Calendar, Drive, voice, scheduled tasks, file ops).

---

## Phase 0: Channel Abstraction Layer

Extract WhatsApp-specific code from the monolithic `src/index.ts` into a pluggable channel interface. WhatsApp continues to work identically — no behavioral changes.

### 0.1 Create Channel Interface + JID Utilities

**New file: `src/channels/channel.ts`**

- `ChannelType = 'whatsapp' | 'telegram' | 'messenger' | 'viber'`
- `makeJid(channel, nativeId)` → `"telegram:-100123"`, `"whatsapp:120363@g.us"`
- `parseJid(raw)` → `{ channel, nativeId, raw }` — bare JIDs without `:` default to `'whatsapp'` for backward compat
- `IncomingMessage` interface — channel-agnostic message with: `id, chatJid, sender, senderName, content, timestamp, mentions, mediaType, mediaBuffer, mediaMimetype, isGroup, isDm, replyToBot, mentionsBot`
  - `isDm: boolean` — set by each channel (WhatsApp: `jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')`; Telegram: `chat.type === 'private'`; etc.). Replaces the hardcoded WhatsApp JID suffix checks in `processMessage()` (line 265)
- `Channel` interface:
  - `type: ChannelType`, `name: string`, `supportsGroups: boolean`
  - `connect(events): Promise<void>` — starts listening, calls `events.onMessage()` for each incoming message
  - `disconnect(): Promise<void>`
  - `sendMessage(nativeId, text, opts?): Promise<void>`
  - `sendFile(nativeId, buffer, mimetype, opts?): Promise<void>`
  - `sendVoice(nativeId, audioBuffer, mimetype?): Promise<void>`
  - `setTyping(nativeId, isTyping): Promise<void>`
  - `isDmJid(nativeId): boolean` — channel-specific DM detection (WhatsApp: `@s.whatsapp.net`/`@lid`; Telegram: stored from `chat.type === 'private'`; etc.)
  - `formatUserId(nativeId): string` — extract human-readable user ID for folder naming (WhatsApp: phone number; Telegram: numeric user ID; Messenger: PSID)

### 0.2 Create Channel Registry

**New file: `src/channels/registry.ts`**

- `ChannelRegistry` class with `register(channel)`, `get(type)`, `getForJid(canonicalJid)`, `all()`
- `connectAll(events)` / `disconnectAll()`

### 0.3 Extract WhatsApp Channel

**New file: `src/channels/whatsapp.ts`**

Move from `src/index.ts`:
- `connectWhatsApp()` → `WhatsAppChannel.connect()` (lines 700-930 approximately)
- `sendMessage()` (line 440) → `WhatsAppChannel.sendMessage()`
- `setTyping()` (line 85) → `WhatsAppChannel.setTyping()`
- `translateJid()` (line 74) + `lidToPhoneMap` — internal to WhatsApp channel
- `sock.ev.on('messages.upsert')` handler (line 933) — converts Baileys messages to `IncomingMessage`, calls `events.onMessage()`
- WhatsApp-specific mention detection (LID JID parsing, lines 207-216, 267-277) — moves into the conversion logic
- Media download via `downloadAndSaveMedia()` — called inside WhatsApp channel before emitting `IncomingMessage`

The `WhatsAppChannel` holds the `sock: WASocket` internally. The orchestrator never touches it.

### 0.4 Refactor `src/index.ts` to Use Registry

- Replace `sock.sendMessage()` calls with `registry.getForJid(jid).sendMessage()`
- Replace `sendFileMessage(sock, ...)` with `registry.getForJid(jid).sendFile()`
- `processMessage()` accepts `IncomingMessage` instead of `NewMessage` — trigger detection becomes:
  ```
  const shouldRespond = isMainGroup || group.alwaysProcess || hasTrigger || msg.mentionsBot || msg.replyToBot;
  ```
- IPC watcher routes through registry: `registry.getForJid(data.chatJid).sendMessage(parseJid(data.chatJid).nativeId, text)`

### 0.4a Refactor DM Registration to Be Channel-Agnostic

Currently [src/index.ts:264-294](src/index.ts#L264-L294) detects DMs by checking WhatsApp JID suffixes. Refactor to use `IncomingMessage.isDm`:

```
// Before (WhatsApp-specific):
if (!group && (msg.chat_jid.endsWith('@s.whatsapp.net') || msg.chat_jid.endsWith('@lid')))

// After (channel-agnostic):
if (!group && msg.isDm)
```

**DM pending request flow** ([src/pending-dm.ts](src/pending-dm.ts)):
- `PendingDmRequest` already stores `jid` — now stores canonical JID (e.g., `telegram:98765432`)
- `addPendingRequest()` works as-is (JID is just a string)
- Admin notification (line 284) currently calls `sendMessage(mainJid, ...)` directly — refactor to route through registry:
  ```
  const mainChannel = registry.getForJid(mainJid);
  await mainChannel.sendMessage(parseJid(mainJid).nativeId, notificationText);
  ```
- `phone` field on `PendingDmRequest` — generalize to `userId` (phone number for WhatsApp, user ID for Telegram, PSID for Messenger). Used for folder naming (`dm-{userId}`).

**DM registration via `register_group` IPC** ([src/index.ts:847-857](src/index.ts#L847-L857)):
- Currently auto-detects DM by `@s.whatsapp.net` / `@lid` suffix. Refactor to detect by channel:
  ```
  const parsed = parseJid(data.jid);
  const isDmReg = parsed.channel === 'whatsapp'
    ? (parsed.nativeId.endsWith('@s.whatsapp.net') || parsed.nativeId.endsWith('@lid'))
    : !data.jid.includes('@g.us'); // Telegram/Messenger DMs don't have group suffixes
  ```
  Or simpler: each channel has a static `isDmJid(nativeId): boolean` method, and the orchestrator calls `registry.get(parsed.channel).isDmJid(parsed.nativeId)`.

**Container credential mounting for DM users** ([src/container-runner.ts:179-208](src/container-runner.ts#L179-L208)):
- Already folder-based (`groups/{folder}/.credentials/`) — works identically regardless of channel. No changes needed.

**Welcome CLAUDE.md for DM users** ([src/index.ts:146-151](src/index.ts#L146-L151)):
- Update template to be channel-agnostic (remove "WhatsApp-friendly formatting" reference)
- Mention voice capabilities when Eleven Labs is configured

### 0.5 Update `src/file-sender.ts`

Currently takes `WASocket` as first param. Refactor to delegate to channel registry — or simplify it to a utility that the channel's `sendFile()` calls internally.

### 0.6 Update Types

**Edit: `src/types.ts`**
- Add `channel?: ChannelType` to `RegisteredGroup` (defaults to `'whatsapp'` for backward compat)
- Add `IpcVoiceMessage` type for Phase 2
- Generalize `PendingDmRequest.phone` → `userId` (phone for WhatsApp, numeric ID for Telegram, PSID for Messenger)
- Add `channel: ChannelType` to `PendingDmRequest` so admin knows which platform the request came from

### 0.7 Database Migration

**Edit: `src/db.ts`**
- In `initDatabase()`, add migration: prefix all existing JIDs with `whatsapp:`
  ```sql
  UPDATE chats SET jid = 'whatsapp:' || jid WHERE jid NOT LIKE '%:%';
  UPDATE messages SET chat_jid = 'whatsapp:' || chat_jid WHERE chat_jid NOT LIKE '%:%';
  UPDATE scheduled_tasks SET chat_jid = 'whatsapp:' || chat_jid WHERE chat_jid NOT LIKE '%:%';
  ```
- `registered_groups.json` loader: auto-add `whatsapp:` prefix to bare keys, add `channel: 'whatsapp'` default

### Critical files modified in Phase 0:
- [src/index.ts](src/index.ts) — slim down from ~1080 to ~500 lines, channel-agnostic DM flow
- [src/types.ts](src/types.ts) — add `channel` to RegisteredGroup + PendingDmRequest
- [src/pending-dm.ts](src/pending-dm.ts) — generalize phone→userId, channel-aware notifications
- [src/db.ts](src/db.ts) — JID prefix migration
- [src/file-sender.ts](src/file-sender.ts) — remove WASocket dependency
- [src/container-runner.ts](src/container-runner.ts) — no DM mount changes needed (already folder-based)
- [src/media-handler.ts](src/media-handler.ts) — may stay as-is (WhatsApp channel calls it internally)

---

## Phase 1: Telegram Channel

### 1.1 Dependencies

- `npm install grammy` — TypeScript-first Telegram Bot framework, active maintenance, supports polling + webhooks

### 1.2 Telegram Channel Implementation

**New file: `src/channels/telegram.ts`**

- `TelegramChannel implements Channel`
- Constructor takes bot token
- `connect()`: registers `bot.on('message', ...)` handler, starts long polling via `bot.start()` (webhook mode if `TELEGRAM_WEBHOOK_URL` is set)
- Message conversion: grammy `Context` → `IncomingMessage`
  - `chatJid`: `makeJid('telegram', ctx.chat.id.toString())`
  - `isGroup`: `chat.type === 'group' || 'supergroup'`
  - `mentionsBot`: checks entities for `@botusername` mention
  - `replyToBot`: `reply_to_message?.from?.id === bot.botInfo.id`
  - `mediaType`: detect from `msg.photo`, `msg.video`, `msg.audio`, `msg.voice`, `msg.document`
  - Media download: `bot.api.getFile(file_id)` → fetch from Telegram CDN → Buffer
- `sendMessage()`: `bot.api.sendMessage(chatId, text)`
- `sendFile()`: dispatch to `sendPhoto/sendVideo/sendAudio/sendDocument` based on mimetype
- `sendVoice()`: `bot.api.sendVoice(chatId, InputFile(buffer))`
- `setTyping()`: `bot.api.sendChatAction(chatId, 'typing')` (auto-expires after 5s)

### 1.3 Trigger Pattern + DM Support for Telegram

Telegram bots have natural trigger mechanisms. The channel sets `mentionsBot`, `replyToBot`, and `isDm` on `IncomingMessage`. The orchestrator's `processMessage()` handles these flags (from Phase 0 refactor):
- **Registered DMs** (`alwaysProcess: true`): Always respond, full access to Gmail/Calendar/Drive/voice/tasks
- **Unregistered DMs**: Trigger pending DM request (same flow as WhatsApp — admin approval required)
- **Groups**: Respond on `@bot` mention, reply-to-bot, or `@AssistantName` trigger prefix
- **Bot commands**: `/ask ...` style commands (optional, can be added later)

**Telegram DM detection**: `chat.type === 'private'` → sets `isDm: true` on `IncomingMessage`. The folder for a Telegram DM user would be `dm-tg-{userId}` (distinguished from WhatsApp DMs which use `dm-{phone}`).

**Credential setup for Telegram DM users**: Same per-folder `.credentials/` structure. The welcome CLAUDE.md explains how to set up Google integrations. Admin can also configure Eleven Labs voice per-user.

### 1.4 Configuration

**Edit: `src/config.ts`**
```
TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL  // optional, uses polling if unset
```

### 1.5 Registration in Main

**Edit: `src/index.ts` `main()`**
```
if (TELEGRAM_BOT_TOKEN) {
  registry.register(new TelegramChannel(TELEGRAM_BOT_TOKEN));
}
```

### 1.6 Auth Script

**New file: `src/channels/telegram-auth.ts`** — validates token via `getMe()`, prints bot info.
Add npm script: `"auth:telegram": "tsx src/channels/telegram-auth.ts"`

---

## Phase 2: Eleven Labs Voice

### 2.1 TTS Service

**New file: `src/elevenlabs.ts`**

- `ElevenLabsService` class
- `textToSpeech(text, voiceId?)` → `Buffer` (ogg/opus format — compatible with WhatsApp and Telegram voice notes)
  - POST to `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`
  - Headers: `xi-api-key`, `Content-Type: application/json`
  - Body: `{ text, model_id: 'eleven_monolingual_v1', output_format: 'ogg_opus' }`
- `cloneVoice(name, audioBuffers[])` → `string` (new voice ID)
  - POST to `https://api.elevenlabs.io/v1/voices/add` with multipart form data
  - Admin-only operation
- `listVoices()` → voice list (for agent to choose from)

### 2.2 New IPC Tool: `send_voice`

**Edit: `container/agent-runner/src/ipc-mcp.ts`**

Add new MCP tool:
```
send_voice(text: string, voice_id?: string)
```
- Writes IPC file with `type: 'voice'`, text, voiceId, chatJid, groupFolder
- Host-side IPC watcher calls `elevenLabsService.textToSpeech()` then `channel.sendVoice()`
- Fallback: if no Eleven Labs key configured, sends as text message

### 2.3 IPC Watcher Update

**Edit: `src/index.ts` `startIpcWatcher()`**

Add handler for `data.type === 'voice'`:
1. Call `elevenLabsService.textToSpeech(data.text, data.voiceId)`
2. Route audio buffer to `registry.getForJid(data.chatJid).sendVoice(nativeId, audioBuffer)`
3. Fallback to text if Eleven Labs unavailable

### 2.4 Configuration

**Edit: `src/config.ts`**
```
ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
ELEVENLABS_DEFAULT_VOICE_ID = process.env.ELEVENLABS_DEFAULT_VOICE_ID
```

Pass `ELEVENLABS_API_KEY` to container env filter in `container-runner.ts` so the agent knows voice is available.

### 2.5 Container Type Update

**Edit: `src/types.ts`**
```typescript
interface IpcVoiceMessage {
  type: 'voice';
  chatJid: string;
  text: string;
  voiceId?: string;
  groupFolder: string;
  timestamp: string;
}
```

---

## Phase 3: Messenger (Future)

- Library: Raw Meta Graph API or `messenger-platform-node-sdk`
- Webhook required (no polling) — needs shared webhook server (`src/channels/webhook-server.ts`)
- JID format: `messenger:t_<psid>`
- 24-hour messaging window constraint
- Same `Channel` interface implementation

## Phase 4: Viber (Future)

- Library: `viber-bot` or raw REST API
- Webhook required
- JID format: `viber:<user_id>`
- Media via URL upload (different from buffer-based approach)
- Same `Channel` interface implementation

For Phases 3-4, a shared `WebhookServer` class will be needed (also used by Telegram in webhook mode). This can be a simple HTTP server with route registration.

---

## Agent Team Structure

```
ORCHESTRATOR (Opus)
│
├── Phase 0: Shared Contracts (Sonnet)
│   └── src/channels/channel.ts, src/channels/registry.ts, types.ts updates
│
├── Phase 1 (parallel, git worktrees):
│   ├── Agent A: WhatsApp Extraction (Sonnet)
│   │   └── Extract from index.ts → src/channels/whatsapp.ts
│   ├── Agent B: DB Migration + Index Refactor (Sonnet)
│   │   └── db.ts migration, index.ts channel-agnostic rewrite
│   └── Agent C: Tests (Sonnet)
│       └── Unit tests for channel.ts, registry.ts, JID parsing
│
├── Phase 1 Gate: Merge → verify WhatsApp still works
│
├── Phase 2 (parallel, git worktrees):
│   ├── Agent D: Telegram Channel (Sonnet)
│   │   └── src/channels/telegram.ts + tests
│   └── Agent E: Eleven Labs Service (Sonnet)
│       └── src/elevenlabs.ts + send_voice IPC tool + tests
│
├── Phase 2 Gate: Merge → verify Telegram + voice work
│
└── Phase 3: Integration (Orchestrator)
    └── Wire everything, full test suite, manual E2E test
```

---

## Testing & Verification

### Unit Tests
- `src/__tests__/channel.test.ts` — `parseJid()`, `makeJid()`, legacy fallback, `isDmJid()` per channel
- `src/__tests__/registry.test.ts` — register, lookup, route by JID
- `src/__tests__/whatsapp-channel.test.ts` — message conversion, mention detection, media type mapping, DM detection
- `src/__tests__/telegram-channel.test.ts` — grammy Context → IncomingMessage, bot mention/reply detection, DM detection (`chat.type === 'private'`), send methods
- `src/__tests__/elevenlabs.test.ts` — TTS API call, error handling, fallback
- `src/__tests__/pending-dm.test.ts` — DM request flow with canonical JIDs across channels, admin notification routing

### Integration Tests
- `src/__tests__/ipc-routing.test.ts` — IPC messages with `whatsapp:` and `telegram:` prefixes route to correct channel
- Legacy bare JIDs route to WhatsApp (backward compat)
- DM registration flow: unregistered Telegram DM → pending request → admin approval → user gets `isDm: true`, `alwaysProcess: true`, credentials dirs created
- DM users can use all IPC tools (send_message, send_file, send_voice, schedule_task)

### Manual E2E Verification
1. Start with only `WHATSAPP_AUTH` — verify WhatsApp works identically to before (groups + DMs)
2. Add `TELEGRAM_BOT_TOKEN` — send messages to Telegram bot in a group, verify responses
3. DM the Telegram bot — verify pending request appears in WhatsApp admin chat, approve it, verify Telegram DM user can now chat freely
4. Verify Telegram DM user has credential dirs created, can use Gmail/Calendar/Drive once configured
5. Add `ELEVENLABS_API_KEY` — test `send_voice` from agent in both WhatsApp and Telegram (groups and DMs)
6. Run full test suite: `npm test`
7. Run build: `npm run build`
8. Rebuild container: `./container/build.sh`
