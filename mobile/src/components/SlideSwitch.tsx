import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useLayout } from "../hooks/useLayout";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { SLIDE } from "../hooks/useSlide";
import { useColors } from "../theme";

type Screen = { id: string; depth: number; node: ReactNode };

/**
 * Steps of one page kept in state rather than in routes (training: its ways to practise, a setup, the session): a
 * deeper step slides in from the right over the current one, a shallower one comes back from the left. `id` names the
 * step shown; both stay mounted only for the slide, and each keeps its state while it is shown.
 */
export function SlideSwitch({ id, depth, children }: { id: string; depth: number; children: ReactNode }) {
  const { width } = useLayout();
  const reduced = useReducedMotion();
  const colors = useColors();
  const shown = useRef<Screen>({ id, depth, node: children });
  const [move, setMove] = useState<{ from: Screen; direction: 1 | -1; progress: Animated.Value } | null>(null);
  if (shown.current.id !== id) {
    const from = shown.current;
    shown.current = { id, depth, node: children };
    // Decided during render so the new step never paints for a frame without its motion.
    setMove(reduced ? null : { from, direction: depth < from.depth ? -1 : 1, progress: new Animated.Value(0) });
  } else shown.current = { id, depth, node: children };
  useEffect(() => {
    if (!move) return;
    const animation = Animated.timing(move.progress, { toValue: 1, ...SLIDE });
    // Started a frame later, once the new step is built (PageStack).
    const frame = requestAnimationFrame(() => animation.start(({ finished }) => { if (finished) setMove(current => current === move ? null : current); }));
    return () => { cancelAnimationFrame(frame); animation.stop(); };
  }, [move]);
  const screens = move && move.from.id !== id ? [move.from, shown.current] : [shown.current];
  return <View style={styles.frame}>
    {screens.map(screen => {
      const entering = screen.id === id;
      let transform: { translateX: Animated.AnimatedInterpolation<number> }[] = [];
      if (move && screens.length > 1) {
        const forward = move.direction === 1;
        const range = forward ? (entering ? [width, 0] : [0, -width / 3]) : (entering ? [-width / 3, 0] : [0, width]);
        transform = [{ translateX: move.progress.interpolate({ inputRange: [0, 1], outputRange: range }) }];
      }
      const deep = screens.length > 1 && entering === (move?.direction === 1);
      return <Animated.View key={screen.id} pointerEvents={entering ? "auto" : "none"}
        accessibilityElementsHidden={!entering} importantForAccessibility={entering ? "auto" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: deep ? 1 : 0, transform }]}>
        {screen.node}
      </Animated.View>;
    })}
  </View>;
}

const styles = StyleSheet.create({ frame: { flex: 1, minHeight: 0, overflow: "hidden" } });
