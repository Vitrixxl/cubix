export type StartupPhase = "checking" | "downloading" | "restarting";
export interface StartupUpdateClient {
  enabled: boolean;
  currentId: string | null;
  check: () => Promise<string | null>;
  download: () => Promise<string | null>;
  reload: () => Promise<void>;
  attempted: () => string | null;
  remember: (id: string) => void;
  clearAttempt: () => void;
  nativeDownloadActive?: () => boolean;
}
async function within<T>(work: Promise<T>, milliseconds: number, nativeDownload?: { active: () => boolean; maximum: number }): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let deadline = Date.now() + milliseconds;
  const maximum = Date.now() + (nativeDownload?.maximum ?? milliseconds);
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      const tick = () => {
        if (nativeDownload?.active()) deadline = Date.now() + milliseconds;
        const remaining = Math.min(deadline, maximum) - Date.now();
        if (remaining <= 0) reject(Error("Startup update timed out"));
        else timer = setTimeout(tick, nativeDownload ? Math.min(250, remaining) : remaining);
      };
      tick();
    })]);
  } finally { clearTimeout(timer!); }
}
/** Only called before the practice UI mounts. Timed-out SDK downloads may finish in
 * the cache, but their late result must never restart an active training session. */
export async function runStartupUpdate(client: StartupUpdateClient, phase: (phase: StartupPhase) => void, limits = { check: 5000, download: 180000 }): Promise<"ready" | "reloading"> {
  if (!client.enabled) return "ready";
  try {
    phase("checking");
    // Expo serializes explicit checks behind its native ON_LOAD download. Keep
    // the startup screen while it downloads, then allow a normal check timeout.
    const target = await within(client.check(), limits.check, client.nativeDownloadActive ? {
      active: client.nativeDownloadActive, maximum: limits.download + limits.check,
    } : undefined);
    if (!target || target === client.currentId || target === client.attempted()) return "ready";
    phase("downloading");
    const downloaded = await within(client.download(), limits.download);
    if (!downloaded || downloaded === client.currentId || downloaded === client.attempted()) return "ready";
    // Survives reload and native rollback: a broken release cannot cause a reload loop.
    client.remember(downloaded);
    phase("restarting");
    try { await client.reload(); }
    catch (error) { client.clearAttempt(); throw error; }
    return "reloading";
  } catch {
    return "ready"; // Offline or failed update: retain the working installed version.
  }
}
