import Svg, { Rect } from "react-native-svg";
import { useColors } from "../theme";

/** The Cubix mark: four rounded squares, the top right one in the accent (desktop/renderer/ui.tsx `Logo`). */
export function Logo({ size = 18 }: { size?: number }) {
  const colors = useColors();
  return <Svg width={size} height={size} viewBox="0 0 18 18" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {[0, 1].flatMap(row => [0, 1].map(col => <Rect key={row * 2 + col} x={col * 9.75} y={row * 9.75} width={8.25} height={8.25} rx={2.2}
      fill={row === 0 && col === 1 ? colors.primary : colors.foreground} fillOpacity={row === 0 && col === 1 ? 1 : 0.85} />))}
  </Svg>;
}
