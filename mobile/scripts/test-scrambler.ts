/** Exercise the exact embedded WebView bundle in Chromium, including its WASM searches. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Alg } from "../../node_modules/cubing/dist/lib/cubing/alg/index.js";
import { puzzles } from "../../node_modules/cubing/dist/lib/cubing/puzzles/index.js";
import { SCRAMBLER_HTML } from "../src/scrambler/scrambler-html";

const executable = process.env.CHROMIUM_PATH ?? Bun.which("chromium") ?? Bun.which("google-chrome") ?? Bun.which("brave");
if (!executable) throw new Error("Install Chromium or set CHROMIUM_PATH to run the embedded scrambler test.");
const profile = mkdtempSync(join(tmpdir(), "cubix-scrambler-"));
const requests = ["222", "333", "444", "555", "666", "777", "sq1", "pyram", "skewb", "minx", "clock"].map(event => ({ kind: "event", payload: { event } }))
  .concat(["EDGES", "CORNERS"].map(orbit => ({ kind: "orbit", payload: { orbit } })) as any);
const harness = `<script>
const requests=${JSON.stringify(requests)};
let index=0,started=0; const results=[];
const report=data=>fetch('/result',{method:'POST',body:JSON.stringify(data)});
function next(){if(index===requests.length){report({done:true,results});return;} started=performance.now();window.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({...requests[index],id:index+1})}));}
window.ReactNativeWebView={postMessage(raw){const r=JSON.parse(raw);if(r.ready){setTimeout(next,0);return;}results.push({...requests[index],...r,ms:Math.round(performance.now()-started)});index++;setTimeout(next,0);}};
window.addEventListener('error',e=>report({error:e.message}));
window.addEventListener('unhandledrejection',e=>report({error:String(e.reason)}));
</script>`;
let finish!: (rows: any[]) => void, fail!: (error: Error) => void;
const done = new Promise<any[]>((resolve, reject) => { finish = resolve; fail = reject; });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
  if (new URL(request.url).pathname === "/result") {
    const data = await request.json();
    if (data.error) fail(new Error(data.error));
    if (data.done) finish(data.results);
    return new Response("ok");
  }
  return new Response(SCRAMBLER_HTML.replace("<body>", `<body>${harness}`), { headers: { "Content-Type": "text/html" } });
} });
const child = spawn(executable, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", `--user-data-dir=${profile}`, `http://127.0.0.1:${server.port}`], { stdio: "ignore" });
child.on("error", fail);
const timeout = setTimeout(() => fail(new Error("Embedded scrambler test timed out (120s).")), 120000);
try {
  const rows = await done;
  if (rows.length !== requests.length) throw new Error("Missing scrambler results");
  const cube = await puzzles["3x3x3"].kpuzzle();
  for (const row of rows) {
    if (!row.value || row.error || row.ms >= 30000) throw new Error(JSON.stringify(row));
    new Alg(row.value); // Validate notation for every supported puzzle.
    if (row.kind === "orbit") {
      const pattern = cube.defaultPattern().applyAlg(row.value).patternData;
      const other = row.payload.orbit === "EDGES" ? "CORNERS" : "EDGES";
      if (JSON.stringify(pattern[other]) !== JSON.stringify(cube.defaultPattern().patternData[other]))
        throw new Error(`${row.payload.orbit} scramble changes ${other}`);
    }
    console.log(`PASS ${row.payload.event ?? row.payload.orbit}: ${row.ms} ms`);
  }
  const output = resolve(import.meta.dir, "../build/scrambler-validation.json");
  mkdirSync(resolve(import.meta.dir, "../build"), { recursive: true });
  await Bun.write(output, JSON.stringify(rows, null, 2));
  console.log(`Validated all ${rows.length} embedded generators. ${output}`);
} finally {
  clearTimeout(timeout); child.kill(); server.stop(true);
  await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", () => resolve()); });
  rmSync(profile, { recursive: true, force: true });
}
