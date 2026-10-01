import { useEffect, useState } from "react";
// A namespace import: light test mocks of react-native may leave AccessibilityInfo out.
import * as ReactNative from "react-native";

/** Whether the system asks for reduced motion; transitions then swap without moving. Starts false until the system answers. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const info = ReactNative.AccessibilityInfo;
    let live = true;
    info?.isReduceMotionEnabled?.().then(value => { if (live) setReduced(value); }, () => {});
    const listener = info?.addEventListener?.("reduceMotionChanged", setReduced);
    return () => { live = false; listener?.remove(); };
  }, []);
  return reduced;
}
