import { useCallback, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useTheme } from "../theme";
import { LauncherCube } from "./LauncherCube";

/**
 * The startup screen, same as the desktop launcher window: the cube, the name, one status line and a
 * thin bar while a download runs. It covers the application until `finish` lets the cube stand, then
 * fades out over the mounted app and calls `onHidden`.
 */
export function Launcher({ message, progress, finish, onHidden }: { message: string; progress?: number; finish: boolean; onHidden: () => void }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);
  const hidden = useRef(onHidden);
  hidden.current = onHidden;
  const settled = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setGone(true);
      hidden.current();
    });
  }, [opacity]);
  if (gone) return null;
  const size = Math.round(Math.min(width * 0.46, height * 0.28, 200));
  return <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: t.bg, opacity }]} accessibilityViewIsModal>
    <LauncherCube size={size} finish={finish} onSettled={settled} />
    <View style={styles.title}>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700", lineHeight: 30, letterSpacing: -0.5 }}>Cubix</Text>
      <Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={{ color: t.readableMuted, fontSize: 13, lineHeight: 20, textAlign: "center", minHeight: 20 }}>{message}</Text>
    </View>
    <View style={[styles.bar, { backgroundColor: t.surface3, opacity: progress === undefined ? 0 : 1 }]}>
      <View style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%`, height: "100%", backgroundColor: t.accent, borderRadius: 3 }} />
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { zIndex: 100, elevation: 100, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 },
  title: { alignItems: "center", gap: 6, width: "100%" },
  bar: { width: 220, height: 3, borderRadius: 3, overflow: "hidden" },
});
