import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { PracticeTimer, type TimerSnapshot, type TimerPhase } from "../../../src/client/lib/practiceTimer";
export { HOLD_DELAY_MS, type TimerPhase } from "../../../src/client/lib/practiceTimer";

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

/**
 * Stackmat-style timer: hold the surface for HOLD_DELAY_MS → ready, release → start,
 * tap anywhere → stop. Releasing before the delay cancels.
 */
export function useTimer({ onStop, canStart = true }: Options): TimerApi {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const options = useRef({ onStop, canStart });
  options.current = { onStop, canStart };
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
  const [timer] = useState(() => new PracticeTimer({
    canStart: () => options.current.canStart && !failedSave.current,
    onChange: setSnapshot,
    onStop: ms => {
      const save = options.current.onStop;
      failedSave.current = () => save(Math.round(ms));
      retrySave();
    },
  }));
  useEffect(() => timer.dispose, [timer]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") timer.cancelArming();
    });
    return () => subscription.remove();
  }, [timer]);

  return { ...snapshot, saveError, retrySave, press: timer.press, release: timer.release, reset: timer.reset };
}
