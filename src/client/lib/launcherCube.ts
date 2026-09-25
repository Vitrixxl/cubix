/**
 * The startup cube shared by the desktop launcher window and the phone launcher screen: the 3D cube of
 * the desktop timer (same model, colours and camera, see `cubeScene`), scrambled, that solves itself move
 * by move and ends standing solved.
 *
 * Everything here is pure geometry and timing. Each renderer (DOM SVG, react-native-svg) draws the
 * polygons of `launcherCubeFrame` and drives the progress with `launcherProgress`.
 */
import { invertAlg } from "../../shared/cube";
import { CUBE_YAW, cubeScene, cubeSceneDuration, cubeShapes, cubeViewRadius } from "../../shared/cubeScene";

/** A filled polygon, or an outline (`line`) one screen pixel wide, in the view box. */
export interface LauncherPolygon { key: string; points: string; color: string; line: boolean; opacity: number }
export const LAUNCHER_VIEWBOX = "0 0 120 120";

/** Milliseconds of each phase of one cycle: the cube solves, stands, scrambles back, a beat of nothing. */
export const LAUNCHER_TIMING = { assemble: 1800, hold: 550, disassemble: 1000, pause: 250 } as const;
export const LAUNCHER_CYCLE = LAUNCHER_TIMING.assemble + LAUNCHER_TIMING.hold + LAUNCHER_TIMING.disassemble + LAUNCHER_TIMING.pause;
/** How long the solved model stands before the launcher hands over to the application. */
export const LAUNCHER_SETTLE = 400;

/**
 * Solving progress (0 = scrambled, 1 = solved) at `elapsed` ms since the launcher appeared. Cycles repeat
 * until loading is done; once `finishAt` (see `launcherFinishAt`) is reached the model stays solved.
 */
export function launcherProgress(elapsed: number, finishAt = Infinity): number {
  if (elapsed >= finishAt) return 1;
  const offset = Math.max(0, elapsed) % LAUNCHER_CYCLE;
  const { assemble, hold, disassemble } = LAUNCHER_TIMING;
  if (offset < assemble) return offset / assemble;
  if (offset < assemble + hold) return 1;
  if (offset < assemble + hold + disassemble) return 1 - (offset - assemble - hold) / disassemble;
  return 0;
}

/**
 * When the model next stands solved, given that loading finished at `elapsed`. During the standing phase
 * that is now; while the cube solves it is the end of that solve; while it scrambles back it is the end of
 * the next solve, so the reverse and forward replay is never cut in the middle.
 */
export function launcherFinishAt(elapsed: number): number {
  const start = Math.floor(Math.max(0, elapsed) / LAUNCHER_CYCLE) * LAUNCHER_CYCLE;
  const offset = Math.max(0, elapsed) - start;
  const { assemble, hold } = LAUNCHER_TIMING;
  if (offset < assemble) return start + assemble;
  if (offset < assemble + hold) return elapsed;
  return start + LAUNCHER_CYCLE + assemble;
}

/** The scramble the cube starts from; solving plays it backwards. */
export const LAUNCHER_SCRAMBLE = ["R", "U'", "F2", "L", "D", "B'"] as const;
/** The timer scene of scramble then solution, kept from the scrambled state on. */
const SCENE = (() => {
  const scramble = LAUNCHER_SCRAMBLE.join(" "), count = LAUNCHER_SCRAMBLE.length;
  const scene = cubeScene(`${scramble} ${invertAlg(scramble)}`, 3, "full");
  return { ...scene, states: scene.states.slice(count), moves: scene.moves.slice(count) };
})();
const CENTER = 60, UNIT = CENTER / cubeViewRadius(SCENE);
const clamp = (t: number) => Math.min(1, Math.max(0, t));
const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");
const format = (points: number[][]) => points.map(([x, y]) => `${Math.round((CENTER + x * UNIT) * 100) / 100},${Math.round((CENTER - y * UNIT) * 100) / 100}`).join(" ");

/**
 * Polygons of one frame in painting order, in the 120×120 view box. `progress` is the solving progress and
 * `time` (ms) only adds a slow sway once the cube is solved, so it reads as a solid object rather than a picture.
 */
export function launcherCubeFrame(progress: number, time = 0): LauncherPolygon[] {
  const t = clamp(progress);
  const sway = t >= 1 ? 0.035 * Math.sin(time / 850) : 0;
  // No fade: the cube is fully drawn from the first frame and stays on screen, scrambled, between cycles.
  const opacity = 1;
  return cubeShapes(SCENE, t * cubeSceneDuration(SCENE), CUBE_YAW + sway).map((shape, index) => ({
    key: `s${index}`, points: format(shape.points), color: hex(shape.color), line: shape.line, opacity,
  }));
}
