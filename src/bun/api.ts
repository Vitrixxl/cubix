/**
 * Elysia HTTP API consumed by the React webview.
 * Algorithm data is bundled from data/*.json; user data lives in SQLite.
 */
import { Elysia, t } from "elysia";
import { accounts, publicUser } from "./accounts";
import { cors } from "@elysiajs/cors";
import { computeStats, effectiveTime, rollingAverages, type Db, type Penalty, type SessionMode } from "./db";

import pll from "../../data/pll.json";
import oll from "../../data/oll.json";
import f2l from "../../data/f2l.json";
import f2lAdvanced from "../../data/f2l-advanced.json";
import f2lExpert from "../../data/f2l-expert.json";
import lookOll from "../../data/2look-oll.json";
import lookPll from "../../data/2look-pll.json";
import moves from "../../data/moves.json";

import type { AlgEntry, CaseDto, SetDto, Stage } from "../shared/types";
export type { AlgEntry, CaseDto, SetDto, Stage };

const SETS: { id: string; label: string; stage: Stage; description: string; doc: any }[] = [
  { id: "f2l", label: "F2L", stage: "F2L", description: "The 41 standard first-two-layers cases, front-right slot.", doc: f2l },
  { id: "f2l-advanced", label: "F2L Advanced", stage: "F2L", description: "Pieces in other slots, back slot, multi-slot situations.", doc: f2lAdvanced },
  { id: "f2l-expert", label: "F2L Expert", stage: "F2L", description: "Pairs in the wrong slot, corner solved with edge misplaced, and other tricky cases.", doc: f2lExpert },
  { id: "2look-oll", label: "2-Look OLL", stage: "OLL", description: "Beginner orientation: edges first, then corners (10 algorithms).", doc: lookOll },
  { id: "oll", label: "OLL", stage: "OLL", description: "All 57 orientation-of-the-last-layer cases.", doc: oll },
  { id: "2look-pll", label: "2-Look PLL", stage: "PLL", description: "Beginner permutation: corners first, then edges (6 algorithms).", doc: lookPll },
  { id: "pll", label: "PLL", stage: "PLL", description: "All 21 permutation-of-the-last-layer cases.", doc: pll },
];

export const CASES: CaseDto[] = SETS.flatMap((s) =>
  (s.doc.cases as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    stage: s.stage,
    set: s.id,
    setLabel: s.label,
    group: c.group,
    subgroup: c.subgroup || undefined,
    probability: c.probability || undefined,
    setup: c.setup,
    setups_alt: c.setups_alt ?? [],
    algorithms: (c.algorithms as any[]).map(({ verified: _v, ...a }) => a),
  })),
);
const CASE_BY_ID = new Map(CASES.map((c) => [c.id, c]));
export const SET_DTOS: SetDto[] = SETS.map(({ doc: _d, ...s }) => ({ ...s, count: CASES.filter((c) => c.set === s.id).length }));

export function createApi(db: Db) {
  const auth = accounts(db);
  const attempts = new Map<string, { count: number; until: number }>();
  const limited = (key: string) => {
    const now = Date.now();
    for (const [k, value] of attempts) if (value.until < now) attempts.delete(k);
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60000 };
    attempts.set(key, entry);
    return ++entry.count > 10;
  };
  const history = (caseId: string, solves: ReturnType<Db["userSolves"]>) => {
    const times = solves.map(effectiveTime);
    let best: number | null = null;
    return {
      summary: computeStats(caseId, solves),
      history: solves.map((s, i) => {
        const time = times[i];
        if (time !== null && (best === null || time < best)) best = time;
        return { id: s.id, time, penalty: s.penalty, at: s.created_at, best, sessionId: s.session_id };
      }),
      ao5: rollingAverages(times, 5), ao12: rollingAverages(times, 12),
    };
  };
  return new Elysia({ prefix: "/api" })
    .use(cors({ credentials: false }))
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .get("/health", () => ({ ok: true }))
    .post("/auth/guest", () => auth.issue(auth.guest()))
    .post("/auth/register", async ({ body, request, status }) => {
      const username = body.username.trim().toLowerCase();
      const displayName = body.displayName.trim();
      if (!/^[a-z0-9_]{3,24}$/.test(username) || !displayName) return status(400, { error: "Use 3–24 letters, numbers or underscores for your username, and enter a display name." });
      if (limited(`register:${username}`)) return status(429, { error: "Too many attempts. Try again in 15 minutes." });
      if (auth.byUsername(username)) return status(409, { error: "This username is already taken." });
      const current = auth.authenticate(request.headers.get("authorization"));
      if (current?.password_hash) return status(400, { error: "Sign out before creating another account." });
      const hash = await Bun.password.hash(body.password, "argon2id");
      try {
        // Recheck after hashing: another request may have upgraded the same guest.
        if (current && auth.byId(current.id)?.password_hash) return status(409, { error: "This guest already has an account. Sign in." });
        return auth.issue(auth.register(username, displayName, hash, current?.id));
      } catch (error) {
        if (auth.byUsername(username)) return status(409, { error: "This username is already taken." });
        throw error;
      }
    }, { body: t.Object({ username: t.String({ minLength: 3, maxLength: 24 }), displayName: t.String({ minLength: 1, maxLength: 40 }), password: t.String({ minLength: 10, maxLength: 128 }) }) })
    .post("/auth/login", async ({ body, status }) => {
      const username = body.username.trim().toLowerCase();
      if (limited(`login:${username}`)) return status(429, { error: "Too many attempts. Try again in 15 minutes." });
      const user = auth.byUsername(username);
      if (!user?.password_hash || !await Bun.password.verify(body.password, user.password_hash)) return status(401, { error: "Incorrect username or password." });
      attempts.delete(`login:${username}`);
      return auth.issue(user);
    }, { body: t.Object({ username: t.String({ maxLength: 24 }), password: t.String({ maxLength: 128 }) }) })
    .get("/auth/me", ({ request, status }) => {
      const user = auth.authenticate(request.headers.get("authorization"));
      return user ? publicUser(user) : status(401, { error: "Please sign in again." });
    })
    .post("/auth/logout", ({ request }) => { auth.revoke(request.headers.get("authorization")); return { ok: true }; })
    .get("/moves", () => moves)
    .get("/sets", () => SET_DTOS)
    .get("/cases", () => CASES)
    .get(
      "/cases/:id",
      ({ params, status }) => {
        const c = CASE_BY_ID.get(decodeURIComponent(params.id));
        return c ?? status(404, { error: "Unknown case" });
      },
    )
    .resolve(({ request, status }) => {
      const user = auth.authenticate(request.headers.get("authorization"));
      if (!user) return status(401, { error: "Please sign in again." });
      return { user };
    })
    .patch("/account", ({ user, body, status }) => {
      if (!user.password_hash) return status(403, { error: "Create an account to edit your profile." });
      if (!body.displayName.trim()) return status(400, { error: "Enter a display name." });
      return auth.update(user.id, body.displayName.trim(), body.bio.trim(), body.isPrivate);
    }, { body: t.Object({ displayName: t.String({ minLength: 1, maxLength: 40 }), bio: t.String({ maxLength: 240 }), isPrivate: t.Boolean() }) })
    .get("/users", ({ user, query, status }) => {
      if (!user.password_hash) return status(403, { error: "Sign in to discover other cubers." });
      return auth.search((query.q ?? "").trim());
    }, { query: t.Object({ q: t.Optional(t.String({ maxLength: 80 })) }) })
    .get("/users/:username", ({ user, params, status }) => {
      const target = auth.byUsername(params.username);
      if (!user.password_hash || !target || (target.is_private && target.id !== user.id)) return status(404, { error: "This profile is private or unavailable." });
      const solves = db.userSolves(target.id);
      const groups = new Map<string, typeof solves>();
      for (const solve of solves) if (solve.case_id) {
        const group = groups.get(solve.case_id) ?? [];
        group.push(solve); groups.set(solve.case_id, group);
      }
      return {
        user: publicUser(target), totalSolves: solves.length,
        trainingSolves: solves.filter(s => s.case_id !== null).length,
        activeDays: new Set(solves.map(s => s.created_at.slice(0, 10))).size,
        playground: history("playground", solves.filter(s => s.case_id === null)),
        cases: [...groups].flatMap(([id, rows]) => {
          const c = CASE_BY_ID.get(id);
          return c ? [{ ...history(id, rows), name: c.name, stage: c.stage }] : [];
        }),
      };
    })
    // ---- stats -------------------------------------------------------------
    .get("/stats", ({ user }) => {
      const byCase = new Map<string, typeof rows>();
      const rows = db.allCaseSolves(user.id);
      for (const r of rows) {
        const list = byCase.get(r.case_id!) ?? [];
        list.push(r);
        byCase.set(r.case_id!, list);
      }
      return [...byCase.entries()].map(([caseId, solves]) => computeStats(caseId, solves));
    })
    .get("/cases/:id/stats", ({ params, user }) => {
      const caseId = decodeURIComponent(params.id);
      const solves = db.solvesByCase(caseId, user.id);
      const times = solves.map(effectiveTime);
      let best: number | null = null;
      const history = solves.map((s, i) => {
        const tm = times[i];
        if (tm !== null && (best === null || tm < best)) best = tm;
        return { id: s.id, time: tm, penalty: s.penalty, at: s.created_at, best, sessionId: s.session_id };
      });
      return {
        summary: computeStats(caseId, solves),
        history,
        ao5: rollingAverages(times, 5),
        ao12: rollingAverages(times, 12),
      };
    })
    // ---- sessions ----------------------------------------------------------
    .post(
      "/sessions",
      ({ body, user }) => {
        const session = db.createSession(body.mode as SessionMode, body.caseIds ?? [], user.id);
        return { ...session, case_ids: JSON.parse(session.case_ids) as string[] };
      },
      { body: t.Object({ mode: t.Union([t.Literal("training"), t.Literal("playground")]), caseIds: t.Optional(t.Array(t.String())) }) },
    )
    .get("/sessions/:id", ({ params, status, user }) => {
      const s = db.getSession(Number(params.id), user.id);
      if (!s) return status(404, { error: "Unknown session" });
      return { ...s, case_ids: JSON.parse(s.case_ids) as string[], solves: db.solvesBySession(s.id, user.id) };
    })
    // ---- solves ------------------------------------------------------------
    .get("/solves", ({ query, user }) => db.solvesByMode((query.mode as SessionMode) ?? "playground", Number(query.limit ?? 500), user.id), {
      query: t.Object({ mode: t.Optional(t.Union([t.Literal("training"), t.Literal("playground")])), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 10000 })) }),
    })
    .post(
      "/solves",
      ({ body, status, user }) => {
        if (body.sessionId != null && !db.getSession(body.sessionId, user.id)) return status(404, { error: "Unknown session" });
        if (body.sessionId != null) {
          const session = db.getSession(body.sessionId, user.id)!;
          if ((session.mode === "training") !== !!body.caseId) return status(400, { error: "Case and session mode do not match." });
        }
        if (body.caseId && !CASE_BY_ID.has(body.caseId)) return status(400, { error: "Unknown case" });
        return db.addSolve({ sessionId: body.sessionId ?? null, caseId: body.caseId ?? null, timeMs: body.timeMs, penalty: body.penalty as Penalty | undefined, scramble: body.scramble ?? null }, user.id);
      },
      {
        body: t.Object({
          sessionId: t.Optional(t.Nullable(t.Number())),
          caseId: t.Optional(t.Nullable(t.String())),
          timeMs: t.Number({ minimum: 0 }),
          penalty: t.Optional(t.Union([t.Literal("none"), t.Literal("+2"), t.Literal("dnf")])),
          scramble: t.Optional(t.Nullable(t.String())),
        }),
      },
    )
    .patch(
      "/solves/:id",
      ({ params, body, status, user }) => db.setPenalty(Number(params.id), body.penalty as Penalty, user.id) ?? status(404, { error: "Unknown solve" }),
      { body: t.Object({ penalty: t.Union([t.Literal("none"), t.Literal("+2"), t.Literal("dnf")]) }) },
    )
    .delete("/solves/:id", ({ params, status, user }) => db.deleteSolve(Number(params.id), user.id) ?? status(404, { error: "Unknown solve" }));
}

export type Api = ReturnType<typeof createApi>;
