import { useEffect, useRef, useState } from "react";
import { api, clearToken, type Rule, type RuleInput, type RuleStatus, type NetworkInfo, type Peer, type UpdateInfo, type LightsailStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [lsStatus, setLsStatus] = useState<LightsailStatus | null>(null);
  const [ruleErrors, setRuleErrors] = useState<Record<number, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [ruleStatuses, setRuleStatuses] = useState<RuleStatus[]>([]);
  const [verifyingIds, setVerifyingIds] = useState<Set<number>>(new Set());
  const [credOpen, setCredOpen] = useState(false);
  const [credInstance, setCredInstance] = useState("");
  const [credRegion, setCredRegion] = useState("ap-south-1");
  const [credAccessKey, setCredAccessKey] = useState("");
  const [credSecretKey, setCredSecretKey] = useState("");
  const [credBusy, setCredBusy] = useState(false);
  const [credErr, setCredErr] = useState<string | null>(null);
  const cachedRules = useRef<Rule[]>([]);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [rulesData, netData] = await Promise.all([api.listRules(), api.networkInfo()]);
      cachedRules.current = rulesData;
      setRules(rulesData);
      setNetInfo(netData);
    } catch (e: any) {
      if (cachedRules.current.length === 0) setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLsStatus = async () => {
    try {
      setLsStatus(await api.lightsailStatus());
    } catch {
      setLsStatus({ configured: false, reason: "API unreachable", needs_credentials: false, instance: "", region: "" });
    }
  };

  // --- Verification polling ---
  const pollVerification = async () => {
    try {
      const statuses = await api.rulesStatus();
      setRuleStatuses(statuses);
      if (verificationSettled(statuses.map((s) => s.id), statuses)) {
        stopPolling();
      }
    } catch { /* non-fatal */ }
  };

  const startPolling = (ids: number[]) => {
    setVerifyingIds((prev) => new Set([...prev, ...ids]));
    if (pollRef.current) return;
    pollRef.current = setInterval(pollVerification, 2000);
    pollVerification();
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setVerifyingIds(new Set());
  };

  const handleUpdate = async () => {
    if (!confirm("Update to latest version? Port rules will be preserved.")) return;
    setUpdating(true);
    try {
      const res = await api.triggerUpdate();
      alert(res.message);
      setUpdateInfo(null);
    } catch (e: any) { setErr(e.message); }
    finally { setUpdating(false); }
  };

  useEffect(() => {
    if (cachedRules.current.length > 0) setRules(cachedRules.current);
    load(); loadLsStatus();
    api.checkUpdate().then(setUpdateInfo).catch(() => {});
    return () => {
      if (deleteTimeoutRef.current) { clearTimeout(deleteTimeoutRef.current); deleteTimeoutRef.current = null; }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, []);

  const handleToggle = async (rule: Rule) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    setRuleErrors((p) => ({ ...p, [rule.id]: "" }));
    try {
      const updated = await api.toggleRule(rule.id);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      setRuleErrors((p) => ({ ...p, [rule.id]: e.message }));
    }
  };

  const handleDelete = (rule: Rule) => {
    if (confirmDeleteId !== rule.id) {
      setConfirmDeleteId(rule.id);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = setTimeout(() => { setConfirmDeleteId(null); deleteTimeoutRef.current = null; }, 3000);
      return;
    }
    setConfirmDeleteId(null);
    if (deleteTimeoutRef.current) { clearTimeout(deleteTimeoutRef.current); deleteTimeoutRef.current = null; }
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    setRuleErrors((p) => ({ ...p, [rule.id]: "" }));
    api.deleteRule(rule.id).catch((e: any) => {
      setRules((prev) => prev.some((r) => r.id === rule.id) ? prev : [...prev, rule]);
      setRuleErrors((p) => ({ ...p, [rule.id]: e.message }));
    });
  };

  const handleOpenFirewall = async (ruleId: number) => {
    try {
      const updated = await api.openFirewall(ruleId);
      setRuleStatuses((prev) => prev.map((s) => (s.id === ruleId ? updated : s)));
    } catch (e: any) { setRuleErrors((p) => ({ ...p, [ruleId]: e.message })); }
  };

  const handleCredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredBusy(true); setCredErr(null);
    try {
      const result = await api.saveCredentials({ instance: credInstance, region: credRegion, access_key_id: credAccessKey, secret_access_key: credSecretKey });
      setLsStatus(result);
      setCredOpen(false);
    } catch (e: any) { setCredErr(e.message); }
    finally { setCredBusy(false); }
  };

  const logout = () => { clearToken(); onLogout(); };
  const onlinePeers = netInfo?.peers.filter((p) => p.online) || [];
  const canAddRule = onlinePeers.length > 0;
  const aws = awsBadge(lsStatus);

  return (
    <div className="min-h-screen flex flex-col animate-page-in">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-display font-semibold tracking-tight">Port Forwards</h1>
            <p className="text-xs text-muted-foreground">iptables DNAT rules</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => aws.actionable && setCredOpen(true)}
              className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors duration-fast ease-anthropic-out ${
                aws.tone === "good" ? "bg-success/15 text-success" : aws.tone === "bad" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"
              } ${aws.actionable ? "cursor-pointer hover:opacity-80" : ""}`}
              title={aws.title}
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${aws.tone === "good" ? "bg-success" : aws.tone === "bad" ? "bg-destructive" : "bg-muted-foreground"}`} />
              AWS
            </button>
            <Button variant="ghost" size="icon" onClick={load} title="Refresh" className="text-muted-foreground hover:text-foreground">↻</Button>

            <Button variant="ghost" size="icon" onClick={logout} title="Sign out" className="text-muted-foreground hover:text-foreground">→</Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {err && <p className="text-xs text-destructive">{err}</p>}
        {updateInfo?.update_available && (
          <Card className="p-4 flex items-center justify-between border-primary/30">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Update available</span>
              <span className="text-xs text-muted-foreground font-mono">v{updateInfo.current} → v{updateInfo.latest}</span>
            </div>
            <Button size="sm" onClick={handleUpdate} disabled={updating}>{updating ? "Updating…" : "Update"}</Button>
          </Card>
        )}
        {netInfo && <NetworkInfoCard info={netInfo} />}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-display font-semibold tracking-tight">Active forwards</h2>
            <p className="text-xs text-muted-foreground">{rules.length} rule{rules.length !== 1 ? "s" : ""}</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canAddRule}>+ Add forward</Button>
            </DialogTrigger>
            {netInfo && (
              <AddRuleDialog
                peers={onlinePeers}
                onCreated={(created, allSucceeded) => {
                  if (created.length) { setRules((rs) => [...rs, ...created]); startPolling(created.map((r) => r.id)); }
                  if (allSucceeded) setAddOpen(false);
                }}
              />
            )}
          </Dialog>
        </div>

        {!canAddRule && netInfo && (
          <Card className="p-3 text-xs text-muted-foreground">
            {netInfo.tag_filter ? `No online Tailscale peers with tag "${netInfo.tag_filter}" found.` : "No online Tailscale peers detected."}
          </Card>
        )}

        {loading && cachedRules.current.length === 0 ? (
          <Card className="p-8 flex flex-col items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-muted border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground">Loading…</span>
          </Card>
        ) : rules.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-xs text-muted-foreground">No forwards yet.</p>
            <p className="text-xs text-muted-foreground mt-1">{canAddRule ? "Click '+ Add forward' to create one." : ""}</p>
          </Card>
        ) : (
          <div className="space-y-1">
            {rules.map((rule, i) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                index={i}
                publicIp={netInfo?.self_public_ip}
                status={ruleStatuses.find((s) => s.id === rule.id)}
                verifying={verifyingIds.has(rule.id)}
                onToggle={() => handleToggle(rule)}
                onDelete={() => handleDelete(rule)}
                onOpenFirewall={() => handleOpenFirewall(rule.id)}
                isDeleteConfirm={confirmDeleteId === rule.id}
                error={ruleErrors[rule.id]}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="mt-auto bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-between text-xs font-mono">
          <span>Port Forward Dashboard</span>
          <span className="opacity-70">v{updateInfo?.current || "?"}</span>
        </div>
      </footer>

      {/* AWS credentials dialog */}
      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogTrigger asChild><span /></DialogTrigger>
        <DialogContent className="p-0">
          <DialogHeader className="p-6 pb-0"><DialogTitle>AWS Credentials</DialogTitle></DialogHeader>
          <form onSubmit={handleCredSubmit} className="space-y-4 p-6">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Instance name</label>
              <Input name="instance" placeholder="my-instance" value={credInstance} onChange={(e: any) => setCredInstance(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Region</label>
              <Input name="region" placeholder="ap-south-1" value={credRegion} onChange={(e: any) => setCredRegion(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Access key ID</label>
              <Input name="access_key_id" placeholder="AKIA..." value={credAccessKey} onChange={(e: any) => setCredAccessKey(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Secret access key</label>
              <Input type="password" name="secret_access_key" placeholder="Secret" value={credSecretKey} onChange={(e: any) => setCredSecretKey(e.target.value)} required />
            </div>
            {credErr && <p className="text-xs text-destructive">{credErr}</p>}
            <DialogFooter className="pt-2">
              <Button type="submit" disabled={credBusy}>{credBusy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Exported helpers (tested by checks.tsx) =====

export async function createForProtocols(
  protocol: "tcp" | "udp" | "both",
  base: Omit<RuleInput, "protocol">,
  create: (r: RuleInput) => Promise<Rule>
): Promise<{ created: Rule[]; error: string | null }> {
  const protos: ("tcp" | "udp")[] = protocol === "both" ? ["tcp", "udp"] : [protocol];
  const created: Rule[] = [];
  for (const p of protos) {
    try {
      created.push(await create({ ...base, protocol: p }));
    } catch (e: any) {
      const done = created.map((r) => r.protocol.toUpperCase()).join(" + ");
      return { created, error: done ? `${done} rule created, but ${p.toUpperCase()} failed: ${e.message}` : e.message };
    }
  }
  return { created, error: null };
}

export type Badge = { text: string; tone: "good" | "bad" | "warn" | "idle"; actionable: boolean; title: string };

export function badgeFor(status: RuleStatus | undefined, enabled: boolean, verifying: boolean): Badge {
  const idle: Badge = { text: "", tone: "idle", actionable: false, title: "" };
  if (verifying) return { ...idle, text: "Verifying…", tone: "warn" };
  if (!enabled) return { ...idle, text: "Disabled", tone: "idle" };
  if (!status) return { ...idle, text: "Checking…", tone: "warn" };
  // Firewall is checked first — a blocked port makes the backend irrelevant.
  if (status.firewall === "closed") return { text: "Blocked in AWS", tone: "bad", actionable: true, title: status.firewall_detail };
  if (status.firewall === "unconfigured") return { text: "AWS unverified", tone: "warn", actionable: false, title: status.firewall_detail };
  // Connectable means firewall is open AND backend responded — the best state.
  if (status.connectable) return { text: "Open & connectable", tone: "good", actionable: false, title: status.firewall_detail };
  // Firewall is open but backend issues remain.
  if (status.backend === "refused") return { text: "Nothing listening", tone: "bad", actionable: false, title: status.backend_detail };
  if (status.backend === "timeout") return { text: "Destination unreachable", tone: "bad", actionable: false, title: status.backend_detail };
  return { text: "Port open, backend unverified", tone: "warn", actionable: false, title: status.backend_detail };
}

export function verificationSettled(ruleIds: number[], statuses: RuleStatus[]): boolean {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  return ruleIds.every((id) => {
    const s = byId.get(id);
    if (!s) return false;
    // Only "open" and "unconfigured" are final answers. "closed" means AWS
    // blocked the port (we can fix that), and anything else is still pending.
    return s.firewall === "open" || s.firewall === "unconfigured";
  });
}

export function awsBadge(status: LightsailStatus | null): Badge {
  const idle: Badge = { text: "AWS", tone: "idle", actionable: false, title: "" };
  if (!status) return idle;
  if (status.configured) return { text: "AWS", tone: "good", actionable: false, title: `Connected to ${status.instance} (${status.region})` };
  if (status.needs_credentials) return { text: "AWS", tone: "bad", actionable: true, title: status.reason };
  return { ...idle, tone: "bad", title: status.reason };
}

// ===== Internal components =====

function NetworkInfoCard({ info }: { info: NetworkInfo }) {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Host</span>
          <div className="mt-1 truncate font-medium">{info.self_hostname}</div>
        </div>
        <div>
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Public IP</span>
          <div className="mt-1 truncate font-mono text-[11px]">{info.self_public_ip || "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Tailscale IP</span>
          <div className="mt-1 truncate font-mono text-[11px]">{info.self_tailscale_ip || "—"}</div>
        </div>
      </div>
      {info.peers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Peers ({info.peers.filter((p) => p.online).length} online)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {info.peers.map((p) => (
              <div key={p.hostname} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-[11px] transition-colors duration-fast ease-anthropic-out hover:bg-secondary/80">
                <span className={`w-2 h-2 rounded-full inline-block transition-colors duration-slow ${p.online ? "bg-success" : "bg-muted-foreground"}`} />
                <span className="font-medium">{p.hostname}</span>
                <span className="text-muted-foreground font-mono text-[10px]">{p.ip}</span>
                {p.tags.map((t) => (<span key={t} className="px-1.5 rounded-full bg-muted text-muted-foreground text-[9px]">{t}</span>))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const toneClasses: Record<string, string> = {
  good: "bg-success/15 text-success",
  bad: "bg-destructive/15 text-destructive",
  warn: "bg-secondary text-muted-foreground",
  idle: "bg-secondary text-muted-foreground",
};

function RuleRow({ rule, index, publicIp, status, verifying, onToggle, onDelete, onOpenFirewall, isDeleteConfirm, error }: {
  rule: Rule; index: number; publicIp: string | null | undefined; status: RuleStatus | undefined; verifying: boolean;
  onToggle: () => void; onDelete: () => void; onOpenFirewall: () => void; isDeleteConfirm: boolean; error?: string;
}) {
  const badge = badgeFor(status, rule.enabled, verifying);
  const animatedRef = useRef(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  useEffect(() => {
    if (!animatedRef.current) {
      animatedRef.current = true;
      setShouldAnimate(true);
    }
  }, []);
  return (
    <div className={shouldAnimate ? "animate-row-in" : ""} style={shouldAnimate ? { animationDelay: `${index * 40}ms` } : undefined}>
      <Card hoverable className={`p-3 flex items-center gap-3 ${isDeleteConfirm ? "border-destructive/40" : ""}`}>
        <Switch checked={rule.enabled} onCheckedChange={onToggle} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate text-sm">{rule.label}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground uppercase font-mono tracking-wider transition-colors duration-fast ease-anthropic-out">{rule.protocol}</span>
            {badge.text && (
              <button onClick={badge.actionable ? onOpenFirewall : undefined}
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium transition-colors duration-fast ease-anthropic-out ${toneClasses[badge.tone]} ${badge.actionable ? "cursor-pointer hover:opacity-80" : ""}`}
                title={badge.title}>{badge.text}</button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1 font-mono">
            <span>{publicIp || "<this-host>"}:{rule.public_port}</span>
            <span className="text-primary transition-opacity duration-fast">→</span>
            <span>{rule.dest_hostname}:{rule.dest_port}</span>
            <span className="text-[9px] opacity-60">({rule.dest_ip})</span>
          </div>
        </div>
        <Button variant={isDeleteConfirm ? "destructive" : "ghost"} size="icon" onClick={onDelete}>
          {isDeleteConfirm ? "✓" : "✕"}
        </Button>
      </Card>
      {error && <p className="text-[10px] text-destructive mt-1 ml-1 font-medium">{error}</p>}
    </div>
  );
}

function AddRuleDialog({ peers, onCreated }: { peers: Peer[]; onCreated: (created: Rule[], allSucceeded: boolean) => void }) {
  const [label, setLabel] = useState("");
  const [publicPort, setPublicPort] = useState("");
  const [destHostname, setDestHostname] = useState(peers[0]?.hostname || "");
  const [destPort, setDestPort] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp" | "both">("tcp");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    const { created, error } = await createForProtocols(protocol, {
      label, public_port: parseInt(publicPort), dest_hostname: destHostname, dest_port: parseInt(destPort), enabled: true,
    }, api.createRule);
    if (error && created.length === 0) setErr(error);
    else if (error) { setErr(error); onCreated(created, false); }
    else onCreated(created, true);
    setBusy(false);
  };

  return (
    <DialogContent className="p-0">
      <DialogHeader className="p-6 pb-0"><DialogTitle>New port forward</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4 p-6">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Label</label>
          <Input name="label" placeholder="Minecraft server" value={label} onChange={(e: any) => setLabel(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Destination machine</label>
          <select name="dest_hostname" value={destHostname} onChange={(e: any) => setDestHostname(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-fast ease-anthropic-out" required>
            {peers.map((p) => (<option key={p.hostname} value={p.hostname}>{p.hostname} ({p.ip})</option>))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Public port</label>
            <Input type="number" name="public_port" placeholder="25565" value={publicPort} onChange={(e: any) => setPublicPort(e.target.value)} required min={1} max={65535} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Internal port</label>
            <Input type="number" name="dest_port" placeholder="9015" value={destPort} onChange={(e: any) => setDestPort(e.target.value)} required min={1} max={65535} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Protocol</label>
          <select name="protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as "tcp" | "udp" | "both")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-fast ease-anthropic-out">
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="both">TCP + UDP</option>
          </select>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <DialogFooter className="pt-2">
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
