import { expect, test } from "bun:test";
import { catalogSections, toggleSelection } from "../src/client/lib/practiceCatalog";
import { practiceSummary, trainingSessionRows } from "../src/client/lib/practiceSummary";
import { LaunchSessions } from "../src/client/lib/launchSessions";
import { PracticeTimer, HOLD_DELAY_MS } from "../src/client/lib/practiceTimer";
import { THEMES, buildTheme } from "../src/client/lib/theme";
import { theme as desktopTheme } from "../desktop/renderer/theme";

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

test("all desktop themes use the same palette as mobile in both color modes", () => {
  for (const { id } of THEMES) for (const mode of ["light", "dark"] as const) {
    const native = buildTheme(id, mode), css = desktopTheme(id, mode === "light");
    for (const token of ["bg", "surface", "surface2", "surface3", "text", "accent", "good", "danger"] as const)
      expect(css["--" + token]).toBe(native[token]);
    expect(css["--secondary"]).toBe(native.text2);
    expect(css["--muted"]).toBe(native.readableMuted);
    expect(css["--series"]).toBe(native.series2);
  }
});
