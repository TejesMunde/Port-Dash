"""
Port Forward Dashboard — FastAPI backend (v2).

Auto-detects Tailscale peers and host network info.
User only enters: label, public port, internal port, and picks destination from dropdown.
"""
import json
import os
import socket
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
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
            {"hostname": "pelican", "ip": "100.126.142.84", "os": "linux", "online": True},
            {"hostname": "tejes-laptop", "ip": "100.64.10.5", "os": "windows", "online": True},
            {"hostname": "r530-proxmox", "ip": "100.64.20.3", "os": "linux", "online": False},
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
            })
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
        import urllib.request
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


class NetworkInfo(BaseModel):
    self_hostname: str
    self_public_ip: Optional[str]
    self_tailscale_ip: Optional[str]
    peers: list[Peer]


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
        return rule


@app.delete("/api/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, user: str = Depends(current_user)):
    with Session(engine) as session:
        rule = session.get(ForwardRule, rule_id)
        if not rule:
            raise HTTPException(404, "Rule not found")
        if rule.enabled:
            remove_rule(rule)
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
        else:
            apply_rule(rule)
            rule.enabled = True
        session.add(rule)
        session.commit()
        session.refresh(rule)
        return rule


@app.get("/api/health")
def health():
    return {"ok": True, "dry_run": DRY_RUN}


FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
