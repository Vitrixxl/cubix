import { useAtomValue } from "jotai";
import { startTransition, useEffect, useState } from "react";
import { settledPageAtom } from "../tour";

/**
 * False on the first render, true once that frame is on screen and the page has stopped sliding: what is costly to
 * draw (a graph, hundreds of squares) shows its placeholder with the page, then comes in an interruptible render that
 * never holds a tap, a frame or a transition back.
 */
export function useAfterPaint() {
  const [ready, setReady] = useState(false);
  const settled = useAtomValue(settledPageAtom) != null;
  useEffect(() => {
    if (ready || !settled) return;
    const frame = requestAnimationFrame(() => startTransition(() => setReady(true)));
    return () => cancelAnimationFrame(frame);
  }, [ready, settled]);
  return ready;
}
