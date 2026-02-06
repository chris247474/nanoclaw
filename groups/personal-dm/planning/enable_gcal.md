# Enable Google Calendar (Google Workspace MCP)

## Problem
Google Workspace MCP server (`@presto-ai/google-workspace-mcp`) times out on startup in the agent container. Calendar, Gmail, and Drive tools are unavailable.

## Root Cause
1. **Native module failure**: `keytar` requires compiled binaries; `npx` doesn't compile them
2. **Missing config directory**: `/home/node/.config/google-workspace-mcp/` doesn't exist in container
3. **Missing OAuth tokens**: Only `google_client_secret.json` (client ID/secret) exists — no user access/refresh tokens

## Fix Plan

### Step 1: Add package to agent-runner dependencies
- Add `@presto-ai/google-workspace-mcp` to `/workspace/project/container/agent-runner/package.json`
- This ensures native modules (`keytar`) get compiled during `npm install` at Docker build time

### Step 2: Update Dockerfile
- File: `/workspace/project/container/Dockerfile`
- Add `RUN mkdir -p /home/node/.config/google-workspace-mcp && chown node:node /home/node/.config/google-workspace-mcp`
- Ensure `npm install` in agent-runner triggers native module compilation (may need `node-gyp` build tools)

### Step 3: Update MCP server config in agent-runner
- File: `/workspace/project/container/agent-runner/src/index.ts` (lines ~278-286)
- Change from:
  ```typescript
  command: 'npx',
  args: ['-y', '@presto-ai/google-workspace-mcp'],
  ```
- Change to:
  ```typescript
  command: 'node',
  args: ['/path/to/installed/google-workspace-mcp/bin'],
  ```
  (or use the resolved binary path from node_modules/.bin)

### Step 4: OAuth token flow (manual, one-time)
- Run the Google Workspace MCP server locally (outside container) with the client secret
- Complete browser-based OAuth consent flow
- Obtain refresh token
- Store token at `/workspace/project/data/google_workspace_tokens.json`
- Mount token file into container at the expected location

### Step 5: Rebuild container image
- `docker build` the updated Dockerfile
- Restart nanoclaw to pick up changes

### Step 6: Verify
- Start a new admin session
- Confirm MCP server connects without timeout
- Test: list calendar events, create a test event, delete it

## Files to Modify
| File | Change |
|------|--------|
| `container/agent-runner/package.json` | Add `@presto-ai/google-workspace-mcp` dependency |
| `container/Dockerfile` | Add config dir creation, ensure build tools for native modules |
| `container/agent-runner/src/index.ts` | Update MCP server command from `npx` to installed binary |
| `data/google_workspace_tokens.json` | New file — OAuth tokens (one-time setup) |

## Risk
- Low risk — isolated to MCP server startup; doesn't affect core messaging
- OAuth token refresh logic needs to work inside the container (network access to Google APIs required)
- `keytar` may have OS-level dependencies (libsecret on Linux) — verify in container base image

## Effort Estimate
- ~2-3 hours implementation + testing
- Plus ~15 min manual OAuth flow
