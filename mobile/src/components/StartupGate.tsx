import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import * as Updates from "expo-updates";
import { runStartupUpdate, type StartupPhase } from "../lib/startupUpdate";
import { storage } from "../platform/storage";
import { useTheme } from "../theme";

const attemptKey = "cubix.startup-update.attempt";
let phase: StartupPhase = "checking";
const listeners = new Set<(phase: StartupPhase) => void>();
let startup: Promise<"ready" | "reloading"> | undefined;
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

/** The app, timers and navigation only mount after the startup update completes. */
export function StartupGate({ children, fontsReady }: { children: ReactNode; fontsReady: boolean }) {
  const t = useTheme();
  const [currentPhase, setPhase] = useState(phase);
  const [ready, setReady] = useState(false);
  const { downloadProgress, isDownloading } = Updates.useUpdates();
  nativeDownloading = isDownloading;
  useEffect(() => {
    let active = true;
    listeners.add(setPhase);
    void start().then(result => { if (active && result === "ready") setReady(true); });
    return () => { active = false; listeners.delete(setPhase); };
  }, []);
  if (ready && fontsReady) return children;
  const percent = typeof downloadProgress === "number" ? ` ${Math.floor(Math.max(0, Math.min(1, downloadProgress)) * 100)} %` : "";
  const message = ready ? "Ouverture de Cubix…" : currentPhase === "restarting" ? "Ouverture de la nouvelle version…" : currentPhase === "downloading" || isDownloading ? `Téléchargement de la mise à jour…${percent}` : "Recherche de mises à jour…";
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>
    <Text style={{ color: t.text, fontSize: 32, fontWeight: "700" }}>Cubix</Text>
    <ActivityIndicator size="large" color={t.accent} />
    <Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={{ color: t.text2, textAlign: "center", fontSize: 14 }}>{message}</Text>
  </View>;
}
