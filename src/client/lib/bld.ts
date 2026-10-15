/**
 * Blindfolded (3BLD) training, for the web and the phone: the letter scheme (Speffz by default, editable), the buffers,
 * the memo traced from a scramble, and the letter pairs' flashcards.
 *
 * The cube is traced white on top, green in front (the scramble's orientation, its last wide turns undone). Edges then
 * corners, each from its buffer: the letter where the piece in the buffer belongs, then where the piece there belongs,
 * and so on until the buffer's own piece comes back. A cycle break goes to the unsolved piece with the lowest letter,
 * at that letter, and ends on that piece again. A piece in place but flipped or twisted is noted apart: an edge by its
 * lowest letter, a corner by the letter where its white or yellow sticker now is. Odd counts mean parity.
 */
import { applyAlg, FACES, slotsFor, solved, uprightRotation, type CubeState, type Face } from "../../shared/cube";
import { FACE_HEX, hexOf } from "../../shared/cubeAppearance";
import type { PracticeContext } from "../../shared/puzzles";

/** The preferences of the blindfolded training, the same on the web and the phone. */
export const BLD_PREFS = {
  /** "memo" or "pairs" */
  mode: "cubix.bld.mode",
  scheme: "cubix.bld.scheme",
  buffers: "cubix.bld.buffers",
  /** The word or image of each letter pair, by pair. */
  words: "cubix.bld.words",
  /** The pairs' boxes (`PairBoxes`). */
  boxes: "cubix.bld.boxes",
  /** The pairs of the last memos checked, the latest first. */
  recent: "cubix.bld.recent",
  /** The pairs drilled: "all" or "recent". */
  pool: "cubix.bld.pool",
} as const;
/** Where a memo's scramble comes from: the 3×3 blindfolded event's. */
export const BLD_SCRAMBLE: PracticeContext = { puzzle: "333", solveMode: "blindfolded", scrambleType: "normal" };

export type BldKind = "edges" | "corners";
/** A letter per sticker of each kind, 24 each, in Speffz order: U, L, F, R, B, D, each face clockwise from its top left. */
export type BldScheme = Record<BldKind, string>;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWX";
export const SPEFFZ: BldScheme = { edges: ABC, corners: ABC };
/** The faces in lettering order, and each one's facelets (row-major as seen from outside) clockwise from its top left. */
export const BLD_FACES: readonly Face[] = ["U", "L", "F", "R", "B", "D"];
const FACELETS: Record<BldKind, readonly number[]> = { corners: [0, 2, 8, 6], edges: [1, 5, 7, 3] };
/** The sticker lettered by a kind's index (0 = A in Speffz), as a slot of `cube.ts`. */
const slotOf = (kind: BldKind, index: number) => FACES.indexOf(BLD_FACES[index >> 2]!) * 9 + FACELETS[kind][index & 3]!;
/** The kind and index of a face's facelet, null for its centre. */
export function stickerAt(face: Face, facelet: number): { kind: BldKind; index: number } | null {
  for (const kind of ["edges", "corners"] as const) {
    const at = FACELETS[kind].indexOf(facelet);
    if (at >= 0) return { kind, index: BLD_FACES.indexOf(face) * 4 + at };
  }
  return null;
}
/** The colours of the cube as traced (white top, green front, red right). */
export const BLD_COLORS: Record<Face, string> = {
  U: hexOf(FACE_HEX.D), D: hexOf(FACE_HEX.U), F: hexOf(FACE_HEX.B), B: hexOf(FACE_HEX.F), R: hexOf(FACE_HEX.R), L: hexOf(FACE_HEX.L),
};

/** The common buffers, by piece; the buffer's sticker is its U or D one. */
export const BUFFERS = { corners: { UFR: 2, UBL: 0 }, edges: { UF: 2, DF: 20, UR: 1 } } as const;
export type BldBuffers = { corners: keyof typeof BUFFERS.corners; edges: keyof typeof BUFFERS.edges };
export const DEFAULT_BUFFERS: BldBuffers = { corners: "UFR", edges: "UF" };

/** A scheme stored, or edited by hand, made whole: 24 letters per kind, upper case, Speffz where one is missing. */
export function cleanScheme(stored: unknown): BldScheme {
  const read = (kind: BldKind) => {
    const text = (stored as Partial<BldScheme> | null)?.[kind];
    return [...ABC].map((fallback, i) => (typeof text === "string" && [...text][i]?.trim() ? [...text][i]!.toUpperCase() : fallback)).join("");
  };
  return { edges: read("edges"), corners: read("corners") };
}
export function cleanBuffers(stored: unknown): BldBuffers {
  const value = stored as Partial<BldBuffers> | null;
  return {
    corners: value?.corners && value.corners in BUFFERS.corners ? value.corners : DEFAULT_BUFFERS.corners,
    edges: value?.edges && value.edges in BUFFERS.edges ? value.edges : DEFAULT_BUFFERS.edges,
  };
}
/** The scheme with one sticker's letter changed. */
export const withLetter = (scheme: BldScheme, kind: BldKind, index: number, letter: string): BldScheme =>
  ({ ...scheme, [kind]: [...scheme[kind]].map((l, i) => (i === index ? letter.trim().slice(-1).toUpperCase() || l : l)).join("") });
/** Whether another sticker of the kind has this one's letter too: a memo would read two ways. */
export const repeated = (scheme: BldScheme, kind: BldKind, index: number) => scheme[kind].indexOf(scheme[kind][index]!) !== scheme[kind].lastIndexOf(scheme[kind][index]!);

/** The cube a scramble leaves, turned white on top and green in front (the blindfolded scramble's wide turns undone). */
export function bldState(scramble: string): CubeState {
  const state = applyAlg(solved(), scramble);
  return applyAlg(state, uprightRotation(state) ?? "");
}
/**
 * What to draw for a scramble as traced: a `held` setup (applied white on top, shown yellow on top) of the scramble,
 * its rotation home, then z2 to show it white on top again.
 */
export const bldPicture = (scramble: string) => `${scramble} ${uprightRotation(applyAlg(solved(), scramble)) ?? ""} z2`.replace(/\s+/g, " ").trim();

export type Memo = { edges: string[]; corners: string[]; flipped: string[]; twisted: string[]; parity: boolean };

/** One kind's memo: its targets, then its pieces in place but turned. */
function trace(state: CubeState, kind: BldKind, letters: string, buffer: number) {
  const slots = Array.from({ length: 24 }, (_, i) => slotOf(kind, i)),
    index = new Map(slots.map((slot, i) => [slot, i])),
    geometry = slotsFor(3),
    piece = (i: number) => geometry[slots[i]!]!.p.join(),
    // The sticker now at i: where it belongs.
    at = (i: number) => index.get(state[slots[i]!]!)!,
    pieces = [...new Set(slots.map((_, i) => piece(i)))].map((p) => slots.map((_, i) => i).filter((i) => piece(i) === p)),
    inPlace = (members: number[]) => piece(at(members[0]!)) === piece(members[0]!),
    done = new Set([piece(buffer)]),
    targets: number[] = [];
  const follow = (from: number, home: string) => {
    for (let cur = from; ; ) {
      const next = at(cur);
      if (piece(next) === piece(buffer)) return;
      targets.push(next);
      done.add(piece(next));
      if (piece(next) === home) return;
      cur = next;
    }
  };
  if (!inPlace(pieces.find((p) => p.includes(buffer))!)) follow(buffer, "");
  // Cycle breaks: the unsolved piece with the lowest letter, at that letter (pieces are in letter order).
  for (const members of pieces) {
    const start = members[0]!;
    if (done.has(piece(start)) || inPlace(members)) continue;
    targets.push(start);
    done.add(piece(start));
    follow(start, piece(start));
  }
  const turned = pieces.filter((members) => inPlace(members) && at(members[0]!) !== members[0]).map((members) => {
    if (kind === "edges") return members[0]!;
    // A corner: where its U or D sticker now is.
    const top = members.find((i) => i < 4 || i >= 20)!;
    return members.find((i) => at(i) === top)!;
  });
  return { targets: targets.map((i) => letters[i]!), turned: turned.map((i) => letters[i]!) };
}

/** The memo of a cube held white on top, green in front: edges then corners. */
export function traceMemo(state: CubeState, scheme: BldScheme = SPEFFZ, buffers: BldBuffers = DEFAULT_BUFFERS): Memo {
  const edges = trace(state, "edges", scheme.edges, BUFFERS.edges[buffers.edges]),
    corners = trace(state, "corners", scheme.corners, BUFFERS.corners[buffers.corners]);
  return { edges: edges.targets, corners: corners.targets, flipped: edges.turned, twisted: corners.turned, parity: corners.targets.length % 2 === 1 };
}

/** Letters two by two: ["A", "B", "C"] → ["AB", "C"]. */
export const pairsOf = (letters: string[]) => Array.from({ length: Math.ceil(letters.length / 2) }, (_, i) => letters.slice(i * 2, i * 2 + 2).join(""));
/** A memo as typed: edges' pairs, then corners'. */
export const memoText = (memo: Memo) => [...pairsOf(memo.edges), ...pairsOf(memo.corners)].join(" ");
/** Whether a memo typed says the memo's letters in order, edges then corners (spaces, commas and slashes ignored). */
export const sameMemo = (typed: string, memo: Memo) => typed.replace(/[\s,;/|·-]+/g, "").toUpperCase() === [...memo.edges, ...memo.corners].join("").toUpperCase();

/** The pairs a memo asks to recall, those of the last memos first, without repeats, up to `max`. */
export const recentPairs = (memo: Memo, before: string[], max = 60) => [...new Set([...pairsOf(memo.edges), ...pairsOf(memo.corners)].filter((p) => p.length === 2).concat(before))].slice(0, max);
/** Every pair of two different letters of the scheme. */
export function allPairs(scheme: BldScheme) {
  const letters = [...new Set([...scheme.edges, ...scheme.corners])].sort();
  return letters.flatMap((a) => letters.flatMap((b) => (a === b ? [] : [a + b])));
}

/**
 * The pairs' boxes (simple spaced repetition): 0 after Again, one more after Got it, up to 4. A pair in box 0 comes
 * back three cards later; otherwise a pair not among the last three is drawn, the lower boxes more often (an unseen pair as box 1).
 */
export type PairBoxes = Record<string, number>;
export const reviewPair = (boxes: PairBoxes, pair: string, got: boolean): PairBoxes => ({ ...boxes, [pair]: got ? Math.min(4, (boxes[pair] ?? 0) + 1) : 0 });
export function nextPair(pool: string[], boxes: PairBoxes, seen: string[], random = Math.random): string | undefined {
  const again = pool.find((p) => boxes[p] === 0 && !seen.slice(-3).includes(p));
  if (again) return again;
  const fresh = pool.filter((p) => !seen.slice(-3).includes(p));
  const choices = fresh.length ? fresh : pool,
    weight = (p: string) => 5 - (boxes[p] ?? 1),
    total = choices.reduce((sum, p) => sum + weight(p), 0);
  let left = random() * total;
  return choices.find((p) => (left -= weight(p)) < 0) ?? choices.at(-1);
}
