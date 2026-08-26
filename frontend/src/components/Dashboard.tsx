import { useEffect, useRef, useState } from "react";
import { api, clearToken, type Rule, type RuleInput, type NetworkInfo, type Peer, type UpdateInfo, type LightsailStatus, type RuleStatus } from "@/lib/api";
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

// Selects are plain elements rather than a component, matched to Input's shape:
// 3px radius, Mute Gray border, 2px blue focus ring.
const SELECT_CLASS =
  "flex h-12 w-full rounded-sm border border-input bg-background px-3 py-2 text-[16px] text-foreground " +
  "transition-[border-color,box-shadow] duration-180 ease-out " +
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))]";

const FIELD_LABEL_CLASS = "block text-[14px] font-medium text-muted-foreground mb-2";

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
  const [statuses, setStatuses] = useState<Record<number, RuleStatus>>({});
  const [verifying, setVerifying] = useState<number[]>([]);
  const cachedRules = useRef<Rule[]>([]);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

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

  const refreshStatuses = async (): Promise<RuleStatus[]> => {
    try {
      const list = await api.rulesStatus();
      setStatuses(Object.fromEntries(list.map((st) => [st.id, st])));
      return list;
    } catch {
      return [];
    }
  };

  // AWS applies a firewall change a few seconds after the API returns, so the
  // create call alone proves nothing. Poll until the ports actually report open.
  const verifyOpen = async (ids: number[]) => {
    setVerifying(ids);
    try {
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, VERIFY_INTERVAL_MS));
        if (verificationSettled(ids, await refreshStatuses())) return;
      }
    } finally {
      setVerifying([]);
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
    if (cachedRules.current.length > 0) {
      setRules(cachedRules.current);
    }
    load();
    loadLsStatus();
    refreshStatuses();
    const poll = setInterval(refreshStatuses, 15000);
    cleanup.current = () => clearInterval(poll);
    api.checkUpdate()
      .then((v) => setUpdateInfo({ current: v.current, latest: v.current, update_available: false }))
      .catch(() => {});
    return () => cleanup.current?.();
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
    // Transparent so the background loop reads through; the masthead and cards are
    // the only opaque surfaces, and the blue footer still anchors the bottom.
    <div className="min-h-screen flex flex-col">
      {/* Translucent Console Black: keeps the masthead reading as a solid bar while
          letting the background through. It never inverts at any scroll position. */}
      <header className="bg-black/70">
        <div className="mx-auto w-full max-w-[1280px] px-4 md:px-12 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="display text-[28px] md:text-[35px] text-white tracking-[0.1px]">Port forwards</h1>
            <p className="text-[14px] text-white/60 mt-1">iptables DNAT rules on this host</p>
          </div>
          <div className="flex items-center gap-2">
            {lsStatus?.configured && (
              <span
                className="hidden sm:inline-flex items-center gap-2 bg-white/10 text-white text-[14px] font-medium px-4 py-2 rounded-full"
                title={`Lightsail: ${lsStatus.reason}`}
              >
                <span className="w-2 h-2 rounded-full bg-primary" />
                Lightsail
              </span>
            )}
            {lsStatus && !lsStatus.configured && lsStatus.reason !== "LIGHTSAIL_INSTANCE not set" && (
              <span
                className="hidden sm:inline-flex items-center gap-2 bg-white/10 text-destructive text-[14px] font-medium px-4 py-2 rounded-full"
                title={`Lightsail error: ${lsStatus.reason}`}
              >
                <span className="w-2 h-2 rounded-full bg-destructive" />
                Lightsail
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={load} title="Refresh">R</Button>
            <Button variant="ghost" size="icon" onClick={checkUpdate} title="Check version">V</Button>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">X</Button>
          </div>
        </div>
      </header>

      {/* Gallery pace: each module gets its own room. */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1280px] px-4 md:px-12 py-12 md:py-16 space-y-12">
          {err && <Card className="p-6 text-[16px] text-destructive">{err}</Card>}

          {updateInfo?.update_available && (
            <Card className="p-8 flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="display text-[22px]">Update available</p>
                <p className="text-[14px] text-muted-foreground mt-1">
                  v{updateInfo.current} &rarr; v{updateInfo.latest}
                </p>
              </div>
              <Button onClick={handleUpdate} disabled={updating}>
                {updating ? "Updating…" : "Update"}
              </Button>
            </Card>
          )}

          {netInfo && <NetworkInfoCard info={netInfo} />}

          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="display text-[28px]">Active forwards</h2>
                <p className="text-[14px] text-muted-foreground mt-1">
                  {rules.length} rule{rules.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!canAddRule}>Add forward</Button>
                </DialogTrigger>
                {netInfo && (
                  <AddRuleDialog
                    peers={onlinePeers}
                    onCreated={(created, allSucceeded) => {
                      if (created.length) {
                        setRules((rs) => [...rs, ...created]);
                        verifyOpen(created.map((r) => r.id));
                      }
                      if (allSucceeded) setAddOpen(false);
                    }}
                  />
                )}
              </Dialog>
            </div>

            {!canAddRule && netInfo && (
              <Card className="p-6 text-[16px] text-muted-foreground">
                {netInfo.tag_filter
                  ? `No online Tailscale peers with tag "${netInfo.tag_filter}" found.`
                  : "No online Tailscale peers detected. Connect the destination machine to the same tailnet."}
              </Card>
            )}

            {loading && cachedRules.current.length === 0 ? (
              <Card className="p-12 text-center text-[16px] text-muted-foreground">Loading&hellip;</Card>
            ) : rules.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="display text-[22px]">No forwards yet</p>
                <p className="text-[16px] text-muted-foreground mt-2">
                  {canAddRule ? "Add one to route a public port to a peer." : "Connect a Tailscale peer first."}
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    publicIp={netInfo?.self_public_ip}
                    onToggle={() => handleToggle(rule)}
                    onDelete={() => handleDelete(rule)}
                    isDeleteConfirm={confirmDeleteId === rule.id}
                    error={ruleErrors[rule.id]}
                    status={statuses[rule.id]}
                    verifying={verifying.includes(rule.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* PlayStation Blue anchors the bottom of the channel. */}
      <footer className="bg-primary text-white">
        {/* Micro Caption (12px / 500) is the system's footer microcopy tier. */}
        <div className="mx-auto w-full max-w-[1280px] px-4 md:px-12 py-3 flex items-center justify-between gap-4">
          <span className="text-[12px] font-medium">Port Forward Dashboard</span>
          <span className="text-[12px] font-medium text-white/70">v{updateInfo?.current || "?"}</span>
        </div>
      </footer>
    </div>
  );
}

function NetworkInfoCard({ info }: { info: NetworkInfo }) {
  return (
    <Card className="p-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <div className="text-[14px] text-muted-foreground">This host</div>
          <div className="text-[18px] mt-1 truncate">{info.self_hostname}</div>
        </div>
        <div>
          <div className="text-[14px] text-muted-foreground">Public IP</div>
          <div className="text-[18px] mt-1 truncate">{info.self_public_ip || "—"}</div>
        </div>
        <div>
          <div className="text-[14px] text-muted-foreground">Tailscale IP</div>
          <div className="text-[18px] mt-1 truncate">{info.self_tailscale_ip || "—"}</div>
        </div>
      </div>
      {info.peers.length > 0 && (
        <div className="mt-8 pt-8 border-t border-border">
          <div className="text-[14px] text-muted-foreground mb-4">
            Tailscale peers ({info.peers.filter((p) => p.online).length} online)
          </div>
          <div className="flex flex-wrap gap-3">
            {info.peers.map((p) => (
              <div
                key={p.hostname}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-[14px]"
              >
                {/* Blue for online, Body Gray for offline — this system has no green. */}
                <span className={`w-2 h-2 rounded-full ${p.online ? "bg-primary" : "bg-[#6b6b6b]"}`} />
                <span className="font-medium">{p.hostname}</span>
                <span className="text-muted-foreground">{p.ip}</span>
                {p.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-3xl bg-background text-muted-foreground text-[12px] font-medium">
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

function RuleRow({
  rule,
  publicIp,
  onToggle,
  onDelete,
  isDeleteConfirm,
  error,
  status,
  verifying,
}: {
  rule: Rule;
  publicIp: string | null | undefined;
  onToggle: () => void;
  onDelete: () => void;
  isDeleteConfirm: boolean;
  error?: string;
  status?: RuleStatus;
  verifying: boolean;
}) {
  const badge = badgeFor(status, rule.enabled, verifying);
  return (
    <div>
      <Card
        className={`p-6 flex items-center gap-6 shadow-ps-2 ${
          isDeleteConfirm ? "shadow-ps-3 ring-2 ring-destructive" : ""
        }`}
      >
        <Switch checked={rule.enabled} onCheckedChange={onToggle} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-medium truncate">{rule.label}</span>
            <span className="text-[12px] font-bold px-2 py-1 rounded-3xl bg-secondary text-muted-foreground">
              {rule.protocol === "tcp" ? "TCP" : "UDP"}
            </span>
            <span
              className={`text-[12px] font-bold px-2 py-1 rounded-3xl ${BADGE_TONE[badge.tone]}`}
              title={badge.title}
            >
              {badge.text}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground mt-1">
            <span>
              {publicIp || "<this-host>"}:{rule.public_port}
            </span>
            <span>&rarr;</span>
            <span>
              {rule.dest_hostname}:{rule.dest_port}
            </span>
            <span className="text-[12px]">({rule.dest_ip})</span>
          </div>
        </div>
        <Button
          variant={isDeleteConfirm ? "destructive" : "secondary"}
          size="icon"
          onClick={onDelete}
          title={isDeleteConfirm ? "Confirm delete" : "Delete forward"}
        >
          {isDeleteConfirm ? "✓" : "✕"}
        </Button>
      </Card>
      {error && <p className="text-[14px] text-destructive mt-2 ml-1">{error}</p>}
      {!error && status && !status.connectable && rule.enabled && !verifying && (
        <p className="text-[14px] text-muted-foreground mt-2 ml-1">
          {status.firewall === "open" ? status.backend_detail : status.firewall_detail}
        </p>
      )}
    </div>
  );
}

export const VERIFY_INTERVAL_MS = 2000;
export const VERIFY_ATTEMPTS = 15; // ~30s, comfortably past AWS's apply delay

// Stop polling once AWS has answered for every new rule. "unconfigured" is a
// permanent answer (no creds), not a pending one, so waiting longer is pointless.
export function verificationSettled(ids: number[], list: RuleStatus[]): boolean {
  const mine = list.filter((st) => ids.includes(st.id));
  return (
    mine.length === ids.length &&
    mine.every((st) => st.firewall === "open" || st.firewall === "unconfigured")
  );
}

// One badge, one message: name the half that is broken. Order matters -- the
// firewall is checked first because a blocked port makes the backend irrelevant.
export function badgeFor(
  status: RuleStatus | undefined,
  enabled: boolean,
  verifying: boolean
): { text: string; tone: "good" | "bad" | "warn" | "idle"; title: string } {
  if (verifying) return { text: "Verifying…", tone: "idle", title: "Waiting for AWS to report the port open" };
  if (!enabled) return { text: "Disabled", tone: "idle", title: "Rule is switched off" };
  if (!status) return { text: "Checking…", tone: "idle", title: "Fetching status" };
  if (status.connectable) return { text: "Open & connectable", tone: "good", title: status.firewall_detail };
  if (status.firewall === "closed")
    return { text: "Blocked in AWS", tone: "bad", title: status.firewall_detail };
  if (status.firewall === "unconfigured")
    return { text: "AWS unverified", tone: "warn", title: status.firewall_detail };
  if (status.backend === "refused")
    return { text: "Nothing listening", tone: "bad", title: status.backend_detail };
  if (status.backend === "timeout")
    return { text: "Destination unreachable", tone: "bad", title: status.backend_detail };
  return { text: "Port open, backend unverified", tone: "warn", title: status.backend_detail };
}

const BADGE_TONE: Record<string, string> = {
  good: "bg-accent text-black",
  bad: "bg-destructive text-white",
  warn: "bg-secondary text-foreground",
  idle: "bg-secondary text-muted-foreground",
};

// "both" means one rule per protocol. Sequential on purpose: each create shells out
// to iptables and writes SQLite, and a half-succeeded run must keep the rule that landed.
export async function createForProtocols(
  protocol: "tcp" | "udp" | "both",
  base: Omit<RuleInput, "protocol">,
  create: (r: RuleInput) => Promise<Rule>
): Promise<{ created: Rule[]; error: string | null }> {
  const protocols: ("tcp" | "udp")[] = protocol === "both" ? ["tcp", "udp"] : [protocol];
  const created: Rule[] = [];
  for (const proto of protocols) {
    try {
      created.push(await create({ ...base, protocol: proto }));
    } catch (e: any) {
      const done = created.map((r) => r.protocol.toUpperCase()).join(" + ");
      return {
        created,
        error: done
          ? `${done} rule created, but ${proto.toUpperCase()} failed: ${e.message}`
          : e.message,
      };
    }
  }
  return { created, error: null };
}

function AddRuleDialog({
  peers,
  onCreated,
}: {
  peers: Peer[];
  onCreated: (created: Rule[], allSucceeded: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [publicPort, setPublicPort] = useState("");
  const [destHostname, setDestHostname] = useState(peers[0]?.hostname || "");
  const [destPort, setDestPort] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp" | "both">("tcp");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { created, error } = await createForProtocols(
      protocol,
      {
        label,
        public_port: parseInt(publicPort),
        dest_hostname: destHostname,
        dest_port: parseInt(destPort),
        enabled: true,
      },
      api.createRule
    );
    setErr(error);
    onCreated(created, error === null);
    setBusy(false);
  };

  return (
    <DialogContent className="w-full">
      <DialogHeader>
        <DialogTitle>New port forward</DialogTitle>
        <p className="text-[14px] text-muted-foreground">
          Route a public port on this host to a machine on your tailnet.
        </p>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-5 mt-6 px-8">
        <div>
          <label className={FIELD_LABEL_CLASS}>Label</label>
          <Input
            placeholder="Minecraft server"
            value={label}
            onChange={(e: any) => setLabel(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className={FIELD_LABEL_CLASS}>Destination machine</label>
          <select
            value={destHostname}
            onChange={(e: any) => setDestHostname(e.target.value)}
            className={SELECT_CLASS}
            required
          >
            {peers.map((p) => (
              <option key={p.hostname} value={p.hostname}>
                {p.hostname} ({p.ip})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={FIELD_LABEL_CLASS}>Public port</label>
            <Input
              type="number"
              placeholder="25565"
              value={publicPort}
              onChange={(e: any) => setPublicPort(e.target.value)}
              required
              min={1}
              max={65535}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS}>Internal port</label>
            <Input
              type="number"
              placeholder="9015"
              value={destPort}
              onChange={(e: any) => setDestPort(e.target.value)}
              required
              min={1}
              max={65535}
            />
          </div>
        </div>
        <div>
          <label className={FIELD_LABEL_CLASS}>Protocol</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as "tcp" | "udp" | "both")}
            className={SELECT_CLASS}
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="both">TCP + UDP</option>
          </select>
        </div>
        {err && <p className="text-[14px] text-destructive">{err}</p>}
        <DialogFooter className="px-0 pb-0">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
