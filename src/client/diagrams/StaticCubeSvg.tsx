import { memo, useId } from "react";
import type { CubeState } from "../../shared/cube";
import { EDGE_STROKE, ISO_VIEWBOX, SEAM_FILL, TILE_STROKE, TOP_VIEWBOX, isoCells, isoEdges, isoHull, topLayerCells, viewForMask, type CubeMask, type DiagramView } from "../../shared/cubeDiagram";
export { FACE_COLORS, type CubeMask } from "../../shared/cubeAppearance";

/** Lightweight isometric cube for static previews: one SVG, no CSS 3D transforms. Geometry and colours come from `shared/cubeDiagram`. */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full", view = viewForMask(mask), className }: { state: CubeState; size?: number; mask?: CubeMask; view?: DiagramView; className?: string }) {
  const titleId = useId();
  if (view !== "iso") return (
    <svg className={className} width={size} height={size} viewBox={TOP_VIEWBOX} role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>{mask === "OLL" ? "OLL top-layer case preview" : mask === "PLL" ? "PLL top-layer case preview" : "Case preview seen from above"}</title>
      <g {...TILE_STROKE}>
        {topLayerCells(state, mask, view).map(({ key, ...polygon }) => <polygon key={key} {...polygon} />)}
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
      <g {...EDGE_STROKE}>
        {isoEdges(state).map(points => <polyline key={points} points={points} />)}
      </g>
    </svg>
  );
});
