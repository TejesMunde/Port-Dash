import { useEffect, useRef, useState } from "react";
import { api, clearToken, type Rule, type NetworkInfo, type Peer, type UpdateInfo, type LightsailStatus } from "@/lib/api";
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
  const cachedRules = useRef<Rule[]>([]);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [rulesData, netData] = await Promise.all([api.listRules(), api.networkInfo()]);
      cachedRules.current = rulesData;
      setRules(rulesData);
      setNetInfo(netData);
    } catch (e: any) {
      if (cachedRules.current.length === 0) {
        setErr(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLsStatus = async () => {
    try {
      setLsStatus(await api.lightsailStatus());
    } catch {
      setLsStatus({ configured: false, reason: "API unreachable" });
    }
  };

  const checkUpdate = async () => {
    try {
      const info = await api.checkUpdate();
      setUpdateInfo(info);
      if (info.update_available) {
        alert(`Update available: v${info.current} \u2192 v${info.latest}`);
      } else {
        alert(`You're on the latest version (v${info.current})`);
      }
    } catch {
      alert("Could not check for updates. Is the server reachable?");
    }
  };

  const handleUpdate = async () => {
    if (!confirm("Update to latest version? Port rules will be preserved.")) return;
    setUpdating(true);
    try {
      const res = await api.triggerUpdate();
      alert(res.message);
      setUpdateInfo(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (cachedRules.current.length > 0) {
      setRules(cachedRules.current);
    }
    load();
    loadLsStatus();
    api.checkUpdate()
      .then((v) => setUpdateInfo({ current: v.current, latest: v.current, update_available: false }))
      .catch(() => {});
  }, []);

  const handleToggle = async (rule: Rule) => {
    const prev = rules;
    setRules(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !rule.enabled } : r)));
    setRuleErrors((p) => ({ ...p, [rule.id]: "" }));
    try {
      const updated = await api.toggleRule(rule.id);
      setRules(rules.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setRules(prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      setRuleErrors((p) => ({ ...p, [rule.id]: e.message }));
    }
  };

  const handleDelete = (rule: Rule) => {
    if (confirmDeleteId !== rule.id) {
      setConfirmDeleteId(rule.id);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = setTimeout(() => {
        setConfirmDeleteId(null);
        deleteTimeoutRef.current = null;
      }, 3000);
      return;
    }
    setConfirmDeleteId(null);
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    const prev = rules;
    setRules(rules.filter((r) => r.id !== rule.id));
    setRuleErrors((p) => ({ ...p, [rule.id]: "" }));
    api.deleteRule(rule.id).catch((e: any) => {
      setRules(prev);
      setRuleErrors((p) => ({ ...p, [rule.id]: e.message }));
    });
  };

  const logout = () => {
    clearToken();
    onLogout();
  };

  const onlinePeers = netInfo?.peers.filter((p) => p.online) || [];
  const canAddRule = onlinePeers.length > 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Port Forwards</h1>
            <p className="text-xs text-muted-foreground">iptables DNAT rules</p>
          </div>
          <div className="flex items-center gap-1.5">
            {lsStatus?.configured && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> AWS
              </span>
            )}
            {lsStatus && !lsStatus.configured && lsStatus.reason !== "LIGHTSAIL_INSTANCE not set" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> AWS
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={load} title="Refresh">\u21bb</Button>
            <Button variant="ghost" size="icon" onClick={checkUpdate} title="Version">\u2318</Button>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">\u2190</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        {err && <p className="text-xs text-red-500">{err}</p>}
        {updateInfo?.update_available && (
          <Card className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Update available</span>
              <span className="text-xs text-muted-foreground">
                v{updateInfo.current} \u2192 v{updateInfo.latest}
              </span>
            </div>
            <Button size="sm" onClick={handleUpdate} disabled={updating}>
              {updating ? "Updating\u2026" : "Update"}
            </Button>
          </Card>
        )}
        {netInfo && <NetworkInfoCard info={netInfo} />}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Active forwards</h2>
            <p className="text-xs text-muted-foreground">
              {rules.length} rule{rules.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canAddRule}>
                + Add forward
              </Button>
            </DialogTrigger>
            {netInfo && (
              <AddRuleDialog
                peers={onlinePeers}
                onCreated={(r) => {
                  setRules([...rules, r]);
                  setAddOpen(false);
                }}
              />
            )}
          </Dialog>
        </div>

        {!canAddRule && netInfo && (
          <Card className="p-3 text-xs text-muted-foreground">
            {netInfo.tag_filter
              ? `No online Tailscale peers with tag "${netInfo.tag_filter}" found.`
              : "No online Tailscale peers detected."}
          </Card>
        )}

        {loading && cachedRules.current.length === 0 ? (
          <Card className="p-5 text-center text-xs text-muted-foreground">Loading\u2026</Card>
        ) : rules.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-xs text-muted-foreground">No forwards yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {canAddRule ? "Click '+ Add forward' to create one." : ""}
            </p>
          </Card>
        ) : (
          <div className="space-y-1">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                publicIp={netInfo?.self_public_ip}
                onToggle={() => handleToggle(rule)}
                onDelete={() => handleDelete(rule)}
                isDeleteConfirm={confirmDeleteId === rule.id}
                error={ruleErrors[rule.id]}
              />
            ))}
          </div>
        )}
      </main>
      <footer className="fixed bottom-3 left-3 px-2 py-0.5 rounded bg-secondary/80 text-[11px] text-muted-foreground">
        v{updateInfo?.current || "?"}
      </footer>
    </div>
  );
}

function NetworkInfoCard({ info }: { info: NetworkInfo }) {
  return (
    <Card className="p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground uppercase tracking-wide">Host</span>
          <div className="mt-0.5 truncate">{info.self_hostname}</div>
        </div>
        <div>
          <span className="text-muted-foreground uppercase tracking-wide">Public IP</span>
          <div className="mt-0.5 truncate">{info.self_public_ip || "\u2014"}</div>
        </div>
        <div>
          <span className="text-muted-foreground uppercase tracking-wide">Tailscale IP</span>
          <div className="mt-0.5 truncate">{info.self_tailscale_ip || "\u2014"}</div>
        </div>
      </div>
      {info.peers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
            Peers ({info.peers.filter((p) => p.online).length} online)
          </div>
          <div className="flex flex-wrap gap-1">
            {info.peers.map((p) => (
              <div
                key={p.hostname}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[11px]"
              >
                <span className={`w-2 h-2 rounded-full inline-block ${p.online ? "bg-green-400" : "bg-muted-foreground"}`} />
                <span className="font-medium">{p.hostname}</span>
                <span className="text-muted-foreground">{p.ip}</span>
                {p.tags.map((t) => (
                  <span key={t} className="px-1 rounded bg-secondary text-muted-foreground text-[9px]">{t}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function RuleRow({
  rule,
  publicIp,
  onToggle,
  onDelete,
  isDeleteConfirm,
  error,
}: {
  rule: Rule;
  publicIp: string | null | undefined;
  onToggle: () => void;
  onDelete: () => void;
  isDeleteConfirm: boolean;
  error?: string;
}) {
  return (
    <div>
      <Card className={`p-2 flex items-center gap-2 ${isDeleteConfirm ? "border-red-500/50" : ""}`}>
        <Switch checked={rule.enabled} onCheckedChange={onToggle} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium truncate text-sm">{rule.label}</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground uppercase">
              {rule.protocol}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <span>{publicIp || "<this-host>"}:{rule.public_port}</span>
            <span>\u2192</span>
            <span>{rule.dest_hostname}:{rule.dest_port}</span>
            <span className="text-[9px]">({rule.dest_ip})</span>
          </div>
        </div>
        <Button variant={isDeleteConfirm ? "destructive" : "ghost"} size="icon" onClick={onDelete}>
          {isDeleteConfirm ? "\u2713" : "\u2715"}
        </Button>
      </Card>
      {error && <p className="text-[10px] text-red-500 mt-0.5 ml-1">{error}</p>}
    </div>
  );
}

function AddRuleDialog({
  peers,
  onCreated,
}: {
  peers: Peer[];
  onCreated: (r: Rule) => void;
}) {
  const [label, setLabel] = useState("");
  const [publicPort, setPublicPort] = useState("");
  const [destHostname, setDestHostname] = useState(peers[0]?.hostname || "");
  const [destPort, setDestPort] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api.createRule({
        label,
        public_port: parseInt(publicPort),
        protocol,
        dest_hostname: destHostname,
        dest_port: parseInt(destPort),
        enabled: true,
      });
      onCreated(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="p-5">
      <DialogHeader>
        <DialogTitle>New port forward</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-2.5 mt-3 px-5">
        <div>
          <label className="text-[11px] text-muted-foreground">Label</label>
          <Input placeholder="Minecraft server" value={label} onChange={(e: any) => setLabel(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Destination machine</label>
            <select
              value={destHostname}
              onChange={(e: any) => setDestHostname(e.target.value)}
            className="flex h-9 w-full rounded border border-input bg-background px-3 py-2 text-sm"
            required
          >
            {peers.map((p) => (
              <option key={p.hostname} value={p.hostname}>{p.hostname} ({p.ip})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Public port</label>
            <Input type="number" placeholder="25565" value={publicPort} onChange={(e: any) => setPublicPort(e.target.value)} required min={1} max={65535} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Internal port</label>
            <Input type="number" placeholder="9015" value={destPort} onChange={(e: any) => setDestPort(e.target.value)} required min={1} max={65535} />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Protocol</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as "tcp" | "udp")}
            className="flex h-9 w-full rounded border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating\u2026" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
