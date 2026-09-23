import { expect, test } from "bun:test";
import { cases } from "../src/client/local/catalog";
import { dailyAssignment, learningCases, learningKey, learningStatus, localDay } from "../src/client/lib/dailyLearning";
const pool = learningCases(cases, "PLL");
const empty = new Set<string>();
const today = "2026-09-23";
test("only core 3×3 CFOP sets are offered", () => {
  for (const [track, count] of [["F2L", 41], ["OLL", 57], ["PLL", 21]] as const) {
    const list = learningCases(cases, track);
    expect(list.length).toBe(count);
    expect(list.every(c => c.set === track.toLowerCase() && (c.puzzle_id ?? "333") === "333")).toBe(true);
  }
});
test("first unknown case is pinned through repetitions, restart and missed days", () => {
  const learned = new Set([pool[0]!.id]);
  const first = dailyAssignment(undefined, pool, learned, today)!;
  expect(first.caseId).toBe(pool[1]!.id);
  expect(dailyAssignment(first, pool, learned, today)).toBe(first);
  const restored = JSON.parse(JSON.stringify(first));
  expect(dailyAssignment(restored, pool, learned, "2026-10-15")).toEqual(first);
});
test("learning an overdue case waits until the day after completion", () => {
  const first = dailyAssignment(undefined, pool, empty, today)!;
  const learned = new Set([first.caseId]);
  const completed = dailyAssignment(first, pool, learned, "2026-09-27")!;
  expect(completed.completedOn).toBe("2026-09-27");
  expect(dailyAssignment(completed, pool, learned, "2026-09-27")).toBe(completed);
  expect(dailyAssignment(completed, pool, learned, "2026-09-28")?.caseId).toBe(pool[1]!.id);
  expect(learningStatus(pool, learned, completed)).toContain("next tomorrow");
});
test("undo reopens the pinned case and does not silently advance", () => {
  const first = dailyAssignment(undefined, pool, empty, today)!;
  const done = dailyAssignment(first, pool, new Set([first.caseId]), today)!;
  const undone = dailyAssignment(done, pool, empty, "2026-09-24")!;
  expect(undone).toEqual(first);
  expect(learningStatus(pool, empty, undone)).toContain("Algorithm of the day");
});
test("completed track remains reviewable and unknown catalogue IDs recover", () => {
  const all = new Set(pool.map(c => c.id));
  expect(dailyAssignment(undefined, pool, all, today)).toBeUndefined();
  expect(learningStatus(pool, all)).toBe("Track complete · 21/21 learned");
  const last = { caseId: pool.at(-1)!.id, assignedOn: today, completedOn: today };
  expect(dailyAssignment(last, pool, all, "2026-10-01")).toBe(last);
  expect(dailyAssignment({ caseId: "removed", assignedOn: today }, pool, empty, today)?.caseId).toBe(pool[0]!.id);
});
test("local calendar dates and account keys do not mix", () => {
  expect(localDay(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  expect(learningKey("alice")).not.toBe(learningKey("bob"));
});
