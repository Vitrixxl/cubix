import { memo } from "react";
import Svg, { Path } from "react-native-svg";
import { useColors } from "../theme";
import type { CubeState } from "../../../src/shared/cube";
import { EDGE_STROKE, ISO_VIEWBOX, SEAM_FILL, TILE_STROKE, TOP_VIEWBOX, diagramPaths, viewForMask, type CubeMask, type DiagramView } from "../../../src/shared/cubeDiagram";
export { type CubeMask } from "../../../src/shared/cubeAppearance";

/**
 * Same cells and colours as the web/desktop diagrams (`shared/cubeDiagram`), drawn with react-native-svg.
 * Every element becomes a native view here, so the tiles are merged into one path per colour.
 */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full", view = viewForMask(mask), held = false }: { state: CubeState; size?: number; mask?: CubeMask; view?: DiagramView; held?: boolean }) {
  const { hull, tiles, edges } = diagramPaths(state, mask, view, held), rim = useColors().variables["--rim"];
  // By day, seen from above, the tiles get the theme's dark rim (see `themeTokens`).
  const outline = !hull && rim !== "transparent" ? { stroke: rim, strokeWidth: 1.2 } : null;
  return <Svg width={size} height={size} viewBox={view === "iso" ? ISO_VIEWBOX : TOP_VIEWBOX}>
    {hull && <Path d={hull} fill={SEAM_FILL} />}
    {/* The 3D cube's stickers are filled alone; seen from above, each is stroked in its colour to round it. */}
    {tiles.map(({ fill, d }) => <Path key={fill} d={d} fill={fill} {...(hull ? null : { stroke: fill, ...TILE_STROKE, ...outline })} />)}
    {edges && <Path d={edges} {...EDGE_STROKE} />}
  </Svg>;
});
