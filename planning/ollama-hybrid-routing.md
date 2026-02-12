# Hybrid Model Routing: Ollama Cloud for Non-Main Groups

## Context
Cost savings by routing non-main WhatsApp groups to Ollama Cloud ($20/mo flat) while keeping Claude Sonnet for the main group. Ollama v0.14+ natively speaks the Anthropic Messages API, so the Claude Agent SDK gets proper tool calling protocol without any translation layer. The third-party fallback system already exists in the agent runner.

## Architecture

```
Main group message → Container → Claude API (Sonnet 4.5) [$$$]
Non-main group msg → Container → Host Ollama daemon → Ollama Cloud [$20/mo flat]
                                  ↓ (if Ollama fails)
                                  Claude API (Haiku 4.5) [$ fallback]
```

The local Ollama daemon is lightweight (just a proxy) — inference happens on Ollama's cloud servers. Container reaches host Ollama via vmnet gateway: `http://192.168.64.1:11434`

## Changes Required

### 1. Install & configure Ollama on host Mac

```bash
# Install Ollama
brew install ollama

# Sign in to Ollama Cloud (required for :cloud models)
ollama login

# No need to pull model weights — :cloud models run remotely
# Just verify it works:
ollama run qwen3-coder:cloud "hello"

# Bind to all interfaces so container can reach it
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

### 2. Set OPENAI_* vars in `.env` pointing to host Ollama

```env
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen3-coder:cloud
OPENAI_BASE_URL=http://192.168.64.1:11434
```

This uses the existing third-party model mechanism: the agent runner remaps `OPENAI_*` → `ANTHROPIC_*`, tries Ollama first, falls back to Claude if it fails.

### 3. Filter OPENAI_* vars from main group (~5 lines)

**File:** `src/container-runner.ts` (line ~297, after the existing `if (!isMain)` block)

Add an `else` branch:

```typescript
if (!isMain) {
  // existing: override CLAUDE_MODEL to Haiku for fallback
  // ... (unchanged)
} else {
  // Main group: strip OPENAI_* vars so it always uses Claude Sonnet
  const mainLines = filteredLines.filter(
    (line) => !line.trim().startsWith('OPENAI_')
  );
  filteredLines.length = 0;
  filteredLines.push(...mainLines);
}
```

### 4. No container rebuild needed
Env vars are passed at runtime via mounted env files. No Dockerfile or agent runner code changes.

## How It Works After Changes

| Group | Primary Model | Fallback | Cost |
|-------|--------------|----------|------|
| Main group | Claude Sonnet 4.5 | Claude Haiku 4.5 | $$$ |
| Non-main groups | Ollama (local, free) | Claude Haiku 4.5 | Free (fallback: $) |

## Recommended Cloud Models (`:cloud` tag, no local RAM needed)

| Model | Tool Calling | Notes |
|-------|-------------|-------|
| `qwen3-coder:cloud` | Excellent | Community favorite for Claude Code, 128K context |
| `kimi-k2.5:cloud` | Excellent | 200-300 sequential tool calls, native agentic model |
| `glm-4.7:cloud` | Good | Fast, optimized for speed |
| `minimax-m2.1:cloud` | Good | Recommended by Ollama for coding |

## Files Modified
- `src/container-runner.ts` — add `else` block to filter OPENAI_* from main group
- `.env` — add OPENAI_* vars pointing to local Ollama

## Verification
1. Start Ollama: `OLLAMA_HOST=0.0.0.0:11434 ollama serve`
2. Verify cloud model works: `ollama run qwen3-coder:cloud "hello"`
3. Verify host reachable from container: `container run --rm ubuntu curl -s http://192.168.64.1:11434/v1/models`
4. Update `.env` with OPENAI_* vars
5. `npm run build`
6. Send a test message to a **non-main group** — check container logs for `Using 3rd party model: qwen3-coder:cloud via http://192.168.64.1:11434`
7. Send a test message to the **main group** — confirm logs show `Using Claude model: claude-sonnet-4-5-20250929`
8. Test tool-heavy workflow in non-main group (ask the agent to read a file, edit it, run a command)
9. If tool calling fails, check logs for `Attempting fallback to Claude...` (fallback is automatic)

## Risks & Mitigations
- **Host networking**: Container must reach `192.168.64.1:11434`. If vmnet gateway IP differs, check with `container run --rm ubuntu ip route | grep default`.
- **Ollama daemon must be running**: If Ollama is down, the fallback kicks in (Claude Haiku), so no outage — just unexpected costs.
- **Tool calling quality**: Non-Claude models may struggle with Anthropic-specific tool schemas. The automatic Claude fallback catches failures.
- **Ollama Cloud rate limits**: $20/mo Pro tier has usage caps. If you hit limits, fallback to Claude kicks in. Monitor usage on ollama.com dashboard.
