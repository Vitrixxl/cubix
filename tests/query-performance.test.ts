import { afterEach, expect, test } from "bun:test";
import { openDb, createRustApi } from "./backend";
import { createApiClient } from "../src/client/api-client";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(close => close()));

test("batched sync preserves page order, opt-ins, tombstones and account isolation", async () => {
  const { db, path } = openDb(); cleanups.push(() => db.close());
  const app = createRustApi(path);
  const origin = `http://127.0.0.1:${app.server.port}`;
  const anon = createApiClient(origin, { getToken: () => null });
  const alice = await anon.register("batch_alice", "a-long-test-password");
  const bob = await anon.register("batch_bob", "a-long-test-password");
  db.transaction(() => {
    for (const owner of [alice.user.id, bob.user.id]) {
      const session = db.query("INSERT INTO sessions(user_id,mode,case_ids) VALUES(?,'training','[\"PLL Aa\"]') RETURNING id").get(owner)!.id;
      const insert = db.query("INSERT INTO solves(user_id,session_id,case_id,time_ms,penalty) VALUES(?,?,'PLL Aa',?,'none')");
      for (let i = 0; i < 510; i++) insert.run(owner, session, 1000 + i);
      db.query("INSERT INTO learned_cases(user_id,case_id) VALUES(?,'PLL Aa')").run(owner);
      db.query("INSERT INTO learning_group_orders(user_id,track,groups) VALUES(?,'PLL','[\"Edges Only\"]')").run(owner);
      db.query("INSERT INTO personal_entries(user_id,key,value) VALUES(?,'profile','{\"kind\":\"profile\"}')").run(owner);
    }
    db.query("DELETE FROM solves WHERE user_id=? AND id IN (SELECT id FROM solves WHERE user_id=? ORDER BY id LIMIT 2)").run(alice.user.id, alice.user.id);
  })();
  const pull = async (after: number, optIn = true) => {
    const res = await fetch(`${origin}/api/sync?after=${after}${optIn ? "&learningGroups=1&journey=1" : ""}`, { headers: { Authorization: `Bearer ${alice.token}` } });
    expect(res.status).toBe(200);
    return await res.json() as any;
  };
  let cursor = 0;
  const changes: any[] = [];
  do {
    const page = await pull(cursor);
    expect(page.changes.length).toBeLessThanOrEqual(500);
    expect(page.cursor).toBeGreaterThan(cursor);
    changes.push(...page.changes); cursor = page.cursor;
    if (!page.more) break;
  } while (true);
  const expected = db.query<{ kind: string; entity_id: number; deleted: number }>("SELECT kind,entity_id,deleted FROM sync_changes WHERE user_id=? ORDER BY seq").all(alice.user.id);
  expect(changes.map(c => [c.kind, c.id, c.value === null])).toEqual(expected.map(r => [r.kind, r.entity_id, r.deleted === 1]));
  expect(changes.filter(c => c.value).every(c => c.value.user_id === alice.user.id)).toBe(true);
  expect(changes.find(c => c.kind === "sessions").value.case_ids).toEqual(["PLL Aa"]);
  expect(changes.find(c => c.kind === "learning_group_orders").value.groups).toEqual(["Edges Only"]);
  expect(changes.find(c => c.kind === "personal_entries").value.value).toEqual({ kind: "profile" });
  const first = await pull(0, false), last = await pull(first.cursor, false);
  expect([...first.changes, ...last.changes].some(c => ["learning_group_orders", "personal_entries"].includes(c.kind))).toBe(false);
  expect(last.cursor).toBe(cursor);
  expect((await pull(cursor)).changes).toEqual([]);
  const edited = changes.find(c => c.kind === "solves" && c.value);
  db.query("UPDATE solves SET penalty='+2' WHERE id=?").run(edited.id);
  const delta = await pull(cursor);
  expect(delta.changes).toHaveLength(1);
  expect(delta.changes[0]).toMatchObject({ id: edited.id, value: { penalty: "+2" } });
});

test("history filters use ordered indexes and preserve legacy session mode", async () => {
  const { db, path } = openDb(); cleanups.push(() => db.close());
  const app = createRustApi(path), origin = `http://127.0.0.1:${app.server.port}`;
  let token: string | null = null;
  const api = createApiClient(origin, { getToken: () => token });
  const auth = await api.register("ordered_history", "a-long-test-password"); token = auth.token;
  const plans = [
    ["SELECT * FROM solves WHERE user_id=? AND puzzle_id='333' AND solve_mode='standard' ORDER BY created_at DESC,id DESC LIMIT 50", [auth.user.id]],
    ["SELECT * FROM solves WHERE user_id=? AND puzzle_id='333' AND solve_mode='standard' AND scramble_type='normal' ORDER BY created_at DESC,id DESC LIMIT 50", [auth.user.id]],
    ["SELECT * FROM solves WHERE user_id=? AND case_id='PLL Aa' AND solve_mode='standard' ORDER BY created_at,id", [auth.user.id]],
    ["SELECT * FROM solves WHERE user_id=? AND puzzle_id='333' AND solve_mode='standard' AND case_id IS NOT NULL ORDER BY case_id,created_at,id", [auth.user.id]],
    ["SELECT * FROM solves WHERE user_id=? AND session_id=1 ORDER BY created_at,id", [auth.user.id]],
  ] as const;
  for (const [sql, args] of plans) {
    const details = db.query<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map(r => r.detail).join("\n");
    expect(details).toContain("SEARCH solves USING INDEX");
    expect(details).not.toContain("TEMP B-TREE");
  }
  const session = await api.createSession("training", ["PLL Aa"]);
  // A legacy training session can contain a solve without a case; its mode still wins.
  const inserted = db.query<{ id: number }>("INSERT INTO solves(user_id,session_id,time_ms) VALUES(?,?,1234) RETURNING id").get(auth.user.id, session.id)!;
  expect((await api.solves("training")).map(s => s.id)).toEqual([inserted.id]);
  expect(await api.solves("playground")).toEqual([]);
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});
