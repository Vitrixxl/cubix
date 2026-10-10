import { expect, test } from "bun:test";
import { cubingScrambleEngine } from "../src/client/lib/cubingScrambleEngine";
import { bucketOf, dailyDay, dailyStats, dailyPattern, dailyScramble } from "../src/client/lib/daily";

const cubing = cubingScrambleEngine(name => import(`cubing/${name}`));

test("the day changes at midnight UTC", () => {
  expect(dailyDay(Date.UTC(2026, 9, 10, 23, 59))).toBe("2026-10-10");
  expect(dailyDay(Date.UTC(2026, 9, 11, 0, 0))).toBe("2026-10-11");
});

test("the daily scramble is the same for everyone, per day and event, and reaches the day's state", async () => {
  const day = "2026-10-10";
  const first = await dailyScramble(day, "333", cubing);
  expect(await dailyScramble(day, "333", cubing)).toBe(first);
  expect(await dailyScramble(day, "333oh", cubing)).not.toBe(first);
  expect(await dailyScramble("2026-10-11", "333", cubing)).not.toBe(first);
  const { cube3x3x3 } = await import("cubing/puzzles");
  const reached = (await cube3x3x3.kpuzzle()).defaultPattern().applyAlg(first).patternData;
  const target = dailyPattern(day, "333");
  expect(reached.EDGES).toEqual({ ...reached.EDGES, ...target.EDGES });
  expect(reached.CORNERS).toEqual({ ...reached.CORNERS, ...target.CORNERS });
}, 60000);

test("a time's bucket", () => {
  const board = { buckets: { from: 9000, width: 1000, counts: [1, 2, 3] } };
  expect(bucketOf(board, { timeMs: 9500, penalty: "none" })).toBe(0);
  expect(bucketOf(board, { timeMs: 9500, penalty: "+2" })).toBe(2);
  expect(bucketOf(board, { timeMs: 60000, penalty: "none" })).toBe(2);
  expect(bucketOf(board, { timeMs: 9500, penalty: "dnf" })).toBe(-1);
});

test("the history's figures", () => {
  const day = (d: string, timeMs: number, rank: number, penalty: "none" | "+2" | "dnf" = "none") => ({ day: d, timeMs, rank, penalty, beats: 0, verified: false, total: 10 });
  const history = [day("2026-10-09", 10000, 2), day("2026-10-08", 9000, 4, "+2"), day("2026-10-07", 8000, 6, "dnf"), day("2026-10-05", 12000, 1)];
  expect(dailyStats(history, "2026-10-10")).toEqual({ days: 4, best: 10000, mean: 11000, rank: 3.3, streak: 3 });
  expect(dailyStats(history, "2026-10-11").streak).toBe(0);
  expect(dailyStats([day("2026-10-10", 9000, 1), ...history], "2026-10-10").streak).toBe(4);
  expect(dailyStats([], "2026-10-10")).toEqual({ days: 0, best: null, mean: null, rank: null, streak: 0 });
});
