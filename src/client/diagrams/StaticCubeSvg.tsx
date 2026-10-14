import { memo, useId } from "react";
import type { CubeState } from "../../shared/cube";
import { EDGE_STROKE, ISO_VIEWBOX, SEAM_FILL, TILE_STROKE, TOP_VIEWBOX, diagramPaths, viewForMask, type CubeMask, type DiagramView } from "../../shared/cubeDiagram";
export { type CubeMask } from "../../shared/cubeAppearance";

/**
 * Lightweight cube for static previews, drawn where it shows rather than downloaded: one SVG of a handful of paths, one
 * a colour (`shared/cubeDiagram`), as the 3D cube or seen from above.
 */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full", view = viewForMask(mask), held = false, className }: { state: CubeState; size?: number; mask?: CubeMask; view?: DiagramView; held?: boolean; className?: string }) {
  const titleId = useId(),
    top = view !== "iso",
    { hull, tiles, edges } = diagramPaths(state, mask, view, held);
  return (
    <svg className={className} width={size} height={size} viewBox={top ? TOP_VIEWBOX : ISO_VIEWBOX} role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>{!top ? "Rubik's Cube case preview" : mask === "OLL" || mask === "EO" ? "OLL top-layer case preview" : mask === "PLL" ? "PLL top-layer case preview" : "Case preview seen from above"}</title>
      {hull && <path d={hull} fill={SEAM_FILL} />}
      {/* Seen from above, each tile is stroked in its colour to round it (and by day in the theme's rim, globals.css). */}
      <g className={top ? "diagram-top" : undefined}>
        {tiles.map(({ fill, d }) => <path key={fill} d={d} fill={fill} {...(top ? { stroke: fill, ...TILE_STROKE } : null)} />)}
      </g>
      {edges && <path d={edges} {...EDGE_STROKE} />}
    </svg>
  );
});
