/**
 * The startup cube shared by the desktop launcher window and the phone launcher screen:
 * a stickerless 3×3 seen from a corner, like the application icon, whose 27 pieces fly in
 * from an exploded cloud while the whole model turns into its final pose.
 *
 * Everything here is pure geometry and timing. Each renderer (DOM SVG, react-native-svg)
 * draws the polygons of `launcherCubeFrame` and drives the progress with `launcherProgress`.
 */

export type LauncherFill = "U" | "F" | "R" | "core";
export interface LauncherPolygon { key: string; points: string; fill: LauncherFill; opacity: number }
export const LAUNCHER_VIEWBOX = "0 0 120 120";
/** Colours of the application icon: white top, green left, red right over a dark core. */
export const LAUNCHER_PALETTE: Record<LauncherFill, string> = { U: "#ece8e2", F: "#22bf5b", R: "#e94444", core: "#121216" };

/** Milliseconds of each phase of one cycle: pieces assemble, the model stands, pieces fly apart, a beat of nothing. */
export const LAUNCHER_TIMING = { assemble: 1500, hold: 550, disassemble: 900, pause: 250 } as const;
export const LAUNCHER_CYCLE = LAUNCHER_TIMING.assemble + LAUNCHER_TIMING.hold + LAUNCHER_TIMING.disassemble + LAUNCHER_TIMING.pause;
/** How long the finished model stands before the launcher hands over to the application. */
export const LAUNCHER_SETTLE = 400;

/**
 * Assembly progress (0 = exploded cloud, 1 = finished model) at `elapsed` ms since the launcher appeared.
 * Cycles repeat until loading is done; once `finishAt` (see `launcherFinishAt`) is reached the model stays assembled.
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
 * When the model next stands assembled, given that loading finished at `elapsed`. During the standing phase
 * that is now; while pieces assemble it is the end of that phase; while they fly apart it is the end of the
 * next assembly, so the reverse and forward replay is never cut in the middle.
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
const FINAL_YAW = -Math.PI / 4, FINAL_PITCH = Math.atan(1 / Math.SQRT2);
/** The model starts turned away and lower, and rolls into the icon's pose while its pieces arrive. */
const START_YAW = FINAL_YAW - 0.55, START_PITCH = 0.22;
/** Distance a piece starts from its final place, in cube units. */
const EXPLODE = 2.6;
/** The back pieces land first; the front ones may start this fraction of the assembly later. */
const STAGGER = 0.3;
/** Half the seam between two neighbouring stickers, in cube units. */
const GAP = 0.055;
const SCALE = 21.5, CENTER = 60;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp = (t: number) => Math.min(1, Math.max(0, t));
interface Sticker { axis: 0 | 1 | 2; sign: 1 | -1; fill: "U" | "F" | "R" }
const STICKERS: readonly Sticker[] = [
  { axis: 1, sign: 1, fill: "U" }, { axis: 2, sign: 1, fill: "F" }, { axis: 0, sign: 1, fill: "R" },
];
/** Pieces in a fixed order, so keys stay stable between frames. */
const PIECES: readonly Vector[] = Array.from({ length: 27 }, (_, index) => [(index % 3) - 1, Math.floor(index / 3) % 3 - 1, Math.floor(index / 9) - 1] as const);

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
 * Polygons of one frame in painting order, in the 120×120 view box. `progress` is the assembly progress and
 * `time` (ms) only adds a slow sway once the model stands, so it reads as a solid object rather than a picture.
 */
export function launcherCubeFrame(progress: number, time = 0): LauncherPolygon[] {
  const t = clamp(progress);
  const pose = easeOut(t);
  const sway = t >= 1 ? 0.035 * Math.sin(time / 850) : 0;
  const camera = view(START_YAW + (FINAL_YAW - START_YAW) * pose + sway, START_PITCH + (FINAL_PITCH - START_PITCH) * pose);
  const forward = camera([0, 0, 1]), right = camera([1, 0, 0]), up = camera([0, 1, 0]);
  // Camera-space depth (toward the viewer) of a piece decides both its arrival order and its painting order.
  const depthOf = (p: Vector) => camera(p)[2];
  const pieces = PIECES.map((home, index) => {
    const finalDepth = depthOf(home);
    const frontness = (finalDepth / Math.sqrt(3) + 1) / 2;
    const local = easeOut(clamp((t - STAGGER * frontness) / (1 - STAGGER)));
    const length = Math.hypot(...home) || 1;
    const away = EXPLODE * (1 - local);
    const center: Vector = [home[0] + home[0] / length * away, home[1] + home[1] / length * away, home[2] + home[2] / length * away];
    return { index, home, center, local };
  }).filter(piece => piece.local > 0).sort((a, b) => depthOf(a.center) - depthOf(b.center));
  const polygons: LauncherPolygon[] = [];
  const corner = (center: Vector, dx: number, dy: number, dz: number): Vector => [center[0] + dx, center[1] + dy, center[2] + dz];
  for (const { index, home, center, local } of pieces) {
    // A piece fades in over the first part of its flight, so the cloud does not pop into view.
    const opacity = Math.round(Math.min(1, local * 2.5) * 100) / 100;
    const corners: Point[] = [];
    for (let bit = 0; bit < 8; bit++) corners.push(project(camera(corner(center, bit & 1 ? 0.5 : -0.5, bit & 2 ? 0.5 : -0.5, bit & 4 ? 0.5 : -0.5))));
    polygons.push({ key: `p${index}`, points: format(hull(corners)), fill: "core", opacity });
    for (const sticker of STICKERS) {
      // Only the three faces of a piece on the outside of the finished cube carry colour; the rest is core plastic.
      if (home[sticker.axis] !== sticker.sign) continue;
      const normal = sticker.axis === 0 ? right : sticker.axis === 1 ? up : forward;
      if (normal[2] <= 0.02) continue;
      const [a, b] = ([[1, 2], [2, 0], [0, 1]] as const)[sticker.axis];
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => {
        const offset = [0, 0, 0] as [number, number, number];
        offset[sticker.axis] = sticker.sign * 0.5;
        // Seams appear between neighbouring stickers; an edge on the outside of the cube stays flush.
        offset[a] = sa * (0.5 - (home[a] + sa * 0.5 === sa * 1.5 ? 0 : GAP));
        offset[b] = sb * (0.5 - (home[b] + sb * 0.5 === sb * 1.5 ? 0 : GAP));
        return project(camera(corner(center, offset[0], offset[1], offset[2])));
      });
      polygons.push({ key: `p${index}${sticker.fill}`, points: format(points), fill: sticker.fill, opacity });
    }
  }
  return polygons;
}
