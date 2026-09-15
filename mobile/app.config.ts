import { execFileSync } from "node:child_process";
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

/** Extends app.json with the build identity and the release signing plugin. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const build = buildNumber();
  return {
    ...config,
    name: config.name ?? "Cubix",
    slug: config.slug ?? "cubix",
    android: { ...config.android, versionCode: build || 1 },
    extra: { ...config.extra, build, commit: commitHash() },
    plugins: [...(config.plugins ?? []), "./plugins/withReleaseSigning"],
  };
};
