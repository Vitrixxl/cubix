import { expect, test } from "bun:test";
import { METHODS } from "../src/shared/methods";
import { PUZZLES } from "../src/shared/puzzles";
import { applyAlg, colorOf, cubeSize, faceOfSlot, slotsFor, solved, type CubeState } from "../src/shared/cube";
import { isoCells, topLayerCells, viewForMask } from "../src/shared/cubeDiagram";
import { stepPicture } from "../src/client/lib/course";

type Where = (p: readonly number[], h: number) => boolean;
const extremes = (p: readonly number[], h: number) => p.filter(v => Math.abs(v) === h).length;
const isEdge: Where = (p, h) => extremes(p, h) === 2;
/** Every sticker where `where` holds shows the colour of its own face. */
const solvedWhere = (state: CubeState, where: Where) => {
  const n = cubeSize(state), h = (n - 1) / 2;
  return slotsFor(n).every((g, s) => !where(g.p, h) || colorOf(state, s) === faceOfSlot(s, n));
};
const faceIs = (state: CubeState, face: "U" | "D", skip: Where = () => false) => {
  const n = cubeSize(state), h = (n - 1) / 2;
  return slotsFor(n).every((g, s) => g.face !== face || skip(g.p, h) || colorOf(state, s) === face);
};
const centres = (faces = "UDFBRL") => (state: CubeState) => {
  const n = cubeSize(state), h = (n - 1) / 2;
  return slotsFor(n).every((g, s) => extremes(g.p, h) !== 1 || !faces.includes(g.face) || colorOf(state, s) === faceOfSlot(s, n));
};
/** Each edge of a big cube in one bar: the stickers along an edge show one colour on each of its two faces. */
function paired(state: CubeState) {
  const n = cubeSize(state), h = (n - 1) / 2, bars = new Map<string, Set<string>>();
  slotsFor(n).forEach((g, s) => {
    if (!isEdge(g.p, h)) return;
    const key = g.p.map(v => (Math.abs(v) === h ? v : "*")).join() + "|" + g.n.join();
    (bars.get(key) ?? bars.set(key, new Set()).get(key)!).add(colorOf(state, s));
  });
  return [...bars.values()].every(colours => colours.size === 1);
}
/** ZZ's edge orientation: an edge's U/D sticker (else its F/B one) faces U or D, or F or B for an edge of the middle layer. */
function edgesOriented(state: CubeState) {
  const slots = slotsFor(3), pieces = new Map<string, number[]>();
  slots.forEach((g, s) => isEdge(g.p, 1) && (pieces.get(g.p.join()) ?? pieces.set(g.p.join(), []).get(g.p.join())!).push(s));
  return [...pieces.values()].every(([a, b]) => {
    const key = [colorOf(state, a!), colorOf(state, b!)].some(c => c === "U" || c === "D") ? "UD" : "FB";
    const g = slots[key.includes(colorOf(state, a!)) ? a! : b!]!;
    return g.p[1] === 0 ? g.n[2] !== 0 : g.n[1] !== 0;
  });
}
const cross = (state: CubeState) => solvedWhere(state, (p, h) => p[1] === -h && isEdge(p, h)) && centres()(state);

/** What a step has done to the cube, by name. */
const GOALS: Record<string, (state: CubeState) => boolean> = {
  cross,
  // The beginner's cross pictured turned over (z2), white on top.
  "cross shown up": s => cross(applyAlg(s, "z2")),
  "first layer": s => solvedWhere(s, (p, h) => p[1] === -h),
  "first face": s => faceIs(s, "D"),
  f2l: s => solvedWhere(s, (p, h) => p[1] < h),
  "yellow cross": s => faceIs(s, "U", (p, h) => extremes(p, h) === 3),
  oll: s => faceIs(s, "U"),
  "first block": s => solvedWhere(s, (p, h) => p[0] === -h && p[1] < h),
  "second block": s => solvedWhere(s, (p, h) => Math.abs(p[0]!) === h && p[1] < h),
  cmll: s => solvedWhere(s, (p, h) => p[1] === h && extremes(p, h) === 3),
  eoline: s => edgesOriented(s) && solvedWhere(s, (p, h) => p[0] === 0 && p[1] === -h),
  centres: centres(),
  "two centres": centres("UD"),
  "three cross edges": s => [(p: readonly number[], h: number) => p[2] === h, (p: readonly number[], h: number) => p[0] === h, (p: readonly number[], h: number) => p[2] === -h, (p: readonly number[], h: number) => p[0] === -h]
    .filter(at => solvedWhere(s, (p, h) => p[1] === -h && isEdge(p, h) && at(p, h))).length >= 3,
  paired: s => paired(s) && centres()(s),
  "cross and pairs": s => cross(s) && paired(s),
  solved: s => solvedWhere(s, () => true),
};

/** The goal of each step of each cube method, in order. */
const BIG = { reduction: ["centres", "paired", "solved", "solved"], yau: ["two centres", "three cross edges", "centres", "cross and pairs", "solved"] };
const STEP_GOALS: Record<string, Record<string, string[]>> = {
  "333": {
    beginner: ["cross shown up", "first layer", "f2l", "yellow cross", "oll", "solved"],
    cfop: ["cross", "f2l", "oll", "solved", "solved"],
    roux: ["first block", "second block", "cmll", "solved"],
    zz: ["eoline", "f2l", "solved"],
  },
  "222": { beginner: ["first layer", "oll", "solved"], ortega: ["first face", "oll", "solved"], cll: ["first layer", "solved"], eg: ["first face", "solved"] },
  "444": BIG, "555": BIG, "666": BIG, "777": BIG,
};

/** The stickers a picture draws, in the view its mask uses. */
const drawn = (state: CubeState, mask: Parameters<typeof isoCells>[1]) =>
  (viewForMask(mask) === "iso" ? isoCells(state, mask) : topLayerCells(state, mask)).map(c => c.fill).join();

test("every step of a cube method pictures the cube before it and after it, one step further on", () => {
  for (const p of PUZZLES) {
    if (!p.cubeSize) continue;
    for (const method of METHODS[p.id]) {
      const goals = STEP_GOALS[p.id]?.[method.id];
      expect(goals?.length, `${p.id} ${method.id}: a goal for every step`).toBe(method.steps.length);
      method.steps.forEach((step, i) => {
        const where = `${p.label} ${method.name} · ${step.title}`, { before, after, mask } = stepPicture(method, i);
        const start = applyAlg(solved(p.cubeSize!), before), end = applyAlg(solved(p.cubeSize!), after);
        // Done after the step, and what the steps before it did still done; not done before it.
        expect(GOALS[goals![i]!]!(end), `${where}: done after`).toBe(true);
        // The cross pictured turned over is held white down again by the steps after it.
        for (const earlier of goals!.slice(0, i)) expect(GOALS[earlier === "cross shown up" ? "cross" : earlier]!(end), `${where}: ${earlier} kept`).toBe(true);
        expect(GOALS[goals![i]!]!(start), `${where}: not done before`).toBe(false);
        // The two pictures differ where they are seen.
        expect(drawn(start, mask), `${where}: two different pictures`).not.toBe(drawn(end, mask));
      });
    }
  }
});
