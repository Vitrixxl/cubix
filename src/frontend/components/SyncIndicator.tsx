import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { local } from "../api";
import { useTimerChrome } from "../hooks/useTimerChrome";
import type { SyncStatus } from "../local/client";
import { FloatingSheet } from "./FloatingSheet";
import { AccountForm } from "../pages/AccountPage";

export function SyncIndicator() {
  const [status,setStatus] = useState(local.status);
  const [signIn,setSignIn] = useState(false);
  const chrome = useTimerChrome("down");
  useEffect(() => {
    const update = (event: Event) => { const status = (event as CustomEvent<SyncStatus>).detail; setStatus(status); if (status.state === "synced" || status.state === "syncing") setSignIn(false); };
    window.addEventListener("cubix-sync-status",update);
    return () => window.removeEventListener("cubix-sync-status",update);
  },[]);
  const label = {local:"Saved on this device",synced:"All changes synced",syncing:"Syncing…",offline:"Offline · saved on this device",signin:"Saved locally · sign in to sync",error:status.error ?? "Sync paused"}[status.state];
  return <>
    <motion.button {...chrome} className="sync-indicator" title={label} onClick={() => status.state === "signin" ? setSignIn(true) : void local.retry()} aria-label={label}>
      <span aria-hidden="true">{status.state === "synced" ? "✓" : status.state === "syncing" ? "↥" : "○"}</span>
      <span role="status">{label}{status.pending ? ` (${status.pending})` : ""}</span>
    </motion.button>
    <FloatingSheet open={signIn} title="Sign in to sync" className="sync-signin-sheet" onClose={() => setSignIn(false)}><AccountForm initialMode="login" /></FloatingSheet>
  </>;
}
