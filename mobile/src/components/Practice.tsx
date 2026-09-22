import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useCentre, useExit, type ExitDirection } from "../hooks/useExit";
import type { TimerApi } from "../hooks/useTimer";
import { responder } from "./TimerSurface";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";

/** `[data-timer-chrome]`: slides off screen toward `exit` while the timer runs, like the desktop page. */
export function TimerChrome({ hidden, exit = "up", children, style, pointerEvents = "box-none" }: { hidden: boolean; exit?: ExitDirection; children: ReactNode; style?: StyleProp<ViewStyle>; pointerEvents?: "box-none" | "auto" }) {
  const { ref, transform } = useExit(hidden, exit);
  return <Animated.View ref={ref} pointerEvents={hidden ? "none" : pointerEvents} style={[style, { transform }]}>{children}</Animated.View>;
}

/** Mobile controls keep their own space above navigation, including while the timer runs. */
export function PracticeDock({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const t = useTheme();
  const { pagePadding } = useLayout();
  return <TimerChrome hidden={hidden} exit="down" style={{ flexShrink: 0, paddingHorizontal: pagePadding, paddingBottom: 8 }}>
    <View onStartShouldSetResponder={() => true} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, paddingTop: 6, gap: 4 }}>
      {children}
    </View>
  </TimerChrome>;
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

/** A brief line of praise at the top of the practice area, shown at each new `at`; fades out on its own. */
export function Notice({ at, hidden, top, icon, message }: { at: number; hidden: boolean; top: number; icon: ReactNode; message: string }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!at) return;
    setShown(true);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const hide = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShown(false)), 4000);
    return () => clearTimeout(hide);
  }, [at, opacity]);
  if (!shown || hidden) return null;
  return <Animated.View pointerEvents="none" style={[styles.notice, { top, opacity }]}>
    <View style={[styles.noticeBody, { backgroundColor: t.surface2 }]}>
      {icon}
      <Text style={{ color: t.good, fontSize: 13, fontWeight: "600" }}>{message}</Text>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 0 },
  notice: { position: "absolute", left: 0, right: 0, zIndex: 3, alignItems: "center" },
  noticeBody: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
});
