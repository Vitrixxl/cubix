import { memo, useId } from "react";
import type { CubeState } from "../../shared/cube";
import { ISO_VIEWBOX, SEAM_FILL, TILE_STROKE, TOP_VIEWBOX, isoCells, isoHull, topLayerCells, usesTopLayerView, type CubeMask } from "../../shared/cubeDiagram";
export { FACE_COLORS, type CubeMask } from "../../shared/cubeAppearance";

/** Lightweight isometric cube for static previews: one SVG, no CSS 3D transforms. Geometry and colours come from `shared/cubeDiagram`. */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full", className }: { state: CubeState; size?: number; mask?: CubeMask; className?: string }) {
  const titleId = useId();
  if (usesTopLayerView(state, mask)) return (
    <svg className={className} width={size} height={size} viewBox={TOP_VIEWBOX} role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>{mask === "OLL" ? "OLL top-layer case preview" : "PLL top-layer case preview"}</title>
      <g {...TILE_STROKE}>
        {topLayerCells(state, mask).map(({ key, ...polygon }) => <polygon key={key} {...polygon} />)}
      </g>
    </svg>
  );
  return (
    <svg className={className} width={size} height={size} viewBox={ISO_VIEWBOX} role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>Rubik's Cube case preview</title>
      <polygon points={isoHull(state)} fill={SEAM_FILL} />
      <g {...TILE_STROKE}>
        {isoCells(state, mask).map(({ key, ...polygon }) => <polygon key={key} {...polygon} />)}
      </g>
    </svg>
  );
});
