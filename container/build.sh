#!/bin/bash
# Build the NanoClaw agent container image
# Supports Apple Container (macOS) and Docker (Linux)
#
# Usage: ./container/build.sh [tag] [--runtime docker|container]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"
RUNTIME="${NANOCLAW_CONTAINER_RUNTIME:-}"

# Parse --runtime flag
for arg in "$@"; do
  case $arg in
    --runtime=*) RUNTIME="${arg#*=}" ;;
    --runtime) shift; RUNTIME="${2:-}" ;;
  esac
done

# Auto-detect runtime
if [ -z "$RUNTIME" ]; then
  if [ "$(uname)" = "Darwin" ] && command -v container &>/dev/null; then
    RUNTIME="container"
  else
    RUNTIME="docker"
  fi
fi

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"
echo "Runtime: ${RUNTIME}"

$RUNTIME build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | $RUNTIME run -i ${IMAGE_NAME}:${TAG}"
