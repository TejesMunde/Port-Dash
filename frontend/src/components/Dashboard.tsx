import { useEffect, useState } from "react";
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
import {
  Plus,
  Trash2,
  LogOut,
  RefreshCw,
  ArrowRight,
  Globe,
  Network,
  Server,
  CircleDot,
  Download,
  Tag,
} from "lucide-react";

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [lsStatus, setLsStatus] = useState<LightsailStatus | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [rulesData, netData] = await Promise.all([api.listRules(), api.networkInfo()]);
      setRules(rulesData);
      setNetInfo(netData);
    } catch (e: any) {
      setErr(e.message);
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
        alert(`Update available: v${info.current} → v${info.latest}`);
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
    load();
    loadLsStatus();
    api.checkUpdate()
      .then((v) => setUpdateInfo({ current: v.current, latest: v.current, update_available: false }))
      .catch(() => {});
  }, []);

  const handleToggle = async (rule: Rule) => {
    try {
      const updated = await api.toggleRule(rule.id);
      setRules(rules.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!confirm(`Delete forward for port ${rule.public_port}?`)) return;
    try {
      await api.deleteRule(rule.id);
      setRules(rules.filter((r) => r.id !== rule.id));
    } catch (e: any) {
      setErr(e.message);
    }
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
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Port Forwards</h1>
            <p className="text-sm text-muted-foreground">iptables DNAT rules on this VPS</p>
          </div>
          <div className="flex items-center gap-2">
            {lsStatus?.configured && (
              <span
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400"
                title={`Lightsail: ${lsStatus.reason}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                AWS
              </span>
            )}
            {lsStatus && !lsStatus.configured && lsStatus.reason !== "LIGHTSAIL_INSTANCE not set" && (
              <span
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400"
                title={`Lightsail error: ${lsStatus.reason}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                AWS
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={load} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={checkUpdate} title="Check version">
              <Tag className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {updateInfo?.update_available && (
          <Card className="p-4 border-blue-500/40 bg-blue-500/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm font-medium">Update available</p>
                <p className="text-xs text-muted-foreground">
                  v{updateInfo.current} → v{updateInfo.latest}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleUpdate} disabled={updating}>
              {updating ? "Updating…" : "Update"}
            </Button>
          </Card>
        )}
        {netInfo && <NetworkInfoCard info={netInfo} />}

        {err && (
          <Card className="p-4 border-destructive/40 bg-destructive/10 text-destructive text-sm">
            {err}
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Active forwards</h2>
            <p className="text-sm text-muted-foreground">
              {rules.length} rule{rules.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canAddRule}>
                <Plus className="w-4 h-4" />
                Add forward
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
          <Card className="p-4 border-yellow-500/40 bg-yellow-500/10 text-yellow-200 text-sm">
            {netInfo.tag_filter
              ? `No online Tailscale peers with tag "${netInfo.tag_filter}" found.`
              : "No online Tailscale peers detected. Make sure your destination machine is connected to the same tailnet."}
          </Card>
        )}

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
        ) : rules.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No forwards yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {canAddRule ? "Click 'Add forward' to create one." : "Connect a Tailscale peer first."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                publicIp={netInfo?.self_public_ip}
                onToggle={() => handleToggle(rule)}
                onDelete={() => handleDelete(rule)}
              />
            ))}
          </div>
        )}
      </main>
      <footer className="fixed bottom-3 left-3 px-2.5 py-1 rounded bg-secondary/80 text-[13px] font-mono text-muted-foreground">
        v{updateInfo?.current || "?"}
      </footer>
    </div>
  );
}

function NetworkInfoCard({ info }: { info: NetworkInfo }) {
  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoItem
          icon={<Server className="w-4 h-4" />}
          label="This host"
          value={info.self_hostname}
        />
        <InfoItem
          icon={<Globe className="w-4 h-4" />}
          label="Public IP"
          value={info.self_public_ip || "—"}
        />
        <InfoItem
          icon={<Network className="w-4 h-4" />}
          label="Tailscale IP"
          value={info.self_tailscale_ip || "—"}
        />
      </div>
      {info.peers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
            Tailscale peers ({info.peers.filter((p) => p.online).length} online)
          </div>
          <div className="flex flex-wrap gap-2">
            {info.peers.map((p) => (
              <div
                key={p.hostname}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs"
              >
                <CircleDot
                  className={`w-3 h-3 ${
                    p.online ? "text-green-400" : "text-muted-foreground"
                  }`}
                />
                <span className="font-medium">{p.hostname}</span>
                <span className="text-muted-foreground font-mono">{p.ip}</span>
                {p.tags.map((t) => (
                  <span key={t} className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-mono">
                    {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm mt-1 truncate">{value}</div>
    </div>
  );
}

function RuleRow({
  rule,
  publicIp,
  onToggle,
  onDelete,
}: {
  rule: Rule;
  publicIp: string | null | undefined;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-4 flex items-center gap-4">
      <Switch checked={rule.enabled} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-medium truncate">{rule.label}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground uppercase">
            {rule.protocol}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 font-mono">
          <span>
            {publicIp || "<this-host>"}:{rule.public_port}
          </span>
          <ArrowRight className="w-3 h-3" />
          <span>
            {rule.dest_hostname}:{rule.dest_port}
          </span>
          <span className="text-xs">({rule.dest_ip})</span>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </Card>
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
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New port forward</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-sm text-muted-foreground">Label</label>
          <Input
            placeholder="Minecraft server"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Destination machine</label>
          <select
            value={destHostname}
            onChange={(e) => setDestHostname(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          >
            {peers.map((p) => (
              <option key={p.hostname} value={p.hostname}>
                {p.hostname} ({p.ip})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">Public port</label>
            <Input
              type="number"
              placeholder="25565"
              value={publicPort}
              onChange={(e) => setPublicPort(e.target.value)}
              required
              min={1}
              max={65535}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Internal port</label>
            <Input
              type="number"
              placeholder="9015"
              value={destPort}
              onChange={(e) => setDestPort(e.target.value)}
              required
              min={1}
              max={65535}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Protocol</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as "tcp" | "udp")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
