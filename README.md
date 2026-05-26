# Port Forward Dashboard

A simple web UI to manage iptables DNAT port forwards on your VPS.

## Stack

- **Backend**: FastAPI + SQLModel + SQLite + Argon2 + JWT
- **Frontend**: Vite + React + TypeScript + Tailwind + Radix UI
- **Process**: systemd
- **Storage**: SQLite (for the dashboard) + `/etc/iptables/rules.v4` (kernel source of truth)

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

## Updating

To change the public/internal port of a forward: delete + recreate. iptables doesn't have an "edit in place" for nat rules in a clean way.
