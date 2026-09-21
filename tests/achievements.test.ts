import { expect, test } from "bun:test";
import { achievements } from "../src/client/lib/achievements";
import { cases } from "../src/client/local/catalog";
import type { SolveDto } from "../src/shared/types";

let next = 1;
const solve = (overrides: Partial<SolveDto> & { created_at: string }): SolveDto => ({ id: next++, session_id: null, case_id: null, time_ms: 20000, penalty: "none", scramble: null, puzzle_id: "333", cube_size: 3, solve_mode: "standard", scramble_type: "random-moves", ...overrides });
const at = (day: number, index = 0) => new Date(Date.UTC(2026, 0, day, 10, index)).toISOString();
const byId = (list: ReturnType<typeof achievements>["achievements"], id: string) => list.find(a => a.id === id)!;

test("an empty history unlocks nothing and lists every puzzle, learning set and general goal", () => {
  const summary = achievements([], []);
  expect(summary.unlocked).toBe(0);
  expect(summary.total).toBe(summary.achievements.length);
  expect(summary.achievements.filter(a => a.unlocked)).toEqual([]);
  expect(new Set(summary.achievements.map(a => a.group))).toEqual(new Set(["2×2", "3×3", "4×4", "5×5", "6×6", "7×7", "Square-1", "Pyraminx", "Skewb", "Megaminx", "Clock", "General"]));
  expect(summary.achievements.map(a => a.id).length).toBe(new Set(summary.achievements.map(a => a.id)).size);
  expect(byId(summary.achievements, "learn:pll")).toMatchObject({ target: 21, progress: 0, group: "3×3", category: "knowledge" });
  expect(byId(summary.achievements, "learn:2x2-pbl").group).toBe("2×2");
  // Reduced big cubes reuse the 3×3 sets, so they carry no duplicate learning goals.
  expect(summary.achievements.some(a => a.id === "learn:4x4-pll")).toBe(false);
  expect(byId(summary.achievements, "learn:4x4-parity").group).toBe("4×4");
  expect(byId(summary.achievements, "333:single:20").detail).toBe("No solve yet · goal 20.000");
});

test("learning every case of a set unlocks its mastery goal and counts towards the totals", () => {
  const pll = cases.filter(c => c.set === "pll").map(c => c.id);
  const partial = achievements([], pll.slice(0, 12));
  expect(byId(partial.achievements, "learn:pll")).toMatchObject({ progress: 12, unlocked: false, detail: "12 / 21 cases" });
  expect(byId(partial.achievements, "learn:total:10")).toMatchObject({ unlocked: true });
  const full = achievements([], pll);
  expect(byId(full.achievements, "learn:pll")).toMatchObject({ progress: 21, ratio: 1, unlocked: true });
  expect(byId(full.achievements, "learn:oll").unlocked).toBe(false);
});

test("time goals use full scrambles only, honour penalties and remember when they were first beaten", () => {
  const rows = [
    solve({ time_ms: 25000, created_at: at(1) }),
    solve({ time_ms: 19000, penalty: "+2", created_at: at(2) }),
    solve({ time_ms: 14000, penalty: "dnf", created_at: at(3) }),
    solve({ time_ms: 9000, scramble_type: "2gen-ru", created_at: at(4) }),
    solve({ time_ms: 19500, created_at: at(5) }),
    solve({ time_ms: 18000, created_at: at(6) }),
  ];
  const list = achievements(rows, []).achievements;
  expect(byId(list, "333:single:30")).toMatchObject({ unlocked: true, unlockedAt: at(1) });
  expect(byId(list, "333:single:20")).toMatchObject({ unlocked: true, unlockedAt: at(5), progress: 18000, detail: "Best 18.000 · goal 20.000" });
  expect(byId(list, "333:single:15").unlocked).toBe(false);
  expect(byId(list, "333:single:15").ratio).toBeCloseTo(15000 / 18000);
  expect(byId(list, "333:solves:1")).toMatchObject({ unlocked: true, unlockedAt: at(1), detail: "6 / 1 solves" });
  expect(byId(list, "222:solves:1").unlocked).toBe(false);
});

test("averages, one-handed and blindfolded goals each read their own history", () => {
  const rows = [
    ...[21000, 22000, 23000, 24000, 25000].map((time_ms, i) => solve({ time_ms, created_at: at(1, i) })),
    ...[19000, 18000, 20000, 17000, 30000].map((time_ms, i) => solve({ time_ms, created_at: at(2, i) })),
    solve({ time_ms: 40000, solve_mode: "one-handed", created_at: at(3) }),
    solve({ time_ms: 100000, solve_mode: "blindfolded", penalty: "dnf", created_at: at(4) }),
    solve({ time_ms: 100000, solve_mode: "blindfolded", created_at: at(5) }),
  ];
  const list = achievements(rows, []).achievements;
  expect(byId(list, "333:ao5:25")).toMatchObject({ unlocked: true, unlockedAt: at(1, 4) });
  expect(byId(list, "333:ao5:20")).toMatchObject({ unlocked: true, unlockedAt: at(2, 3) });
  expect(byId(list, "333:ao5:15").unlocked).toBe(false);
  expect(byId(list, "333:oh:45")).toMatchObject({ unlocked: true, unlockedAt: at(3) });
  expect(byId(list, "333:oh:30").unlocked).toBe(false);
  expect(byId(list, "333:bld:first")).toMatchObject({ unlocked: true, unlockedAt: at(5) });
  expect(byId(list, "333:bld:120")).toMatchObject({ unlocked: true, unlockedAt: at(5) });
  expect(byId(list, "333:bld:60").unlocked).toBe(false);
});

test("volume, active days and streaks count every puzzle and mode", () => {
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => solve({ puzzle_id: "pyram", cube_size: null, scramble_type: "competition", time_ms: 5000, created_at: at(1 + i) })),
    ...Array.from({ length: 4 }, (_, i) => solve({ case_id: "PLL Aa", scramble_type: "case", time_ms: 1500, created_at: at(20 + i * 2) })),
  ];
  const list = achievements(rows, []).achievements;
  expect(byId(list, "pyram:solves:10")).toMatchObject({ unlocked: true, unlockedAt: at(10) });
  expect(byId(list, "pyram:single:6")).toMatchObject({ unlocked: true, unlockedAt: at(1) });
  expect(byId(list, "333:solves:1").unlocked).toBe(false);
  expect(byId(list, "training:10")).toMatchObject({ unlocked: false, detail: "4 / 10 drills" });
  expect(byId(list, "total:100").progress).toBe(16);
  expect(byId(list, "days:7")).toMatchObject({ unlocked: true, unlockedAt: at(7) });
  expect(byId(list, "days:30")).toMatchObject({ unlocked: false, progress: 16 });
  expect(byId(list, "streak:7")).toMatchObject({ unlocked: true, unlockedAt: at(7) });
  expect(byId(list, "streak:30")).toMatchObject({ unlocked: false, detail: "12 / 30 days" });
});
