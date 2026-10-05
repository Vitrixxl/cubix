import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useLayout } from "../hooks/useLayout";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { SLIDE } from "../hooks/useSlide";
import { lastNavigationAtom, routeDepth, tabOf, type NavigationKind, type Route } from "../state";
import { settledPageAtom } from "../tour";
import { useColors } from "../theme";

/** Learn's two parts: a short cross-fade, the new page rising a few points as it appears. */
export const FADE = { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true } as const;
const RISE = 10;

/**
 * The motion between two routes. Another tab opens immediately; another part of the same tab fades through. Going one page deeper
 * slides the new page in from the right (`direction` 1), coming back from the left (-1). `reduced` swaps at once.
 */
export type Slide = { kind: "none" } | { kind: "fade" } | { kind: "slide"; direction: 1 | -1 };
export function slideOf(from: Route, to: Route, kind: NavigationKind, reduced = false): Slide {
  if (reduced || JSON.stringify(from) === JSON.stringify(to)) return { kind: "none" };
  if (tabOf(from.page) !== tabOf(to.page)) return { kind: "none" };
  const change = Math.sign(routeDepth(to) - routeDepth(from));
  // A case of the library slides itself over the list (AlgorithmsPage).
  if (from.page === to.page && from.page === "algorithms") return { kind: "none" };
  if (!change) return from.page === to.page ? { kind: "none" } : { kind: "fade" };
  // A replace that goes deeper (opening a section in place) still reads as a step forward.
  return { kind: "slide", direction: kind === "pop" ? -1 : change as 1 | -1 };
}

type Screen = { id: number; route: Route };
type Stack = { route: Route; screens: Screen[]; slide: Slide; progress: Animated.Value };

/**
 * Renders the current route. Tabs swap in the same commit, without waiting for an animation or rendering two pages.
 * Inside a tab, both pages stay mounted only while they move.
 */
export function PageStack({ route, render }: { route: Route; render: (route: Route) => ReactNode }) {
  const kind = useAtomValue(lastNavigationAtom);
  const reduced = useReducedMotion();
  const window = useLayout();
  const [width, setWidth] = useState(window.width);
  const settle = useSetAtom(settledPageAtom);
  const colors = useColors();
  const [stack, setStack] = useState<Stack>(() => ({ route, screens: [{ id: 0, route }], slide: { kind: "none" }, progress: new Animated.Value(1) }));
  if (stack.route !== route) {
    // Decided during render so the new route never paints for a frame inside the old page.
    const top = stack.screens.at(-1)!;
    const slide = slideOf(top.route, route, kind, reduced);
    setStack(slide.kind !== "none"
      ? { route, slide, progress: new Animated.Value(0), screens: [top, { id: top.id + 1, route }] }
      : { route, slide, progress: new Animated.Value(1), screens: [{ ...top, route }] });
  }
  useEffect(() => {
    const { progress, slide, route: shown } = stack;
    if (slide.kind === "none") { settle(shown.page); return; }
    settle(null);
    const animation = Animated.timing(progress, { toValue: 1, ...(slide.kind === "fade" ? FADE : SLIDE) });
    // Started a frame later, once the new page is built: its first frames are not spent mounting it, and no step of
    // the motion is skipped.
    const frame = requestAnimationFrame(() => animation.start(({ finished }) => {
      if (!finished) return;
      setStack(s => s.progress === progress ? { ...s, slide: { kind: "none" }, screens: s.screens.slice(-1) } : s);
    }));
    return () => { cancelAnimationFrame(frame); animation.stop(); };
  }, [stack.progress, stack.slide.kind, stack.route, settle]);
  const top = stack.screens.at(-1)!;
  const moving = stack.screens.length > 1;
  return <View style={styles.stack} onLayout={e => { const next = e.nativeEvent.layout.width; setWidth(w => w === next ? w : next); }}>
    {stack.screens.map(screen => {
      const entering = screen === top, { slide, progress } = stack;
      let style: object = {};
      if (moving && slide.kind === "fade") style = entering
        ? { opacity: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [RISE, RISE, 0] }) }] }
        : { opacity: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0, 0] }) };
      else if (moving && slide.kind === "slide") {
        // The deeper page moves over the whole width, on top; the one underneath a third of the way, as Android's own
        // navigation does.
        const deep = entering === (slide.direction === 1);
        const range = slide.direction === 1 ? (entering ? [width, 0] : [0, -width / 3]) : (entering ? [-width / 3, 0] : [0, width]);
        style = { zIndex: deep ? 1 : 0, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: range }) }] };
      }
      return <Animated.View key={screen.id} pointerEvents={entering ? "auto" : "none"}
        accessibilityElementsHidden={!entering} importantForAccessibility={entering ? "auto" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, style]}>
        {render(screen.route)}
      </Animated.View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  stack: { flex: 1, minHeight: 0, overflow: "hidden" },
});
