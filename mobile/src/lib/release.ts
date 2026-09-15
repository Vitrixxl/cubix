/** Pure release comparison shared by the application and its tests (no native imports). */
export interface ReleaseInfo { version: string; build: number | null; commit: string | null; apk: string }

/** Accepts the `GET /api/mobile/release` payload; malformed answers are ignored. */
export function parseRelease(value: unknown): ReleaseInfo | null {
  if (!value || typeof value !== "object") return null;
  const { version, build, commit, apk } = value as Record<string, unknown>;
  if (typeof version !== "string" || typeof apk !== "string") return null;
  return {
    version, apk,
    build: typeof build === "number" && Number.isInteger(build) && build > 0 ? build : null,
    commit: typeof commit === "string" && commit ? commit : null,
  };
}
/** Only a known installed build can be outdated; development builds never prompt. */
export function updateAvailable(installed: number | null, latest: ReleaseInfo | null): boolean {
  return installed !== null && latest !== null && latest.build !== null && latest.build > installed;
}
