/**
 * Analysis of a 3×3 solve recorded on a smart cube, step by step as a CFOP solver goes: the cross, the four F2L pairs,
 * OLL and PLL. Each step gets its times (recognition, the pause before its first turn, then execution), its turns, the
 * case it started from when the catalogue knows it (F2L, OLL, PLL), and the catalogue's algorithms for that case,
 * checked on the very state of the solve. The cross gets its optimal solution.
 *
 * States are the held ones of `SmartCube` (yellow on top for a white cross). Every check reads colours against the
 * centres, so it holds whatever the colour of the cross and however the cube is turned: a step is seen with its cross
 * on the bottom (`frame`), from the side the player held in front when the cube tells it (gyroscope), else from green.
 */
import { applyAlg, applyMove, compensateAuf, expandAlg, FACES, faceOfSlot, movePermutation, parseAlg, parseMove, slotsFor, solved, type CubeState, type Face } from "../../shared/cube";
import { canonicalTurn, heldTurn, rotate, type Quaternion } from "./smartCube";
import { msg } from "../i18n/msg";

export interface RecordedSolve {
  /** The scrambled cube, before the first turn. */
  start: CubeState;
  /** Turns as the cube reported them (white on top), with their times (ms); the first one started the solve. */
  moves: { move: string; at: number }[];
  /** How the cube was held, for cubes with a gyroscope. */
  orientations: { quaternion: Quaternion; at: number }[];
}

/** What the analysis needs of a catalogue case. */
export interface CatalogCase {
  id: string;
  name: string;
  set: string;
  /** The 2-look sets split by look: "1: Edges", "2: Corners"… */
  group?: string;
  setup: string;
  algorithms: { alg: string }[];
}

export type PhaseId = "cross" | "f2l1" | "f2l2" | "f2l3" | "f2l4" | "oll" | "pll";
export interface Suggestion {
  alg: string;
  turns: number;
}
/** A part of the solve: its turns, its times, the case it started from and the catalogue's algorithms for it. */
export interface Segment {
  label: string;
  /** It goes from `states[from]` to `states[to]`: its turns are the recorded moves `from` to `to - 1`. */
  from: number;
  to: number;
  /** Milliseconds from the start of the solve. */
  start: number;
  end: number;
  recognition: number;
  execution: number;
  /** Its turns, merged (R R is R2), as seen in its frame. */
  turns: string[];
  /** Nothing to do: the step was solved by the one before. */
  skip: boolean;
  case?: { id: string; name: string };
  /** The catalogue's algorithms for the case, from the state of the solve; the cross gets its optimal solution. */
  suggestions: Suggestion[];
  /** Whole-cube rotations from the held cube to its frame: the cross on the bottom, then the side in front. */
  frame: string[];
}
export interface Phase extends Segment {
  id: PhaseId;
  /** F2L: the colours of the pair, as held faces (see `COLOUR_NAMES`). */
  pair?: [Face, Face];
  /** A last-layer step done in two looks (edges then corners for OLL, corners then edges for PLL). */
  looks?: Segment[];
}
export interface SolveAnalysis {
  time: number;
  turns: number;
  tps: number;
  /** The cross colour, as a held face. */
  cross: Face;
  phases: Phase[];
  /** The cube after each number of turns. */
  states: CubeState[];
  recording: RecordedSolve;
}

/** The colours of the held cube's faces (yellow on top, green in front, orange on the right). */
export const COLOUR_NAMES: Record<Face, string> = { U: "yellow", D: "white", F: "green", B: "blue", R: "orange", L: "red" };

const SLOTS = slotsFor(3);
const AROUND: Face[] = ["F", "R", "B", "L"];
export const AUF = ["", "U", "U2", "U'"];
export const Y = ["", "y", "y2", "y'"];
const key = (p: readonly number[]) => p.join(",");
/** The sticker slots of the piece at each position. */
const PIECES = new Map<string, number[]>();
SLOTS.forEach((slot, i) => PIECES.set(key(slot.p), [...(PIECES.get(key(slot.p)) ?? []), i]));
const centre = (c: Face[], face: Face) => c[FACES.indexOf(face) * 9 + 4]!;
const fits = (c: Face[], slot: number) => c[slot] === centre(c, SLOTS[slot]!.face);
const solvedAt = (c: Face[], p: readonly number[]) => PIECES.get(key(p))!.every((slot) => fits(c, slot));

const CROSS = [[0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0]];
export const SLOT_PIECES: Record<string, number[][]> = {
  FR: [[1, -1, 1], [1, 0, 1]],
  FL: [[-1, -1, 1], [-1, 0, 1]],
  BL: [[-1, -1, -1], [-1, 0, -1]],
  BR: [[1, -1, -1], [1, 0, -1]],
};
const TOP = SLOTS.flatMap((slot, i) => (slot.p[1] === 1 ? [i] : []));
const TOP_SIDES = TOP.filter((slot) => SLOTS[slot]!.face !== "U");

const LL_EDGES = [[0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0]];
/** The top edges all show the top colour on top: what ZBLS leaves, what ZBLL needs. */
export const edgesOriented = (c: Face[]) =>
  LL_EDGES.every((p) => c[PIECES.get(key(p))!.find((slot) => SLOTS[slot]!.face === "U")!] === centre(c, "U"));
export const crossDone = (c: Face[]) => CROSS.every((p) => solvedAt(c, p));
export const pairsDone = (c: Face[]) => Object.keys(SLOT_PIECES).filter((slot) => SLOT_PIECES[slot]!.every((p) => solvedAt(c, p)));
export const f2lDone = (c: Face[]) => crossDone(c) && pairsDone(c).length === 4;
export const topDone = (c: Face[]) => TOP.filter((slot) => SLOTS[slot]!.face === "U").every((slot) => fits(c, slot));
export const allDone = (c: Face[]) => c.every((_, slot) => fits(c, slot));

export const colours = (state: CubeState): Face[] => Array.from(state, (origin) => faceOfSlot(origin));
export const turnWhole = (state: CubeState, frame: readonly string[]) => frame.reduce((s, token) => applyMove(s, parseMove(token)!), state);
/** Which face each held face becomes in a frame. */
export function faceMap(frame: readonly string[]): Record<Face, Face> {
  const map = {} as Record<Face, Face>;
  for (const face of FACES) {
    let slot = FACES.indexOf(face) * 9 + 4;
    for (const token of frame) slot = movePermutation(parseMove(token)!)[slot]!;
    map[face] = FACES[Math.floor(slot / 9)]!;
  }
  return map;
}
/** Where the piece at `p` goes after these rotations. */
const moved = (p: readonly number[], frame: readonly string[]) =>
  SLOTS[frame.reduce((slot, token) => movePermutation(parseMove(token)!)[slot]!, PIECES.get(key(p))![0]!)]!.p;
/** The rotation that puts each face on the bottom. */
export const DOWN: Record<Face, string[]> = { D: [], U: ["x2"], F: ["x'"], B: ["x"], R: ["z"], L: ["z'"] };

/** Quarter turns of a face turn, 1 to 3. */
const quarters = (turn: string) => (/2'?$/.test(turn) ? 2 : turn.endsWith("'") ? 3 : 1);
/** Consecutive turns of one face as one (R R is R2, R R' nothing). */
export function mergeTurns(turns: readonly string[]): string[] {
  const out: { face: string; q: number }[] = [];
  for (const turn of turns) {
    const last = out.at(-1);
    if (last?.face === turn[0]) {
      last.q = (last.q + quarters(turn)) % 4;
      if (!last.q) out.pop();
    } else out.push({ face: turn[0]!, q: quarters(turn) });
  }
  return out.map(({ face, q }) => face + (q === 2 ? "2" : q === 3 ? "'" : ""));
}
/** Wide and slice turns as a face turn and a rotation of the whole cube. */
const AS_FACES: Record<string, [string, string] | [string, string, string]> = {
  r: ["L", "x"], l: ["R", "x'"], u: ["D", "y"], d: ["U", "y'"], f: ["B", "z"], b: ["F", "z'"],
  M: ["R", "L'", "x'"], E: ["U", "D'", "y'"], S: ["F'", "B", "z"],
};
const times = (token: string, suffix: string) => {
  if (suffix === "2") return token.replace(/'$/, "") + "2";
  if (suffix !== "'") return token;
  return token.endsWith("'") ? token.slice(0, -1) : token + "'";
};
/** Face turns and whole-cube rotations only, as a smart cube can report them; null for other notations. */
export function playable(alg: string) {
  const out: string[] = [];
  for (const token of expandAlg(alg).split(/\s+/).filter(Boolean)) {
    const m = /^([UDFBRLudfbrlMESxyz])(w)?(2'?|')?$/.exec(token);
    if (!m) return null;
    const letter = m[2] ? m[1]!.toLowerCase() : m[1]!,
      suffix = m[3]?.startsWith("2") ? "2" : (m[3] ?? "");
    out.push(...(AS_FACES[letter] ?? [letter]).map((t) => times(t, suffix)));
  }
  return out.join(" ");
}
/**
 * `alg` turned by `y` first. Its leading turns of the top and y rotations commute: they are merged, the rotation first
 * (y' U' y' is y2 U').
 */
function turnedBy(y: string, alg: string) {
  const tokens = alg.split(/\s+/).filter(Boolean);
  let rotation = Y.indexOf(y),
    top = 0;
  for (let m; (m = /^([yU])(2|'|2')?$/.exec(tokens[0] ?? "")); tokens.shift()) {
    const q = m[2]?.startsWith("2") ? 2 : m[2] === "'" ? 3 : 1;
    if (m[1] === "y") rotation += q;
    else top += q;
  }
  return [Y[rotation % 4], AUF[top % 4], ...tokens].filter(Boolean).join(" ");
}
/** Turns of an algorithm as a smart cube counts them: a slice is two face turns, a rotation none. */
const algTurns = (alg: string) => {
  const tokens = (playable(alg) ?? expandAlg(alg)).split(/\s+/);
  return tokens.filter((t) => t && !/^[xyz]/.test(t)).length;
};

/** Signatures of the last layer and of the front-right pair, from colours read against the centres. */
export const ollKey = (c: Face[]) => TOP.map((slot) => (c[slot] === centre(c, "U") ? 1 : 0)).join("");
export function pllKey(c: Face[]) {
  const offsets = TOP_SIDES.map((slot) => {
    const colourFace = AROUND.find((face) => centre(c, face) === c[slot]);
    return colourFace ? (AROUND.indexOf(colourFace) - AROUND.indexOf(SLOTS[slot]!.face) + 4) % 4 : 9;
  });
  return offsets.map((o) => (o === 9 ? 9 : (o - offsets[0]! + 4) % 4)).join("");
}
export function pairKey(c: Face[]) {
  const want = (faces: Face[]) => faces.map((face) => centre(c, face)).sort().join("");
  let corner = -1, edge = -1;
  for (const slots of PIECES.values()) {
    const piece = slots.map((slot) => c[slot]!).sort().join("");
    if (slots.length === 3 && piece === want(["D", "F", "R"])) corner = slots.find((slot) => c[slot] === centre(c, "D"))!;
    if (slots.length === 2 && piece === want(["F", "R"])) edge = slots.find((slot) => c[slot] === centre(c, "F"))!;
  }
  return `${corner},${edge}`;
}

export type Known = { case: CatalogCase; auf: number };
/** The catalogue's cases by signature, for each of their four angles (a U turn before the case). */
/** The top edges' orientation alone, and the corners' permutation alone: the first look of a 2-look OLL and PLL. */
const TOP_EDGES = TOP.filter((slot) => SLOTS[slot]!.p.filter((v) => v === 0).length === 1);
export const eoKey = (c: Face[]) => TOP_EDGES.map((slot) => (c[slot] === centre(c, "U") ? 1 : 0)).join("");
const cornerOffsets = (c: Face[]) =>
  TOP_SIDES.filter((slot) => SLOTS[slot]!.p.every((v) => v !== 0)).map((slot) => {
    const colourFace = AROUND.find((face) => centre(c, face) === c[slot]);
    return colourFace ? (AROUND.indexOf(colourFace) - AROUND.indexOf(SLOTS[slot]!.face) + 4) % 4 : 9;
  });
export const cpKey = (c: Face[]) => {
  const offsets = cornerOffsets(c);
  return offsets.map((o) => (o === 9 ? 9 : (o - offsets[0]! + 4) % 4)).join("");
};
/** The top corners are where they belong to one another: a turn of the top away from their place. */
export const cornersPermuted = (c: Face[]) => new Set(cornerOffsets(c)).size === 1;

function index(cases: CatalogCase[], sets: string[], signature: (c: Face[]) => string, group = "") {
  const map = new Map<string, Known>();
  for (const set of sets)
    for (const known of cases.filter((c) => c.set === set && (c.group ?? "").startsWith(group))) {
      let state: CubeState;
      try {
        state = applyAlg(solved(3), known.setup);
      } catch {
        continue;
      }
      for (let auf = 0; auf < 4; auf++) {
        const sig = signature(colours(auf ? applyAlg(state, AUF[auf]!) : state));
        if (!map.has(sig)) map.set(sig, { case: known, auf });
      }
    }
  return map;
}
const build = (cases: CatalogCase[]) => ({
  oll: index(cases, ["oll"], ollKey),
  pll: index(cases, ["pll"], pllKey),
  f2l: index(cases, ["f2l", "f2l-advanced", "f2l-expert"], pairKey),
  // 2-look: the edges of OLL then its corners; the corners of PLL then its edges.
  eo: index(cases, ["2look-oll"], eoKey, "1"),
  co: index(cases, ["2look-oll"], ollKey, "2"),
  cp: index(cases, ["2look-pll"], cpKey, "1"),
  ep: index(cases, ["2look-pll"], pllKey, "2"),
});
const indexes = new WeakMap<CatalogCase[], ReturnType<typeof build>>();
export const casesOf = (cases: CatalogCase[]) => {
  if (!indexes.has(cases)) indexes.set(cases, build(cases));
  return indexes.get(cases)!;
};

/**
 * The ZBLL case of a last layer with its edges oriented, found by playing each case's algorithm from each angle: the
 * one that solves the cube, the top turned last if need be. Algorithms are parsed once.
 */
const parsed = new Map<string, ReturnType<typeof parseAlg>>();
const movesOf = (alg: string) => {
  if (!parsed.has(alg)) parsed.set(alg, parseAlg(alg));
  return parsed.get(alg)!;
};
function zbllCase(state: CubeState, cases: CatalogCase[]): Known | undefined {
  const top = parseMove("U")!;
  for (const known of cases) {
    if (!known.set.startsWith("zbll") || !known.algorithms[0]) continue;
    for (let auf = 0; auf < 4; auf++) {
      let after: CubeState;
      try {
        after = applyAlg(state, movesOf(compensateAuf(known.algorithms[0].alg, AUF[auf]!)));
      } catch {
        break;
      }
      for (let turn = 0; turn < 4; turn++, after = applyMove(after, top)) if (allDone(colours(after))) return { case: known, auf };
    }
  }
}

/** The cross colour's face of a state, then the state seen with it on the bottom. */
const crossDown = (state: CubeState, cross: Face) => {
  const c = colours(state),
    face = FACES.find((f) => centre(c, f) === cross)!;
  return colours(turnWhole(state, DOWN[face]));
};

/**
 * Optimal cross: a breadth-first table of the four cross edges (where the cross colour of each sits, among the 24 edge
 * stickers) for the 18 face turns, built once.
 */
const EDGE_STICKERS = SLOTS.flatMap((slot, i) => (slot.p.filter((v) => v === 0).length === 1 ? [i] : []));
const CROSS_TURNS = FACES.flatMap((face) => [face, face + "2", face + "'"]);
let crossTable: { distance: Uint8Array; next: Uint8Array[] } | undefined;
const crossSolver = () => {
  if (crossTable) return crossTable;
  const sticker = new Map(EDGE_STICKERS.map((slot, i) => [slot, i]));
  const next = CROSS_TURNS.map((turn) => {
    const perm = movePermutation(parseMove(turn)!);
    return Uint8Array.from(EDGE_STICKERS, (slot) => sticker.get(perm[slot]!)!);
  });
  const distance = new Uint8Array(24 ** 4).fill(255),
    goal = crossGoal();
  distance[goal] = 0;
  let frontier = [goal];
  for (let depth = 0; frontier.length; depth++) {
    const following: number[] = [];
    for (const code of frontier)
      for (const table of next) {
        const moved = moveCode(code, table);
        if (distance[moved] === 255) {
          distance[moved] = depth + 1;
          following.push(moved);
        }
      }
    frontier = following;
  }
  return (crossTable = { distance, next });
};
const D_EDGES = CROSS.map((p) => PIECES.get(key(p))!.find((slot) => SLOTS[slot]!.face === "D")!);
const crossGoal = () => D_EDGES.reduce((code, slot) => code * 24 + EDGE_STICKERS.indexOf(slot), 0);
const moveCode = (code: number, table: Uint8Array) => {
  let out = 0;
  for (let k = 3; k >= 0; k--) out = out * 24 + table[Math.floor(code / 24 ** k) % 24]!;
  return out;
};
/** The shortest cross from these colours (cross on the bottom). */
export function optimalCross(c: Face[]): string[] {
  const { distance, next } = crossSolver();
  // Each cross edge, in the order of the solved cross: the sticker of the cross colour.
  let code = 0;
  for (const home of D_EDGES) {
    const side = PIECES.get(key(SLOTS[home]!.p))!.find((slot) => slot !== home)!;
    const want = [centre(c, "D"), centre(c, SLOTS[side]!.face)].sort().join("");
    let at = 0;
    for (const slots of PIECES.values())
      if (slots.length === 2 && slots.map((slot) => c[slot]!).sort().join("") === want) at = slots.find((slot) => c[slot] === centre(c, "D"))!;
    code = code * 24 + EDGE_STICKERS.indexOf(at);
  }
  const solution: string[] = [];
  while (distance[code]! > 0 && solution.length < 12) {
    const i = next.findIndex((table) => distance[moveCode(code, table)] === distance[code]! - 1);
    code = moveCode(code, next[i]!);
    solution.push(CROSS_TURNS[i]!);
  }
  return solution;
}

/** The faces in front of and above the player, as held faces, when the cube tells how it is held. */
function grip(recording: RecordedSolve, at: number) {
  const sample = recording.orientations.filter((o) => o.at <= at).at(-1) ?? recording.orientations[0];
  if (!sample) return undefined;
  const toward = (direction: number[]) =>
    FACES.reduce((best, face) => {
      const n = SLOTS[FACES.indexOf(face) * 9]!.n,
        dot = rotate(sample.quaternion, n).reduce((sum, v, i) => sum + v * direction[i]!, 0);
      return dot > best.dot ? { face, dot } : best;
    }, { face: "F" as Face, dot: -2 }).face;
  return { front: toward([0, 0, 1]), up: toward([0, 1, 0]) };
}

export function analyseSolve(recording: RecordedSolve, cases: CatalogCase[]): SolveAnalysis | null {
  const { moves } = recording;
  if (!moves.length) return null;
  const states = [recording.start];
  for (const { move } of moves) states.push(applyMove(states.at(-1)!, heldTurn(move)));
  if (!allDone(colours(states.at(-1)!))) return null;

  // The cross colour: the one whose first two layers are done first.
  const byFace = FACES.map((face) => {
    const seen = states.map((state) => colours(turnWhole(state, DOWN[face])));
    return { face, seen, f2l: seen.findIndex(f2lDone), cross: seen.findIndex(crossDone) };
  }).sort((a, b) => a.f2l - b.f2l || a.cross - b.cross);
  const { face: down, seen } = byFace[0]!;
  const cross = centre(colours(recording.start), down);

  // Where each step ends, in turns: the first state where it is done, after the one before.
  const ends: number[] = [];
  const after = (from: number, done: (c: Face[]) => boolean) => {
    const i = seen.findIndex((c, i) => i >= from && done(c));
    return i < 0 ? states.length - 1 : i;
  };
  ends.push(after(0, crossDone));
  for (let k = 1; k <= 4; k++) ends.push(after(ends.at(-1)!, (c) => crossDone(c) && pairsDone(c).length >= k));
  ends.push(after(ends.at(-1)!, (c) => f2lDone(c) && topDone(c)));
  ends.push(states.length - 1);

  const t0 = moves[0]!.at,
    time = (i: number) => (i === 0 ? 0 : moves[i - 1]!.at - t0),
    known = casesOf(cases);

  /**
   * The part of the solve from `states[from]` to `states[to]`, seen in its frame: the cross on the bottom, then the
   * side held in front when its first turn comes (a rotation to bring a pair in front is done just before it).
   */
  function segment(label: string, from: number, to: number, first = false) {
    const start = time(from),
      end = time(to),
      firstTurn = to > from ? moves[from]!.at - t0 : end,
      held = grip(recording, t0 + firstTurn),
      frames = Y.map((y) => [...DOWN[down], ...(y ? [y] : [])]),
      frame = (held && frames.find((f) => faceMap(f)[held.front] === "F")) || frames[0]!,
      map = faceMap(frame),
      state = turnWhole(states[from]!, frame);
    const part: Segment = {
      label,
      from,
      to,
      start,
      end,
      recognition: first ? 0 : firstTurn - start,
      execution: end - (first ? start : firstTurn),
      // A reported turn names the held face it turns the same way a held key names the reported one (z2 both ways).
      turns: mergeTurns(moves.slice(from, to).map(({ move }) => map[canonicalTurn(move)[0] as Face] + move.slice(1))),
      skip: to === from,
      suggestions: [],
      frame,
    };
    const check = (alg: string, done: (c: Face[]) => boolean) => {
      try {
        return done(crossDown(applyAlg(state, alg), cross));
      } catch {
        return false;
      }
    };
    /**
     * The case `match` names, and its algorithms that do `done` from this very state (after `prefix`): the first three
     * are suggested, all are returned.
     */
    const suggest = (match: Known | undefined, prefix: string, done: (c: Face[]) => boolean, ending = false) => {
      const valid: string[] = [];
      if (!match) return valid;
      part.case = { id: match.case.id, name: match.case.name };
      for (const { alg } of match.case.algorithms) {
        let full = turnedBy(prefix, compensateAuf(alg, AUF[match.auf]!));
        // The last step ends with the turn of the top that solves the cube.
        if (ending) {
          const auf = AUF.find((u) => check([full, u].filter(Boolean).join(" "), allDone));
          if (auf === undefined) continue;
          full = [full, auf].filter(Boolean).join(" ");
        }
        if (!check(full, done) || valid.includes(full)) continue;
        valid.push(full);
        if (part.suggestions.length < 3) part.suggestions.push({ alg: full, turns: algTurns(full) });
      }
      return valid;
    };
    return { part, state, c: colours(state), check, suggest };
  }
  /** The first state of the step, past `from`, where `done` holds: where a step done in two looks pauses. */
  const pause = (from: number, to: number, done: (c: Face[], i: number) => boolean) => seen.findIndex((c, i) => i > from && i < to && done(c, i));
  /** The cube one turn of the top from solved: the end of a PLL, before its last turn, not a look of its own. */
  const topAway = (i: number) => AUF.some((u) => u && allDone(colours(applyAlg(turnWhole(states[i]!, DOWN[down]), u))));
  const ollDone = (c: Face[]) => f2lDone(c) && topDone(c);

  const ids: PhaseId[] = ["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"];
  const phases = ids.map((id, k): Phase => {
    const from = k ? ends[k - 1]! : 0,
      to = ends[k]!,
      // A cross made with pairs already in place: XCross, XXCross…
      label = id === "cross" ? "X".repeat(pairsDone(seen[to]!).length) + msg("Cross") : id.startsWith("f2l") ? `F2L ${id.slice(3)}` : id.toUpperCase(),
      { part, state, c, check, suggest } = segment(label, from, to, k === 0),
      phase: Phase = { ...part, id };
    const finish = () => Object.assign(phase, part, { id, label: phase.label });
    if (id === "cross") {
      const optimal = optimalCross(c);
      part.suggestions.push({ alg: optimal.join(" "), turns: optimal.length });
    } else if (id.startsWith("f2l") && !part.skip) {
      // The pair solved by this step, turned to the front right to be read.
      const before = pairsDone(seen[from]!),
        slot = pairsDone(seen[to]!).find((s) => !before.includes(s));
      if (slot) {
        // The rotation that brings the slot, where the step's frame shows it, to the front right.
        const local = part.frame.slice(DOWN[down].length),
          y = Y.find((y) => key(moved(SLOT_PIECES[slot]![1]!, [...local, ...(y ? [y] : [])])) === key(SLOT_PIECES.FR![1]!)) ?? "",
          turned = colours(turnWhole(state, y ? [y] : []));
        phase.pair = [centre(turned, "F"), centre(turned, "R")];
        const insertions = suggest(known.f2l.get(pairKey(turned)), y, (after) => crossDone(after) && pairsDone(after).length > before.length);
        // ZBLS: the last pair went in with the top edges oriented, which none of the catalogue's insertions would do.
        if (to === ends[4] && insertions.length && edgesOriented(crossDown(states[to]!, cross)) && !insertions.some((alg) => check(alg, edgesOriented)))
          phase.label = "ZBLS";
      }
    } else if (id === "oll" && !part.skip) {
      // ZBLL: the whole last layer in one step, from oriented edges.
      const zbll = ends[5] === ends[6] && edgesOriented(c) ? zbllCase(state, cases) : undefined;
      if (zbll) {
        phase.label = "ZBLL";
        suggest(zbll, "", allDone, true);
      } else {
        // The full OLL from where the step started, as the one look to aim for.
        suggest(known.oll.get(ollKey(c)), "", ollDone);
        // 2-look: the top edges oriented first, the F2L intact, before the corners.
        const mid = edgesOriented(c) ? -1 : pause(from, to, (x) => f2lDone(x) && edgesOriented(x) && !topDone(x));
        if (mid > 0) {
          phase.label = "2-look OLL";
          const edges = segment(msg("Edges"), from, mid),
            corners = segment(msg("Corners"), mid, to);
          edges.suggest(known.eo.get(eoKey(edges.c)), "", (x) => f2lDone(x) && edgesOriented(x));
          corners.suggest(known.co.get(ollKey(corners.c)) ?? known.oll.get(ollKey(corners.c)), "", ollDone);
          phase.looks = [edges.part, corners.part];
        }
      }
    } else if (id === "pll" && !part.skip) {
      suggest(known.pll.get(pllKey(c)), "", allDone, true);
      // 2-look: the corners permuted first, the rest of the cube intact, before the edges.
      const mid = cornersPermuted(c) ? -1 : pause(from, to, (x, i) => ollDone(x) && cornersPermuted(x) && !allDone(x) && !topAway(i));
      if (mid > 0) {
        phase.label = "2-look PLL";
        const corners = segment(msg("Corners"), from, mid),
          edges = segment(msg("Edges"), mid, to);
        corners.suggest(known.cp.get(cpKey(corners.c)), "", (x) => ollDone(x) && cornersPermuted(x));
        edges.suggest(known.ep.get(pllKey(edges.c)) ?? known.pll.get(pllKey(edges.c)), "", allDone, true);
        phase.looks = [corners.part, edges.part];
      }
    }
    return finish();
  });
  const turns = phases.reduce((sum, phase) => sum + phase.turns.length, 0),
    total = time(states.length - 1);
  return { time: total, turns, tps: total ? turns / (total / 1000) : 0, cross, phases, states, recording };
}
