import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type TimerPhase = "idle" | "holding" | "ready" | "running" | "stopped";

export interface TimerApi {
  phase: TimerPhase;
  /** Elapsed ms at rest. The readout calculates live time from startedAt. */
  elapsed: number;
  startedAt: number;
  /** call on touch down on the timer surface */
  press: () => void;
  /** call on touch up */
  release: () => void;
  reset: () => void;
  saveError: string;
  retrySave: () => void;
}

interface Options {
  onStop: (ms: number) => void | Promise<void>;
  /** Temporarily prevent new attempts while keeping stop handling active. */
  canStart?: boolean;
}

/** How long the surface must be held before a release starts the timer. */
export const HOLD_DELAY_MS = 300;

/**
 * Stackmat-style timer: hold the surface for HOLD_DELAY_MS → ready, release → start,
 * tap anywhere → stop. Releasing before the delay cancels.
 */
export function useTimer({ onStop, canStart = true }: Options): TimerApi {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [saveError, setSaveError] = useState("");
  const failedSave = useRef<(() => void | Promise<void>) | null>(null);
  const saving = useRef(false);
  const retrySave = useCallback(() => {
    const action = failedSave.current;
    if (!action || saving.current) return;
    saving.current = true;
    Promise.resolve().then(action).then(() => { failedSave.current = null; setSaveError(""); })
      .catch(error => setSaveError((error as Error).message))
      .finally(() => { saving.current = false; });
  }, []);
  const [elapsed, setElapsed] = useState(0);
  const startAt = useRef(0);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<TimerPhase>("idle");
  const setPhaseBoth = (p: TimerPhase) => { phaseRef.current = p; setPhase(p); };
  const clearHold = () => { if (hold.current !== null) clearTimeout(hold.current); hold.current = null; };

  const stop = useCallback(() => {
    const ms = performance.now() - startAt.current;
    setElapsed(ms);
    setPhaseBoth("stopped");
    failedSave.current = () => onStop(Math.round(ms));
    retrySave();
  }, [onStop, retrySave]);

  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === "running") stop();
    else if (canStart && !failedSave.current && (p === "idle" || p === "stopped")) {
      setElapsed(0);
      setPhaseBoth("holding");
      clearHold();
      hold.current = setTimeout(() => {
        hold.current = null;
        if (phaseRef.current === "holding") setPhaseBoth("ready");
      }, HOLD_DELAY_MS);
    }
  }, [stop, canStart]);

  const release = useCallback(() => {
    const p = phaseRef.current;
    if (p === "holding") { clearHold(); setPhaseBoth("idle"); return; }
    if (p !== "ready") return;
    startAt.current = performance.now();
    setPhaseBoth("running");
  }, []);

  const reset = useCallback(() => { clearHold(); setElapsed(0); setPhaseBoth("idle"); }, []);
  useEffect(() => () => clearHold(), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active" && (phaseRef.current === "holding" || phaseRef.current === "ready")) reset();
    });
    return () => subscription.remove();
  }, [reset]);

  return { phase, elapsed, saveError, retrySave, startedAt: startAt.current, press, release, reset };
}
