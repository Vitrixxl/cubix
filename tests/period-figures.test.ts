import { expect, test } from "bun:test";
import { rollingAverages } from "../src/client/lib/format";
import { periodFigures, singleRecords } from "../src/client/lib/practiceSummary";

const times = [15000, 14000, null, 16000, 12000, 13000, 11000, 14000];
const history = times.map((time, i) => ({ time, at: `2026-10-0${i + 1}T10:00:00Z` }));
const averages = { 5: rollingAverages(times, 5), 12: rollingAverages(times, 12), 100: rollingAverages(times, 100) };

test("the period's figures beside the latest ones and the records", () => {
  const rows = Object.fromEntries(periodFigures(history, averages, [0, 3]).map((r) => [r.id, r]));
  expect(Object.keys(rows)).toEqual(["single", "ao5", "ao12", "mean", "count", "dnf"]);
  expect(rows.single).toEqual({ id: "single", period: 14000, current: 14000, record: 11000, at: history[6]!.at });
  expect(rows.count).toMatchObject({ period: 4, record: 8 });
  expect(rows.dnf).toMatchObject({ period: 1, record: 1 });
  expect(rows.ao5!.period).toBeNull(); // No Ao5 ends inside the first four solves.
  expect(rows.ao5!.record).toBe(Math.min(...averages[5].filter((v) => v != null) as number[]));
});

test("blindfolded: the memo and the success rate lead", () => {
  const blind = history.map((v, i) => ({ ...v, memoMs: 5000 + i * 100 }));
  const rows = periodFigures(blind, averages, [4, 7]);
  expect(rows.slice(0, 2).map((r) => r.id)).toEqual(["memo", "success"]);
  expect(rows[0]).toMatchObject({ period: 5550, current: 5700, record: 5000 });
  expect(rows[1]).toMatchObject({ period: 1, record: 7 / 8 });
});

test("each beaten single, newest first, with what it took off", () => {
  expect(singleRecords(history)).toEqual([
    { index: 6, time: 11000, at: history[6]!.at, gain: 1000 },
    { index: 4, time: 12000, at: history[4]!.at, gain: 2000 },
    { index: 1, time: 14000, at: history[1]!.at, gain: 1000 },
    { index: 0, time: 15000, at: history[0]!.at, gain: null },
  ]);
});
