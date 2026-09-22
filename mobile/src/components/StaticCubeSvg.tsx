import { memo } from "react";
import Svg, { Path } from "react-native-svg";
import type { CubeState } from "../../../src/shared/cube";
import { EDGE_STROKE, ISO_VIEWBOX, SEAM_FILL, TILE_STROKE, TOP_VIEWBOX, diagramPaths, viewForMask, type CubeMask, type DiagramView } from "../../../src/shared/cubeDiagram";
export { FACE_COLORS, type CubeMask } from "../../../src/shared/cubeAppearance";

/**
 * Same cells and colours as the web/desktop diagrams (`shared/cubeDiagram`), drawn with react-native-svg.
 * Every element becomes a native view here, so the tiles are merged into one path per colour.
 */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full", view = viewForMask(mask) }: { state: CubeState; size?: number; mask?: CubeMask; view?: DiagramView }) {
  const { hull, tiles, edges } = diagramPaths(state, mask, view);
  return <Svg width={size} height={size} viewBox={view === "iso" ? ISO_VIEWBOX : TOP_VIEWBOX}>
    {hull && <Path d={hull} fill={SEAM_FILL} />}
    {tiles.map(({ fill, d }) => <Path key={fill} d={d} fill={fill} stroke={fill} {...TILE_STROKE} />)}
    {edges && <Path d={edges} {...EDGE_STROKE} />}
  </Svg>;
});
