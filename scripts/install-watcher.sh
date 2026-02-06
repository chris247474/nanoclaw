#!/bin/bash
# Install nanoclaw watcher service

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$HOME"
NPM_PATH=$(which npm)

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

# Generate the plist from template
PLIST_TEMPLATE="$PROJECT_ROOT/launchd/com.nanoclaw.watcher.plist"
PLIST_DEST="$HOME_DIR/Library/LaunchAgents/com.nanoclaw.watcher.plist"

# Replace placeholders
sed -e "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" \
    -e "s|{{HOME}}|$HOME_DIR|g" \
    -e "s|{{NPM_PATH}}|$NPM_PATH|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"

echo "✅ Watcher plist installed to: $PLIST_DEST"

# Load the service
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "✅ Watcher service loaded and started"
echo ""
echo "The watcher will now automatically:"
echo "  • Start when you log in"
echo "  • Monitor for code changes"
echo "  • Rebuild and restart nanoclaw automatically"
echo ""
echo "View logs: tail -f $PROJECT_ROOT/logs/watcher.log"
echo "Stop watcher: launchctl unload $PLIST_DEST"
