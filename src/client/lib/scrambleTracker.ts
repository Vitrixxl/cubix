/**
 * Follows a scramble done on a smart cube: which of its turns are done, which one comes next, and which turns to undo
 * after a wrong one. Turns are named as the cube reports them and as scrambles are written (white on top, green in
 * front); states are the held ones of `SmartCube`.
 *
 * The cube is on the scramble's path when it looks like the scramble's first k turns applied to a solved cube. Off
 * the path, the turns made since are kept, simplified (a turn and its inverse cancel, opposite faces commute): either
 * they are the start of the next turns (half of an R2, the L of "R L" done first) or they are to be undone.
 */
import { applyMove, faceOfSlot, solved, type CubeState, type Face } from "../../shared/cube";
import { heldTurn } from "./smartCube";

export type TurnProgress = "done" | "partial" | "next" | "todo";
export interface ScrambleProgress {
  /** Where each turn of the scramble stands. */
  turns: TurnProgress[];
  /** Turns to make to come back on the scramble, white on top (empty when on it). */
  undo: string[];
  /** Every turn is done: the cube is scrambled. */
  scrambled: boolean;
  /** The cube is off the scramble from the start: it must be solved first. */
  lost: boolean;
}

const TURN = /^([UDFBRL])(2|'|2')?$/;
const AXIS: Record<Face, number> = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
/** Quarter turns clockwise, 1 to 3. */
const quarters = (turn: string) => (turn.endsWith("2") || turn.endsWith("2'") ? 2 : turn.endsWith("'") ? 3 : 1);
const token = (face: Face, q: number) => face + (q === 2 ? "2" : q === 3 ? "'" : "");
/** Turns about one axis in a row: they commute, so only each face's sum counts. */
type Block = { axis: number; turns: Partial<Record<Face, number>> };
const looks = (state: CubeState) => Array.from(state, (origin) => faceOfSlot(origin)).join("");

/** Whether the scramble can be followed: outer face turns only. */
export const trackable = (scramble: string) => {
  const turns = scramble.trim().split(/\s+/);
  return turns.length > 0 && turns.every((turn) => TURN.test(turn));
};

export class ScrambleTracker {
  private readonly turns: string[];
  /** How the cube looks after each number of the scramble's turns. */
  private readonly path: string[];
  /** The scramble's turns done (-1: off the path from the start). */
  private done = -1;
  /** Turns made since the cube last stood on the path, simplified. */
  private extra: Block[] = [];
  /** Once scrambled, the next turns start the solve: the scramble stays done. */
  private finished = false;

  constructor(scramble: string, state: CubeState) {
    this.turns = scramble.trim().split(/\s+/);
    let cube = solved(3);
    this.path = [looks(cube)];
    for (const turn of this.turns) {
      cube = applyMove(cube, heldTurn(turn));
      this.path.push(looks(cube));
    }
    this.sync(state);
  }

  /** The cube's whole state, without the turn that led to it (on connection, or a resynchronised cube). */
  sync(state: CubeState) {
    if (this.finished) return;
    this.done = this.path.lastIndexOf(looks(state));
    this.extra = [];
  }

  /** A turn reported by the cube, and the state it led to. */
  turn(move: string, state: CubeState) {
    if (this.finished) return;
    const on = this.path.lastIndexOf(looks(state));
    if (on >= 0 || this.done < 0) {
      this.done = on;
      this.extra = [];
      this.finished = on === this.turns.length;
      return;
    }
    const face = move[0] as Face,
      last = this.extra.at(-1);
    if (last?.axis === AXIS[face]) {
      const q = ((last.turns[face] ?? 0) + quarters(move)) % 4;
      if (q) last.turns[face] = q;
      else delete last.turns[face];
      if (!Object.keys(last.turns).length) this.extra.pop();
    } else this.extra.push({ axis: AXIS[face], turns: { [face]: quarters(move) } });
  }

  get progress(): ScrambleProgress {
    const { done, turns } = this;
    if (done < 0) return { turns: turns.map(() => "todo"), undo: [], scrambled: false, lost: true };
    const progress: TurnProgress[] = turns.map((_, i) => (i < done ? "done" : "todo"));
    // The next turns about one axis, and how far the turns made since go into them.
    const ahead: number[] = [];
    for (let i = done; i < turns.length && AXIS[turns[i]![0] as Face] === AXIS[turns[done]![0] as Face]; i++) ahead.push(i);
    const made = this.extra.length === 1 && ahead.length && this.extra[0]!.axis === AXIS[turns[done]![0] as Face] ? this.extra[0]!.turns : undefined;
    const started =
      !!made &&
      Object.entries(made).every(([face, q]) => {
        const i = ahead.find((i) => turns[i]![0] === face);
        if (i === undefined) return false;
        const need = quarters(turns[i]!);
        return q === need || (need === 2 && (q === 1 || q === 3));
      });
    if (this.extra.length && !started)
      return {
        turns: progress.map((p, i) => (i === done ? "next" : p)),
        undo: [...this.extra].reverse().flatMap((block) => Object.entries(block.turns).map(([face, q]) => token(face as Face, 4 - q!))),
        scrambled: false,
        lost: false,
      };
    for (const i of ahead) {
      const q = made?.[turns[i]![0] as Face];
      if (q) progress[i] = q === quarters(turns[i]!) ? "done" : "partial";
    }
    if (!progress.includes("partial")) {
      const next = progress.indexOf("todo");
      if (next >= 0) progress[next] = "next";
    }
    return { turns: progress, undo: [], scrambled: done === turns.length, lost: false };
  }
}
