import { useAtomValue } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useLayout } from "../hooks/useLayout";
import { SLIDE } from "../hooks/useSlide";
import { lastNavigationAtom, navPage, type NavigationKind, type Route } from "../state";

/** How far a route sits below its tab's first page. Guides stack over whatever opened them. */
function routeDepth(route: Route, phone: boolean) {
  if (route.page === "guides") return 3;
  if (route.page !== "profile" || !route.mode) return 0;
  // On a tablet a profile case opens in a sheet over the gallery, not as a page of its own.
  return (route.mode === "achievements" && route.group) || (phone && route.caseId) ? 2 : 1;
}

/**
 * 1 slides the new page in from the right, -1 from the left, 0 swaps without motion. Within a tab any change
 * of depth slides; across tabs only a push to a deeper page or a back step to a shallower one does, so the
 * navigation bar switches tabs instantly.
 */
export function slideDirection(from: Route, to: Route, kind: NavigationKind, phone: boolean) {
  const change = Math.sign(routeDepth(to, phone) - routeDepth(from, phone));
  if (!change || navPage(from) === navPage(to)) return change;
  return (kind === "push" && change > 0) || (kind === "pop" && change < 0) ? change : 0;
}

type Screen = { id: number; route: Route };
type Stack = { route: Route; screens: Screen[]; direction: number; progress: Animated.Value };

/**
 * Renders the current route. Going deeper pushes the page off to the left while the next one arrives from the
 * right; going back does the opposite. Both pages stay mounted only for the length of the slide.
 */
export function PageStack({ route, render }: { route: Route; render: (route: Route) => ReactNode }) {
  const kind = useAtomValue(lastNavigationAtom);
  const { phone, width } = useLayout();
  const [stack, setStack] = useState<Stack>(() => ({ route, screens: [{ id: 0, route }], direction: 0, progress: new Animated.Value(1) }));
  if (stack.route !== route) {
    // Decided during render so the new route never paints for a frame inside the old page.
    const top = stack.screens.at(-1)!;
    const direction = slideDirection(top.route, route, kind, phone);
    setStack(direction
      ? { route, direction, progress: new Animated.Value(0), screens: [top, { id: top.id + 1, route }] }
      : { route, direction: 0, progress: new Animated.Value(1), screens: [{ ...top, route }] });
  }
  useEffect(() => {
    if (!stack.direction) return;
    const { progress } = stack;
    const animation = Animated.timing(progress, { toValue: 1, ...SLIDE });
    animation.start(({ finished }) => {
      if (finished) setStack(s => s.progress === progress ? { ...s, direction: 0, screens: s.screens.slice(-1) } : s);
    });
    return () => animation.stop();
  }, [stack.progress, stack.direction]);
  const top = stack.screens.at(-1)!, offset = stack.direction * width;
  return <View style={styles.stack}>
    {stack.screens.map(screen => {
      const entering = screen === top;
      const translateX = stack.screens.length > 1
        ? stack.progress.interpolate({ inputRange: [0, 1], outputRange: entering ? [offset, 0] : [0, -offset] })
        : 0;
      return <Animated.View key={screen.id} pointerEvents={entering ? "auto" : "none"}
        accessibilityElementsHidden={!entering} importantForAccessibility={entering ? "auto" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
        {render(screen.route)}
      </Animated.View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  stack: { flex: 1, minHeight: 0, overflow: "hidden" },
});
