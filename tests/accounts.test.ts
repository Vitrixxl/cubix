import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi, CASES } from "../src/bun/api";
import { openDb } from "../src/bun/db";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const fn of cleanups.splice(0)) fn(); });
function setup(path = ":memory:") {
  const db = openDb(path);
  const app = createApi(db);
  cleanups.push(() => db.db.close());
  const call = async (path: string, method = "GET", body?: unknown, token?: string) => {
    const response = await app.handle(new Request(`http://localhost/api${path}`, {
      method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as any, headers: response.headers };
  };
  const register = async (username: string, token?: string) => (await call("/auth/register", "POST", { username, displayName: username, password: "a-long-test-password" }, token)).body;
  return { db, call, register };
}

describe("Accounts and profile privacy", () => {
  test("guest registration preserves history, rotates token, and survives reopening the database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cubix-account-"));
    cleanups.unshift(() => rmSync(dir, { recursive: true, force: true }));
    const { db, call, register } = setup(join(dir, "test.db"));
    const guest = (await call("/auth/guest", "POST")).body;
    const session = (await call("/sessions", "POST", { mode: "playground" }, guest.token)).body;
    await call("/solves", "POST", { sessionId: session.id, timeMs: 12340 }, guest.token);
    const alice = await register("alice", guest.token);
    expect(alice.user.id).toBe(guest.user.id);
    expect(alice.user.isPrivate).toBe(true);
    expect((await call("/solves", "GET", undefined, guest.token)).status).toBe(401);
    expect((await call("/solves", "GET", undefined, alice.token)).body).toHaveLength(1);
    const second = setup(db.path);
    expect((await second.call("/auth/me", "GET", undefined, alice.token)).body.username).toBe("alice");
    const persisted = db.db.query<any, []>("SELECT * FROM users WHERE username = 'alice'").get();
    expect(persisted.password_hash).toStartWith("$argon2id$");
    expect(JSON.stringify(alice)).not.toContain("password_hash");
    expect(db.db.query<any, [string]>("SELECT * FROM auth_tokens WHERE token_hash = ?").get(alice.token)).toBeNull();
  });

  test("private profiles are hidden in search and direct URLs, public profiles show correct progress", async () => {
    const { call, register } = setup();
    const alice = await register("alice"); const bob = await register("bob");
    const guest = (await call("/auth/guest", "POST")).body;
    const session = (await call("/sessions", "POST", { mode: "playground" }, alice.token)).body;
    for (const [index, timeMs] of [10000, 11000, 12000, 13000, 14000].entries())
      await call("/solves", "POST", { sessionId: session.id, timeMs, penalty: index === 0 ? "+2" : "none" }, alice.token);
    const training = (await call("/sessions", "POST", { mode: "training" }, alice.token)).body;
    await call("/solves", "POST", { sessionId: training.id, caseId: CASES[0].id, timeMs: 1500 }, alice.token);
    expect((await call("/users?q=ali", "GET", undefined, bob.token)).body).toHaveLength(0);
    expect((await call("/users/alice", "GET", undefined, bob.token)).status).toBe(404);
    expect((await call("/users/alice", "GET", undefined, alice.token)).body.totalSolves).toBe(6);
    await call("/account", "PATCH", { displayName: "Alice Cube", bio: "Road to sub-10", isPrivate: false }, alice.token);
    const profile = await call("/users/ALICE", "GET", undefined, bob.token);
    expect(profile.status).toBe(200);
    expect(profile.body.playground.summary.ao5).toBeCloseTo(12333.333);
    expect(profile.body.playground.summary.best).toBe(11000);
    expect(profile.body.cases[0].summary.best).toBe(1500);
    expect(profile.body.trainingSolves).toBe(1);
    expect(profile.body.activeDays).toBe(1);
    expect(profile.headers.get("cache-control")).toBe("no-store");
    expect((await call("/users?q=ALICE", "GET", undefined, bob.token)).body).toHaveLength(1);
    expect((await call("/users", "GET", undefined, guest.token)).status).toBe(403);
    expect((await call("/users/alice", "GET", undefined, guest.token)).status).toBe(404);
    expect((await call("/users/alice")).status).toBe(401);
    await call("/account", "PATCH", { displayName: "Alice", bio: "", isPrivate: true }, alice.token);
    expect((await call("/users/alice", "GET", undefined, bob.token)).status).toBe(404);
    expect((await call("/users?q=alice", "GET", undefined, bob.token)).body).toEqual([]);
  });

  test("every personal endpoint rejects another user's session or solve", async () => {
    const { call, register } = setup();
    const alice = await register("alice"); const bob = await register("bob");
    const session = (await call("/sessions", "POST", { mode: "training" }, alice.token)).body;
    const solve = (await call("/solves", "POST", { sessionId: session.id, caseId: CASES[0].id, timeMs: 1500 }, alice.token)).body;
    expect((await call(`/sessions/${session.id}`, "GET", undefined, bob.token)).status).toBe(404);
    expect((await call("/solves", "POST", { sessionId: session.id, timeMs: 100 }, bob.token)).status).toBe(404);
    expect((await call(`/solves/${solve.id}`, "PATCH", { penalty: "dnf" }, bob.token)).status).toBe(404);
    expect((await call(`/solves/${solve.id}`, "DELETE", undefined, bob.token)).status).toBe(404);
    expect((await call("/stats", "GET", undefined, bob.token)).body).toEqual([]);
    expect((await call(`/cases/${encodeURIComponent(CASES[0].id)}/stats`, "GET", undefined, bob.token)).body.history).toEqual([]);
    expect((await call("/solves?mode=training", "GET", undefined, bob.token)).body).toEqual([]);
    expect((await call(`/solves/${solve.id}`, "PATCH", { penalty: "dnf" }, alice.token)).status).toBe(200);
    expect((await call("/solves", "POST", { sessionId: session.id, timeMs: 100 }, alice.token)).status).toBe(400);
    expect((await call("/solves?limit=-1", "GET", undefined, bob.token)).status).toBe(422);
  });

  test("login, unique usernames, validation, logout and expired sessions", async () => {
    const { db, call, register } = setup();
    const alice = await register("alice");
    expect((await call("/auth/register", "POST", { username: "ALICE", displayName: "Other", password: "a-long-password" })).status).toBe(409);
    expect((await call("/auth/register", "POST", { username: "bad name", displayName: "Name", password: "a-long-password" })).status).toBe(400);
    expect((await call("/auth/login", "POST", { username: "alice", password: "wrong" })).status).toBe(401);
    const login = await call("/auth/login", "POST", { username: "ALICE", password: "a-long-test-password" });
    expect(login.status).toBe(200);
    await call("/auth/logout", "POST", undefined, login.body.token);
    expect((await call("/auth/me", "GET", undefined, login.body.token)).status).toBe(401);
    expect((await call("/account", "PATCH", { displayName: "  ", bio: "", isPrivate: false }, alice.token)).status).toBe(400);
    db.db.query("UPDATE auth_tokens SET expires_at = 0").run();
    expect((await call("/stats", "GET", undefined, alice.token)).status).toBe(401);
  });

  test("pre-account database migrates without exposing or deleting legacy times", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cubix-migration-"));
    cleanups.unshift(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "legacy.db");
    const old = new Database(path);
    old.exec("CREATE TABLE sessions (id INTEGER PRIMARY KEY, mode TEXT, case_ids TEXT, created_at TEXT); CREATE TABLE solves (id INTEGER PRIMARY KEY, session_id INTEGER, case_id TEXT, time_ms INTEGER, penalty TEXT, scramble TEXT, created_at TEXT); INSERT INTO sessions VALUES (1, 'playground', '[]', '2026-01-01'); INSERT INTO solves VALUES (1, 1, NULL, 9000, 'none', NULL, '2026-01-01');");
    old.close();
    const { db, call, register } = setup(path);
    const alice = await register("alice");
    expect((await call("/solves", "GET", undefined, alice.token)).body).toEqual([]);
    expect(db.db.query<any, []>("SELECT * FROM solves WHERE id = 1").get().time_ms).toBe(9000);
    expect(db.db.query<any, []>("SELECT * FROM solves WHERE id = 1").get().user_id).toBeNull();
    const imported = Bun.spawnSync([process.execPath, "run", "scripts/import-history.ts", "alice"], { env: { ...process.env, CUBIX_DB: path } });
    expect(imported.exitCode).toBe(0);
    expect((await call("/solves", "GET", undefined, alice.token)).body).toHaveLength(1);
    const repeated = Bun.spawnSync([process.execPath, "run", "scripts/import-history.ts", "alice"], { env: { ...process.env, CUBIX_DB: path } });
    expect(repeated.exitCode).toBe(0);
    expect(repeated.stdout.toString()).toContain("Imported 0 legacy times");
    expect((await call("/solves", "GET", undefined, alice.token)).body).toHaveLength(1);
  });
});
