import { describe, expect, test } from "bun:test";
import { catalogSections, toggleSelection } from "../src/client/lib/practiceCatalog";
import { practiceSummary, trainingSessionRows } from "../src/client/lib/practiceSummary";
import { LaunchSessions } from "../src/client/lib/launchSessions";
import { PracticeTimer, HOLD_DELAY_MS } from "../src/client/lib/practiceTimer";
import { THEMES, buildTheme, luminance, themeTokens } from "../src/client/lib/theme";

const cases = [
  { id: "a", set: "full", group: "one" }, { id: "b", set: "full", group: "two" },
  { id: "c", set: "basic", group: "one" }, { id: "d", set: "pll", group: "one" },
];
const sets = [
  { id: "full", stage: "OLL" as const }, { id: "basic", stage: "OLL" as const },
  { id: "pll", stage: "PLL" as const },
];

test("catalog variants stay within their stage; learned filters preserve counts and catalog order", () => {
  const sections = catalogSections(cases, sets, { OLL: "pll" }, new Set(["a", "d"]), "not-learned");
  expect(sections.map(s => s.active.id)).toEqual(["full", "pll"]);
  expect(sections[0].learnedCount).toBe(1);
  expect(sections[0].all).toEqual(cases.slice(0, 2));
  expect(sections[0].groups).toEqual([["two", [cases[1]]]]);
  expect(sections[1].groups).toEqual([]);
  expect(catalogSections(cases, sets, { OLL: "basic" }, new Set(), "all")[0].all).toEqual([cases[2]]);
});

test("partial group selection adds missing cases, then removes the group and preserves other sets", () => {
  const original = new Set(["a", "d"]);
  const full = toggleSelection(original, ["a", "b"]);
  expect([...full]).toEqual(["a", "d", "b"]);
  expect([...toggleSelection(full, ["a", "b"])]).toEqual(["d"]);
  expect([...original]).toEqual(["a", "d"]);
  expect(toggleSelection(original, [])).toEqual(original);
});

const solve = (time_ms: number, penalty: "none" | "+2" | "dnf" = "none", case_id: string | null = "a") => ({ time_ms, penalty, case_id });
test("rolling session metrics retain DNF attempts and apply penalties before trimming", () => {
  const solves = [solve(999999), solve(1000), solve(1000, "+2"), solve(4000), solve(5000), solve(1, "dnf")];
  const result = practiceSummary(solves);
  expect(result.count).toBe(6);
  expect(result.validCount).toBe(5);
  expect(result.best).toBe(1000);
  expect(result.ao5).toBe(4000);
  expect(result.ao12).toBeNull();
  expect(practiceSummary([...solves, solve(1, "dnf")]).ao5).toBeNull();
  expect(practiceSummary([]).mean).toBeNull();
});

test("training rows retain unpractised cases, stable ties and solve chronology", () => {
  const attempts = [solve(10), solve(20, "dnf", "b"), solve(30, "+2", "a"), solve(5, "none", null)];
  const rows = trainingSessionRows(cases, attempts);
  expect(rows.map(r => r.c.id)).toEqual(["a", "b", "c", "d"]);
  expect(rows[0].solves).toEqual([attempts[0], attempts[2]]);
  expect(rows[0].best).toBe(10);
  expect(rows[1].validCount).toBe(0);
  expect(rows[2].count).toBe(0);
});

test("launch sessions deduplicate creation and isolate account/context keys", async () => {
  const sessions = new LaunchSessions();
  let calls = 0;
  const create = async () => ({ id: ++calls });
  expect(await Promise.all([sessions.ensure("guest:333", create), sessions.ensure("guest:333", create)])).toEqual([1, 1]);
  expect(await sessions.ensure("guest:333", create)).toBe(1);
  expect(await sessions.ensure("account:333", create)).toBe(2);
  expect(await sessions.ensure("guest:222", create)).toBe(3);
});

test("failed session creation retries; clearing during creation cannot restore stale sessions", async () => {
  const sessions = new LaunchSessions();
  await expect(sessions.ensure("key", async () => { throw Error("offline"); })).rejects.toThrow("offline");
  let resolve!: (session: { id: number }) => void;
  const pending = sessions.ensure("key", () => new Promise(r => { resolve = r; }));
  await Promise.resolve();
  sessions.clear();
  expect(await sessions.ensure("key", async () => ({ id: 2 }))).toBe(2);
  resolve({ id: 1 });
  expect(await pending).toBe(1);
  expect(sessions.get("key")).toBe(2);
});

test("timer reset cancels delayed readiness and a stopped solve is saved only once", async () => {
  let now = 0, allowed = true;
  const saved: number[] = [];
  const timer = new PracticeTimer({ canStart: () => allowed, now: () => now, onChange: () => {}, onStop: ms => { saved.push(ms); allowed = false; } });
  try {
    timer.press(); timer.reset();
    await Bun.sleep(HOLD_DELAY_MS + 20);
    expect(timer.snapshot.phase).toBe("idle");
    timer.press();
    await Bun.sleep(HOLD_DELAY_MS + 20);
    timer.release();
    now = 1234.5;
    timer.cancelArming();
    expect(timer.snapshot.phase).toBe("running");
    timer.press(); timer.press(); timer.release();
    expect(saved).toEqual([1234.5]);
    expect(timer.snapshot.elapsed).toBe(1234.5);
  } finally { timer.dispose(); }
});

test("a solve is timed by its inputs' own time stamps, a busy page delaying neither end", async () => {
  let now = 0;
  const saved: number[] = [];
  const timer = new PracticeTimer({ canStart: () => true, now: () => now, onChange: () => {}, onStop: ms => saved.push(ms) });
  try {
    timer.press();
    await Bun.sleep(HOLD_DELAY_MS + 20);
    now = 1000;
    timer.release(900);
    expect(timer.snapshot.startedAt).toBe(900);
    now = 5000;
    timer.press(4200);
    expect(saved).toEqual([3300]);
    // A stamp of another clock (later than now, or none) falls back to now.
    timer.press();
    await Bun.sleep(HOLD_DELAY_MS + 20);
    timer.release(Date.now());
    expect(timer.snapshot.startedAt).toBe(5000);
  } finally { timer.dispose(); }
});

test("the web and the phone app take every theme's colours from the same tokens", () => {
  for (const { id } of THEMES) for (const mode of ["light", "dark"] as const) {
    const css = themeTokens(id, mode), native = themeTokens(id, mode, "rgb"), palette = buildTheme(id, mode);
    expect(Object.keys(native).sort()).toEqual(Object.keys(css).sort());
    for (const tokens of [css, native]) {
      expect(tokens.primary).toBe(palette.accent);
      expect(tokens["chart-2"]).toBe(palette.series2);
    }
  }
});

describe("a timer started and stopped by a smart cube", () => {
  test("begins without holding and finishes with the cube's time", () => {
    const stops: number[] = [];
    const timer = new PracticeTimer({ canStart: () => true, onChange: () => {}, onStop: (ms) => stops.push(ms), now: () => 1000 });
    expect(timer.begin()).toBe(true);
    expect(timer.snapshot.phase).toBe("running");
    expect(timer.begin()).toBe(false);
    timer.finish(12345);
    expect(timer.snapshot).toMatchObject({ phase: "stopped", elapsed: 12345 });
    expect(stops).toEqual([12345]);
    timer.finish(1);
    expect(stops).toHaveLength(1);
  });
  test("does not begin when it cannot start", () => {
    const timer = new PracticeTimer({ canStart: () => false, onChange: () => {}, onStop: () => {} });
    expect(timer.begin()).toBe(false);
  });
});

describe("a WCA inspection before the solve", () => {
  const started = async (startAt: number) => {
    let now = 0;
    const stops: [number, string][] = [];
    const timer = new PracticeTimer({ canStart: () => true, inspection: () => true, now: () => now, onChange: () => {}, onStop: (ms, penalty) => stops.push([ms, penalty]) });
    try {
      timer.press();
      expect(timer.snapshot.phase).toBe("inspecting");
      timer.release();
      expect(timer.snapshot.phase).toBe("inspecting");
      // A hold let go too soon goes back to the inspection, not to rest.
      timer.press(); timer.release();
      expect(timer.snapshot.phase).toBe("inspecting");
      timer.press();
      await Bun.sleep(HOLD_DELAY_MS + 20);
      now = startAt;
      timer.release();
      now = startAt + 9000;
      timer.press();
      return stops;
    } finally { timer.dispose(); }
  };
  test("no penalty within 15 seconds, +2 until 17, DNF after", async () => {
    expect(await started(15000)).toEqual([[9000, "none"]]);
    expect(await started(16500)).toEqual([[9000, "+2"]]);
    expect(await started(17001)).toEqual([[9000, "dnf"]]);
  });
  test("a smart cube or a Stackmat starting during the inspection gets its penalty too", () => {
    let now = 0;
    const stops: string[] = [];
    const timer = new PracticeTimer({ canStart: () => true, inspection: () => true, now: () => now, onChange: () => {}, onStop: (_, penalty) => stops.push(penalty) });
    timer.press();
    now = 16000;
    timer.begin();
    timer.finish(5000);
    expect(stops).toEqual(["+2"]);
    // The next solve begins with no inspection left over.
    timer.begin();
    timer.finish(5000);
    expect(stops).toEqual(["+2", "none"]);
  });
});

test("blindfolded: the first press ends the memorisation, the second stops; one input heard twice acts once", () => {
  let now = 0;
  const stops: [number, number | undefined][] = [];
  const timer = new PracticeTimer({ canStart: () => true, memo: () => true, now: () => now, onChange: () => {}, onStop: (ms, _, memo) => stops.push([ms, memo]) });
  timer.begin();
  now = 30000;
  timer.press(30000);
  timer.press(30000);
  expect(timer.snapshot).toMatchObject({ phase: "running", memo: 30000 });
  now = 75000;
  timer.press(75000);
  expect(stops).toEqual([[75000, 30000]]);
});

test("every theme tints the surfaces and keeps its inks readable", () => {
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  const backgrounds = new Set<string>();
  for (const { id } of THEMES) for (const mode of ["light", "dark"] as const) {
    const t = themeTokens(id, mode);
    backgrounds.add(t.background!);
    const inks = mode === "light" ? ["foreground", "muted-foreground", "faint", "destructive", "success", "warning"] : ["foreground", "muted-foreground"];
    for (const surface of ["background", "card", "muted", "popover"]) for (const ink of inks)
      expect(contrast(t[ink]!, t[surface]!), `${id} ${mode} ${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    if (mode === "light") for (const surface of ["background", "card"]) expect(contrast(t.edge!, t[surface]!), `${id} edge on ${surface}`).toBeGreaterThanOrEqual(3);
  }
  expect(backgrounds.size).toBe(THEMES.length * 2);
});
