/**
 * The guided tour's view registry. A page tags the view a tour step points at with `useTourTarget(key)` (the keys are
 * the `inner` ones of `TOUR_STEPS`, plus `tab:<page>` for the tab bar's buttons); the tour measures the tagged view in
 * the window once its page has finished sliding in (`settledPageAtom`). Nothing here imports react-native, so pages
 * keep their light test mocks.
 */
import { atom, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { Page } from "./state";

export interface Rect { x: number; y: number; width: number; height: number }
interface Measurable { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void }

const targets = new Map<string, { current: Measurable | null }>();
/** Bumped whenever a tagged view mounts or goes away, so an open tour measures again. */
export const tourTargetsVersionAtom = atom(0);
/** The page shown once the page stack has stopped sliding; `null` while two pages are on screen. */
export const settledPageAtom = atom<Page | null>(null);

/** Props for the view a tour step highlights: spread them on a host `View` (or a component passing them to one). */
export function useTourTarget(key: string) {
  const ref = useRef<any>(null);
  const bump = useSetAtom(tourTargetsVersionAtom);
  useEffect(() => {
    targets.set(key, ref);
    bump(v => v + 1);
    return () => {
      if (targets.get(key) !== ref) return;
      targets.delete(key);
      bump(v => v + 1);
    };
  }, [key, bump]);
  return { ref, collapsable: false } as const;
}

/** The tagged view's rectangle in the window, or `null` when nothing is tagged under `key` or it has no size. */
export function measureTourTarget(key: string): Promise<Rect | null> {
  const view = targets.get(key)?.current;
  if (!view?.measureInWindow) return Promise.resolve(null);
  return new Promise(resolve => {
    let done = false;
    const finish = (rect: Rect | null) => { if (!done) { done = true; resolve(rect); } };
    // A view detached between the call and the answer never calls back.
    const timeout = setTimeout(() => finish(null), 500);
    view.measureInWindow!((x, y, width, height) => {
      clearTimeout(timeout);
      finish(width > 0 && height > 0 && [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null);
    });
  });
}

/** Test helper: forget every tagged view. */
export function resetTourTargets() { targets.clear(); }
