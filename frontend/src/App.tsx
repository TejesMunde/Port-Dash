import { useState } from "react";
import { getToken } from "@/lib/api";
import { LoginScreen } from "@/components/LoginScreen";
import { Dashboard } from "@/components/Dashboard";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  return (
    <>
      {/* Served from this host (frontend/public/night-sky.mp4), not the origin mirror.
          muted + playsInline are what make autoplay legal in every browser.
          preload="metadata" + the backend's 206 support mean this streams in chunks
          as it plays rather than downloading all 38MB before the first frame. */}
      <video
        className="fixed inset-0 -z-20 h-full w-full object-cover"
        src="/night-sky.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      {/* Shadow Wash 50 — scrim for text sitting over the loop. Light enough that
          the night sky reads clearly, dark enough that white text stays legible. */}
      <div className="fixed inset-0 -z-10 bg-black/50" aria-hidden="true" />
      {authed ? (
        <Dashboard onLogout={() => setAuthed(false)} />
      ) : (
        <LoginScreen onSuccess={() => setAuthed(true)} />
      )}
    </>
  );
}
