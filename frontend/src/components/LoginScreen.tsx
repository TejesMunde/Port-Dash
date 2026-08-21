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
    // Transparent so the background loop carries through behind the sign-in card.
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="display text-[44px] text-white tracking-[0.1px]">Port Forward</h1>
          <p className="text-[18px] text-white/60 mt-3">Sign in to manage iptables rules</p>
        </div>
        <Card className="p-8 rounded-4xl shadow-ps-4">
          <form onSubmit={submit} className="space-y-5">
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
            {err && <p className="text-[14px] text-destructive">{err}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
