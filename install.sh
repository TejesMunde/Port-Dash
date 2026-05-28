#!/usr/bin/env bash
# Install Port Forward Dashboard on a fresh VM.
#
# Usage:
#   sudo ./install.sh [--repo <git-url>] [--local] [--password <pw>]
#                     [--admin <user>] [--no-firewall] [--skip-frontend]
#
# Re-runnable: existing SECRET_KEY and password hash in .env are preserved
# unless --password is given. Pip/npm installs are idempotent.

set -euo pipefail

INSTALL_DIR="/opt/portforward-dashboard"
DATA_DIR="/var/lib/portforward"
SERVICE_NAME="portforward"
DEFAULT_ADMIN="admin"

REPO_URL="https://github.com/TejesMunde/Port-Dash.git"
SOURCE_MODE=""        # "git" | "local"
ADMIN_USER=""
ADMIN_PW="${ADMIN_PASSWORD:-}"
DO_FIREWALL=1
DO_FRONTEND=1

log()  { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

# ---------- arg parsing ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)         REPO_URL="$2"; SOURCE_MODE="git"; shift 2 ;;
    --local)        SOURCE_MODE="local"; shift ;;
    --password)     ADMIN_PW="$2"; shift 2 ;;
    --admin)        ADMIN_USER="$2"; shift 2 ;;
    --no-firewall)  DO_FIREWALL=0; shift ;;
    --skip-frontend) DO_FRONTEND=0; shift ;;
    -h|--help)      usage ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "must run as root (use sudo)"

# ---------- OS detection ----------
[[ -r /etc/os-release ]] || die "cannot read /etc/os-release"
# shellcheck disable=SC1091
. /etc/os-release
PKG=""
case "${ID:-} ${ID_LIKE:-}" in
  *debian*|*ubuntu*) PKG="apt" ;;
  *rhel*|*fedora*|*centos*|*rocky*|*alma*) PKG="dnf" ;;
  *) die "unsupported distro: ${ID:-unknown}" ;;
esac
log "detected ${PRETTY_NAME:-$ID} (pkg=$PKG)"

# ---------- source mode default ----------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd || echo "")"
if [[ -z "$SOURCE_MODE" ]]; then
  if [[ -f "$SCRIPT_DIR/backend/main.py" && -f "$SCRIPT_DIR/frontend/package.json" ]]; then
    SOURCE_MODE="local"
    log "no --repo/--local given; using local source at $SCRIPT_DIR"
  elif [[ -n "$REPO_URL" ]]; then
    SOURCE_MODE="git"
    log "no --repo/--local given; cloning default repo $REPO_URL"
  else
    die "no source mode chosen and current dir doesn't look like the project. Pass --repo <url> or --local."
  fi
fi

# ---------- system packages ----------
log "installing system packages"
if [[ "$PKG" == "apt" ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg git \
    python3 python3-venv python3-pip \
    iptables iptables-persistent

  # Node 20 via NodeSource if system node is missing or <18.
  need_node=1
  if command -v node >/dev/null 2>&1; then
    nv=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
    [[ "$nv" -ge 18 ]] && need_node=0
  fi
  if [[ "$need_node" -eq 1 ]] && [[ "$DO_FRONTEND" -eq 1 ]]; then
    log "installing Node.js 20 from NodeSource"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
else
  dnf install -y \
    ca-certificates curl git \
    python3 python3-pip \
    iptables iptables-services \
    firewalld

  need_node=1
  if command -v node >/dev/null 2>&1; then
    nv=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
    [[ "$nv" -ge 18 ]] && need_node=0
  fi
  if [[ "$need_node" -eq 1 ]] && [[ "$DO_FRONTEND" -eq 1 ]]; then
    log "installing Node.js 20 from NodeSource"
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
  fi
fi

# ---------- clean install: remove previous installation ----------
if [[ -d "$INSTALL_DIR" ]]; then
  log "removing previous installation at $INSTALL_DIR"
  # Backup .env so secrets (SECRET_KEY, passwords, DB_PATH) survive reinstall.
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    cp "$INSTALL_DIR/.env" /tmp/portforward-env-backup
  fi
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -rf "$INSTALL_DIR"
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
fi

# ---------- get source ----------
mkdir -p "$INSTALL_DIR"
if [[ "$SOURCE_MODE" == "git" ]]; then
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "updating existing checkout at $INSTALL_DIR"
    git -C "$INSTALL_DIR" pull --ff-only
  else
    log "cloning $REPO_URL -> $INSTALL_DIR"
    [[ -z "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]] || die "$INSTALL_DIR not empty and not a git checkout"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
else
  log "syncing local source $SCRIPT_DIR -> $INSTALL_DIR"
  # Copy everything except VCS / build artifacts / venv / node_modules.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git/' --exclude '.venv/' \
      --exclude 'frontend/node_modules/' --exclude 'frontend/dist/' \
      --exclude '__pycache__/' --exclude '*.pyc' \
      "$SCRIPT_DIR"/ "$INSTALL_DIR"/
  else
    # Fallback: cp -a, but be careful not to nuke the venv/dist on re-run.
    cp -a "$SCRIPT_DIR/backend" "$SCRIPT_DIR/frontend" "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/README.md" "$INSTALL_DIR"/ 2>/dev/null || true
  fi
fi

# ---------- python venv ----------
log "creating/updating python venv"
if [[ ! -x "$INSTALL_DIR/.venv/bin/python" ]]; then
  python3 -m venv "$INSTALL_DIR/.venv"
fi
"$INSTALL_DIR/.venv/bin/pip" install --upgrade pip wheel >/dev/null
"$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt"

# ---------- frontend build ----------
if [[ "$DO_FRONTEND" -eq 1 ]]; then
  log "building frontend"
  (
    cd "$INSTALL_DIR/frontend"
    # Use ci when lockfile exists for reproducible installs.
    if [[ -f package-lock.json ]]; then
      npm ci --no-audit --no-fund
    else
      npm install --no-audit --no-fund
    fi
    npm run build
  )
else
  log "skipping frontend build (--skip-frontend)"
fi

# ---------- .env: preserve existing secrets ----------
ENV_FILE="$INSTALL_DIR/.env"
# Restore env backup from a re-run if available.
if [[ -f /tmp/portforward-env-backup ]] && [[ ! -f "$ENV_FILE" ]]; then
  mv /tmp/portforward-env-backup "$ENV_FILE"
fi
get_env() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//"; }

existing_secret=$(get_env SECRET_KEY || true)
existing_hash=$(get_env ADMIN_PASSWORD_HASH || true)
existing_admin=$(get_env ADMIN_USERNAME || true)

# SECRET_KEY: keep if real (not placeholder), else generate.
case "$existing_secret" in
  ""|"replace-with-random-hex")
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    log "generated new SECRET_KEY"
    ;;
  *)
    SECRET_KEY="$existing_secret"
    log "preserving existing SECRET_KEY"
    ;;
esac

# Admin username precedence: --admin > existing > default
if [[ -z "$ADMIN_USER" ]]; then
  ADMIN_USER="${existing_admin:-$DEFAULT_ADMIN}"
fi

# Password hash: if user supplied a password OR no usable hash exists, (re)hash.
need_hash=0
if [[ -n "$ADMIN_PW" ]]; then
  need_hash=1
elif [[ -z "$existing_hash" || "$existing_hash" == "replace-with-argon2-hash" ]]; then
  need_hash=1
fi

if [[ "$need_hash" -eq 1 ]]; then
  if [[ -z "$ADMIN_PW" ]]; then
    # Interactive prompt with confirmation.
    if [[ ! -t 0 ]]; then
      if [[ -r /dev/tty ]]; then
        log "stdin is piped; reading password from /dev/tty"
        TTY_DEV="/dev/tty"
      else
        die "no password supplied and /dev/tty not available (use --password or ADMIN_PASSWORD=...)"
      fi
    fi
    while :; do
      read -rsp "Admin password for '$ADMIN_USER': " p1 < ${TTY_DEV:-/dev/stdin}; echo
      read -rsp "Confirm: " p2 < ${TTY_DEV:-/dev/stdin}; echo
      [[ "$p1" == "$p2" && -n "$p1" ]] && { ADMIN_PW="$p1"; break; }
      warn "mismatch or empty, try again"
    done
  fi
  log "hashing admin password (argon2)"
  ADMIN_HASH=$("$INSTALL_DIR/.venv/bin/python" -c \
    "import sys; from passlib.hash import argon2; print(argon2.hash(sys.argv[1]))" "$ADMIN_PW")
  unset ADMIN_PW
else
  ADMIN_HASH="$existing_hash"
  log "preserving existing ADMIN_PASSWORD_HASH"
fi

mkdir -p "$DATA_DIR"
chmod 750 "$DATA_DIR"

log "writing $ENV_FILE"
umask 077
cat >"$ENV_FILE" <<EOF
SECRET_KEY=$SECRET_KEY
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD_HASH='$ADMIN_HASH'
DB_PATH=$DATA_DIR/rules.db
DRY_RUN=0
EOF
chmod 600 "$ENV_FILE"
rm -f /tmp/portforward-env-backup

# ---------- systemd unit ----------
log "installing systemd unit"
install -m 0644 "$INSTALL_DIR/backend/portforward.service" \
  "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

# ---------- iptables persistence ----------
if [[ "$PKG" == "apt" ]]; then
  systemctl enable --now netfilter-persistent >/dev/null 2>&1 || true
else
  systemctl enable --now iptables >/dev/null 2>&1 || true
fi

# ---------- firewall ----------
if [[ "$DO_FIREWALL" -eq 1 ]]; then
  log "configuring firewall (SSH + 80/443; 8080 stays loopback-only)"
  # Use raw iptables (cross-distro). The app's netfilter-persistent
  # integration will save these on the next rule change.
  iptables -C INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 22 -j ACCEPT
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 80 -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 443 -j ACCEPT
else
  log "skipping firewall config (--no-firewall)"
fi

# ---------- health check ----------
log "waiting for service to come up"
for i in {1..15}; do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    log "health check OK"
    break
  fi
  sleep 1
  [[ $i -eq 15 ]] && { warn "health check did not pass; see: journalctl -u $SERVICE_NAME -n 50"; }
done

cat <<EOF

Done.
  Service:    systemctl status $SERVICE_NAME
  Logs:       journalctl -u $SERVICE_NAME -f
  Local URL:  http://127.0.0.1:8080
  Admin:      $ADMIN_USER

Next: put a TLS proxy (Caddy or Cloudflare Tunnel) in front of 127.0.0.1:8080.
EOF
