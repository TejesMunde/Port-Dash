# Backend — AGENTS.md

## Purpose

FastAPI backend that manages iptables DNAT rules, authenticates users, discovers Tailscale peers, and optionally syncs port openings to AWS Lightsail firewalls.

## Ownership

All files in `backend/`:
- `main.py` — single-file backend: routes, auth, iptables, Lightsail, DB models, update logic
- `hash_password.py` — standalone utility to generate Argon2 hashes
- `requirements.txt` — Python dependencies (pinned versions)
- `portforward.service` — systemd unit for production

## Local Contracts

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SECRET_KEY` | Yes | `change-me-in-production-please` | JWT signing key; generate with `secrets.token_hex(32)` |
| `ADMIN_USERNAME` | No | `admin` | Login username |
| `ADMIN_PASSWORD_HASH` | Yes (prod) | `""` | Argon2 hash; app refuses to start if empty (except DRY_RUN) |
| `DB_PATH` | No | `/var/lib/portforward/rules.db` | SQLite database path |
| `DRY_RUN` | No | `0` | Set `1` to skip iptables/Lightsail calls |
| `TAILSCALE_TAG_FILTER` | No | `""` | Only show peers with this tag |
| `LIGHTSAIL_INSTANCE` | No | `""` | AWS Lightsail instance name for firewall sync |
| `AWS_REGION` | No | `ap-south-1` | AWS region for Lightsail |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |

### Database Schema

`ForwardRule` table:
- `id` (int, PK)
- `label` (str, 1-64 chars)
- `public_port` (int, 1-65535)
- `protocol` (str, "tcp" or "udp")
- `dest_ip` (str) — resolved from Tailscale peer
- `dest_hostname` (str) — Tailscale hostname
- `dest_port` (int, 1-65535)
- `enabled` (bool, default True)
- `created_at` (datetime, UTC)

**Unique constraint**: `(public_port, protocol)` — enforced at both DB level and application level with try/except on commit.

### API Routes

All routes except `/api/login` and `/api/health` require JWT auth via `Bearer` token.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/login` | Authenticate, return JWT |
| GET | `/api/network-info` | Host info + Tailscale peers |
| GET | `/api/rules` | List all forward rules |
| POST | `/api/rules` | Create a new rule (applies iptables + Lightsail) |
| DELETE | `/api/rules/{id}` | Delete a rule (removes iptables + Lightsail) |
| PATCH | `/api/rules/{id}/toggle` | Toggle enabled/disabled (applies/removes iptables) |
| GET | `/api/check-update` | Compare local VERSION vs GitHub |
| POST | `/api/update` | Pull latest code, rebuild, restart service |
| GET | `/api/lightsail-status` | Check Lightsail connectivity |
| GET | `/api/health` | Health check (no auth) |

### Auth Flow

1. Client sends `POST /api/login` with `application/x-www-form-urlencoded` body (`username` + `password`).
2. Server verifies against `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` (Argon2).
3. Returns JWT with `sub` claim = username, 24h expiry.
4. Client stores token in `localStorage` under key `pf_token`.
5. All subsequent requests include `Authorization: Bearer <token>`.
6. On 401, client clears token and reloads.

### iptables Integration

- `apply_rule()`: Adds DNAT PREROUTING rule, then calls `netfilter-persistent save`.
- `remove_rule()`: Removes DNAT PREROUTING rule, then saves.
- All iptables calls go through `_run()` which is a no-op in DRY_RUN mode.
- Commands are passed as explicit lists (no shell injection risk).

### Lightsail Integration

- `boto3` is imported at module level with `try/except ImportError` (graceful degradation).
- Client is created per-call via `_lightsail_client()` to avoid stale sessions.
- `lightsail_open/close` are called alongside iptables apply/remove.
- `lightsail_status` checks connectivity without modifying anything.

## Work Guidance

- **Adding a new route**: Add Pydantic schema in the Schemas section, route handler below existing routes, update this doc.
- **Adding a new env var**: Add to the env vars table above, read it at module level with `os.environ.get()`.
- **Database migrations**: SQLModel creates tables on startup via `create_all()`. For schema changes, bump `VERSION` and note the migration in this doc.
- **Adding a new Lightsail action**: Follow the `lightsail_open`/`lightsail_close` pattern — check `LIGHTSAIL_INSTANCE` and `DRY_RUN` first, wrap in try/except.
- **Error responses**: Always return `HTTPException` with a `detail` string. The frontend parses this.

## Verification

- Backend syntax: `python3 -c "import ast; ast.parse(open('backend/main.py').read())"`
- Start in dev: `DRY_RUN=1 SECRET_KEY=dev DB_PATH=./rules.db uvicorn backend.main:app --reload --port 8080`
- Health check: `curl http://127.0.0.1:8080/api/health`
- Login test: `curl -X POST http://127.0.0.1:8080/api/login -d 'username=admin&password=<pw>'`

## Child DOX Index

- No child AGENTS.md needed — `backend/` is a single-file module.
