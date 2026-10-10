/** Timer sessions: their figures, one row per session, and the name shown for one the player did not name. */
import type { SessionSummary, SolveDto } from "../../shared/types";
import { best, bestAverage, effective, mean, shortDate } from "./format";

export type { SessionSummary };

/**
 * One summary per session, oldest first, from timer solves in chronological order. `sessions` names them; those of
 * them without solves come too (a session just started), with `empty`.
 */
export function sessionSummaries(solves: readonly SolveDto[], sessions: Record<number, { id: number; name?: string | null; created_at: string }> = {}, empty: readonly number[] = []): SessionSummary[] {
  const groups = new Map<string, { id: number | null; solves: SolveDto[] }>();
  for (const solve of solves) {
    const id = solve.session_id != null && sessions[solve.session_id] ? solve.session_id : null;
    const key = id == null ? "day:" + solve.created_at.slice(0, 10) : String(id);
    const group = groups.get(key);
    if (group) group.solves.push(solve);
    else groups.set(key, { id, solves: [solve] });
  }
  const out: SessionSummary[] = [...groups.values()].map(({ id, solves }) => {
    const times = solves.map((s) => effective(s.time_ms, s.penalty));
    return {
      id, name: id == null ? null : sessions[id]?.name ?? null, at: solves[0]!.created_at, lastAt: solves.at(-1)!.created_at,
      count: solves.length, best: best(times), mean: mean(times), ao5: bestAverage(times, 5), ao12: bestAverage(times, 12),
    };
  });
  for (const id of empty) {
    const session = sessions[id];
    if (session && !groups.has(String(id)))
      out.push({ id, name: session.name ?? null, at: session.created_at, lastAt: session.created_at, count: 0, best: null, mean: null, ao5: null, ao12: null });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** The name a session shows: its own, or its day and event ("10 Oct · 3x3"). */
export const sessionName = (session: { name?: string | null; at?: string } | null | undefined, event: string) =>
  session?.name || `${shortDate(session?.at ?? new Date().toISOString())} · ${event}`;

/**
 * Whether the timer goes back to the session it showed last: one the player named, or one used today. Otherwise the
 * next solve starts a new one, as each day of practice did before sessions had names.
 */
export const resumes = (session: { name?: string | null; lastAt: string } | undefined, now = new Date()) =>
  !!session && (!!session.name || new Date(session.lastAt).toDateString() === now.toDateString());
