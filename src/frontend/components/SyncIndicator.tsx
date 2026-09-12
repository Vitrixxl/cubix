import { useEffect, useState, lazy, Suspense } from "react";
import { local } from "../api";
import type { SyncStatus } from "../local/client";
import { FloatingSheet } from "./FloatingSheet";
const AccountForm = lazy(() => import("../pages/AccountPage").then(m => ({ default: m.AccountForm })));

export function SyncIndicator() {
  const [status,setStatus] = useState(local.status);
  const [signIn,setSignIn] = useState(false);
  useEffect(() => {
    const update = (event: Event) => { const status = (event as CustomEvent<SyncStatus>).detail; setStatus(status); if (status.state === "synced" || status.state === "syncing") setSignIn(false); };
    window.addEventListener("cubix-sync-status",update);
    return () => window.removeEventListener("cubix-sync-status",update);
  },[]);
  if (status.state !== "error" && status.state !== "signin") return null;
  const label = status.state === "signin" ? "Sign in again" : "Couldn't save · Retry";
  return <>
    <button className="sync-indicator" data-timer-chrome title={label} onClick={() => status.state === "signin" ? setSignIn(true) : void local.retry()} aria-label={label}>
      <span aria-hidden="true">!</span>
      <span role="status">{label}</span>
    </button>
    <FloatingSheet open={signIn} title="Sign in" className="sync-signin-sheet" onClose={() => setSignIn(false)}><Suspense fallback={<p>Loading…</p>}><AccountForm initialMode="login" /></Suspense></FloatingSheet>
  </>;
}
