import Constants from "expo-constants";
import { atom, useSetAtom } from "jotai";
import { useEffect } from "react";
import { API_ORIGIN } from "./api";
import { parseRelease, type ReleaseInfo } from "./lib/release";

const extra = (Constants.expoConfig?.extra ?? {}) as { build?: unknown; commit?: unknown };
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
/** Build number baked in by app.config.ts; null for builds made outside a Git checkout. */
export const APP_BUILD: number | null = typeof extra.build === "number" && extra.build > 0 ? extra.build : null;
export const APP_COMMIT: string | null = typeof extra.commit === "string" && extra.commit ? extra.commit.slice(0, 7) : null;
/** The API redirects to the latest APK; the phone's browser downloads it and offers to install. */
export const APK_DOWNLOAD_URL = `${API_ORIGIN}/api/mobile/apk`;

export const latestReleaseAtom = atom<ReleaseInfo | null>(null);

export async function fetchRelease(signal?: AbortSignal): Promise<ReleaseInfo | null> {
  const response = await fetch(`${API_ORIGIN}/api/mobile/release`, { signal: signal ?? AbortSignal.timeout(10000) });
  return response.ok ? parseRelease(await response.json()) : null;
}
/** Refreshes the server's release while `active`; failures keep the previous answer. */
export function useReleaseCheck(active: boolean) {
  const setLatest = useSetAtom(latestReleaseAtom);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    fetchRelease(controller.signal).then(release => { if (release) setLatest(release); }, () => {});
    return () => controller.abort();
  }, [active, setLatest]);
}
