import { memo } from "react";
import Svg, { G, Polygon, Rect } from "react-native-svg";
import type { CubeState } from "../../../src/shared/cube";
import { ISO_STROKE, ISO_VIEWBOX, TOP_STROKE, TOP_VIEWBOX, isoCells, topLayerCells, usesTopLayerView, type CubeMask } from "../../../src/shared/cubeDiagram";
export { FACE_COLORS, type CubeMask } from "../../../src/shared/cubeAppearance";

/** Same cells and colours as the web/desktop diagrams (`shared/cubeDiagram`), drawn with react-native-svg. */
export const StaticCubeSvg = memo(function StaticCubeSvg({ state, size = 110, mask = "full" }: { state: CubeState; size?: number; mask?: CubeMask }) {
  if (usesTopLayerView(state, mask)) return <Svg width={size} height={size} viewBox={TOP_VIEWBOX}>
    <G {...TOP_STROKE} strokeLinejoin="round">
      {topLayerCells(state, mask).map(({ key, ...rect }) => <Rect key={key} {...rect} />)}
    </G>
  </Svg>;
  return <Svg width={size} height={size} viewBox={ISO_VIEWBOX}>
    <G {...ISO_STROKE} strokeLinejoin="round">
      {isoCells(state, mask).map(({ key, ...polygon }) => <Polygon key={key} {...polygon} />)}
    </G>
  </Svg>;
});
