import { expect, test } from "bun:test";
import { records } from "../src/client/local/stats";
import type { SolveDto } from "../src/shared/types";

const solve = (id: number, time_ms: number): SolveDto => ({ id, puzzle_id: "333", solve_mode: "standard", scramble_type: "normal", session_id: null, case_id: null, time_ms, penalty: "none", scramble: null, created_at: `2026-10-0${id}T10:00:00.000Z` });

test("a best given at setup stands in the records until a solve beats it", () => {
  // Given but never timed: the event shows with its best alone.
  expect(records([], { "222": 2500 })).toEqual([{ event: "222", puzzle: "222", solveMode: "standard", count: 0, best: 2500, bestAo5: null, bestAo12: null, bestAo100: null, lastAt: null, declared: true }]);
  // Slower solves leave it standing; a faster one takes its place.
  expect(records([solve(1, 12000), solve(2, 11000)], { "333": 10500 })[0]).toMatchObject({ best: 10500, count: 2, declared: true });
  const beaten = records([solve(1, 12000), solve(2, 9800)], { "333": 10500 })[0]!;
  expect(beaten.best).toBe(9800);expect(beaten.declared).toBeUndefined();
});
