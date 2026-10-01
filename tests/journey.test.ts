import { expect, test } from "bun:test";
import { goalKey, goalProgress, learningPlan, parseGoalTarget, puzzleLocked, validJourneyEntry, withKnownPuzzle, type PersonalGoal } from "../src/client/lib/journey";
import { cases } from "../src/client/local/catalog";
import type { SolveDto } from "../src/shared/types";
import { METHODS } from "../src/shared/methods";
import methodIds from "../data/method-ids.json";

const goal: PersonalGoal = { kind: "time", puzzle: "333", solveMode: "standard", metric: "single", targetMs: 20000, createdAt: "2026-10-01T10:00:00.000Z" };
const solve = (n: number, ms: number, changes: Partial<SolveDto> = {}): SolveDto => ({ id: n, session_id: null, case_id: null, cube_size: 3, puzzle_id: "333", solve_mode: "standard", scramble_type: "normal", time_ms: ms, penalty: "none", scramble: "", created_at: new Date(Date.UTC(2026, 9, 1, 10, n)).toISOString(), ...changes });
const progress = (g: PersonalGoal, solves: SolveDto[]) => goalProgress(g, solves, new Set(), cases);

test("time targets are seconds, decimal commas or clock notation, with invalid input rejected", () => {
  expect(parseGoalTarget("20")).toBe(20000);
  expect(parseGoalTarget("15,250")).toBe(15250);
  expect(parseGoalTarget("1:30.5")).toBe(90500);
  for (const input of ["", "0", "-1", "NaN", "1e6", "86401", "20 seconds"]) expect(parseGoalTarget(input)).toBeNull();
});
test("single goals count penalties and exclude other puzzles, events, drills and partial scrambles", () => {
  const others = [solve(1, 1000, { puzzle_id: "222" }), solve(2, 1000, { solve_mode: "one-handed" }), solve(3, 1000, { case_id: "PLL Aa", scramble_type: "case" }), solve(4, 1000, { scramble_type: "cross1-3" }), solve(5, 1000, { penalty: "dnf" })];
  expect(progress(goal, others).value).toBeNull();
  expect(progress(goal, [...others, solve(6, 18000, { penalty: "+2" })])).toMatchObject({ value: 20000, complete: false });
  expect(progress(goal, [...others, solve(6, 17990, { penalty: "+2" })])).toMatchObject({ value: 19990, complete: true, ratio: 1 });
});
test("ao5 is chronological, trims the best and worst, permits one DNF and requires five solves", () => {
  const g = { ...goal, metric: "ao5" } as PersonalGoal;
  const rows = [solve(1, 10000), solve(2, 14000, { penalty: "+2" }), solve(3, 17000), solve(4, 18000), solve(5, 1, { penalty: "dnf" })];
  expect(progress(g, rows.slice(0, 4)).value).toBeNull();
  expect(progress(g, rows.toReversed())).toMatchObject({ value: 17000, complete: true });
  expect(progress(g, [...rows.slice(0, 3), solve(4, 1, { penalty: "dnf" }), rows[4]!]).value).toBeNull();
});
test("learning counts only the selected set, and puzzle completion uses the account's known puzzles", () => {
  const g: PersonalGoal = { kind: "learning", puzzle: "333", setId: "pll", createdAt: goal.createdAt };
  const pool = cases.filter(c => c.set === "pll");
  const learned = new Set([...pool.slice(0, 3).map(c => c.id), "OLL 1"]);
  expect(goalProgress(g, [], learned, cases)).toMatchObject({ value: 3, total: pool.length, complete: false });
  expect(goalProgress(g, [], new Set(pool.map(c => c.id)), cases)).toMatchObject({ complete: true, ratio: 1 });
  expect(goalProgress({ ...g, setId: null }, [], learned, cases)).toMatchObject({ value: 0, ratio: 0 });
  expect(goalProgress({ ...g, setId: null }, [], learned, cases, { kind: "profile", level: "beginner", priority: "333", knownPuzzles: ["333"], completedAt: goal.createdAt }).complete).toBe(true);
});
test("entries reject bad dates, foreign puzzle sets and deletion of the setup", () => {
  const key = goalKey();
  expect(validJourneyEntry(key, goal, cases)).toBe(true);
  expect(validJourneyEntry(key, { ...goal, dueDate: "2026-02-30" }, cases)).toBe(false);
  expect(validJourneyEntry(key, { ...goal, targetMs: 0 }, cases)).toBe(false);
  expect(validJourneyEntry(key, { ...goal, kind: "learning", puzzle: "222", setId: "pll" }, cases)).toBe(false);
  expect(validJourneyEntry("profile", null, cases)).toBe(false);
});
test("known and priority methods belong to their puzzle; the server registry matches the catalogue", () => {
  expect(methodIds as Record<string, string[]>).toEqual(Object.fromEntries(Object.entries(METHODS).map(([p, methods]) => [p, methods.map(m => m.id)])));
  const profile = { kind: "profile", level: "beginner", knownPuzzles: ["333"], knownMethods: { "333": ["cfop", "roux"] }, priority: "222", priorityMethod: "ortega", completedAt: goal.createdAt };
  expect(validJourneyEntry("profile", profile, cases)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, priorityMethod: "cfop" }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, knownMethods: { "222": ["ortega"] } }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, knownMethods: { "333": ["cfop", "cfop"] } }, cases)).toBe(false);
});

test("learning plans support several puzzles and methods, no selection and legacy single priorities", () => {
  const profile = { kind: "profile", level: "beginner", knownPuzzles: [], priority: "444", learningPuzzles: ["444", "222"], learningMethods: { "444": ["reduction", "yau"], "222": ["ortega"] }, completedAt: goal.createdAt };
  expect(validJourneyEntry("profile", profile, cases)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, learningPuzzles: ["444", "444"] }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, learningMethods: { "444": ["cfop"] } }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, learningMethods: { "444": ["yau", "yau"] } }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, learningMethods: { "333": ["cfop"] } }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, priority: null }, cases)).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, priority: null, learningPuzzles: [], learningMethods: {} }, cases)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, priority: null, learningPuzzles: [], learningMethods: {}, priorityMethod: "yau" }, cases)).toBe(false);
  expect(learningPlan({ kind: "profile", level: "beginner", knownPuzzles: [], priority: "222", priorityMethod: "ortega", completedAt: goal.createdAt })).toEqual({ puzzles: ["222"], methods: { "222": ["ortega"] } });
});

test("a puzzle stays locked until it can be solved, and a level is no longer required", () => {
  const profile = { kind: "profile" as const, knownPuzzles: ["333" as const], priority: null, completedAt: goal.createdAt };
  expect(validJourneyEntry("profile", profile, cases)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, level: "expert" }, cases)).toBe(false);
  expect(puzzleLocked(undefined, "444")).toBe(false);
  expect(puzzleLocked(profile, "333")).toBe(false);
  expect(puzzleLocked(profile, "444")).toBe(true);
  const unlocked = withKnownPuzzle(profile, "444", "reduction");
  expect(unlocked.knownPuzzles).toEqual(["333", "444"]);
  expect(unlocked.knownMethods).toEqual({ "444": ["reduction"] });
  expect(puzzleLocked(unlocked, "444")).toBe(false);
  expect(validJourneyEntry("profile", unlocked, cases)).toBe(true);
  // Skipping the tutorial adds the puzzle without a method; an unknown method is ignored.
  expect(withKnownPuzzle(profile, "222", "nope")).toEqual({ ...profile, knownPuzzles: ["333", "222"] });
});
