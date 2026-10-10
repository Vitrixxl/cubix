import { describe, expect, test } from "bun:test";
import { median, worstAverage } from "../src/client/lib/format";
import { averageFigure, cleanFigures, DEFAULT_FIGURES, figureLabel, figureRows, parseFigure, sessionFigures } from "../src/client/lib/practiceSummary";

const solves = (...times: (number | "dnf")[]) => times.map((t) => (t === "dnf" ? { time_ms: 9000, penalty: "dnf" as const } : { time_ms: t, penalty: "none" as const }));

describe("the timer's chosen figures", () => {
  test("names and parses singles and averages of any size", () => {
    expect(["best", "worst", "mean", "median", "count", "ao5", "ao50:best", "ao3:worst"].map(figureLabel)).toEqual(["Best", "Worst", "Mean", "Median", "Solves", "Ao5", "Best Ao50", "Worst Ao3"]);
    expect(parseFigure("ao2")).toBeNull();
    expect(parseFigure("ao1001")).toBeNull();
    expect(parseFigure("nope")).toBeNull();
    expect(averageFigure(100, "best")).toBe("ao100:best");
    expect(averageFigure(12, "current")).toBe("ao12");
  });

  test("keeps the valid ones, once each, and falls back to the defaults", () => {
    expect(cleanFigures(["median", "median", "ao2", "ao5"])).toEqual(["median", "ao5"]);
    expect(cleanFigures(undefined)).toEqual(DEFAULT_FIGURES);
  });

  test("computes each figure, a DNF counting as the slowest", () => {
    const figures = sessionFigures(solves(1000, 2000, 3000, 4000, 5000, 6000), ["median", "ao3", "ao3:best", "ao3:worst", "ao5", "count", "ao12"]);
    expect(figures.map(([label, value]) => [label, value])).toEqual([
      ["Median", "3.500"],
      ["Ao3", "5.000"],
      ["Best Ao3", "2.000"],
      ["Worst Ao3", "5.000"],
      ["Ao5", "4.000"],
      ["Solves", "6"],
      ["Ao12", "–"],
    ]);
    expect(sessionFigures(solves(1000, "dnf", "dnf"), ["ao3", "worst", "median"]).map(([, value]) => value)).toEqual(["DNF", "DNF", "DNF"]);
    expect(median([3, null, 1])).toBe(3);
    expect(worstAverage([1, 2, 3, null, null], 3)).toBe(Infinity);
  });
  test("lays the band out: one line up to 5, then two lines", () => {
    expect([0, 1, 4, 5, 6, 7, 8, 9].map((n) => figureRows(n))).toEqual([[], [1], [4], [5], [3, 3], [4, 3], [4, 4], [5, 4]]);
    // "Add" joins the figures' lines: 5 figures and it stay on one line, 7 make 4 + 4.
    expect([[4, 1], [5, 1], [6, 1], [7, 1]].map(([n, extra]) => figureRows(n!, extra))).toEqual([[5], [6], [4, 3], [4, 4]]);
  });
});
