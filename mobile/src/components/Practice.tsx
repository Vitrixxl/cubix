import { useEffect, useRef, type ReactNode } from "react";
import { Animated, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { TimerApi } from "../hooks/useTimer";
import { responder } from "./TimerSurface";

/** `[data-timer-chrome]`: fades out while the timer runs. */
export function TimerChrome({ hidden, children, style, pointerEvents = "box-none" }: { hidden: boolean; children: ReactNode; style?: StyleProp<ViewStyle>; pointerEvents?: "box-none" | "auto" }) {
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => { Animated.timing(opacity, { toValue: hidden ? 0 : 1, duration: 250, useNativeDriver: true }).start(); }, [hidden, opacity]);
  return <Animated.View pointerEvents={hidden ? "none" : pointerEvents} style={[style, { opacity }]}>{children}</Animated.View>;
}

/**
 * Extends touch arming to the page background: a touch that starts on anything but a control
 * (buttons and lists claim their own touches first) holds the timer, like the web's document listener.
 */
export function TouchArea({ timer, enabled, children, style }: { timer: TimerApi; enabled: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.area, style]} {...responder(timer, !enabled)}>{children}</View>;
}

/** Portrait keeps the timer between equal flexible rows; landscape groups the right column. */
export function PracticeReadout({ landscape, children }: { landscape: boolean; children: ReactNode }) {
  return landscape ? <View style={{ width: "48%", alignSelf: "stretch", justifyContent: "center" }}>{children}</View> : <>{children}</>;
}

/** Long scrambles and revealed solutions scroll inside their allotted space, above the timer. */
export function PracticeContent({ children, revealEnd = false }: { children: ReactNode; revealEnd?: boolean }) {
  const viewport = useRef<ScrollView>(null);
  useEffect(() => {
    if (!revealEnd) return;
    const frame = requestAnimationFrame(() => viewport.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [revealEnd]);
  return <ScrollView ref={viewport} style={{ flex: 1, width: "100%" }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} nestedScrollEnabled keyboardShouldPersistTaps="handled"
    onContentSizeChange={() => { if (revealEnd) viewport.current?.scrollToEnd({ animated: true }); }}>
    <View style={{ width: "100%", alignItems: "center" }} onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => true}>{children}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({ area: { flex: 1, minHeight: 0 } });
