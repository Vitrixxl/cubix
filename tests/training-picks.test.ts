import { expect, test } from "bun:test";
import { recommend, trainingPool } from "../src/client/lib/trainingPicks";

const cases = [
  { id: "OLL 1", set: "oll" },
  { id: "OLL 2", set: "oll" },
  { id: "OLL 3", set: "oll" },
  { id: "T", set: "pll" },
  { id: "Y", set: "pll" },
  { id: "Ga", set: "pll" },
];

test("a session drills learned cases only: recommended, whole sets and hand-picked together, in catalogue order", () => {
  const learned = new Set(["OLL 1", "OLL 3", "T", "Ga"]);
  expect(trainingPool(cases, learned, { sets: ["oll"] })).toEqual(["OLL 1", "OLL 3"]);
  expect(trainingPool(cases, learned, { picks: ["Ga", "Y"], hand: ["OLL 2", "T"] })).toEqual(["T", "Ga"]);
  expect(trainingPool(cases, learned, { picks: ["Ga"], sets: ["oll"], hand: ["Ga"] })).toEqual(["OLL 1", "OLL 3", "Ga"]);
  // A set with nothing learned brings nothing.
  expect(trainingPool(cases, new Set(), { sets: ["oll", "pll"] })).toEqual([]);
});

const stat = (caseId: string, mean: number | null, count = 5) => ({ caseId, mean, count, lastAt: "2026-10-01T10:00:00Z" });

test("the learned cases slower than their set's usual, the slowest against it first", () => {
  const learned = new Set(cases.map((c) => c.id));
  const out = recommend(cases, learned, [stat("OLL 1", 1000), stat("OLL 2", 2000), stat("OLL 3", 3000), stat("T", 1000), stat("Y", 3000)], []);
  // OLL usual 2 s: OLL 3 is 1.5× it; PLL usual 2 s: Y is 1.5× it too; the faster ones are not recommended.
  expect(out.map((r) => r.id).sort()).toEqual(["OLL 3", "Y"]);
  expect(out[0]).toMatchObject({ source: "training", time: 3000, usual: 2000, count: 5 });
});

test("unlearned cases, too few attempts, DNF-only means and lone cases of a set are left out", () => {
  const learned = new Set(["OLL 1", "OLL 2", "OLL 3", "T"]);
  expect(recommend(cases, learned, [stat("OLL 1", 1000), stat("OLL 2", 9000, 2), stat("OLL 3", null), stat("T", 5000), stat("Y", 9000)], [])).toEqual([]);
});

test("cases slow in the smart cube solves come with their recognition; a case slow in both keeps its worse ratio", () => {
  const learned = new Set(cases.map((c) => c.id));
  const solves = [
    { id: "Ga", count: 4, duration: 4000, recognition: 1200 },
    { id: "T", count: 4, duration: 1000, recognition: 300 },
    { id: "Y", count: 4, duration: 1000, recognition: 300 },
  ];
  const out = recommend(cases, learned, [stat("T", 1000), stat("Y", 1500), stat("Ga", 1100)], solves);
  // Training: Y 1.5 s over a usual of 1.2 s (1.25×); solves: Ga 4 s over 2 s (2×).
  expect(out.map((r) => [r.id, r.source])).toEqual([["Ga", "solves"], ["Y", "training"]]);
  expect(out[0]).toMatchObject({ recognition: 1200, usual: 2000 });
  expect(recommend(cases, learned, [stat("T", 1000), stat("Y", 1500), stat("Ga", 1100)], solves, 1)).toHaveLength(1);
});
