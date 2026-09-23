import { expect, test, afterEach } from "bun:test";
import { Database } from "../scripts/sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CASES } from "./backend";
import { createRustApi } from "./backend";

const rustTest = test;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cubix-rust-parity-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "test.db");
}
function client(app: ReturnType<typeof createRustApi>) {
  return async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) => {
    const response = await app.handle(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: response.status, body: (await response.json()) as any };
  };
}
rustTest("Rust exposes the complete catalogue and verified training histories", async () => {
  const call = client(createRustApi(fixture()));
  expect((await call("/cases")).body).toEqual(CASES);
  const member = (await call("/auth/register", "POST", {username:"records",password:"a-long-test-password"})).body;
  const session = (await call("/sessions", "POST", {mode:"training",caseIds:[CASES[0].id]},member.token)).body;
  for(const [index,timeMs] of [1000,2000,3000,4000,5000].entries())
    await call("/solves","POST",{sessionId:session.id,caseId:CASES[0].id,timeMs,penalty:index===4?"dnf":"none"},member.token);
  const history=(await call(`/cases/${encodeURIComponent(CASES[0].id)}/stats`,"GET",undefined,member.token)).body;
  expect(history.summary).toMatchObject({count:5,best:1000,worst:4000,mean:2500,ao5:3000,last:null});
  expect(history.history).toHaveLength(5);
  expect(history.history[4].time).toBeNull();
  expect((await call("/auth/login","POST",{username:"records",password:"a-long-test-password"})).status).toBe(200);
});

rustTest(
  "Rust itself migrates pre-account SQLite and retires legacy profile fields without losing history",
  async () => {
    const path = fixture();
    const db = new Database(path);
    cleanups.unshift(() => db.close());
    db.exec(`CREATE TABLE sessions(id INTEGER PRIMARY KEY,mode TEXT,case_ids TEXT,created_at TEXT);
    CREATE TABLE solves(id INTEGER PRIMARY KEY,session_id INTEGER,case_id TEXT,time_ms INTEGER,penalty TEXT,scramble TEXT,created_at TEXT);
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,bio TEXT NOT NULL DEFAULT '',password_hash TEXT,created_at TEXT,is_private INTEGER DEFAULT 1,display_name TEXT DEFAULT '');
    INSERT INTO sessions VALUES(1,'playground','[]','2026-01-01');
    INSERT INTO solves VALUES(1,1,NULL,9000,'none',NULL,'2026-01-01');`);
    const call = client(createRustApi(path));
    expect(
      db
        .query<{ name: string }, []>("PRAGMA table_info(users)")
        .all()
        .map((c) => c.name),
    ).not.toContain("is_private");
    expect(
      db
        .query<{ name: string }, []>("PRAGMA table_info(users)")
        .all()
        .map((c) => c.name),
    ).not.toContain("display_name");
    expect(
      db.query<any, []>("SELECT * FROM solves WHERE id=1").get(),
    ).toMatchObject({ time_ms: 9000, user_id: null, puzzle_id: "333", cube_size: 3, solve_mode: "standard", scramble_type: "normal" });
    const guest = (await call("/auth/guest", "POST")).body;
    expect((await call("/solves", "GET", undefined, guest.token)).body).toEqual(
      [],
    );
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  },
);

rustTest(
  "concurrent Rust registrations cannot upgrade the same guest twice",
  async () => {
    const call = client(createRustApi(fixture()));
    const guest = (await call("/auth/guest", "POST")).body;
    const attempts = await Promise.all(
      ["first_member", "second_member"].map((username) =>
        call(
          "/auth/register",
          "POST",
          { username, password: "concurrent-password" },
          guest.token,
        ),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await call("/auth/me", "GET", undefined, guest.token)).status).toBe(
      401,
    );
    const winner = attempts.find((r) => r.status === 200)!.body;
    expect(winner.user.id).toBe(guest.user.id);
    expect(
      (await call("/auth/me", "GET", undefined, winner.token)).body.id,
    ).toBe(guest.user.id);
  },
);


rustTest("practice migration preserves existing cube histories and remains safe on restart", async () => {
  const path = fixture(), db = new Database(path); cleanups.unshift(() => db.close());
  db.exec(`CREATE TABLE sessions(id INTEGER PRIMARY KEY,mode TEXT,case_ids TEXT,created_at TEXT,cube_size INTEGER NOT NULL DEFAULT 3);
    CREATE TABLE solves(id INTEGER PRIMARY KEY,session_id INTEGER,case_id TEXT,time_ms INTEGER,penalty TEXT,scramble TEXT,created_at TEXT,cube_size INTEGER NOT NULL DEFAULT 3);
    INSERT INTO sessions VALUES(1,'training','["7x7 PLL Aa"]','2026-01-01',7),(2,'playground','[]','2026-01-02',4);
    INSERT INTO solves VALUES(1,1,'7x7 PLL Aa',9000,'+2','R U','2026-01-01',7),(2,2,NULL,42000,'none','Rw U','2026-01-02',4);`);
  const server = createRustApi(path);
  const before = db.query("SELECT id,session_id,case_id,time_ms,penalty,scramble,created_at,puzzle_id,cube_size,solve_mode,scramble_type FROM solves ORDER BY id").all();
  expect(before).toMatchObject([
    {id:1,puzzle_id:"777",cube_size:7,solve_mode:"standard",scramble_type:"case",time_ms:9000,penalty:"+2",scramble:"R U"},
    {id:2,puzzle_id:"444",cube_size:4,solve_mode:"standard",scramble_type:"normal",time_ms:42000},
  ]);
  expect(db.query("SELECT puzzle_id,solve_mode,scramble_type FROM sessions ORDER BY id").all()).toEqual([
    {puzzle_id:"777",solve_mode:"standard",scramble_type:"case"},
    {puzzle_id:"444",solve_mode:"standard",scramble_type:"normal"},
  ]);
  server.server.stop();
  const call = client(createRustApi(path));
  expect(db.query("SELECT id,session_id,case_id,time_ms,penalty,scramble,created_at,puzzle_id,cube_size,solve_mode,scramble_type FROM solves ORDER BY id").all()).toEqual(before);
  const auth = (await call("/auth/register","POST",{username:"migration_labels",password:"a-long-test-password"})).body;
  const niche = await call("/solves","POST",{puzzle:"sq1",solveMode:"blindfolded",timeMs:5000},auth.token);
  expect(niche.status).toBe(200);
  expect(niche.body).toMatchObject({puzzle_id:"sq1",cube_size:null,solve_mode:"blindfolded",scramble_type:"normal"});
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

rustTest("learning marks are validated, upserted per account and journaled for sync", async () => {
  const path = fixture();
  const app = createRustApi(path);
  cleanups.push(() => app.server.stop());
  const call = client(app);
  const alice = (await call("/auth/register", "POST", { username: "learn_alice", password: "a-long-test-password" })).body;
  const bob = (await call("/auth/register", "POST", { username: "learn_bob", password: "a-long-test-password" })).body;
  expect((await call("/learned", "GET", undefined, alice.token)).body).toEqual([]);
  expect((await call("/learned", "PUT", { caseId: "PLL Aa", learned: true }, alice.token)).status).toBe(200);
  expect((await call("/learned", "PUT", { caseId: "PLL Aa", learned: true }, alice.token)).body.learned).toBe(1);
  expect((await call("/learned", "PUT", { caseId: "2x2 PBL Adjacent / adjacent", learned: true }, alice.token)).status).toBe(200);
  expect((await call("/learned", "PUT", { caseId: "PLL Zz", learned: true }, alice.token)).status).toBe(400);
  expect((await call("/learned", "PUT", { caseId: "PLL Aa", learned: "yes" }, alice.token)).status).toBe(422);
  expect((await call("/learned", "PUT", { caseId: "PLL Aa", learned: true })).status).toBe(401);
  expect((await call("/learned", "GET", undefined, alice.token)).body).toEqual(["2x2 PBL Adjacent / adjacent", "PLL Aa"]);
  expect((await call("/learned", "GET", undefined, bob.token)).body).toEqual([]);
  expect((await call("/learned", "PUT", { caseId: "PLL Aa", learned: false }, alice.token)).body.learned).toBe(0);
  expect((await call("/learned", "GET", undefined, alice.token)).body).toEqual(["2x2 PBL Adjacent / adjacent"]);
  const pulled = (await call("/sync?after=0", "GET", undefined, alice.token)).body;
  expect(pulled.changes.map((c: any) => [c.kind, c.value.case_id, c.value.learned])).toEqual([["learned_cases", "2x2 PBL Adjacent / adjacent", 1], ["learned_cases", "PLL Aa", 0]]);
  const op = { id: crypto.randomUUID(), method: "PUT", path: "learned", body: { caseId: "OLL 1", learned: true } };
  const pushed = (await call("/sync", "POST", { operations: [op] }, alice.token)).body;
  expect(pushed.results[0].value.case_id).toBe("OLL 1");
  expect((await call("/sync", "POST", { operations: [op] }, alice.token)).body).toEqual(pushed);
  expect((await call("/sync", "POST", { operations: [{ ...op, id: crypto.randomUUID(), method: "POST" }] }, alice.token)).status).toBe(422);
  const db = new Database(path); cleanups.unshift(() => db.close());
  expect(db.query<{ n: number }, []>("SELECT count(*) n FROM learned_cases").get()?.n).toBe(3);
});

rustTest("Rust announces its build, stores the uploaded APK and serves it back", async () => {
  const app = createRustApi(fixture(), { CUBIX_BUILD_NUMBER: "29800000", CUBIX_COMMIT: "0123456789abcdef" });
  const call = client(app);
  const origin = `http://127.0.0.1:${app.server.port}`;
  expect((await call("/mobile/release")).body).toEqual({
    version: "0.1.0", build: 29800000, commit: "0123456789abcdef", apk: "/api/mobile/apk",
    apkBuild: null, apkCommit: null, apkRuntimeVersion: null, apkSha256: null, apkSize: null, apkUploadedAt: null, updates: {},
  });
  expect((await fetch(`${origin}/api/mobile/apk`)).status).toBe(404);
  // A fake ZIP with the APK magic: the server checks the container, not the Android signature.
  const apk = new Uint8Array(2048); apk.set([0x50, 0x4b, 0x03, 0x04]);
  const put = (headers: Record<string, string>, body: Uint8Array<ArrayBuffer> = apk) => fetch(`${origin}/api/mobile/apk`, { method: "PUT", headers, body: new Blob([body]) });
  const stamped = { "X-Cubix-Build": "29800000", "X-Cubix-Commit": "0123456789abcdef", "X-Cubix-Runtime": "rt-abc123" };
  expect((await put(stamped)).status).toBe(401);
  expect((await put({ ...stamped, Authorization: "Bearer wrong-password-here" })).status).toBe(401);
  const auth = { ...stamped, Authorization: "Bearer synthetic-admin-test-password" };
  expect((await put({ ...auth, "X-Cubix-Build": "0" })).status).toBe(422);
  expect((await put(auth, new TextEncoder().encode("not an apk".repeat(200)))).status).toBe(422);
  const stored = await put(auth);
  expect(stored.status).toBe(200);
  expect(await stored.json()).toMatchObject({ apkBuild: 29800000, apkCommit: "0123456789abcdef", apkRuntimeVersion: "rt-abc123", apkSize: 2048 });
  const download = await fetch(`${origin}/api/mobile/apk`);
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toBe("application/vnd.android.package-archive");
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(apk);
  expect((await call("/mobile/release")).body).toMatchObject({ apkBuild: 29800000, apkSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  // A server started outside Docker or CI has no build number; the application then never prompts.
  const bare = client(createRustApi(fixture(), { CUBIX_BUILD_NUMBER: "", CUBIX_COMMIT: "" }));
  expect((await bare("/mobile/release")).body).toMatchObject({ build: null, commit: null });
});

rustTest("Rust publishes over-the-air updates following the expo-updates protocol", async () => {
  const app = createRustApi(fixture(), { CUBIX_BUILD_NUMBER: "29800000", CUBIX_COMMIT: "0123456789abcdef" });
  const call = client(app);
  const origin = `http://127.0.0.1:${app.server.port}`;
  const auth = { Authorization: "Bearer synthetic-admin-test-password" };
  const sha = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  const bundle = new TextEncoder().encode("console.log('cubix')"), font = new Uint8Array([0, 1, 0, 0, 7, 7]);
  const [bundleHash, fontHash] = [await sha(bundle), await sha(font)];
  const manifestRequest = (runtime: string) => fetch(`${origin}/api/mobile/updates/manifest`, { headers: { "expo-protocol-version": "1", "expo-platform": "android", "expo-runtime-version": runtime } });
  // Nothing published yet: an empty 204 tells expo-updates there is nothing newer.
  const empty = await manifestRequest("rt-1");
  expect([empty.status, empty.headers.get("expo-protocol-version")]).toEqual([204, "1"]);
  const putAsset = (hash: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = auth) => fetch(`${origin}/api/mobile/updates/assets/${hash}`, { method: "PUT", headers, body: new Blob([body]) });
  expect((await putAsset(bundleHash, bundle, {})).status).toBe(401);
  expect((await putAsset(bundleHash, font)).status).toBe(422);
  expect((await putAsset(bundleHash, bundle)).status).toBe(200);
  const publish = (body: unknown) => fetch(`${origin}/api/mobile/updates`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const update = {
    runtimeVersion: "rt-1", build: 29800000, commit: "0123456789abcdef",
    launchAsset: { hash: bundleHash, key: "bundle", contentType: "application/javascript", fileExtension: ".hbc" },
    assets: [{ hash: fontHash, key: "da7645c389387fd772478c57e440d2cb", contentType: "font/ttf", fileExtension: ".ttf" }],
    expoClient: { name: "Cubix", version: "0.1.0", extra: { build: 29800000, commit: "0123456789abcdef" } },
  };
  // The font was never uploaded: the manifest must not point at a missing file.
  expect((await publish(update)).status).toBe(422);
  expect((await putAsset(fontHash, font)).status).toBe(200);
  expect((await publish({ ...update, runtimeVersion: "../etc" })).status).toBe(422);
  const published = await publish(update);
  expect(published.status).toBe(200);
  expect((await published.json()).updates).toEqual({ "rt-1": { id: expect.stringMatching(/^[0-9a-f-]{36}$/), build: 29800000, commit: "0123456789abcdef", createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) } });
  const answer = await manifestRequest("rt-1");
  expect([answer.status, answer.headers.get("expo-protocol-version"), answer.headers.get("expo-sfv-version")]).toEqual([200, "1", "0"]);
  const manifest = await answer.json();
  const base64url = (hex: string) => Buffer.from(hex, "hex").toString("base64url");
  expect(manifest).toMatchObject({
    runtimeVersion: "rt-1",
    launchAsset: { hash: base64url(bundleHash), key: "bundle", contentType: "application/javascript", fileExtension: ".hbc", url: `${origin}/api/mobile/updates/assets/${bundleHash}` },
    assets: [{ hash: base64url(fontHash), key: "da7645c389387fd772478c57e440d2cb", contentType: "font/ttf", fileExtension: ".ttf", url: `${origin}/api/mobile/updates/assets/${fontHash}` }],
    extra: { expoClient: { name: "Cubix", extra: { build: 29800000 } } },
  });
  // Republishing the same commit keeps the update id, so phones do not fetch it twice.
  expect((await publish(update)).status).toBe(200);
  expect((await (await manifestRequest("rt-1")).json()).id).toBe(manifest.id);
  expect((await manifestRequest("rt-2")).status).toBe(204);
  const download = await fetch(manifest.launchAsset.url);
  expect(download.status).toBe(200);
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(bundle);
  expect((await fetch(`${origin}/api/mobile/updates/assets/${"0".repeat(64)}`)).status).toBe(404);
  expect((await call("/mobile/release")).body.updates["rt-1"]).toMatchObject({ commit: "0123456789abcdef" });
});

rustTest("Normal migration merges both histories and receipts, fixes defaults and tolerates old-client retries", async () => {
  const path = fixture(), db = new Database(path); cleanups.unshift(() => db.close());
  const app = createRustApi(path), call = client(app);
  const auth = (await call("/auth/register","POST",{username:"normal_migration",password:"a-long-test-password"})).body;
  const operations = ["competition","random-moves"].map((scrambleType,index) => ({
    id:`normal-session-${index}`,method:"POST",path:"sessions",createdAt:`2026-01-0${index+1}T00:00:00.000Z`,
    body:{mode:"playground",puzzle:"333",solveMode:"standard",scrambleType},
  }));
  const response = await call("/sync","POST",{operations},auth.token);
  expect(response.status).toBe(200);
  const sessions = response.body.results.map((r:any)=>r.value);
  for (const [index,timeMs] of [10000,20000,30000,40000,50000].entries()) {
    expect((await call("/solves","POST",{sessionId:sessions[index % 2].id,timeMs,penalty:index === 0 ? "+2" : "none",scramble:"R U",comment:"Keep this note"},auth.token)).status).toBe(200);
  }
  app.server.stop();
  // Recreate the previous schema default and stored context values, including lost-ack receipts.
  for (const table of ["sessions","solves"]) db.exec(`DROP INDEX idx_${table}_practice;
    ALTER TABLE ${table} RENAME COLUMN scramble_type TO saved_scramble_type;
    ALTER TABLE ${table} ADD COLUMN scramble_type TEXT NOT NULL DEFAULT 'random-moves';
    UPDATE ${table} SET scramble_type=CASE WHEN id % 2=0 THEN 'competition' ELSE 'random-moves' END;
    ALTER TABLE ${table} DROP COLUMN saved_scramble_type;
    CREATE INDEX idx_${table}_practice ON ${table}(user_id,puzzle_id,solve_mode,scramble_type,created_at);`);
  for (const [index,op] of operations.entries()) db.query("UPDATE sync_receipts SET payload=?,result=? WHERE operation_id=?").run(JSON.stringify(op),JSON.stringify({...sessions[index],scramble_type:op.body.scrambleType}),op.id);
  const before = db.query("SELECT * FROM solves ORDER BY id").all() as any[];
  const oldCursor = (db.query("SELECT max(seq) n FROM sync_changes").get() as any).n;
  const migrated = createRustApi(path), next = client(migrated);
  expect(db.query("SELECT * FROM solves ORDER BY id").all()).toEqual(before.map(row=>({...row,scramble_type:"normal"})));
  for (const table of ["sessions","solves"]) {
    expect((db.query(`SELECT count(*) n FROM ${table} WHERE scramble_type!='normal'`).get() as any).n).toBe(0);
    expect((db.query(`PRAGMA table_info(${table})`).all() as any[]).find(row=>row.name==="scramble_type").dflt_value).toBe("'normal'");
  }
  expect(JSON.stringify(db.query("SELECT payload,result FROM sync_receipts").all())).not.toMatch(/competition|random-moves/);
  const changes = (await next(`/sync?after=${oldCursor}`,"GET",undefined,auth.token)).body.changes;
  expect(changes.filter((row:any)=>row.kind==="solves")).toHaveLength(5);
  expect(changes.every((row:any)=>row.value.scramble_type==="normal")).toBe(true);
  for (const type of ["normal","competition","random-moves"]) {
    const rows = (await next(`/solves?mode=playground&puzzle=333&scrambleType=${type}`,"GET",undefined,auth.token)).body;
    expect(rows).toHaveLength(5);
    expect(rows.every((row:any)=>row.scramble_type==="normal")).toBe(true);
  }
  // Both a still-old device and an upgraded device can retry the same operation.
  for (const ops of [operations,operations.map(op=>({...op,body:{...op.body,scrambleType:"normal"}}))]) {
    const replay = await next("/sync","POST",{operations:ops},auth.token);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(response.body);
  }
  expect((db.query("SELECT count(*) n FROM sessions").get() as any).n).toBe(2);
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  const migratedCursor = (db.query("SELECT max(seq) n FROM sync_changes").get() as any).n;
  migrated.server.stop();
  createRustApi(path);
  expect((db.query("SELECT max(seq) n FROM sync_changes").get() as any).n).toBe(migratedCursor);
});
