/**
 * SQLite persistence with isolated account and guest histories.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type SessionMode = "training" | "playground";
export type Penalty = "none" | "+2" | "dnf";

export interface SessionRow {
  id: number;
  mode: SessionMode;
  case_ids: string; // JSON array
  created_at: string;
}
export interface SolveRow {
  id: number;
  session_id: number | null;
  case_id: string | null;
  time_ms: number;
  penalty: Penalty;
  scramble: string | null;
  created_at: string;
}

export function defaultDbPath(): string {
  if (process.env.CUBIX_DB) return process.env.CUBIX_DB;
  const base = process.env.XDG_DATA_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".local", "share");
  return join(base, "cubix", "cubix.db");
}

export function openDb(path = defaultDbPath()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      case_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS solves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      case_id TEXT,
      time_ms INTEGER NOT NULL,
      penalty TEXT NOT NULL DEFAULT 'none',
      scramble TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_solves_case ON solves(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_solves_session ON solves(session_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '',
      password_hash TEXT, is_private INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_expiry ON auth_tokens(expires_at);
  `);
  // Keep pre-account data intact; it can be assigned explicitly with import-history.ts.
  for (const table of ["sessions", "solves"]) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!columns.some(c => c.name === "user_id")) db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_owner ON ${table}(user_id)`);
  }

  return {
    db, path,
    createSession: (mode: SessionMode, caseIds: string[], userId: string) =>
      db.query<SessionRow, [string, string, string]>("INSERT INTO sessions (mode, case_ids, user_id) VALUES (?, ?, ?) RETURNING *").get(mode, JSON.stringify(caseIds), userId)!,
    getSession: (id: number, userId: string) => db.query<SessionRow, [number, string]>("SELECT * FROM sessions WHERE id = ? AND user_id = ?").get(id, userId) ?? null,
    addSolve: (s: { sessionId: number | null; caseId: string | null; timeMs: number; penalty?: Penalty; scramble?: string | null }, userId: string) =>
      db.query<SolveRow, [number | null, string | null, number, Penalty, string | null, string]>(
        "INSERT INTO solves (session_id, case_id, time_ms, penalty, scramble, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
      ).get(s.sessionId, s.caseId, Math.round(s.timeMs), s.penalty ?? "none", s.scramble ?? null, userId)!,
    getSolve: (id: number, userId: string) => db.query<SolveRow, [number, string]>("SELECT * FROM solves WHERE id = ? AND user_id = ?").get(id, userId) ?? null,
    deleteSolve: (id: number, userId: string) => db.query<SolveRow, [number, string]>("DELETE FROM solves WHERE id = ? AND user_id = ? RETURNING *").get(id, userId) ?? null,
    setPenalty: (id: number, penalty: Penalty, userId: string) => db.query<SolveRow, [Penalty, number, string]>("UPDATE solves SET penalty = ? WHERE id = ? AND user_id = ? RETURNING *").get(penalty, id, userId) ?? null,
    solvesBySession: (id: number, userId: string) => db.query<SolveRow, [number, string]>("SELECT * FROM solves WHERE session_id = ? AND user_id = ? ORDER BY created_at, id").all(id, userId),
    solvesByCase: (caseId: string, userId: string) => db.query<SolveRow, [string, string]>("SELECT * FROM solves WHERE case_id = ? AND user_id = ? ORDER BY created_at, id").all(caseId, userId),
    solvesByMode: (mode: SessionMode, limit = 500, userId: string) => db.query<SolveRow, [string, string, number]>(
      "SELECT s.* FROM solves s LEFT JOIN sessions se ON se.id = s.session_id WHERE s.user_id = ? AND COALESCE(se.mode, CASE WHEN s.case_id IS NULL THEN 'playground' ELSE 'training' END) = ? ORDER BY s.created_at DESC, s.id DESC LIMIT ?"
    ).all(userId, mode, limit),
    allCaseSolves: (userId: string) => db.query<SolveRow, [string]>("SELECT * FROM solves WHERE case_id IS NOT NULL AND user_id = ? ORDER BY case_id, created_at, id").all(userId),
    userSolves: (userId: string) => db.query<SolveRow, [string]>("SELECT * FROM solves WHERE user_id = ? ORDER BY created_at, id").all(userId),
  };
}

export type Db = ReturnType<typeof openDb>;

// ---------------------------------------------------------------------------
// Statistics helpers (WCA-style: ao5/ao12 drop best and worst; DNF counts as worst)
// ---------------------------------------------------------------------------
export interface CaseStats {
  caseId: string;
  count: number;
  best: number | null;
  worst: number | null;
  mean: number | null;
  ao5: number | null;
  ao12: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  last: number | null;
  lastAt: string | null;
}

export const effectiveTime = (s: Pick<SolveRow, "time_ms" | "penalty">): number | null =>
  s.penalty === "dnf" ? null : s.time_ms + (s.penalty === "+2" ? 2000 : 0);

/** Average of N: drop best and worst; more than one DNF → null. */
export function averageOf(times: (number | null)[]): number | null {
  if (times.length < 3) return null;
  const dnfs = times.filter((t) => t === null).length;
  if (dnfs > 1) return null;
  const sorted = [...times].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  const trimmed = sorted.slice(1, -1) as number[];
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

export function rollingAverages(times: (number | null)[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < times.length; i++) out.push(i + 1 >= n ? averageOf(times.slice(i + 1 - n, i + 1)) : null);
  return out;
}

export function computeStats(caseId: string, solves: SolveRow[]): CaseStats {
  const times = solves.map(effectiveTime);
  const valid = times.filter((t): t is number => t !== null);
  const ao5s = rollingAverages(times, 5).filter((t): t is number => t !== null);
  const ao12s = rollingAverages(times, 12).filter((t): t is number => t !== null);
  const last = solves.at(-1);
  return {
    caseId,
    count: solves.length,
    best: valid.length ? Math.min(...valid) : null,
    worst: valid.length ? Math.max(...valid) : null,
    mean: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    ao5: times.length >= 5 ? averageOf(times.slice(-5)) : null,
    ao12: times.length >= 12 ? averageOf(times.slice(-12)) : null,
    bestAo5: ao5s.length ? Math.min(...ao5s) : null,
    bestAo12: ao12s.length ? Math.min(...ao12s) : null,
    last: last ? effectiveTime(last) : null,
    lastAt: last?.created_at ?? null,
  };
}
