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
    <div className="min-h-screen grid place-items-center p-4 animate-page-in">
      <Card className="w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 text-3xl font-display font-bold text-primary tracking-tight">PF</div>
          <h1 className="text-xl font-display font-semibold">Port Forward</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage iptables rules</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Username</label>
            <Input
              autoFocus
              placeholder="admin"
              value={username}
              onChange={(e: any) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Password</label>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
