/**
 * Training a 3×3 case on a smart cube: the cube tells when the case is set up, its first turn away from the case starts
 * the timer and the case solved stops it.
 *
 * A case is set up when the cube looks like the case's setup applied to a solved cube, on the pieces the case is
 * about: an F2L case wherever the last layer's pieces lie, an OLL case whatever the last layer's permutation (so the
 * end of the previous OLL is a fine start), a PLL case on the whole cube. A turn of the top, or holding the cube
 * another way round, makes the same case. Colours are read against the centres, as the solve analysis does.
 *
 * States are the held ones of `SmartCube` (yellow on top, white under it).
 */
import { applyAlg, applyMove, FACES, faceOfSlot, parseMove, slotsFor, solved, type CubeState, type Face } from "../../shared/cube";
import { puzzleOf, type PuzzleId } from "../../shared/puzzles";
import type { CubeSize } from "../../shared/puzzles";
import { canonicalTurn } from "./smartCube";
import { allDone, AUF, colours, cornersPermuted, DOWN, edgesOriented, f2lDone, faceMap, playable, topDone, turnWhole, Y } from "./solveAnalysis";

/**
 * What solving the case means: the first two layers (F2L), the top oriented (OLL), its edges only (the first look of
 * a 2-look OLL), the corners permuted as well (the first look of a 2-look PLL), or the cube solved (PLL, ZBLL).
 */
export type CaseGoal = "f2l" | "oll" | "eo" | "cp" | "solved";

/** What the training needs of a catalogue case. */
export interface TrainableCase {
  set: string;
  group?: string;
  puzzle_id?: PuzzleId;
  cube_size?: CubeSize | null;
}

/** The goal of a 3×3 case of the F2L, OLL, PLL or ZBLL; null for the cases a smart cube cannot follow. */
export function caseGoal(c: TrainableCase): CaseGoal | null {
  if (puzzleOf(c) !== "333") return null;
  const first = (c.group ?? "").startsWith("1");
  if (c.set === "f2l" || c.set === "f2l-advanced" || c.set === "f2l-expert") return "f2l";
  if (c.set === "oll") return "oll";
  if (c.set === "2look-oll") return first ? "eo" : "oll";
  if (c.set === "2look-pll") return first ? "cp" : "solved";
  if (c.set === "pll" || c.set.startsWith("zbll")) return "solved";
  return null;
}

const SLOTS = slotsFor(3);
/** The sticker slots of the piece at each sticker's place. */
const PIECE = (() => {
  const at = new Map<string, number[]>();
  SLOTS.forEach((slot, i) => at.set(slot.p.join(), [...(at.get(slot.p.join()) ?? []), i]));
  return SLOTS.map((slot) => at.get(slot.p.join())!);
})();
const centreOf = (face: Face) => FACES.indexOf(face) * 9 + 4;

/** The cube with its white centre under it (a setup with rotations may leave it elsewhere). */
function whiteDown(state: CubeState) {
  const face = FACES.find((f) => faceOfSlot(state[centreOf(f)]!) === "D")!;
  return turnWhole(state, DOWN[face]);
}

/**
 * The stickers the goal is about, each named by the centre of its colour (so a cube held another way reads the
 * same); the last layer's pieces only as far as the goal cares: not at all for the F2L, the top colour or not for an
 * orientation.
 */
function look(state: CubeState, goal: CaseGoal) {
  const colour = (slot: number) => faceOfSlot(state[slot]!),
    centre = Object.fromEntries(FACES.map((face) => [colour(centreOf(face)), face])) as Record<Face, Face>,
    top = colour(centreOf("U"));
  return SLOTS.map((_, slot) => {
    const piece = PIECE[slot]!;
    if (!piece.some((s) => colour(s) === top)) return centre[colour(slot)];
    const corner = piece.length === 3,
      oriented = colour(slot) === top ? "Y" : ".";
    switch (goal) {
      case "f2l":
        return "*";
      case "oll":
        return oriented;
      case "eo":
        return corner ? "*" : oriented;
      case "cp":
        return corner ? centre[colour(slot)] : "*";
      case "solved":
        return centre[colour(slot)];
    }
  }).join("");
}

/** Whether a state shows the case set up by `setup` (held notation, from a solved cube). */
export function caseMatcher(setup: string, goal: CaseGoal): (state: CubeState) => boolean {
  let target: CubeState;
  try {
    target = whiteDown(applyAlg(solved(3), setup));
  } catch {
    return () => false;
  }
  const looks = new Set(AUF.map((u) => look(u ? applyAlg(target, u) : target, goal)));
  return (state) => {
    const down = whiteDown(state);
    return Y.some((y) => looks.has(look(y ? turnWhole(down, [y]) : down, goal)));
  };
}

/** Whether the case is solved: its goal reached, a turn of the top left to do when the cube is otherwise solved. */
export function goalReached(state: CubeState, goal: CaseGoal) {
  const down = whiteDown(state),
    c = colours(down);
  switch (goal) {
    case "f2l":
      return f2lDone(c);
    case "oll":
      return f2lDone(c) && topDone(c);
    case "eo":
      return f2lDone(c) && edgesOriented(c);
    case "cp":
      return f2lDone(c) && topDone(c) && cornersPermuted(c);
    case "solved":
      return AUF.some((u) => allDone(u ? colours(applyMove(down, parseMove(u)!)) : c));
  }
}

/**
 * The setup as a smart cube can follow it: face turns only, rotations folded into the faces they bring (a wide turn
 * is a face turn and a rotation). Named as scrambles are, white on top, for `ScrambleTracker`; `held` names them as
 * Cubix shows them, yellow on top. Null when the setup has turns a 3×3 cannot make.
 */
export function setupTurns(setup: string): { canonical: string; held: string } | null {
  const tokens = playable(setup);
  if (tokens === null) return null;
  const frame: string[] = [],
    held: string[] = [];
  for (const token of tokens.split(/\s+/).filter(Boolean)) {
    if (/^[xyz]/.test(token)) {
      frame.push(token);
      continue;
    }
    const seen = faceMap(frame),
      face = FACES.find((f) => seen[f] === token[0])!;
    held.push(face + token.slice(1));
  }
  if (!held.length) return null;
  return { canonical: held.map(canonicalTurn).join(" "), held: held.join(" ") };
}
