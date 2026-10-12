import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
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
 * `CUBIX_UPDATES=off` builds an APK that never looks for over-the-air updates: a test build pointed at a local API
 * (EXPO_PUBLIC_API_ORIGIN) keeps the JavaScript it was built with.
 */
const UPDATES_ENABLED = process.env.CUBIX_UPDATES !== "off";

/**
 * Files that shape the native Android build. When none of them changes, a new commit only
 * changes JavaScript and assets, which expo-updates delivers over the air without a new APK.
 */
export const NATIVE_INPUTS = [
  "app.json", "app.config.ts", "plugins/withReleaseSigning.js", "plugins/withHighRefreshRate.js", "bun.lock",
  "assets/icon.png", "assets/splash-icon.png", "assets/android-icon-foreground.png", "certs/certificate.pem",
  ...fontFiles(),
];
/** The font files expo-font links natively (app.json): its plain fonts, then each Android family's weights. */
function fontFiles(): string[] {
  type FontPlugin = { fonts?: string[]; android?: { fonts?: { fontDefinitions?: { path: string }[] }[] } };
  const { expo } = JSON.parse(readFileSync(resolve(__dirname, "app.json"), "utf8")) as { expo: { plugins?: unknown[] } };
  const plugin = expo.plugins?.find((entry): entry is [string, FontPlugin] => Array.isArray(entry) && entry[0] === "expo-font");
  const options = plugin?.[1] ?? {};
  return [...options.fonts ?? [], ...(options.android?.fonts ?? []).flatMap(family => (family.fontDefinitions ?? []).map(font => font.path))]
    .map(path => posix.normalize(path));
}
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

/** Extends app.json with the build identity, the update channel, the release signing and the refresh rate plugins. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const build = buildNumber();
  // Production speaks https only; a test build pointed at a local http API (EXPO_PUBLIC_API_ORIGIN) needs cleartext.
  const plugins = (config.plugins ?? []).map(plugin => Array.isArray(plugin) && plugin[0] === "expo-build-properties" && API_ORIGIN.startsWith("http:")
    ? [plugin[0], { ...plugin[1], android: { ...plugin[1].android, usesCleartextTraffic: true } }] as [string, unknown]
    : plugin);
  return {
    ...config,
    name: config.name ?? "Cubix",
    slug: config.slug ?? "cubix",
    runtimeVersion: runtimeVersion(),
    updates: {
      ...config.updates,
      url: `${API_ORIGIN}/api/mobile/updates/manifest`,
      enabled: UPDATES_ENABLED,
      // Launch the cached bundle at once and fetch a newer one in the background for the next start.
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      // Only manifests signed with the key kept off the server are run (scripts/export-update.ts signs them).
      codeSigningCertificate: "./certs/certificate.pem",
      codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" },
    },
    android: { ...config.android, versionCode: build || 1 },
    extra: { ...config.extra, build, commit: commitHash() },
    // The web build lives under a path of the site (desktop/web.ts exports it to dist/web/phone).
    ...process.env.CUBIX_WEB_BASE ? { experiments: { ...config.experiments, baseUrl: process.env.CUBIX_WEB_BASE } } : {},
    plugins: [...plugins, "./plugins/withReleaseSigning", "./plugins/withHighRefreshRate"],
  };
};
