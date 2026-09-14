/** Start the native release app in a visible local Android emulator, without Metro. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sdk = process.env.ANDROID_HOME ?? `${process.env.HOME}/.local/share/android`;
const jdk = process.env.JAVA_HOME ?? `${process.env.HOME}/.local/share/jdk`;
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
  PATH: `${jdk}/bin:${sdk}/platform-tools:${sdk}/emulator:${sdk}/cmdline-tools/latest/bin:${process.env.PATH}` };
const avd = "cubix";
let serial = "emulator-5554";
const apk = resolve(root, "build/cubix-release.apk");
const run = (cmd: string, args: string[], capture = false, input?: string) => {
  const result = spawnSync(cmd, args, { cwd: root, env, input, encoding: "utf8", stdio: capture || input !== undefined ? "pipe" : "inherit" });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  return result.stdout?.trim() ?? "";
};
const adb = (...args: string[]) => run("adb", ["-s", serial, ...args], true);
for (const path of [`${jdk}/bin/java`, `${sdk}/platform-tools/adb`, `${sdk}/emulator/emulator`])
  if (!existsSync(path)) throw new Error(`Missing tool: ${path}. See mobile/README.md (Android toolchain).`);
if (!existsSync(apk) || process.argv.includes("--build")) run("bun", ["scripts/build-apk.ts"]);
const devices = run("adb", ["devices"], true);
const occupied = [...devices.matchAll(/^(emulator-\d+)\s+(\w+)/gm)];
let running = false;
for (const [_, candidate, state] of occupied) {
  if (state !== "device") continue;
  const name = run("adb", ["-s", candidate, "emu", "avd", "name"], true).split("\n")[0];
  if (name === avd) { serial = candidate; running = true; break; }
}
if (!running) {
  let port = 5554;
  while (occupied.some(([, id]) => id === `emulator-${port}`)) port += 2;
  serial = `emulator-${port}`;
  if (!run("emulator", ["-list-avds"], true).split("\n").includes(avd))
    run("avdmanager", ["create", "avd", "-n", avd, "-k", "system-images;android-36;google_apis;x86_64", "-d", "pixel_7"], false, "no\n");
  mkdirSync(resolve(root, "build"), { recursive: true });
  const log = openSync(resolve(root, "build/emulator.log"), "a");
  const child = spawn("emulator", ["-avd", avd, "-port", serial.replace("emulator-", ""), "-no-audio", "-gpu", "swiftshader", ...(process.argv.includes("--headless") ? ["-no-window"] : [])], { env, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  console.log("Starting Android emulator…");
  let booted = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    await Bun.sleep(1000);
    const result = spawnSync("adb", ["-s", serial, "shell", "getprop", "sys.boot_completed"], { env, encoding: "utf8", timeout: 3000 });
    if (result.stdout?.trim() === "1") { booted = true; break; }
  }
  if (!booted) throw new Error("Emulator did not boot. See mobile/build/emulator.log.");
}
const installed = adb("install", "-r", apk);
if (!installed.includes("Success")) throw new Error(installed);
adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
const launched = adb("shell", "am", "start", "-W", "-n", "fr.vitrixxl.cubix/.MainActivity");
if (!launched.includes("Status: ok")) throw new Error(launched);
console.log("Cubix is running in the Android emulator. No development server is needed.");
