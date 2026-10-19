import { expect, test } from "bun:test";
import { dayKey, heatDays, journalDays, streaks, weeklyBestAo5 } from "../src/client/lib/profile";

test("journal days carry their best, their Ao5 and the records beaten with their gain", () => {
  const at = (day: number, h: number) => new Date(2026, 9, day, h).toISOString();
  const history = [
    { at: at(1, 9), time: 12 },
    { at: at(1, 10), time: 11 },
    { at: at(2, 9), time: 11.5 },
    { at: at(3, 9), time: 10 },
    { at: at(3, 10), time: 9.5 },
  ];
  const ao5 = [null, null, null, null, 10.8];
  const activity = [...history.map((v) => ({ at: v.at, time: v.time, timer: true })), { at: at(2, 11), time: null, timer: false }];
  const days = journalDays(activity, history, ao5);
  expect(days.map((d) => [d.date.getDate(), d.count, d.best, d.ao5])).toEqual([[3, 2, 9.5, 10.8], [2, 2, 11.5, null], [1, 2, 11, null]]);
  expect(days[0]!.records).toEqual([{ kind: "single", time: 9.5, gain: 1.5 }, { kind: "ao5", time: 10.8, gain: null }]);
  expect(days[1]!.records).toEqual([]);
  expect(days[2]!.records).toEqual([{ kind: "single", time: 11, gain: null }]);
});

test("weekly best Ao5 counts back from this Monday", () => {
  const today = new Date(2026, 9, 10), // a Saturday; its week starts on the 5th
    history = [{ at: new Date(2026, 9, 6).toISOString(), time: 0 }, { at: new Date(2026, 9, 2).toISOString(), time: 0 }, { at: new Date(2026, 9, 7).toISOString(), time: 0 }];
  const weeks = weeklyBestAo5(history, [12, 13, 11.5], 3, today);
  expect(weeks.map((w) => [w.start.getDate(), w.best])).toEqual([[21, null], [28, 13], [5, 11.5]]);
});

test("solves fall on their local day, in any order", () => {
  const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
  const solves = [at(1, 0), at(1, 23, 59), at(2, 0), at(1, 12), at(3, 23, 59), at(5, 8)].map((v) => ({ at: v, time: 1000, timer: true }));
  const days = heatDays(solves);
  expect([...days].map(([key, d]) => [key, d.count])).toEqual([["2026-10-01", 3], ["2026-10-02", 1], ["2026-10-03", 1], ["2026-10-05", 1]]);
  expect([...days.keys()]).toEqual([...new Set(solves.map((v) => dayKey(new Date(v.at))))]);
  expect(streaks(solves).longest).toBe(3);
});
