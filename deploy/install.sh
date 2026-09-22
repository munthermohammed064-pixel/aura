#!/usr/bin/env bash
# Nexora one-shot VPS installer — Ubuntu 22.04/24.04, no Docker.
# Sets up: Python venv backend (uvicorn via systemd), Next.js frontend
# (standalone via systemd), and Caddy for HTTPS (or plain :80 without a domain).
#
# Usage on a fresh VPS (as root):
#   git clone <repo> /opt/nexora && cd /opt/nexora
#   cp .env.example .env   # then edit DOMAIN (and SMTP if you want real email)
#   sudo bash deploy/install.sh
#
# Idempotent: safe to re-run — it rebuilds, remigrates and restarts services.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — run: cp .env.example .env"; exit 1; }
set -a; . "$ENV_FILE"; set +a
DOMAIN="${DOMAIN:-}"

# ---------- .env hardening (idempotent) ----------
set_env() { # set_env KEY VALUE — replace or append in .env
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else echo "$1=$2" >> "$ENV_FILE"; fi
}

SK="${SECRET_KEY:-}"
if [ "$SK" = "generate-a-long-random-string" ] || [ "${#SK}" -lt 32 ]; then
  NEW_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env SECRET_KEY "$NEW_SECRET"
  echo "==> Generated a random SECRET_KEY in .env"
fi
grep -q "^DATABASE_URL=" "$ENV_FILE" || set_env DATABASE_URL "sqlite:///./dev.db"

if [ -n "$DOMAIN" ]; then
  set_env FRONTEND_URL "https://$DOMAIN"
  set_env CORS_ORIGINS "https://$DOMAIN"
  set_env NEXT_PUBLIC_API_URL "https://$DOMAIN/api"
  echo "==> .env wired to https://$DOMAIN"
else
  PUB_IP="$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || true)"
  if [ -n "$PUB_IP" ]; then
    set_env FRONTEND_URL "http://$PUB_IP"
    set_env CORS_ORIGINS "http://$PUB_IP"
    set_env NEXT_PUBLIC_API_URL "http://$PUB_IP/api"
    echo "==> .env wired to http://$PUB_IP (no domain — set DOMAIN later + rerun for HTTPS)"
  fi
fi

if [ "${ADMIN_ID:-admin}" = "admin" ]; then
  NEW_ADMIN_ID="nx-admin-$(head -c6 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env ADMIN_ID "$NEW_ADMIN_ID"
  echo "==> Generated admin ID: $NEW_ADMIN_ID"
fi
if [ "${ADMIN_PASSWORD:-admin1234}" = "admin1234" ]; then
  NEW_ADMIN_PW="$(head -c9 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env ADMIN_PASSWORD "$NEW_ADMIN_PW"
  echo "==> Generated admin password: $NEW_ADMIN_PW  (saved in .env)"
fi
if [ -z "${NEXT_PUBLIC_ADMIN_PATH:-}" ]; then
  NEW_ADMIN_PATH="ops-$(head -c5 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env NEXT_PUBLIC_ADMIN_PATH "$NEW_ADMIN_PATH"
  echo "==> Generated hidden admin path: /nx/$NEW_ADMIN_PATH"
fi

# ---------- system packages ----------
echo "==> Installing system packages"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip curl caddy openssl sqlite3 >/dev/null

if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

# Swap so `next build` never OOMs on small VPS (<3GB RAM, no swap yet)
if [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 3000 ] && ! swapon --show | grep -q .; then
  echo "==> Low RAM — creating 2G swapfile"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# ---------- dedicated service user ----------
id -u nexora &>/dev/null || useradd -r -s /usr/sbin/nologin -d "$APP_DIR" nexora

# ---------- backend ----------
echo "==> Backend: venv + dependencies"
cd "$APP_DIR/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt

echo "==> Backend: database schema + seed"
set -a; . "$ENV_FILE"; set +a   # reload after hardening edits
.venv/bin/alembic upgrade head
.venv/bin/python seed.py

mkdir -p uploads
# nexora needs write on backend/ itself for dev.db + sqlite journal files
chown nexora:nexora "$APP_DIR/backend" uploads
chown -R nexora:nexora uploads
if [ -f dev.db ]; then chown nexora:nexora dev.db; fi
chmod 600 "$ENV_FILE"

# ---------- frontend ----------
echo "==> Frontend: install + production build"
cd "$APP_DIR/frontend"
# Write .env.local so build-time NEXT_PUBLIC_* values are exact regardless of
# whatever env files were copied from the dev machine.
{
  echo "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:8000/api}"
  echo "NEXT_PUBLIC_PLATFORM_NAME=${NEXT_PUBLIC_PLATFORM_NAME:-Nexora}"
  echo "NEXT_PUBLIC_ADMIN_PATH=${NEXT_PUBLIC_ADMIN_PATH:-ops-dev}"
} > .env.local
npm ci --no-audit --no-fund
npm run build
# Next standalone needs static assets + public dir next to server.js
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
chown -R nexora:nexora .next/standalone

# ---------- systemd services ----------
echo "==> systemd services (auto-restart on crash / reboot)"
install -m 0644 "$APP_DIR/deploy/nexora-backend.service" /etc/systemd/system/
install -m 0644 "$APP_DIR/deploy/nexora-frontend.service" /etc/systemd/system/
sed -i "s|__APP_DIR__|$APP_DIR|g" /etc/systemd/system/nexora-*.service
systemctl daemon-reload
systemctl enable nexora-backend nexora-frontend >/dev/null
systemctl restart nexora-backend nexora-frontend

# ---------- Caddy ----------
if [ -n "$DOMAIN" ]; then
  echo "==> Caddy HTTPS for $DOMAIN"
  sed "s|__DOMAIN__|$DOMAIN|g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
else
  echo "==> Caddy plain HTTP on :80 (no DOMAIN set)"
  cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
	encode zstd gzip
	handle /api/* { reverse_proxy 127.0.0.1:8000 }
	handle /uploads/* { reverse_proxy 127.0.0.1:8000 }
	handle /health { reverse_proxy 127.0.0.1:8000 }
	handle { reverse_proxy 127.0.0.1:3000 }
}
EOF
fi
systemctl reload caddy || systemctl restart caddy

# ---------- summary ----------
BASE_URL=""
if [ -n "$DOMAIN" ]; then BASE_URL="https://$DOMAIN"; else BASE_URL="http://$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || echo '<server-ip>')"; fi
echo
echo "Done. Backend 127.0.0.1:8000 · Frontend 127.0.0.1:3000"
echo "Public: $BASE_URL"
echo "Admin console: $BASE_URL/nx/$(grep -oP '^NEXT_PUBLIC_ADMIN_PATH=\K.*' "$ENV_FILE" 2>/dev/null || echo '<see .env>')"
echo "Admin ID: $(grep -oP '^ADMIN_ID=\K.*' "$ENV_FILE" 2>/dev/null || echo '<see .env>')"
[ -z "$DOMAIN" ] && echo "(set DOMAIN in .env + rerun for HTTPS)"
systemctl --no-pager --full status nexora-backend nexora-frontend | grep -E "●|Active:" || true
