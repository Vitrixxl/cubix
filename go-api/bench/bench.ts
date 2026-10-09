/** Micro benchmark of the Rust and Go APIs, each in its own container: memory (RSS read from the host's /proc)
 * idle, after password hashing, under HTTP load and with open live sockets; throughput and latency per route.
 *   docker build -f go-api/Dockerfile -t cubix-go-api . && docker build -f go-api/bench/Dockerfile.rust -t cubix-rust-api .
 *   bun go-api/bench/bench.ts            BENCH_SECONDS, BENCH_CONCURRENCY, BENCH_USERS, BENCH_SOCKETS override the load */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const seconds = Number(process.env.BENCH_SECONDS ?? 8);
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 64);
const users = Number(process.env.BENCH_USERS ?? 16);
const sockets = Number(process.env.BENCH_SOCKETS ?? 2000);
const targets = [
  { name: "rust", image: "cubix-rust-api", port: 47201, env: [] as string[] },
  { name: "go", image: "cubix-go-api", port: 47202, env: [] as string[] },
  // The runtime tuned like the Rust server: four threads, and a soft memory limit that makes the GC return memory.
  { name: "go tuned", image: "cubix-go-api", port: 47203, env: ["GOMAXPROCS=4", "GOMEMLIMIT=48MiB"] },
];

const sh = (...cmd: string[]) => {
  const r = Bun.spawnSync(cmd);
  if (r.exitCode) throw Error(`${cmd.join(" ")}: ${r.stderr}`);
  return r.stdout.toString().trim();
};
// Live sockets are limited to 120 a minute per IP: each socket comes from its own address, forwarded by the bridge.
const gateway = sh("docker", "network", "inspect", "bridge", "-f", "{{(index .IPAM.Config 0).Gateway}}");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const mib = (kb: number) => Math.round(kb / 102.4) / 10;
function memory(pid: string) {
  const status = readFileSync(`/proc/${pid}/status`, "utf8");
  const kb = (key: string) => Number(status.match(new RegExp(`${key}:\\s+(\\d+)`))![1]);
  return { rss: mib(kb("VmRSS")), peak: mib(kb("VmHWM")), threads: kb("Threads") };
}

async function load(origin: string, label: string, request: (i: number) => [string, RequestInit?]) {
  const latencies: number[] = [];
  let errors = 0, i = 0;
  const end = performance.now() + seconds * 1000;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (performance.now() < end) {
      const [path, init] = request(i++);
      const start = performance.now();
      try {
        const response = await fetch(origin + path, init);
        await response.arrayBuffer();
        if (!response.ok) errors++;
      } catch { errors++; }
      latencies.push(performance.now() - start);
    }
  }));
  latencies.sort((a, b) => a - b);
  const q = (p: number) => Math.round(latencies[Math.floor(latencies.length * p)]! * 100) / 100;
  return { label, rps: Math.round(latencies.length / seconds), p50: q(0.5), p99: q(0.99), errors };
}

async function run(target: (typeof targets)[number]) {
  const name = `cubix-bench-${target.name.replace(" ", "-")}`;
  Bun.spawnSync(["docker", "rm", "-f", name]);
  sh("docker", "run", "-d", "--name", name, "--ulimit", "nofile=262144:262144" /* as compose.yaml */, "-p", `127.0.0.1:${target.port}:3000`, "-e", "CUBIX_RATE_LIMIT=1000000000", "-e", `CUBIX_TRUSTED_PROXIES=${gateway}`, ...target.env.flatMap(e => ["-e", e]),
    "--tmpfs", "/var/lib/cubix:uid=1000,gid=1000", target.image);
  const origin = `http://127.0.0.1:${target.port}`;
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(origin + "/api/health")).ok) break; } catch {}
      if (i > 200) throw Error(`${target.name} did not start: ${sh("docker", "logs", name)}`);
      await sleep(50);
    }
    const pid = sh("docker", "inspect", "-f", "{{.State.Pid}}", name);
    await sleep(2000);
    const result: Record<string, unknown> = { image: mib(Number(sh("docker", "image", "inspect", "-f", "{{.Size}}", target.image)) / 1024), idle: memory(pid) };

    // Argon2id (64 MiB per hash), at most four at a time on the server.
    const tokens: string[] = [];
    const started = performance.now();
    for (let i = 0; i < users; i += 4) {
      tokens.push(...await Promise.all(Array.from({ length: Math.min(4, users - i) }, async (_, j) => {
        const response = await fetch(origin + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: `bench_${i + j}`, password: "bench-password-1234" }) });
        if (!response.ok) throw Error(`register: ${response.status} ${await response.text()}`);
        return (await response.json() as { token: string }).token;
      })));
    }
    result.register = { ms: Math.round(performance.now() - started), ...memory(pid) };

    const auth = (i: number) => ({ authorization: `Bearer ${tokens[i % tokens.length]}`, "content-type": "application/json" });
    const routes = [
      await load(origin, "GET /api/health", () => ["/api/health"]),
      await load(origin, "POST /api/solves", i => ["/api/solves", { method: "POST", headers: auth(i), body: JSON.stringify({ timeMs: 9000 + i % 5000, scramble: "R U R' U'" }) }]),
      await load(origin, "GET /api/solves", i => ["/api/solves?limit=50", { headers: auth(i) }]),
      await load(origin, "GET /api/stats", i => ["/api/stats", { headers: auth(i) }]),
      await load(origin, "GET /api/cases", () => ["/api/cases"]),
    ];
    result.routes = routes;
    result.afterLoad = memory(pid);

    const open: WebSocket[] = [];
    const ready = (await Promise.all(Array.from({ length: sockets }, (_, i) => new Promise<boolean>(resolve => {
      const socket = new WebSocket(origin.replace("http", "ws") + "/api/live",
        { headers: { "x-forwarded-for": `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` } } as any);
      open.push(socket);
      const timer = setTimeout(() => resolve(false), 10000);
      const done = (ok: boolean) => { clearTimeout(timer); resolve(ok); };
      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token: tokens[i % tokens.length] }));
      socket.onmessage = event => JSON.parse(String(event.data)).type === "ready" && done(true);
      socket.onerror = socket.onclose = () => done(false);
    })))).filter(Boolean).length;
    await sleep(1000);
    result.sockets = { count: sockets, ready, ...memory(pid) };
    for (const socket of open) socket.close();
    await sleep(3000);
    result.final = memory(pid);
    return result;
  } finally {
    Bun.spawnSync(["docker", "rm", "-f", name]);
  }
}

const results: Record<string, any> = {};
for (const target of targets) {
  console.error(`benchmarking ${target.name}…`);
  results[target.name] = await run(target);
}
const row = (label: string, pick: (r: any) => unknown) => `| ${label} | ${targets.map(t => pick(results[t.name])).join(" | ")} |`;
const lines = [
  `Micro benchmark, ${new Date().toISOString().slice(0, 10)}: ${seconds} s per route, ${concurrency} concurrent requests, ${users} accounts, ${sockets} live sockets.`,
  "", `| | ${targets.map(t => t.name).join(" | ")} |`, `|---|${targets.map(() => "---").join("|")}|`,
  row("Image (MiB)", r => r.image),
  row("RSS idle (MiB)", r => r.idle.rss),
  row(`RSS after ${users} sign-ups (MiB)`, r => r.register.rss),
  row("Peak RSS during sign-ups (MiB)", r => r.register.peak),
  row(`${users} sign-ups (ms)`, r => r.register.ms),
  row("RSS after HTTP load (MiB)", r => r.afterLoad.rss),
  row(`RSS with ${sockets} sockets (MiB)`, r => `${r.sockets.rss} (${r.sockets.ready} ready)`),
  row("Peak RSS overall (MiB)", r => r.final.peak),
  row("RSS at the end (MiB)", r => r.final.rss),
  row("Threads under sockets", r => r.sockets.threads),
  ...results.rust.routes.map((route: any, i: number) => row(`${route.label} req/s · p50/p99 ms · errors`,
    r => `${r.routes[i].rps} · ${r.routes[i].p50}/${r.routes[i].p99} · ${r.routes[i].errors}`)),
];
console.log(lines.join("\n"));
writeFileSync(join(import.meta.dir, "results.md"), lines.join("\n") + "\n");
writeFileSync(join(import.meta.dir, "results.json"), JSON.stringify(results, null, 2));
