"""
Port Forward Dashboard — FastAPI backend (v2).

Auto-detects Tailscale peers and host network info.
User only enters: label, public port, internal port, and picks destination from dropdown.
"""
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlmodel import Field as SQLField, Session, SQLModel, create_engine, select


SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production-please")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")
TOKEN_EXPIRE_MINUTES = 60 * 24
DB_PATH = os.environ.get("DB_PATH", "/var/lib/portforward/rules.db")
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
TAILSCALE_TAG_FILTER = os.environ.get("TAILSCALE_TAG_FILTER", "")
ENV_FILE = Path(os.environ.get("ENV_FILE", Path(__file__).parent.parent / ".env"))
VERSION_FILE = Path(__file__).parent.parent / "VERSION"

Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)


class ForwardRule(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    label: str
    public_port: int
    protocol: str = "tcp"
    dest_ip: str
    dest_hostname: str
    dest_port: int
    enabled: bool = True
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


# ----- Network discovery -----
def get_tailscale_peers() -> list[dict]:
    """Return Tailscale peers (excluding self) with hostname + IP."""
    if DRY_RUN:
        return [
            {"hostname": "pelican", "ip": "100.126.142.84", "os": "linux", "online": True, "tags": ["tag:shared"]},
            {"hostname": "tejes-laptop", "ip": "100.64.10.5", "os": "windows", "online": True, "tags": []},
            {"hostname": "r530-proxmox", "ip": "100.64.20.3", "os": "linux", "online": False, "tags": []},
        ]
    try:
        result = subprocess.run(
            ["tailscale", "status", "--json"], capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return []
        data = json.loads(result.stdout)
        peers = []
        for peer in (data.get("Peer") or {}).values():
            ips = peer.get("TailscaleIPs") or []
            if not ips:
                continue
            peers.append({
                "hostname": peer.get("HostName", "unknown"),
                "ip": ips[0],
                "os": peer.get("OS", ""),
                "online": peer.get("Online", False),
                "tags": peer.get("Tags") or [],
            })
        if TAILSCALE_TAG_FILTER:
            peers = [p for p in peers if TAILSCALE_TAG_FILTER in p["tags"]]
        peers.sort(key=lambda p: (not p["online"], p["hostname"]))
        return peers
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        return []


def get_self_info() -> dict:
    info = {"hostname": socket.gethostname(), "public_ip": None, "tailscale_ip": None}
    if DRY_RUN:
        info["public_ip"] = "203.0.113.45"
        info["tailscale_ip"] = "100.64.0.1"
        return info
    try:
        result = subprocess.run(
            ["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0:
            info["tailscale_ip"] = result.stdout.strip().splitlines()[0]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    try:
        with urllib.request.urlopen("https://checkip.amazonaws.com", timeout=3) as resp:
            info["public_ip"] = resp.read().decode().strip()
    except Exception:
        pass
    return info


# ----- iptables -----
def _run(cmd: list[str]) -> tuple[int, str]:
    if DRY_RUN:
        return 0, f"[DRY_RUN] {' '.join(cmd)}"
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, (result.stdout + result.stderr).strip()


def apply_rule(rule: ForwardRule) -> None:
    code, out = _run([
        "iptables", "-t", "nat", "-A", "PREROUTING",
        "-p", rule.protocol, "--dport", str(rule.public_port),
        "-j", "DNAT", "--to-destination", f"{rule.dest_ip}:{rule.dest_port}",
    ])
    if code != 0:
        raise HTTPException(500, f"iptables add failed: {out}")
    _run(["netfilter-persistent", "save"])


def remove_rule(rule: ForwardRule) -> None:
    _run([
        "iptables", "-t", "nat", "-D", "PREROUTING",
        "-p", rule.protocol, "--dport", str(rule.public_port),
        "-j", "DNAT", "--to-destination", f"{rule.dest_ip}:{rule.dest_port}",
    ])
    _run(["netfilter-persistent", "save"])


# ----- Lightsail firewall -----
# Credentials live in the systemd EnvironmentFile and can be set from the UI, so
# every read goes through os.environ instead of a constant captured at import.
def aws_config() -> dict:
    return {
        "instance": os.environ.get("LIGHTSAIL_INSTANCE", ""),
        "region": os.environ.get("AWS_REGION", "ap-south-1"),
    }


def _ls_client():
    """A fresh Session each time -- boto3's default one caches credentials, which
    would keep serving the old keys after the UI writes new ones."""
    import boto3
    return boto3.Session().client("lightsail", region_name=aws_config()["region"])


def lightsail_open(port: int, protocol: str) -> None:
    """Raises on failure. Callers that must not fail use lightsail_open_quiet."""
    global _ls_cache
    cfg = aws_config()
    if not cfg["instance"] or DRY_RUN:
        return
    _ls_client().open_instance_public_ports(
        instanceName=cfg["instance"],
        portInfo={"fromPort": port, "toPort": port, "protocol": protocol},
    )
    _ls_cache = None  # the cached port states are now stale


def lightsail_open_quiet(port: int, protocol: str) -> None:
    """Best-effort. A firewall failure here must not undo a working iptables rule;
    the rule's badge will say "Blocked in AWS" and offer a retry that does report."""
    try:
        lightsail_open(port, protocol)
    except Exception as e:
        print(f"[lightsail] open {port}/{protocol} failed: {e}")


def lightsail_status() -> dict:
    """needs_credentials tells the UI whether to offer the 'add credentials' form.
    Any failure qualifies -- a wrong key and a denied key are both fixed there."""
    cfg = aws_config()
    if not cfg["instance"]:
        return {"configured": False, "reason": "No AWS credentials configured", "needs_credentials": True, **cfg}
    try:
        _ls_client().get_instance_port_states(instanceName=cfg["instance"])
        return {"configured": True, "reason": "ok", "needs_credentials": False, **cfg}
    except Exception as e:
        return {"configured": False, "reason": str(e), "needs_credentials": True, **cfg}


def lightsail_close(port: int, protocol: str) -> None:
    cfg = aws_config()
    if not cfg["instance"] or DRY_RUN:
        return
    try:
        _ls_client().close_instance_public_ports(
            instanceName=cfg["instance"],
            portInfo={"fromPort": port, "toPort": port, "protocol": protocol},
        )
    except Exception as e:
        print(f"[lightsail] close {port}/{protocol} failed: {e}")


def write_env(values: dict[str, str]) -> None:
    """Update keys in the EnvironmentFile in place, keeping every other line."""
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    for key, value in values.items():
        entry = f"{key}={value}"
        for i, line in enumerate(lines):
            if line.split("=", 1)[0].strip().lstrip("#").strip() == key:
                lines[i] = entry
                break
        else:
            lines.append(entry)
    ENV_FILE.write_text("\n".join(lines) + "\n")
    ENV_FILE.chmod(0o600)


# ----- Verification -----
# A rule is only useful when BOTH are true: AWS lets the packet in, and something
# is listening at the other end. We check them separately so the UI can say which
# half is broken instead of just "not working".
PROBE_TIMEOUT = 3.0
_LS_TTL = 5.0
_ls_cache: Optional[tuple[float, list[dict]]] = None


def _lightsail_ports() -> tuple[Optional[list[dict]], str]:
    """(port_states, reason). port_states is None when AWS cannot be asked at all."""
    global _ls_cache
    instance = aws_config()["instance"]
    if not instance:
        return None, "No AWS credentials configured"
    now = time.monotonic()
    if _ls_cache and now - _ls_cache[0] < _LS_TTL:
        return _ls_cache[1], "ok"
    try:
        states = _ls_client().get_instance_port_states(instanceName=instance)["portStates"]
        _ls_cache = (now, states)
        return states, "ok"
    except Exception as e:
        return None, str(e)


def _firewall_state(port: int, protocol: str, states: Optional[list[dict]], reason: str) -> tuple[str, str]:
    if states is None:
        return "unconfigured", reason
    for st in states:
        if st.get("protocol") != protocol:
            continue
        # Lightsail returns ranges, not single ports.
        if st.get("fromPort", 0) <= port <= st.get("toPort", 0) and st.get("state") == "open":
            return "open", f"open in AWS ({st.get('fromPort')}-{st.get('toPort')}/{protocol})"
    return "closed", "not open in the AWS firewall"


def _probe_backend(rule: "ForwardRule") -> tuple[str, str]:
    """TCP-connect the destination. A UDP-only listener legitimately refuses TCP,
    so a refusal on a UDP rule is 'unknown', never a failure."""
    sock = socket.socket()
    sock.settimeout(PROBE_TIMEOUT)
    try:
        sock.connect((rule.dest_ip, rule.dest_port))
        return "reachable", "destination accepted a connection"
    except ConnectionRefusedError:
        if rule.protocol == "udp":
            return "unknown", "UDP cannot be probed; destination refused TCP"
        return "refused", "nothing is listening on the destination port"
    except socket.timeout:
        return "timeout", "destination did not respond"
    except OSError as e:
        return "unknown", str(e)
    finally:
        sock.close()


# ----- Auth -----
pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm="HS256")


def current_user(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        username: str = payload.get("sub")
        if username != ADMIN_USERNAME:
            raise HTTPException(401, "Invalid token")
        return username
    except JWTError:
        raise HTTPException(401, "Invalid token")


# ----- Schemas -----
class RuleIn(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    public_port: int = Field(ge=1, le=65535)
    protocol: str = Field(default="tcp", pattern="^(tcp|udp)$")
    dest_hostname: str = Field(min_length=1)
    dest_port: int = Field(ge=1, le=65535)
    enabled: bool = True


class RuleOut(BaseModel):
    id: int
    label: str
    public_port: int
    protocol: str
    dest_ip: str
    dest_hostname: str
    dest_port: int
    enabled: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class Peer(BaseModel):
    hostname: str
    ip: str
    os: str
    online: bool
    tags: list[str]


class NetworkInfo(BaseModel):
    self_hostname: str
    self_public_ip: Optional[str]
    self_tailscale_ip: Optional[str]
    peers: list[Peer]
    tag_filter: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(title="Port Forward Dashboard", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends()):
    if form.username != ADMIN_USERNAME or not verify_password(form.password, ADMIN_PASSWORD_HASH):
        raise HTTPException(401, "Incorrect username or password")
    return Token(access_token=create_token(form.username))


@app.get("/api/network-info", response_model=NetworkInfo)
def network_info(user: str = Depends(current_user)):
    self_info = get_self_info()
    peers = get_tailscale_peers()
    return NetworkInfo(
        self_hostname=self_info["hostname"],
        self_public_ip=self_info["public_ip"],
        self_tailscale_ip=self_info["tailscale_ip"],
        peers=[Peer(**p) for p in peers],
        tag_filter=TAILSCALE_TAG_FILTER,
    )


@app.get("/api/rules", response_model=list[RuleOut])
def list_rules(user: str = Depends(current_user)):
    with Session(engine) as session:
        return session.exec(select(ForwardRule).order_by(ForwardRule.public_port)).all()


@app.post("/api/rules", response_model=RuleOut, status_code=201)
def create_rule(rule_in: RuleIn, user: str = Depends(current_user)):
    peers = get_tailscale_peers()
    peer = next((p for p in peers if p["hostname"] == rule_in.dest_hostname), None)
    if not peer:
        raise HTTPException(400, f"Tailscale peer '{rule_in.dest_hostname}' not found")

    with Session(engine) as session:
        existing = session.exec(
            select(ForwardRule)
            .where(ForwardRule.public_port == rule_in.public_port)
            .where(ForwardRule.protocol == rule_in.protocol)
        ).first()
        if existing:
            raise HTTPException(409, f"{rule_in.protocol.upper()} port {rule_in.public_port} already mapped")

        rule = ForwardRule(
            label=rule_in.label,
            public_port=rule_in.public_port,
            protocol=rule_in.protocol,
            dest_ip=peer["ip"],
            dest_hostname=peer["hostname"],
            dest_port=rule_in.dest_port,
            enabled=rule_in.enabled,
        )
        session.add(rule)
        session.commit()
        session.refresh(rule)
        if rule.enabled:
            apply_rule(rule)
            lightsail_open_quiet(rule.public_port, rule.protocol)
        return rule


@app.delete("/api/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, user: str = Depends(current_user)):
    with Session(engine) as session:
        rule = session.get(ForwardRule, rule_id)
        if not rule:
            raise HTTPException(404, "Rule not found")
        if rule.enabled:
            remove_rule(rule)
            others = session.exec(
                select(ForwardRule)
                .where(ForwardRule.public_port == rule.public_port)
                .where(ForwardRule.protocol == rule.protocol)
                .where(ForwardRule.enabled == True)
                .where(ForwardRule.id != rule.id)
            ).first()
            if not others:
                lightsail_close(rule.public_port, rule.protocol)
        session.delete(rule)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch("/api/rules/{rule_id}/toggle", response_model=RuleOut)
def toggle_rule(rule_id: int, user: str = Depends(current_user)):
    with Session(engine) as session:
        rule = session.get(ForwardRule, rule_id)
        if not rule:
            raise HTTPException(404, "Rule not found")
        if rule.enabled:
            remove_rule(rule)
            rule.enabled = False
            others = session.exec(
                select(ForwardRule)
                .where(ForwardRule.public_port == rule.public_port)
                .where(ForwardRule.protocol == rule.protocol)
                .where(ForwardRule.enabled == True)
                .where(ForwardRule.id != rule.id)
            ).first()
            if not others:
                lightsail_close(rule.public_port, rule.protocol)
        else:
            apply_rule(rule)
            rule.enabled = True
            lightsail_open_quiet(rule.public_port, rule.protocol)
        session.add(rule)
        session.commit()
        session.refresh(rule)
        return rule


@app.get("/api/check-update")
def check_update(user: str = Depends(current_user)):
    current = VERSION_FILE.read_text().strip() if VERSION_FILE.exists() else "0.0.0"
    latest = current
    try:
        result = subprocess.run(
            ["curl", "-s", "https://raw.githubusercontent.com/TejesMunde/Port-Dash/main/VERSION"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            latest = result.stdout.strip()
    except Exception:
        pass
    return {"current": current, "latest": latest, "update_available": latest != current}


@app.post("/api/update")
def trigger_update(user: str = Depends(current_user)):
    INSTALL_DIR = Path("/opt/portforward-dashboard")
    DATA_DIR = Path("/var/lib/portforward")
    ENV_BACKUP = DATA_DIR / ".env.backup"
    try:
        if (INSTALL_DIR / ".env").exists():
            shutil.copy2(INSTALL_DIR / ".env", ENV_BACKUP)
        subprocess.run(["git", "-C", str(INSTALL_DIR), "pull", "--ff-only"], check=True, capture_output=True, text=True)
        if ENV_BACKUP.exists():
            shutil.copy2(ENV_BACKUP, INSTALL_DIR / ".env")
            ENV_BACKUP.unlink()
        subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=str(INSTALL_DIR / "frontend"), check=True, capture_output=True, text=True)
        subprocess.run(["npm", "run", "build"], cwd=str(INSTALL_DIR / "frontend"), check=True, capture_output=True, text=True)
        subprocess.run([str(INSTALL_DIR / ".venv" / "bin" / "pip"), "install", "-r", str(INSTALL_DIR / "backend" / "requirements.txt")], check=True, capture_output=True, text=True)
        subprocess.run(["systemctl", "restart", "portforward"], check=True, capture_output=True, text=True)
        return {"ok": True, "message": "Update complete. Service restarted."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Update failed: {e.stderr or e.stdout}")
    except Exception as e:
        raise HTTPException(500, f"Update failed: {e}")


class RuleStatus(BaseModel):
    id: int
    firewall: str
    firewall_detail: str
    backend: str
    backend_detail: str
    connectable: bool


@app.get("/api/rules/status", response_model=list[RuleStatus])
def rules_status(user: str = Depends(current_user)):
    """Live state of every rule. One AWS call for all rules, probes run in parallel."""
    with Session(engine) as session:
        rules = list(session.exec(select(ForwardRule).order_by(ForwardRule.public_port)).all())
    states, reason = _lightsail_ports()
    with ThreadPoolExecutor(max_workers=8) as pool:
        probes = list(pool.map(_probe_backend, rules))
    return [
        _rule_status(rule, probe, states, reason)
        for rule, probe in zip(rules, probes)
    ]


def _rule_status(rule: "ForwardRule", probe: tuple[str, str],
                 states: Optional[list[dict]], reason: str) -> RuleStatus:
    backend, backend_detail = probe
    firewall, firewall_detail = _firewall_state(rule.public_port, rule.protocol, states, reason)
    return RuleStatus(
        id=rule.id,
        firewall=firewall,
        firewall_detail=firewall_detail,
        backend=backend,
        backend_detail=backend_detail,
        connectable=rule.enabled and firewall == "open" and backend == "reachable",
    )


@app.post("/api/rules/{rule_id}/open-firewall", response_model=RuleStatus)
def open_rule_firewall(rule_id: int, user: str = Depends(current_user)):
    """Retry the AWS firewall opening for one rule, reporting what AWS actually said.
    The create path swallows this error on purpose; here the user asked, so they see it."""
    with Session(engine) as session:
        rule = session.get(ForwardRule, rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        if not aws_config()["instance"]:
            raise HTTPException(status_code=400, detail="No AWS credentials configured")
        try:
            lightsail_open(rule.public_port, rule.protocol)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        states, reason = _lightsail_ports()
        return _rule_status(rule, _probe_backend(rule), states, reason)


@app.get("/api/lightsail-status")
def get_lightsail_status(user: str = Depends(current_user)):
    return lightsail_status()


class AwsCredentials(BaseModel):
    access_key_id: str = Field(min_length=16, max_length=128)
    secret_access_key: str = Field(min_length=8, max_length=256)
    instance: str = Field(min_length=1, max_length=255)
    region: str = Field(default="ap-south-1", min_length=1, max_length=64)


@app.post("/api/aws-config")
def set_aws_config(body: AwsCredentials, user: str = Depends(current_user)):
    """Save AWS credentials from the UI and prove they work before persisting.
    A bad key that we accepted would leave the dashboard silently blind again."""
    global _ls_cache
    previous = {k: os.environ.get(k) for k in
                ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "LIGHTSAIL_INSTANCE", "AWS_REGION")}
    os.environ.update({
        "AWS_ACCESS_KEY_ID": body.access_key_id.strip(),
        "AWS_SECRET_ACCESS_KEY": body.secret_access_key.strip(),
        "LIGHTSAIL_INSTANCE": body.instance.strip(),
        "AWS_REGION": body.region.strip(),
    })
    _ls_cache = None
    result = lightsail_status()
    if not result["configured"]:
        for key, value in previous.items():
            os.environ.pop(key, None) if value is None else os.environ.update({key: value})
        raise HTTPException(status_code=400, detail=result["reason"])
    write_env({
        "AWS_ACCESS_KEY_ID": body.access_key_id.strip(),
        "AWS_SECRET_ACCESS_KEY": body.secret_access_key.strip(),
        "LIGHTSAIL_INSTANCE": body.instance.strip(),
        "AWS_REGION": body.region.strip(),
    })
    return result


@app.get("/api/health")
def health():
    return {"ok": True, "dry_run": DRY_RUN}


FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

VIDEO_CHUNK = 256 * 1024


def _parse_range(header: Optional[str], size: int):
    """Resolve a Range header to an inclusive (start, end) pair.

    Returns None for an absent/unparseable header (caller should send the whole
    file) and raises ValueError when the range is unsatisfiable (caller sends 416).
    Handles open-ended 'bytes=500-' and suffix 'bytes=-500' forms.
    """
    if not header or not header.strip().lower().startswith("bytes="):
        return None
    spec = header.split("=", 1)[1].split(",")[0].strip()
    start_s, sep, end_s = spec.partition("-")
    if not sep:
        return None
    # Parse failures fall back to "no range"; only a well-formed but unsatisfiable
    # range raises, so the int() conversions get their own narrow try.
    try:
        start = int(start_s) if start_s else None
        end = int(end_s) if end_s else None
    except ValueError:
        return None
    if start is None and end is None:
        return None
    if start is None:
        # suffix form: last N bytes
        if end <= 0:
            raise ValueError("empty suffix range")
        return max(0, size - end), size - 1
    if end is None:
        end = size - 1
    if start < 0 or start >= size or end < start:
        raise ValueError("unsatisfiable range")
    return start, min(end, size - 1)


# Starlette 0.38's StaticFiles ignores Range, so a looping <video> has to pull the
# entire file in one response before it can play. Serving this one asset with 206
# support lets the browser stream it in chunks instead. Registered ahead of the
# catch-all mount below so it wins the route match.
@app.get("/night-sky.mp4")
def background_video(request: Request):
    path = FRONTEND_DIST / "night-sky.mp4"
    if not path.exists():
        raise HTTPException(404, "background video not found")
    size = path.stat().st_size
    headers = {"accept-ranges": "bytes", "cache-control": "public, max-age=604800"}
    try:
        rng = _parse_range(request.headers.get("range"), size)
    except ValueError:
        return Response(status_code=416, headers={**headers, "content-range": f"bytes */{size}"})
    if rng is None:
        return FileResponse(path, media_type="video/mp4", headers=headers)

    start, end = rng
    length = end - start + 1

    def stream():
        with open(path, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                data = f.read(min(VIDEO_CHUNK, left))
                if not data:
                    break
                left -= len(data)
                yield data

    headers["content-range"] = f"bytes {start}-{end}/{size}"
    headers["content-length"] = str(length)
    return StreamingResponse(stream(), status_code=206, media_type="video/mp4", headers=headers)


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
