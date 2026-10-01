import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useLayout } from "../hooks/useLayout";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { SLIDE } from "../hooks/useSlide";
import { lastNavigationAtom, type NavigationKind, type Page, type Route } from "../state";
import { settledPageAtom } from "../tour";

/** The tabs in the order of the tab bar (TabBar.tsx): a later tab sits below an earlier one in the vertical carousel. */
export const TAB_ORDER: readonly Page[] = ["playground", "algorithms", "training", "duel", "learn", "profile"];

/** Tab switches: the carousel's own pace, a little longer than a push since the page travels the screen's height. */
export const TAB_SLIDE = { duration: 350, easing: Easing.bezier(0.33, 1, 0.68, 1), useNativeDriver: true } as const;

/**
 * How far a route sits below its tab's first page. The account's sections are tabs of one page and a case opens in a
 * sheet, so every route is a tab's first page; the algorithm list slides its case page itself (AlgorithmsPage).
 */
function routeDepth(_route: Route, _phone: boolean) {
  return 0;
}

/**
 * Within a tab: 1 slides the new page in from the right, -1 from the left, 0 swaps without motion. Any change of depth
 * slides. Across tabs the carousel decides (`tabDirection`), so this is 0 unless a push goes deeper or a pop shallower.
 */
export function slideDirection(from: Route, to: Route, kind: NavigationKind, phone: boolean) {
  const change = Math.sign(routeDepth(to, phone) - routeDepth(from, phone));
  if (!change || from.page === to.page) return change;
  return (kind === "push" && change > 0) || (kind === "pop" && change < 0) ? change : 0;
}

/** Across tabs: 1 brings the new page up from below (a later tab), -1 down from above (an earlier one), 0 within a tab. */
export function tabDirection(from: Route, to: Route) {
  if (from.page === to.page) return 0;
  return Math.sign(TAB_ORDER.indexOf(to.page) - TAB_ORDER.indexOf(from.page));
}

export type Slide = { axis: "x" | "y"; direction: number };
/** The motion between two routes: vertical between tabs, horizontal within one; `reduced` swaps without moving. */
export function slideOf(from: Route, to: Route, kind: NavigationKind, phone: boolean, reduced = false): Slide {
  if (reduced) return { axis: "x", direction: 0 };
  const vertical = tabDirection(from, to);
  return vertical ? { axis: "y", direction: vertical } : { axis: "x", direction: slideDirection(from, to, kind, phone) };
}

type Screen = { id: number; route: Route };
type Stack = { route: Route; screens: Screen[]; slide: Slide; progress: Animated.Value };

/**
 * Renders the current route. Tabs form a vertical carousel: a later tab rises from below while the current one leaves
 * by the top, an earlier one comes down from above. Inside a tab, going deeper pushes the page off to the left while
 * the next one arrives from the right, going back does the opposite. Both pages stay mounted only for the slide.
 */
export function PageStack({ route, render }: { route: Route; render: (route: Route) => ReactNode }) {
  const kind = useAtomValue(lastNavigationAtom);
  const reduced = useReducedMotion();
  const window = useLayout();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const settle = useSetAtom(settledPageAtom);
  const [stack, setStack] = useState<Stack>(() => ({ route, screens: [{ id: 0, route }], slide: { axis: "x", direction: 0 }, progress: new Animated.Value(1) }));
  if (stack.route !== route) {
    // Decided during render so the new route never paints for a frame inside the old page.
    const top = stack.screens.at(-1)!;
    const slide = slideOf(top.route, route, kind, window.phone, reduced);
    setStack(slide.direction
      ? { route, slide, progress: new Animated.Value(0), screens: [top, { id: top.id + 1, route }] }
      : { route, slide, progress: new Animated.Value(1), screens: [{ ...top, route }] });
  }
  useEffect(() => {
    const { progress, slide, route: shown } = stack;
    if (!slide.direction) { settle(shown.page); return; }
    settle(null);
    const animation = Animated.timing(progress, { toValue: 1, ...(slide.axis === "y" ? TAB_SLIDE : SLIDE) });
    animation.start(({ finished }) => {
      if (!finished) return;
      setStack(s => s.progress === progress ? { ...s, slide: { ...s.slide, direction: 0 }, screens: s.screens.slice(-1) } : s);
    });
    return () => animation.stop();
  }, [stack.progress, stack.slide.direction]);
  const top = stack.screens.at(-1)!;
  const offset = stack.slide.direction * (stack.slide.axis === "y" ? size.height : size.width);
  return <View style={styles.stack} onLayout={e => { const { width, height } = e.nativeEvent.layout; setSize(s => s.width === width && s.height === height ? s : { width, height }); }}>
    {stack.screens.map(screen => {
      const entering = screen === top;
      const shift = stack.screens.length > 1
        ? stack.progress.interpolate({ inputRange: [0, 1], outputRange: entering ? [offset, 0] : [0, -offset] })
        : 0;
      return <Animated.View key={screen.id} pointerEvents={entering ? "auto" : "none"}
        accessibilityElementsHidden={!entering} importantForAccessibility={entering ? "auto" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, { transform: stack.slide.axis === "y" ? [{ translateY: shift }] : [{ translateX: shift }] }]}>
        {render(screen.route)}
      </Animated.View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  stack: { flex: 1, minHeight: 0, overflow: "hidden" },
});
