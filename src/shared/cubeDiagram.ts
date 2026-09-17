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
export const ISO_STROKE = { stroke: "rgba(7, 7, 10, .9)", strokeWidth: 1.15 } as const;
export const TOP_VIEWBOX = "0 0 120 120";
export const TOP_STROKE = { stroke: "rgba(7, 7, 10, .92)", strokeWidth: 1.25 } as const;

type Point = readonly [number, number];
function inset(points: Point[], amount = 1.45): string {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, y]) => { const distance = Math.hypot(cx - x, cy - y); const k = distance ? amount / distance : 0; return `${x + (cx - x) * k},${y + (cy - y) * k}`; }).join(" ");
}
const topPoint = (column: number, row: number): Point => [60 + (column - row) * 17, 5 + (column + row) * 9];
const frontPoint = (column: number, row: number): Point => [9 + column * 17, 32 + column * 9 + row * 18];
const rightPoint = (column: number, row: number): Point => [60 + column * 17, 59 - column * 9 + row * 18];
const cell = (point: (column: number, row: number) => Point, column: number, row: number) => inset([point(column, row), point(column + 1, row), point(column + 1, row + 1), point(column, row + 1)]);
const FACES = [{ face: "U", offset: 0, point: topPoint }, { face: "F", offset: 18, point: frontPoint }, { face: "R", offset: 36, point: rightPoint }] as const satisfies readonly { face: Face; offset: number; point: typeof topPoint }[];

export interface IsoCell { key: string; points: string; fill: string }
/** Isometric view: U, F and R faces of any cube size, 3·n² polygons. */
export function isoCells(state: CubeState, mask: CubeMask): IsoCell[] {
  const dimension = cubeSize(state);
  return FACES.flatMap(({ face, offset, point }) => Array.from({ length: dimension * dimension }, (_, index) => {
    const row = Math.floor(index / dimension), column = index % dimension;
    const slot = offset / 9 * dimension * dimension + index;
    return { key: `${face}-${index}`, points: cell((c, r) => point(c * 3 / dimension, r * 3 / dimension), column, row), fill: stickerHex(state, slot, mask) };
  }));
}

/** Top-layer view for 3×3 OLL and PLL: the U face plus the side stickers around it. */
export const usesTopLayerView = (state: CubeState, mask: CubeMask) => cubeSize(state) === 3 && (mask === "OLL" || mask === "PLL");
// Side stickers ordered as they appear around a top-down U face.
const TOP_LAYER_SIDES = { back: [29, 28, 27], right: [38, 37, 36], front: [18, 19, 20], left: [45, 46, 47] } as const;
export interface TopCell { key: string; x: number; y: number; width: number; height: number; rx: number; fill: string }
export function topLayerCells(state: CubeState, mask: CubeMask): TopCell[] {
  const fill = (slot: number) => stickerHex(state, slot, mask);
  return [
    ...Array.from({ length: 9 }, (_, slot) => ({ key: `u-${slot}`, x: 28 + (slot % 3) * 22, y: 28 + Math.floor(slot / 3) * 22, width: 20, height: 20, rx: 2, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.back.map((slot, i) => ({ key: `b-${slot}`, x: 28 + i * 22, y: 13, width: 20, height: 10, rx: 1.5, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.right.map((slot, i) => ({ key: `r-${slot}`, x: 97, y: 28 + i * 22, width: 10, height: 20, rx: 1.5, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.front.map((slot, i) => ({ key: `f-${slot}`, x: 28 + i * 22, y: 97, width: 20, height: 10, rx: 1.5, fill: fill(slot) })),
    ...TOP_LAYER_SIDES.left.map((slot, i) => ({ key: `l-${slot}`, x: 13, y: 28 + i * 22, width: 10, height: 20, rx: 1.5, fill: fill(slot) })),
  ];
}
