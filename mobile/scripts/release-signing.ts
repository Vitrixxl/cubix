/**
 * The production signing of the Android app. The release key lives outside the repository, in
 * ~/.config/cubix/keys/ (CUBIX_ANDROID_SIGNING_ENV names another env file): android-release.env exports
 * CUBIX_ANDROID_KEYSTORE, CUBIX_ANDROID_KEYSTORE_PASSWORD, CUBIX_ANDROID_KEY_ALIAS, CUBIX_ANDROID_KEY_PASSWORD and
 * CUBIX_ANDROID_LINEAGE. The first APKs were signed with React Native's public debug key; the lineage (apksigner
 * rotate, debug key -> release key) lets Android 9+ install the release-signed APK over them and keep their data.
 *
 *   bun scripts/release-signing.ts <apk>   fails unless the APK is signed with the release key
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const home = process.env.HOME ?? "";
export const SIGNING_ENV = process.env.CUBIX_ANDROID_SIGNING_ENV ?? `${home}/.config/cubix/keys/android-release.env`;
/** SHA-256 of the certificate of React Native's debug.keystore (CN=Android Debug), the same in every project. */
export const DEBUG_CERT_SHA256 = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c";
/**
 * Android 9 (API 28) is the first to read APK Signature Scheme v3: from it on, devices verify the release key and the
 * lineage. Android 7 and 8 (the app's minSdk is 24) only read the v2 block, which apksigner signs with the lineage's
 * oldest key, the debug one.
 */
const ROTATION_MIN_SDK = "28";

const fail = (message: string): never => { console.error(message); process.exit(1); };

/** The release key's variables, read from SIGNING_ENV; exits when the file or a file it names is missing. */
export function loadReleaseSigning(): Record<string, string> {
  if (!existsSync(SIGNING_ENV)) fail(`No release signing key: ${SIGNING_ENV} is missing (see mobile/README.md). A production APK is never signed with the debug key.`);
  const vars: Record<string, string> = {};
  for (const line of readFileSync(SIGNING_ENV, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?(\w+)=(.*)$/.exec(line);
    if (match) vars[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  for (const name of ["CUBIX_ANDROID_KEYSTORE", "CUBIX_ANDROID_KEYSTORE_PASSWORD", "CUBIX_ANDROID_KEY_ALIAS", "CUBIX_ANDROID_KEY_PASSWORD", "CUBIX_ANDROID_LINEAGE"]) {
    if (!vars[name]) fail(`${SIGNING_ENV} does not set ${name}.`);
  }
  for (const name of ["CUBIX_ANDROID_KEYSTORE", "CUBIX_ANDROID_LINEAGE"]) {
    if (!existsSync(vars[name])) fail(`${name} names ${vars[name]}, which does not exist.`);
  }
  return vars;
}

function toolEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const javaHome = process.env.JAVA_HOME ?? `${home}/.local/share/jdk`;
  return { ...process.env, ...extra, JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH}` };
}
/** apksigner of the newest Android build-tools. */
function apksigner(): string {
  const tools = resolve(process.env.ANDROID_HOME ?? `${home}/.local/share/android`, "build-tools");
  const versions = existsSync(tools) ? readdirSync(tools).filter(version => existsSync(resolve(tools, version, "apksigner"))) : [];
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) fail(`No apksigner under ${tools}: install the Android build-tools.`);
  return resolve(tools, versions.at(-1)!, "apksigner");
}
function run(command: string, args: string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) fail(`${command} ${args[0]} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

/** SHA-256 of the release certificate. */
export function releaseCertSha256(vars = loadReleaseSigning()): string {
  const keytool = spawnSync("keytool", ["-exportcert", "-keystore", vars.CUBIX_ANDROID_KEYSTORE, "-alias", vars.CUBIX_ANDROID_KEY_ALIAS, "-storepass:env", "CUBIX_ANDROID_KEYSTORE_PASSWORD"], { env: toolEnv(vars) });
  if (keytool.status !== 0) fail(`keytool could not read the release certificate: ${keytool.stderr}`);
  return createHash("sha256").update(keytool.stdout).digest("hex");
}

/**
 * Re-signs a Gradle release APK in place: v2 with the debug key (the lineage's oldest, for Android 7 and 8), v3 with
 * the release key and the lineage that vouches for it. The password reaches apksigner through the environment.
 */
export function signWithLineage(apk: string, debugKeystore: string, vars = loadReleaseSigning()) {
  if (!existsSync(debugKeystore)) fail(`No ${debugKeystore}: the lineage's old signer is React Native's debug key.`);
  const signed = `${apk}.signed`;
  run(apksigner(), [
    "sign", "--lineage", vars.CUBIX_ANDROID_LINEAGE, "--rotation-min-sdk-version", ROTATION_MIN_SDK,
    "--ks", debugKeystore, "--ks-pass", "pass:android", "--ks-key-alias", "androiddebugkey",
    "--next-signer", "--ks", vars.CUBIX_ANDROID_KEYSTORE, "--ks-pass", "env:CUBIX_ANDROID_KEYSTORE_PASSWORD",
    "--ks-key-alias", vars.CUBIX_ANDROID_KEY_ALIAS, "--key-pass", "env:CUBIX_ANDROID_KEY_PASSWORD",
    "--v4-signing-enabled", "false", "--out", signed, apk,
  ], toolEnv(vars));
  renameSync(signed, apk);
}

/**
 * Exits unless Android 9+ verifies the APK with the release key and a lineage from the debug key, which lets it update
 * the installs signed with the debug key. An APK signed with the debug key only is refused.
 */
export function assertReleaseSigned(apk: string, vars = loadReleaseSigning()) {
  const digests = (output: string, label: string) => [...output.matchAll(new RegExp(`^Signer #\\d+ ${label}certificate SHA-256 digest: ([0-9a-f]{64})$`, "gm"))].map(match => match[1]);
  const verified = run(apksigner(), ["verify", "-v", "--print-certs", apk], toolEnv());
  const signers = digests(verified, "");
  const release = releaseCertSha256(vars);
  if (!/^Verified using v3 scheme \(APK Signature Scheme v3\): true$/m.test(verified) || signers.join() !== release) {
    fail(`${apk} is not signed with the release key (signer ${signers.join(", ") || "none"}${signers.includes(DEBUG_CERT_SHA256) ? ": the public debug key" : ""}); refusing it.`);
  }
  const lineage = digests(run(apksigner(), ["lineage", "--in", apk, "--print-certs"], toolEnv()), "in lineage ");
  if (lineage.join() !== [DEBUG_CERT_SHA256, release].join()) fail(`${apk} lacks the debug -> release lineage (${lineage.join(" -> ") || "none"}): installed copies could not update to it.`);
  console.log(`${apk}: signed with the release key ${release.slice(0, 16)}…, lineage debug -> release.`);
}

if (import.meta.main) {
  const apk = process.argv[2] ?? fail("Usage: bun scripts/release-signing.ts <apk>");
  assertReleaseSigned(apk);
}
