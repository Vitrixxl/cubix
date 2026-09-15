import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { IconClose } from "./icons";
import { Btn } from "./ui";

/** Lets a scrolling child tell the drawer whether a downward drag may dismiss it (only when scrolled to the top). */
const SheetScrollContext = createContext<{ atTop: React.MutableRefObject<boolean> } | null>(null);

/** A ScrollView whose position the drawer follows: dragging down from the top closes the sheet instead of overscrolling. */
export function SheetScrollView({ onScroll, ...props }: ScrollViewProps) {
  const sheet = useContext(SheetScrollContext);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (sheet) sheet.atTop.current = event.nativeEvent.contentOffset.y <= 0;
    onScroll?.(event);
  }, [sheet, onScroll]);
  return <ScrollView {...props} onScroll={handleScroll} scrollEventThrottle={16} />;
}

/**
 * The web app's `<dialog>` sheets: a modal bottom drawer on phones (`.practice-dialog`), a centred
 * floating card on larger screens (`.floating-sheet`). Backdrop taps and the back button close it.
 * On phones the drawer sizes to its content up to a maximum height (`tall` sheets always fill it)
 * and can be dragged down to dismiss, from the handle, the header, or a `SheetScrollView` at its top.
 */
export function Sheet({ open, onClose, children, title, header = true, tall, wide }: { open: boolean; onClose: () => void; children: ReactNode; title: string; header?: boolean; tall?: boolean; wide?: boolean }) {
  const t = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const phone = window.width <= 700;
  const maxHeight = phone ? Math.min(window.height * 0.85, 760) : Math.min(720, window.height - 40);
  const width = phone ? window.width : Math.min(wide ? 760 : 520, window.width - 24);
  // The slide distance follows the measured drawer height, since it is not known before layout.
  const [sheetHeight, setSheetHeight] = useState(maxHeight);
  const heightRef = useRef(sheetHeight); heightRef.current = sheetHeight;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const atTop = useRef(true);
  const scrollContext = useMemo(() => ({ atTop }), []);
  useEffect(() => {
    if (open) {
      setMounted(true);
      dragY.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Keyboard.dismiss();
      Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, mounted, progress, dragY]);

  const settle = useCallback((dy: number, vy: number) => {
    const height = heightRef.current;
    if (dy > height * 0.3 || vy > 0.8) {
      Animated.timing(dragY, { toValue: height, duration: 160, useNativeDriver: true }).start(() => closeRef.current());
    } else {
      Animated.spring(dragY, { toValue: 0, bounciness: 2, useNativeDriver: true }).start();
    }
  }, [dragY]);
  const isDownwardDrag = (_: unknown, { dx, dy }: { dx: number; dy: number }) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5;
  const move = useMemo(() => Animated.event([null, { dy: dragY }], { useNativeDriver: false }), [dragY]);
  // The handle and header always drag; the body only when its registered scroll view sits at the top.
  const handleResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: isDownwardDrag,
    onPanResponderMove: (event, gesture) => { if (gesture.dy >= 0) move(event, gesture); else dragY.setValue(gesture.dy / 8); },
    onPanResponderRelease: (_, { dy, vy }) => settle(dy, vy),
    onPanResponderTerminate: () => settle(0, 0),
  }), [dragY, move, settle]);
  const bodyResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (event, gesture) => atTop.current && isDownwardDrag(event, gesture),
    onPanResponderMove: (event, gesture) => { if (gesture.dy >= 0) move(event, gesture); },
    onPanResponderRelease: (_, { dy, vy }) => settle(dy, vy),
    onPanResponderTerminate: () => settle(0, 0),
    onPanResponderTerminationRequest: () => false,
  }), [move, settle]);

  if (!mounted) return null;
  const slide = progress.interpolate({ inputRange: [0, 1], outputRange: [phone ? sheetHeight : 24, 0] });
  const translate = phone ? Animated.add(slide, dragY) : slide;
  const backdrop = phone ? Animated.multiply(progress, dragY.interpolate({ inputRange: [0, Math.max(1, sheetHeight)], outputRange: [1, 0.2], extrapolate: "clamp" })) : progress;
  const phoneStyle = { width, maxHeight, height: tall ? maxHeight : undefined, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 6, paddingBottom: 16 + insets.bottom };
  const desktopStyle = { width, height: tall ? maxHeight : undefined, maxHeight, borderRadius: 22, padding: 20 };
  return <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#0009", opacity: backdrop }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
    </Animated.View>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} pointerEvents="box-none" style={[styles.host, phone ? { justifyContent: "flex-end" } : { justifyContent: "center", alignItems: "center" }]}>
      <Animated.View onLayout={phone ? event => setSheetHeight(Math.round(event.nativeEvent.layout.height)) : undefined}
        style={[styles.sheet, phone ? phoneStyle : desktopStyle, { backgroundColor: t.surface, transform: [{ translateY: translate }] }, !phone && { opacity: progress }, t.shadow]}
        {...(phone ? bodyResponder.panHandlers : {})}>
        {phone && <View {...handleResponder.panHandlers} style={styles.grab} accessibilityLabel={`Drag down to close ${title.toLowerCase()}`}><View style={[styles.handle, { backgroundColor: t.line }]} /></View>}
        {header && <View style={styles.heading} {...(phone ? handleResponder.panHandlers : {})}><Text style={[styles.title, { color: t.text }]}>{title}</Text><Btn variant="ghost" iconOnly small icon={<IconClose size={16} color={t.readableMuted} />} accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={{ width: 32, minHeight: 32 }} /></View>}
        <SheetScrollContext.Provider value={scrollContext}>
          <View style={{ flex: tall ? 1 : undefined, flexShrink: 1, minHeight: 0 }}>{children}</View>
        </SheetScrollContext.Provider>
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
  grab: { alignItems: "center", paddingVertical: 6, marginTop: -6 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40, paddingBottom: 4 },
  title: { fontSize: 16, fontWeight: "700" },
});
