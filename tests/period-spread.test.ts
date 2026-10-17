import { expect, test } from "bun:test";
import { periodSpread } from "../src/client/lib/practiceSummary";

const history = (times: (number | null)[]) => times.map((time, i) => ({ time, at: new Date(2026, 0, 1 + i).toISOString() }));

test("the period's times fall in round buckets beside the solves before it", () => {
  // 10 solves around 20 s, then 10 around 15 s.
  const h = history([...Array.from({ length: 10 }, (_, i) => 20000 + i * 100), ...Array.from({ length: 10 }, (_, i) => 15000 + i * 100), null]);
  const spread = periodSpread(h, [10, 20]);
  expect(spread.beforeCount).toBe(10);
  expect(spread.width).toBe(500);
  expect(spread.now.reduce((a, b) => a + b)).toBe(10);
  expect(spread.before.reduce((a, b) => a + b)).toBe(10);
  // Every faster solve sits in an earlier bucket than every slower one.
  expect(spread.now.findLastIndex((n) => n > 0)).toBeLessThan(spread.before.findIndex((n) => n > 0));
  const mean = spread.figures.find((f) => f.id === "mean")!;
  expect(mean.now).toBeCloseTo(15450);
  expect(mean.before).toBeCloseTo(20450);
  expect(spread.figures.find((f) => f.id === "dnf")!.now).toBeCloseTo(1 / 11);
});

test("a period from the first solve has nothing before it", () => {
  const spread = periodSpread(history([12000, 13000, 12500]), [0, 2]);
  expect(spread.beforeCount).toBe(0);
  expect(spread.figures.every((f) => f.before == null)).toBe(true);
  expect(spread.now.reduce((a, b) => a + b)).toBe(3);
});

test("outliers fold into the end buckets", () => {
  const times = [...Array.from({ length: 98 }, (_, i) => 10000 + (i % 10) * 100), 90000, 1000];
  const spread = periodSpread(history(times), [0, 99]);
  expect(spread.now.length).toBeLessThanOrEqual(14);
  expect(spread.now.reduce((a, b) => a + b)).toBe(100);
});
