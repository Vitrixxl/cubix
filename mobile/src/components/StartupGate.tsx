import { useSetAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import * as Updates from "expo-updates";
import { runStartupUpdate, type StartupPhase } from "../lib/startupUpdate";
import { storage } from "../platform/storage";
import { fetchRelease } from "../release";
import { Launcher } from "./Launcher";
import { toastAtom } from "./Toast";

const attemptKey = "cubix.startup-update.attempt";
let phase: StartupPhase = "checking";
const listeners = new Set<(phase: StartupPhase) => void>();
let startup: Promise<"ready" | "reloading"> | undefined;
let connectivity: Promise<boolean> | undefined;
let nativeDownloading = false;
function start() {
  return startup ??= runStartupUpdate({
    enabled: Updates.isEnabled,
    currentId: Updates.updateId,
    check: async () => {
      const update = await Updates.checkForUpdateAsync();
      return update.isAvailable ? update.manifest.id : update.isRollBackToEmbedded && !Updates.isEmbeddedLaunch ? "embedded" : null;
    },
    download: async () => {
      const update = await Updates.fetchUpdateAsync();
      return update.isNew ? update.manifest.id : update.isRollBackToEmbedded && !Updates.isEmbeddedLaunch ? "embedded" : null;
    },
    reload: () => Updates.reloadAsync(),
    attempted: () => storage.getItem(attemptKey),
    remember: id => storage.setItem(attemptKey, id),
    clearAttempt: () => storage.removeItem(attemptKey),
    nativeDownloadActive: () => nativeDownloading,
  }, next => { phase = next; for (const listener of listeners) listener(next); });
}
/** Whether the server answers at all; a failed update check alone cannot tell "no network" from "no update". */
function online() {
  return connectivity ??= fetchRelease(AbortSignal.timeout(6000)).then(() => true, () => false);
}

export const OFFLINE_TOAST = {
  title: "Mode hors ligne",
  description: "Impossible de joindre le serveur. Tes temps restent enregistrés sur cet appareil et se synchroniseront au retour de la connexion.",
  duration: 8000,
};

/**
 * The app, timers and navigation only mount after the startup update completes. The launcher screen
 * covers them until its cube stands, so a fast start never flashes; a slow one replays the cube.
 */
export function StartupGate({ children, fontsReady }: { children: ReactNode; fontsReady: boolean }) {
  const [currentPhase, setPhase] = useState(phase);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(false);
  const setToast = useSetAtom(toastAtom);
  const { downloadProgress, isDownloading } = Updates.useUpdates();
  nativeDownloading = isDownloading;
  useEffect(() => {
    let active = true;
    listeners.add(setPhase);
    void start().then(result => { if (active && result === "ready") setReady(true); });
    void online().then(value => { if (active) setConnected(value); });
    return () => { active = false; listeners.delete(setPhase); };
  }, []);
  const loaded = ready && fontsReady && connected !== null;
  const percent = typeof downloadProgress === "number" ? Math.floor(Math.max(0, Math.min(1, downloadProgress)) * 100) : undefined;
  const downloading = currentPhase === "downloading" || isDownloading;
  const message = loaded ? (connected ? "Ouverture de Cubix…" : "Hors ligne. Ouverture de Cubix…")
    : currentPhase === "restarting" ? "Ouverture de la nouvelle version…"
    : downloading ? `Téléchargement de la mise à jour…${percent === undefined ? "" : ` ${percent} %`}`
    : "Recherche de mises à jour…";
  return <>
    {loaded && children}
    {!hidden && <Launcher message={message} progress={downloading && !loaded ? percent : undefined} finish={loaded} onHidden={() => {
      setHidden(true);
      if (connected === false) setToast(OFFLINE_TOAST);
    }} />}
  </>;
}
