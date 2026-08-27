import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api";

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(username, password);
      onSuccess();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 animate-page-in bg-background">
      <Card className="w-full max-w-sm p-8 bg-card/50 backdrop-blur-sm border-border/50">
        <div className="text-center mb-6">
          <div className="label-upper text-muted-foreground mb-3 tracking-widest">Desi Infrastructure</div>
          <h1 className="text-2xl font-semibold tracking-tight">देसी Datacenter Port Dash</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage iptables rules</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label-upper text-muted-foreground mb-1.5 block">Username</label>
            <Input
              autoFocus
              placeholder="admin"
              value={username}
              onChange={(e: any) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="label-upper text-muted-foreground mb-1.5 block">Password</label>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full mt-4">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}