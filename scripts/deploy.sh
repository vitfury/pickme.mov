#!/bin/bash
set -euo pipefail

# Deploy script for pickme.mov
# Builds code on the host (fast, cached) and restarts containers with volume mounts.
# Base image is only rebuilt when dependencies change.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

# --- Base image rebuild detection ---
NEED_BASE_REBUILD=false

if [ ! -f .base-image-built ]; then
  echo "==> Base image marker not found, building..."
  NEED_BASE_REBUILD=true
elif ! diff -q package-lock.json .base-image-lockfile >/dev/null 2>&1; then
  echo "==> package-lock.json changed, rebuilding base image..."
  NEED_BASE_REBUILD=true
elif ! diff -q server/package.json .base-image-server-pkg >/dev/null 2>&1; then
  echo "==> server/package.json changed, rebuilding base image..."
  NEED_BASE_REBUILD=true
fi

if [ "$NEED_BASE_REBUILD" = true ]; then
  docker build -f Dockerfile.base -t pickme-app-base .
  cp package-lock.json .base-image-lockfile
  cp server/package.json .base-image-server-pkg
  touch .base-image-built
  echo "==> Base image rebuilt."
fi

# --- Write git hash for client version display ---
git rev-parse --short HEAD > .git-hash

# --- Build inside Docker ---
echo "==> Building server & client inside Docker..."
docker run --rm \
  -v "$APP_DIR":/app \
  -w /app \
  node:20-alpine \
  sh -c "npm ci --workspaces && npm run build -w server && npm run build -w bot && npm run build -w client"

# --- Ensure scripts are executable ---
chmod +x scripts/docker-entrypoint.sh

# --- Restart containers ---
echo "==> Restarting containers..."
docker compose up -d

# nginx bind-mounts nginx/default.conf as a single file. git rewrites that file
# with a new inode on pull, and the container keeps the old one, so a config
# change is invisible to `up -d` and even to `nginx -s reload` — the container
# has to be recreated. Recreating also re-resolves the app container's IP, which
# otherwise leaves nginx serving 502s after the app is replaced above.
echo "==> Recreating nginx (picks up config and the app's new address)..."
docker compose up -d --force-recreate nginx

# --- Cleanup ---
docker image prune -f

echo "==> Deploy complete!"
