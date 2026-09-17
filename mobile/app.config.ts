import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

function git(...args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
/**
 * Build number of the current commit: its committer time in minutes since the Unix epoch.
 * It grows with every commit on main, fits Android's versionCode and works in shallow clones.
 * The Dockerfile derives the server's number the same way so the API can announce updates.
 */
export function buildNumber(): number {
  const override = Number(process.env.CUBIX_BUILD_NUMBER);
  if (Number.isInteger(override) && override > 0) return override;
  return Math.floor(Number(git("log", "-1", "--format=%ct")) / 60) || 0;
}
export function commitHash(): string {
  return process.env.CUBIX_COMMIT || git("rev-parse", "HEAD");
}
/** Production API by default; the same variable points development builds at a local server. */
export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");

/**
 * Files that shape the native Android build. When none of them changes, a new commit only
 * changes JavaScript and assets, which expo-updates delivers over the air without a new APK.
 */
export const NATIVE_INPUTS = [
  "app.json", "app.config.ts", "plugins/withReleaseSigning.js", "bun.lock",
  "assets/icon.png", "assets/splash-icon.png", "assets/android-icon-foreground.png", "assets/fonts/cubing-icons.ttf",
];
/**
 * expo-updates runtime version: a hash of the native inputs. An update is only offered to
 * APKs built with the same runtime version, so a JavaScript bundle never meets native code
 * it was not compiled against. Dependency bumps change bun.lock and therefore force an APK.
 */
export function runtimeVersion(): string {
  const hash = createHash("sha256");
  for (const path of NATIVE_INPUTS) hash.update(readFileSync(resolve(__dirname, path)));
  return hash.digest("hex").slice(0, 16);
}

/** Extends app.json with the build identity, the update channel and the release signing plugin. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const build = buildNumber();
  return {
    ...config,
    name: config.name ?? "Cubix",
    slug: config.slug ?? "cubix",
    runtimeVersion: runtimeVersion(),
    updates: {
      ...config.updates,
      url: `${API_ORIGIN}/api/mobile/updates/manifest`,
      enabled: true,
      // Launch the cached bundle at once and fetch a newer one in the background for the next start.
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    android: { ...config.android, versionCode: build || 1 },
    extra: { ...config.extra, build, commit: commitHash() },
    plugins: [...(config.plugins ?? []), "./plugins/withReleaseSigning"],
  };
};
