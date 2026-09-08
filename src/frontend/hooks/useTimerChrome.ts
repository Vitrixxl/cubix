import { useAtomValue } from "jotai";
import { useReducedMotion, type HTMLMotionProps } from "motion/react";
import { animationsEnabledAtom, timerRunningAtom, viewportSizeAtom } from "../state";

type Direction = "up" | "down" | "left" | "right";

/** Keep layout space intact so only the chrome moves, never the timer. */
export function useTimerChrome(direction: Direction, runningOverride?: boolean, animateEntry = false) {
  const globalRunning = useAtomValue(timerRunningAtom);
  const running = runningOverride ?? globalRunning;
  const systemReduced = useReducedMotion();
  const enabled = useAtomValue(animationsEnabledAtom);
  const reduced = systemReduced || !enabled;
  const viewport = useAtomValue(viewportSizeAtom);
  const horizontal = direction === "left" || direction === "right";
  // Stay in pixels in both directions. Mixed px/vh keyframes make Motion
  // temporarily move the live DOM to measure its destination before animating.
  const distance = (direction === "up" || direction === "left" ? -1 : 1) * (horizontal ? viewport.width : viewport.height);
  return {
    initial: animateEntry && enabled ? {
      x: !reduced && horizontal ? distance : 0,
      y: !reduced && !horizontal ? distance : 0,
      opacity: reduced ? 0 : 1,
    } : false,
    animate: {
      x: running && !reduced && horizontal ? distance : 0,
      y: running && !reduced && !horizontal ? distance : 0,
      opacity: running && reduced ? 0 : 1,
    },
    transition: {
      duration: !enabled ? 0 : reduced ? 0.1 : running ? 0.38 : 0.46,
      ease: running ? [0.4, 0, 1, 1] : [0.16, 1, 0.3, 1],
    },
    inert: running,
    "aria-hidden": running || undefined,
    "data-timer-chrome": direction,
  } satisfies Pick<HTMLMotionProps<"div">, "initial" | "animate" | "transition" | "inert" | "aria-hidden"> & { "data-timer-chrome": Direction };
}
