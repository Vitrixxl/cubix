/**
 * COLL, CMLL, WV, VLS, OLLCP, CLL, EG-1 and EG-2 (data/algsets.json, scripts/build-algsets.ts), checked again with
 * cubing.js, a cube model of its own: from each case's setup, after its AUF, every algorithm reaches its set's goal.
 */
import { expect, test } from "bun:test";
import { cube2x2x2, cube3x3x3 } from "cubing/puzzles";
import type { KPattern } from "cubing/kpuzzle";
import data from "../data/algsets.json";
import { cases, sets } from "../src/client/local/catalog";
import { applyAlg, solved } from "../src/shared/cube";
import type { AlgEntry } from "../src/shared/types";

const SIZES: Record<string, number> = { wv: 27, vls: 189, ollcp: 329, coll: 40, cmll: 42, "2x2-cll": 42, "2x2-eg1": 42, "2x2-eg2": 42 };
const GOALS: Record<string, "oll" | "ollcp" | "cmll" | "solved"> = { wv: "oll", vls: "oll", ollcp: "ollcp", coll: "ollcp", cmll: "cmll" };

const k3 = await cube3x3x3.kpuzzle(), k2 = await cube2x2x2.kpuzzle();
const ROTATIONS = ["", "x", "x2", "x'", "z", "z'"].flatMap(a => ["", "y", "y2", "y'"].map(b => `${a} ${b}`.trim()));
/** The pieces a move turns: the top layer, the M slice. */
const moved = (alg: string, orbit: "EDGES" | "CORNERS") => {
  const { pieces } = k3.defaultPattern().applyAlg(alg).patternData[orbit];
  return new Set(pieces.flatMap((p, i) => (p !== i ? [i] : [])));
};
const TOP = { EDGES: moved("U", "EDGES"), CORNERS: moved("U", "CORNERS") }, SLICE = moved("M", "EDGES");

function meets(p: KPattern, goal: string): boolean {
  const d = p.patternData;
  if (goal === "solved") return d.CORNERS.pieces.every((x, i) => x === i && d.CORNERS.orientation[i] === 0);
  for (const orbit of ["EDGES", "CORNERS"] as const) {
    const { pieces, orientation } = d[orbit];
    for (let i = 0; i < pieces.length; i++) {
      const top = TOP[orbit].has(i), placed = pieces[i] === i && orientation[i] === 0;
      if (goal === "cmll") { if ((orbit === "CORNERS" || (!top && !SLICE.has(i))) && !placed) return false; }
      else if (!top || (goal === "ollcp" && orbit === "CORNERS")) { if (!placed) return false; }
      else if (orientation[i] !== 0) return false;
    }
  }
  return goal === "cmll" || JSON.stringify(d.CENTERS.pieces) === JSON.stringify(k3.defaultPattern().patternData.CENTERS.pieces);
}
/** A 2×2 has no inner layer: its wide turns turn the whole cube, which cubing.js only writes as rotations. */
const WHOLE: Record<string, string> = { u: "y", d: "y'", r: "x", l: "x'", f: "z", b: "z'" };
const on2x2 = (alg: string) => alg.replace(/\b([udrlfb])(2?)('?)/g, (_, m, two, prime) => {
  const r = WHOLE[m], inverted = r.endsWith("'") !== !!prime;
  return r[0] + (two || (inverted ? "'" : ""));
});
const reaches = (p: KPattern, goal: string) => ROTATIONS.some(r => ["", "U", "U2", "U'"].some(auf => meets(p.applyAlg(`${r} ${auf}`.trim()), goal)));

test("each set is complete, on its cube, and in the catalogue", () => {
  for (const [id, count] of Object.entries(SIZES)) {
    const set = sets.find(s => s.id === id)!;
    expect(set?.count, id).toBe(count);
    expect(set.cube_size ?? 3).toBe(id.startsWith("2x2") ? 2 : 3);
    expect(cases.filter(c => c.set === id)).toHaveLength(count);
  }
  expect(new Set(data.cases.map(c => c.id)).size).toBe(data.cases.length);
});

test("every algorithm solves exactly its case, checked with cubing.js", () => {
  for (const c of data.cases) {
    const goal = GOALS[c.set] ?? "solved", kpuzzle = c.cube_size === 2 ? k2 : k3;
    const read = (alg: string) => (c.cube_size === 2 ? on2x2(alg) : alg);
    const start = kpuzzle.defaultPattern().applyAlg(read(c.setup));
    expect(reaches(start, goal), `${c.id} is already done`).toBe(false);
    expect(c.algorithms.length, c.id).toBeGreaterThan(0);
    for (const a of c.algorithms as AlgEntry[]) expect(reaches(start.applyAlg(read(`${a.pre_auf ?? ""} ${a.alg}`.trim())), goal), `${c.id}: ${a.alg}`).toBe(true);
    // Cubix's own model reads the setup too, for the diagrams and the 3D player.
    expect(applyAlg(solved(c.cube_size ?? 3), c.setup)).not.toEqual(solved(c.cube_size ?? 3));
  }
});
