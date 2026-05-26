import { useState } from "react";
import { getToken } from "@/lib/api";
import { LoginScreen } from "@/components/LoginScreen";
import { Dashboard } from "@/components/Dashboard";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  return authed ? (
    <Dashboard onLogout={() => setAuthed(false)} />
  ) : (
    <LoginScreen onSuccess={() => setAuthed(true)} />
  );
}
