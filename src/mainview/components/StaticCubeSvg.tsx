import { memo, useId } from "react";
import { colorOf, originInULayer, slotInULayer, type CubeState, type Face } from "../../shared/cube";
import { FACE_COLORS, type CubeMask } from "./Cube3D";

const GREY = "rgb(58, 58, 66)";
const DIM = "rgb(36, 36, 42)";

function color(state: CubeState, slot: number, mask: CubeMask): string {
  const face = colorOf(state, slot);
  if (mask === "OLL") return face === "U" ? FACE_COLORS.U : slotInULayer(slot) ? GREY : DIM;
  if (mask === "PLL") return slotInULayer(slot) ? FACE_COLORS[face] : DIM;
  if (mask === "F2L") return originInULayer(state, slot) ? GREY : FACE_COLORS[face];
  return FACE_COLORS[face];
}

type Point = readonly [number, number];

function inset(points: Point[], amount = 1.45): string {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points
    .map(([x, y]) => {
      const distance = Math.hypot(cx - x, cy - y);
      const k = distance ? amount / distance : 0;
      return `${x + (cx - x) * k},${y + (cy - y) * k}`;
    })
    .join(" ");
}

function topPoint(column: number, row: number): Point {
  return [60 + (column - row) * 17, 5 + (column + row) * 9];
}
function frontPoint(column: number, row: number): Point {
  return [9 + column * 17, 32 + column * 9 + row * 18];
}
function rightPoint(column: number, row: number): Point {
  return [60 + column * 17, 59 - column * 9 + row * 18];
}

function cell(point: (column: number, row: number) => Point, column: number, row: number): string {
  return inset([point(column, row), point(column + 1, row), point(column + 1, row + 1), point(column, row + 1)]);
}

const FACE_OFFSET: Record<Extract<Face, "U" | "F" | "R">, number> = { U: 0, F: 18, R: 36 };

const TOP_LAYER_SIDES = {
  // Ordered as they appear around a top-down U face.
  back: [29, 28, 27],
  right: [38, 37, 36],
  front: [18, 19, 20],
  left: [45, 46, 47],
} as const;

function TopLayerSvg({ state, size, mask, className, titleId }: { state: CubeState; size: number; mask: "OLL" | "PLL"; className?: string; titleId: string }) {
  const faceCells = Array.from({ length: 9 }, (_, slot) => ({
    slot,
    x: 28 + (slot % 3) * 22,
    y: 28 + Math.floor(slot / 3) * 22,
  }));

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>{mask === "OLL" ? "OLL top-layer case preview" : "PLL top-layer case preview"}</title>
      <g stroke="rgba(7, 7, 10, .92)" strokeWidth="1.25" strokeLinejoin="round">
        {faceCells.map(({ slot, x, y }) => (
          <rect key={`u-${slot}`} x={x} y={y} width="20" height="20" rx="2" fill={color(state, slot, mask)} />
        ))}
        {TOP_LAYER_SIDES.back.map((slot, index) => (
          <rect key={`b-${slot}`} x={28 + index * 22} y="13" width="20" height="10" rx="1.5" fill={color(state, slot, mask)} />
        ))}
        {TOP_LAYER_SIDES.right.map((slot, index) => (
          <rect key={`r-${slot}`} x="97" y={28 + index * 22} width="10" height="20" rx="1.5" fill={color(state, slot, mask)} />
        ))}
        {TOP_LAYER_SIDES.front.map((slot, index) => (
          <rect key={`f-${slot}`} x={28 + index * 22} y="97" width="20" height="10" rx="1.5" fill={color(state, slot, mask)} />
        ))}
        {TOP_LAYER_SIDES.left.map((slot, index) => (
          <rect key={`l-${slot}`} x="13" y={28 + index * 22} width="10" height="20" rx="1.5" fill={color(state, slot, mask)} />
        ))}
      </g>
    </svg>
  );
}

/** Lightweight isometric cube for static previews: one SVG, 27 visible stickers, no CSS 3D transforms. */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full", className }: { state: CubeState; size?: number; mask?: CubeMask; className?: string }) {
  const titleId = useId();
  if (mask === "OLL" || mask === "PLL") return <TopLayerSvg state={state} size={size} mask={mask} className={className} titleId={titleId} />;

  const faces = [
    { face: "U" as const, point: topPoint },
    { face: "F" as const, point: frontPoint },
    { face: "R" as const, point: rightPoint },
  ];

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 118" role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>Rubik's Cube case preview</title>
      <g stroke="rgba(7, 7, 10, .9)" strokeWidth="1.15" strokeLinejoin="round">
        {faces.flatMap(({ face, point }) =>
          Array.from({ length: 9 }, (_, index) => {
            const row = Math.floor(index / 3);
            const column = index % 3;
            const slot = FACE_OFFSET[face] + index;
            return <polygon key={`${face}-${index}`} points={cell(point, column, row)} fill={color(state, slot, mask)} />;
          }),
        )}
      </g>
    </svg>
  );
});
