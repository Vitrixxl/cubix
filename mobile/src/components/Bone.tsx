import { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

/** One placeholder block; `text` sizes it like a line of text of that font size. */
export function Bone({ width, height, radius = 8, text, style, strong }: { width?: number | `${number}%`; height?: number; radius?: number; text?: number; style?: StyleProp<ViewStyle>; strong?: boolean }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const size = text !== undefined ? { height: Math.round(text * 0.72), marginVertical: Math.round(text * 0.36), borderRadius: Math.round(text * 0.3) } : { height, borderRadius: radius };
  return <Animated.View style={[{ width: width ?? "100%", backgroundColor: strong ? t.surface3 : t.surface2, opacity: pulse }, size, style]} />;
}
