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
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-sm p-5">
        <div className="text-center mb-4">
          <div className="mx-auto mb-2 text-2xl font-bold text-foreground">PF</div>
          <h1 className="text-lg font-semibold">Port Forward</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sign in to manage iptables rules</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input
            autoFocus
            placeholder="Username"
            value={username}
            onChange={(e: any) => setUsername(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e: any) => setPassword(e.target.value)}
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in\u2026" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
