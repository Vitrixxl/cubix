/**
 * Build `data/algsets.json` (COLL, CMLL, WV, VLS, OLLCP on the 3×3; CLL, EG-1, EG-2 on the 2×2) from the SpeedCubeDB
 * sequences in data/raw/speedcubedb_algsets.json (bun scripts/fetch-algsets.ts). Every algorithm is checked on Cubix's
 * own cube model: from the case's setup, after the AUF it is given, it must reach its set's goal; the others are dropped.
 * A case is set up by its most voted algorithm undone.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUFS, applyAlg, colorOf, invertAlg, slotsFor, solved, type CubeState, type Face } from "../src/shared/cube";
import type { AlgEntry, CaseDto, SetDto, Stage } from "../src/shared/types";

const root = resolve(import.meta.dir, "..");
export const raw: { page: string; name: string; subgroup: string; alts: { alg: string; votes: number }[] }[] =
  JSON.parse(readFileSync(resolve(root, "data/raw/speedcubedb_algsets.json"), "utf8"));
const ollShapes: Map<number, string> = new Map(JSON.parse(readFileSync(resolve(root, "data/oll.json"), "utf8")).cases.map((c: { id: string; group: string }) => [Number(c.id.slice(4)), c.group]));

/** What an algorithm of the set must leave: the cube solved, or only part of it. */
export type Goal = "solved" | "oll" | "ollcp" | "cmll";

const ROTATIONS = new Map<number, string[]>();
/** The 24 ways to hold a cube, as rotations. */
function rotations(size: number): string[] {
  let list = ROTATIONS.get(size);
  if (list) return list;
  const seen = new Map<string, string>(), turns = ["", "x", "x2", "x'", "z", "z'"];
  for (const a of turns) for (const b of ["", "y", "y2", "y'"]) {
    const alg = `${a} ${b}`.trim(), key = applyAlg(solved(size), alg).join();
    if (!seen.has(key)) seen.set(key, alg);
  }
  ROTATIONS.set(size, list = [...seen.values()]);
  return list;
}

/** Whether a cube held as it is meets the goal, the top layer turned in any of its four ways. */
function meets(state: CubeState, goal: Goal): boolean {
  const size = Math.round(Math.sqrt(state.length / 6)), h = (size - 1) / 2, slots = slotsFor(size);
  const ok = (s: number) => colorOf(state, s) === slots[s].face;
  const corner = (s: number) => slots[s].p.every(v => Math.abs(v) === h);
  for (let s = 0; s < state.length; s++) {
    const { p, face } = slots[s], top = p[1] === h;
    // CMLL leaves the six edges and the centres of the last six edges step.
    if (goal === "cmll" && (p[0] === 0 || top) && !corner(s)) continue;
    if (goal === "solved" || goal === "cmll" || !top) {
      if (!ok(s)) return false;
    } else if (face === "U" && colorOf(state, s) !== "U") return false;
    else if (goal !== "oll" && corner(s) && !ok(s)) return false;
  }
  return true;
}

/** Whether the algorithm takes the state to the goal, the cube held any way and the top layer turned any way after. */
export function reaches(start: CubeState, alg: string, goal: Goal): boolean {
  const size = Math.round(Math.sqrt(start.length / 6)), end = applyAlg(start, alg);
  return rotations(size).some(r => {
    const held = r ? applyAlg(end, r) : end;
    return AUFS.some(auf => meets(auf ? applyAlg(held, auf) : held, goal));
  });
}

/** The AUF to turn before the algorithm from the case, or null when it does not solve it. */
export const preAuf = (start: CubeState, alg: string, goal: Goal) => AUFS.find(auf => reaches(auf ? applyAlg(start, auf) : start, alg, goal)) ?? null;

/** Setup = the algorithm undone, adjacent turns merged; CMLL's M-slice turns brought back so the centres are in place. */
function setupOf(alg: string, size: number, goal: Goal): string {
  let setup = simplify(invertAlg(alg));
  if (goal === "cmll") {
    const fix = ["", "M", "M2", "M'"].find(m => held(applyAlg(solved(3), `${setup} ${m}`)));
    if (fix === undefined) throw Error(`Centres not restored: ${alg}`);
    setup = simplify(`${setup} ${fix}`);
  }
  applyAlg(solved(size), setup);
  return setup;
}

/** The algorithm as written, without the rotations it starts with, then after each turn of the whole cube about U. */
const variants = (alg: string) => [alg, alg.replace(/^(\s*[xyz][2']?\s+)+/, ""), ...["y", "y2", "y'"].map(y => simplify(`${y} ${alg}`))];

/** Merge consecutive turns of the same move: "U U2" → "U'", "R R'" → "". */
function simplify(alg: string): string {
  const out: [string, number][] = [];
  for (const token of alg.split(/\s+/).filter(Boolean)) {
    const m = /^(.+?)(2|')?$/.exec(token)!, amount = m[2] === "2" ? 2 : m[2] === "'" ? 3 : 1;
    const last = out.at(-1);
    if (last && last[0] === m[1]) {
      last[1] = (last[1] + amount) % 4;
      if (!last[1]) out.pop();
    } else out.push([m[1], amount]);
  }
  return out.map(([move, n]) => move + ["", "", "2", "'"][n]).join(" ");
}

interface SetSpec { id: string; size: 2 | 3; stage: Stage; label: string; description: string; goal: Goal; pages: string[] }
const SETS: SetSpec[] = [
  { id: "wv", size: 3, stage: "Last slot", label: "WV", goal: "oll", pages: ["3x3/WV"],
    description: "Winter Variation: insert the last pair, already joined, and orient the corners when the edges are oriented (27 cases)." },
  { id: "vls", size: 3, stage: "Last slot", label: "VLS", goal: "oll", pages: ["UB", "UF", "UL", "UBUL", "UFUB", "UFUL", "NE"].map(s => `3x3/VLS${s}`),
    description: "Valk Last Slot: insert the last pair and orient the whole last layer. Grouped by the edges already oriented; with the 27 WV cases, all 216." },
  { id: "ollcp", size: 3, stage: "OLLCP", label: "OLLCP", goal: "ollcp", pages: Array.from({ length: 57 }, (_, i) => `3x3/OLLCP${i + 1}`),
    description: "Orient the last layer and permute its corners in one algorithm, leaving only an edge PLL." },
  { id: "coll", size: 3, stage: "COLL", label: "COLL", goal: "ollcp", pages: ["3x3/COLL"],
    description: "Orient and permute the last-layer corners when the edges are oriented (40 cases), leaving only an edge PLL." },
  { id: "cmll", size: 3, stage: "CMLL", label: "CMLL", goal: "cmll", pages: ["3x3/CMLL"],
    description: "Roux: solve the last-layer corners after both blocks, ignoring the M slice (42 cases)." },
  { id: "2x2-cll", size: 2, stage: "CLL", label: "CLL", goal: "solved", pages: ["2x2/CLL"],
    description: "Solve the whole cube in one algorithm when the first layer is solved (EG-0, 42 cases)." },
  { id: "2x2-eg1", size: 2, stage: "EG", label: "EG-1", goal: "solved", pages: ["2x2/EG1"],
    description: "Solve the whole cube in one algorithm when the first face has two corners swapped on one side (42 cases)." },
  { id: "2x2-eg2", size: 2, stage: "EG", label: "EG-2", goal: "solved", pages: ["2x2/EG2"],
    description: "Solve the whole cube in one algorithm when the first face has two diagonal corners swapped (42 cases)." },
];

/**
 * The two cases a 2×2 page leaves out, the top already oriented: its two corners swapped side by side (O Adjacent) or
 * across (O Diagonal). Solved by the Ortega PBL algorithms (https://www.jperm.net/algs/2x2/pbl), or the same turned
 * upside down; the build keeps those that set up the right case.
 */
const PBL_SOURCE = "https://www.jperm.net/algs/2x2/pbl";
const upsideDown = (alg: string, map: Record<string, string>) => alg.replace(/[RLUDFB]/g, m => map[m] ?? m);
const PBL = ["R U R' U' R' F R2 U' R' U' R U R' F'", "F R U' R' U' R U R' F' R U R' U' R' F R F'", "R2 U' B2 U2 R2 U' R2", "R U' R F2 R' U R'", "R2 F2 R2"]
  .flatMap(a => [a, upsideDown(a, { R: "L", L: "R", U: "D", D: "U" }), upsideDown(a, { U: "D", D: "U", F: "B", B: "F" })]);
const GROUPS: Record<string, string> = { AS: "Antisune", "Anti Sune": "Antisune", S: "Sune", Solved: "O" };
const VLS_GROUPS: Record<string, string> = { UB: "UB", UF: "UF", UL: "UL", UBUL: "UB UL", UFUB: "UF UB", UFUL: "UF UL", NE: "No edges" };

/** The cube held with its centres in place (a 3×3 turned by the rotations of its setup), or null. */
function held(state: CubeState): CubeState | null {
  for (const r of rotations(3)) {
    const turned = r ? applyAlg(state, r) : state;
    if (slotsFor(3).every((g, i) => g.p.filter(v => v !== 0).length !== 1 || colorOf(turned, i) === g.face)) return turned;
  }
  return null;
}

/** How many side faces show one colour along a row of the 2×2: 4 solved, 1 two corners swapped side by side, 0 across. */
const bars = (state: CubeState, row: number) => (["F", "B", "R", "L"] as const).filter(face => {
  const i = slotsFor(2).findIndex(g => g.face === face) + row * 2;
  return colorOf(state, i) === colorOf(state, i + 1);
}).length;
const topBars = (state: CubeState) => bars(state, 0);

/** A 3×3 sticker's colour as drawn: named after the face whose centre has it. */
function shownColour(state: CubeState): (slot: number) => Face {
  const slots = slotsFor(3), byColour = new Map(slots.flatMap((g, i) => g.p.filter(v => v !== 0).length === 1 ? [[colorOf(state, i), g.face] as const] : []));
  return slot => byColour.get(colorOf(state, slot))!;
}

/** What a case looks like before its step: the pieces the step leaves alone are in place. */
function startsRight(state: CubeState, spec: SetSpec): boolean {
  const slots = slotsFor(spec.size), h = (spec.size - 1) / 2;
  if (spec.size === 2) {
    // The first face down, one colour, its layer solved (CLL), two corners swapped side by side (EG-1) or across (EG-2).
    return slots.every((g, i) => g.face !== "D" || colorOf(state, i) === "D") && bars(state, 1) === { "2x2-cll": 4, "2x2-eg1": 1, "2x2-eg2": 0 }[spec.id];
  }
  // As Cubix draws a 3×3, held as it is and coloured by its centres.
  const colour = shownColour(state);
  const ok = (keep: (p: readonly number[]) => boolean) => slots.every((g, i) => !keep(g.p) || colour(i) === g.face);
  switch (spec.id) {
    case "wv": case "vls": return ok(p => p[1] < h && !(p[0] === h && p[2] === h));
    case "ollcp": return ok(p => p[1] < h);
    // COLL: the top edges oriented too.
    case "coll": return ok(p => p[1] < h) && slots.every((g, i) => g.face !== "U" || g.p[0] * g.p[2] !== 0 || colour(i) === "U");
    default: return ok(p => p[1] < h && p[0] !== 0);
  }
}

/** WV cases by how many top corners already show their top colour: "2 corners". */
function wvGroup(state: CubeState): string {
  const colour = shownColour(state), n = slotsFor(3).filter((g, i) => g.face === "U" && g.p[0] !== 0 && g.p[2] !== 0 && colour(i) === "U").length;
  return n === 1 ? "1 corner" : `${n} corners`;
}


if (import.meta.main) {
  const sets: SetDto[] = [], cases: CaseDto[] = [];
  let dropped = 0;
  for (const spec of SETS) {
    const set: SetDto = { ...(spec.size === 2 ? { cube_size: 2 as const } : {}), id: spec.id, stage: spec.stage, label: spec.label, description: spec.description, count: 0 };
    sets.push(set);
    for (const page of spec.pages) {
      const entries = raw.filter(c => c.page === page).map(c => ({ name: c.name, subgroup: c.subgroup, algs: [...c.alts].sort((a, b) => b.votes - a.votes) }));
      if (!entries.length) throw Error(`No case for ${page}: run bun scripts/fetch-algsets.ts`);
      if (spec.size === 2) for (const [name, bars] of [["O Adjacent", 1], ["O Diagonal", 0]] as const) {
        const alg = PBL.find(a => { const s = applyAlg(solved(2), invertAlg(a)); return startsRight(s, spec) && topBars(s) === bars; });
        if (!alg) throw Error(`${spec.id} ${name}: no PBL algorithm`);
        entries.push({ name, subgroup: "O", algs: [{ alg, votes: 0 }] });
      }
      const kept: { setup: string; start: CubeState; alg: string }[] = [];
      for (const entry of entries) {
        // The reference: the most voted algorithm that sets up the case as its step leaves it, held the usual way (the
        // last slot at front right, the first face down). Failing that, the same turned another way first.
        const candidates = [0, 1, 2, 3, 4].flatMap(k => entry.algs.map(a => ({ ...a, alg: variants(a.alg)[k] })));
        let setup = "", start = solved(spec.size), algorithms: AlgEntry[] = [];
        for (const ref of candidates) {
          try { setup = setupOf(ref.alg, spec.size, spec.goal); } catch { continue; }
          start = applyAlg(solved(spec.size), setup);
          if (preAuf(start, ref.alg, spec.goal) === "" && startsRight(start, spec)) break;
          setup = "";
        }
        if (!setup) throw Error(`${page} ${entry.name}: no algorithm sets up a valid case`);
        for (const a of entry.algs) {
          let pre: string | null = null, alg = a.alg;
          for (const variant of new Set(variants(a.alg))) {
            try { pre = preAuf(start, variant, spec.goal); } catch { /* notation Cubix does not read */ }
            if (pre !== null) { alg = variant; break; }
          }
          if (pre === null || algorithms.some(b => b.alg === alg)) { dropped++; console.warn(`  ! ${page} ${entry.name}: dropped ${a.alg}`); continue; }
          algorithms.push({ alg, source: spec.size === 2 && entry.subgroup === "O" ? PBL_SOURCE : "speedcubedb", ...(a.votes ? { votes: a.votes } : {}), ...(pre ? { pre_auf: pre } : {}) });
        }
        algorithms = algorithms.slice(0, 4);
        // The same case under another name (a symmetric OLL seen from another side): kept once.
        const same = kept.find(k => preAuf(start, k.alg, spec.goal) !== null);
        if (same) { console.warn(`  = ${page} ${entry.name}: same case as an earlier one, skipped`); continue; }
        kept.push({ setup, start, alg: algorithms[0].alg });
        const n = Number(/(\d+)$/.exec(page)?.[1]);
        const name = spec.id === "ollcp" ? `OLLCP ${n}.${kept.length}`
          : spec.id === "coll" || spec.id === "cmll" ? `${spec.label} ${entry.name.replace("Anti Sune", "Antisune")}`
          : spec.id === "2x2-cll" || spec.id.startsWith("2x2-eg") ? `${spec.label.replace("-", "")} ${entry.name.replace(/^(CLL|EG\d) /, "")}`
          : entry.name;
        const group = spec.id === "ollcp" ? ollShapes.get(n)! : spec.id === "vls" ? VLS_GROUPS[page.slice(7)] : spec.id === "wv" ? wvGroup(start) : GROUPS[entry.subgroup] ?? entry.subgroup;
        cases.push({ ...(spec.size === 2 ? { cube_size: 2 as const } : {}), id: name, name, stage: spec.stage, set: spec.id, setLabel: spec.label, group,
          ...(spec.id === "ollcp" ? { subgroup: `OLL ${n}` } : {}), setup, setups_alt: [], algorithms });
        set.count++;
      }
    }
  }

  writeFileSync(resolve(root, "data/algsets.json"), JSON.stringify({ sets, cases }, null, 1) + "\n");
  console.log(`data/algsets.json: ${cases.length} verified cases in ${sets.length} sets (${sets.map(s => `${s.label} ${s.count}`).join(", ")}); ${dropped} algorithms dropped.`);
}
