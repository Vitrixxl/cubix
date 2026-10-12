import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { PracticeTimer, type TimerSnapshot, type TimerPhase } from "../../../src/client/lib/practiceTimer";
import type { Penalty } from "../../../src/shared/types";
export { HOLD_DELAY_MS, type TimerPhase } from "../../../src/client/lib/practiceTimer";

export interface TimerApi {
  phase: TimerPhase;
  /** Elapsed ms at rest. The readout calculates live time from startedAt. */
  elapsed: number;
  startedAt: number;
  /** When a WCA inspection began, while one runs (`inspection`). */
  inspectedAt?: number;
  /** Blindfolded (`memo`): when the memorisation ended, in ms from the start. */
  memo?: number;
  /** call on touch down on the timer surface */
  press: () => void;
  /** call on touch up */
  release: () => void;
  reset: () => void;
  saveError: string;
  retrySave: () => void;
}

interface Options {
  /** `penalty` (the inspection's) and `memo` come only when one of them applies. */
  onStop: (ms: number, penalty?: Penalty, memo?: number) => void | Promise<void>;
  /** Temporarily prevent new attempts while keeping stop handling active. */
  canStart?: boolean;
  /** A WCA inspection before each solve: the first tap begins it, the next hold starts the solve. */
  inspection?: boolean;
  /** Blindfolded: the first tap of a running solve marks the end of the memorisation. */
  memo?: boolean;
}

/**
 * Stackmat-style timer: hold the surface for HOLD_DELAY_MS → ready, release → start,
 * tap anywhere → stop. Releasing before the delay cancels.
 */
export function useTimer({ onStop, canStart = true, inspection = false, memo = false }: Options): TimerApi {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const options = useRef({ onStop, canStart, inspection, memo });
  options.current = { onStop, canStart, inspection, memo };
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
    inspection: () => options.current.inspection,
    memo: () => options.current.memo,
    onChange: setSnapshot,
    onStop: (ms, penalty, memo) => {
      const save = options.current.onStop;
      failedSave.current = () => penalty !== "none" || memo !== undefined ? save(Math.round(ms), penalty, memo) : save(Math.round(ms));
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
