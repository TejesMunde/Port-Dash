# Port Forward Dashboard — Root AGENTS.md

## Purpose

A web UI for managing iptables DNAT port forwards on a VPS. Auto-detects Tailscale peers; the user picks a destination, labels the rule, and the app applies iptables + optional AWS Lightsail firewall changes.

## Architecture

```
backend/          FastAPI + SQLModel + SQLite + Argon2 + JWT
frontend/         Vite + React + TypeScript + Tailwind v3
install.sh        One-shot VPS provisioning script
.env.example      Template for backend secrets
VERSION           Semver string, checked by /api/check-update
.gitignore        Excludes node_modules, .venv, __pycache__, .env, *.mp4, *.tsbuildinfo
```

- Backend serves on `127.0.0.1:8080`; frontend is built to `frontend/dist/` and served as static files.
- The frontend proxies `/api` to the backend during development via Vite's dev server.
- Auth: JWT tokens stored in `localStorage`; `Bearer` header on every API call.
- Database: SQLite at `DB_PATH` (default `/var/lib/portforward/rules.db`).
- Background: `App.tsx` renders a looping `night-sky.mp4` video with a `bg-black/50` scrim overlay.

## Global Rules

- **DRY_RUN mode**: When `DRY_RUN=1`, iptables/Lightsail calls are no-ops. Always support this mode for local dev.
- **Security**: Never log or expose `SECRET_KEY`, `ADMIN_PASSWORD_HASH`, or JWT payloads. The backend must refuse to start if `ADMIN_PASSWORD_HASH` is empty (except in DRY_RUN).
- **Port uniqueness**: `ForwardRule` has a unique constraint on `(public_port, protocol)`. Enforce at both DB and application level.
- **Optimistic UI**: Frontend applies state changes before API confirmation; rolls back on failure using functional `setRules(prev => ...)` to avoid stale closures.
- **Design language**: Anthropic-inspired warm dark palette. All colors via CSS custom properties in `index.css`. No stray hex values in components. Use `font-display` for headings, `font-mono` for IPs/ports/codes.
- **Motion**: Restrained Anthropic motion system — 100-200ms durations, `ease-anthropic-out` easing, color/opacity transitions only. `prefers-reduced-motion` disables all animations. Tokens defined in `index.css` (`--duration-*`, `--ease-*`), exposed as Tailwind utilities (`duration-fast`, `duration-normal`, `duration-slow`, `ease-anthropic-out`).
- **Verification**: After creating rules, the frontend polls `GET /api/rules/status` every 2s until all rules have a final answer (firewall open/closed/unconfigured + backend reachable/refused/timeout/unknown). Badges show live status per rule. "Blocked in AWS" is clickable to retry firewall opening via `POST /api/rules/{id}/open-firewall`.
- **TCP+UDP**: The "Add forward" dialog supports a "TCP + UDP" option that creates both rules sequentially via `createForProtocols()`. Half-success is handled — if TCP succeeds but UDP fails, the TCP rule is kept and the error names the failed protocol.
- **AWS credentials**: Lightsail instance/region/access-key/secret-key are stored in the `.env` file via `POST /api/lightsail-credentials`. The header badge uses `awsBadge()` — green when connected, red+clickable when credentials are missing.
- **Error handling**: API errors return `{ detail: string }`. Frontend parses `Content-Type` before calling `.json()` to handle non-JSON error pages (502/503).
- **Background video**: `night-sky.mp4` served from `frontend/public/`, not the origin mirror. Uses `preload="metadata"` + backend 206 support for chunked streaming. Excluded from git via `.gitignore`.

## File Ownership

| Area | Owner files |
|------|-------------|
| Backend API + auth + DB | `backend/main.py` |
| Password hashing utility | `backend/hash_password.py` |
| Python dependencies | `backend/requirements.txt` |
| Systemd unit | `backend/portforward.service` |
| React app shell | `frontend/src/App.tsx`, `frontend/src/main.tsx` |
| Global styles + tokens + motion | `frontend/src/index.css` |
| Tailwind config | `frontend/tailwind.config.js`, `frontend/postcss.config.js` |
| Vite config | `frontend/vite.config.ts` |
| HTML entry point | `frontend/index.html` |
| API client | `frontend/src/lib/api.ts` |
| Utility functions | `frontend/src/lib/utils.ts` |
| UI components | `frontend/src/components/ui/*.tsx` |
| Page components | `frontend/src/components/Dashboard.tsx`, `LoginScreen.tsx` |
| Runtime checks | `frontend/src/checks.tsx` |
| Install script | `install.sh` |

## Child DOX Index

- `backend/AGENTS.md` — FastAPI backend: API routes, auth, iptables, Lightsail, DB schema, env vars
- `frontend/AGENTS.md` — React frontend: app shell, video background, build config, Tailwind/CSS tokens, design system, motion system
- `frontend/src/components/AGENTS.md` — UI components: reusable primitives (Button, Card, Input, Switch, Dialog) and page components (Dashboard, LoginScreen)
- `frontend/src/lib/AGENTS.md` — API client: typed fetch wrapper, auth token management, all API method signatures
