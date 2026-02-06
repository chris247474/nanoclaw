#!/bin/bash
# First-time VPS setup for NanoClaw
# Run as root on a fresh Ubuntu 22.04+ VPS
#
# Usage: curl -sSL <url> | bash
#    or: scp deploy/setup-vps.sh root@host: && ssh root@host bash setup-vps.sh

set -euo pipefail

echo "=== NanoClaw VPS Setup ==="

# Create service user with docker access
if ! id nanoclaw &>/dev/null; then
  useradd -r -m -s /bin/bash nanoclaw
  echo "Created nanoclaw user"
fi

# Install Node.js 22
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  echo "Installed Node.js $(node -v)"
fi

# Install Docker
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | bash
  echo "Installed Docker"
fi

# Add nanoclaw to docker group
usermod -aG docker nanoclaw

# Install SQLite CLI (for backups)
apt-get install -y sqlite3

# Create application directory
mkdir -p /opt/nanoclaw/{store,data,groups,logs}
chown -R nanoclaw:nanoclaw /opt/nanoclaw

# Install systemd service
if [ -f /opt/nanoclaw/deploy/nanoclaw.service ]; then
  cp /opt/nanoclaw/deploy/nanoclaw.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable nanoclaw
  echo "Installed and enabled systemd service"
fi

# Setup daily backup cron
if [ -f /opt/nanoclaw/deploy/backup.sh ]; then
  chmod +x /opt/nanoclaw/deploy/backup.sh
  echo "0 3 * * * nanoclaw /opt/nanoclaw/deploy/backup.sh" > /etc/cron.d/nanoclaw-backup
  echo "Configured daily backup at 3am"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Deploy code:    ./deploy/deploy.sh nanoclaw@$(hostname -I | awk '{print $1}')"
echo "  2. Create .env:    ssh nanoclaw@host 'nano /opt/nanoclaw/.env'"
echo "     Required vars:  ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"
echo "  3. Transfer auth:  rsync -avz store/auth/ nanoclaw@host:/opt/nanoclaw/store/auth/"
echo "  4. Build agent:    ssh nanoclaw@host 'cd /opt/nanoclaw && docker build -t nanoclaw-agent:latest container/'"
echo "  5. Start:          ssh root@host 'systemctl start nanoclaw'"
echo "  6. Check logs:     ssh root@host 'journalctl -u nanoclaw -f'"
