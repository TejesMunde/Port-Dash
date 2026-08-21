// Runnable checks for the hand-rolled Dialog and the TCP+UDP rule creation.
// Run: npx esbuild src/checks.tsx --bundle --platform=node --alias:@=./src --outfile=checks.cjs && node checks.cjs
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogTrigger, DialogContent } from "./components/ui/dialog";
import { createForProtocols } from "./components/Dashboard";
import type { Rule, RuleInput } from "./lib/api";

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

  console.log("checks ok");
};
run().catch((e) => {
  console.error(e.message);
  throw e;
});
