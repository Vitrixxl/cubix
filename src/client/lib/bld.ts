/**
 * Blindfolded training (3BLD, 4BLD, 5BLD), for the web and the phone: the letter scheme (Speffz by default, editable),
 * the buffers, the memo traced from a scramble, the letter pairs' flashcards and the 3-style commutators'.
 *
 * The cube is traced white on top, green in front: an odd cube turned so its centres are home (the scramble's last
 * wide turns undone), a 4×4 by undoing its scramble's last rotations. The memo goes piece type by piece type, in
 * `MEMO_ORDER`: 3×3 edges, corners; 4×4 x-centres, wings, corners; 5×5 +-centres, x-centres, wings, midges, corners.
 *
 * Pieces told apart (corners, edges and midges, wings), each type from its buffer: the letter where the piece in the
 * buffer belongs, then where the piece there belongs, and so on until the buffer's own piece comes back. A cycle break
 * goes to the unsolved piece with the lowest letter, at that letter, and ends on that piece again. A piece in place but
 * flipped or twisted is noted apart: an edge by its lowest letter, a corner by the letter where its white or yellow
 * sticker now is. A wing cannot be flipped in its place. An odd count of wings or corners is parity.
 *
 * Centres of a colour are alike (`traceCentres`): a centre goes to any unsolved place of its colour's face, the one
 * with the lowest letter whose own centre is not the buffer's colour (that one would end the cycle early), else the
 * lowest; places already holding their colour are never touched. When the buffer gets its colour back with places
 * still wrong, the cycle breaks into the lowest one not holding the buffer's colour, which takes the buffer's centre
 * until a centre of its colour comes for it.
 */
import { applyAlg, cubeSize, FACES, invertAlg, slotsFor, solved, uprightRotation, type CubeState, type Face } from "../../shared/cube";
import { FACE_HEX, hexOf } from "../../shared/cubeAppearance";
import type { PracticeContext } from "../../shared/puzzles";
import type { CaseDto } from "../../shared/types";
import { msg } from "../i18n/msg";

/** The preferences of the blindfolded training, the same on the web and the phone. */
export const BLD_PREFS = {
  /** "memo", "pairs" or "comms" */
  mode: "cubix.bld.mode",
  /** The memo's puzzle (`BldPuzzle`). */
  puzzle: "cubix.bld.puzzle",
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
  /** The commutators drilled (`CommFilter`). */
  comms: "cubix.bld.comms",
  /** The commutators' boxes, by `commKeys` key. */
  commBoxes: "cubix.bld.commBoxes",
  /** The algorithms a player wrote, by case id (a commutator's key being its 3-style case's): the phone's "Add yours" too. */
  own: "cubix.algs.own",
} as const;

export type BldPuzzle = "333" | "444" | "555";
export const BLD_PUZZLES: readonly BldPuzzle[] = ["333", "444", "555"];
export const cleanPuzzle = (stored: unknown): BldPuzzle => (BLD_PUZZLES.includes(stored as BldPuzzle) ? (stored as BldPuzzle) : "333");
/** Where a memo's scramble comes from: the puzzle's blindfolded event's (333bf, 444bf, 555bf). */
export const bldScramble = (puzzle: BldPuzzle): PracticeContext => ({ puzzle, solveMode: "blindfolded", scrambleType: "normal" });

/** The piece types: edges are the 3×3's and the 5×5's midges, x-centres and +-centres the big cubes' centres. */
export type BldKind = "edges" | "corners" | "wings" | "xcentres" | "plus";
export const BLD_KINDS: readonly BldKind[] = ["edges", "corners", "wings", "xcentres", "plus"];
/** Each piece type's name, to translate where shown; the 5×5's edges are its midges. */
export const kindName = (kind: BldKind, puzzle: BldPuzzle = "333") =>
  ({ edges: puzzle === "555" ? msg("Midges") : msg("Edges"), corners: msg("Corners"), wings: msg("Wings"), xcentres: msg("X-centres"), plus: msg("+-centres") })[kind];
/** Each piece type's buffer setting, to translate where shown. */
export const BUFFER_NAMES: Record<BldKind, string> = {
  edges: msg("Edge buffer"), corners: msg("Corner buffer"), wings: msg("Wing buffer"), xcentres: msg("X-centre buffer"), plus: msg("+-centre buffer"),
};
/** The memo's order, piece type by piece type. */
export const MEMO_ORDER: Record<BldPuzzle, readonly BldKind[]> = {
  333: ["edges", "corners"],
  444: ["xcentres", "wings", "corners"],
  555: ["plus", "xcentres", "wings", "edges", "corners"],
};
/** A letter per sticker of each kind, 24 each, in Speffz order: U, L, F, R, B, D, each face clockwise from its top left. */
export type BldScheme = Record<BldKind, string>;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWX";
export const SPEFFZ: BldScheme = { edges: ABC, corners: ABC, wings: ABC, xcentres: ABC, plus: ABC };
/** The faces in lettering order. */
export const BLD_FACES: readonly Face[] = ["U", "L", "F", "R", "B", "D"];
/**
 * Each kind's four stickers of a face on a cube of `n`, [row, column] as seen from outside, clockwise from the top
 * left: Speffz letters a wing, an x-centre or a +-centre by the one first clockwise from the face's corner (A: UBl, Ubl, Ub).
 */
const FACELETS: Record<BldKind, (n: number) => [number, number][]> = {
  corners: (n) => [[0, 0], [0, n - 1], [n - 1, n - 1], [n - 1, 0]],
  edges: (n) => [[0, (n - 1) / 2], [(n - 1) / 2, n - 1], [n - 1, (n - 1) / 2], [(n - 1) / 2, 0]],
  wings: (n) => [[0, 1], [1, n - 1], [n - 1, n - 2], [n - 2, 0]],
  xcentres: (n) => [[1, 1], [1, n - 2], [n - 2, n - 2], [n - 2, 1]],
  plus: (n) => [[1, (n - 1) / 2], [(n - 1) / 2, n - 2], [n - 2, (n - 1) / 2], [(n - 1) / 2, 1]],
};
/** The kinds a cube of `n` has. */
const kindsOf = (n: number) => BLD_KINDS.filter((kind) => (kind === "corners" ? true : kind === "edges" ? n % 2 === 1 : kind === "plus" ? n % 2 === 1 && n >= 5 : n >= 4));
/** The sticker lettered by a kind's index (0 = A in Speffz) on a cube of `n`, as a slot of `cube.ts`. */
const slotOf = (kind: BldKind, n: number, index: number) => {
  const [r, c] = FACELETS[kind](n)[index & 3]!;
  return FACES.indexOf(BLD_FACES[index >> 2]!) * n * n + r * n + c;
};
/** The kind and index of a face's facelet on a cube of `n`, null for a sticker not lettered. */
export function stickerAt(face: Face, facelet: number, n = 3): { kind: BldKind; index: number } | null {
  for (const kind of kindsOf(n)) {
    const at = FACELETS[kind](n).findIndex(([r, c]) => r * n + c === facelet);
    if (at >= 0) return { kind, index: BLD_FACES.indexOf(face) * 4 + at };
  }
  return null;
}
/** The net drawing a kind's letters: the 3×3's for edges and corners, the 5×5's (every big kind on it) for the rest. */
export const netSize = (kind: BldKind) => (kind === "edges" || kind === "corners" ? 3 : 5);
/** The colours of the cube as traced (white top, green front, red right). */
export const BLD_COLORS: Record<Face, string> = {
  U: hexOf(FACE_HEX.D), D: hexOf(FACE_HEX.U), F: hexOf(FACE_HEX.B), B: hexOf(FACE_HEX.F), R: hexOf(FACE_HEX.R), L: hexOf(FACE_HEX.L),
};
/** The letters' ink on the net's stickers, whatever the theme: the app's dark ink on pale colours (6:1 on the red, the darkest). */
export const BLD_INK = "#1c1317";

/** The common buffers, by kind, and their sticker (its letter's index); a 3×3 piece's is its U or D one. */
export const BUFFERS = {
  edges: { UF: 2, DF: 20, UR: 1 },
  corners: { UFR: 2, UBL: 0 },
  wings: { DFr: 10, UFr: 2 },
  xcentres: { Ubl: 0, Ufr: 2 },
  plus: { Ub: 0, Uf: 2 },
} as const;
export type BldBuffers = { [K in BldKind]: keyof (typeof BUFFERS)[K] };
export const DEFAULT_BUFFERS: BldBuffers = { edges: "UF", corners: "UFR", wings: "DFr", xcentres: "Ubl", plus: "Ub" };
const bufferIndex = (buffers: BldBuffers, kind: BldKind) => (BUFFERS[kind] as Record<string, number>)[buffers[kind]]!;

/** A scheme stored, or edited by hand, made whole: 24 letters per kind, upper case, Speffz where one is missing. */
export function cleanScheme(stored: unknown): BldScheme {
  const read = (kind: BldKind) => {
    const text = (stored as Partial<BldScheme> | null)?.[kind];
    return [...ABC].map((fallback, i) => (typeof text === "string" && [...text][i]?.trim() ? [...text][i]!.toUpperCase() : fallback)).join("");
  };
  return Object.fromEntries(BLD_KINDS.map((kind) => [kind, read(kind)])) as BldScheme;
}
export function cleanBuffers(stored: unknown): BldBuffers {
  const value = stored as Partial<Record<BldKind, string>> | null;
  return Object.fromEntries(BLD_KINDS.map((kind) => [kind, value?.[kind] && value[kind] in BUFFERS[kind] ? value[kind] : DEFAULT_BUFFERS[kind]])) as BldBuffers;
}
/** The scheme with one sticker's letter changed. */
export const withLetter = (scheme: BldScheme, kind: BldKind, index: number, letter: string): BldScheme =>
  ({ ...scheme, [kind]: [...scheme[kind]].map((l, i) => (i === index ? letter.trim().slice(-1).toUpperCase() || l : l)).join("") });
/** Whether another sticker of the kind has this one's letter too: a memo would read two ways. */
export const repeated = (scheme: BldScheme, kind: BldKind, index: number) => scheme[kind].indexOf(scheme[kind][index]!) !== scheme[kind].lastIndexOf(scheme[kind][index]!);

/** The whole-cube turns bringing a scrambled cube white on top, green in front (`state`: the scramble applied). */
function homeTurns(scramble: string, state: CubeState) {
  if (cubeSize(state) % 2) return uprightRotation(state) ?? "";
  const moves = scramble.trim().split(/\s+/);
  let last = moves.length;
  while (last > 0 && /^[xyz]/.test(moves[last - 1]!)) last--;
  return invertAlg(moves.slice(last).join(" "));
}
/** The cube a scramble leaves, turned white on top and green in front. */
export function bldState(scramble: string, n = 3): CubeState {
  const state = applyAlg(solved(n), scramble);
  return applyAlg(state, homeTurns(scramble, state));
}
/**
 * What to draw for a scramble as traced: a `held` setup (applied white on top, shown yellow on top) of the scramble,
 * its turns home, then z2 to show it white on top again.
 */
export const bldPicture = (scramble: string, n = 3) => `${scramble} ${homeTurns(scramble, applyAlg(solved(n), scramble))} z2`.replace(/\s+/g, " ").trim();

/** A piece type's memo: its targets, its pieces in place but turned, and whether their count is odd (wings, corners). */
export type MemoPart = { kind: BldKind; targets: string[]; turned: string[]; parity: boolean };
/** A memo, piece type by piece type in `MEMO_ORDER`. */
export type Memo = MemoPart[];

/** Pieces told apart: the targets' indices, then those in place but turned. */
function tracePieces(state: CubeState, kind: BldKind, buffer: number) {
  const n = cubeSize(state),
    slots = Array.from({ length: 24 }, (_, i) => slotOf(kind, n, i)),
    index = new Map(slots.map((slot, i) => [slot, i])),
    geometry = slotsFor(n),
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
    if (kind !== "corners") return members[0]!;
    // A corner: where its U or D sticker now is.
    const top = members.find((i) => i < 4 || i >= 20)!;
    return members.find((i) => at(i) === top)!;
  });
  return { targets, turned };
}

/** Centres alike by colour (see the file's head): the targets' indices. */
function traceCentres(state: CubeState, kind: BldKind, buffer: number) {
  const n = cubeSize(state),
    // The face each place belongs to, and the colour (a face) it holds.
    home = (i: number) => FACES.indexOf(BLD_FACES[i >> 2]!),
    holds = Array.from({ length: 24 }, (_, i) => Math.floor(state[slotOf(kind, n, i)]! / (n * n))),
    open = Array.from({ length: 24 }, (_, i) => i).filter((i) => i !== buffer && holds[i] !== home(i)),
    pick = (places: number[]) => places.find((i) => holds[i] !== home(buffer)) ?? places[0]!,
    targets: number[] = [];
  let hand = holds[buffer]!;
  for (;;) {
    const places = open.filter((i) => home(i) === hand);
    if (places.length) {
      const to = pick(places);
      targets.push(to);
      open.splice(open.indexOf(to), 1);
      hand = holds[to]!;
    } else if (open.length) {
      // The buffer has its colour back: break into another place, which keeps the buffer's centre for now.
      const to = pick(open);
      targets.push(to);
      [holds[to], hand] = [hand, holds[to]!];
    } else return targets;
  }
}

/** The memo of a cube held white on top, green in front (a 3×3, 4×4 or 5×5), in `MEMO_ORDER`. */
export function traceMemo(state: CubeState, scheme: BldScheme = SPEFFZ, buffers: BldBuffers = DEFAULT_BUFFERS): Memo {
  return MEMO_ORDER[`${cubeSize(state)}`.repeat(3) as BldPuzzle].map((kind) => {
    const buffer = bufferIndex(buffers, kind),
      { targets, turned } = kind === "xcentres" || kind === "plus" ? { targets: traceCentres(state, kind, buffer), turned: [] } : tracePieces(state, kind, buffer);
    return { kind, targets: targets.map((i) => scheme[kind][i]!), turned: turned.map((i) => scheme[kind][i]!), parity: (kind === "wings" || kind === "corners") && targets.length % 2 === 1 };
  });
}

/** Letters two by two: ["A", "B", "C"] → ["AB", "C"]. */
export const pairsOf = (letters: string[]) => Array.from({ length: Math.ceil(letters.length / 2) }, (_, i) => letters.slice(i * 2, i * 2 + 2).join(""));
/** A memo as typed: each piece type's pairs, in order. */
export const memoText = (memo: Memo) => memo.flatMap((part) => pairsOf(part.targets)).join(" ");
/** Whether a memo typed says the memo's letters in order (spaces, commas and slashes ignored). */
export const sameMemo = (typed: string, memo: Memo) => typed.replace(/[\s,;/|·-]+/g, "").toUpperCase() === memo.flatMap((part) => part.targets).join("").toUpperCase();

/** The pairs a memo asks to recall, those of the last memos first, without repeats, up to `max`. */
export const recentPairs = (memo: Memo, before: string[], max = 60) => [...new Set(memo.flatMap((part) => pairsOf(part.targets)).filter((p) => p.length === 2).concat(before))].slice(0, max);
/** Every pair of two different letters of the scheme. */
export function allPairs(scheme: BldScheme) {
  const letters = [...new Set(Object.values(scheme).join(""))].sort();
  return letters.flatMap((a) => letters.flatMap((b) => (a === b ? [] : [a + b])));
}

/**
 * The pairs' boxes (simple spaced repetition), letter pairs' and commutators' alike: 0 after Again, one more after Got
 * it, up to 4. A pair in box 0 comes back three cards later; otherwise a pair not among the last three is drawn, the
 * lower boxes more often (an unseen pair as box 1).
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

/**
 * Commutators (3-style): from the 3×3's edge or corner buffer, every pair of targets on two other pieces. A
 * commutator's key is its buffer and its targets in Speffz letters ("UF AB"): the id of its case in the catalogue's
 * 3-style sets, which start from UF and UFR.
 */
export type CommKind = "edges" | "corners";
/** Which commutators are drilled: a kind, the pairs starting with one letter of the player's scheme ("" for all), only those not known yet. */
export type CommFilter = { kind: CommKind; letter: string; fresh: boolean };
export const cleanCommFilter = (stored: unknown): CommFilter => {
  const value = stored as Partial<CommFilter> | null;
  return { kind: value?.kind === "corners" ? "corners" : "edges", letter: typeof value?.letter === "string" ? value.letter : "", fresh: value?.fresh === true };
};
/** A commutator known: answered Got it twice in a row at least. */
export const commKnown = (boxes: PairBoxes, key: string) => (boxes[key] ?? 0) >= 2;
const COMM_BUFFER = { edges: "UF", corners: "UFR" } as const;
const pieceOf = (kind: CommKind, i: number) => slotsFor(3)[slotOf(kind, 3, i)]!.p.join();
/** Every commutator from the kind's buffer. */
export function commKeys(kind: CommKind, buffers: BldBuffers): string[] {
  const buffer = buffers[kind],
    home = pieceOf(kind, bufferIndex(buffers, kind)),
    others = [...ABC].map((_, i) => i).filter((i) => pieceOf(kind, i) !== home);
  return others.flatMap((a) => others.filter((b) => pieceOf(kind, a) !== pieceOf(kind, b)).map((b) => `${buffer} ${ABC[a]}${ABC[b]}`));
}
/** A commutator's targets in the player's letters. */
export const commLetters = (key: string, kind: CommKind, scheme: BldScheme) => [...key.split(" ")[1]!].map((l) => scheme[kind][ABC.indexOf(l)]).join("");
/** The commutators drilled. */
export const commPool = (filter: CommFilter, buffers: BldBuffers, scheme: BldScheme, boxes: PairBoxes) =>
  commKeys(filter.kind, buffers).filter((key) => (!filter.letter || commLetters(key, filter.kind, scheme)[0] === filter.letter) && !(filter.fresh && commKnown(boxes, key)));

/** The 24 whole-cube rotations, the shortest first. */
let rotations: string[] | undefined;
function allRotations() {
  if (!rotations) {
    const seen = new Map<string, string>(),
      one = ["y", "y'", "y2", "x", "x'", "x2", "z", "z'", "z2"];
    for (const alg of ["", ...one, ...one.flatMap((a) => one.filter((b) => b[0] !== a[0]).map((b) => `${a} ${b}`))]) {
      const key = applyAlg(solved(), alg).join();
      if (!seen.has(key)) seen.set(key, alg);
    }
    rotations = [...seen.values()];
  }
  return rotations;
}
/**
 * The catalogue's commutator for a key, and its notation where the catalogue has it ("R2 U':[S,R2]"). From another
 * buffer than the catalogue's, the commutator of the pieces a whole-cube rotation brings there, done turned:
 * `y (…) y'`, `[y: …]`. `find` gives a catalogue case by id.
 */
export function commOf(key: string, kind: CommKind, find: (id: string) => CaseDto | undefined): { alg: string; notation?: string } | undefined {
  const [buffer, pair] = key.split(" ") as [string, string];
  if (buffer === COMM_BUFFER[kind]) {
    const c = find(key);
    return c?.algorithms[0] && { alg: c.algorithms[0].alg, notation: c.notes };
  }
  // r then the catalogue's commutator then r undone moves the sticker at q where the commutator moves the one where r
  // takes q: r must take the buffer's sticker to the catalogue's buffer, and the targets to the case's.
  const from = (BUFFERS[kind] as Record<string, number>)[buffer]!,
    to = (BUFFERS[kind] as Record<string, number>)[COMM_BUFFER[kind]]!,
    letters = new Map(Array.from({ length: 24 }, (_, i) => [slotOf(kind, 3, i), i]));
  for (const turn of allRotations()) {
    const state = applyAlg(solved(), turn),
      takes = (i: number) => letters.get(state.indexOf(slotOf(kind, 3, i)))!;
    if (takes(from) !== to) continue;
    const c = find(`${COMM_BUFFER[kind]} ${[...pair].map((l) => ABC[takes(ABC.indexOf(l))]).join("")}`),
      first = c?.algorithms[0];
    return first && { alg: `${turn} (${first.alg}) ${invertAlg(turn)}`, notation: c!.notes && `[${turn}: ${c!.notes}]` };
  }
  return undefined;
}
/** Whether an algorithm does a commutator's cycle on a 3×3, nothing else moved. */
export function doesComm(key: string, kind: CommKind, alg: string): boolean {
  const [buffer, pair] = key.split(" ") as [string, string];
  try {
    const memo = traceMemo(applyAlg(solved(), invertAlg(alg)), SPEFFZ, { ...DEFAULT_BUFFERS, [kind]: buffer });
    return memo.every((part) => part.turned.length === 0 && part.targets.join("") === (part.kind === kind ? pair : ""));
  } catch {
    return false;
  }
}

/** The algorithms a player wrote for a case, and those of them used (`BLD_PREFS.own`). */
export type OwnAlgs = Record<string, { algs: string[]; used: string[] }>;
/** The player's own algorithm for a case, the one used. */
export const ownAlg = (own: OwnAlgs, id: string): string | undefined => own[id]?.used[0];
/** The player's algorithms with `alg` the one used for the case; "" goes back to the catalogue's. */
export const withOwnAlg = (own: OwnAlgs, id: string, alg: string): OwnAlgs => {
  const algs = own[id]?.algs ?? [];
  return { ...own, [id]: alg ? { algs: [...algs.filter((a) => a !== alg), alg], used: [alg] } : { algs, used: [] } };
};
