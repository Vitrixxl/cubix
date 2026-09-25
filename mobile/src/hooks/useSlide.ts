import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

/** Timing shared by every horizontal page transition: a quick start that settles softly. */
export const SLIDE = { duration: 280, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true } as const;

/**
 * A 0 → 1 progress that follows `open`, starting where it already is on mount so a page opened directly
 * does not slide. `onClosed` runs once the progress is back at 0.
 */
export function useSlide(open: boolean, onClosed?: () => void) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const closed = useRef(onClosed);
  closed.current = onClosed;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const animation = Animated.timing(progress, { toValue: open ? 1 : 0, ...SLIDE });
    animation.start(({ finished }) => { if (finished && !open) closed.current?.(); });
    return () => animation.stop();
  }, [open, progress]);
  return progress;
}
