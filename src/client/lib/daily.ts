/**
 * The daily scramble: one scramble a day per event, the same for everyone, new at midnight UTC. It is drawn on the
 * device, offline too: a random state seeded by the date and the event, solved by the app's random-state 3×3
 * solver (cubing.js, deterministic), so every platform shows the same moves. The field and the ranking come from
 * /api/daily/<event> (go-api/daily.go).
 */
import type { PatternData } from "../../shared/crossTraining";
import type { ScrambleEngine } from "./practiceScrambleCore";
import { msg } from "../i18n/msg";

/** The events with a daily scramble: the 3×3 random-state ones. */
export const DAILY_EVENTS = ["333", "333oh"] as const;
export type DailyEvent = (typeof DAILY_EVENTS)[number];
export const isDailyEvent = (event: string): event is DailyEvent => (DAILY_EVENTS as readonly string[]).includes(event);
/** The day of the daily scramble: the UTC date, YYYY-MM-DD. */
export const dailyDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** A seeded generator (cyrb53 of the seed, then mulberry32): the same draws for the same seed on every engine. */
function seeded(seed: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  let a = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}
const shuffle = (pieces: number[], below: (n: number) => number) => {
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [pieces[i], pieces[j]] = [pieces[j]!, pieces[i]!];
  }
  return pieces;
};
const odd = (pieces: number[]) => pieces.reduce((n, a, i) => n + pieces.slice(i + 1).filter(b => b < a).length, 0) % 2 === 1;
/** Twists of every piece but the last, which the others decide: the sum stays a multiple of `mod`. */
const twists = (count: number, mod: number, below: (n: number) => number) => {
  const list = Array.from({ length: count - 1 }, () => below(mod));
  return [...list, (mod - (list.reduce((a, b) => a + b, 0) % mod)) % mod];
};

/** The day's 3×3 state for an event: a uniformly random solvable state, centres solved. */
export function dailyPattern(day: string, event: string): PatternData {
  const below = seeded(`qbix-daily:${day}:${event}`);
  const edges = shuffle([...Array(12).keys()], below), corners = shuffle([...Array(8).keys()], below);
  // Both permutations share their parity on a real cube.
  if (odd(edges) !== odd(corners)) [edges[0], edges[1]] = [edges[1]!, edges[0]!];
  return {
    EDGES: { pieces: edges, orientation: twists(12, 2, below) },
    CORNERS: { pieces: corners, orientation: twists(8, 3, below) },
    CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: [0, 0, 0, 0, 0, 0] },
  } as PatternData;
}
export const dailyScramble = (day: string, event: string, engine: ScrambleEngine) => engine.patternScramble(dailyPattern(day, event));

export type DailyPlace = { rank: number; beats: number; timeMs: number; penalty: "none" | "+2" | "dnf" };
/** The account's ranked result: whether a connected cube recorded it, and whether it may still be cancelled. */
export type DailyMine = DailyPlace & { verified: boolean; cancellable: boolean };
/** The day's field (GET or POST /api/daily/<event>), all of it or only its verified results. */
export interface DailyBoard {
  day: string;
  event: DailyEvent;
  /** Results in the view. */
  total: number;
  /** Results of the day, and how many of them are verified (made on a connected cube). */
  allTotal: number;
  verifiedTotal: number;
  dnf: number;
  /** Finished times as a histogram: `counts[i]` solves from `from + i × width` ms; the last bucket takes the slower. */
  buckets: { from: number; width: number; counts: number[] };
  /** The account's ranked result, placed among the view's (outside it when unverified in the verified view). */
  mine: DailyMine | null;
  /** Where the time asked about stands (an unranked attempt, a guest's). */
  placed: DailyPlace | null;
  /** On a POST: whether this attempt is the ranked one. */
  ranked?: boolean;
}
/** The bucket a time falls in, -1 for a DNF or an empty field. */
export function bucketOf(board: Pick<DailyBoard, "buckets">, place: Pick<DailyPlace, "timeMs" | "penalty"> | null) {
  const { from, width, counts } = board.buckets;
  if (!place || place.penalty === "dnf" || !counts.length || !width) return -1;
  const ms = place.timeMs + (place.penalty === "+2" ? 2000 : 0);
  return Math.max(0, Math.min(counts.length - 1, Math.floor((ms - from) / width)));
}

/** A past result of the account (GET /api/daily/<event>/history), its rank in that day's field. */
export type DailyDay = DailyPlace & { day: string; verified: boolean; total: number };
/** What the history adds up to: best and mean of the finished, mean rank, the run of days up to today (or yesterday). */
export function dailyStats(history: DailyDay[], today = dailyDay()) {
  const done = history.filter((d) => d.penalty !== "dnf").map((d) => d.timeMs + (d.penalty === "+2" ? 2000 : 0));
  const days = new Set(history.map((d) => d.day));
  let streak = 0;
  const day = new Date(today + "T00:00:00Z");
  // Not tried yet today: the run still stands from yesterday.
  if (!days.has(today)) day.setUTCDate(day.getUTCDate() - 1);
  while (days.has(day.toISOString().slice(0, 10))) {
    streak++;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return {
    days: history.length,
    best: done.length ? Math.min(...done) : null,
    mean: done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null,
    rank: history.length ? Math.round((history.reduce((a, d) => a + d.rank, 0) / history.length) * 10) / 10 : null,
    streak,
  };
}

export class DailyError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function answer<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new DailyError(value.error ?? msg("Request failed ({0})", { 0: response.status }), response.status);
  return value as T;
}
const auth = (token: string | null): Record<string, string> => (token ? { authorization: "Bearer " + token } : {});
/**
 * The day's field of an event (only its verified results when `verified`), with where `attempt` stands; `rank` records
 * it as the account's ranked attempt (POST), `solution` the connected cube's turns that make it verified. Throws a
 * DailyError for an answer of the API, a TypeError when offline.
 */
export async function fetchDaily(origin: string, token: string | null, event: string, day: string, attempt?: { timeMs: number; penalty: string; solution?: string }, rank = false, verified = false): Promise<DailyBoard> {
  const query = new URLSearchParams({ day, ...(attempt && !rank ? { time: String(attempt.timeMs), penalty: attempt.penalty } : {}), ...(verified ? { verified: "1" } : {}) });
  return answer(
    rank
      ? await fetch(`${origin}/api/daily/${event}`, { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify({ day, ...attempt }) })
      : await fetch(`${origin}/api/daily/${event}?${query}`, { headers: auth(token) }),
  );
}
/** Cancels the account's ranked attempt of `day` (a false start): once a day, soon after the solve. */
export async function cancelDaily(origin: string, token: string, event: string, day: string): Promise<DailyBoard> {
  return answer(await fetch(`${origin}/api/daily/${event}?day=${day}`, { method: "DELETE", headers: auth(token) }));
}
/** The account's past results on an event, newest first. */
export async function fetchDailyHistory(origin: string, token: string, event: string, verified = false): Promise<DailyDay[]> {
  return answer(await fetch(`${origin}/api/daily/${event}/history${verified ? "?verified=1" : ""}`, { headers: auth(token) }));
}
