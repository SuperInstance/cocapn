#!/usr/bin/env bash
# cocapn deploy — one-command deploy to local, docker, or cloudflare.
set -euo pipefail

PLATFORM="${1:-}"
SEED_DIR="$(cd "$(dirname "$0")/.." && pwd)"

detect_platform() {
  if command -v wrangler &>/dev/null && [ -f "$SEED_DIR/wrangler.toml" ]; then
    echo "cloudflare"
  elif command -v docker &>/dev/null && [ -f "$SEED_DIR/Dockerfile" ]; then
    echo "docker"
  else
    echo "local"
  fi
}

deploy_local() {
  echo "[cocapn] Deploying locally..."
  cd "$SEED_DIR"
  if [ ! -d "node_modules" ]; then npm install; fi
  npm run build 2>/dev/null || true
  echo "[cocapn] Starting on http://localhost:3100"
  node dist/index.js --web --port 3100
}

deploy_docker() {
  echo "[cocapn] Deploying with Docker..."
  cd "$SEED_DIR"
  docker compose up --build -d
  echo "[cocapn] Live at http://localhost:${COCAPN_PORT:-3100}"
}

deploy_cloudflare() {
  echo "[cocapn] Deploying to Cloudflare Workers..."
  cd "$SEED_DIR"
  if [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "[cocapn] Warning: No API key set. Run: wrangler secret put DEEPSEEK_API_KEY"
  fi
  npx wrangler deploy
  echo "[cocapn] Deployed! Run: npx wrangler tail   (to see logs)"
}

if [ -z "$PLATFORM" ]; then
  PLATFORM=$(detect_platform)
fi

echo "[cocapn] Platform: $PLATFORM"

case "$PLATFORM" in
  local)       deploy_local ;;
  docker)      deploy_docker ;;
  cloudflare)  deploy_cloudflare ;;
  *)
    echo "Usage: $0 [local|docker|cloudflare]"
    echo "  local       — run directly with Node.js"
    echo "  docker      — build and run with Docker Compose"
    echo "  cloudflare  — deploy to Cloudflare Workers"
    exit 1
    ;;
esac
