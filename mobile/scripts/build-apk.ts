/**
 * Build an installable Android APK: regenerate the generated sources, sync the native
 * project, then run Gradle. `bun scripts/build-apk.ts --debug` builds a debug APK that
 * loads the JavaScript bundle from a running `expo start` server.
 */
import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dir, "..");
const debug = process.argv.includes("--debug");
const arm64 = process.argv.includes("--arm64");
const outputArgument = process.argv.find(argument => argument.startsWith("--output="))?.slice("--output=".length);
const home = process.env.HOME ?? "";
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: debug ? "development" : "production",
  JAVA_HOME: process.env.JAVA_HOME ?? `${home}/.local/share/jdk`,
  ANDROID_HOME: process.env.ANDROID_HOME ?? `${home}/.local/share/android`,
};
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
env.PATH = `${env.JAVA_HOME}/bin:${env.ANDROID_HOME}/platform-tools:${env.PATH}`;

// Multiple terminals may request a build. Only one may regenerate/compile Android at a time.
mkdirSync(resolve(root, ".expo"), { recursive: true });
const lockPath = resolve(root, ".expo/android-build.lock");
let announcedWait = false;
for (;;) {
  try {
    const descriptor = openSync(lockPath, "wx");
    writeFileSync(descriptor, String(process.pid)); closeSync(descriptor);
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const owner = Number(readFileSync(lockPath, "utf8"));
      if (owner > 0) process.kill(owner, 0);
      else if (Date.now() - statSync(lockPath).mtimeMs > 5000) { unlinkSync(lockPath); continue; }
    } catch (error) {
      if (["ESRCH", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        try { unlinkSync(lockPath); } catch { /* Already released. */ }
        continue;
      }
      throw error;
    }
    if (!announcedWait) { console.log("Another Android build is running; waiting for it to finish…"); announcedWait = true; }
    await Bun.sleep(1000);
  }
}
process.on("exit", () => {
  try { if (readFileSync(lockPath, "utf8") === String(process.pid)) unlinkSync(lockPath); } catch { /* Best effort. */ }
});

const run = (command: string, args: string[], cwd = root) => {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run("bun", ["scripts/build-scrambler.ts"]);
run("bun", ["scripts/build-cases.ts"]);
// Expo regenerates Android from configuration; avoid discarding Gradle's native build cache
// when only JavaScript has changed. App config, dependencies and assets invalidate this stamp.
const fingerprint = createHash("sha256");
for (const path of ["app.json", "bun.lock", "assets/icon.png", "assets/splash-icon.png", "assets/android-icon-foreground.png", "assets/fonts/cubing-icons.ttf"])
  fingerprint.update(readFileSync(resolve(root, path)));
const hash = fingerprint.digest("hex"), stamp = resolve(root, ".expo/android-prebuild.sha256");
if (process.argv.includes("--prebuild") || !existsSync(resolve(root, "android/gradlew")) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== hash) {
  run("bunx", ["expo", "prebuild", "--platform", "android", "--no-install"]);
  mkdirSync(resolve(root, ".expo"), { recursive: true });
  writeFileSync(stamp, hash);
}
// Gradle's default JS inputs exclude the shared sources outside mobile/ and public env values.
// Always refresh the release bundle, while retaining the expensive native compilation cache.
const tasks = debug ? ["assembleDebug"] : [":app:createBundleReleaseJsAndAssets", "--rerun", "assembleRelease"];
run("./gradlew", [...tasks, ...(arm64 ? ["-PreactNativeArchitectures=arm64-v8a"] : []), "--no-daemon", "--console=plain", "--max-workers=4"], resolve(root, "android"));
const apk = resolve(root, `android/app/build/outputs/apk/${debug ? "debug/app-debug.apk" : "release/app-release.apk"}`);
mkdirSync(resolve(root, "build"), { recursive: true });
const out = resolve(root, outputArgument ?? `build/cubix-${debug ? "debug" : "release"}${arm64 ? "-arm64" : ""}.apk`);
copyFileSync(apk, `${out}.tmp`);
renameSync(`${out}.tmp`, out);
console.log(`APK: ${out}`);
