/**
 * The blindfolded sets (data/bld.json, scripts/build-bld-catalog.ts), checked again on cubing.js: every algorithm of
 * every case does exactly the swap or cycle its id announces in Speffz letters (wings by position on the 4×4 and 5×5),
 * with its method's side effect, and leaves every other piece where it was.
 */
import { expect, test } from "bun:test";
import { cases, sets } from "../src/client/local/catalog";
import { announced, check, effect, describe, mismatches } from "../scripts/bld-model";
import { applyAlg, invertAlg, parseScramble, solved } from "../src/shared/cube";
import { HELD_HEX, hexOf } from "../src/shared/cubeAppearance";
import { BLD_COLORS, SPEFFZ, allPairs, bldPicture, bldState, cleanBuffers, cleanScheme, memoText, nextPair, recentPairs, repeated, reviewPair, sameMemo, traceMemo, withLetter } from "../src/client/lib/bld";

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
const memo = (alg: string, scheme = SPEFFZ, buffers?: Parameters<typeof traceMemo>[2]) => traceMemo(bldState(alg), scheme, buffers);
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

test("a solved cube has no memo", () => {
  expect(memo("")).toEqual({ edges: [], corners: [], flipped: [], twisted: [], parity: false });
  expect(memoText(memo(""))).toBe("");
});

test("every 3-style case's state, from UF and UFR, traces to its two targets", () => {
  let checked = 0;
  for (const c of bld) {
    const [buffer, targets] = c.id.split(" ");
    if ((buffer !== "UF" && buffer !== "UFR") || targets?.length !== 2) continue;
    const m = memo(invertAlg(c.algorithms[0]!.alg));
    expect([...(buffer === "UF" ? m.edges : m.corners)]).toEqual([...targets]);
    expect([m.flipped, m.twisted, m.parity, buffer === "UF" ? m.corners : m.edges]).toEqual([[], [], false, []]);
    checked++;
  }
  expect(checked).toBe(818);
});

test("a cycle break goes to the lowest unsolved piece and comes back to it; odd counts are parity", () => {
  // The T perm swaps UR with UL and UFR with UBR: UF is solved, so the edges break into UR (B).
  expect(memo(T_PERM)).toEqual({ edges: ["B", "D", "B"], corners: ["B"], flipped: [], twisted: [], parity: true });
  expect(memoText(memo(T_PERM))).toBe("BD B B");
});

test("flipped edges and twisted corners in place are noted apart", () => {
  expect(memo("(M' U)4 (M U)4")).toMatchObject({ edges: [], corners: [], flipped: ["A", "B", "C", "D"] });
  // UFR and UBR twisted in place: noted by where their U sticker now is (UFR's on F: J, UBR's on B: Q).
  expect(memo("(R' D' R D)2 U (D' R' D R)2 U'")).toMatchObject({ edges: [], corners: [], twisted: ["Q", "J"] });
});

test("the scramble's last wide turns are undone first", () => {
  expect(memo("R Uw")).toEqual(memo("R D"));
  expect(memo("R U x y")).toEqual(memo("R U"));
});

test("another scheme's letters", () => {
  const scheme = withLetter(withLetter(SPEFFZ, "edges", 1, "z"), "corners", 1, "Ü");
  expect(scheme.edges.slice(0, 3)).toBe("AZC");
  expect(memo(T_PERM, scheme)).toMatchObject({ edges: ["Z", "D", "Z"], corners: ["Ü"] });
  // A letter given twice is told on both stickers.
  const twice = withLetter(SPEFFZ, "edges", 1, "a");
  expect([repeated(twice, "edges", 0), repeated(twice, "edges", 1), repeated(twice, "edges", 2), repeated(twice, "corners", 1)]).toEqual([true, true, false, false]);
  expect(cleanScheme({ edges: "ab", corners: 3 })).toEqual({ edges: "AB" + SPEFFZ.edges.slice(2), corners: SPEFFZ.corners });
});

test("other buffers", () => {
  // UR in the buffer holds UL's piece; from UBL the corners break into UBR (B).
  expect(memo(T_PERM, SPEFFZ, { edges: "UR", corners: "UBL" })).toEqual({ edges: ["D"], corners: ["B", "C", "B"], flipped: [], twisted: [], parity: true });
  expect(memo("(M' U)4 (M U)4", SPEFFZ, { edges: "DF", corners: "UFR" }).flipped).toEqual(["A", "B", "C", "D"]);
  expect(cleanBuffers({ edges: "DF", corners: "DBL" })).toEqual({ edges: "DF", corners: "UFR" });
});

test("a memo typed is read letters only", () => {
  const m = memo(T_PERM);
  expect(sameMemo("bd b / b", m)).toBe(true);
  expect(sameMemo("BD BB", m)).toBe(true);
  expect(sameMemo("BD B", m)).toBe(false);
  expect(recentPairs(m, ["XY", "BD"])).toEqual(["BD", "XY"]);
});

test("the cube drawn shows the cube traced, white on top and green in front", () => {
  const face = (slot: number) => "UDFBRL"[Math.floor(slot / 9)] as keyof typeof HELD_HEX;
  for (const scramble of ["", T_PERM, "R U F' Rw Uw'", "D2 B L' Fw2 Uw"]) {
    const traced = bldState(scramble), shown = applyAlg(solved(), parseScramble(bldPicture(scramble)));
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
