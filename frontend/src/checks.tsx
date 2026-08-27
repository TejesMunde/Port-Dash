// Runnable checks for the hand-rolled Dialog and the TCP+UDP rule creation.
// Run: npx esbuild src/checks.tsx --bundle --platform=node --alias:@=./src --outfile=checks.cjs && node checks.cjs
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogTrigger, DialogContent } from "./components/ui/dialog";
import { createForProtocols, badgeFor, verificationSettled, awsBadge } from "./components/Dashboard";
import type { Rule, RuleInput, RuleStatus, LightsailStatus } from "./lib/api";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error("checks FAILED: " + msg);
};

// --- Dialog: the trigger must survive while the dialog is closed ---
const tree = (open: boolean) => (
  <Dialog open={open} onOpenChange={() => {}}>
    <DialogTrigger asChild>
      <button>+ Add forward</button>
    </DialogTrigger>
    <DialogContent>SECRET_CONTENT</DialogContent>
  </Dialog>
);
const closed = renderToStaticMarkup(tree(false));
const opened = renderToStaticMarkup(tree(true));
assert(closed.includes("+ Add forward"), "trigger must render while closed");
assert(!closed.includes("SECRET_CONTENT"), "content must be hidden while closed");
assert(opened.includes("+ Add forward"), "trigger must stay rendered while open");
assert(opened.includes("SECRET_CONTENT"), "content must render while open");

// --- createForProtocols ---
const base: Omit<RuleInput, "protocol"> = {
  label: "Minecraft",
  public_port: 25565,
  dest_hostname: "gamebox",
  dest_port: 25565,
  enabled: true,
};
const fakeRule = (r: RuleInput): Rule => ({
  id: r.protocol === "tcp" ? 1 : 2,
  dest_ip: "100.64.0.2",
  created_at: "now",
  ...r,
});
const ok = async (r: RuleInput) => fakeRule(r);
const failOn = (bad: string) => async (r: RuleInput) => {
  if (r.protocol === bad) throw new Error(`${bad.toUpperCase()} port 25565 already mapped`);
  return fakeRule(r);
};

// --- verification badge + polling stop condition ---
const st = (over: Partial<RuleStatus> = {}): RuleStatus => ({
  id: 1,
  firewall: "open",
  firewall_detail: "open in AWS (2208-2208/tcp)",
  backend: "reachable",
  backend_detail: "destination accepted a connection",
  connectable: true,
  ...over,
});

// verifying and disabled win over any status
assert(badgeFor(st(), true, true).text.startsWith("Verifying"), "verifying beats everything");
assert(badgeFor(st(), false, false).text === "Disabled", "disabled rule says so");
assert(badgeFor(undefined, true, false).text.startsWith("Checking"), "no status yet -> checking");

// the happy path
assert(badgeFor(st(), true, false).tone === "good", "connectable is good");

// the 2208 bug: AWS never opened the port, even though the server is alive
const blocked = st({ firewall: "closed", firewall_detail: "not open in the AWS firewall", connectable: false });
assert(badgeFor(blocked, true, false).text === "Blocked in AWS", "closed firewall named");
assert(badgeFor(blocked, true, false).tone === "bad", "closed firewall is bad");

// firewall outranks backend: a blocked port makes the backend irrelevant
const both = st({ firewall: "closed", backend: "refused", connectable: false });
assert(badgeFor(both, true, false).text === "Blocked in AWS", "firewall reported before backend");

// no AWS creds -> must warn, never claim open
const unconf = st({ firewall: "unconfigured", firewall_detail: "LIGHTSAIL_INSTANCE not set", connectable: false });
assert(badgeFor(unconf, true, false).tone === "warn", "unconfigured warns, not fails");
assert(badgeFor(unconf, true, false).text === "AWS unverified", "unconfigured never says open");

// the stopped-server case
const dead = st({ backend: "refused", backend_detail: "nothing is listening", connectable: false });
assert(badgeFor(dead, true, false).text === "Nothing listening", "stopped backend named");
assert(badgeFor(st({ backend: "timeout", connectable: false }), true, false).tone === "bad", "timeout is bad");

// udp probes are advisory only -> warn, never a red failure
const udp = st({ backend: "unknown", backend_detail: "UDP cannot be probed", connectable: false });
assert(badgeFor(udp, true, false).tone === "warn", "unprobeable udp must not read as broken");

// polling stops on a real answer, keeps waiting while a port is still closed
assert(!verificationSettled([1, 2], [st({ id: 1 })]), "missing id -> keep polling");
assert(!verificationSettled([1], [st({ id: 1, firewall: "closed" })]), "closed -> keep polling");
assert(verificationSettled([1], [st({ id: 1 })]), "open -> stop");
assert(
  verificationSettled([1], [st({ id: 1, firewall: "unconfigured" })]),
  "unconfigured is a final answer, not a pending one"
);
assert(
  verificationSettled([1, 2], [st({ id: 1 }), st({ id: 2, firewall: "unconfigured" })]),
  "all ids settled -> stop"
);

const run = async () => {
  let res = await createForProtocols("tcp", base, ok);
  assert(res.error === null && res.created.length === 1, "tcp: one rule");
  assert(res.created[0].protocol === "tcp", "tcp: correct protocol");

  res = await createForProtocols("udp", base, ok);
  assert(res.created.length === 1 && res.created[0].protocol === "udp", "udp: one rule");

  res = await createForProtocols("both", base, ok);
  assert(res.error === null && res.created.length === 2, "both: two rules");
  assert(
    res.created.map((r) => r.protocol).join(",") === "tcp,udp",
    "both: one rule per protocol, tcp first"
  );

  // half-success must keep the rule that landed and name the one that did not
  res = await createForProtocols("both", base, failOn("udp"));
  assert(res.created.length === 1 && res.created[0].protocol === "tcp", "both/udp-fails: keeps tcp");
  assert(!!res.error && res.error.includes("TCP rule created"), "both/udp-fails: reports tcp kept");
  assert(!!res.error && res.error.includes("UDP failed"), "both/udp-fails: names udp");

  // first one failing must not claim anything was created
  res = await createForProtocols("both", base, failOn("tcp"));
  assert(res.created.length === 0, "both/tcp-fails: nothing created");
  assert(res.error === "TCP port 25565 already mapped", "both/tcp-fails: raw error, no prefix");

  // --- badgeFor.actionable: only the badge with a real fix behind it ---
  const st = (o: Partial<RuleStatus>): RuleStatus => ({
    id: 1,
    firewall: "open",
    firewall_detail: "",
    backend: "reachable",
    backend_detail: "",
    connectable: false,
    ...o,
  });

  // The 2208 case: closed in AWS, and we hold the permission to open it.
  let bf = badgeFor(st({ firewall: "closed", firewall_detail: "not open in the AWS firewall" }), true, false);
  assert(bf.text === "Blocked in AWS" && bf.actionable === true, "row: blocked-in-AWS is clickable");
  assert(bf.title.includes("not open in the AWS firewall"), "row: keeps the AWS reason in the tooltip");

  // Everything else must stay inert -- offering "open this port" would be a lie
  // when the port is already open, or when we cannot even ask AWS.
  assert(!badgeFor(st({ connectable: true }), true, false).actionable, "row: connectable not clickable");
  assert(!badgeFor(st({ backend: "refused" }), true, false).actionable, "row: dead backend not clickable");
  assert(!badgeFor(st({ backend: "timeout" }), true, false).actionable, "row: timeout not clickable");
  assert(!badgeFor(st({ firewall: "unconfigured" }), true, false).actionable, "row: unconfigured not clickable");
  assert(!badgeFor(st({ firewall: "closed" }), false, false).actionable, "row: disabled rule not clickable");
  assert(!badgeFor(st({ firewall: "closed" }), true, true).actionable, "row: verifying not clickable");
  assert(!badgeFor(undefined, true, false).actionable, "row: unknown status not clickable");

  // --- awsBadge: green only on a proven connection, form only when it helps ---
  const ls = (o: Partial<LightsailStatus>): LightsailStatus => ({
    configured: false,
    reason: "",
    needs_credentials: false,
    instance: "",
    region: "",
    ...o,
  });

  // Before the first response we must not claim either state.
  let b = awsBadge(null);
  assert(b.tone === "idle" && !b.actionable, "aws: unknown before the first response");

  // A working connection is the only thing allowed to go green, and it is inert.
  b = awsBadge(ls({ configured: true, reason: "ok", instance: "portscale", region: "ap-south-1" }));
  assert(b.tone === "good", "aws: connected is green");
  assert(!b.actionable, "aws: connected does not open the credentials form");
  assert(b.title.includes("portscale") && b.title.includes("ap-south-1"), "aws: names instance and region");

  // Missing credentials: red, and clicking must lead to the form.
  b = awsBadge(ls({ reason: "No AWS credentials configured", needs_credentials: true }));
  assert(b.tone === "bad" && b.actionable, "aws: missing creds prompts");

  // The AccessDenied case this instance actually hits is still a credentials fix.
  b = awsBadge(ls({ reason: "AccessDeniedException", needs_credentials: true }));
  assert(b.tone === "bad" && b.actionable, "aws: denied role prompts");
  assert(b.title.includes("AccessDeniedException"), "aws: surfaces the real reason");

  // A dead backend is not a credentials problem -- never send the user to the form.
  b = awsBadge(ls({ reason: "API unreachable", needs_credentials: false }));
  assert(b.tone === "bad" && !b.actionable, "aws: unreachable API does not prompt for creds");

  console.log("checks ok");
};
run().catch((e) => {
  console.error(e.message);
  throw e;
});
