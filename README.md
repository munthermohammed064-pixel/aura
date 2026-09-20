# PLATFORM_NAME — Investment Platform (Scaffold)

Full-stack investment platform skeleton. **No brand is hardcoded** — the name comes
from `PLATFORM_NAME` env / admin settings; the theme from CSS vars in
`frontend/src/app/globals.css` + `tailwind.config.ts`.

## Compliance rules (built-in)

- No fixed/guaranteed returns anywhere. Packages expose an **estimated range** (min–max %)
  with "estimated — not guaranteed" labels.
- Mandatory risk-acknowledgement checkbox before registering and before every investment
  (`acknowledge_risk` is enforced server-side).
- Referral commissions are paid on **actual activity** (approved deposits), configurable
  levels/percentages from admin settings. Default: single level, fixed %.
- Legal pages served from admin-editable settings.

## Features

- Sequential member serials (`LA0001`, `LA0002`, …) — the serial is your referral code.
- Deposits require a receipt screenshot; admin approval credits the wallet via the ledger.
- Investments auto-settle at maturity (background task every 60s); admin adds realized returns.
- Realtime notification center (SSE stream + read/unread) in the nav.
- Password reset + email verification flows (SMTP when configured; dev echoes tokens otherwise).
- FAQ, dashboard charts, ticket conversations, session management, balance adjustment,
  package edit — all in the UI.
- Maintenance mode enforced by middleware (503 for non-admin API calls) + frontend gate.
- EN/AR toggle with RTL layout and self-hosted IBM Plex Sans Arabic + Amiri fonts.

## Stack

- **Backend**: FastAPI + SQLAlchemy + Alembic, PostgreSQL, JWT (access + refresh rotation,
  UA-bound sessions — admin sessions also IP-bound), bcrypt, rate limiting, immutable ledger (all balance moves are ledger entries
  with idempotency keys + `SELECT … FOR UPDATE` row locking).
- **Frontend**: Next.js App Router + TypeScript + Tailwind. Dark Apple-style minimalism
  with glassmorphism (`.glass` utility). RTL-ready (`dir` on `<html>`).

## Run locally

```bash
# backend
cd backend && python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
python seed.py          # creates dev.db (SQLite) + admin + defaults
uvicorn app.main:app --port 8000

# frontend (new terminal)
cd frontend && npm install && npm run dev -- -p 3001
```

- Frontend: http://localhost:3001
- API docs: http://localhost:8000/docs
- Admin console: `http://localhost:3001/nx/<NEXT_PUBLIC_ADMIN_PATH>` — hidden path, log in with
  `ADMIN_ID` + `ADMIN_PASSWORD` (not an email). install.sh auto-generates all three.

## Deploy on a VPS — one script, no Docker

Tested path: Ubuntu 22.04/24.04 on any $5 VPS (Contabo, DigitalOcean, Oracle Free…).
SQLite by default — zero external services to install.

```bash
git clone <repo> /opt/nexora && cd /opt/nexora
cp .env.example .env          # edit DOMAIN (optional) — SECRET_KEY & admin password auto-generate
sudo bash deploy/install.sh   # installs everything, builds, starts services
```

What the installer does:

- Installs Python 3 venv + Node 20 + Caddy (systemd-managed, `Restart=always`
  so a crash or reboot brings services back automatically).
- Runs `alembic upgrade head` + `seed.py` (both idempotent — safe every deploy).
- Builds Next.js standalone and serves it on :3000, API on :8000.
- If `DOMAIN` is set in `.env`, configures Caddy for automatic HTTPS
  (Let's Encrypt) — just point the domain's DNS A record at the VPS.

Manage it:

```bash
systemctl status nexora-backend nexora-frontend   # health
journalctl -u nexora-backend -f                   # live logs
systemctl restart nexora-backend                  # restart one service
```

To upgrade code later: `git pull && sudo bash deploy/install.sh` (idempotent).

Postgres instead of SQLite: set `DATABASE_URL` in `.env` to a `postgresql+psycopg2://`
URL before running the installer — nothing else changes.

## Backend dev (local)

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -r requirements.txt
alembic upgrade head      # or: python seed.py (create_all + seed)
uvicorn app.main:app --reload
pytest                    # ledger tests (SQLite in-memory)
```

## Structure

```
backend/app/
  api/        routers: auth, users, wallet, packages, misc, admin
  core/       security (JWT/bcrypt), deps (auth guards)
  models/     user, finance (ledger/packages/deposits/…), platform (settings/audit/…)
  services/   ledger (accounting), referral, settings
frontend/src/
  app/        landing, auth, dashboard, packages, wallet, referrals, markets,
              support, profile, legal/[page], admin
  components/ Glass primitives, Nav
  lib/api.ts  fetch wrapper + refresh-token handling
```

## What's configurable (no code changes needed)

| Thing | Where |
|---|---|
| Platform name | `PLATFORM_NAME` env + `platform` setting key |
| Packages (names, ranges, limits) | Admin → Packages |
| Referral levels & % | `referral` setting (`levels`, `l1_pct`…) |
| Deposit/withdrawal limits & fees | `deposit` / `withdrawal` settings |
| Payment methods | Admin → payment methods API |
| Terms/Privacy text | `legal` setting |
| Wheel/raffle | `wheel` setting + admin raffle endpoints |
| Theme colors | `globals.css` CSS vars |

## TODO before launch

- Point `SMTP_*` env vars at a real provider — until then `/auth/forgot` and
  `/auth/send-verification` echo the token in the API response (dev mode).
- Switch `DATABASE_URL` to PostgreSQL and run `alembic upgrade head`
  (initial revision `02fe6955ca16` covers the full schema).
- Change `SECRET_KEY` and the seeded admin password in `.env`.
