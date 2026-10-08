/**
 * Runs the Linux Tauri build (desktop/tauri/package.ts) headless in its build container, under Xvfb, never on the
 * desktop. First against a probe page served here, standing for the web app: the bridge answers the web app's origin
 * (storage.json read, then set aside), and every way out of the window (the bridge's `open`, a link to a new window, a link)
 * reaches the system's browser, here a stub `xdg-open`, while the window stays on the app. Then against the web app
 * itself, CUBIX_WEB_ORIGIN or the Docker dev API: a screenshot, and a sign-in when CUBIX_CHECK_USER is set; and with no
 * server at all, the first launch's waiting page.
 *
 *   bun desktop/tauri/check.ts      screenshots in artifacts/tauri/check
 */
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { container } from "./package";

const root = resolve(import.meta.dir, "../..");
const out = join(root, "artifacts/tauri/check");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const OUT = "/src/artifacts/tauri/check";

/** Starts the app on `origin` with fresh data in the container, runs `steps` (shell, with $data), then stops it; its output
 * goes to `name`.log. */
const session = (name: string, origin: string, steps: string) =>
  container(`
mkdir -p /tmp/bin && printf '#!/bin/sh\\necho "$1" >> ${OUT}/opened.log\\n' > /tmp/bin/xdg-open && chmod +x /tmp/bin/xdg-open
export PATH=/tmp/bin:$PATH CUBIX_DESKTOP_DATA=$(mktemp -d) CUBIX_WEB_ORIGIN=${origin} NO_AT_BRIDGE=1
data=$CUBIX_DESKTOP_DATA; echo '{"preferences":{}}' > $data/storage.json
export data
dbus-run-session -- xvfb-run -a -s "-screen 0 1280x800x24" sh -ec '
  target/release/cubix > ${OUT}/${name}.log 2>&1 &
  ${steps.replaceAll("'", "'\\''")}
  kill $! || true'`, ["--network", "host", "-v", "/etc/passwd:/etc/passwd:ro", "-v", "/etc/group:/etc/group:ro"]);

// --- The bridge and the ways out, on a probe page. ---
const results: string[] = [];
const probe = `<!doctype html><title>Probe</title><a id="out" href="https://example.com/link">out</a>
<a href="https://example.com/window" target="_blank" style="position:fixed;inset:0" onclick="log('clicked')"></a><script>
const log = (m) => fetch("/result", { method: "POST", body: String(m) });
(async () => {
  const d = window.cubixDesktop;
  await log("bridge " + Object.keys(d ?? {}).join(","));
  await log("legacy " + (await d.legacyStorage()));
  await d.legacyImported();
  await d.open("https://example.com/open");
  await log("workers " + ("serviceWorker" in navigator) + " " + typeof SharedWorker + " " + !!navigator.locks);
  setTimeout(() => document.getElementById("out").click(), 500);
  setTimeout(() => log("still " + location.href), 2500);
})().catch((e) => log("error " + e));
</script>`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "POST") results.push(await request.text());
    return new Response(pathname === "/timer" ? probe : "", { headers: { "Content-Type": "text/html" } });
  },
});
// A new window needs a real click: the webview blocks those a script asks for.
await session("probe", server.url.origin, `sleep 10; xdotool mousemove --sync 640 400 click 1; sleep 5; import -window root ${OUT}/probe.png; ls -R $data > ${OUT}/data.txt`);
server.stop();
const opened = await Bun.file(join(out, "opened.log")).text().catch(() => "");
const data = await Bun.file(join(out, "data.txt")).text();
console.log({ results, opened, data });
const expect = (ok: boolean, what: string) => { if (!ok) { console.error(`FAILED: ${what}`); process.exitCode = 1; } };
expect(results.includes("bridge legacyStorage,legacyImported,open,onEvent"), "the page has the bridge");
expect(results.includes('legacy {"preferences":{}}\n'), "the bridge reads storage.json");
expect(data.includes("storage.imported.json") && !/^storage\.json$/m.test(data), "the bridge sets storage.json aside");
expect(data.includes("opened"), "the first opening is remembered");
for (const way of ["open", "window", "link"]) expect(opened.includes(`https://example.com/${way}`), `${way} opens in the browser`);
expect(results.some((r) => r.startsWith("still " + server.url.origin)), "the window stays on the app");

// --- A first launch without connection: the waiting page. ---
await session("offline", "http://127.0.0.1:9", `sleep 8; import -window root ${OUT}/offline.png`);

// --- The web app. ---
const origin = process.env.CUBIX_WEB_ORIGIN ?? (await fetch("http://127.0.0.1:47130/timer").then(() => "http://127.0.0.1:47130", () => "https://cubix.vitrixxl.fr"));
const user = process.env.CUBIX_CHECK_USER, password = process.env.CUBIX_CHECK_PASSWORD ?? "cubix-dev-password";
const window = "$(xdotool search --sync --name Qbix | head -1)";
await session("app", origin, `sleep 20; import -window root ${OUT}/app.png
  xprop -id ${window} WM_CLASS WM_NAME > ${OUT}/window.txt
  ${user ? `xdotool type --delay 40 '${user}'; xdotool key Tab; xdotool type --delay 40 '${password}'; xdotool key Return
  sleep 15; import -window root ${OUT}/signed-in.png` : ""}`);
console.log(await Bun.file(join(out, "window.txt")).text());
console.log(`Screenshots of ${origin} in ${out}`);
