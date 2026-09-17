/** Pure release comparison shared by the application and its tests (no native imports). */
export interface ReleaseInfo {
  version: string;
  /** Build the server runs, or null outside Docker. */
  build: number | null;
  commit: string | null;
  /** Path of the APK download on the API. */
  apk: string;
  /** Build of the APK the server stores, or null until one was uploaded. */
  apkBuild: number | null;
  apkCommit: string | null;
  /** expo-updates runtime version of the stored APK; older uploads have none. */
  apkRuntimeVersion: string | null;
}

const positive = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
const text = (value: unknown): string | null => typeof value === "string" && value ? value : null;

/** Accepts the `GET /api/mobile/release` payload; malformed answers are ignored. */
export function parseRelease(value: unknown): ReleaseInfo | null {
  if (!value || typeof value !== "object") return null;
  const { version, build, commit, apk, apkBuild, apkCommit, apkRuntimeVersion } = value as Record<string, unknown>;
  if (typeof version !== "string" || typeof apk !== "string") return null;
  return { version, apk, build: positive(build), commit: text(commit), apkBuild: positive(apkBuild), apkCommit: text(apkCommit), apkRuntimeVersion: text(apkRuntimeVersion) };
}
/**
 * Whether the phone should download a new APK. Only a known installed build can be outdated,
 * and only towards an APK the server actually stores. When that APK shares the installed
 * runtime version, its JavaScript reaches the phone over the air instead, so no download is offered.
 */
export function updateAvailable(installed: number | null, latest: ReleaseInfo | null, runtime: string | null = null): boolean {
  if (installed === null || latest === null || latest.apkBuild === null || latest.apkBuild <= installed) return false;
  return runtime === null || latest.apkRuntimeVersion === null || latest.apkRuntimeVersion !== runtime;
}
