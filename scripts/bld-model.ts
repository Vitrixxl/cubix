/**
 * Blindfolded stickers in Speffz letters, read on cubing.js's 3×3×3 model. An algorithm's effect is the colour every
 * sticker shows once it is applied to a solved cube; a case announces it as swaps and cycles of letters, and
 * `mismatches` lists the stickers where the two disagree (none: the algorithm does exactly what is announced).
 */
import { cube3x3x3 } from "cubing/puzzles";

const kpuzzle = await cube3x3x3.kpuzzle();
/** cubing.js's pieces in their orbit's order; a sticker is a piece's slot and the index of its face in the name. */
const NAMES = {
  EDGES: ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"],
  CORNERS: ["UFR", "URB", "UBL", "ULF", "DRF", "DFL", "DLB", "DBR"],
} as const;
type Orbit = keyof typeof NAMES;
export type Sticker = readonly [Orbit, number, number];
const sticker = (orbit: Orbit, slot: string, face: string): Sticker => {
  const i = NAMES[orbit].indexOf(slot as never);
  return [orbit, i, NAMES[orbit][i]!.indexOf(face)];
};

/** Speffz, sticker by sticker: A–D on U from the back left clockwise, then L, F, R, B, D. */
const EDGE_LETTERS: Record<string, [string, string]> = {
  A: ["UB", "U"], B: ["UR", "U"], C: ["UF", "U"], D: ["UL", "U"], E: ["UL", "L"], F: ["FL", "L"], G: ["DL", "L"], H: ["BL", "L"],
  I: ["UF", "F"], J: ["FR", "F"], K: ["DF", "F"], L: ["FL", "F"], M: ["UR", "R"], N: ["BR", "R"], O: ["DR", "R"], P: ["FR", "R"],
  Q: ["UB", "B"], R: ["BL", "B"], S: ["DB", "B"], T: ["BR", "B"], U: ["DF", "D"], V: ["DR", "D"], W: ["DB", "D"], X: ["DL", "D"],
};
const CORNER_LETTERS: Record<string, [string, string]> = {
  A: ["UBL", "U"], B: ["URB", "U"], C: ["UFR", "U"], D: ["ULF", "U"], E: ["UBL", "L"], F: ["ULF", "L"], G: ["DFL", "L"], H: ["DLB", "L"],
  I: ["ULF", "F"], J: ["UFR", "F"], K: ["DRF", "F"], L: ["DFL", "F"], M: ["UFR", "R"], N: ["URB", "R"], O: ["DBR", "R"], P: ["DRF", "R"],
  Q: ["URB", "B"], R: ["UBL", "B"], S: ["DLB", "B"], T: ["DBR", "B"], U: ["DFL", "D"], V: ["DRF", "D"], W: ["DBR", "D"], X: ["DLB", "D"],
};
export const LETTERS = Object.keys(EDGE_LETTERS);
export const edge = (letter: string) => sticker("EDGES", ...EDGE_LETTERS[letter]!);
export const corner = (letter: string) => sticker("CORNERS", ...CORNER_LETTERS[letter]!);
const key = ([orbit, slot, face]: Sticker) => `${orbit}:${slot}:${face}`;
const letterOf = new Map<string, string>([
  ...LETTERS.map(l => [key(edge(l)), `edge ${l}`] as const), ...LETTERS.map(l => [key(corner(l)), `corner ${l}`] as const),
]);
/** The sticker's place on the cube, for messages: "edge A" (Speffz), "CENTERS:2". */
export const describe = (s: Sticker) => letterOf.get(key(s)) ?? key(s);
/** The piece's stickers, starting at this one and turning the way of its name (clockwise for corners). */
const turns = ([orbit, slot, face]: Sticker): Sticker[] => {
  const n = NAMES[orbit][slot]!.length;
  return Array.from({ length: n }, (_, k) => [orbit, slot, (face + k) % n] as const);
};

/** Every sticker of the cube; a centre has one, its slot being its face. */
const STICKERS: Sticker[] = [
  ...(Object.keys(NAMES) as Orbit[]).flatMap(orbit => NAMES[orbit].flatMap((name, slot) => [...name].map((_, face) => [orbit, slot, face] as const))),
  ...Array.from({ length: 6 }, (_, slot) => ["CENTERS" as Orbit, slot, 0] as const),
];

/** Where each sticker's colour comes from once the algorithm is applied to a solved cube: sticker → home sticker. */
export function effect(alg: string): Map<string, Sticker> {
  const data = kpuzzle.defaultPattern().applyAlg(alg).patternData;
  return new Map(STICKERS.map(s => {
    const [orbit, slot, face] = s, { pieces, orientation } = data[orbit]!;
    if (orbit === ("CENTERS" as Orbit)) return [key(s), [orbit, pieces[slot]!, 0] as const];
    const n = NAMES[orbit][slot]!.length;
    return [key(s), [orbit, pieces[slot]!, (face + orientation[slot]!) % n] as const];
  }));
}

/**
 * What a case announces, as cycles of stickers: [a, b, c] sends the piece at a to b and the one at b to c, and so on
 * around, the rest of each piece's stickers following. A swap is a cycle of two. `centres` swaps the centres in pairs.
 */
export function expected(cycles: Sticker[][], centres: [number, number][] = []): Map<string, Sticker> {
  const out = new Map(STICKERS.map(s => [key(s), s] as const));
  for (const cycle of cycles) {
    const pieces = cycle.map(turns);
    pieces.forEach((from, i) => {
      const to = pieces[(i + 1) % pieces.length]!;
      from.forEach((s, k) => out.set(key(to[k]!), s));
    });
  }
  for (const [a, b] of centres) {
    out.set(key(["CENTERS" as Orbit, a, 0]), ["CENTERS" as Orbit, b, 0]);
    out.set(key(["CENTERS" as Orbit, b, 0]), ["CENTERS" as Orbit, a, 0]);
  }
  return out;
}

/** The stickers where the algorithm's effect differs from the announced one; empty when it is exactly that. */
export function mismatches(alg: string, want: Map<string, Sticker>): string[] {
  const got = effect(alg);
  return [...want].flatMap(([k, s]) => key(got.get(k)!) === key(s) ? [] : [`${letterOf.get(k) ?? k} shows ${describe(got.get(k)!)}, not ${describe(s)}`]);
}

/** cubing.js's centres, U L F R B D. */
export const CENTRE = { U: 0, L: 1, F: 2, R: 3, B: 4, D: 5 } as const;

/** One effect after the other: each sticker shows what the first left where the second takes its colour from. */
export const then = (first: Map<string, Sticker>, second: Map<string, Sticker>) =>
  new Map([...second].map(([k, from]) => [k, first.get(key(from))!] as const));

/** M2's own effect beside the swap: UF and DB swapped, and the M slice's centres. */
const M2_SIDE = () => expected([[edge("C"), edge("W")]], [[CENTRE.U, CENTRE.D], [CENTRE.F, CENTRE.B]]);
/**
 * What a blindfolded case's algorithm must do, read from its id (data/bld.json): "UR X" Old Pochmann edges (the T
 * perm's UBR–UFR swap beside), "UBL X" Old Pochmann corners (the Y perm's UB–UL swap beside), "DF X" M2 (then M2's own
 * swaps), "UF XY" and "UFR XY" 3-style cycles, "Parity OP" and "Parity UFR X" two swaps at once.
 */
export function announced(id: string): Map<string, Sticker> {
  const [buffer, t = ""] = id.split(" ").slice(-2);
  if (id === "Parity OP") return expected([[edge("A"), edge("D")], [corner("B"), corner("C")]]);
  if (id.startsWith("Parity UFR ")) return expected([[edge("C"), edge("B")], [corner("C"), corner(t)]]);
  if (buffer === "UR") return expected([[edge("B"), edge(t)], [corner("B"), corner("C")]]);
  if (buffer === "UBL") return expected([[corner("A"), corner(t)], [edge("A"), edge("D")]]);
  if (buffer === "DF") return then(expected([[edge("U"), edge(t)]]), M2_SIDE());
  if (buffer === "UF") return expected([[edge("C"), edge(t[0]!), edge(t[1]!)]]);
  if (buffer === "UFR") return expected([[corner("C"), corner(t[0]!), corner(t[1]!)]]);
  throw Error(`Not a blindfolded case: ${id}`);
}

/**
 * Big cubes' wings, by position: "UBr" is the wing of the UB edge on the r side, the one 2R turns. The r2 method swaps
 * the DFr buffer with UBr by 2R2 (r2), set up like M2; `wingMismatches` checks an algorithm does exactly the swap of
 * the buffer with its target, then r2's other swaps, read on cubing.js's 4×4×4 or 5×5×5: the wings, the midges and corners exactly, the centres by colour.
 */
const BIG = { 4: await (await import("cubing/puzzles")).puzzles["4x4x4"].kpuzzle(), 5: await (await import("cubing/puzzles")).puzzles["5x5x5"].kpuzzle() };
export function wingSlot(size: 4 | 5, name: string): number {
  const kp = BIG[size], moved = (alg: string) => kp.defaultPattern().applyAlg(alg).patternData.EDGES!.pieces.map((p, i) => p !== i);
  const [a, b, side] = [name[0]!, name[1]!, name[2]!.toUpperCase()], ma = moved(a), mb = moved(b), ms = moved(`2${side}`);
  const slot = ma.findIndex((m, i) => m && mb[i] && ms[i]);
  if (slot < 0) throw Error(`No wing ${name}`);
  return slot;
}
export function wingMismatches(size: 4 | 5, alg: string, target: string): string[] {
  const kp = BIG[size], r2 = kp.defaultPattern().applyAlg("2R2").patternData, got = kp.defaultPattern().applyAlg(alg).patternData;
  const buffer = wingSlot(size, "DFr"), spot = wingSlot(size, "UBr"), slot = wingSlot(size, target), wrong: string[] = [];
  const swap = (p: number, a: number, b: number) => (p === a ? b : p === b ? a : p);
  for (const { orbitName: orbit } of kp.definition.orbits) {
    const want = r2[orbit]!, have = got[orbit]!;
    want.pieces.forEach((p, i) => {
      if (orbit === "EDGES") {
        // The buffer swapped with the target, then r2 but for its own UBr–DFr swap (as M2 in `announced`). A wing
        // cannot be flipped in its place, so its piece tells all.
        const expectedPiece = swap(swap(p, spot, buffer), buffer, slot);
        if (have.pieces[i] !== expectedPiece) wrong.push(`wing ${i} holds ${have.pieces[i]}, not ${expectedPiece}`);
      } else if (orbit.startsWith("CENTERS")) {
        if (Math.floor(have.pieces[i]! / 4) !== Math.floor(p / 4) && orbit !== "CENTERS3") wrong.push(`${orbit} ${i} has the wrong colour`);
        if (orbit === "CENTERS3" && have.pieces[i] !== p) wrong.push(`centre ${i} moved`);
      } else if (have.pieces[i] !== p || have.orientation[i] !== want.orientation[i]) wrong.push(`${orbit} ${i} moved`);
    });
  }
  return wrong;
}

/** The stickers (or wings) where a blindfolded case's algorithm does not do what its id announces; none when right. */
export function check(id: string, alg: string): string[] {
  const wing = /^([45])x\d r2 (\w+)$/.exec(id);
  return wing ? wingMismatches(Number(wing[1]) as 4 | 5, alg, wing[2]!) : mismatches(alg, announced(id));
}
