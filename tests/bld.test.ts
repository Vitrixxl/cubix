/**
 * The blindfolded sets (data/bld.json, scripts/build-bld-catalog.ts), checked again on cubing.js: every algorithm of
 * every case does exactly the swap or cycle its id announces in Speffz letters (wings by position on the 4×4 and 5×5),
 * with its method's side effect, and leaves every other piece where it was.
 */
import { expect, test } from "bun:test";
import { cases, sets } from "../src/client/local/catalog";
import { announced, check, effect, describe, mismatches } from "../scripts/bld-model";
import { applyAlg, invertAlg, parseScramble, slotsFor, solved } from "../src/shared/cube";
import { HELD_HEX, hexOf } from "../src/shared/cubeAppearance";
import {
  BLD_COLORS, BLD_FACES, BUFFERS, DEFAULT_BUFFERS, SPEFFZ, allPairs, bldPicture, bldState, cleanBuffers, cleanCommFilter, cleanScheme, commKeys, commKnown, commLetters,
  commOf, commPool, doesComm, memoText, nextPair, ownAlg, recentPairs, repeated, reviewPair, sameMemo, stickerAt, traceMemo, withLetter, withOwnAlg,
  type BldBuffers, type CommFilter,
} from "../src/client/lib/bld";

const bld = cases.filter((c) => c.stage === "BLD");

test("the blindfolded sets: Old Pochmann, M2, 3-style from UF and UFR, the parities, and r2 on 4×4 and 5×5", () => {
  const count = (id: string) => sets.find((s) => s.id === id)?.count;
  expect([count("3bld-op-edges"), count("3bld-op-corners"), count("3bld-m2"), count("3bld-3style-edges"), count("3bld-3style-corners"), count("3bld-parity"), count("4x4-bld-r2"), count("5x5-bld-r2")]).toEqual([22, 21, 22, 440, 378, 22, 23, 23]);
});

test("every blindfolded algorithm does exactly what its case announces", () => {
  const failures: string[] = [];
  let checked = 0;
  for (const c of bld) for (const a of c.algorithms) {
    checked++;
    const wrong = check(c.id, a.alg);
    if (wrong.length) failures.push(`${c.id}: ${a.alg}: ${wrong.slice(0, 3).join("; ")}`);
  }
  expect(checked).toBeGreaterThan(1700);
  expect(failures).toEqual([]);
});

test("the check tells a wrong algorithm", () => {
  const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
  // The T perm swaps UR with UL (D), not UB (A); and the sticker model reads R as cubing.js turns it.
  expect(mismatches(tPerm, announced("UR D"))).toEqual([]);
  expect(mismatches(tPerm, announced("UR A")).length).toBeGreaterThan(0);
  expect(mismatches(`${tPerm} U`, announced("UR D")).length).toBeGreaterThan(0);
  expect(describe(effect("R").get("CORNERS:0:0")!)).toBe("corner K");
  // r2 alone shoots to UBr, not to UFr; on the 5×5 too.
  expect(check("4x4 r2 UBr", "2R2")).toEqual([]);
  expect(check("4x4 r2 FUr", "2R2").length).toBeGreaterThan(0);
  expect(check("5x5 r2 UBr", "R2").length).toBeGreaterThan(0);
});


// The blindfolded trainer (src/client/lib/bld.ts): the memo traced from a cube, the scheme, the buffers, the pairs.
type Kind = "edges" | "corners" | "wings" | "xcentres" | "plus";
/** A memo as one record: each kind's targets, what is noted apart, and the parities. */
const flat = (m: ReturnType<typeof traceMemo>) => {
  const part = (kind: Kind) => m.find((p) => p.kind === kind);
  return {
    edges: part("edges")?.targets ?? [], corners: part("corners")?.targets ?? [],
    flipped: part("edges")?.turned ?? [], twisted: part("corners")?.turned ?? [], parity: !!part("corners")?.parity,
  };
};
const memo = (alg: string, scheme = SPEFFZ, buffers?: Partial<BldBuffers>) => flat(traceMemo(bldState(alg), scheme, { ...DEFAULT_BUFFERS, ...buffers }));
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

test("a solved cube has no memo", () => {
  expect(memo("")).toEqual({ edges: [], corners: [], flipped: [], twisted: [], parity: false });
  expect(memoText(traceMemo(bldState("")))).toBe("");
  for (const n of [4, 5]) expect(traceMemo(solved(n)).every((p) => !p.targets.length && !p.turned.length && !p.parity)).toBe(true);
});

test("every 3-style case's state, from UF and UFR, traces to its two targets", () => {
  let checked = 0;
  for (const c of bld) {
    const [buffer, targets] = c.id.split(" ");
    if ((buffer !== "UF" && buffer !== "UFR") || targets?.length !== 2) continue;
    const m = memo(invertAlg(c.algorithms[0]!.alg));
    expect([...(buffer === "UF" ? m.edges : m.corners)]).toEqual([...targets]);
    expect([m.flipped, m.twisted, m.parity, buffer === "UF" ? m.corners : m.edges]).toEqual([[], [], false, []]);
    expect(doesComm(c.id, buffer === "UF" ? "edges" : "corners", c.algorithms[0]!.alg)).toBe(true);
    checked++;
  }
  expect(checked).toBe(818);
});

test("a cycle break goes to the lowest unsolved piece and comes back to it; odd counts are parity", () => {
  // The T perm swaps UR with UL and UFR with UBR: UF is solved, so the edges break into UR (B).
  expect(memo(T_PERM)).toEqual({ edges: ["B", "D", "B"], corners: ["B"], flipped: [], twisted: [], parity: true });
  expect(memoText(traceMemo(bldState(T_PERM)))).toBe("BD B B");
});

test("flipped edges and twisted corners in place are noted apart", () => {
  expect(memo("(M' U)4 (M U)4")).toMatchObject({ edges: [], corners: [], flipped: ["A", "B", "C", "D"] });
  // UFR and UBR twisted in place: noted by where their U sticker now is (UFR's on F: J, UBR's on B: Q).
  expect(memo("(R' D' R D)2 U (D' R' D R)2 U'")).toMatchObject({ edges: [], corners: [], twisted: ["Q", "J"] });
});

test("the scramble's last wide turns or rotations are undone first", () => {
  expect(memo("R Uw")).toEqual(memo("R D"));
  expect(memo("R U x y")).toEqual(memo("R U"));
  const big = (alg: string, n: number) => traceMemo(bldState(alg, n));
  // A 4×4 has no centres to hold it by: its scramble's last rotations are undone.
  expect(big("R 2U Fw x y'", 4)).toEqual(big("R 2U Fw", 4));
  // A 5×5's centres: 3Uw is 2Dw (Dw) and a y.
  expect(big("R 3Uw", 5)).toEqual(big("R Dw", 5));
});

test("another scheme's letters", () => {
  const scheme = withLetter(withLetter(SPEFFZ, "edges", 1, "z"), "corners", 1, "Ü");
  expect(scheme.edges.slice(0, 3)).toBe("AZC");
  expect(memo(T_PERM, scheme)).toMatchObject({ edges: ["Z", "D", "Z"], corners: ["Ü"] });
  // A letter given twice is told on both stickers.
  const twice = withLetter(SPEFFZ, "edges", 1, "a");
  expect([repeated(twice, "edges", 0), repeated(twice, "edges", 1), repeated(twice, "edges", 2), repeated(twice, "corners", 1)]).toEqual([true, true, false, false]);
  expect(cleanScheme({ edges: "ab", corners: 3 })).toEqual({ ...SPEFFZ, edges: "AB" + SPEFFZ.edges.slice(2) });
});

test("other buffers", () => {
  // UR in the buffer holds UL's piece; from UBL the corners break into UBR (B).
  expect(memo(T_PERM, SPEFFZ, { edges: "UR", corners: "UBL" })).toEqual({ edges: ["D"], corners: ["B", "C", "B"], flipped: [], twisted: [], parity: true });
  expect(memo("(M' U)4 (M U)4", SPEFFZ, { edges: "DF", corners: "UFR" }).flipped).toEqual(["A", "B", "C", "D"]);
  expect(cleanBuffers({ edges: "DF", corners: "DBL", wings: "UFr", plus: "Zz" })).toEqual({ ...DEFAULT_BUFFERS, edges: "DF", wings: "UFr" });
});

test("a memo typed is read letters only", () => {
  const m = traceMemo(bldState(T_PERM));
  expect(sameMemo("bd b / b", m)).toBe(true);
  expect(sameMemo("BD BB", m)).toBe(true);
  expect(sameMemo("BD B", m)).toBe(false);
  expect(recentPairs(m, ["XY", "BD"])).toEqual(["BD", "XY"]);
});

test("the cube drawn shows the cube traced, white on top and green in front", () => {
  for (const [n, scrambles] of [[3, ["", T_PERM, "R U F' Rw Uw'", "D2 B L' Fw2 Uw"]], [4, ["R 2U Fw x y'", "Uw2 B' z"]], [5, ["R 3Uw", "2L Fw 3Rw' 3Fw"]]] as const)
    for (const scramble of scrambles) {
      const face = (slot: number) => "UDFBRL"[Math.floor(slot / (n * n))] as keyof typeof HELD_HEX;
      const traced = bldState(scramble, n), shown = applyAlg(solved(n), parseScramble(bldPicture(scramble, n), n));
      expect(Array.from(shown, (o) => hexOf(HELD_HEX[face(o)]))).toEqual(Array.from(traced, (o) => BLD_COLORS[face(o)]));
    }
});

test("letter pairs: Again comes back three cards later, Got it moves a pair up", () => {
  expect(allPairs(SPEFFZ)).toHaveLength(24 * 23);
  let boxes = reviewPair({}, "AB", false);
  expect(boxes).toEqual({ AB: 0 });
  expect(nextPair(["AB", "CD", "EF"], boxes, ["XY"], () => 0)).toBe("AB");
  expect(nextPair(["AB", "CD", "EF"], boxes, ["AB", "CD"], () => 0)).toBe("EF");
  boxes = reviewPair(reviewPair(boxes, "AB", true), "AB", true);
  expect(boxes.AB).toBe(2);
  // Drawn by weight: box 4 weighs 1, an unseen pair 4.
  expect(nextPair(["AB", "CD"], { AB: 4 }, [], () => 0.1)).toBe("AB");
  expect(nextPair(["AB", "CD"], { AB: 4 }, [], () => 0.5)).toBe("CD");
  expect(nextPair([], {}, [])).toBeUndefined();
});

// Commutators: the catalogue's from UF and UFR, turned for the other buffers; the player's own; the filters.
const find = (id: string) => cases.find((c) => c.id === id);
test("every commutator of every buffer is found and does its cycle", () => {
  for (const kind of ["edges", "corners"] as const)
    for (const buffer of Object.keys(BUFFERS[kind])) {
      const keys = commKeys(kind, { ...DEFAULT_BUFFERS, [kind]: buffer });
      expect(keys).toHaveLength(kind === "edges" ? 440 : 378);
      for (const key of keys) expect(doesComm(key, kind, commOf(key, kind, find)!.alg)).toBe(true);
    }
  expect(commOf("UF AB", "edges", find)).toEqual({ alg: "R2 U' S R2 S' R2 U R2", notation: "R2 U':[S,R2]" });
  // From UR, the UF commutator a y brings there.
  expect(commOf("UR AC", "edges", find)!.alg).toStartWith("y (");
  expect(commOf("UBL BC", "corners", find)!.notation).toStartWith("[y2: ");
  expect(doesComm("UF AB", "edges", "R U R'")).toBe(false);
  expect(doesComm("UF AB", "edges", "not moves")).toBe(false);
});

test("commutators drilled: by kind, by first letter in the player's scheme, the unknown ones only", () => {
  const scheme = withLetter(SPEFFZ, "edges", 0, "z");
  expect(commLetters("UF AB", "edges", scheme)).toBe("ZB");
  const pool = (filter: Partial<CommFilter>, boxes = {}) => commPool({ ...cleanCommFilter(null), ...filter }, DEFAULT_BUFFERS, scheme, boxes);
  expect(pool({})).toHaveLength(440);
  // Z (UB) is one of 22 targets, each paired with 20 others.
  expect(pool({ letter: "Z" })).toHaveLength(20);
  expect(pool({ letter: "Z" }).every((key) => key.startsWith("UF A"))).toBe(true);
  expect(pool({ kind: "corners", letter: "B" })).toHaveLength(18);
  const known = reviewPair(reviewPair({}, "UF AB", true), "UF AB", true);
  expect(commKnown(known, "UF AB")).toBe(true);
  expect(pool({ letter: "Z", fresh: true }, known)).toHaveLength(19);
  expect(cleanCommFilter({ kind: "corners", letter: 3, fresh: "yes" })).toEqual({ kind: "corners", letter: "", fresh: false });
});

test("the player's own algorithm for a case", () => {
  let own = withOwnAlg({}, "UF AB", "R2 U R2 S R2 S' U' R2");
  expect(ownAlg(own, "UF AB")).toBe("R2 U R2 S R2 S' U' R2");
  own = withOwnAlg(own, "UF AB", "");
  expect(ownAlg(own, "UF AB")).toBeUndefined();
  expect(own["UF AB"]!.algs).toEqual(["R2 U R2 S R2 S' U' R2"]);
});

// Big cubes. An independent tracer: the pieces by their position (slotsFor's geometry), the targets read as swaps of
// the buffer with each target, which must solve every piece; and, for pieces told apart, the count the cycles give.
const h = (n: number) => (n - 1) / 2;
/** The kind of a sticker's piece, from its coordinates alone. */
function kindAt(n: number, p: readonly number[]): Kind | null {
  const outer = p.filter((c) => Math.abs(c) === h(n)).length, inner = p.filter((c) => Math.abs(c) === h(n) - 1).length, middle = p.filter((c) => c === 0).length;
  if (outer === 3) return "corners";
  if (outer === 2) return middle === 1 ? "edges" : inner === 1 ? "wings" : null;
  if (outer === 1) return inner === 2 ? "xcentres" : inner === 1 && middle === 1 ? "plus" : null;
  return null;
}
/** Each letter's slot, read off the nets. */
function letterSlots(n: number, kind: Kind) {
  const slots: number[] = [];
  for (const face of BLD_FACES)
    for (let f = 0; f < n * n; f++) {
      const sticker = stickerAt(face, f, n);
      if (sticker?.kind === kind) slots[sticker.index] = "UDFBRL".indexOf(face) * n * n + f;
    }
  return slots;
}
const BUFFER_SPOT: Record<Kind, (n: number) => Record<string, number[]>> = {
  edges: (n) => ({ UF: [0, h(n), h(n)], DF: [0, -h(n), h(n)], UR: [h(n), h(n), 0] }),
  corners: (n) => ({ UFR: [h(n), h(n), h(n)], UBL: [-h(n), h(n), -h(n)] }),
  wings: (n) => ({ DFr: [h(n) - 1, -h(n), h(n)], UFr: [h(n) - 1, h(n), h(n)] }),
  xcentres: (n) => ({ Ubl: [1 - h(n), h(n), 1 - h(n)], Ufr: [h(n) - 1, h(n), h(n) - 1] }),
  plus: (n) => ({ Ub: [0, h(n), 1 - h(n)], Uf: [0, h(n), h(n) - 1] }),
};
function crossCheck(state: ReturnType<typeof solved>, part: ReturnType<typeof traceMemo>[number], buffer: string) {
  const n = Math.sqrt(state.length / 6), geometry = slotsFor(n), kind = part.kind as Kind, key = (p: readonly number[]) => p.join();
  const slots = geometry.map((_, s) => s).filter((s) => kindAt(n, geometry[s]!.p) === kind);
  const spot = key(BUFFER_SPOT[kind](n)[buffer]!), letters = letterSlots(n, kind), targets = part.targets.map((l) => letters[SPEFFZ[kind].indexOf(l)]!);
  if (kind === "xcentres" || kind === "plus") {
    // Centres alike: the colours, swapped buffer with target; the buffer is its U-face sticker.
    const colour = (s: number) => Math.floor(state[s]! / (n * n)), at = new Map(slots.map((s) => [s, colour(s)])), b = slots.find((s) => key(geometry[s]!.p) === spot)!;
    const wrong = slots.filter((s) => s !== b && colour(s) !== Math.floor(s / (n * n))).length;
    for (const t of targets) {
      const held = at.get(b)!;
      at.set(b, at.get(t)!);
      at.set(t, held);
    }
    expect([...at].every(([s, c]) => c === Math.floor(s / (n * n)))).toBe(true);
    expect(part.targets.length).toBeGreaterThanOrEqual(wrong);
    return;
  }
  // Pieces told apart: which piece each position holds.
  const pieceOf = (s: number) => key(geometry[s]!.p), positions = [...new Set(slots.map(pieceOf))], holds = new Map(positions.map((p) => [p, pieceOf(state[slots.find((s) => pieceOf(s) === p)!]!)]));
  let expected = 0;
  const seen = new Set<string>();
  for (const start of [spot, ...positions]) {
    if (seen.has(start)) continue;
    let length = 0;
    for (let p = start; !seen.has(p); p = holds.get(p)!) seen.add(p), length++;
    expected += start === spot ? length - 1 : length > 1 ? length + 1 : 0;
  }
  expect(part.targets.length).toBe(expected);
  for (const t of targets) {
    const a = holds.get(spot)!;
    holds.set(spot, holds.get(pieceOf(t))!);
    holds.set(pieceOf(t), a);
  }
  expect([...holds].every(([p, piece]) => p === piece)).toBe(true);
  expect(part.parity).toBe((kind === "wings" || kind === "corners") && expected % 2 === 1);
}
/** Random moves of every layer, the same each run. */
function scrambleOf(n: number, length: number, seed: number) {
  let x = seed;
  const random = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const layers = n === 5 ? ["", "w", "2", "3w"] : ["", "w", "2"];
  return Array.from({ length }, () => {
    const face = "URFDLB"[Math.floor(random() * 6)]!, layer = layers[Math.floor(random() * layers.length)]!, turn = ["", "'", "2"][Math.floor(random() * 3)]!;
    return (layer === "2" ? "2" + face : layer === "3w" ? "3" + face + "w" : face + layer) + turn;
  }).join(" ");
}

test("big cubes: the memo's order, and its letters checked by an independent tracer for every piece type and buffer", () => {
  expect(traceMemo(solved(4)).map((p) => p.kind)).toEqual(["xcentres", "wings", "corners"]);
  expect(traceMemo(solved(5)).map((p) => p.kind)).toEqual(["plus", "xcentres", "wings", "edges", "corners"]);
  for (const n of [4, 5])
    for (let seed = 1; seed <= 12; seed++) {
      const state = bldState(scrambleOf(n, 40, seed * 7919), n);
      for (const choice of [0, 1]) {
        const buffers = Object.fromEntries(Object.entries(BUFFERS).map(([kind, all]) => [kind, Object.keys(all)[choice % Object.keys(all).length]])) as BldBuffers;
        for (const part of traceMemo(state, SPEFFZ, buffers)) crossCheck(state, part, buffers[part.kind]);
      }
    }
});

test("a wing never lands flipped: every turn takes the lettered wing stickers to lettered ones", () => {
  for (const n of [4, 5]) {
    const lettered = new Set(letterSlots(n, "wings"));
    for (const face of "URFDLB")
      for (const layer of n === 5 ? ["", "2", "3"] : ["", "2"]) {
        const turned = applyAlg(solved(n), `${layer}${face}`);
        for (const s of lettered) expect(lettered.has(turned[s]!)).toBe(true);
      }
  }
});

test("single cycles of each big piece type trace to their two targets", () => {
  // A 3-cycle made by hand: the buffer holds the first target's piece, which holds the second's, which holds the buffer's.
  const cycle = (n: number, kind: Kind, buffer: number, a: number, b: number) => {
    const slots = letterSlots(n, kind), geometry = slotsFor(n), state = solved(n);
    const partner = (s: number) => geometry.findIndex((g, i) => i !== s && g.p.join() === geometry[s]!.p.join());
    const set = (to: number, from: number) => {
      state[slots[to]!] = slots[from]!;
      if (kind === "wings") state[partner(slots[to]!)] = partner(slots[from]!);
    };
    set(buffer, a), set(a, b), set(b, buffer);
    return traceMemo(state).find((p) => p.kind === kind)!;
  };
  // Wings from DFr (K): A (UBl) then V (DRb); x-centres from Ubl (A): F then S; +-centres from Ub (A): J then W.
  expect(cycle(4, "wings", 10, 0, 21)).toEqual({ kind: "wings", targets: ["A", "V"], turned: [], parity: false });
  expect(cycle(5, "wings", 10, 0, 21).targets).toEqual(["A", "V"]);
  expect(cycle(4, "xcentres", 0, 5, 18).targets).toEqual(["F", "S"]);
  expect(cycle(5, "plus", 0, 9, 22).targets).toEqual(["J", "W"]);
  // Two centres of the same face are alike: a swap within a face is no memo.
  expect(cycle(4, "xcentres", 0, 1, 2).targets).toEqual([]);
});

test("wing and corner parities stand apart on the 4×4", () => {
  // An inner slice quarter turn cycles four wings (odd), the corners stay; a face turn cycles four corners and two fours of wings.
  const parity = (alg: string) => traceMemo(bldState(alg, 4)).filter((p) => p.parity).map((p) => p.kind);
  expect(parity("2R")).toEqual(["wings"]);
  expect(parity("R")).toEqual(["corners"]);
  expect(parity("R 2R")).toEqual(["wings", "corners"]);
});

test("centres alike: the fewest letters where a cycle could end early", () => {
  // 2R2 on the 4×4: eight x-centres off their face (U with D, F with B), the buffer's own in place. Its U centre goes
  // straight to a U place holding a D centre, without a break; F and B, apart from the buffer's colour, take one break
  // and its return: nine letters, the fewest.
  const xcentres = traceMemo(bldState("2R2", 4)).find((p) => p.kind === "xcentres")!;
  expect(xcentres.targets).toHaveLength(9);
  expect(xcentres.targets[0]).toMatch(/[BC]/);
});
