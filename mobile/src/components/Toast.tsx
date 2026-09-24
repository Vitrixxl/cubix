import { atom, useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export interface ToastMessage { title: string; description?: string; duration?: number }
/** Setting it shows a notification; null hides it. */
export const toastAtom = atom<ToastMessage | null>(null);

/** Top notification, like the desktop's Sonner stack: flat surface, hairline border, tap to dismiss. */
export function Toast() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useAtom(toastAtom);
  const [shown, setShown] = useState<ToastMessage | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    setShown(message);
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => setMessage(null), message.duration ?? 7000);
    return () => clearTimeout(timer);
  }, [message, progress, setMessage]);
  useEffect(() => {
    if (message || !shown) return;
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) setShown(null); });
  }, [message, shown, progress]);
  if (!shown) return null;
  return <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 10, left: insets.left + 14, right: insets.right + 14 }]}>
    <Animated.View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: t.surface, borderColor: t.line, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }, t.shadow]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer la notification" onPress={() => setMessage(null)} style={styles.body}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>{shown.title}</Text>
        {shown.description ? <Text style={{ color: t.text2, fontSize: 13, lineHeight: 18 }}>{shown.description}</Text> : null}
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: "absolute", zIndex: 60, flexDirection: "row", justifyContent: "center" },
  toast: { flexShrink: 1, maxWidth: 420, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  body: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
});
