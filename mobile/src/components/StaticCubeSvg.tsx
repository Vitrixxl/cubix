import { memo } from "react";
import Svg, { G, Polygon, Rect } from "react-native-svg";
import { colorOf, cubeSize, slotInULayer, type CubeState, type Face } from "../../../src/shared/cube";

import { stickerColors } from "../../../src/shared/cubeAppearance";

/** Yellow on top, green in front (orange right, red left) — the usual CFOP colour scheme. */
export const FACE_COLORS: Record<Face, string> = {
  U: "rgb(255, 230, 42)", D: "rgb(236, 232, 226)", F: "rgb(26, 190, 87)", B: "rgb(61, 124, 224)", R: "rgb(255, 128, 31)", L: "rgb(235, 66, 66)",
};
export type CubeMask = "full" | "OLL" | "PLL" | "F2L";
const GREY = "rgb(58, 58, 66)";
const DIM = "rgb(36, 36, 42)";

const f2lColors = new WeakMap<CubeState, number[]>();

function color(state: CubeState, slot: number, mask: CubeMask): string {
  const face = colorOf(state, slot);
  if (mask === "OLL") return face === "U" ? FACE_COLORS.U : slotInULayer(slot, cubeSize(state)) ? GREY : DIM;
  if (mask === "PLL") return slotInULayer(slot, cubeSize(state)) ? FACE_COLORS[face] : DIM;
  if (mask === "F2L") {
    // Normalize rotated setups to the same blue front, red right and white pair.
    let palette = f2lColors.get(state);
    if (!palette) { palette = stickerColors(state, mask); f2lColors.set(state, palette); }
    return `#${palette[state[slot]].toString(16).padStart(6, "0")}`;
  }
  return FACE_COLORS[face];
}

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
const FACE_OFFSET: Record<Extract<Face, "U" | "F" | "R">, number> = { U: 0, F: 18, R: 36 };
const TOP_LAYER_SIDES = { back: [29, 28, 27], right: [38, 37, 36], front: [18, 19, 20], left: [45, 46, 47] } as const;

function TopLayerSvg({ state, size, mask }: { state: CubeState; size: number; mask: "OLL" | "PLL" }) {
  return <Svg width={size} height={size} viewBox="0 0 120 120">
    <G stroke="rgba(7, 7, 10, 0.92)" strokeWidth={1.25} strokeLinejoin="round">
      {Array.from({ length: 9 }, (_, slot) => <Rect key={`u-${slot}`} x={28 + (slot % 3) * 22} y={28 + Math.floor(slot / 3) * 22} width={20} height={20} rx={2} fill={color(state, slot, mask)} />)}
      {TOP_LAYER_SIDES.back.map((slot, index) => <Rect key={`b-${slot}`} x={28 + index * 22} y={13} width={20} height={10} rx={1.5} fill={color(state, slot, mask)} />)}
      {TOP_LAYER_SIDES.right.map((slot, index) => <Rect key={`r-${slot}`} x={97} y={28 + index * 22} width={10} height={20} rx={1.5} fill={color(state, slot, mask)} />)}
      {TOP_LAYER_SIDES.front.map((slot, index) => <Rect key={`f-${slot}`} x={28 + index * 22} y={97} width={20} height={10} rx={1.5} fill={color(state, slot, mask)} />)}
      {TOP_LAYER_SIDES.left.map((slot, index) => <Rect key={`l-${slot}`} x={13} y={28 + index * 22} width={10} height={20} rx={1.5} fill={color(state, slot, mask)} />)}
    </G>
  </Svg>;
}

/** Lightweight isometric cube for static previews: one SVG, 27 visible stickers. */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full" }: { state: CubeState; size?: number; mask?: CubeMask }) {
  const dimension = cubeSize(state);
  if (dimension === 3 && (mask === "OLL" || mask === "PLL")) return <TopLayerSvg state={state} size={size} mask={mask} />;
  const faces = [{ face: "U" as const, point: topPoint }, { face: "F" as const, point: frontPoint }, { face: "R" as const, point: rightPoint }];
  return <Svg width={size} height={size} viewBox="0 0 120 118">
    <G stroke="rgba(7, 7, 10, 0.9)" strokeWidth={1.15} strokeLinejoin="round">
      {faces.flatMap(({ face, point }) => Array.from({ length: dimension * dimension }, (_, index) => {
        const row = Math.floor(index / dimension), column = index % dimension;
        const slot = FACE_OFFSET[face] / 9 * dimension * dimension + index;
        return <Polygon key={`${face}-${index}`} points={cell((c, r) => point(c * 3 / dimension, r * 3 / dimension), column, row)} fill={color(state, slot, mask)} />;
      }))}
    </G>
  </Svg>;
});
