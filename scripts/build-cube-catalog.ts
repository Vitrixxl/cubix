/** Rebuild the portable multi-cube drills consumed by both the browser and the API. */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Alg } from "cubing/alg";
import { AUFS, invertAlg } from "../src/shared/cube";
import type { AlgEntry, CaseDto, SetDto, Stage } from "../src/shared/types";
import type { CubeSize } from "../src/shared/puzzles";
import { HOLDS, kit, unsolved } from "./niche-model";
const sets: SetDto[] = [], cases: CaseDto[] = [];
/** A case: its name, group, algorithm (or algorithms, the one that sets it up first) and source. */
type Entry = [string, string, string | AlgEntry[], string];
function add(size: CubeSize, key: string, stage: Stage, label: string, description: string, entries: Entry[]) {
  const id = `${size}x${size}-${key}`;
  sets.push({ id, cube_size: size, stage, label, description, count: entries.length });
  for (const [name, group, alg, source] of entries) {
    const algorithms = typeof alg === "string" ? [{ alg, source }] : alg;
    cases.push({ id: `${size}x${size} ${key.toUpperCase()} ${name}`, cube_size: size, name, group, stage, set: id, setLabel: label, setup: invertAlg(algorithms[0]!.alg), setups_alt: [], algorithms });
  }
}

/** SpeedCubeDB's cases (bun scripts/fetch-niche-algsets.ts), their algorithms most voted first. */
const RAW: { page: string; name: string; subgroup: string; alts: { alg: string }[] }[] = JSON.parse(readFileSync("data/raw/speedcubedb_niche.json", "utf8"));
const scdb = (page: string) => RAW.filter(c => c.page === page).map(c => ({ ...c, source: `https://speedcubedb.com/a/${page}` }));

/**
 * An algorithm of a `from`-cube for a `to`-cube, in notation the app and cubing.js read alike: layer n of the first
 * (1 the outer one, from the face turned) turns the layers `layers(n)` of the second; by default the same cube, which
 * only rewrites M, E, S (the middle slice on odd cubes, every inner slice on even ones) and r, u… as Rw, Uw….
 */
function remap(alg: string, from: number, layers: (n: number) => number[] = n => [n]): string {
  return alg.replace(/[()]/g, " ").trim().split(/\s+/).map(token => {
    const m = /^(\d+)?([UDFBRLudfbrlMESxyz])(w)?(\d*)('?)$/.exec(token);
    if (!m) throw Error(`Unknown move ${token} in ${alg}`);
    const [, depth, letter, w, times, prime] = m;
    if ("xyz".includes(letter!)) return token;
    const amount = (Number(times || 1) * (prime ? -1 : 1) % 4 + 4) % 4;
    let face = letter!.toUpperCase(), source: number[];
    if ("MES".includes(letter!)) {
      face = { M: "L", E: "D", S: "F" }[letter as "M"];
      source = from % 2 ? [(from + 1) / 2] : Array.from({ length: from - 2 }, (_, i) => i + 2);
    } else if (w || letter !== face) source = Array.from({ length: Number(depth ?? 2) }, (_, i) => i + 1);
    else source = [Number(depth ?? 1)];
    const target = [...new Set(source.flatMap(layers))].sort((a, b) => a - b);
    const block = (n: number) => n === 1 ? face : n === 2 ? `${face}w` : `${n}${face}w`;
    const times_ = (n: number) => ["", "", "2", "'"][n % 4]!;
    if (!amount) return "";
    // Each run of adjacent layers: one turn, or a wide turn less the wide turn of the layers above it.
    const runs: [number, number][] = [];
    for (const n of target) runs.at(-1)?.[1] === n - 1 ? (runs.at(-1)![1] = n) : runs.push([n, n]);
    return runs.map(([a, b]) => a === b && a > 1 ? `${a}${face}${times_(amount)}` : a === 1 ? `${block(b)}${times_(amount)}` : `${block(b)}${times_(amount)} ${block(a - 1)}${times_(4 - amount)}`).join(" ");
  }).filter(Boolean).join(" ");
}

/**
 * The algorithms that solve the case `primary` sets up on cubing.js's model of the cube, with the AUF they need first
 * (the cube may end turned or held another way): the primary, then each other one found, once.
 */
async function verified(size: number, primary: AlgEntry, others: AlgEntry[]): Promise<AlgEntry[]> {
  const k = await kit(`${size}x${size}x${size}`), goal = k.look(k.solved), start = k.solved.applyAlg(new Alg(primary.alg).invert());
  const out = [primary];
  for (const other of others) {
    if (out.some(a => a.alg === other.alg)) continue;
    try { start.applyAlg(other.alg); } catch { continue; }
    const pre = AUFS.find(auf => AUFS.some(after => HOLDS.some(hold => k.look(start.applyAlg(auf).applyAlg(other.alg).applyAlg(`${after} ${hold}`)) === goal)));
    if (pre !== undefined) out.push(pre ? { ...other, pre_auf: pre } : other);
  }
  return out;
}
/** A SpeedCubeDB case for this cube: its first algorithm that reads, then the others that solve the same case. */
async function fromScdb(size: number, c: ReturnType<typeof scdb>[number], from = size, layers?: (n: number) => number[]): Promise<AlgEntry[]> {
  const algs = c.alts.flatMap(a => { try { return [{ alg: remap(a.alg, from, layers), source: c.source }]; } catch { return []; } });
  if (!algs.length) throw Error(`No algorithm reads for ${c.page} ${c.name}`);
  return verified(size, algs[0]!, algs.slice(1));
}
/** Assert what a set's cases leave unsolved: their algorithms are what the set says they are. */
function expect(entries: Entry[], size: number, ok: (u: ReturnType<typeof unsolved>) => boolean) {
  for (const [name, , alg] of entries) {
    const u = unsolved(size, invertAlg(typeof alg === "string" ? alg : alg[0]!.alg));
    if (!u.stickers || !ok(u)) throw Error(`${size}x${size} ${name}: ${JSON.stringify(u)}`);
  }
  return entries;
}
const oll = "https://www.jperm.net/algs/2x2/oll", pbl = "https://www.jperm.net/algs/2x2/pbl";
add(2, "oll", "OLL", "Ortega OLL", "Orient the last face after building the first face. Seven Ortega cases.", [
  ["L", "2 corners", "F R' F' R U R U' R'", oll],
  ["U", "2 corners", "F R U R' U' F'", oll],
  ["T", "2 corners", "R U R' U' R' F R F'", oll],
  ["Pi", "0 corners", "R U2 (R2 U' R2 U' R2) U2 R", oll],
  ["H", "0 corners", "R2 U2 R U2 R2", oll],
  ["Antisune", "1 corner", "R U2 R' U' R U' R'", oll],
  ["Sune", "1 corner", "R U R' U R U2 R'", oll],
]);
add(2, "pbl", "PBL", "Ortega PBL", "Permute both layers after orienting both faces. Five Ortega cases.", [
  ["Adjacent U", "Solved bottom", "R U R' U' R' F R2 U' R' U' R U R' F'", pbl],
  ["Diagonal U", "Solved bottom", "F R U' R' U' R U R' F' R U R' U' R' F R F'", pbl],
  ["Adjacent / adjacent", "Both layers", "R2 U' B2 U2 R2 U' R2", pbl],
  ["Adjacent / diagonal", "Both layers", "R U' R F2 R' U R'", pbl],
  ["Diagonal / diagonal", "Both layers", "R2 F2 R2", pbl],
]);
for (const size of [4, 5, 6, 7] as const) {
  const centers: Entry[] = [], edges: Entry[] = [], parity: Entry[] = [];
  const tutorial = size === 4 ? "https://www.jperm.net/4x4" : "https://jperm.net/5x5";
  for (let depth = 2; depth <= Math.floor(size / 2); depth++) {
    const r = `${depth}R`, u = `${depth}U`;
    // Commutator drills are exact inverse setups, not an exhaustive catalogue of intuitive reduction.
    centers.push([`Center cycle · slice ${depth}`, "Center commutators", `${r} U ${r}' ${u} ${r} U' ${r}' ${u}'`, "Cubix · center commutator drill"]);
    centers.push([`Reverse center cycle · slice ${depth}`, "Center commutators", `${u} ${r} U ${r}' ${u}' ${r} U' ${r}'`, "Cubix · center commutator drill"]);
    edges.push([`Slice / flip / restore · slice ${depth}`, "Edge pairing", `${u} R U R' F R' F' R ${u}'`, tutorial]);
    // The wing parity sequence acts on the selected inner slice, preserving other wing orbits.
    parity.push([`Wing parity · slice ${depth}`, "Last two edges", `${r}' U2 ${depth}L F2 ${depth}L' F2 ${r}2 U2 ${r} U2 ${r}' U2 F2 ${r}2 F2`, "https://www.speedcubedb.com/a/5x5/L2E"]);
  }
  edges.push(["Edge flip", "Edge pairing", "R U R' F R' F' R", tutorial]);
  if (size % 2 === 0) {
    const width = size / 2;
    const r = width === 2 ? "Rw" : `${width}Rw`, l = width === 2 ? "Lw" : `${width}Lw`, u = width === 2 ? "Uw" : `${width}Uw`;
    parity.push(["OLL parity", "After reduction", `${r} U2 x ${r} U2 ${r} U2 ${r}' U2 ${l} U2 ${r}' U2 ${r} U2 ${r}' U2 ${r}'`, "https://www.jperm.net/4x4"]);
    // Turn the inner half-block only; outer R cancels the outer layer of Rw.
    const inner = `${r}2 R2`;
    parity.push(["PLL parity", "After reduction", `${inner} U2 ${inner} ${u}2 ${inner} ${u}2`, "https://www.jperm.net/4x4"]);
  }
  if (size === 4 || size === 6) {
    // SpeedCubeDB's 4×4 parities; on the 6×6, each inner slice of the 4×4 turns both inner slices on its side.
    const layers = size === 6 ? (n: number) => [[1], [2, 3], [4, 5], [6]][n - 1]! : undefined;
    const from4 = (page: string, name: string) => fromScdb(size, scdb(page).find(c => c.name === name)!, 4, layers);
    const more = async (name: string, alts: Promise<AlgEntry[]>) => {
      const entry = parity.find(e => e[0] === name)!;
      entry[2] = await verified(size, { alg: entry[2] as string, source: entry[3] }, await alts);
    };
    await more("OLL parity", from4("4x4/OLLParity", "Basic"));
    await more("PLL parity", from4("4x4/PLLParity", "OPP Parity"));
    const oll = "https://speedcubedb.com/a/4x4/OLLParity";
    if (size === 4) await more("Wing parity · slice 2", from4("4x4/OLLParity", "Pure"));
    else {
      const l2e = (name: string) => fromScdb(6, scdb("6x6/6x6L2E").find(c => c.name === name)!);
      await more("Wing parity · slice 2", l2e("Wing Parity"));
      await more("Wing parity · slice 3", l2e("Middle Parity"));
      parity.push(["Pure OLL parity", "After reduction", await from4("4x4/OLLParity", "Pure"), oll]);
      parity.push(["Inner wing swap", "Last two edges", await l2e("Swap single piece"), "https://speedcubedb.com/a/6x6/6x6L2E"]);
    }
    parity.push(["OLL and PLL parity", "After reduction", await from4("4x4/OLLParity", "M"), oll]);
  }
  add(size, "centers", "Centers", "Center drills", "Practise center commutators at each inner depth. Build bars and centers intuitively; these drills cover useful cycles.", centers);
  add(size, "edges", "Edges", "Edge pairing", "Practise the edge-flip trigger and slice / flip / restore at each wing depth. Start from the displayed setup.", edges);
  add(size, "parity", "Parity", "Parity", size % 2 ? "Last-two-edge wing parity, by slice depth. Odd cubes have no PLL parity after reduction." : "Wing parity by slice depth, plus OLL and PLL parity after reduction. Start from the displayed setup.", parity);
}
// One algorithm for each last layer with PLL parity, on the 4×4 and the 6×6.
const PLL_NAMES: Record<string, string> = { "OPP Parity": "Opposite edge swap", "Adj Parity": "Adjacent edge swap", CwO: "O, clockwise", CcwO: "O, counterclockwise", W: "W", "Diag C": "Diagonal C" };
const PLL_GROUPS: Record<string, string> = { "Edge Swap": "Edges only", "Adj Corner Swap": "Adjacent corner swap", "Diag Corner Swap": "Diagonal corner swap" };
for (const size of [4, 6] as const) {
  const layers = size === 6 ? (n: number) => [[1], [2, 3], [4, 5], [6]][n - 1]! : undefined, entries: Entry[] = [];
  for (const c of scdb("4x4/PLLParity")) entries.push([PLL_NAMES[c.name] ?? c.name, PLL_GROUPS[c.subgroup]!, await fromScdb(size, c, 4, layers), c.source]);
  add(size, "pll-parity", "Parity", "PLL parity cases", "Every last layer with PLL parity, solved in one algorithm instead of a PLL and the parity: the edges alone, or with an adjacent or a diagonal corner swap.", expect(entries, size, u => u.pll && !u.edges && !u.centres));
}
// Last two centers and last two edges of the 5×5 and the 6×6.
const l2c = (size: CubeSize, page: string, name: (c: ReturnType<typeof scdb>[number], i: number) => string) => Promise.all(scdb(page).map(async (c, i): Promise<Entry> => [name(c, i), "Last two centers", await fromScdb(size, c), c.source]));
add(5, "l2c", "Centers", "Last two centers", "The last two centers of the 5×5, built on F and U: one algorithm for each pattern of the pieces left on U.", expect(await l2c(5, "5x5/L2C", c => `Last two centers ${c.name.replace(/^L2C /, "")}`), 5, u => u.centres === 2));
// SpeedCubeDB repeats some names for mirrored cases: the second one is numbered.
const seen = new Map<string, number>();
add(6, "l2c", "Centers", "Last two centers", "The last two centers of the 6×6, built on F and U, named by the shapes left on U: obliques, bars and pairs.", expect(await l2c(6, "6x6/6x6L2C", c => {
  const name = c.name.replace(/Ba$/, "Bar").replace(/\b(Bar|Center|And)\b/g, w => w.toLowerCase()).replace(/^./, x => x.toUpperCase()), n = (seen.get(name) ?? 0) + 1;
  seen.set(name, n);
  return n > 1 ? `${name} · ${n}` : name;
}), 6, u => u.centres === 2));
const l2e5 = await Promise.all(scdb("5x5/L2E").map(async (c): Promise<Entry> => [`Last two edges ${c.name.replace(/^L2E /, "")}`, "Last two edges", await fromScdb(5, c), c.source]));
add(5, "l2e", "Edges", "Last two edges", "Every case of the last two edges of the 5×5, held at UF and DF or UF and UB: wings, midges, flips and parity.", expect(l2e5, 5, u => u.edges <= 2 && !u.centres));
// The 7×7 pairs each orbit of wings like a 5×5: its layers 2 and 3 in turn, the others moving as blocks.
const l2e7: Entry[] = [];
// Layer 3: the 5×5's outer layer is the 7×7's, or its outer two as one, whichever leaves layer 2 paired.
const ORBITS: Record<number, number[][][]> = { 2: [[[1], [2], [3, 4, 5], [6], [7]]], 3: [[[1], [3], [4], [5], [7]], [[1, 2], [3], [4], [5], [6, 7]]] };
for (const depth of [2, 3]) for (const c of scdb("5x5/L2E")) {
  const name = `Last two edges ${c.name.replace(/^L2E /, "")} · layer ${depth}`;
  let found: AlgEntry[] | undefined;
  for (const map of ORBITS[depth]!) for (const alt of c.alts) {
    if (found) break;
    try {
      const alg = remap(alt.alg, 5, n => map[n - 1]!), u = unsolved(7, invertAlg(alg));
      if (u.edges <= 2 && !u.centres) found = await verified(7, { alg, source: c.source }, c.alts.flatMap(a => { try { return [{ alg: remap(a.alg, 5, n => map[n - 1]!), source: c.source }]; } catch { return []; } }));
    } catch {}
  }
  // ponytail: a case none of whose algorithms carries over to the 7×7 is left out.
  if (found) l2e7.push([name, `Layer ${depth}`, found, c.source]);
  else console.log(`7x7 ${name}: no algorithm carries over`);
}
add(7, "l2e", "Edges", "Last two edges", "The last two edges of the 5×5 on each orbit of wings of the 7×7: layer 2 with the middle three slices as one, then layer 3.", expect(l2e7, 7, u => u.edges <= 2 && !u.centres));
await writeFile("data/multi-cube.json", JSON.stringify({ sets, cases }, null, 2) + "\n");
