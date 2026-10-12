/**
 * Build `data/algsets.json` (WV, SV, VLS, CLS, ZBLS, OLLCP, COLL, ELL, TTLL, CMLL, Roux EO on the 3×3; CLL, TCLL+, TCLL−,
 * EG-1, LEG-1, EG-2 on the 2×2) from the sequences in data/raw/speedcubedb_algsets.json and data/raw/algsets_other.json
 * (bun scripts/fetch-algsets.ts). Every algorithm is checked on Cubix's own cube model: from the case's setup, after the
 * AUF it is given, it must reach its set's goal; the others are dropped. A case is set up by its most voted algorithm
 * undone (the first one where nobody votes).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUFS, applyAlg, colorOf, expandAlg, invertAlg, slotsFor, solved, type CubeState, type Face } from "../src/shared/cube";
import type { AlgEntry, CaseDto, SetDto, Stage } from "../src/shared/types";

const root = resolve(import.meta.dir, "..");
export const raw: { page: string; name: string; subgroup: string; source?: string; setup?: string; alts: { alg: string; votes: number }[] }[] =
  ["speedcubedb_algsets.json", "algsets_other.json"].flatMap(file => JSON.parse(readFileSync(resolve(root, "data/raw", file), "utf8")));
const read = (file: string) => JSON.parse(readFileSync(resolve(root, "data", file), "utf8"));
const ollShapes: Map<number, string> = new Map(JSON.parse(readFileSync(resolve(root, "data/oll.json"), "utf8")).cases.map((c: { id: string; group: string }) => [Number(c.id.slice(4)), c.group]));

/** What an algorithm of the set must leave: the cube solved, or only part of it. */
export type Goal = "solved" | "oll" | "ollcp" | "cmll" | "zbls" | "lse-eo" | "f2l";

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
  // Roux's edge orientation: every edge of the last six with its top or bottom colour up or down, the M slice turned
  // any way (the centres follow it).
  if (goal === "lse-eo") return ["", "M", "M2", "M'"].some(m => {
    const end = m ? applyAlg(state, m) : state;
    return slots.every(({ p, face }, s) => (p[0] !== 0 && p[1] !== h) || p.every(v => Math.abs(v) === h) ? colorOf(end, s) === face
      : (face !== "U" && face !== "D") || colorOf(end, s) === "U" || colorOf(end, s) === "D");
  });
  const ok = (s: number) => colorOf(state, s) === slots[s].face;
  const corner = (s: number) => slots[s].p.every(v => Math.abs(v) === h);
  for (let s = 0; s < state.length; s++) {
    const { p, face } = slots[s], top = p[1] === h;
    // CMLL leaves the six edges and the centres of the last six edges step.
    if ((goal === "cmll" && (p[0] === 0 || top) && !corner(s)) || (goal === "f2l" && top)) continue;
    if (goal === "solved" || goal === "cmll" || !top) {
      if (!ok(s)) return false;
    } else if (face === "U" && colorOf(state, s) !== "U" && !(goal === "zbls" && corner(s))) return false;
    else if (goal === "ollcp" && corner(s) && !ok(s)) return false;
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

/**
 * An algorithm in the usual notation (R2' → R2, U'D → U' D, Rw → r, groups written out), or null when it is not one
 * people play: an R3, turns that cancel or merge (R' R', U' U2).
 */
export function clean(alg: string): string | null {
  let text = alg.replace(/[’`]/g, "'").replace(/[^RUFLDBMESxyzrufldbw23'()[\] ]/g, " ")
    .replace(/([RUFLDBMESxyzrufldb]w?[23]?'?)(?=[RUFLDBMESxyzrufldb(])/g, "$1 ");
  if (text.split("(").length !== text.split(")").length) text = text.replace(/[()]/g, " ");
  const tokens = expandAlg(text).split(" ").filter(Boolean).map(t => t.replace("2'", "2").replace(/^([RUFLDB])w/, (_, m: string) => m.toLowerCase()));
  if (!tokens.length || tokens.some(t => !/^[RUFLDBMESxyzrufldb](2|')?$/.test(t))) return null;
  return simplify(tokens.join(" ")).split(" ").length === tokens.length ? tokens.join(" ") : null;
}
/** Turns of the faces and slices, rotations not counted (STM). */
const turns = (alg: string) => alg.split(" ").filter(t => t && !/^[xyz]/.test(t)).length;

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

interface Entry { name: string; subgroup: string; source?: string; setup?: string; algs: { alg: string; votes: number; source?: string }[] }
interface SetSpec {
  id: string; size: 2 | 3; stage: Stage; label: string; description: string; goal: Goal; pages: string[];
  /** Pages of algorithms without a case of their own, each given to the cases it solves. */
  pool?: string[];
  /** Cases from elsewhere in the catalogue that belong to the set too. */
  extra?: () => Entry[];
  /**
   * The sets added since the first ones: algorithms in the usual notation only, an AUF before a rotation when either
   * does, none far longer than the case's shortest.
   */
  strict?: boolean;
}
/** The edge PLLs, the four ELL cases with the edges already oriented. */
const epll = (): Entry[] => read("pll.json").cases.filter((c: { subgroup?: string }) => c.subgroup === "EPLL").map((c: { id: string; algorithms: { alg: string; votes?: number; source?: string }[] }) =>
  ({ name: c.id.replace("PLL ", ""), subgroup: "", algs: c.algorithms.map(a => ({ alg: a.alg, votes: a.votes ?? 0, source: a.source })) }));
const SETS: SetSpec[] = [
  { id: "wv", size: 3, stage: "Last slot", label: "WV", goal: "oll", pages: ["3x3/WV"],
    description: "Winter Variation: insert the last pair, already joined, and orient the corners when the edges are oriented (27 cases)." },
  { id: "sv", size: 3, stage: "Last slot", label: "SV", goal: "oll", pages: ["3x3/SV"], strict: true,
    description: "Summer Variation: insert the last pair with R U' R' and orient the corners when the edges are oriented (27 cases)." },
  { id: "vls", size: 3, stage: "Last slot", label: "VLS", goal: "oll", pages: ["UB", "UF", "UL", "UBUL", "UFUB", "UFUL", "NE"].map(s => `3x3/VLS${s}`),
    description: "Valk Last Slot: insert the last pair and orient the whole last layer. Grouped by the edges already oriented; with the 27 WV cases, all 216." },
  { id: "cls", size: 3, stage: "Last slot", label: "CLS", goal: "oll", pages: ["3x3/CLS"], strict: true,
    description: "Corner Last Slot: insert the last corner, its edge already in place, and orient the last layer when its edges are oriented." },
  { id: "zbls", size: 3, stage: "Last slot", label: "ZBLS", goal: "zbls", pages: ["zbls"], strict: true,
    description: "Insert the last pair and orient the last-layer edges, leaving a ZBLL. Grouped by the pair's F2L case." },
  { id: "ollcp", size: 3, stage: "OLLCP", label: "OLLCP", goal: "ollcp", pages: Array.from({ length: 57 }, (_, i) => `3x3/OLLCP${i + 1}`),
    description: "Orient the last layer and permute its corners in one algorithm, leaving only an edge PLL." },
  { id: "coll", size: 3, stage: "COLL", label: "COLL", goal: "ollcp", pages: ["3x3/COLL"],
    description: "Orient and permute the last-layer corners when the edges are oriented (40 cases), leaving only an edge PLL." },
  { id: "ell", size: 3, stage: "ELL", label: "ELL", goal: "solved", pages: ["3x3/ELL"], extra: epll, strict: true,
    description: "Solve the last-layer edges, oriented or not, when the corners are solved (29 cases, with the 4 edge PLLs)." },
  { id: "ttll", size: 3, stage: "TTLL", label: "TTLL", goal: "solved", pages: ["ttll"], strict: true,
    description: "ZZ-CT: solve the last layer and the last slot's corner, waiting in the top layer, in one algorithm (72 cases)." },
  { id: "cmll", size: 3, stage: "CMLL", label: "CMLL", goal: "cmll", pages: ["3x3/CMLL"],
    description: "Roux: solve the last-layer corners after both blocks, ignoring the M slice (42 cases)." },
  { id: "lse-eo", size: 3, stage: "LSE", label: "EO (4a)", goal: "lse-eo", pages: ["3x3/EO4A"], strict: true,
    description: "Roux, step 4a: orient the last six edges with M and U turns (9 cases)." },
  { id: "2x2-cll", size: 2, stage: "CLL", label: "CLL", goal: "solved", pages: ["2x2/CLL"],
    description: "Solve the whole cube in one algorithm when the first layer is solved (EG-0, 42 cases)." },
  { id: "2x2-eg1", size: 2, stage: "EG", label: "EG-1", goal: "solved", pages: ["2x2/EG1"],
    description: "Solve the whole cube in one algorithm when the first face has two corners swapped on one side (42 cases)." },
  { id: "2x2-leg1", size: 2, stage: "EG", label: "LEG-1", goal: "solved", pages: ["2x2/LEG1"], strict: true,
    description: "EG-1 held with the first face's bar on the left, its two right corners swapped: solve the whole cube in one algorithm." },
  { id: "2x2-eg2", size: 2, stage: "EG", label: "EG-2", goal: "solved", pages: ["2x2/EG2"],
    description: "Solve the whole cube in one algorithm when the first face has two diagonal corners swapped (42 cases)." },
  { id: "2x2-tcll+", size: 2, stage: "TCLL", label: "TCLL+", goal: "solved", pages: ["2x2/TCLL+"], pool: ["2x2/TCLL+ pool"], strict: true,
    description: "Twisty CLL: solve the whole cube in one algorithm when the first layer's front-right corner is twisted, its first colour facing front (43 cases)." },
  { id: "2x2-tcll-", size: 2, stage: "TCLL", label: "TCLL-", goal: "solved", pages: ["2x2/TCLL-"], pool: ["2x2/TCLL- pool"], strict: true,
    description: "Twisty CLL: solve the whole cube in one algorithm when the first layer's front-right corner is twisted, its first colour facing right (43 cases)." },
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

/** The side faces that show one colour along a row of the 2×2: all 4 solved, 1 two corners swapped side by side, 0 across. */
const barFaces = (state: CubeState, row: number) => (["F", "B", "R", "L"] as const).filter(face => {
  const i = slotsFor(2).findIndex(g => g.face === face) + row * 2;
  return colorOf(state, i) === colorOf(state, i + 1);
});
const bars = (state: CubeState, row: number) => barFaces(state, row).length;

/**
 * "+" when the 2×2's first layer is solved but for its front-right corner, twisted with its first colour facing front;
 * "-" facing right; null otherwise.
 */
function twist(state: CubeState): string | null {
  const slots = slotsFor(2), same = (p: readonly number[], q: readonly number[]) => p.every((v, i) => v === q[i]), dfr = [0.5, -0.5, 0.5];
  const colourAt = (st: CubeState, face: Face, p: readonly number[]) => colorOf(st, slots.findIndex(g => g.face === face && same(g.p, p)));
  const sign = colourAt(state, "F", dfr) === "D" ? "+" : colourAt(state, "R", dfr) === "D" ? "-" : null;
  if (!sign || slots.some((g, i) => g.face === "D" && !same(g.p, dfr) && colorOf(state, i) !== "D")) return null;
  // Its four corners each in its place, the layer turned some way.
  const corners = [[0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]];
  const colours = (st: CubeState, p: readonly number[]) => slots.flatMap((g, i) => same(g.p, p) ? [colorOf(st, i)] : []).sort().join();
  const faces = (p: readonly number[]) => slots.filter(g => same(g.p, p)).map(g => g.face).sort().join();
  return AUFS.some(u => { const st = u ? applyAlg(state, u.replace("U", "D")) : state; return corners.every(p => colours(st, p) === faces(p)); }) ? sign : null;
}
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
    // TCLL: the first layer solved but for a twisted corner at front right.
    if (spec.id.startsWith("2x2-tcll")) return twist(state) === spec.id.slice(-1);
    // The first face down, one colour, its layer solved (CLL), two corners swapped side by side (EG-1; LEG-1 the two on
    // the right, its bar on the left) or across (EG-2).
    return slots.every((g, i) => g.face !== "D" || colorOf(state, i) === "D") && (spec.id === "2x2-leg1" ? barFaces(state, 1).join() === "L"
      : bars(state, 1) === { "2x2-cll": 4, "2x2-eg1": 1, "2x2-eg2": 0 }[spec.id]);
  }
  // As Cubix draws a 3×3, held as it is and coloured by its centres; in Roux's last six edges, the centres of the M slice
  // turned any way, the blocks by their own colours.
  const colour = spec.id === "lse-eo" ? (i: number) => colorOf(state, i) : shownColour(state);
  const ok = (keep: (p: readonly number[]) => boolean) => slots.every((g, i) => !keep(g.p) || colour(i) === g.face);
  switch (spec.id) {
    case "wv": case "sv": case "vls": case "zbls": return ok(p => p[1] < h && !(p[0] === h && p[2] === h));
    // CLS, TTLL: the last slot's edge in place, its corner not.
    case "cls": case "ttll": return ok(p => p[1] < h && !(p[0] === h && p[1] === -h && p[2] === h));
    case "ell": return ok(p => p[1] < h);
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


/** ELL cases by the top edges flipped. */
function ellGroup(state: CubeState): string {
  const colour = shownColour(state), flipped = slotsFor(3).filter((g, i) => g.face === "U" && g.p[0] * g.p[2] === 0 && g.p[0] + g.p[2] !== 0 && colour(i) !== "U");
  if (flipped.length !== 2) return flipped.length ? "Four edges flipped" : "Edges oriented";
  return flipped[0].p[0] + flipped[1].p[0] === 0 && flipped[0].p[2] + flipped[1].p[2] === 0 ? "Two opposite edges flipped" : "Two adjacent edges flipped";
}
const CLS_GROUPS: Record<string, string> = { "Cross Color Facing Up": "First colour up", "Cross Color Facing Front": "First colour front", "Cross Color Facing Right": "First colour right", "Trapped Corner": "Corner in its slot" };
const TTLL_GROUPS: Record<string, string> = { "Front Bar": "Front bar", "Right Bar": "Right bar", "Double Bar": "Two bars", "Front Opp": "Front opposite", "Right Opp": "Right opposite", "Double Opp": "Two opposites" };
/** The F2L cases (data/f2l.json) set up, to name the pair of a ZBLS case. */
const F2L = read("f2l.json").cases.map((c: { id: string; group: string; setup: string }) => ({ ...c, start: applyAlg(solved(3), c.setup) }));

if (import.meta.main) {
  const sets: SetDto[] = [], cases: CaseDto[] = [];
  let dropped = 0, rejected = 0, verified = 0;
  for (const spec of SETS) {
    const set: SetDto = { ...(spec.size === 2 ? { cube_size: 2 as const } : {}), id: spec.id, stage: spec.stage, label: spec.label, description: spec.description, count: 0 };
    sets.push(set);
    const usual = (alg: string) => {
      const out = clean(alg);
      if (out === null && /[RUFLDBMrufl]/.test(alg)) { rejected++; console.warn(`  ~ ${spec.id}: not in the usual notation, refused: ${alg}`); }
      return out;
    };
    // Without its first rotation first: an AUF rather than a rotation, where either does.
    const tries = (alg: string) => { const v = variants(alg); return spec.strict ? [v[1], ...v.filter((_, k) => k !== 1)] : v; };
    const pool = (spec.pool ?? []).flatMap(page => raw.filter(c => c.page === page).flatMap(c => c.alts.flatMap(a => { const alg = usual(a.alg); return alg ? [{ alg, votes: 0, source: c.source, pooled: true }] : []; })));
    for (const page of [...spec.pages, ...(spec.extra ? [""] : [])]) {
      const entries: Entry[] = page ? raw.filter(c => c.page === page).map(c => ({ name: c.name, subgroup: c.subgroup, source: c.source, setup: c.setup, algs: [...c.alts].sort((a, b) => b.votes - a.votes) })) : spec.extra!();
      if (!entries.length) throw Error(`No case for ${page}: run bun scripts/fetch-algsets.ts`);
      if (spec.size === 2 && !spec.id.startsWith("2x2-tcll") && page) for (const [name, bars] of [["O Adjacent", 1], ["O Diagonal", 0]] as const) {
        const alg = PBL.flatMap(a => spec.strict ? variants(a) : [a]).find(a => { const s = applyAlg(solved(2), invertAlg(a)); return startsRight(s, spec) && topBars(s) === bars; });
        if (alg) entries.push({ name, subgroup: "O", source: PBL_SOURCE, algs: [{ alg, votes: 0 }] });
        else if (!spec.strict) throw Error(`${spec.id} ${name}: no PBL algorithm`);
      }
      const kept: { setup: string; start: CubeState; alg: string }[] = [];
      for (const entry of entries) {
        const algs = spec.strict ? entry.algs.flatMap(a => { const alg = usual(a.alg); return alg ? [{ ...a, alg }] : []; }) : entry.algs;
        // The reference: the most voted algorithm that sets up the case as its step leaves it, held the usual way (the
        // last slot at front right, the first face down). Failing that, the same turned another way first.
        const candidates = [0, 1, 2, 3, 4].flatMap(k => algs.map(a => ({ ...a, alg: tries(a.alg)[k] })));
        let setup = "", start = solved(spec.size), algorithms: AlgEntry[] = [];
        // The case as its source sets it up, when one of its algorithms solves it: a most voted joke does not define it.
        const given = spec.strict && entry.setup ? clean(entry.setup) : null;
        if (given) {
          start = applyAlg(solved(spec.size), given);
          if (startsRight(start, spec) && algs.some(a => tries(a.alg).some(v => { try { return preAuf(start, v, spec.goal) !== null; } catch { return false; } }))) setup = given;
        }
        if (!setup) for (const ref of candidates) {
          try { setup = setupOf(ref.alg, spec.size, spec.goal); } catch { continue; }
          start = applyAlg(solved(spec.size), setup);
          if (preAuf(start, ref.alg, spec.goal) === "" && startsRight(start, spec)) break;
          setup = "";
        }
        if (!setup) throw Error(`${page} ${entry.name}: no algorithm sets up a valid case`);
        for (const a of [...algs, ...pool] as (Entry["algs"][number] & { pooled?: boolean })[]) {
          let pre: string | null = null, alg = a.alg;
          for (const variant of new Set(tries(a.alg))) {
            try { pre = preAuf(start, variant, spec.goal); } catch { /* notation Cubix does not read */ }
            if (pre !== null) { alg = variant; break; }
          }
          if (pre === null && a.pooled) continue;
          // An AUF before an algorithm that starts with one: a single turn.
          if (spec.strict && pre && /^U/.test(alg)) [alg, pre] = [simplify(`${pre} ${alg}`), ""];
          if (pre !== null && algorithms.some(b => b.alg === alg)) continue;
          if (pre === null) { if (!a.pooled) { dropped++; console.warn(`  ! ${page} ${entry.name}: dropped ${a.alg}`); } continue; }
          algorithms.push({ alg, source: a.source ?? entry.source ?? "speedcubedb", ...(a.votes ? { votes: a.votes } : {}), ...(pre ? { pre_auf: pre } : {}) });
        }
        if (spec.strict) {
          // Far longer than the case's shortest: an alternative nobody would play.
          const best = Math.min(...algorithms.map(a => turns(a.alg)));
          algorithms = algorithms.filter(a => turns(a.alg) <= Math.max(best + 6, Math.ceil(best * 1.5)) || (rejected++, console.warn(`  ~ ${spec.id} ${entry.name}: too long, refused: ${a.alg}`), false));
        }
        algorithms = algorithms.slice(0, 4);
        // The same case under another name (a symmetric OLL seen from another side): kept once.
        const same = kept.find(k => preAuf(start, k.alg, spec.goal) !== null);
        if (same) { console.warn(`  = ${page} ${entry.name}: same case as an earlier one, skipped`); continue; }
        kept.push({ setup, start, alg: algorithms[0].alg });
        verified += algorithms.length;
        const n = Number(/(\d+)$/.exec(page)?.[1]), bare = entry.name.trim().replace(/^(CLL|EG\d|TCLL[+\-−]) /, "");
        const pair = spec.id === "zbls" ? F2L.find((c: { start: CubeState }) => preAuf(c.start, algorithms[0].alg, "f2l") !== null) : undefined;
        if (spec.id === "zbls" && !pair) throw Error(`${entry.name}: no F2L case`);
        const name = spec.id === "ollcp" ? `OLLCP ${n}.${kept.length}`
          : spec.id === "coll" || spec.id === "cmll" ? `${spec.label} ${entry.name.replace("Anti Sune", "Antisune")}`
          : spec.id.startsWith("2x2-tcll") ? `${spec.label} ${bare}`
          : spec.size === 2 ? `${spec.label.replace("-", "")} ${bare}`
          : spec.id === "ell" ? `ELL ${bare}` : spec.id === "ttll" ? `TTLL ${bare.replace(/^T/, "")}` : spec.id === "lse-eo" ? `EO ${bare}`
          : entry.name;
        const group = spec.id === "ollcp" ? ollShapes.get(n)! : spec.id === "vls" ? VLS_GROUPS[page.slice(7)] : spec.id === "wv" || spec.id === "sv" ? wvGroup(start)
          : spec.id === "ell" ? ellGroup(start) : spec.id === "cls" ? CLS_GROUPS[entry.subgroup] : spec.id === "ttll" ? TTLL_GROUPS[entry.subgroup]
          : spec.id === "zbls" ? pair.group
          : spec.id === "lse-eo" ? `${bare === "All 6" ? 6 : bare.match(/\d/g)!.reduce((a, d) => a + Number(d), 0)} misoriented edges`
          : GROUPS[entry.subgroup] ?? entry.subgroup;
        if (!group) throw Error(`${name}: no group`);
        cases.push({ ...(spec.size === 2 ? { cube_size: 2 as const } : {}), id: name, name, stage: spec.stage, set: spec.id, setLabel: spec.label, group,
          ...(spec.id === "ollcp" ? { subgroup: `OLL ${n}` } : spec.id === "zbls" ? { subgroup: pair.id } : {}), setup, setups_alt: [], algorithms });
        set.count++;
      }
    }
  }

  writeFileSync(resolve(root, "data/algsets.json"), JSON.stringify({ sets, cases }, null, 1) + "\n");
  console.log(`data/algsets.json: ${cases.length} verified cases in ${sets.length} sets (${sets.map(s => `${s.label} ${s.count}`).join(", ")}); ${verified} algorithms kept, ${dropped} dropped as wrong, ${rejected} refused (notation or length).`);
}
