#!/usr/bin/env bash
# Safe update: pull → migrate → rebuild → sync standalone assets → restart.
# Usage on the VPS: bash deploy/update.sh
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

git pull --ff-only

# Backend dependencies only when requirements changed.
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "backend/requirements"; then
  "$APP_ROOT/backend/.venv/bin/pip" install -q -r "$APP_ROOT/backend/requirements.txt"
fi

# Production settings live in the repository-root .env used by systemd.
set -a
. "$APP_ROOT/.env"
set +a
cd "$APP_ROOT/backend"
.venv/bin/alembic upgrade head

cd "$APP_ROOT/frontend"
npm ci --silent
npm run build

# Next standalone needs static + public beside server.js.
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
chown -R nexora:nexora .next/standalone

systemctl restart nexora-backend nexora-frontend
sleep 2
systemctl is-active nexora-backend nexora-frontend caddy
echo "Deploy complete."
