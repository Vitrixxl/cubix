import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, Easing, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT, useTheme } from "../theme";
import { IconClose } from "./icons";
import { Btn } from "./ui";

/** The scroll view of a dialog body: no scrollbar, taps reach inputs while the keyboard is up. */
export function SheetScrollView(props: ScrollViewProps) {
  return <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...props} />;
}

interface SheetProps {
  open: boolean; onClose: () => void; children: ReactNode;
  /** Header title (`.modal h2`, 17 px), also the accessibility name of the close button. */
  title: string;
  /** Muted mono figure after the title ("Times 12"). */
  sub?: string;
  /** Extra header controls, placed before the close button. */
  actions?: ReactNode;
  /** `false` hides the header row (the body draws its own). */
  header?: boolean;
  /** Fixed height `min(720, window - 72)` (`.sheet`), for lists; otherwise the dialog fits its content. */
  tall?: boolean;
  /** 760 px wide on large screens instead of 540. */
  wide?: boolean;
  /** No body padding (`.sheet`: the body runs edge to edge, with its own rows and lines). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The web app's `.modal` / `.sheet`: a centred raised card (radius 12, 1px line, 16 px padding on
 * phones) over a dimmed backdrop, fading in with a 4 px drop like `menu-in`. Backdrop taps and the
 * back button close it. Use `SheetScrollView` for a body that may overflow.
 */
export function Sheet({ open, onClose, children, title, sub, actions, header = true, tall, wide, flush, style }: SheetProps) {
  const t = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 160, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    } else if (mounted) {
      Keyboard.dismiss();
      Animated.timing(progress, { toValue: 0, duration: 120, useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, mounted, progress]);
  if (!mounted) return null;
  const phone = window.width <= 700;
  const pad = phone ? 16 : 22;
  const available = window.height - insets.top - insets.bottom - 32;
  const width = Math.min(wide ? 760 : 540, window.width - 32 - insets.left - insets.right);
  const maxHeight = Math.max(200, available - 24);
  const size = { width, maxHeight, height: tall ? Math.min(720, available - 48) : undefined };
  return <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop, opacity: progress }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
    </Animated.View>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} pointerEvents="box-none"
      style={[styles.host, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <Animated.View accessibilityViewIsModal style={[styles.card, size, { backgroundColor: t.raised, borderColor: t.line, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] }, t.dialogShadow, style]}>
        {header && <View style={[styles.heading, { paddingHorizontal: pad, paddingTop: pad - 2 }, flush && { paddingBottom: 12 }]}>
          <View style={styles.titleText}>
            <Text numberOfLines={1} style={[styles.title, { color: t.text }]} accessibilityRole="header">{title}</Text>
            {sub ? <Text style={[styles.sub, { color: t.muted }]}>{sub}</Text> : null}
          </View>
          {actions}
          <Btn variant="ghost" iconOnly size={30} icon={<IconClose size={16} color={t.muted} />} accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} />
        </View>}
        <View style={[styles.body, tall && { flex: 1 }, !flush && { paddingHorizontal: pad, paddingBottom: pad, paddingTop: header ? 16 : pad }]}>{children}</View>
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
  host: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 12, borderWidth: 1, overflow: "hidden", flexShrink: 1 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 30 },
  titleText: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 10 },
  title: { fontSize: 17, fontWeight: "600", letterSpacing: -0.25, flexShrink: 1 },
  sub: { fontFamily: FONT.mono, fontSize: 13 },
  body: { flexShrink: 1, minHeight: 0 },
});
