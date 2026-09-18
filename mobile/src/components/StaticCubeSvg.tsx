import { memo } from "react";
import Svg, { G, Polygon } from "react-native-svg";
import type { CubeState } from "../../../src/shared/cube";
import { ISO_VIEWBOX, SEAM_FILL, TILE_STROKE, TOP_VIEWBOX, isoCells, isoHull, topLayerCells, usesTopLayerView, type CubeMask } from "../../../src/shared/cubeDiagram";
export { FACE_COLORS, type CubeMask } from "../../../src/shared/cubeAppearance";

/** Same cells and colours as the web/desktop diagrams (`shared/cubeDiagram`), drawn with react-native-svg. */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full" }: { state: CubeState; size?: number; mask?: CubeMask }) {
  if (usesTopLayerView(state, mask)) return <Svg width={size} height={size} viewBox={TOP_VIEWBOX}>
    <G {...TILE_STROKE}>
      {topLayerCells(state, mask).map(({ key, ...polygon }) => <Polygon key={key} {...polygon} />)}
    </G>
  </Svg>;
  return <Svg width={size} height={size} viewBox={ISO_VIEWBOX}>
    <Polygon points={isoHull(state)} fill={SEAM_FILL} />
    <G {...TILE_STROKE}>
      {isoCells(state, mask).map(({ key, ...polygon }) => <Polygon key={key} {...polygon} />)}
    </G>
  </Svg>;
});
