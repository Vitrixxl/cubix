/**
 * Geometry and colours of the static case diagrams. Web, desktop exports and mobile
 * all draw from these cells so every platform shows the same picture for a case.
 */
import { cubeSize, type CubeState } from "./cube";
import { hexOf, stickerColors, type CubeMask } from "./cubeAppearance";
import { CUBE_BODY, cubeShapes, cubeViewRadius } from "./cubeScene";
export type { CubeMask } from "./cubeAppearance";

const palettes = new WeakMap<CubeState, Map<string, number[]>>();
/** Hex colour of one sticker slot, memoised per state, mask and palette (a `held` scramble, see `stickerColors`). */
export function stickerHex(state: CubeState, slot: number, mask: CubeMask, held = false): string {
  let masks = palettes.get(state);
  if (!masks) palettes.set(state, masks = new Map());
  const key = held ? `${mask}:held` : mask;
  let palette = masks.get(key);
  if (!palette) masks.set(key, palette = stickerColors(state, mask, held));
  return hexOf(palette[state[slot]]);
}

export const ISO_VIEWBOX = "0 0 120 120";
export const TOP_VIEWBOX = "0 0 120 120";
/** Stickerless speedcube look: coloured pieces meet at hairline seams over a dark core, no black rims. */
export const SEAM_FILL = "#121216";
/** Each tile is stroked in its own colour so its corners come out slightly rounded. */
export const TILE_STROKE = { strokeWidth: 0.9, strokeLinejoin: "round" } as const;
/** Hairline drawn over the cube edges, where two colours of one piece meet: one screen pixel, as on the 3D cube. */
export const EDGE_STROKE = { fill: "none", stroke: SEAM_FILL, strokeWidth: 1, vectorEffect: "non-scaling-stroke", strokeLinecap: "round", strokeLinejoin: "round" } as const;
// Same piece shapes as the desktop 3D cube, in tile units: centres and the centre side of edges are rounded, the inner
// tip of a corner piece gets a softer radius.
const ROUND = 0.26;
const CORNER_ROUND = 0.12;
const ARC_STEPS = 6;

type Point = readonly [number, number];
const format = (points: Point[]) => points.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(" ");
/** Quarter turn from `from` to `to` around `center`, both one radius away on perpendicular sides. */
function arc(center: Point, from: Point, to: Point): Point[] {
  return Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
    const angle = Math.PI / 2 * step / ARC_STEPS, cos = Math.cos(angle), sin = Math.sin(angle);
    return [center[0] + cos * (from[0] - center[0]) + sin * (to[0] - center[0]), center[1] + cos * (from[1] - center[1]) + sin * (to[1] - center[1])] as const;
  });
}
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

export interface IsoCell { key: string; points: string; fill: string; stroke: string }
interface IsoPicture { hull: string; cells: IsoCell[]; edges: string[] }
const pictures = new WeakMap<CubeState, Map<string, IsoPicture>>();
/**
 * Isometric view: the 3D cube's own shapes at rest (shared/cubeScene), from its camera, in ISO_VIEWBOX: a picture is
 * the cube the app turns, pieces, seams and proportions alike. Memoised per state, mask and palette.
 */
function isoPicture(state: CubeState, mask: CubeMask, held: boolean): IsoPicture {
  let masks = pictures.get(state);
  if (!masks) pictures.set(state, masks = new Map());
  const key = held ? `${mask}:held` : mask;
  let picture = masks.get(key);
  if (!picture) {
    const scene = { size: cubeSize(state), colors: stickerColors(state, mask, held), states: [Array.from(state)], moves: [] };
    const unit = 60 / cubeViewRadius(scene);
    const points = (shape: number[][]) => format(shape.map(([x, y]) => [60 + x! * unit, 60 - y! * unit] as const));
    picture = { hull: "", cells: [], edges: [] };
    for (const [index, shape] of cubeShapes(scene, 0).entries()) {
      if (shape.line) picture.edges.push(points(shape.points));
      else if (shape.color === CUBE_BODY && !picture.hull) picture.hull = points(shape.points);
      else picture.cells.push({ key: `t-${index}`, points: points(shape.points), fill: hexOf(shape.color), stroke: hexOf(shape.color) });
    }
    masks.set(key, picture);
  }
  return picture;
}
/** Silhouette of the cube's body, painted in the seam colour under the tiles. */
export const isoHull = (state: CubeState) => isoPicture(state, "full", false).hull;
/** The seams where two colours of one piece meet along the cube's edges, drawn over the tiles. */
export const isoEdges = (state: CubeState) => isoPicture(state, "full", false).edges;
/** The stickers the eye sees: the U, F and R faces of any cube size. */
export const isoCells = (state: CubeState, mask: CubeMask, held = false) => isoPicture(state, mask, held).cells;

/**
 * Which picture explains a case best. Last-layer cases (OLL, PLL, parities) are read from above with the side
 * stickers folded out around the U face; PBL needs both layers and blindfolded targets lie anywhere, so the side faces are folded out whole; everything
 * else keeps the isometric cube.
 */
export type DiagramView = "iso" | "top" | "unfolded";
export const viewForStage = (stage: string): DiagramView => ["OLL", "PLL", "ZBLL", "Parity", "Last slot", "OLLCP", "COLL", "CMLL", "CLL", "ELL"].includes(stage) ? "top" : stage === "PBL" || stage === "EG" || stage === "TCLL" || stage === "BLD" ? "unfolded" : "iso";
/** Without a stage, the mask alone tells a last-layer case. */
export const viewForMask = (mask: CubeMask): DiagramView => mask === "OLL" || mask === "EO" || mask === "PLL" || mask === "CMLL" ? "top" : "iso";
export type TopCell = IsoCell;
/** Rectangle as a polygon with one radius per corner: top-left, top-right, bottom-right, bottom-left. */
function roundedRect(x: number, y: number, width: number, height: number, radii: readonly number[]): string {
  return format(CORNERS.flatMap(([sx, sy], index) => {
    const cx = sx < 0 ? x : x + width, cy = sy < 0 ? y : y + height, radius = radii[index];
    const onVertical: Point = [cx, cy - sy * radius], onHorizontal: Point = [cx - sx * radius, cy];
    return arc([cx - sx * radius, cy - sy * radius], sx * sy > 0 ? onVertical : onHorizontal, sx * sy > 0 ? onHorizontal : onVertical);
  }));
}
/** View from above for any cube size: the U face, and around it `depth` rows of every side face (one row for the top layer). */
export function topLayerCells(state: CubeState, mask: CubeMask, view: DiagramView = "top", held = false): TopCell[] {
  const n = cubeSize(state), area = n * n, last = n - 1, depth = view === "unfolded" ? n : 1;
  const fill = (slot: number) => stickerHex(state, slot, mask, held);
  // The drawing spans 13..107: U tiles one pitch apart, side rows half a pitch thick, 5 units between U and the sides.
  const gap = Math.max(1.5, 6 / n), pitch = (84 + (3 - depth) * gap) / (n + depth), tile = pitch - gap, thickness = (pitch - gap) / 2, rowPitch = thickness + gap;
  const start = 13 + depth * rowPitch - gap + 5, end = start + n * pitch - gap;
  // Same piece shapes as the isometric view: rounded centres, edges rounded on their centre side, a softer inner tip on corners.
  const radius = (column: number, row: number, sx: number, sy: number) => {
    if (column === (sx < 0 ? 0 : last) || row === (sy < 0 ? 0 : last)) return 6 / n;
    return ((column === 0 || column === last) && (row === 0 || row === last) ? CORNER_ROUND : ROUND) * pitch;
  };
  const sideRadius = Array<number>(4).fill(Math.min(1.5, thickness / 4));
  const side = (slot: number, x: number, y: number, width: number, height: number) => ({ key: `s-${slot}`, points: roundedRect(x, y, width, height, sideRadius), fill: fill(slot) });
  const tiles = Array.from({ length: area }, (_, slot) => {
    const column = slot % n, row = Math.floor(slot / n);
    return { key: `u-${slot}`, points: roundedRect(start + column * pitch, start + row * pitch, tile, tile, CORNERS.map(([sx, sy]) => radius(column, row, sx, sy))), fill: fill(slot) };
  });
  // Side faces in U, D, F, B, R, L order; row 0 of each touches U and `i` runs along the U face as seen from above.
  for (let row = 0; row < depth; row++) for (let i = 0; i < n; i++) {
    const along = start + i * pitch, before = start - 5 - thickness - row * rowPitch, after = end + 5 + row * rowPitch;
    tiles.push(
      side(3 * area + row * n + last - i, along, before, tile, thickness),
      side(4 * area + row * n + last - i, after, along, thickness, tile),
      side(2 * area + row * n + i, along, after, tile, thickness),
      side(5 * area + row * n + i, before, along, thickness, tile),
    );
  }
  return tiles.map(tile => ({ ...tile, stroke: tile.fill }));
}

export interface DiagramPath { fill: string; d: string }
export interface DiagramPaths {
  /** Silhouette under the tiles; only in the isometric view. */
  hull?: string;
  /** One path per colour holding every tile of that colour, stroked in its own colour. */
  tiles: DiagramPath[];
  /** The three cube edges as one path; only in the isometric view. */
  edges?: string;
}
/** "x,y x,y …" polygon points as one closed subpath. */
const subpath = (points: string) => `M${points.replaceAll(" ", "L")}Z`;
/** Cells merged into one path per colour, in first-seen order. */
export function mergeCells(cells: IsoCell[]): DiagramPath[] {
  const byFill = new Map<string, string[]>();
  for (const { points, fill } of cells) {
    let parts = byFill.get(fill);
    if (!parts) byFill.set(fill, parts = []);
    parts.push(subpath(points));
  }
  return [...byFill].map(([fill, parts]) => ({ fill, d: parts.join("") }));
}
const pathCache = new WeakMap<CubeState, Map<string, DiagramPaths>>();
/**
 * The whole diagram as a handful of paths instead of one polygon per sticker: renderers that create a
 * native node per element (react-native-svg) mount a 3×3 in about eight nodes rather than thirty.
 * Memoised per state, mask, view and palette, so a list re-rendering the same cases does no geometry twice.
 */
export function diagramPaths(state: CubeState, mask: CubeMask, view: DiagramView = viewForMask(mask), held = false): DiagramPaths {
  let views = pathCache.get(state);
  if (!views) pathCache.set(state, views = new Map());
  const key = `${mask}:${view}${held ? ":held" : ""}`;
  let paths = views.get(key);
  if (!paths) {
    paths = view === "iso"
      ? { hull: subpath(isoHull(state)), tiles: mergeCells(isoCells(state, mask, held)), edges: isoEdges(state).map(points => `M${points.replaceAll(" ", "L")}`).join("") }
      : { tiles: mergeCells(topLayerCells(state, mask, view, held)) };
    views.set(key, paths);
  }
  return paths;
}
