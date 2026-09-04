import { useCallback, useEffect, useRef, useState } from "react";

export type TimerPhase = "idle" | "ready" | "running" | "stopped";

export interface TimerApi {
  phase: TimerPhase;
  /** elapsed ms (live while running) */
  elapsed: number;
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
}

/**
 * csTimer-style timer: hold space (or the timer surface) → ready, release → start,
 * any key / tap → stop.
 */
export function useTimer({ onStop, enabled = true }: Options): TimerApi {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const startAt = useRef(0);
  const raf = useRef<number | null>(null);
  const phaseRef = useRef<TimerPhase>("idle");
  const setPhaseBoth = (p: TimerPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const tick = useCallback(() => {
    setElapsed(performance.now() - startAt.current);
    raf.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    const ms = performance.now() - startAt.current;
    setElapsed(ms);
    setPhaseBoth("stopped");
    onStop(Math.round(ms));
  }, [onStop]);

  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === "running") stop();
    else if (p === "idle" || p === "stopped") {
      setElapsed(0);
      setPhaseBoth("ready");
    }
  }, [stop]);

  const release = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    startAt.current = performance.now();
    setPhaseBoth("running");
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const reset = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setElapsed(0);
    setPhaseBoth("idle");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (phaseRef.current === "running") {
        e.preventDefault();
        stop();
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        press();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        release();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled, press, release, stop]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
  }, []);

  return { phase, elapsed, press, release, reset };
}
