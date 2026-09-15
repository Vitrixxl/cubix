import { useEffect, useRef, type ReactNode } from "react";
import { Animated, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useCentre, useExit, type ExitDirection } from "../hooks/useExit";
import type { TimerApi } from "../hooks/useTimer";
import { responder } from "./TimerSurface";

/** `[data-timer-chrome]`: slides off screen toward `exit` while the timer runs, like the desktop page. */
export function TimerChrome({ hidden, exit = "up", children, style, pointerEvents = "box-none" }: { hidden: boolean; exit?: ExitDirection; children: ReactNode; style?: StyleProp<ViewStyle>; pointerEvents?: "box-none" | "auto" }) {
  const { ref, transform } = useExit(hidden, exit);
  return <Animated.View ref={ref} pointerEvents={hidden ? "none" : pointerEvents} style={[style, { transform }]}>{children}</Animated.View>;
}

/** Holds the timer: while it runs, the slot glides to the centre of the screen and returns afterwards. */
export function TimerSlot({ running, children, style }: { running: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { ref, transform } = useCentre(running);
  return <Animated.View ref={ref} style={[style, { transform }]}>{children}</Animated.View>;
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
  // Basis "auto" sizes the viewport to its content when the block is not flexible (grouped phone layout).
  return <ScrollView ref={viewport} style={{ flexGrow: 1, flexShrink: 1, flexBasis: "auto", minHeight: 0, width: "100%" }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }} nestedScrollEnabled keyboardShouldPersistTaps="handled"
    onContentSizeChange={() => { if (revealEnd) viewport.current?.scrollToEnd({ animated: true }); }}>
    <View style={{ width: "100%", alignItems: "center" }} onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => true}>{children}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({ area: { flex: 1, minHeight: 0 } });
