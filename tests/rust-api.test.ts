import { expect, test, afterEach } from "vitest";
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
    ).toMatchObject({ time_ms: 9000, user_id: null });
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
