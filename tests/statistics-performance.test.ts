import { expect, test } from "bun:test";
import { averageOf, best, bestAverage, rollingAverages } from "../src/client/lib/format";
import { caseStats, history, profile, records } from "../src/client/local/stats";
import type { SolveDto, UserDto } from "../src/shared/types";

// Independent sorting oracle: exercises windows as DNFs and tied extrema enter and leave.
function reference(times: readonly (number | null)[]) {
  if (times.length < 3 || times.filter(t => t === null).length > 1) return null;
  const sorted = times.map(t => t ?? Infinity).sort((a, b) => a - b);
  return sorted.slice(1, -1).reduce((sum, t) => sum + t, 0) / (times.length - 2);
}
test("linear rolling averages preserve every trimmed window and its best", () => {
  let seed = 1977;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const samples = [[], Array(200).fill(null), Array(300).fill(12000),
    Array.from({ length: 1500 }, () => random() % 13 === 0 ? null : random() % 100 * 123),
    Array.from({ length: 300 }, (_, i) => i * 100), Array.from({ length: 300 }, (_, i) => 30000 - i * 100)];
  for (const times of samples) for (const size of [3, 5, 12, 100, 257, 2000]) {
    const expected = times.map((_, i) => i + 1 < size ? null : reference(times.slice(i + 1 - size, i + 1)));
    expect(rollingAverages(times, size)).toEqual(expected);
    expect(bestAverage(times, size)).toBe(best(expected));
  }
  for (const times of samples) expect(averageOf(times)).toBe(reference(times));
});

test("large histories do not exceed JavaScript's argument limit", () => {
  const times = Array.from({ length: 300_000 }, (_, i) => i % 101 === 0 ? null : 10000 + i % 100);
  expect(best(times)).toBe(10000);
  expect(bestAverage(times, 100)).not.toBeNull();
});

const user: UserDto = { id: "test", username: "test", isGuest: false, createdAt: "2026-01-01T00:00:00.000Z" };
const solve = (id: number, extra: Partial<SolveDto> = {}): SolveDto => ({ id, time_ms: 10000 + id * 100, penalty: "none", case_id: null, session_id: null, scramble: null, created_at: `2026-01-01T00:00:00.000Z`, ...extra });
test("summary-only reads match profiles across events, penalties and filters without mutating input", () => {
  const rows = [solve(8, { puzzle_id: "222" }), solve(6, { case_id: "PLL Aa", penalty: "dnf" }),
    solve(3, { case_id: "PLL Aa", penalty: "+2" }), solve(7, { scramble_type: "2gen-ru" }),
    solve(5, { case_id: "PLL Aa", solve_mode: "one-handed" }), solve(2, { case_id: "PLL Ab" }), solve(1)];
  const before = structuredClone(rows);
  for (const puzzle of ["222", "333"] as const) for (const solveMode of ["standard", "one-handed"] as const) {
    const filter = { solveMode, scrambleType: "2gen-ru" as const };
    const p = profile(user, rows, puzzle, filter);
    expect(caseStats(rows, puzzle, filter)).toEqual(p.cases.map(c => c.summary));
    expect(p.records).toEqual(records(rows));
    for (const c of p.cases) expect(c.history).toEqual(history(c.summary.caseId, rows.filter(s => s.case_id === c.summary.caseId && (s.solve_mode ?? "standard") === solveMode)).history);
  }
  expect(records(rows).find(r => r.event === "333")?.count).toBe(1);
  expect(profile(user, rows).playground.history.map(s => s.id)).toEqual([1, 7]);
  expect(rows).toEqual(before);
});

test("history uses server IDs to order equal timestamps after an offline upload", () => {
  const rows = [Object.assign(solve(-1), { serverId: 10 }), Object.assign(solve(-2), { serverId: 9 })];
  expect(history("playground", rows).history.map(s => s.id)).toEqual([-2, -1]);
});
