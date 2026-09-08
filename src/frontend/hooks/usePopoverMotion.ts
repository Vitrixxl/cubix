import { useAtomValue } from "jotai";
import { useReducedMotion } from "motion/react";
import { animationsEnabledAtom } from "../state";
import { useTimerChrome } from "./useTimerChrome";

/** Enter from the trigger edge, whether the floating content opens above or below. */
export function usePopoverMotion(above: boolean, direction: "left" | "right" = "right") {
  const chrome = useTimerChrome(direction);
  const enabled = useAtomValue(animationsEnabledAtom);
  const reduced = useReducedMotion();
  const hidden = { opacity: 0, y: reduced ? 0 : above ? 10 : -10 };
  const transition = { duration: enabled ? 0.18 : 0, ease: [0.16, 1, 0.3, 1] as const };
  return {
    ...chrome,
    initial: enabled ? hidden : false as const,
    transition: chrome.inert ? chrome.transition : transition,
    exit: chrome.inert ? { ...chrome.animate, transition: chrome.transition } : { ...hidden, transition },
  };
}
