import { useCallback, useEffect, useRef, useState } from "react";

export type TimerPhase = "idle" | "holding" | "ready" | "running" | "stopped";

export interface TimerApi {
  phase: TimerPhase;
  /** Elapsed ms at rest. The readout calculates live time from startedAt. */
  elapsed: number;
  startedAt: number;
  /** call on pointer down on the timer surface */
  press: () => void;
  /** call on pointer up */
  release: () => void;
  reset: () => void;
}

interface Options {
  /** invoked when a solve is stopped */
  onStop: (ms: number) => void;
  /** disable keyboard handling (e.g. while a text input is focused) */
  enabled?: boolean;
  /** Temporarily prevent new attempts while keeping stop-key handling active. */
  canStart?: boolean;
}

/** How long Space (or the surface) must be held before a release starts the timer. */
export const HOLD_DELAY_MS = 300;

/**
 * Stackmat-style timer: hold Space (or the timer surface) for HOLD_DELAY_MS → ready,
 * release → start, press any key (or tap) → stop. Releasing before the delay cancels.
 */
export function useTimer({ onStop, enabled = true, canStart = true }: Options): TimerApi {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const startAt = useRef(0);
  const hold = useRef<number | null>(null);
  const stoppingKey = useRef(false);
  const phaseRef = useRef<TimerPhase>("idle");
  const setPhaseBoth = (p: TimerPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const clearHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current);
    hold.current = null;
  };

  const stop = useCallback(() => {
    const ms = performance.now() - startAt.current;
    setElapsed(ms);
    setPhaseBoth("stopped");
    onStop(Math.round(ms));
  }, [onStop]);

  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === "running") stop();
    else if (canStart && (p === "idle" || p === "stopped")) {
      setElapsed(0);
      setPhaseBoth("holding");
      clearHold();
      hold.current = window.setTimeout(() => {
        hold.current = null;
        if (phaseRef.current === "holding") setPhaseBoth("ready");
      }, HOLD_DELAY_MS);
    }
  }, [stop, canStart]);

  const release = useCallback(() => {
    const p = phaseRef.current;
    if (p === "holding") {
      // Released too early: cancel the arming.
      clearHold();
      setPhaseBoth("idle");
      return;
    }
    if (p !== "ready") return;
    startAt.current = performance.now();
    setPhaseBoth("running");
  }, []);

  const reset = useCallback(() => {
    clearHold();
    setElapsed(0);
    setPhaseBoth("idle");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (stoppingKey.current) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (phaseRef.current === "running") {
        e.preventDefault();
        e.stopImmediatePropagation();
        stoppingKey.current = true;
        stop();
        return;
      }
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.code !== "Space" || isTyping(e) || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      // Space controls the timer, so a previously clicked button must not acquire
      // a keyboard focus ring or receive a synthetic button activation.
      (document.activeElement as HTMLElement | null)?.blur();
      press();
    };
    const up = (e: KeyboardEvent) => {
      if (stoppingKey.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) stoppingKey.current = false;
        return;
      }
      if (e.code !== "Space" || isTyping(e)) return;
      e.preventDefault();
      if (document.querySelector('[aria-modal="true"]')) { reset(); return; }
      release();
    };
    const cancelArming = () => { stoppingKey.current = false; if (phaseRef.current === "holding" || phaseRef.current === "ready") reset(); };
    window.addEventListener("blur", cancelArming);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("blur", cancelArming);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [enabled, press, release, stop, reset]);

  useEffect(() => () => {
    clearHold();
  }, []);

  return { phase, elapsed, startedAt: startAt.current, press, release, reset };
}
