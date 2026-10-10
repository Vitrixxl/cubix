/**
 * The 3D algorithm player's logic, shared by the web app and Android: an algorithm read into the words it is shown
 * with (moves and their brackets) and the moves it plays, each played move pointing back to the move written, the
 * case it solves as a 3D scene, and the playback clock (play, pause, step, seek, speed). Pure: each renderer draws
 * `algShapes` at the clock's position and keeps the clock running.
 */
import { applyMove, invertToken, parseMove, solved, type Move } from "../../shared/cube";
import { stickerColors, type CubeMask } from "../../shared/cubeAppearance";
import { cubeFace, cubeOrientation, cubeSceneDuration, cubeShapes, cubeViewRadius, turnCube, type CubeOrientation, type CubeScene } from "../../shared/cubeScene";
import { polyOrientation, polyScene, polySceneDuration, polyShapes, polyTurns, type PolyPuzzle, type PolyScene } from "../../shared/puzzleScene";

/** A piece of a written algorithm: a move (its index among the written moves in `move`) or bracket marks. */
export interface AlgPart { text: string; move?: number }
/** A move to play and the written move it comes from (a repeated group plays the same written move again). */
export interface PlayedMove { token: string; source: number }
export interface ReadAlg {
  /** Whitespace-separated words, each split into its moves and its marks: `(R` → `(`, `R`. */
  words: AlgPart[][];
  /** Every move played, brackets expanded: repeats repeated, primed groups inverted, `[A, B]` and `[A: B]` spelled out. */
  moves: PlayedMove[];
  /** Whether every move could be read. */
  ok: boolean;
}

type Node = { move: string; source: number } | { group: Node[]; second?: Node[]; op?: "," | ":"; count: number; prime: boolean };
const MOVE_RE = /\d*[UDFBRLudfbrlMESxyz]w?\d*'?\d*/y;
/** The moves of the other puzzles: the megaminx's faces by name, the square-1's `(x, y)` and `/`. */
const POLY_MOVE_RE: Record<PolyPuzzle, RegExp> = {
  pyram: /[UDFBRLudfbrlxyz]'?\d*'?/y,
  skewb: /[UDFBRLxyz]'?\d*'?/y,
  minx: /(?:DBR|DBL|BR|BL|DR|DL|[UDFRLBxyz])(?:\+\+|--|\d*'?\d*)/y,
  sq1: /\(\s*-?\d+\s*,\s*-?\d+\s*\)|\//y,
};
const SUFFIX_RE = /\d*'?\d*/y;
const OPEN = "([", CLOSE = ")]";

/** Reads a written algorithm: what it shows and what it plays. Unknown text makes it unreadable (`ok` false) but still shown. */
export function readAlg(alg: string, puzzle?: PolyPuzzle): ReadAlg {
  const moveRe = puzzle ? POLY_MOVE_RE[puzzle] : MOVE_RE;
  const words: AlgPart[][] = [];
  let word: AlgPart[] = [],
    moveCount = 0,
    ok = true;
  const mark = (text: string) => {
    const last = word.at(-1);
    if (last && last.move === undefined) last.text += text;
    else word.push({ text });
  };
  const endWord = () => {
    if (word.length) words.push(word);
    word = [];
  };
  // Recursive descent over the text, building the display words as it goes.
  let i = 0;
  const text = alg ?? "";
  function sequence(closing?: string): { nodes: Node[]; second?: Node[]; op?: "," | ":" } {
    const nodes: Node[] = [];
    let first: Node[] | undefined, op: "," | ":" | undefined;
    while (i < text.length) {
      const c = text[i]!;
      if (/\s/.test(c)) {
        endWord();
        i++;
        continue;
      }
      moveRe.lastIndex = i;
      const found = moveRe.exec(text)?.[0];
      if (found) {
        word.push({ text: found, move: moveCount });
        nodes.push({ move: found, source: moveCount++ });
        i += found.length;
        continue;
      }
      if (OPEN.includes(c)) {
        mark(c);
        i++;
        const inner = sequence(c === "(" ? ")" : "]");
        SUFFIX_RE.lastIndex = i;
        const suffix = SUFFIX_RE.exec(text)?.[0] ?? "";
        if (suffix) mark(suffix);
        i += suffix.length;
        const count = Number(suffix.replace("'", "") || 1);
        nodes.push({ group: inner.nodes, second: inner.second, op: inner.op, count: Number.isFinite(count) ? count : 1, prime: suffix.includes("'") });
        continue;
      }
      if (CLOSE.includes(c)) {
        if (c !== closing) ok = false;
        mark(c);
        i++;
        break;
      }
      if ((c === "," || c === ":") && closing === "]" && !first) {
        mark(c);
        endWord();
        first = nodes.splice(0);
        op = c;
        i++;
        continue;
      }
      ok = false;
      mark(c);
      i++;
    }
    return first ? { nodes: first, second: nodes, op } : { nodes };
  }
  const root = sequence();
  endWord();
  const invert = (list: PlayedMove[]) => [...list].reverse().map((m) => ({ ...m, token: invertToken(m.token) }));
  const expand = (nodes: Node[]): PlayedMove[] =>
    nodes.flatMap((node) => {
      if ("move" in node) return [{ token: node.move, source: node.source }];
      const a = expand(node.group),
        b = node.second ? expand(node.second) : [];
      const body = node.op === "," ? [...a, ...b, ...invert(a), ...invert(b)] : node.op === ":" ? [...a, ...b, ...invert(a)] : a;
      const repeated = Array.from({ length: Math.min(node.count, 12) }, () => body).flat();
      return node.prime ? invert(repeated) : repeated;
    });
  return { words, moves: expand(root.nodes), ok };
}

/** The algorithm undoing `alg`: the setup of the case it solves. */
export const inverseAlg = (alg: string) =>
  [...readAlg(alg).moves]
    .reverse()
    .map((m) => invertToken(m.token))
    .join(" ");

/** The moves of `alg` on a cube of `size`, or null when one of them does not exist there. Moves turning nothing are dropped. */
export function playableMoves(alg: string, size: number): (Move & { source: number })[] | null {
  const read = readAlg(alg);
  if (!read.ok) return null;
  const out: (Move & { source: number })[] = [];
  for (const m of read.moves) {
    const move = parseMove(m.token, size);
    if (!move) return null;
    if (move.q) out.push({ ...move, source: m.source });
  }
  return out;
}

/** The scene of an algorithm: the case it solves (the algorithm undone from a solved cube), then each of its moves. */
export interface CubeAlgScene extends CubeScene {
  /** The written move each played move comes from. */
  sources: number[];
}
/** The same on another puzzle (`polyScene`), each turn played its own move. */
export interface PolyAlgScene extends PolyScene {
  sources: number[];
}
export type AlgScene = CubeAlgScene | PolyAlgScene;
const isPoly = (scene: AlgScene): scene is PolyAlgScene => "puzzle" in scene;
/**
 * The scene of `alg` on a cube of `size`: from `setup` (moves from a solved cube; "" the solved cube) or, by default,
 * from the case it solves (the algorithm undone), then each of its moves.
 */
export function algScene(alg: string, size: number, mask: CubeMask = "full", setup?: string): CubeAlgScene | null {
  if (!Number.isInteger(size) || size < 2 || size > 7) return null;
  const moves = playableMoves(alg, size),
    from = setup === undefined ? null : playableMoves(setup, size);
  // No turns at all shows the cube where the setup leaves it.
  if (!moves || (!moves.length && setup === undefined) || (setup !== undefined && !from)) return null;
  let state = solved(size);
  if (from) for (const move of from) state = applyMove(state, move);
  else for (const move of [...moves].reverse()) state = applyMove(state, { ...move, q: (4 - move.q) % 4 });
  const start = state,
    states = [Array.from(state)];
  for (const move of moves) {
    state = applyMove(state, move);
    states.push(Array.from(state));
  }
  // Colours are given where the cube starts, centres in place, as the case's diagram shows it: a slice or a rotation
  // in the algorithm (a leading y') then turns the centres away from there. A stage's mask greys what it should there.
  return { size, colors: stickerColors(start, mask), states, moves, sources: moves.map((m) => m.source) };
}

/** The scene of `alg` on another puzzle, from the case it solves; null when a move does not exist there. */
export function polyAlgScene(puzzle: PolyPuzzle, alg: string): PolyAlgScene | null {
  const read = readAlg(alg, puzzle);
  if (!read.ok) return null;
  const turns = read.moves.map((m) => ({ source: m.source, turns: polyTurns(puzzle, m.token) }));
  // Only the square-1 has moves turning nothing, (0, 0).
  if (puzzle !== "sq1" && turns.some((t) => t.turns.length !== 1)) return null;
  const played = turns.flatMap((t) => t.turns.map((turn) => ({ ...turn, source: t.source })));
  if (!played.length) return null;
  return { ...polyScene(puzzle, played, true, true), sources: played.map((t) => t.source) };
}

/** Moves the scene plays. */
export const algTotal = (scene: AlgScene) => scene.sources.length;
/** Half the width the scene is drawn in (`paintShapes`). */
export const algRadius = (scene: AlgScene) => (isPoly(scene) ? scene.radius : cubeViewRadius(scene));

/** Shapes of the scene `position` moves into it (fractions turn the layer part way), seen with `orientation`. */
export const algShapes = (scene: AlgScene, position: number, orientation?: CubeOrientation) => {
  const total = algTotal(scene);
  if (isPoly(scene)) return polyShapes(scene, total ? (position / total) * polySceneDuration(scene) : 0, orientation ?? polyOrientation(scene.puzzle));
  return cubeShapes(scene, total ? (position / total) * cubeSceneDuration(scene) : 0, undefined, undefined, orientation);
};

// ---------------------------------------------------------------------------
// Playback clock
// ---------------------------------------------------------------------------
export const PLAYER_SPEEDS = [0.25, 0.5, 1, 2] as const;
/** Moves per second at 1×. */
export const MOVES_PER_SECOND = 2;

export interface Playback {
  /** Moves done, fractions while a layer turns. */
  position: number;
  /** Where the clock is heading; equal to `position` at rest. */
  target: number;
  /** Playing on to the end (rather than finishing one step). */
  playing: boolean;
  speed: number;
}
export const startPlayback = (speed = 1): Playback => ({ position: 0, target: 0, playing: false, speed });

/** The clock `seconds` later. */
export function advance(p: Playback, seconds: number): Playback {
  if (p.position === p.target) return p.playing ? { ...p, playing: false } : p;
  const delta = seconds * p.speed * MOVES_PER_SECOND,
    position = p.target > p.position ? Math.min(p.target, p.position + delta) : Math.max(p.target, p.position - delta);
  return { ...p, position, playing: p.playing && position !== p.target };
}
export const isMoving = (p: Playback) => p.position !== p.target;
/** Play to the end, from the start again once there. */
export const play = (p: Playback, total: number): Playback =>
  p.position >= total ? { ...p, position: 0, target: total, playing: true } : { ...p, target: total, playing: true };
/** Stop after the turn in progress. */
export const pause = (p: Playback): Playback => ({
  ...p,
  playing: false,
  target: p.target > p.position ? Math.ceil(p.position) : Math.floor(p.position),
});
export const toggle = (p: Playback, total: number) => (p.playing ? pause(p) : play(p, total));
/** One move on, turned. */
export const stepForward = (p: Playback, total: number): Playback => ({ ...p, playing: false, target: Math.min(total, Math.floor(p.position) + 1) });
/** One move back, turned backwards. */
export const stepBack = (p: Playback): Playback => ({ ...p, playing: false, target: Math.max(0, Math.ceil(p.position) - 1) });
export const restart = (p: Playback): Playback => ({ ...p, position: 0, target: 0, playing: false });
/** Straight to a position (the scrubber); `settle` turns on to the nearest whole move. */
export const seek = (p: Playback, position: number, total: number, settle = false): Playback => {
  const at = Math.max(0, Math.min(total, position));
  return { ...p, position: at, target: settle ? Math.round(at) : at, playing: false };
};
/** Plays move `index` alone: the cube shows the moves before it, then turns it. */
export const playMove = (p: Playback, index: number, total: number): Playback => {
  const at = Math.max(0, Math.min(total - 1, index));
  return { ...p, position: at, target: at + 1, playing: false };
};
export const nextSpeed = (speed: number) => PLAYER_SPEEDS[(PLAYER_SPEEDS.indexOf(speed as never) + 1) % PLAYER_SPEEDS.length]!;
/** The played move to highlight: the one turning, or the last one done at rest; -1 before the first. */
export const currentMove = (p: Playback) => (p.position % 1 ? Math.floor(p.position) : p.position - 1);
/** The written move to highlight, from the played one. */
export const currentSource = (scene: Pick<AlgScene, "sources">, p: Playback) => scene.sources[currentMove(p)] ?? -1;
export const speedLabel = (speed: number) => `${speed}×`;

// ---------------------------------------------------------------------------
// The running player
// ---------------------------------------------------------------------------
export interface PlayerOptions {
  speed?: number;
  /** Starts playing after this many milliseconds; none, it waits on the case. */
  autoplay?: number;
  /** Plays again and again, the cube shown back at the start between two plays (the notation tiles). */
  loop?: boolean;
  /** The view the cube is first seen from, and back to on a reset. */
  view?: { yaw: number; pitch: number };
}

/** The face held in front, in cube axes, and how long `showFront` marks it. */
const FRONT = [0, 0, 1], FRONT_PULSE_MS = 2200;

/**
 * One algorithm being played: the clock running frame by frame, the cube's orientation under the pointer, and
 * listeners told of every change (the renderer redraws, the controls follow `playback`). Both renderers use it as is.
 */
export class AlgPlayer {
  playback: Playback;
  orientation: CubeOrientation;
  /** Playing again and again (a looping player between two plays, or turning). */
  looping: boolean;
  private home: CubeOrientation;
  private listeners = new Set<() => void>();
  private frame = 0;
  private last = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pulseStart = 0;
  private pulseFrame = 0;
  constructor(readonly scene: AlgScene, private options: PlayerOptions = {}) {
    this.playback = startPlayback(options.speed ?? 1);
    this.home = options.view ? cubeOrientation(options.view.yaw, options.view.pitch) : isPoly(scene) ? polyOrientation(scene.puzzle) : cubeOrientation();
    this.orientation = this.home;
    this.looping = !!options.loop;
    if (options.autoplay !== undefined) this.later(options.autoplay, () => this.play());
  }
  get total() {
    return algTotal(this.scene);
  }
  /** The puzzle other than a cube the scene is of, to read its algorithms (`readAlg`). */
  get puzzle() {
    return isPoly(this.scene) ? this.scene.puzzle : undefined;
  }
  get radius() {
    return algRadius(this.scene);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getSnapshot = () => this.playback;
  /** Shapes to draw now. */
  shapes = () => algShapes(this.scene, this.playback.position, this.orientation);
  /** The written move to highlight. */
  current = () => currentSource(this.scene, this.playback);

  play = () => {
    this.looping = !!this.options.loop;
    this.set(play(this.playback, this.total));
  };
  pause = () => {
    this.looping = false;
    this.set(pause(this.playback));
  };
  /** Whether it plays: on its way to the end, or between two plays of a loop. */
  get active() {
    return this.playback.playing || this.looping;
  }
  toggle = () => (this.active ? this.pause() : this.play());
  stepForward = () => this.set(stepForward(this.playback, this.total));
  stepBack = () => this.set(stepBack(this.playback));
  restart = () => this.set(restart(this.playback));
  /** Back to the case and played again (Replay). */
  replay = () => {
    this.set(restart(this.playback));
    this.set(play(this.playback, this.total));
  };
  seek = (position: number, settle = false) => this.set(seek(this.playback, position, this.total, settle));
  /** Turns the written move `source`: its next play from where the cube stands, its first otherwise. */
  playSource = (source: number) => {
    const plays = this.scene.sources.flatMap((s, i) => (s === source ? [i] : []));
    if (!plays.length) return;
    const index = plays.find((i) => i >= Math.floor(this.playback.position)) ?? plays[0]!;
    this.set(playMove(this.playback, index, this.total));
  };
  setSpeed = (speed: number) => {
    // Changing speed between two loops must keep the scheduled next turn.
    this.playback = { ...this.playback, speed };
    this.emit();
  };
  cycleSpeed = () => this.setSpeed(nextSpeed(this.playback.speed));
  /** Spins the cube about its vertical axis and tilts it within bounds (radians across and down, see `turnCube`). */
  rotate = (across: number, down = 0) => {
    this.orientation = turnCube(this.orientation, across, down);
    this.emit();
  };
  resetView = () => {
    this.orientation = this.home;
    this.emit();
  };
  /** Marks the face to hold in front (see `pulse`), turning the cube back first if that face is out of sight. */
  showFront = () => {
    // Other puzzles have no face to light: they turn back to the front.
    if (isPoly(this.scene)) return this.resetView();
    if (!cubeFace(this.scene.size, FRONT, this.orientation).seen) this.orientation = this.home;
    this.pulseStart = Date.now();
    if (this.pulseFrame) cancelAnimationFrame(this.pulseFrame);
    const tick = () => {
      this.emit();
      this.pulseFrame = Date.now() - this.pulseStart < FRONT_PULSE_MS ? requestAnimationFrame(tick) : 0;
    };
    tick();
  };
  /** The mark of `showFront` while it lasts: the front face on screen (see `cubeFace`) and how far along it is, 0 to 1. */
  pulse = () => {
    const t = (Date.now() - this.pulseStart) / FRONT_PULSE_MS;
    if (!this.pulseStart || t >= 1 || isPoly(this.scene)) return null;
    const face = cubeFace(this.scene.size, FRONT, this.orientation);
    return face.seen ? { ...face, t } : null;
  };
  /** Turned away from the view it started with (see `resetView`). */
  turned = () => this.orientation !== this.home;
  dispose = () => {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.pulseFrame) cancelAnimationFrame(this.pulseFrame);
    this.frame = this.pulseFrame = 0;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.listeners.clear();
  };

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  private set(next: Playback) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.playback = next;
    this.emit();
    if (isMoving(next) && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }
  private tick = () => {
    const now = performance.now();
    this.playback = advance(this.playback, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    this.emit();
    if (isMoving(this.playback)) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    this.frame = 0;
    if (this.looping && this.playback.position >= this.total)
      this.later(900, () => {
        this.set(restart(this.playback));
        this.later(350, () => this.set(play(this.playback, this.total)));
      });
  };
}
