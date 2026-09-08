/**
 * Sanity checks for src/shared/cube.ts:
 *  1. algebraic identities (X⁴ = id, (R U R' U')⁶ = id, T-perm² = id, Sune⁶ = id)
 *  2. cross-check against SpeedCubeDB sticker diagrams: for every OLL/PLL case, apply the
 *     SpeedCubeDB setup and compare the top face + top rows of side faces.
 *  3. every case in data/*.json: setup then algorithms[0] (with pre_auf) must reach the expected state.
 *
 * Usage: npx tsx scripts/test-cube.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAlg, colorOf, compensateAuf, FACES, parseAlg, reorientAlgY2, solved, SLOTS, type CubeState, type Face } from "../src/shared/cube";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
};
const same = (a: CubeState, b: CubeState) => a.every((v, i) => v === b[i]);

// 1. identities --------------------------------------------------------------
for (const tok of ["U", "D", "F", "B", "R", "L", "M", "E", "S", "r", "l", "u", "d", "f", "b", "x", "y", "z"]) {
  assert(same(applyAlg(solved(), `${tok} ${tok} ${tok} ${tok}`), solved()), `${tok}^4 = id`);
  assert(same(applyAlg(solved(), `${tok} ${tok}'`), solved()), `${tok} ${tok}' = id`);
  assert(same(applyAlg(solved(), `${tok}2 ${tok}2`), solved()), `${tok}2 ${tok}2 = id`);
}
assert(same(applyAlg(solved(), "(R U R' U') ".repeat(6)), solved()), "sexy move ^6 = id");
assert(same(applyAlg(solved(), "R U R' U' R' F R2 U' R' U' R U R' F' ".repeat(2)), solved()), "T-perm ^2 = id");
assert(same(applyAlg(solved(), "R U R' U R U2 R' ".repeat(6)), solved()), "Sune ^6 = id");
assert(same(applyAlg(solved(), "r R'"), applyAlg(solved(), "M'")), "r R' = M'");
assert(same(applyAlg(solved(), "x"), applyAlg(solved(), "R M' L'")), "x = R M' L'");
assert(same(applyAlg(solved(), "y"), applyAlg(solved(), "U E' D'")), "y = U E' D'");
assert(same(applyAlg(solved(), "z"), applyAlg(solved(), "F S B'")), "z = F S B'");
assert(same(applyAlg(solved(), "Rw"), applyAlg(solved(), "r")), "Rw = r");
for (const alg of ["R L F B U D M E S r l f b u d x y z", "R U R' U'", "r U2 M' F S x' y z2"]) {
  assert(same(applyAlg(solved(), reorientAlgY2(alg)), applyAlg(solved(), `y2 ${alg} y2`)), `y2 reorientation: ${alg}`);
}
// U clockwise seen from above: the front-top edge sticker goes to the left face
{
  const s = applyAlg(solved(), "U");
  const frontTopSlot = SLOTS.findIndex((g) => g.face === "F" && g.p[0] === 0 && g.p[1] === 1);
  const leftTopSlot = SLOTS.findIndex((g) => g.face === "L" && g.p[2] === 0 && g.p[1] === 1);
  assert(colorOf(s, leftTopSlot) === "F", "U moves F top edge sticker to L");
  assert(colorOf(s, frontTopSlot) === "R", "U brings the R top edge sticker to F");
}

// 2. SpeedCubeDB diagrams -----------------------------------------------------
// SpeedCubeDB colour scheme: yellow U, green F, orange R, red L, blue B (white D).
const SCDB_COLOR: Record<Face, string> = { U: "y", D: "w", F: "g", B: "b", R: "o", L: "r" };
const slotsOf = (face: Face) => SLOTS.map((g, i) => (g.face === face ? i : -1)).filter((i) => i >= 0);
function topRow(state: CubeState, face: Face): string {
  return slotsOf(face)
    .filter((i) => SLOTS[i].p[1] === 1)
    .map((i) => SCDB_COLOR[colorOf(state, i)])
    .join("");
}
function checkDiagrams(file: string, isOll: boolean) {
  const raw = read(`data/raw/${file}`);
  let checked = 0;
  for (const c of raw) {
    if (!c.stickers || !c.setup) continue;
    const s = applyAlg(solved(), c.setup);
    const norm = (str: string) => (isOll ? str.replace(/[^y]/g, "l") : str);
    const uFace = slotsOf("U").map((i) => SCDB_COLOR[colorOf(s, i)]).join("");
    assert(norm(uFace) === norm(c.stickers.U), `${file} ${c.name}: U face ${uFace} vs ${c.stickers.U}`);
    for (const f of ["F", "B", "R", "L"] as const) {
      const mine = topRow(s, f);
      const theirs = String(c.stickers[f]).slice(0, 3);
      assert(norm(mine) === norm(theirs), `${file} ${c.name}: ${f} top row ${mine} vs ${theirs}`);
    }
    checked++;
  }
  console.log(`${file}: ${checked} diagrams compared`);
}
checkDiagrams("speedcubedb_pll.json", false);
checkDiagrams("speedcubedb_oll.json", true);

// 3. consolidated data ----------------------------------------------------------
type Check = "solved" | "oll" | "f2l";
const centersSolved = (s: CubeState) => SLOTS.every((g, i) => (g.p[0] === 0 && g.p[1] === 0) || (g.p[0] === 0 && g.p[2] === 0) || (g.p[1] === 0 && g.p[2] === 0) ? true : true) && [4, 13, 22, 31, 40, 49].every((i) => s[i] === i);
function reorient(s: CubeState): CubeState | null {
  const rots = ["", "x", "x2", "x'", "y", "y2", "y'", "z", "z2", "z'", "x y", "x y2", "x y'", "x' y", "x' y2", "x' y'", "x2 y", "x2 y'", "z y", "z y2", "z y'", "z' y", "z' y2", "z' y'"];
  for (const r of rots) {
    const q = r ? applyAlg(s, r) : s;
    if (centersSolved(q)) return q;
  }
  return null;
}
function reached(s: CubeState, check: Check): boolean {
  for (const auf of ["", "U", "U2", "U'"]) {
    const q = reorient(auf ? applyAlg(s, auf) : s);
    if (!q) continue;
    let ok = true;
    for (let i = 0; i < 54 && ok; i++) {
      const inU = SLOTS[i].p[1] === 1;
      if (check === "solved" || !inU) ok = q[i] === i;
      else if (check === "oll") ok = SLOTS[i].face !== "U" || FACES[Math.floor(q[i] / 9)] === "U";
    }
    if (ok) return true;
  }
  return false;
}
for (const [file, check] of [["pll.json", "solved"], ["oll.json", "oll"], ["f2l.json", "f2l"], ["f2l-advanced.json", "f2l"], ["f2l-expert.json", "f2l"], ["2look-oll.json", "oll"], ["2look-pll.json", "solved"]] as const) {
  const doc = read(`data/${file}`);
  let n = 0;
  for (const c of doc.cases) {
    for (const a of c.algorithms) {
      const s = applyAlg(applyAlg(applyAlg(solved(), c.setup), a.pre_auf ?? ""), a.alg);
      assert(reached(s, check), `${file} ${c.id}: ${a.pre_auf ?? ""} ${a.alg}`);
      n++;
    }
    for (const alt of c.setups_alt) {
      const s = applyAlg(applyAlg(solved(), alt), c.algorithms[0].alg);
      assert(reached(s, check), `${file} ${c.id}: alt setup ${alt}`);
    }
    parseAlg(c.setup);
  }
  console.log(`${file}: ${doc.cases.length} cases, ${n} algorithms replayed`);
}

// 4. training AUF compensation ------------------------------------------------
// The algorithm displayed during training must solve the exact state rendered
// after Random AUF, not merely the canonical case orientation.
assert(compensateAuf("U R U' R'", "U") === "R U' R'", "F2L 1 AUF is simplified for display");
for (const file of ["pll.json", "oll.json", "f2l.json", "f2l-advanced.json", "f2l-expert.json", "2look-oll.json", "2look-pll.json"]) {
  const doc = read(`data/${file}`);
  for (const c of doc.cases) {
    const primary = c.algorithms[0];
    const baseAlg = `${primary.pre_auf ?? ""} ${primary.alg}`.trim();
    const canonicalResult = applyAlg(applyAlg(solved(), c.setup), baseAlg);
    for (const auf of ["", "U", "U2", "U'"]) {
      const shownState = applyAlg(applyAlg(solved(), c.setup), auf);
      const adjustedAlg = compensateAuf(baseAlg, auf);
      const adjustedResult = applyAlg(shownState, adjustedAlg);
      assert(same(adjustedResult, canonicalResult), `${file} ${c.id}: training AUF ${auf || "none"} -> ${adjustedAlg}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll cube model checks passed.");
