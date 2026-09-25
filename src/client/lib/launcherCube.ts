/**
 * The startup cube shared by the desktop launcher window and the phone launcher screen: a stickerless
 * 3×3 seen from a corner like the application icon, scrambled, that solves itself move by move and
 * ends standing as the solved model.
 *
 * Everything here is pure geometry and timing. Each renderer (DOM SVG, react-native-svg) draws the
 * polygons of `launcherCubeFrame` and drives the progress with `launcherProgress`.
 */

export type LauncherFill = "U" | "D" | "F" | "B" | "R" | "L" | "core";
export interface LauncherPolygon { key: string; points: string; fill: LauncherFill; opacity: number }
export const LAUNCHER_VIEWBOX = "0 0 120 120";
/** Colours of the application icon (white top, green front, red right) and their opposites, over a dark core. */
export const LAUNCHER_PALETTE: Record<LauncherFill, string> = {
  U: "#ece8e2", D: "#ffd93b", F: "#22bf5b", B: "#3d7ce0", R: "#e94444", L: "#ff8a1f", core: "#262630",
};

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

type Vector = readonly [number, number, number];
type Point = readonly [number, number];
type Matrix = readonly [Vector, Vector, Vector];
/** A quarter-turn move: the layer at `layer` along `axis` turns `turns` right-hand quarter turns about +axis. */
interface Move { axis: 0 | 1 | 2; layer: -1 | 0 | 1; turns: 1 | 2 | 3 }
const FACE_AXIS: Record<Exclude<LauncherFill, "core">, { axis: 0 | 1 | 2; sign: 1 | -1 }> = {
  R: { axis: 0, sign: 1 }, L: { axis: 0, sign: -1 }, U: { axis: 1, sign: 1 }, D: { axis: 1, sign: -1 }, F: { axis: 2, sign: 1 }, B: { axis: 2, sign: -1 },
};
/** Standard notation: a clockwise face turn seen from that face is a negative right-hand turn about its outward normal. */
function move(notation: string): Move {
  const face = FACE_AXIS[notation[0] as keyof typeof FACE_AXIS];
  const clockwise = notation.endsWith("'") ? 3 : notation.endsWith("2") ? 2 : 1;
  const turns = ((face.sign > 0 ? 4 - clockwise : clockwise) % 4) as 1 | 2 | 3;
  return { axis: face.axis, layer: face.sign, turns };
}
/** The scramble the cube starts from; solving plays it backwards. */
export const LAUNCHER_SCRAMBLE = ["R", "U'", "F2", "L", "D", "B'"] as const;
const SOLUTION: readonly Move[] = [...LAUNCHER_SCRAMBLE].reverse().map(notation => {
  const m = move(notation);
  return { ...m, turns: ((4 - m.turns) % 4) as 1 | 2 | 3 };
});

const IDENTITY: Matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** Right-hand quarter turn about +axis, as an integer matrix (columns are the images of the axes). */
const QUARTER: readonly Matrix[] = [
  [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
];
const apply = (m: Matrix, v: Vector): Vector => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];
const multiply = (a: Matrix, b: Matrix): Matrix => [apply(a, b[0]), apply(a, b[1]), apply(a, b[2])];
const transpose = (m: Matrix): Matrix => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
/** Continuous right-hand rotation by `angle` about +axis, matching QUARTER at 90°. */
function turn(axis: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle), a = (axis + 1) % 3, b = (axis + 2) % 3;
  return (v: Vector): Vector => {
    const out = [...v] as [number, number, number];
    out[a] = c * v[a] - s * v[b];
    out[b] = s * v[a] + c * v[b];
    return out;
  };
}

interface Piece { home: Vector; position: Vector; orientation: Matrix }
/** Pieces in a fixed order, so keys stay stable between frames. */
const HOMES: readonly Vector[] = Array.from({ length: 27 }, (_, index) => [(index % 3) - 1, Math.floor(index / 3) % 3 - 1, Math.floor(index / 9) - 1] as const);
function applyMove(pieces: readonly Piece[], m: Move): Piece[] {
  let rotation = IDENTITY;
  for (let i = 0; i < m.turns; i++) rotation = multiply(QUARTER[m.axis], rotation);
  return pieces.map(piece => piece.position[m.axis] !== m.layer ? piece
    : { ...piece, position: apply(rotation, piece.position), orientation: multiply(rotation, piece.orientation) });
}
/** State before each solving move; the last entry is the solved cube. */
const STATES: readonly (readonly Piece[])[] = (() => {
  let state: readonly Piece[] = HOMES.map(home => ({ home, position: home, orientation: IDENTITY }));
  for (const notation of LAUNCHER_SCRAMBLE) state = applyMove(state, move(notation));
  const states = [state];
  for (const m of SOLUTION) states.push(state = applyMove(state, m));
  return states;
})();

const YAW = -Math.PI / 4, PITCH = Math.atan(1 / Math.SQRT2);
/** Half the seam between two neighbouring stickers, in cube units. */
const GAP = 0.055;
const SCALE = 21.5, CENTER = 60;
const FILL_OF: Record<string, LauncherFill> = { "0,1": "R", "0,-1": "L", "1,1": "U", "1,-1": "D", "2,1": "F", "2,-1": "B" };
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (t: number) => Math.min(1, Math.max(0, t));

function view(yaw: number, pitch: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Yaw around the vertical axis, then pitch toward the viewer. z grows toward the viewer.
  return ([x, y, z]: Vector): Vector => {
    const rx = cy * x + sy * z, rz = -sy * x + cy * z;
    return [rx, cp * y - sp * rz, sp * y + cp * rz];
  };
}
const project = ([x, y]: Vector): Point => [CENTER + x * SCALE, CENTER - y * SCALE];
const format = (points: Point[]) => points.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).join(" ");
/** Convex hull of projected points, for the dark silhouette of a piece. */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...chain(sorted), ...chain(sorted.reverse())];
}

/**
 * Polygons of one frame in painting order, in the 120×120 view box. `progress` is the solving progress and
 * `time` (ms) only adds a slow sway once the cube is solved, so it reads as a solid object rather than a picture.
 */
export function launcherCubeFrame(progress: number, time = 0): LauncherPolygon[] {
  const t = clamp(progress);
  const sway = t >= 1 ? 0.035 * Math.sin(time / 850) : 0;
  const camera = view(YAW + sway, PITCH);
  // No fade: the cube is fully drawn from the first frame and stays on screen, scrambled, between cycles.
  const opacity = 1;
  const count = SOLUTION.length;
  const step = Math.min(count - 1, Math.floor(t * count));
  const fraction = t >= 1 ? 0 : smooth(t * count - step);
  const pieces = STATES[t >= 1 ? count : step];
  const current = SOLUTION[step];
  const angle = fraction * (Math.PI / 2) * (current.turns === 3 ? -1 : current.turns);
  const spin = turn(current.axis, angle);
  const place = (piece: Piece, v: Vector) => fraction > 0 && piece.position[current.axis] === current.layer ? spin(v) : v;
  const depthOf = (v: Vector) => camera(v)[2];
  const ordered = pieces.map((piece, index) => ({ piece, index })).sort((a, b) => depthOf(place(a.piece, a.piece.position)) - depthOf(place(b.piece, b.piece.position)));
  const polygons: LauncherPolygon[] = [];
  for (const { piece, index } of ordered) {
    const { position, orientation } = piece;
    const local = transpose(orientation);
    const corners: Point[] = [];
    for (let bit = 0; bit < 8; bit++) corners.push(project(camera(place(piece, [position[0] + (bit & 1 ? 0.5 : -0.5), position[1] + (bit & 2 ? 0.5 : -0.5), position[2] + (bit & 4 ? 0.5 : -0.5)]))));
    polygons.push({ key: `p${index}`, points: format(hull(corners)), fill: "core", opacity });
    for (let axis = 0; axis < 3; axis++) for (const sign of [1, -1] as const) {
      // A face carries colour only if, in the piece's own frame, it is one of its outer faces at home.
      const normal: Vector = axis === 0 ? [sign, 0, 0] : axis === 1 ? [0, sign, 0] : [0, 0, sign];
      const own = apply(local, normal);
      const ownAxis = own.findIndex(v => v !== 0), ownSign = own[ownAxis];
      if (piece.home[ownAxis] !== ownSign) continue;
      // Culling by the true normal, including a turning layer.
      if (camera(place(piece, normal))[2] <= 0.02) continue;
      const a = (axis + 1) % 3, b = (axis + 2) % 3;
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => {
        const corner = [...position] as [number, number, number];
        corner[axis] += sign * 0.5;
        // Seams appear between neighbouring stickers; an edge on the outside of the cube stays flush.
        corner[a] += sa * (0.5 - (position[a] === sa ? 0 : GAP));
        corner[b] += sb * (0.5 - (position[b] === sb ? 0 : GAP));
        return corner as Vector;
      }).map(v => place(piece, v));
      polygons.push({ key: `p${index}-${ownAxis}${ownSign > 0 ? "+" : "-"}`, points: format(points.map(v => project(camera(v)))), fill: FILL_OF[`${ownAxis},${ownSign}`], opacity });
    }
  }
  return polygons;
}
