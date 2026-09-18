/**
 * Geometry and colours of the static case diagrams. Web, desktop exports and mobile
 * all draw from these cells so every platform shows the same picture for a case.
 */
import { cubeSize, type CubeState, type Face } from "./cube";
import { stickerColors, type CubeMask } from "./cubeAppearance";
export type { CubeMask } from "./cubeAppearance";

const palettes = new WeakMap<CubeState, Map<CubeMask, number[]>>();
/** Hex colour of one sticker slot, memoised per state and mask. */
export function stickerHex(state: CubeState, slot: number, mask: CubeMask): string {
  let masks = palettes.get(state);
  if (!masks) palettes.set(state, masks = new Map());
  let palette = masks.get(mask);
  if (!palette) masks.set(mask, palette = stickerColors(state, mask));
  return `#${palette[state[slot]].toString(16).padStart(6, "0")}`;
}

export const ISO_VIEWBOX = "0 0 120 118";
export const TOP_VIEWBOX = "0 0 120 120";
/** Stickerless speedcube look: coloured pieces meet at hairline seams over a dark core, no black rims. */
export const SEAM_FILL = "#121216";
/** Each tile is stroked in its own colour so its corners come out slightly rounded. */
export const TILE_STROKE = { strokeWidth: 0.9, strokeLinejoin: "round" } as const;
/** Hairline drawn over the cube edges, where two colours of one piece meet. */
export const EDGE_STROKE = { fill: "none", stroke: SEAM_FILL, strokeWidth: 0.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
// Half the seam between two neighbouring tiles, as a fraction of one tile.
const GAP = 0.05;
// Same piece shapes as the desktop 3D cube, in tile units: centres and the centre side of edges are rounded,
// the inner tip of a corner piece gets a softer radius, and cube vertices a barely visible one.
const ROUND = 0.26;
const CORNER_ROUND = 0.12;
// The vertex rounding starts TIP along each cube edge and pulls the point where three colours meet in by TIP_DEPTH per axis.
const TIP = 0.12;
const TIP_DEPTH = 0.024;
const ARC_STEPS = 6;

type Point = readonly [number, number];
type Vector = readonly [number, number, number];
const sum = (a: Vector, b: Vector, factor = 1): Vector => [a[0] + b[0] * factor, a[1] + b[1] * factor, a[2] + b[2] * factor];
const format = (points: Point[]) => points.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(" ");
/** Isometric projection of a point in tile units: x runs right along the front face, y down, z from the back of the top face to the front. */
const project = ([x, y, z]: Vector, dimension: number): Point => {
  const scale = 3 / dimension;
  return [60 + 17 * scale * (x - z), 5 + 9 * scale * (x + z) + 18 * scale * y];
};
/** Quarter turn from `from` to `to` around `center`, both one radius away on perpendicular sides. */
function arc(center: Point, from: Point, to: Point): Point[] {
  return Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
    const angle = Math.PI / 2 * step / ARC_STEPS, cos = Math.cos(angle), sin = Math.sin(angle);
    return [center[0] + cos * (from[0] - center[0]) + sin * (to[0] - center[0]), center[1] + cos * (from[1] - center[1]) + sin * (to[1] - center[1])] as const;
  });
}
/** Seam shared by two faces near a cube vertex: from the cube edge running along `along` to the pulled-in tip. */
function tipCurve(vertex: Vector, along: Vector, inward: Vector): Vector[] {
  const start = sum(vertex, along, TIP), control = sum(vertex, along, 3 * TIP_DEPTH), tip = sum(vertex, inward, TIP_DEPTH);
  return Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
    const t = step / ARC_STEPS;
    return sum(sum(sum([0, 0, 0], start, (1 - t) ** 2), control, 2 * t * (1 - t)), tip, t * t);
  });
}
/** In along one seam of a cube vertex, out along the other. */
const tipCorner = (vertex: Vector, first: Vector, last: Vector, inward: Vector) => [...tipCurve(vertex, first, inward), ...tipCurve(vertex, last, inward).reverse().slice(1)];

interface IsoFace { face: Face; index: number; origin: (dimension: number) => Vector; column: Vector; row: Vector; normal: Vector }
const FACES: readonly IsoFace[] = [
  { face: "U", index: 0, origin: () => [0, 0, 0], column: [1, 0, 0], row: [0, 0, 1], normal: [0, 1, 0] },
  { face: "F", index: 2, origin: dimension => [0, 0, dimension], column: [1, 0, 0], row: [0, 1, 0], normal: [0, 0, -1] },
  { face: "R", index: 4, origin: dimension => [dimension, 0, dimension], column: [0, 0, -1], row: [0, 1, 0], normal: [-1, 0, 0] },
];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
/** Tile of a face: pulled back from its neighbours by the seam, flush with the cube edge on the outside. */
function cell({ origin, column: columnAxis, row: rowAxis, normal }: IsoFace, column: number, row: number, dimension: number): string {
  const last = dimension - 1;
  const outside = (index: number, sign: number) => index === (sign < 0 ? 0 : last);
  const bound = (index: number, sign: number) => sign < 0 ? index + (outside(index, sign) ? 0 : GAP) : index + 1 - (outside(index, sign) ? 0 : GAP);
  const isCorner = (column === 0 || column === last) && (row === 0 || row === last);
  const place = (c: number, r: number) => sum(sum(origin(dimension), columnAxis, c), rowAxis, r);
  const flat = ([c, r]: Point) => project(place(c, r), dimension);
  return format(CORNERS.flatMap(([sc, sr]) => {
    const c = bound(column, sc), r = bound(row, sr);
    // The perimeter reaches this corner along one side and leaves along the other.
    const alongRowFirst = sc * sr > 0;
    if (outside(column, sc) && outside(row, sr)) {
      const inward = sum(sum(normal, columnAxis, -sc), rowAxis, -sr);
      const alongColumn = sum([0, 0, 0], columnAxis, -sc), alongRow = sum([0, 0, 0], rowAxis, -sr);
      return tipCorner(place(c, r), alongRowFirst ? alongRow : alongColumn, alongRowFirst ? alongColumn : alongRow, inward).map(point => project(point, dimension));
    }
    if (outside(column, sc) || outside(row, sr)) return [flat([c, r])];
    const radius = isCorner ? CORNER_ROUND : ROUND;
    const onRowSide: Point = [c, r - sr * radius], onColumnSide: Point = [c - sc * radius, r];
    return arc([c - sc * radius, r - sr * radius], alongRowFirst ? onRowSide : onColumnSide, alongRowFirst ? onColumnSide : onRowSide).map(flat);
  }));
}

const hulls = new Map<number, string>();
/** Silhouette of the isometric cube with its rounded vertices; painted in the seam colour under the tiles. */
export function isoHull(state: CubeState): string {
  const dimension = cubeSize(state);
  let hull = hulls.get(dimension);
  if (!hull) {
    const n = dimension;
    const vertices: Vector[] = [[0, 0, 0], [n, 0, 0], [n, n, 0], [n, n, n], [0, n, n], [0, 0, n]];
    const toward = (from: Vector, to: Vector): Vector => [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1]), Math.sign(to[2] - from[2])];
    hulls.set(dimension, hull = format(vertices.flatMap((vertex, index) => {
      const previous = vertices[(index + 5) % 6], next = vertices[(index + 1) % 6];
      return tipCorner(vertex, toward(vertex, previous), toward(vertex, next), toward(vertex, [n / 2, n / 2, n / 2])).map(point => project(point, dimension));
    })));
  }
  return hull;
}

const edges = new Map<number, string[]>();
/** The three cube edges between the visible faces, following the rounded vertices; drawn over the tiles. */
export function isoEdges(state: CubeState): string[] {
  const dimension = cubeSize(state);
  let lines = edges.get(dimension);
  if (!lines) {
    const n = dimension, near: Vector = [n, 0, n], middle: Vector = [n / 2, n / 2, n / 2];
    const toward = (from: Vector, to: Vector): Vector => [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1]), Math.sign(to[2] - from[2])];
    const far: Vector[] = [[0, 0, n], [n, 0, 0], [n, n, n]];
    edges.set(dimension, lines = far.map(vertex => format([
      ...tipCurve(near, toward(near, vertex), toward(near, middle)).reverse(),
      ...tipCurve(vertex, toward(vertex, near), toward(vertex, middle)),
    ].map(point => project(point, dimension)))));
  }
  return lines;
}

export interface IsoCell { key: string; points: string; fill: string; stroke: string }
/** Isometric view: U, F and R faces of any cube size, 3·n² polygons. */
export function isoCells(state: CubeState, mask: CubeMask): IsoCell[] {
  const dimension = cubeSize(state);
  return FACES.flatMap(face => Array.from({ length: dimension * dimension }, (_, index) => {
    const row = Math.floor(index / dimension), column = index % dimension;
    const fill = stickerHex(state, face.index * dimension * dimension + index, mask);
    return { key: `${face.face}-${index}`, points: cell(face, column, row, dimension), fill, stroke: fill };
  }));
}

/** Top-layer view for 3×3 OLL and PLL: the U face plus the side stickers around it. */
export const usesTopLayerView = (state: CubeState, mask: CubeMask) => cubeSize(state) === 3 && (mask === "OLL" || mask === "PLL");
// Side stickers ordered as they appear around a top-down U face.
const TOP_LAYER_SIDES = { back: [29, 28, 27], right: [38, 37, 36], front: [18, 19, 20], left: [45, 46, 47] } as const;
export type TopCell = IsoCell;
/** Rectangle as a polygon with one radius per corner: top-left, top-right, bottom-right, bottom-left. */
function roundedRect(x: number, y: number, width: number, height: number, radii: readonly number[]): string {
  return format(CORNERS.flatMap(([sx, sy], index) => {
    const cx = sx < 0 ? x : x + width, cy = sy < 0 ? y : y + height, radius = radii[index];
    const onVertical: Point = [cx, cy - sy * radius], onHorizontal: Point = [cx - sx * radius, cy];
    return arc([cx - sx * radius, cy - sy * radius], sx * sy > 0 ? onVertical : onHorizontal, sx * sy > 0 ? onHorizontal : onVertical);
  }));
}
export function topLayerCells(state: CubeState, mask: CubeMask): TopCell[] {
  const fill = (slot: number) => stickerHex(state, slot, mask);
  // Same piece shapes as the isometric view: a rounded centre, edges rounded on their centre side, a softer inner tip on corners.
  const radius = (column: number, row: number, sx: number, sy: number) => {
    if (column === 1 + sx || row === 1 + sy) return 2;
    return (column === 1 || row === 1 ? ROUND : CORNER_ROUND) * 22;
  };
  const side = (slot: number, key: string, x: number, y: number, width: number, height: number) => ({ key: `${key}-${slot}`, points: roundedRect(x, y, width, height, [1.5, 1.5, 1.5, 1.5]), fill: fill(slot) });
  return ([
    ...Array.from({ length: 9 }, (_, slot) => {
      const column = slot % 3, row = Math.floor(slot / 3);
      return { key: `u-${slot}`, points: roundedRect(28 + column * 22, 28 + row * 22, 20, 20, CORNERS.map(([sx, sy]) => radius(column, row, sx, sy))), fill: fill(slot) };
    }),
    ...TOP_LAYER_SIDES.back.map((slot, i) => side(slot, "b", 28 + i * 22, 13, 20, 10)),
    ...TOP_LAYER_SIDES.right.map((slot, i) => side(slot, "r", 97, 28 + i * 22, 10, 20)),
    ...TOP_LAYER_SIDES.front.map((slot, i) => side(slot, "f", 28 + i * 22, 97, 20, 10)),
    ...TOP_LAYER_SIDES.left.map((slot, i) => side(slot, "l", 13, 28 + i * 22, 10, 20)),
  ]).map(tile => ({ ...tile, stroke: tile.fill }));
}
