#!/usr/bin/env bash
# Safe update: pull → rebuild → sync standalone static assets → restart.
# Usage on the VPS:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

# Backend deps only when requirements changed
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "backend/requirements"; then
  .venv/bin/pip install -q -r backend/requirements.txt || true
fi

# DB migrations — no-op when already at head
cd backend && ../.venv/bin/alembic upgrade head && cd ..

cd frontend
npm ci --silent
npm run build

# Standalone server needs static + public copied next to server.js (per Next docs)
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
chown -R nexora:nexora .next/standalone

systemctl restart nexora-backend nexora-frontend
sleep 2
systemctl is-active nexora-backend nexora-frontend caddy
echo "Deploy complete."
