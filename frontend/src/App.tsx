import { useState } from "react";
import { getToken } from "@/lib/api";
import { LoginScreen } from "@/components/LoginScreen";
import { Dashboard } from "@/components/Dashboard";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  return (
    <>
      {/* Served from this host (frontend/public/night-sky.mp4), not the origin mirror.
          muted + playsInline are what make autoplay legal in every browser. */}
      <video
        className="fixed inset-0 -z-20 h-full w-full object-cover"
        src="/night-sky.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      {/* Shadow Wash 80 — the system's scrim for text sitting over photography. */}
      <div className="fixed inset-0 -z-10 bg-black/80" aria-hidden="true" />
      {authed ? (
        <Dashboard onLogout={() => setAuthed(false)} />
      ) : (
        <LoginScreen onSuccess={() => setAuthed(true)} />
      )}
    </>
  );
}
