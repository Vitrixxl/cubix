import { expect, test } from "bun:test";
import { caseDue, dueCases, nextRecognition, recognitionCases, recognitionTurn, recommend, trainingPool } from "../src/client/lib/trainingPicks";
import { algScene } from "../src/client/lib/algPlayer";
import { caseWithAuf } from "../src/client/lib/caseState";
import { AUFS, applyAlg, invertAlg, solved } from "../src/shared/cube";
import { GREY } from "../src/shared/cubeAppearance";

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

test("nothing recommended nor picked by hand: a session drills every learned case", () => {
  const learned = new Set(["T", "Y", "Ga"]);
  expect(trainingPool(cases, learned, {})).toEqual(["T", "Y", "Ga"]);
  // Picks and hand-picked cases not learned count as nothing picked.
  expect(trainingPool(cases, learned, { picks: ["OLL 1"], hand: ["OLL 2"] })).toEqual(["T", "Y", "Ga"]);
  // A learned case picked by hand drills alone.
  expect(trainingPool(cases, learned, { hand: ["Y"] })).toEqual(["Y"]);
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

test("a recognition run draws the learned cases of its set at random, never the same twice in a row", () => {
  const learned = new Set(["OLL 1", "OLL 3", "T", "Y", "Ga"]);
  const ids = recognitionCases(cases, learned, "pll");
  expect(ids).toEqual(["T", "Y", "Ga"]);
  expect(nextRecognition(ids, undefined, () => 0)).toBe("T");
  expect(nextRecognition(ids, "T", () => 0)).toBe("Y");
  expect(nextRecognition(ids, "Ga", () => 0.99)).toBe("Y");
  expect(nextRecognition(["T"], "T")).toBe("T");
  expect(nextRecognition(recognitionCases(cases, new Set(), "oll"), undefined)).toBeUndefined();
});

test("a recognition's case shows other colours with each AUF and way it is held, its algorithm still solving it", () => {
  const alg = "R U R' U' R' F R2 U' R' U' R U R' F'",
    t = { setup: invertAlg(alg), algorithms: [{ alg }] },
    seen = new Set<string>(),
    fronts = new Set<number>();
  for (const auf of AUFS)
    for (let turn = 0; turn < 4; turn++) {
      const { setup, algorithm } = caseWithAuf(t, auf, true),
        scene = algScene(algorithm, 3, "full", setup, turn)!,
        shown = (state: number[]) => state.map((origin) => scene.colors[origin]!);
      seen.add(shown(scene.states[0]!).join());
      fronts.add(shown(scene.states[0]!)[22]!); // the front centre
      // Played from where it is shown, the algorithm solves it: every face one colour.
      const end = shown(scene.states.at(-1)!);
      for (let face = 0; face < 6; face++) expect(new Set(end.slice(face * 9, face * 9 + 9)).size).toBe(1);
      expect(Array.from(applyAlg(solved(), setup + " " + algorithm))).toEqual(Array.from(solved()));
    }
  expect(seen.size).toBe(16);
  expect(fronts.size).toBe(4);
  // Its centres show on a last layer's mask too, in the colours it is held with.
  expect(new Set([0, 1, 2, 3].map((turn) => { const scene = algScene("", 3, "PLL", t.setup, turn)!; return scene.colors[scene.states[0]![22]!]; }))).toEqual(fronts);
  // A mask greys the same stickers however the cube is held.
  const grey = (turn: number) => algScene("", 3, "F2L", t.setup, turn)!.colors.map((c) => c === GREY).join();
  expect(grey(1)).toBe(grey(0));
  // Each way of holding it comes up.
  expect(new Set([0, 0.3, 0.6, 0.9].map((n) => recognitionTurn(() => n)))).toEqual(new Set([0, 1, 2, 3]));
});

test("a case comes back later each time it is done well when due, at once when done badly", () => {
  const at = (day: number, hour = 12) => new Date(2026, 0, day, hour).toISOString();
  const midnight = (day: number) => new Date(2026, 0, day).toISOString();
  expect(caseDue([])).toBe(new Date(0).toISOString());
  expect(caseDue([{ time: 2000, at: at(1) }])).toBe(midnight(2));
  // Done well again before it is due: nothing moves.
  expect(caseDue([{ time: 2000, at: at(1) }, { time: 1500, at: at(1, 18) }])).toBe(midnight(2));
  expect(caseDue([{ time: 2000, at: at(1) }, { time: 2000, at: at(2) }])).toBe(midnight(5));
  expect(caseDue([{ time: 2000, at: at(1) }, { time: 2000, at: at(2) }, { time: 2000, at: at(5) }])).toBe(midnight(12));
  // A DNF, or much slower than its pace, when due: from the first box, due at once, then a day once done well.
  expect(caseDue([{ time: 2000, at: at(1) }, { time: null, at: at(2) }])).toBe(at(2));
  expect(caseDue([{ time: 2000, at: at(1) }, { time: 3000, at: at(2) }])).toBe(at(2));
  expect(caseDue([{ time: 2000, at: at(1) }, { time: 3000, at: at(2) }, { time: 2000, at: at(2, 13) }])).toBe(midnight(3));
});

test("the cases due are the learned ones never trained or due by now", () => {
  const cases = [{ id: "a", set: "pll" }, { id: "b", set: "pll" }, { id: "c", set: "pll" }, { id: "d", set: "pll" }];
  const now = Date.parse("2026-01-10T12:00:00Z");
  const stats = [{ caseId: "a", dueAt: "2026-01-09T00:00:00Z" }, { caseId: "b", dueAt: "2026-01-11T00:00:00Z" }];
  expect(dueCases(cases, new Set(["a", "b", "c"]), stats, now)).toEqual(["a", "c"]);
});
