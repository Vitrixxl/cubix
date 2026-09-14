import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { IconClose } from "./icons";
import { Btn } from "./ui";

/**
 * The web app's `<dialog>` sheets: a modal bottom sheet on phones (`.practice-dialog`), a centred
 * floating card on larger screens (`.floating-sheet`). Backdrop taps and the back button close it.
 */
export function Sheet({ open, onClose, children, title, header = true, tall, wide }: { open: boolean; onClose: () => void; children: ReactNode; title: string; header?: boolean; tall?: boolean; wide?: boolean }) {
  const t = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Keyboard.dismiss();
      Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, mounted, progress]);
  if (!mounted) return null;
  const phone = window.width <= 700;
  const height = phone ? Math.min(window.height * 0.85, 760) : Math.min(720, window.height - 40);
  const width = phone ? window.width : Math.min(wide ? 760 : 520, window.width - 24);
  const translate = progress.interpolate({ inputRange: [0, 1], outputRange: [phone ? height : 24, 0] });
  return <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#0009", opacity: progress }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
    </Animated.View>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} pointerEvents="box-none" style={[styles.host, phone ? { justifyContent: "flex-end" } : { justifyContent: "center", alignItems: "center" }]}>
      <Animated.View style={[styles.sheet, phone ? { width, height, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 16 + insets.bottom } : { width, height: tall ? height : undefined, maxHeight: height, borderRadius: 22, padding: 20 }, { backgroundColor: t.surface, opacity: progress, transform: [{ translateY: translate }] }, t.shadow]}>
        {header && <View style={styles.heading}><Text style={[styles.title, { color: t.text }]}>{title}</Text><Btn variant="ghost" iconOnly small icon={<IconClose size={16} color={t.readableMuted} />} accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={{ width: 32, minHeight: 32 }} /></View>}
        <View style={{ flex: phone || tall ? 1 : undefined, flexShrink: 1, minHeight: 0 }}>{children}</View>
      </Animated.View>
    </KeyboardAvoidingView>
    <BackClose onClose={onClose} />
  </Modal>;
}

function BackClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);
  return null;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  sheet: { padding: 16, overflow: "hidden", flexShrink: 1 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40, paddingBottom: 4 },
  title: { fontSize: 16, fontWeight: "700" },
});
