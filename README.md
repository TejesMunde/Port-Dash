# Port Forward Dashboard

A web UI to manage iptables DNAT port forwards on your VPS, with live verification and AWS Lightsail integration.

## Features

- **Port forwarding** — Create, toggle, and delete iptables DNAT rules from a web UI
- **TCP + UDP** — Create rules for either protocol or both at once
- **Live verification** — Each rule shows real-time status (firewall open, backend reachable, nothing listening)
- **AWS Lightsail integration** — Auto-opens firewall ports, shows connection status, inline credential setup
- **Tailscale peers** — Discovers online peers and their IPs for destination selection
- **Auto-updates** — Checks for updates on load, updates in-place with rule preservation
- **Anthropic-inspired design** — Warm dark palette, terracotta accents, restrained motion, serif headings

## Stack

- **Backend**: FastAPI + SQLModel + SQLite + Argon2 + JWT
- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Process**: systemd
- **Storage**: SQLite (dashboard state) + `/etc/iptables/rules.v4` (kernel source of truth)

## Local development (no root needed)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DRY_RUN=1 SECRET_KEY=dev DB_PATH=./rules.db uvicorn main:app --reload --port 8080

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. Default login: `admin` / `admin` (override via env).

## Production deployment on VPS

```bash
# 1. Clone to /opt
sudo git clone <your-repo> /opt/portforward-dashboard
cd /opt/portforward-dashboard

# 2. Backend
sudo python3 -m venv .venv
sudo .venv/bin/pip install -r backend/requirements.txt

# 3. Frontend build
cd frontend
npm install
npm run build
cd ..

# 4. Generate password hash and secret
python3 backend/hash_password.py
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"

# 5. Create .env
sudo cp .env.example .env
sudo nano .env   # paste hash and secret from step 4

# 6. Install systemd unit
sudo cp backend/portforward.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now portforward

# 7. Verify
curl http://127.0.0.1:8080/api/health
```

## Exposing the dashboard

The service binds to `127.0.0.1:8080` — never expose it directly. Put a TLS proxy in front:

**Option A: Caddy (simplest)**

```caddy
dash.timepass.store {
    reverse_proxy 127.0.0.1:8080
}
```

**Option B: Cloudflare Tunnel** (matches your existing setup)

```yaml
- hostname: dash.timepass.store
  service: http://127.0.0.1:8080
```

## Security notes

- Runs as **root** because iptables requires it. Keep the system updated, limit access.
- Login is rate-limited at the proxy layer if you use Caddy/Cloudflare.
- The DB only stores rules — no traffic logs, no secrets.
- Rules persist via `netfilter-persistent save` automatically after each change.
- AWS credentials are stored in `/etc/environment` and validated before persisting.

## Updating

To change the public/internal port of a forward: delete + recreate. iptables doesn't have an "edit in place" for nat rules in a clean way.

## Project structure

```
├── AGENTS.md                    # DOX tree root — project-wide rules
├── backend/
│   ├── AGENTS.md                # Backend DOX — routes, auth, iptables, DB
│   ├── main.py                  # FastAPI app (all endpoints)
│   ├── requirements.txt
│   ├── hash_password.py         # Argon2 password hash generator
│   └── portforward.service      # systemd unit
├── frontend/
│   ├── AGENTS.md                # Frontend DOX — build, design system, motion
│   ├── src/
│   │   ├── components/
│   │   │   ├── AGENTS.md        # Components DOX — primitives + page components
│   │   │   ├── Dashboard.tsx    # Main page: rules, verification, AWS badge
│   │   │   ├── LoginScreen.tsx  # Login form
│   │   │   └── ui/              # Reusable primitives (Button, Card, Input, Switch, Dialog)
│   │   ├── lib/
│   │   │   ├── AGENTS.md        # Lib DOX — API client, types
│   │   │   ├── api.ts           # API client with auth, error handling
│   │   │   └── utils.ts         # cn() utility
│   │   ├── checks.tsx           # Runtime assertions for exported helpers
│   │   ├── App.tsx              # Auth gate, video background
│   │   └── index.css            # Design tokens, keyframes, motion
│   └── tailwind.config.js       # Token-to-Tailwind mapping
└── install.sh                   # One-shot VPS setup script
```

## Design system

The UI uses an Anthropic-inspired warm dark palette with tokenized motion:

| Token | Value | Use |
|-------|-------|-----|
| `--primary` | `#c4703a` (terracotta) | Accent, focus rings, interactive elements |
| `--background` | `#1a1714` (warm charcoal) | Page background |
| `--foreground` | `#e8e0d8` (warm off-white) | Body text |
| `--border` | `#332e2a` | Subtle warm borders |
| `--duration-fast` | `100ms` | Micro-interactions |
| `--duration-normal` | `150ms` | Hover, focus transitions |
| `--duration-slow` | `200ms` | Dialog entrance, switch |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Smooth settle |

Typography: **Source Serif 4** (headings) + **system-ui** (body) + **JetBrains Mono** (code). All animations respect `prefers-reduced-motion`.
