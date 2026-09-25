import { expect, test } from "bun:test";
import { cases } from "../src/client/local/catalog";
import { orderedGroups, moveLearningGroup, EMPTY_LEARNING_PLAN, reviewCases, trainingModeOptions, learningModeForPuzzle, dailyAssignment, learningCases, learningKey, learningStatus, localDay } from "../src/client/lib/dailyLearning";
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
test("marking learned advances immediately and skips other learned cases", () => {
  const first = dailyAssignment(undefined, pool, empty, today)!;
  const learned = new Set([first.caseId, pool[1]!.id]);
  const next = dailyAssignment(first, pool, learned, today)!;
  expect(next).toEqual({ caseId: pool[2]!.id, assignedOn: today });
  expect(dailyAssignment(next, pool, learned, today)).toBe(next);
  learned.add(next.caseId);
  expect(dailyAssignment(next, pool, learned, today)?.caseId).toBe(pool[3]!.id);
  expect(learningStatus(pool, learned)).toBe("Algorithm to learn · 3/21 learned");
});
test("saved completed cases advance regardless of the completion date", () => {
  for (const completedOn of [undefined, "2026-09-22", today, "2026-09-27"]) {
    const saved = { caseId: pool[0]!.id, assignedOn: "2026-09-20", completedOn };
    expect(dailyAssignment(saved, pool, new Set([saved.caseId]), today))
      .toEqual({ caseId: pool[1]!.id, assignedOn: today });
    expect(dailyAssignment(saved, pool, empty, today))
      .toEqual({ caseId: saved.caseId, assignedOn: saved.assignedOn });
  }
});
test("completed track has no assignment and unknown catalogue IDs recover", () => {
  const all = new Set(pool.map(c => c.id));
  expect(dailyAssignment(undefined, pool, all, today)).toBeUndefined();
  expect(learningStatus(pool, all)).toBe("Track complete · 21/21 learned");
  const last = { caseId: pool.at(-1)!.id, assignedOn: today, completedOn: today };
  expect(dailyAssignment(last, pool, all, today)).toBeUndefined();
  all.delete(last.caseId);
  expect(dailyAssignment(undefined, pool, all, today)?.caseId).toBe(last.caseId);
  expect(dailyAssignment({ caseId: "removed", assignedOn: today }, pool, empty, today)?.caseId).toBe(pool[0]!.id);
});
test("local calendar dates and account keys do not mix", () => {
  expect(localDay(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  expect(learningKey("alice")).not.toBe(learningKey("bob"));
});

test("global review includes all learned stages and excludes other puzzles and unknown cases", () => {
  const known = ["F2L 1", "OLL 1", "PLL Aa"];
  const other = cases.find(c => (c.puzzle_id === "222" || c.cube_size === 2))!;
  const learned = new Set([...known, other.id, "missing"]);
  expect(reviewCases(cases, learned, "333").map(c => c.id).sort()).toEqual([...known].sort());
  learned.delete("OLL 1");
  expect(reviewCases(cases, learned, "333").map(c => c.id)).not.toContain("OLL 1");
  expect(reviewCases(cases, learned, "222").map(c => c.id)).toEqual([other.id]);
  expect(reviewCases(cases, new Set(), "333")).toEqual([]);
  expect(learningModeForPuzzle("review", "222")).toBe("review");
  expect(learningModeForPuzzle("PLL", "222")).toBe("practice");
  expect(trainingModeOptions("222").map(o => o.value)).toEqual(["practice", "review"]);
});

test("group priority normalizes saved groups and schedules unlearned cases without replacing today's case", () => {
  const order = ["Edges Only", "missing", "Edges Only"];
  const sorted = learningCases(cases, "PLL", order);
  expect(orderedGroups(pool, order)).toEqual(["Edges Only", "Adjacent Corner Swap", "Diagonal Corner Swap"]);
  expect(sorted.length).toBe(pool.length);
  expect(sorted[0]!.group).toBe("Edges Only");
  const pinned = dailyAssignment(undefined, pool, empty, today)!;
  expect(dailyAssignment(pinned, sorted, empty, "2026-09-24")).toBe(pinned);
  const done = dailyAssignment(pinned, sorted, new Set([pinned.caseId]), today)!;
  expect(done.caseId).toBe(sorted[0]!.id);
  expect(dailyAssignment(done, sorted, new Set([pinned.caseId]), today)).toBe(done);
  expect(dailyAssignment(done, sorted, new Set([pinned.caseId]), "2026-09-24")?.caseId).toBe(sorted[0]!.id);
  const learned = new Set(sorted.filter(c => c.group === "Edges Only").map(c => c.id));
  expect(dailyAssignment(undefined, sorted, learned, today)?.caseId).toBe(pool[0]!.id);
  const plan = moveLearningGroup(EMPTY_LEARNING_PLAN, "PLL", cases, 2, -1);
  expect(plan.groupOrder?.PLL).toEqual(["Adjacent Corner Swap", "Edges Only", "Diagonal Corner Swap"]);
  expect(plan.groupOrder?.OLL).toBeUndefined();
  expect(moveLearningGroup(plan, "PLL", cases, 0, -1)).toBe(plan);
});
