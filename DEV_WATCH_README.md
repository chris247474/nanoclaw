# Development Watcher

Automatically rebuilds and restarts the nanoclaw service when source code changes.

## Auto-Start Setup (Recommended)

Install the watcher as a background service that starts automatically:

```bash
./scripts/install-watcher.sh
```

This will:
- Install the watcher as a launchd service
- Start automatically when you log in
- Keep running in the background
- Restart automatically if it crashes

**View logs:**
```bash
tail -f logs/watcher.log
```

**Stop the watcher:**
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.watcher.plist
```

**Start the watcher again:**
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.watcher.plist
```

## Manual Usage

If you prefer to run the watcher manually (not recommended for development):

```bash
npm run watch
```

The watcher monitors:
- `src/**/*.ts` - Main nanoclaw source code
- `container/agent-runner/src/**/*.ts` - Container agent source code

## What it does

### When main source (`src/`) changes:
1. Runs `npm run build` to compile TypeScript
2. Restarts the nanoclaw service via launchctl
3. Shows build errors if any

### When container source (`container/agent-runner/src/`) changes:
1. Runs `npm run build` in the agent-runner directory
2. Rebuilds the container image (`container build -t nanoclaw-agent:latest .`)
3. Restarts the nanoclaw service
4. Shows build errors if any

## Features

- **Debounced rebuilds** - Waits for file changes to settle before rebuilding
- **Queue management** - Queues changes that happen during a rebuild
- **Error handling** - Shows clear error messages if builds fail
- **Graceful shutdown** - Press Ctrl+C to stop the watcher

## Requirements

- The nanoclaw service must be installed via launchctl at `~/Library/LaunchAgents/com.nanoclaw.plist`
- The `container` command must be available (Apple Container or Docker)

## Troubleshooting

**Watcher doesn't detect changes:**
- Make sure you're editing files in the `src/` or `container/agent-runner/src/` directories
- Only `.ts` files trigger rebuilds

**Service restart fails:**
- Check that the launchd plist exists: `ls ~/Library/LaunchAgents/com.nanoclaw.plist`
- Verify the service name matches in the script

**Container rebuild fails:**
- Make sure the `container` command works: `container --version`
- Check Docker/container runtime is running
