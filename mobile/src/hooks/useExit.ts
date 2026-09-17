import { useEffect, useRef } from "react";
import { Animated, Easing, useWindowDimensions, type View } from "react-native";

export type ExitDirection = "up" | "down" | "left" | "right";

/** Same timings as the desktop practice page: elements clear the screen fast when the timer starts (180 ms) and come back at ease (350 ms). */
const HIDE_MS = 180, SHOW_MS = 350;
const slide = (value: Animated.Value, toValue: number, duration: number) =>
  Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();

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
    if (!hidden) { slide(offset, 0, SHOW_MS); return; }
    const vertical = exit === "up" || exit === "down";
    const sign = exit === "up" || exit === "left" ? -1 : 1;
    const fallback = vertical ? size.current.height : size.current.width;
    const node = ref.current;
    if (!node) { slide(offset, sign * fallback, HIDE_MS); return; }
    node.measureInWindow((x, y, width, height) => {
      const distance = exit === "up" ? y + height : exit === "down" ? size.current.height - y : exit === "left" ? x + width : size.current.width - x;
      slide(offset, sign * (distance > 0 ? distance + 12 : fallback), HIDE_MS);
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
    if (!active) { slide(offset, 0, SHOW_MS); return; }
    ref.current?.measureInWindow((_x, y, _width, height) => slide(offset, size.current.height / 2 - (y + height / 2), HIDE_MS));
  }, [active, offset]);
  return { ref, transform: [{ translateY: offset }] };
}
