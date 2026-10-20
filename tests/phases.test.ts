import { expect, test } from "bun:test";
import { cleanSplits, phaseCount, phaseMeans, phaseNames, phaseSpans, phaseTimes } from "../src/client/lib/phases";
import { PracticeTimer } from "../src/client/lib/practiceTimer";
import { readTimerExport } from "../src/client/lib/timerImport";
import { solvesCsv } from "../src/client/lib/exportData";

test("the phases setting: off, a method's steps or a number of them", () => {
  expect(["off", "cfop", "roux", "zz", "5", "9", "x"].map(phaseCount)).toEqual([1, 4, 4, 3, 5, 1, 1]);
  expect(phaseNames("cfop", 4)).toEqual(["Cross", "F2L", "OLL", "PLL"]);
  expect(phaseNames("zz", 3)).toEqual(["EOLine", "F2L", "LL"]);
  // A solve split otherwise than the setting: its phases numbered.
  expect(phaseNames("cfop", 3)).toEqual(["Phase 1", "Phase 2", "Phase 3"]);
});

test("each press of a running solve ends a phase, the last one stops the timer", () => {
  let now = 0;
  const stops: [number, number[] | undefined][] = [];
  const timer = new PracticeTimer({ canStart: () => true, phases: () => 4, now: () => now, onChange: () => {}, onStop: (ms, _, __, splits) => stops.push([ms, splits]) });
  timer.begin();
  for (const at of [1800, 7500, 9600]) {
    now = at;
    timer.press(at);
  }
  // One input heard twice acts once.
  timer.press(9600);
  expect(timer.snapshot).toMatchObject({ phase: "running", splits: [1800, 7500, 9600] });
  now = 11200;
  timer.press(11200);
  expect(stops).toEqual([[11200, [1800, 7500, 9600]]]);
  // The next solve starts with no splits.
  timer.begin();
  expect(timer.snapshot.splits).toBeUndefined();
});

test("splits kept with a solve, its phases' times, bar and means", () => {
  expect(cleanSplits([1800.4, 7500], 9000)).toEqual([1800, 7500]);
  for (const bad of [[], [7500, 1800], [9000], [0, 10], [1, 2, 3, 4, 5, 6, 7, 8], "1,2", null]) expect(cleanSplits(bad, 9000)).toBeUndefined();
  expect(phaseTimes([1800, 7500, 9600], 11200)).toEqual([1800, 5700, 2100, 1600]);
  const spans = phaseSpans([1800, 7500, 9600], 11200, "cfop");
  expect(spans.map((p) => [p.id, p.label, p.start, p.end])).toEqual([["cross", "Cross", 0, 1800], ["f2l2", "F2L", 1800, 7500], ["oll", "OLL", 7500, 9600], ["pll", "PLL", 9600, 11200]]);
  // Eight phases, eight colours.
  expect(new Set(phaseSpans([1, 2, 3, 4, 5, 6, 7], 8, "8").map((p) => p.id)).size).toBe(8);

  const solve = (splits: number[] | null, time_ms: number, penalty: "none" | "dnf" = "none") => ({ time_ms, penalty, splits });
  expect(phaseMeans([solve(null, 9000)], "cfop")).toBeNull();
  const means = phaseMeans([solve([1000, 2000], 4000), solve([3000, 4000], 6000), solve([1, 2], 3, "dnf"), solve([1000], 2000), solve(null, 5000), solve([2000, 3000], 5000)], "zz")!;
  // Split in 3 as the latest: the 2-phase solve, the DNF and the plain one left out.
  expect(means).toEqual([
    { label: "EOLine", mean: 2000, ao12: null },
    { label: "F2L", mean: 1000, ao12: null },
    { label: "LL", mean: 2000, ao12: null },
  ]);
  const twelve = Array.from({ length: 12 }, (_, i) => solve([1000 + i * 100], 5000));
  expect(phaseMeans(twelve, "2")![0]!.ao12).toBe(1550);
});

test("splits travel through csTimer's backups, Qbix's own export and the CSV", () => {
  const cstimer = { session1: [[[0, 11200, 9600, 7500, 1800], "R U", "", 1700000000]], properties: { sessionData: JSON.stringify({ 1: { name: "Main", opt: {} } }) } };
  expect(readTimerExport(JSON.stringify(cstimer)).solves[0]!.splits).toEqual([1800, 7500, 9600]);
  const qbix = { app: "Qbix", solves: [{ id: 1, session_id: null, case_id: null, puzzle_id: "333", solve_mode: "standard", time_ms: 11200, penalty: "none", scramble: "R", created_at: "2026-10-10T08:00:00.000Z", splits: [1800, 7500] }], sessions: [] };
  expect(readTimerExport(JSON.stringify(qbix)).solves[0]!.splits).toEqual([1800, 7500]);
  expect(solvesCsv([{ created_at: "2026-10-10", time_ms: 11200, penalty: "none", splits: [1800, 7500] }]).split("\n")[1]).toEndWith(",11.20,none,,,,1.80 5.70 3.70");
});
