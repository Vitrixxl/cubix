/**
 * Build `data/bld.json`, the blindfolded sets: on the 3×3 Old Pochmann edges and corners, M2 edges, 3-style edges (UF)
 * and corners (UFR), and the parity algorithms; on the 4×4 and 5×5, r2 for the wings. A case is a target (two for
 * 3-style) in Speffz letters, a wing by its position; its algorithm solves it, its setup is that algorithm undone, so
 * the case's picture is the cube the algorithm brings back.
 * Every algorithm is checked on cubing.js's model (scripts/bld-model.ts): it must do exactly the swap or cycle the
 * case announces, with its method's known side effect, and nothing else; the build stops on the first that does not.
 *
 * The 3-style and parity algorithms come from BLDDB (https://blddb.net), which gathers the lists of top
 * blindfolders; `bun scripts/build-bld-catalog.ts --fetch` refreshes data/raw/blddb_3style.json from it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { invertAlg } from "../src/shared/cube";
import type { CaseDto, SetDto } from "../src/shared/types";
import { LETTERS, check, corner, edge, effect, type Sticker } from "./bld-model";

const root = resolve(import.meta.dir, "..");
const RAW = resolve(root, "data/raw/blddb_3style.json");

/** Where each Speffz letter sits, its own face first. */
const EDGE_NAMES = "UB UR UF UL LU LF LD LB FU FR FD FL RU RB RD RF BU BL BD BR DF DR DB DL".split(" ");
const CORNER_NAMES = "UBL UBR UFR UFL LUB LUF LDF LDB FUL FUR FDR FDL RUF RUB RDB RDF BUR BUL BDL BDR DFL DFR DBR DBL".split(" ");
const position = (letter: string, kind: "edge" | "corner") => (kind === "edge" ? EDGE_NAMES : CORNER_NAMES)[LETTERS.indexOf(letter)]!;
/** The letters of the same piece: A and Q are both the UB edge. */
const samePiece = (a: string, b: string, kind: "edge" | "corner") => {
  const s = (kind === "edge" ? edge : corner);
  return s(a)[1] === s(b)[1];
};
/** The letter of the same piece's sticker `k` steps further round it (the way its name reads). */
const twisted = (letter: string, k: number, kind: "edge" | "corner") => {
  const s = (kind === "edge" ? edge : corner)(letter), n = kind === "edge" ? 2 : 3;
  return LETTERS.find(l => { const o = (kind === "edge" ? edge : corner)(l); return o[1] === s[1] && o[2] === (s[2] + k) % n; })!;
};
/** Speffz letters by face: A–D on U, E–H on L… */
const faceOf = (letter: string) => "ULFRBD"[Math.floor(LETTERS.indexOf(letter) / 4)]!;

if (process.argv.includes("--fetch")) await fetchBlddb();
const raw: Record<"edges" | "corners" | "parity", Record<string, [string, string, number][]>> = JSON.parse(readFileSync(RAW, "utf8"));

const sets: SetDto[] = [], cases: CaseDto[] = [];
let checked = 0;
function set(id: string, label: string, description: string, size?: 4 | 5) {
  const value: SetDto = { id: size ? `${size}x${size}-bld-${id}` : `3bld-${id}`, ...(size ? { cube_size: size } : {}), label, stage: "BLD", description, count: 0 };
  sets.push(value);
  return value;
}
/** One case: its algorithms, the first giving the setup; each must do exactly what its id announces (`check`). */
function add(s: SetDto, id: string, name: string, group: string, algs: { alg: string; source: string; votes?: number }[], notes?: string) {
  for (const a of algs) {
    const wrong = check(id, a.alg);
    if (wrong.length) throw Error(`${id}: ${a.alg} does not do what the case announces: ${wrong.slice(0, 4).join("; ")}`);
    checked++;
  }
  s.count++;
  cases.push({ id, ...(s.cube_size ? { cube_size: s.cube_size } : {}), name, stage: "BLD", set: s.id, setLabel: s.label, group, setup: invertAlg(algs[0]!.alg), setups_alt: [], algorithms: algs, ...(notes && notes !== "Not found." ? { notes } : {}) });
}

/**
 * The shortest setup, from these moves, that brings the target sticker to the swap's: none of them touches the buffer
 * or the swap algorithm's other pieces, so the setup is undone after the swap.
 */
function setupTo(target: Sticker, spot: Sticker, moves: string[]): string {
  const key = (s: Sticker) => s.join(":");
  let level = [""];
  for (let depth = 0; depth <= 4; depth++) {
    for (const alg of level) if (key(effect(alg).get(key(spot))!) === key(target)) return alg;
    level = level.flatMap(alg => moves.filter(m => !alg || alg.split(" ").at(-1)![0] !== m[0]).map(m => `${alg} ${m}`.trim()));
  }
  throw Error(`No setup from ${key(target)}`);
}
const turnsOf = (faces: string[]) => faces.flatMap(f => [f, `${f}'`, `${f}2`]);
const conjugate = (setup: string, alg: string) => setup ? `${setup} (${alg}) ${invertAlg(setup)}` : alg;

// Old Pochmann, after J Perm's tutorial (https://www.jperm.net/bld): edges from the UR buffer swapped with UL by the
// T perm (which also swaps UBR and UFR), set up with L, Lw, D and Dw turns; corners from the UBL buffer swapped with
// RDF (P) by the Y perm without its first and last turn (which also swaps UB and UL), set up with D, F and R turns.
const JPERM = "https://www.jperm.net/bld";
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'", Y_PERM = "R U' R' U' R U R' F' R U R' U' R' F R";
// UB and UF have J perms of their own, the one shorter: no setup.
const J_PERMS: Record<string, string> = { A: "x R2 F R F' R U2 r' U r U2 x'", C: "R U R' F' R U R' U' R' F R2 U' R' U'" };
let s = set("op-edges", "Old Pochmann edges", "Swap the UR buffer with UL by the T perm, each target set up with L, Lw, D and Dw turns and undone after.");
for (const letter of LETTERS) {
  if (samePiece(letter, "B", "edge")) continue;
  const swap = conjugate(setupTo(edge(letter), edge("D"), turnsOf(["L", "Lw", "D", "Dw"])), T_PERM);
  const algs = [{ alg: swap, source: JPERM }];
  if (J_PERMS[letter]) algs.unshift({ alg: J_PERMS[letter]!, source: "https://www.speedsolving.com/wiki/index.php?title=Classic_Pochmann" });
  add(s, `UR ${letter}`, position(letter, "edge"), faceOf(letter), algs);
}
s = set("op-corners", "Old Pochmann corners", "Swap the UBL buffer with RDF (P) by the modified Y perm, each target set up with D, F and R turns and undone after.");
for (const letter of LETTERS) {
  if (samePiece(letter, "A", "corner")) continue;
  const swap = conjugate(setupTo(corner(letter), corner("P"), turnsOf(["D", "F", "R"])), Y_PERM);
  add(s, `UBL ${letter}`, position(letter, "corner"), faceOf(letter), [{ alg: swap, source: JPERM }]);
}

// M2, from the DF buffer: each algorithm swaps the buffer with its target and turns M2, whose UF and DB swap and
// centres are put back by the next one. The M-slice targets have algorithms of their own.
const M2_SOURCE = "https://www.speedsolving.com/wiki/index.php?title=M2/R2";
const M2: Record<string, string> = {
  A: "M2", J: "U R U' M2 U R' U'", V: "U R2 U' M2 U R2 U'", T: "U R' U' M2 U R U'", B: "R' U R U' M2 U R' U' R",
  L: "U' L' U M2 U' L U", X: "U' L2 U M2 U' L2 U", R: "U' L U M2 U' L' U", D: "L U' L' U M2 U' L U L'",
  M: "x' U' R U M2 U' R' U x", P: "x' U' R2 U M2 U' R2 U x", O: "x' U' R' U M2 U' R U x", N: "x' R' U' R U M2 U' R' U R x",
  E: "x' U L' U' M2 U L U' x", F: "x' U L2' U' M2 U L2 U' x", G: "x' U L U' M2 U L' U' x", H: "x' L U L' U' M2 U L U' L' x",
  W: "M U2 M U2", C: "U2 M' U2 M'", I: "D M' U R2 U' M U R2 U' D' M2", Q: "U B' R U' B M2 B' U R' B U'", S: "M2' D U R2 U' M' U R2 U' M D'",
};
const M_SLICE_NOTE = "After an odd number of targets, UF and DB are exchanged: shoot to W for C and to C for W, to S for I and to I for S.";
s = set("m2", "M2 edges", "Swap the DF buffer with UB by M2, each target set up without touching the M slice. UF, FU, DB and BD have algorithms of their own.");
for (const letter of LETTERS) {
  if (samePiece(letter, "U", "edge")) continue;
  add(s, `DF ${letter}`, position(letter, "edge"), faceOf(letter), [{ alg: M2[letter]!, source: M2_SOURCE }],
    "CIWS".includes(letter) ? M_SLICE_NOTE : undefined);
}

// 3-style: the buffer and two targets cycled by a commutator, the most used by the top blindfolders BLDDB gathers.
const BLDDB = "https://blddb.net";
for (const [kind, buffer, label, description] of [
  ["edges", "C", "3-style edges", "Cycle the UF buffer with two targets in one commutator: the algorithms most used by the top blindfolders."],
  ["corners", "C", "3-style corners", "Cycle the UFR buffer with two targets in one commutator: the algorithms most used by the top blindfolders."],
] as const) {
  const type = kind === "edges" ? "edge" : "corner";
  s = set(`3style-${kind}`, label, description);
  for (const a of LETTERS) for (const b of LETTERS) {
    if (samePiece(a, buffer, type) || samePiece(b, buffer, type) || samePiece(a, b, type)) continue;
    const entries = raw[kind][a + b];
    if (!entries?.length) throw Error(`No ${kind} commutator for ${a}${b}`);
    add(s, `${position(buffer, type)} ${a}${b}`, `${position(a, type)} ${position(b, type)}`, a,
      entries.map(([alg, , votes]) => ({ alg, source: BLDDB, votes })), entries[0]![1] || undefined);
  }
}

s = set("parity", "Parity", "An odd number of targets leaves two edges and two corners swapped: one algorithm swaps both pairs back.");
add(s, "Parity OP", "UB UL · UBR UFR", "Old Pochmann", [{ alg: "R U' R' U' R U R D R' U' R D' R' U2 R' U'", source: JPERM }],
  "After the edges, before the corners: undoes the T perms' corner swap, and leaves UB and UL for the corners to swap back.");
// 3-style parity: the last corner target swapped with the UFR buffer, UF and UR swapped with it.
for (const letter of LETTERS) {
  if (samePiece(letter, "C", "corner")) continue;
  const entries = raw.parity[letter];
  if (!entries?.length) throw Error(`No parity algorithm for ${letter}`);
  add(s, `Parity UFR ${letter}`, `UF UR · ${position(letter, "corner")}`, "3-style", entries.map(([alg, , votes]) => ({ alg, source: BLDDB, votes })));
}

// r2, the M2 of the wings on 4×4 and 5×5, from the same page: the M2 algorithms with r2 (2R2: the inner slice alone)
// for M2, and the r and l slices' wings their own. Wings are named by position: UBr is the UB edge's wing on the r side.
const R2_SPECIAL: Record<string, string> = {
  UBr: "2R2", FUr: "F 2D R U R' 2D' R U' R' F' 2R2", BDr: "2R2 F R U R' 2D R U' R' 2D' F'", BUl: "x' F U' R F' U 2R2 U' F R' U F' x",
  UFl: "x' 2L' F U' R F' U 2R2 U' F R' U F' 2L x", FDl: "x' 2L2 F U' R F' U 2R2 U' F R' U F' 2L2 x", DBl: "x' 2L F U' R F' U 2R2 U' F R' U F' 2L' x",
};
// The M2 setups bring these wings to UBr (checked below like every algorithm).
const R2_FROM_M2: Record<string, string> = {
  FRd: "FR", DRb: "DR", BRu: "BR", URf: "UR", FLu: "FL", DLf: "DL", BLd: "BL", ULb: "UL",
  RUb: "RU", RFu: "RF", RDf: "RD", RBd: "RB", LUf: "LU", LFd: "LF", LDb: "LD", LBu: "LB",
};
const M2_BY_EDGE = Object.fromEntries(LETTERS.map(l => [position(l, "edge"), M2[l]]));
for (const size of [4, 5] as const) {
  s = set("r2", "r2 wings", "Swap the DFr wing buffer with UBr by r2 (2R2, the inner slice alone), each wing set up as in M2. FUr, BDr and the l slice's wings have algorithms of their own.", size);
  const algs: [string, string][] = [...Object.entries(R2_SPECIAL), ...Object.entries(R2_FROM_M2).map(([wing, edge]) => [wing, M2_BY_EDGE[edge]!.replace("M2", "2R2")] as [string, string])];
  for (const [wing, alg] of algs.sort(([a], [b]) => "ULFRBD".indexOf(a[0]!) - "ULFRBD".indexOf(b[0]!) || a.localeCompare(b)))
    add(s, `${size}x${size} r2 ${wing}`, wing, wing[0]!, [{ alg, source: M2_SOURCE }]);
}

writeFileSync(resolve(root, "data/bld.json"), JSON.stringify({ sets, cases }, null, 1) + "\n");
console.log(`data/bld.json: ${cases.length} cases in ${sets.length} sets, ${checked} algorithms checked on cubing.js.`);

/**
 * BLDDB's lists, in its Chichu letters (scripts/codeConverter.py there), become Speffz: per pair of targets from the UF
 * and UFR buffers, the two algorithms the most top blindfolders use, with their commutator and how many use them;
 * the parity, UF–UR with the UFR buffer and a corner. A cycle is listed once, under any of its three letters first.
 */
async function fetchBlddb() {
  const url = (file: string) => `https://raw.githubusercontent.com/nbwzx/blddb/v2/public/data/${file}.json`;
  const chichu = "DEGCGAAJEDCXTQLMBBLSQNJYKHIRZZPSHFFYWTNPWIXKOOMR", speffz = "AABDBDCCEEFHFHGGIIJLJLKKMMNPNPOOQQRTRTSSUUVXVXWW";
  const sizes = "UBL UB UBR UL UR UFL UF UFR LUB LU LUF LB LF LDB LD LDF FUL FU FUR FL FR FDL FD FDR RUF RU RUB RF RB RDF RD RDB BUR BU BUL BR BL BDR BD BDL DFL DF DFR DL DR DBL DB DBR".split(" ").map(p => p.length);
  const letters = (n: number) => new Map(sizes.flatMap((size, i) => (size === n ? [[chichu[i]!, speffz[i]!]] : [])));
  const edges = letters(2), corners = letters(3);
  type Entry = [[string], string[], string[]?];
  const best = (entries: Entry[]) => {
    const algs = entries.map(([[alg], users, comm]) => [alg, comm?.[0] ?? "", users.length] as [string, string, number]).sort((a, b) => b[2] - a[2]);
    return algs.filter(([alg], i) => algs.findIndex(a => a[0] === alg) === i).slice(0, 2);
  };
  const out: Record<string, Record<string, [string, string, number][]>> = { edges: {}, corners: {}, parity: {} };
  for (const [kind, map] of [["edges", edges], ["corners", corners]] as const) {
    const data: Record<string, Entry[]> = await (await fetch(url(`${kind.slice(0, -1)}Manmade`))).json();
    const cycles = new Map<string, Entry[]>();
    for (const [code, entries] of Object.entries(data)) {
      const t = [...code].map(c => map.get(c)!).join("");
      // The cycle read from the buffer, C (UF or UFR), whichever letter BLDDB lists it under.
      const type = kind === "edges" ? "edge" : "corner", at = [0, 1, 2].find(i => samePiece(t[i]!, "C", type));
      if (at === undefined) continue;
      // Listed from another sticker of the buffer (FU, FUR, RUF): the same cycle, every piece turned as much.
      const k = [0, 1, 2].find(k => twisted(t[at]!, k, type) === "C")!;
      const pair = [...t.slice(at + 1) + t.slice(0, at)].map(l => twisted(l, k, type)).join("");
      cycles.set(pair, [...(cycles.get(pair) ?? []), ...entries]);
    }
    for (const [pair, entries] of [...cycles].sort()) out[kind]![pair] = best(entries);
  }
  const parity: Record<string, Entry[]> = await (await fetch(url("parityManmade"))).json();
  for (const [code, entries] of Object.entries(parity)) {
    const [e1, e2, c1, c2] = [edges.get(code[0]!), edges.get(code[1]!), corners.get(code[2]!), corners.get(code[3]!)];
    if (new Set([e1, e2]).size === 2 && [e1, e2].every(l => l === "B" || l === "C") && c1 === "C") out.parity![c2!] = best(entries);
  }
  writeFileSync(RAW, JSON.stringify(out, null, 1) + "\n");
}
