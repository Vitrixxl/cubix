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
/** Six corners of the isometric silhouette; painted in the seam colour under the tiles. */
export const ISO_HULL = "60,5 111,32 111,86 60,113 9,86 9,32";
/** Each tile is stroked in its own colour so its corners come out slightly rounded. */
export const TILE_STROKE = { strokeWidth: 0.9, strokeLinejoin: "round" } as const;
// Half the seam between two neighbouring tiles, as a fraction of one tile.
const GAP = 0.05;

type Point = readonly [number, number];
const topPoint = (column: number, row: number): Point => [60 + (column - row) * 17, 5 + (column + row) * 9];
const frontPoint = (column: number, row: number): Point => [9 + column * 17, 32 + column * 9 + row * 18];
const rightPoint = (column: number, row: number): Point => [60 + column * 17, 59 - column * 9 + row * 18];
/** Tile of a face: pulled back from its neighbours by the seam, flush with the cube edge on the outside. */
function cell(point: (column: number, row: number) => Point, column: number, row: number, dimension: number): string {
  const span = (index: number) => [index + (index > 0 ? GAP : 0), index + 1 - (index < dimension - 1 ? GAP : 0)] as const;
  const [c0, c1] = span(column), [r0, r1] = span(row);
  const scale = 3 / dimension;
  return [point(c0 * scale, r0 * scale), point(c1 * scale, r0 * scale), point(c1 * scale, r1 * scale), point(c0 * scale, r1 * scale)].map(([x, y]) => `${x},${y}`).join(" ");
}
const FACES = [{ face: "U", offset: 0, point: topPoint }, { face: "F", offset: 18, point: frontPoint }, { face: "R", offset: 36, point: rightPoint }] as const satisfies readonly { face: Face; offset: number; point: typeof topPoint }[];

export interface IsoCell { key: string; points: string; fill: string; stroke: string }
/** Isometric view: U, F and R faces of any cube size, 3·n² polygons. */
export function isoCells(state: CubeState, mask: CubeMask): IsoCell[] {
  const dimension = cubeSize(state);
  return FACES.flatMap(({ face, offset, point }) => Array.from({ length: dimension * dimension }, (_, index) => {
    const row = Math.floor(index / dimension), column = index % dimension;
    const slot = offset / 9 * dimension * dimension + index;
    const fill = stickerHex(state, slot, mask);
    return { key: `${face}-${index}`, points: cell(point, column, row, dimension), fill, stroke: fill };
  }));
}

/** Top-layer view for 3×3 OLL and PLL: the U face plus the side stickers around it. */
export const usesTopLayerView = (state: CubeState, mask: CubeMask) => cubeSize(state) === 3 && (mask === "OLL" || mask === "PLL");
// Side stickers ordered as they appear around a top-down U face.
const TOP_LAYER_SIDES = { back: [29, 28, 27], right: [38, 37, 36], front: [18, 19, 20], left: [45, 46, 47] } as const;
export interface TopCell { key: string; x: number; y: number; width: number; height: number; rx: number; fill: string; stroke: string }
export function topLayerCells(state: CubeState, mask: CubeMask): TopCell[] {
  const fill = (slot: number) => stickerHex(state, slot, mask);
  return ([
    ...Array.from({ length: 9 }, (_, slot) => ({ key: `u-${slot}`, x: 28 + (slot % 3) * 22, y: 28 + Math.floor(slot / 3) * 22, width: 20, height: 20, rx: 2, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.back.map((slot, i) => ({ key: `b-${slot}`, x: 28 + i * 22, y: 13, width: 20, height: 10, rx: 1.5, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.right.map((slot, i) => ({ key: `r-${slot}`, x: 97, y: 28 + i * 22, width: 10, height: 20, rx: 1.5, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.front.map((slot, i) => ({ key: `f-${slot}`, x: 28 + i * 22, y: 97, width: 20, height: 10, rx: 1.5, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.left.map((slot, i) => ({ key: `l-${slot}`, x: 13, y: 28 + i * 22, width: 10, height: 20, rx: 1.5, fill: fill(slot) })),
  ]).map(rect => ({ ...rect, stroke: rect.fill }));
}
