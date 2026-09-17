/**
 * A stickerless 3×3 drawn in orthographic 3D as SVG paths, plus the scramble-then-solve
 * sequence the loading indicator plays. Pure: no React Native imports, so tests run in Bun.
 *
 * Rendering relies on the cube being a stack of convex boxes: the whole cube when idle, or the
 * turning slab and the still part(s) mid-turn. Faces of one convex box never hide each other,
 * so each box becomes a handful of merged paths (its dark body, then one path per colour) and
 * boxes are painted far to near.
 */
import { applyMove, faceOfSlot, invertAlg, parseAlg, randomScramble, slotsFor, solved, type CubeState, type Face, type Move, type Vec3 } from "../../../src/shared/cube";

/** Colours of the reference cube: white on top, green in front, orange on the right. */
export const PIECE_COLORS: Record<Face, string> = { U: "#f4f4f1", D: "#ffd51e", F: "#27b64d", B: "#2f6de6", R: "#ff8c1a", L: "#e8393b" };
export const VIEWBOX = "-2.6 -2.6 5.2 5.2";

export interface Step { move: Move | null; ms: number }
export interface Layer { fill: string; d: string }

const SCRAMBLE_LENGTH = 7;
const SCRAMBLE_MS = 110, SOLVE_MS = 250, HALF_TURN_MS = 380, THINK_MS = 350, ADMIRE_MS = 900;

/** Scrambles quickly, pauses, solves at a cuber's pace and admires the result; ends where it started. */
export function plan(): Step[] {
  const scramble = randomScramble(SCRAMBLE_LENGTH);
  const steps: Step[] = parseAlg(scramble).map(move => ({ move, ms: SCRAMBLE_MS }));
  steps.push({ move: null, ms: THINK_MS });
  for (const move of parseAlg(invertAlg(scramble))) steps.push({ move, ms: move.q === 2 ? HALF_TURN_MS : SOLVE_MS });
  steps.push({ move: null, ms: ADMIRE_MS });
  return steps;
}
/** Result of playing every step, for tests. */
export function play(steps: Step[], state: CubeState = solved()): CubeState {
  for (const step of steps) if (step.move) state = applyMove(state, step.move);
  return state;
}
export const easeInOut = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const DEG = Math.PI / 180;
const YAW = 38 * DEG, PITCH = 27 * DEG;
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
/** Cube space → view space (x right, y up, z towards the camera), orthographic. */
function view([x, y, z]: Vec3): Vec3 {
  const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}
/** Unit vector pointing at the camera, in cube space. */
const TOWARDS_CAMERA: Vec3 = [sy * cp, sp, cy * cp];
const LIGHT: Vec3 = (() => { const v: Vec3 = [-0.35, 0.85, 0.45]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();

const GAP = 0.045, RADIUS = 0.13, SHADE_STEPS = 24;
const CUBIES: Vec3[] = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) CUBIES.push([x, y, z]);
const NORMALS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (p: Vec3, n: Vec3) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
const SLOT = new Map(slotsFor(3).map((g, i) => [key(g.p, g.n), i]));

/** Rotation by an angle (cos c, sin s) about a positive axis, right-handed like `cube.ts`. */
function rotate([x, y, z]: Vec3, axis: number, c: number, s: number): Vec3 {
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
type Point = [number, number];
const f = (n: number) => n.toFixed(3);
function polygon(points: Point[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + "Z";
}
/**
 * The quad with its corners rounded in the plane of the face, then projected. Orthographic
 * projection is affine, so the projected control points still describe the same curves and a
 * foreshortened piece keeps the elliptical corners of a real rounded piece instead of turning into a pill.
 */
function rounded(points: Vec3[], radius: number, project: (q: Vec3) => Point): string {
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i], prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const toward = (q: Vec3): Vec3 => {
      const v: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const r = Math.min(radius, Math.hypot(...v) / 2) / (Math.hypot(...v) || 1);
      return [p[0] + v[0] * r, p[1] + v[1] * r, p[2] + v[2] * r];
    };
    const [ax, ay] = project(toward(prev)), [px, py] = project(p), [bx, by] = project(toward(next));
    d += `${i ? "L" : "M"}${f(ax)} ${f(ay)}Q${f(px)} ${f(py)} ${f(bx)} ${f(by)}`;
  }
  return d + "Z";
}
/** Corners of the square of half-size `h` on the face of cubie `p` with normal `n` (axis `k`). */
function corners(p: Vec3, n: Vec3, k: number, h: number): Vec3[] {
  const u = (k + 1) % 3, v = (k + 2) % 3;
  const c: number[] = [p[0] + n[0] / 2, p[1] + n[1] / 2, p[2] + n[2] / 2];
  return [[h, h], [-h, h], [-h, -h], [h, -h]].map(([du, dv]) => {
    const q = c.slice() as [number, number, number];
    q[u] += du; q[v] += dv;
    return q;
  });
}
const shadeCache = new Map<string, string>();
function shaded(face: Face, shade: number): string {
  const id = `${face}:${shade}`;
  let colour = shadeCache.get(id);
  if (!colour) {
    const hex = PIECE_COLORS[face].slice(1);
    colour = "#" + [0, 2, 4].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * shade).toString(16).padStart(2, "0")).join("");
    shadeCache.set(id, colour);
  }
  return colour;
}

interface Box { order: number; body: string[]; stickers: Map<string, string[]> }

/**
 * Paths to paint, in order, for the cube in `state` with the layers of `move` turned by `angle`
 * degrees (signed like `moveAngleDeg`). `core` is the colour of the plastic between the pieces.
 */
export function frame(state: CubeState, move: Move | null, angle: number, core: string): Layer[] {
  const turning = move !== null && angle !== 0;
  const axis = move?.axis ?? 1;
  const rad = angle * DEG, c = Math.cos(rad), s = Math.sin(rad);
  const inLayer = (q: number) => move !== null && move.layers.includes(q);
  const boxes = new Map<string, Box>();
  const boxFor = (p: Vec3): Box => {
    let id = "all", order = 0;
    if (turning && move) {
      const q = p[axis];
      if (inLayer(q)) { id = "turning"; order = move.layers.reduce((sum, l) => sum + l, 0) / move.layers.length; }
      else if (q > Math.max(...move.layers)) { id = "above"; order = Math.max(...move.layers) + 1; }
      else { id = "below"; order = Math.min(...move.layers) - 1; }
      order *= TOWARDS_CAMERA[axis];
    }
    let box = boxes.get(id);
    if (!box) { box = { order, body: [], stickers: new Map() }; boxes.set(id, box); }
    return box;
  };
  for (const p of CUBIES) {
    const moving = turning && inLayer(p[axis]);
    const box = boxFor(p);
    for (const n of NORMALS) {
      const k = n[0] ? 0 : n[1] ? 1 : 2;
      const exterior = p[k] * n[k] === 1;
      // Inside faces only show where the turning slab parts from the rest of the cube.
      if (!exterior && (!turning || k !== axis || inLayer(p[k] + n[k]) === inLayer(p[k]))) continue;
      const normal = moving ? rotate(n, axis, c, s) : n;
      const facing = view(normal);
      if (facing[2] < 0.02) continue;
      const project = (q: Vec3): Point => { const v = view(moving ? rotate(q, axis, c, s) : q); return [v[0], -v[1]]; };
      box.body.push(polygon(corners(p, n, k, 0.5).map(project)));
      if (!exterior) continue;
      const light = Math.max(0, facing[0] * LIGHT[0] + facing[1] * LIGHT[1] + facing[2] * LIGHT[2]);
      const shade = Math.round((0.72 + 0.28 * light) * SHADE_STEPS) / SHADE_STEPS;
      const fill = shaded(faceOfSlot(state[SLOT.get(key(p, n))!]), shade);
      let paths = box.stickers.get(fill);
      if (!paths) { paths = []; box.stickers.set(fill, paths); }
      paths.push(rounded(corners(p, n, k, 0.5 - GAP), RADIUS, project));
    }
  }
  const layers: Layer[] = [];
  for (const box of [...boxes.values()].sort((a, b) => a.order - b.order)) {
    layers.push({ fill: core, d: box.body.join("") });
    for (const [fill, paths] of box.stickers) layers.push({ fill, d: paths.join("") });
  }
  return layers;
}
