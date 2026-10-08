import { useCallback, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ui/text";
import { useColors } from "../theme";
import { LauncherCube } from "./LauncherCube";
import { tr } from "../../../src/client/i18n";

/**
 * The startup screen, same as the desktop launcher window: the cube, the name, one status line and a
 * thin bar while a download runs. It covers the application until `finish` lets the cube stand, then
 * fades out over the mounted app and calls `onHidden`.
 */
export function Launcher({ message, progress, finish, onHidden }: { message: string; progress?: number; finish: boolean; onHidden: () => void }) {
  const colors = useColors();
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
  return <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: colors.background, opacity }]} accessibilityViewIsModal>
    <LauncherCube size={size} finish={finish} onSettled={settled} />
    <View style={styles.title}>
      <Text accessibilityLabel={tr("Qbix")} className="text-2xl tracking-tight"><Text className="text-2xl font-extrabold">Q</Text><Text className="text-2xl font-medium">bix</Text></Text>
      <Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" className="min-h-5 text-center text-sm text-muted-foreground">{message}</Text>
    </View>
    <View style={[styles.bar, { backgroundColor: colors.muted, opacity: progress === undefined ? 0 : 1 }]}>
      <View style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 2 }} />
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { zIndex: 100, elevation: 100, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 },
  title: { alignItems: "center", gap: 6, width: "100%" },
  bar: { width: 220, height: 3, borderRadius: 0, overflow: "hidden" },
});
