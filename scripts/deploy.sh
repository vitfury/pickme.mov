#!/bin/bash
set -euo pipefail

# Deploy script for pickme.mov
# Builds code on the host (fast, cached) and restarts containers with volume mounts.
# Base image is only rebuilt when dependencies change.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

# Source nvm if available (VPS setup)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

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

# --- Host builds ---
echo "==> Installing dependencies..."
npm ci

echo "==> Building server..."
npm run build -w server

echo "==> Building client..."
npm run build -w client

# --- Nginx config ---
cp nginx/default.conf nginx/active.conf

# --- Restart containers ---
echo "==> Restarting containers..."
docker compose up -d

# --- Cleanup ---
docker image prune -f

echo "==> Deploy complete!"
