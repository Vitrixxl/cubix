import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { openDb } from "./sqlite";
import { spawn, fork, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { cpus, totalmem } from "node:os";
const ROOT = process.cwd();
const backend = "rust";
const OUT =
  process.env.CUBIX_STRESS_OUT ??
  join(ROOT, "artifacts", `stress-${backend}-${Date.now()}`);
const port = process.env.CUBIX_STRESS_PORT ?? "5199";
let URL = `http://127.0.0.1:${port}`;
const ports = (process.env.CUBIX_STRESS_PORTS ?? port).split(",");
const workerCount = Number(process.env.CUBIX_STRESS_WORKERS ?? 4);
const phaseSeconds = Number(process.env.CUBIX_STRESS_SECONDS ?? 25);
const connectBatch = Number(process.env.CUBIX_STRESS_CONNECT_BATCH ?? 100);
const requestTimeout = Number(process.env.CUBIX_STRESS_TIMEOUT_MS ?? 10000);
const maxRssMB = Number(process.env.CUBIX_STRESS_MAX_RSS_MB ?? 2000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type User = {
  id: string;
  username: string;
  token: string;
  peer: string;
  sessionId: number;
};
const quantile = (values: number[], q: number) =>
  values.length
    ? values[Math.min(values.length - 1, Math.floor(values.length * q))]
    : 0;

async function worker() {
  let users: User[] = [],
    sockets: WebSocket[] = [],
    opened = 0,
    wsClosed = 0,
    pongs = 0,
    changes = 0;
  const lastMessage = new Map<string, number>();
  let heartbeats: ReturnType<typeof setInterval>;
  process.on("message", async (message: any) => {
    try {
      if (message.type === "init") {
        users = message.users;
        URL = message.origin;
        heartbeats = setInterval(() => {
          for (const socket of sockets)
            if (socket.readyState === WebSocket.OPEN)
              socket.send('{"type":"ping"}');
        }, 15000);
        process.send!({ id: message.id, ok: true });
      } else if (message.type === "connect") {
        const attempts = users.slice(opened, message.count);
        opened = message.count;
        let failed = 0;
        for (let start = 0; start < attempts.length; start += connectBatch) {
          await Promise.all(
            attempts.slice(start, start + connectBatch).map(
              (user) =>
                new Promise<void>((resolve) => {
                  const socket = new WebSocket(
                    URL.replace("http:", "ws:") + "/api/social/live",
                  );
                  let done = false,
                    ready = false;
                  const finish = (ok: boolean) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timeout);
                    if (!ok) {
                      failed++;
                      socket.close();
                    }
                    resolve();
                  };
                  const timeout = setTimeout(() => finish(false), 8000);
                  socket.addEventListener("open", () =>
                    socket.send(
                      JSON.stringify({ type: "auth", token: user.token }),
                    ),
                  );
                  socket.addEventListener("message", (event) => {
                    const data = JSON.parse(String(event.data));
                    if (data.type === "ready") {
                      ready = true;
                      sockets.push(socket);
                      finish(true);
                    } else if (data.type === "pong") pongs++;
                    else if (data.type === "changed") changes++;
                  });
                  socket.addEventListener("error", () => finish(false));
                  socket.addEventListener("close", () => {
                    if (ready) wsClosed++;
                    finish(false);
                  });
                }),
            ),
          );
        }
        process.send!({
          id: message.id,
          connected: sockets.filter((s) => s.readyState === WebSocket.OPEN)
            .length,
          failed,
          wsClosed,
        });
      } else if (message.type === "run") {
        const begin = performance.now(),
          deadline = begin + message.seconds * 1000;
        const latencies: number[] = [],
          statuses: Record<string, number> = {},
          routes: Record<
            string,
            { count: number; errors: number; latencies: number[] }
          > = {};
        let cursor = 0,
          bytes = 0,
          maxActive = 0,
          active = 0;
        const errors: Record<string, number> = {};
        const activeUsers = new Set<string>();
        const oldPongs = pongs,
          oldChanges = changes,
          oldClosed = wsClosed;
        const lag: number[] = [];
        let lastTick = performance.now();
        const lagTimer = setInterval(() => {
          const now = performance.now();
          lag.push(Math.max(0, now - lastTick - 100));
          lastTick = now;
        }, 100);
        async function send() {
          while (performance.now() < deadline) {
            const seq = cursor++,
              user = users[seq % message.users],
              kind = (seq + Math.floor(seq / message.users)) % 20;
            activeUsers.add(user.id);
            let method = "GET",
              path: string,
              body: any;
            if (kind < 4) path = "/solves?mode=training&limit=50";
            else if (kind < 7) path = "/stats";
            else if (kind < 10) path = "/users/" + user.username;
            else if (kind < 13) {
              path = "/solves";
              method = "POST";
              body = {
                sessionId: user.sessionId,
                caseId: "F2L 7",
                timeMs: 12000 + (seq % 8000),
                scramble: "R U R' U'",
              };
            } else if (kind < 15) path = "/social/friends";
            else if (kind < 17) path = "/social/messages/" + user.peer;
            else if (
              kind === 17 &&
              Date.now() - (lastMessage.get(user.id) ?? 0) >= 1100
            ) {
              path = "/social/messages/" + user.peer;
              method = "POST";
              body = {
                text: "Isolated load test",
                clientId: crypto.randomUUID(),
              };
              lastMessage.set(user.id, Date.now());
            } else if (kind === 18) path = "/users?q=stress_";
            else path = "/auth/me";
            const label =
              method +
              " " +
              path
                .replace(/\/users\/stress_\d+/, "/users/:username")
                .replace(/\/social\/messages\/[^?]+/, "/social/messages/:peer");
            const bucket = (routes[label] ??= {
              count: 0,
              errors: 0,
              latencies: [],
            });
            const started = performance.now();
            active++;
            maxActive = Math.max(maxActive, active);
            let status = "transport";
            try {
              const response = await fetch(URL + "/api" + path, {
                method,
                headers: {
                  Authorization: "Bearer " + user.token,
                  "Content-Type": "application/json",
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(requestTimeout),
              });
              status = String(response.status);
              bytes += (await response.arrayBuffer()).byteLength;
              if (!response.ok) bucket.errors++;
            } catch (error) {
              bucket.errors++;
              const key = (error as Error).name;
              errors[key] = (errors[key] ?? 0) + 1;
            }
            active--;
            const elapsed = performance.now() - started;
            latencies.push(elapsed);
            bucket.count++;
            bucket.latencies.push(elapsed);
            statuses[status] = (statuses[status] ?? 0) + 1;
          }
        }
        await Promise.all(Array.from({ length: message.concurrency }, send));
        clearInterval(lagTimer);
        process.send!({
          id: message.id,
          elapsed: (performance.now() - begin) / 1000,
          latencies,
          statuses,
          routes,
          bytes,
          maxActive,
          activeUsers: activeUsers.size,
          pongs: pongs - oldPongs,
          changes: changes - oldChanges,
          wsClosed: wsClosed - oldClosed,
          connected: sockets.filter((s) => s.readyState === WebSocket.OPEN)
            .length,
          errors,
          generatorRssMB: process.memoryUsage().rss / 1e6,
          generatorLagP99: quantile(
            lag.sort((a, b) => a - b),
            0.99,
          ),
        });
      } else if (message.type === "close") {
        clearInterval(heartbeats);
        for (const socket of sockets) socket.close();
        sockets = [];
        process.send!({ id: message.id, ok: true });
      }
    } catch (error) {
      process.send!({ id: message.id, error: String(error) });
    }
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const listenPort of ports) {
    await new Promise<void>((resolve, reject) => {
      const reservation = createServer();
      reservation.once('error', reject);
      reservation.listen(Number(listenPort), '127.0.0.1', () => reservation.close(error => error ? reject(error) : resolve()));
    });
  }
  const dbPath = join(OUT, "load.db");
  if (existsSync(dbPath)) throw Error("A test database already exists; use a fresh output directory.");
  const store = openDb(dbPath),
    db = store.db;
  const userCount = Number(process.env.CUBIX_STRESS_USERS ?? 4500),
    initialSolves = Number(process.env.CUBIX_STRESS_SOLVES ?? 50),
    users: User[] = [];
  // Public load-test password fixture; not a real account credential.
  const hash = '$argon2id$v=19$m=65536,t=2,p=1$/MjNkmyvEIeADX6MuRGafQnkEAzdsUAoenVSvo4UjhI$xzZpF5oW12JlLeNbq1aTLGi8GR4IpIFGTWsMTd6ArZ8';
  const insertUser = db.query(
    "INSERT INTO users(id,username,password_hash) VALUES(?,?,?)",
  );
  const insertToken = db.query(
    "INSERT INTO auth_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)",
  );
  const insertSession = db.query(
    'INSERT INTO sessions(id,mode,case_ids,user_id) VALUES(?,\'training\',\'["F2L 7","F2L 8","PLL T"]\',?)',
  );
  const insertSolve = db.query(
    "INSERT INTO solves(session_id,case_id,time_ms,scramble,user_id) VALUES(?,?,?,?,?)",
  );
  const insertFriend = db.query(
    "INSERT INTO friendships(user_a,user_b,requested_by,status) VALUES(?,?,?,'accepted')",
  );
  console.log(
    "Seeding",
    userCount,
    "registered users and",
    userCount * initialSolves,
    "solves in isolated SQLite",
  );
  const seedStart = Date.now();
  db.transaction(() => {
    for (let i = 0; i < userCount; i++) {
      const id = crypto.randomUUID(),
        username = "stress_" + String(i).padStart(5, "0"),
        token = randomBytes(32).toString("hex");
      insertUser.run(id, username, hash);
      insertToken.run(
        createHash("sha256").update(token).digest("hex"),
        id,
        Date.now() + 86400000,
      );
      insertSession.run(i + 1, id);
      for (let n = 0; n < initialSolves; n++)
        insertSolve.run(
          i + 1,
          ["F2L 7", "F2L 8", "PLL T"][n % 3],
          8000 + n * 137,
          "R U R' U'",
          id,
        );
      users.push({ id, username, token, peer: "", sessionId: i + 1 });
    }
    for (let i = 0; i < userCount; i += 2) {
      users[i].peer = users[i + 1].id;
      users[i + 1].peer = users[i].id;
      const [a, b] = [users[i].id, users[i + 1].id].sort();
      insertFriend.run(a, b, a);
    }
  })();
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  console.log(
    "Seed ready in",
    ((Date.now() - seedStart) / 1000).toFixed(1),
    "s; database",
    (statSync(dbPath).size / 1e6).toFixed(1),
    "MB",
  );
  const log = openSync(join(OUT, "server.log"), "w");
  const server = spawn(join(ROOT, "rust-api/target/release/cubix-api"), [], {
    cwd: ROOT, env: { ...process.env, PORT:port, CUBIX_HOST:"127.0.0.1", CUBIX_EXTRA_PORTS:ports.slice(1).join(","), CUBIX_DB:dbPath },
    stdio:["ignore",log,log],
  });
  closeSync(log);
  if (!server.pid) throw Error('Rust server did not start');
  const workers: any[] = [],
    pending = new Map<number, (value: any) => void>();
  let seq = 0,
    stage = "startup";
  const samples: any[] = [];
  let previousCpu: number | undefined,
    previousTime = Date.now();
  function sample() {
    try {
      const status = readFileSync(`/proc/${server.pid}/status`, "utf8");
      const stat = readFileSync(`/proc/${server.pid}/stat`, "utf8")
        .split(") ")[1]
        .split(" ");
      const cpu = Number(stat[11]) + Number(stat[12]);
      const now = Date.now();
      const rssKB = Number(status.match(/VmRSS:\s+(\d+)/)?.[1] ?? 0);
      const row = {
        time: new Date(now).toISOString(),
        stage,
        openFds: readdirSync(`/proc/${server.pid}/fd`).length,
        rssMB: (rssKB * 1024) / 1e6,
        peakMB: (Number(status.match(/VmHWM:\s+(\d+)/)?.[1] ?? 0) * 1024) / 1e6,
        cpuPercent:
          previousCpu === undefined
            ? 0
            : ((cpu - previousCpu) * 1000) / (now - previousTime),
        swapMB:
          (Number(status.match(/VmSwap:\s+(\d+)/)?.[1] ?? 0) * 1024) / 1e6,
      };
      samples.push(row);
      previousCpu = cpu;
      previousTime = now;
      if (row.rssMB > maxRssMB)
        throw Error(`Server exceeded ${maxRssMB}MB safety ceiling`);
    } catch (error) {
      if (String(error).includes("safety")) {
        console.error(String(error));
        server.kill();
      }
    }
  }
  const monitor = setInterval(sample, 500);
  const timer = Date.now();
  async function ask(worker: any, message: any) {
    const id = ++seq;
    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          pending.delete(id);
          reject(Error("Worker timeout"));
        },
        Math.max(75000, (phaseSeconds + 60) * 1000),
      );
      pending.set(id, (result) => {
        clearTimeout(timeout);
        result.error ? reject(Error(result.error)) : resolve(result);
      });
      worker.send({ ...message, id });
    });
  }
  const results: any[] = [];
  const stages: number[][] = process.env.CUBIX_STRESS_STAGES
    ? JSON.parse(process.env.CUBIX_STRESS_STAGES)
    : [
        [50, 50],
        [100, 100],
        [250, 250],
        [500, 500],
        [1000, 1000],
        [2000, 1000],
        [3000, 750],
        [3500, 400],
        [3800, 160],
        [4000, 64],
        [4250, 64],
      ];
  try {
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(URL + "/api/auth/me");
        if (r.status === 401) break;
      } catch {}
      await sleep(100);
      if (i === 49) throw Error("Server unavailable");
    }
    console.log(
      "Production",
      backend,
      "server PID",
      server.pid,
      "; independent client workers; FD limit recorded from /proc",
    );
    for (let i = 0; i < workerCount; i++) {
      const w = fork(import.meta.filename, ["--worker"], {
        cwd:ROOT, execArgv:process.execArgv, stdio:["ignore","inherit","inherit","ipc"], serialization:"advanced",
      });
      w.on('message', (message: any) => { pending.get(message.id)?.(message); pending.delete(message.id); });
      workers.push(w);
      await ask(w, {
        type: "init",
        origin: `http://127.0.0.1:${ports[i % ports.length]}`,
        users: users.filter((_, j) => j % workerCount === i),
      });
    }
    stage = "baseline";
    await sleep(3000);
    sample();
    const baseline = samples.at(-1);
    console.log("Baseline RSS MB:", baseline.rssMB.toFixed(1));
    for (const [connections, concurrency] of stages) {
      stage = `connect-${connections}`;
      if (connections >= 3000 && !process.env.CUBIX_STRESS_STAGES)
        await sleep(12000);
      const connected = await Promise.all(
        workers.map((w, i) =>
          ask(w, {
            type: "connect",
            count:
              Math.floor(connections / workerCount) +
              (i < connections % workerCount ? 1 : 0),
          }),
        ),
      );
      const ready = connected.reduce((s, r) => s + r.connected, 0),
        failed = connected.reduce((s, r) => s + r.failed, 0);
      console.log(
        "Connections:",
        connections,
        "target,",
        ready,
        "authenticated,",
        failed,
        "failed",
      );
      if (ready < connections * 0.97) {
        results.push({
          users: connections,
          connected: ready,
          connectionFailures: failed,
          limit: true,
        });
        console.log("Connection ceiling reached; stopping ramp.");
        break;
      }
      stage = `load-${connections}`;
      const sampleStart = samples.length;
      const begin = performance.now();
      const chunks = await Promise.all(
        workers.map((w, i) =>
          ask(w, {
            type: "run",
            seconds: phaseSeconds,
            users:
              Math.floor(connections / workerCount) +
              (i < connections % workerCount ? 1 : 0),
            concurrency:
              Math.floor(concurrency / workerCount) +
              (i < concurrency % workerCount ? 1 : 0),
          }),
        ),
      );
      const elapsed = (performance.now() - begin) / 1000,
        latencies = chunks.flatMap((c) => c.latencies).sort((a, b) => a - b),
        statuses: any = {},
        routes: any = {};
      for (const chunk of chunks) {
        for (const [key, n] of Object.entries(chunk.statuses))
          statuses[key] = (statuses[key] ?? 0) + Number(n);
        for (const [key, r] of Object.entries(chunk.routes) as any) {
          const b = (routes[key] ??= { count: 0, errors: 0, latencies: [] });
          b.count += r.count;
          b.errors += r.errors;
          b.latencies.push(...r.latencies);
        }
      }
      for (const r of Object.values(routes) as any) {
        r.latencies.sort((a: number, b: number) => a - b);
        r.p95 = quantile(r.latencies, 0.95);
        delete r.latencies;
      }
      const windowSamples = samples.slice(sampleStart),
        failedRequests = Object.entries(statuses).reduce(
          (n, [s, c]) => n + (s === "200" || s === "201" ? 0 : Number(c)),
          0,
        );
      const result = {
        activeUsers: chunks.reduce((n, c) => n + c.activeUsers, 0),
        transportErrors: chunks.map((c) => c.errors),
        users: connections,
        connected: ready,
        connectionFailures: failed,
        concurrency,
        elapsed,
        requests: latencies.length,
        rps: latencies.length / elapsed,
        failedRequests,
        errorPercent: (failedRequests / latencies.length) * 100,
        p50: quantile(latencies, 0.5),
        p95: quantile(latencies, 0.95),
        p99: quantile(latencies, 0.99),
        maxLatency: latencies.at(-1),
        rssPeakMB: Math.max(...windowSamples.map((s) => s.rssMB)),
        rssEndMB: windowSamples.at(-1)?.rssMB,
        fdPeak: Math.max(...windowSamples.map((s) => s.openFds)),
        cpuMean:
          windowSamples.reduce((n, s) => n + s.cpuPercent, 0) /
          windowSamples.length,
        cpuPeak: Math.max(...windowSamples.map((s) => s.cpuPercent)),
        statuses,
        routes,
        wsClosed: chunks.reduce((n, c) => n + c.wsClosed, 0),
        notifications: chunks.reduce((n, c) => n + c.changes, 0),
        pongs: chunks.reduce((n, c) => n + c.pongs, 0),
        generatorRssMB: chunks.reduce((n, c) => n + c.generatorRssMB, 0),
        generatorLagP99: Math.max(...chunks.map((c) => c.generatorLagP99)),
        responseMB: chunks.reduce((n, c) => n + c.bytes, 0) / 1e6,
      };
      results.push(result);
      writeFileSync(
        join(OUT, "results.json"),
        JSON.stringify({ baseline, results, samples }, null, 2),
      );
      console.log(
        "RESULT",
        JSON.stringify({ ...result, routes: undefined, statuses: undefined }),
      );
      if (
        result.wsClosed > connections * 0.1 ||
        (result.errorPercent > 20 &&
          process.env.CUBIX_STRESS_CONTINUE_ON_HTTP_ERRORS !== "1")
      ) {
        console.log("Unstable stage; stopping ramp.");
        break;
      }
    }
    stage = "disconnect";
    await Promise.all(workers.map((w) => ask(w, { type: "close" })));
    stage = "cooldown";
    await sleep(30000);
    sample();
    const finalDb = openDb(dbPath);
    const counts = finalDb.db
      .query(
        "SELECT (SELECT COUNT(*) FROM solves) AS solves, (SELECT COUNT(*) FROM chat_messages) AS messages",
      )
      .get();
    finalDb.db.close();
    const report = {
      timestamp: new Date().toISOString(),
      backend,
      runtime: spawnSync(join(ROOT,"rust-api/target/release/cubix-api"),["--version"],{encoding:"utf8"}).stdout.trim()+" (release)",
      generatorRuntime: process.version,
      host: {
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
        memoryGiB: totalmem()/1024**3,
        fdHardLimit: Number(
          readFileSync(`/proc/${server.pid}/limits`, "utf8").match(
            /Max open files\s+\d+\s+(\d+)/,
          )?.[1] ?? 0,
        ),
      },
      setup: {
        registeredUsers: userCount,
        initialSolves: userCount * initialSolves,
        workerProcesses: workerCount,
        production: true,
        passwordVerificationIncluded: false,
        phaseSeconds,
        ports,
        requestTimeout,
        maxRssMB,
      },
      baseline,
      results,
      cooldown: samples.at(-1),
      totalElapsedSeconds: (Date.now() - timer) / 1000,
      counts,
      samples,
    };
    writeFileSync(join(OUT, "results.json"), JSON.stringify(report, null, 2));
    writeFileSync(
      join(OUT, "memory.csv"),
      "timestamp,stage,rss_mb,cpu_percent,swap_mb,open_fds\n" +
        samples
          .map(
            (s) =>
              `${s.time},${s.stage},${s.rssMB},${s.cpuPercent},${s.swapMB},${s.openFds}`,
          )
          .join("\n"),
    );
    console.log(
      "COMPLETE",
      JSON.stringify({
        cooldown: report.cooldown,
        counts,
        seconds: report.totalElapsedSeconds,
        output: OUT,
      }),
    );
  } finally {
    clearInterval(monitor);
    for (const w of workers) w.kill();
    server.kill();
    writeFileSync(join(OUT, "memory-partial.json"), JSON.stringify(samples));
  }
}
if (process.argv.includes("--worker")) await worker();
else await main();
