#!/bin/bash
# Backup NanoClaw state
# Run daily via cron: 0 3 * * * nanoclaw /opt/nanoclaw/deploy/backup.sh
#
# Backs up: SQLite DB, WhatsApp auth state, router state
# Retention: 7 days

set -euo pipefail

NANOCLAW_DIR="${NANOCLAW_DIR:-/opt/nanoclaw}"
BACKUP_DIR="${NANOCLAW_DIR}/backups"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "${BACKUP_DIR}"

# SQLite online backup (safe while db is in use)
if [ -f "${NANOCLAW_DIR}/store/messages.db" ]; then
  sqlite3 "${NANOCLAW_DIR}/store/messages.db" ".backup '${BACKUP_DIR}/messages-${DATE}.db'"
  echo "Database backed up"
fi

# WhatsApp auth state backup
if [ -d "${NANOCLAW_DIR}/store/auth" ]; then
  tar czf "${BACKUP_DIR}/auth-${DATE}.tar.gz" -C "${NANOCLAW_DIR}/store" auth/
  echo "Auth state backed up"
fi

# Router state files
for f in router_state.json sessions.json registered_groups.json; do
  if [ -f "${NANOCLAW_DIR}/data/${f}" ]; then
    cp "${NANOCLAW_DIR}/data/${f}" "${BACKUP_DIR}/${f%.json}-${DATE}.json"
  fi
done
echo "Router state backed up"

# Retain 7 days of backups
find "${BACKUP_DIR}" -name "*.db" -mtime +7 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +7 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "*.json" -mtime +7 -delete 2>/dev/null || true

echo "Backup complete: ${DATE}"
