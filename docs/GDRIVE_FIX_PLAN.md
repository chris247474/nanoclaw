# Fix Google Drive MCP Integration

## Context

Google Drive MCP fails on every container launch with `Cannot find module '@piotr-agier/google-drive-mcp/dist/index.js'`. Gmail and Calendar work fine. The root cause is a module resolution bug in the `gdrive-mcp-no-resources.cjs` wrapper — it uses `require.resolve()` to find the globally-installed package, but Node's require resolution from `/app/` doesn't search the global npm prefix (`/usr/local/lib/node_modules/`).

Gmail and Calendar don't have this problem because they're invoked directly by binary name (`gmail-mcp`, `google-calendar-mcp`) which are in PATH. The Drive wrapper exists to strip the MCP `resources` capability that causes 20-60s init delays.

**Evidence**: Debug logs at `data/sessions/personal-dm/.claude/debug/` show the crash consistently:
```
MCP server "gdrive": Connection failed after 56ms: MCP error -32000: Connection closed
Error: Cannot find module '@piotr-agier/google-drive-mcp/dist/index.js'
```

## Fix

**2-line change** in [gdrive-mcp-no-resources.cjs](../container/gdrive-mcp-no-resources.cjs):

Remove line 15:
```js
const gdriveBin = require.resolve('@piotr-agier/google-drive-mcp/dist/index.js');
```

Change line 17 from:
```js
const child = spawn(process.execPath, [gdriveBin], {
```
to:
```js
const child = spawn('google-drive-mcp', [], {
```

This spawns the binary by name (in PATH from `npm install -g`) instead of trying to resolve the module path. Same pattern as Gmail and Calendar. The resource-stripping proxy logic is unchanged.

No changes needed to [agent-runner/src/index.ts](../container/agent-runner/src/index.ts) — both the admin and standard code paths already invoke the wrapper correctly via `command: 'node', args: ['/app/gdrive-mcp-no-resources.cjs']`.

## Verification

1. Rebuild container: `./container/build.sh`
2. Smoke test binary exists: `docker run --rm nanoclaw-agent:latest which google-drive-mcp`
3. Smoke test wrapper starts: `docker run --rm -i nanoclaw-agent:latest node /app/gdrive-mcp-no-resources.cjs` (should wait for stdin, not crash)
4. Integration test: send a message to a DM with Drive credentials, check `data/sessions/{folder}/.claude/debug/latest` for successful gdrive connection with `hasResources: false`
