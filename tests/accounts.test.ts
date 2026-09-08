import { afterEach, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { Database } from "../scripts/sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi, CASES, openDb } from "./backend";

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
  const register = async (username: string, token?: string) => (await call("/auth/register", "POST", { username, password: "a-long-test-password" }, token)).body;
  return { db, call, register };
}

describe("Accounts and community profiles", () => {
  test("guest registration preserves history, rotates token, and survives reopening the database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cubix-account-"));
    cleanups.unshift(() => rmSync(dir, { recursive: true, force: true }));
    const { db, call, register } = setup(join(dir, "test.db"));
    const guest = (await call("/auth/guest", "POST")).body;
    const session = (await call("/sessions", "POST", { mode: "playground" }, guest.token)).body;
    await call("/solves", "POST", { sessionId: session.id, timeMs: 12340 }, guest.token);
    const alice = await register("alice", guest.token);
    expect(alice.user.id).toBe(guest.user.id);
    expect(alice.user.username).toBe("alice");
    expect(alice.user).not.toHaveProperty("displayName");
    expect(alice.user).not.toHaveProperty("isPrivate");
    expect((await call("/solves", "GET", undefined, guest.token)).status).toBe(401);
    expect((await call("/solves", "GET", undefined, alice.token)).body).toHaveLength(1);
    const second = setup(db.path);
    expect((await second.call("/auth/me", "GET", undefined, alice.token)).body.username).toBe("alice");
    const persisted = db.db.query<any, []>("SELECT * FROM users WHERE username = 'alice'").get();
    expect(persisted.password_hash.startsWith("$argon2id$")).toBe(true);
    expect(JSON.stringify(alice)).not.toContain("password_hash");
    expect(db.db.query<any, [string]>("SELECT * FROM auth_tokens WHERE token_hash = ?").get(alice.token)).toBeNull();
  });

  test("registered profiles appear in the community and show correct progress to other members", async () => {
    const { call, register } = setup();
    const alice = await register("alice"); const bob = await register("bob");
    const guest = (await call("/auth/guest", "POST")).body;
    const session = (await call("/sessions", "POST", { mode: "playground" }, alice.token)).body;
    for (const [index, timeMs] of [10000, 11000, 12000, 13000, 14000].entries())
      await call("/solves", "POST", { sessionId: session.id, timeMs, penalty: index === 0 ? "+2" : "none" }, alice.token);
    const training = (await call("/sessions", "POST", { mode: "training" }, alice.token)).body;
    await call("/solves", "POST", { sessionId: training.id, caseId: CASES[0].id, timeMs: 1500 }, alice.token);
    expect((await call("/users", "GET", undefined, bob.token)).body.map((u: any) => u.username)).toEqual(["alice", "bob"]);
    expect((await call("/users?q=ali", "GET", undefined, bob.token)).body).toHaveLength(1);
    expect((await call("/users/alice", "GET", undefined, bob.token)).status).toBe(200);
    expect((await call("/users/alice", "GET", undefined, alice.token)).body.totalSolves).toBe(6);
    expect((await call("/account", "PATCH", { bio: "Road to sub-10" }, alice.token)).status).toBe(200);
    const profile = await call("/users/ALICE", "GET", undefined, bob.token);
    expect(profile.status).toBe(200);
    expect(profile.body.user.bio).toBe("Road to sub-10");
    expect(profile.body.user).not.toHaveProperty("isPrivate");
    expect(profile.body.user).not.toHaveProperty("displayName");
    expect(profile.body.user).not.toHaveProperty("password_hash");
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
    expect((await call(`/users/${guest.user.username}`, "GET", undefined, bob.token)).status).toBe(404);
    expect((await call("/users/missing", "GET", undefined, bob.token)).status).toBe(404);
    await call("/account", "PATCH", { bio: "" }, alice.token);
    expect((await call("/users/alice", "GET", undefined, bob.token)).status).toBe(200);
    expect((await call("/users?q=alice", "GET", undefined, bob.token)).body).toHaveLength(1);
  });

  test("removing legacy profile fields preserves unique usernames, tokens and solve history across reopenings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cubix-visibility-migration-"));
    cleanups.unshift(() => rmSync(dir, { recursive: true, force: true }));
    const { db, call, register } = setup(join(dir, "test.db"));
    const alice = await register("alice"); const bob = await register("bob");
    const session = (await call("/sessions", "POST", { mode: "playground" }, alice.token)).body;
    const solve = (await call("/solves", "POST", { sessionId: session.id, timeMs: 12340 }, alice.token)).body;
    await call("/account", "PATCH", { bio: "Still cubing" }, alice.token);
    // Reproduce the old schema with one private and one public account.
    db.db.exec("ALTER TABLE users ADD COLUMN is_private INTEGER NOT NULL DEFAULT 1");
    db.db.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
    db.db.query("UPDATE users SET display_name = ? WHERE id = ?").run("Alice Legacy", alice.user.id);
    db.db.query("UPDATE users SET is_private = 0 WHERE id = ?").run(bob.user.id);
    const migrated = setup(db.path);
    expect(migrated.db.db.query<{ name: string }, []>("PRAGMA table_info(users)").all().map(c => c.name)).not.toContain("is_private");
    expect(migrated.db.db.query<{ name: string }, []>("PRAGMA table_info(users)").all().map(c => c.name)).not.toContain("display_name");
    expect((await migrated.call("/auth/me", "GET", undefined, alice.token)).body.id).toBe(alice.user.id);
    expect((await migrated.call("/users", "GET", undefined, bob.token)).body.map((u: any) => u.username)).toEqual(["alice", "bob"]);
    const profile = await migrated.call("/users/alice", "GET", undefined, bob.token);
    expect(profile.status).toBe(200);
    expect(profile.body.user.username).toBe("alice");
    expect(profile.body.user).not.toHaveProperty("displayName");
    expect((await migrated.call("/users?q=Legacy", "GET", undefined, bob.token)).body).toEqual([]);
    expect(profile.body.user.bio).toBe("Still cubing");
    expect(profile.body.playground.summary.best).toBe(12340);
    expect((await migrated.call(`/sessions/${session.id}`, "GET", undefined, alice.token)).status).toBe(200);
    expect((await migrated.call("/solves", "GET", undefined, alice.token)).body[0].id).toBe(solve.id);
    expect(migrated.db.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    const reopened = setup(db.path);
    expect((await reopened.call("/auth/login", "POST", { username: "alice", password: "a-long-test-password" })).status).toBe(200);
    expect((await reopened.call("/users/alice", "GET", undefined, bob.token)).body.totalSolves).toBe(1);
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
    expect((await call("/auth/register", "POST", { username: "ALICE", password: "a-long-password" })).status).toBe(409);
    expect((await call("/auth/register", "POST", { username: "bad name", password: "a-long-password" })).status).toBe(400);
    expect((await call("/auth/login", "POST", { username: "alice", password: "wrong" })).status).toBe(401);
    const login = await call("/auth/login", "POST", { username: "ALICE", password: "a-long-test-password" });
    expect(login.status).toBe(200);
    await call("/auth/logout", "POST", undefined, login.body.token);
    expect((await call("/auth/me", "GET", undefined, login.body.token)).status).toBe(401);
    expect((await call("/account", "PATCH", { bio: "x".repeat(241) }, alice.token)).status).toBe(422);
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
    const imported = spawnSync("rust-api/target/release/cubix-api", ["--import-history", "alice"], { env: { ...process.env, CUBIX_DB: path } });
    expect(imported.status).toBe(0);
    expect((await call("/solves", "GET", undefined, alice.token)).body).toHaveLength(1);
    const repeated = spawnSync("rust-api/target/release/cubix-api", ["--import-history", "alice"], { env: { ...process.env, CUBIX_DB: path } });
    expect(repeated.status).toBe(0);
    expect(repeated.stdout.toString()).toContain("Imported 0 legacy times");
    expect((await call("/solves", "GET", undefined, alice.token)).body).toHaveLength(1);
  });
});
