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

# --- Build inside Docker ---
echo "==> Building server & client inside Docker..."
docker run --rm \
  -v "$APP_DIR":/app \
  -w /app \
  node:20-alpine \
  sh -c "npm ci --workspaces && npm run build -w server && npm run build -w client"

# --- Ensure scripts are executable ---
chmod +x scripts/docker-entrypoint.sh

# --- Nginx config ---
cp nginx/default.conf nginx/active.conf

# --- Restart containers ---
echo "==> Restarting containers..."
docker compose up -d

# --- Cleanup ---
docker image prune -f

echo "==> Deploy complete!"
