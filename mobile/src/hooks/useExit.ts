import { useEffect, useRef } from "react";
import { Animated, Easing, useWindowDimensions, type View } from "react-native";

export type ExitDirection = "up" | "down" | "left" | "right";

/** Same curve as the desktop practice page: 350 ms, ease in-out. */
const slide = (value: Animated.Value, toValue: number) =>
  Animated.timing(value, { toValue, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();

/**
 * Slides an element off screen toward its own edge while `hidden`, and back when shown.
 * The distance is measured from the element's resting position so it fully leaves the window.
 */
export function useExit(hidden: boolean, exit: ExitDirection) {
  const ref = useRef<View>(null);
  const window = useWindowDimensions();
  const size = useRef(window); size.current = window;
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!hidden) { slide(offset, 0); return; }
    const vertical = exit === "up" || exit === "down";
    const sign = exit === "up" || exit === "left" ? -1 : 1;
    const fallback = vertical ? size.current.height : size.current.width;
    const node = ref.current;
    if (!node) { slide(offset, sign * fallback); return; }
    node.measureInWindow((x, y, width, height) => {
      const distance = exit === "up" ? y + height : exit === "down" ? size.current.height - y : exit === "left" ? x + width : size.current.width - x;
      slide(offset, sign * (distance > 0 ? distance + 12 : fallback));
    });
  }, [hidden, exit, offset]);
  const transform = exit === "up" || exit === "down" ? [{ translateY: offset }] : [{ translateX: offset }];
  return { ref, transform };
}

/** Moves an element to the vertical centre of the window while `active`, and back to its place after. */
export function useCentre(active: boolean) {
  const ref = useRef<View>(null);
  const window = useWindowDimensions();
  const size = useRef(window); size.current = window;
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { slide(offset, 0); return; }
    ref.current?.measureInWindow((_x, y, _width, height) => slide(offset, size.current.height / 2 - (y + height / 2)));
  }, [active, offset]);
  return { ref, transform: [{ translateY: offset }] };
}
