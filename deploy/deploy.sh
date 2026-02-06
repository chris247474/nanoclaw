#!/bin/bash
# Deploy NanoClaw to a remote VPS
#
# Usage: ./deploy/deploy.sh user@host
#
# This script builds locally, syncs files, installs deps, and restarts the service.
# It does NOT overwrite state directories (store/, data/, groups/) or .env.

set -euo pipefail

REMOTE="${1:?Usage: deploy.sh user@host}"
REMOTE_DIR="/opt/nanoclaw"

echo "=== Building locally ==="
npm run build

echo "=== Syncing to ${REMOTE}:${REMOTE_DIR} ==="
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='store' \
  --exclude='data' \
  --exclude='groups' \
  --exclude='logs' \
  --exclude='.env' \
  --exclude='.git' \
  --exclude='.claude' \
  ./ "${REMOTE}:${REMOTE_DIR}/"

echo "=== Installing dependencies ==="
ssh "${REMOTE}" "cd ${REMOTE_DIR} && npm ci --production"

echo "=== Restarting service ==="
ssh "${REMOTE}" "sudo systemctl restart nanoclaw"

echo "=== Checking status ==="
ssh "${REMOTE}" "sudo systemctl status nanoclaw --no-pager" || true

echo ""
echo "Deploy complete. View logs: ssh ${REMOTE} 'sudo journalctl -u nanoclaw -f'"
