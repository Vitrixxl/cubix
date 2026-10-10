import { expect, test } from "bun:test";
import { journalDays, weeklyBestAo5 } from "../src/client/lib/profile";

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
