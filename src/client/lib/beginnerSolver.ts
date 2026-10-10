/**
 * The 3×3 beginner method of the Learn course (src/shared/methods.ts) played from any cube, for the assisted solve:
 * each step's turns, piece by piece, with the course's own algorithms. The cube stays held yellow on top, green in
 * front, from start to end: only outer faces turn, as a smart cube reports them, so nothing asks to turn the cube over.
 */
import { applyAlg, type CubeState, type Face } from "../../shared/cube";
import { METHODS } from "../../shared/methods";
import { msg } from "../i18n/msg";
import { allDone, colours, cornersPermuted, crossDone, edgesOriented, mergeTurns, optimalCross, pieceColours, solvedAt, topDone } from "./solveAnalysis";

export interface BeginnerPart {
  /** The course's step, from 0 (white cross) to 5 (last layer permutation). */
  step: number;
  label: string;
  /** The colours of the piece placed, for a corner or an edge. */
  piece?: Face[];
  alg: string;
  /** The course's algorithm the part is made of, and how many times in a row it is done. */
  gesture?: { alg: string; times: number };
}

const STEPS = METHODS["333"].find((m) => m.id === "beginner")!.steps;
const alg = (name: string) => STEPS.flatMap((step) => step.algs ?? []).find((a) => a.name === name)!.alg;
const LINE = alg("Line"),
  L = alg("L"),
  SUNE = alg("Sune").replace(/[()]/g, ""),
  CORNERS = alg("Corner cycle"),
  UA = alg("Edge cycle · Ua"),
  UB = alg("Edge cycle · Ub");
const AUF = ["", "U", "U2", "U'"];

/** Each slot's turns, from those of the front right: the faces trade places as the cube would turn about U. */
const AROUND: Record<string, string> = { F: "R", R: "B", B: "L", L: "F" };
const turned = (moves: string, k: number) => moves.replace(/[FRBL]/g, (f) => Array.from({ length: k }).reduce<string>((face) => AROUND[face]!, f));
const INSERT = ["U R U' R' U' F' U F", "U' F' U F U R U' R'"];
/**
 * The four slots of the first two layers. The corner goes in with R U R' U' repeated, as the course teaches, or its
 * mirror on the other slots: the hands stay on R, L and U. The edge goes in with the right or the left insertion.
 */
const SLOTS = [
  { faces: ["F", "R"], k: 0, trigger: "R U R' U'" },
  { faces: ["R", "B"], k: 1, trigger: "R' U' R U" },
  { faces: ["B", "L"], k: 2, trigger: "L U L' U'" },
  { faces: ["L", "F"], k: 3, trigger: "L' U' L U" },
].map(({ faces, k, trigger }) => {
  const x = faces.includes("R") ? 1 : -1,
    z = faces.includes("F") ? 1 : -1;
  return { corner: [x, -1, z], edge: [x, 0, z], faces: faces as Face[], trigger, inserts: INSERT.map((moves) => turned(moves, k)) };
});
type Slot = (typeof SLOTS)[number];

const length = (moves: string) => moves.split(/\s+/).filter(Boolean).length;
const join = (...moves: string[]) => moves.filter(Boolean).join(" ");
const cornerIn = (c: Face[], slot: Slot) => solvedAt(c, slot.corner);
const edgeIn = (c: Face[], slot: Slot) => solvedAt(c, slot.edge);
const firstLayer = (c: Face[]) => crossDone(c) && SLOTS.every((slot) => cornerIn(c, slot));
const twoLayers = (c: Face[]) => firstLayer(c) && SLOTS.every((slot) => edgeIn(c, slot));

/** The shortest of `candidates` after which `ok` holds. */
function shortest(state: CubeState, candidates: string[], ok: (c: Face[]) => boolean) {
  let best: string | null = null;
  for (const moves of candidates) if ((!best || length(moves) < length(best)) && ok(colours(applyAlg(state, moves)))) best = moves;
  return best;
}

/** The fewest algorithms, each after a turn of the top, that make `ok` true: at most `depth` of them. */
function looks(state: CubeState, algs: string[], ok: (state: CubeState) => boolean, depth: number): string[] | null {
  if (ok(state)) return [];
  if (!depth) return null;
  let best: string[] | null = null;
  for (const auf of AUF)
    for (const moves of algs) {
      const first = join(auf, moves),
        rest = looks(applyAlg(state, first), algs, ok, depth - 1);
      if (rest && (!best || rest.length + 1 < best.length)) best = [first, ...rest];
    }
  return best;
}

/** The beginner method's turns from `start`, part by part; null when the cube cannot be solved (a scan gone wrong). */
export function solveBeginner(start: CubeState): BeginnerPart[] | null {
  const parts: BeginnerPart[] = [];
  let state = start;
  const add = (step: number, label: string, moves: string, piece?: Face[], gesture?: BeginnerPart["gesture"]) => {
    const merged = mergeTurns(moves.split(/\s+/).filter(Boolean)).join(" ");
    if (!merged) return;
    state = applyAlg(state, merged);
    parts.push({ step, label, alg: merged, ...(piece && { piece }), ...(gesture && { gesture }) });
  };
  /** The course's algorithm a look ends with, once. */
  const once = (moves: string, algs: string[]) => {
    const alg = algs.find((a) => moves.endsWith(a));
    return alg ? { alg, times: 1 } : undefined;
  };

  add(0, msg("White cross"), optimalCross(colours(state)).join(" "));
  if (!crossDone(colours(state))) return null;

  for (let guard = 0; guard < 12 && !firstLayer(colours(state)); guard++) {
    const placed = SLOTS.filter((slot) => cornerIn(colours(state), slot));
    let best: { slot: Slot; moves: string } | null = null;
    for (const slot of SLOTS.filter((slot) => !placed.includes(slot))) {
      const candidates = AUF.flatMap((auf) => [1, 2, 3, 4, 5].map((n) => join(auf, ...Array(n).fill(slot.trigger))));
      const moves = shortest(state, candidates, (c) => crossDone(c) && cornerIn(c, slot) && placed.every((other) => cornerIn(c, other)));
      if (moves && (!best || length(moves) < length(best.moves))) best = { slot, moves };
    }
    if (best) {
      // The trigger is four turns, after one turn of the top at most.
      add(1, msg("Corner"), best.moves, ["D", ...best.slot.faces], { alg: best.slot.trigger, times: Math.floor(length(best.moves) / 4) });
      continue;
    }
    // No white corner can reach its slot from the top: one stuck at the bottom in the wrong slot comes out first.
    const stuck = SLOTS.find((slot) => !placed.includes(slot) && pieceColours(colours(state), slot.corner).includes("D"));
    if (!stuck) return null;
    add(1, msg("Take a corner out"), stuck.trigger, undefined, { alg: stuck.trigger, times: 1 });
  }
  if (!firstLayer(colours(state))) return null;

  for (let guard = 0; guard < 12 && !twoLayers(colours(state)); guard++) {
    const placed = SLOTS.filter((slot) => edgeIn(colours(state), slot));
    let best: { slot: Slot; moves: string } | null = null;
    for (const slot of SLOTS.filter((slot) => !placed.includes(slot))) {
      const candidates = AUF.flatMap((auf) => slot.inserts.map((insert) => join(auf, insert)));
      const moves = shortest(state, candidates, (c) => firstLayer(c) && edgeIn(c, slot) && placed.every((other) => edgeIn(c, other)));
      if (moves && (!best || length(moves) < length(best.moves))) best = { slot, moves };
    }
    if (best) {
      add(2, msg("Edge"), best.moves, best.slot.faces, once(best.moves, best.slot.inserts));
      continue;
    }
    // Every edge left is in the middle layer, in the wrong slot or flipped: a top edge put in its place takes it out.
    const stuck = SLOTS.find((slot) => !placed.includes(slot) && !pieceColours(colours(state), slot.edge).includes("U"));
    if (!stuck) return null;
    add(2, msg("Take an edge out"), stuck.inserts[0]!, undefined, { alg: stuck.inserts[0]!, times: 1 });
  }
  if (!twoLayers(colours(state))) return null;

  const cross = looks(state, [LINE, L], (s) => edgesOriented(colours(s)), 3);
  if (!cross) return null;
  for (const moves of cross) add(3, msg("Yellow cross"), moves, undefined, once(moves, [LINE, L]));

  const face = looks(state, [SUNE], (s) => topDone(colours(s)), 3);
  if (!face) return null;
  for (const moves of face) add(4, "Sune", moves, undefined, once(moves, [SUNE]));

  const corners = looks(state, [CORNERS], (s) => cornersPermuted(colours(s)), 2);
  if (!corners) return null;
  for (const moves of corners) add(5, msg("Corner cycle"), moves, undefined, once(moves, [CORNERS]));
  const aligned = (s: CubeState) => AUF.find((auf) => allDone(colours(applyAlg(s, auf))));
  const edges = looks(state, [UA, UB], (s) => aligned(s) !== undefined, 2);
  if (!edges) return null;
  for (const moves of edges) add(5, msg("Edge cycle"), moves, undefined, once(moves, [UA, UB]));
  add(5, msg("Turn the top"), aligned(state) ?? "");
  return allDone(colours(state)) ? parts : null;
}
