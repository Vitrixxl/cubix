import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { followTimerDevice, PracticeTimer, type TimerSnapshot, type TimerPhase } from "../../../src/client/lib/practiceTimer";
import { smartTimer } from "../../../src/client/lib/bluetooth/timers";
import { stackmat } from "../../../src/client/lib/stackmat";
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
  /** Timed in phases (`phases`): when each phase ended, in ms from the start. */
  splits?: number[];
  /** The inspection's penalty: a DNF with no time when it ran past 17 seconds. */
  penalty?: Penalty;
  /** call on touch down on the timer surface */
  press: () => void;
  /** call on touch up */
  release: () => void;
  reset: () => void;
  /** Starts a solve without a touch (a smart cube's first turn); false when it cannot start. */
  begin: () => boolean;
  /** Ends a running solve with the time measured elsewhere (the cube's own clock, a time limit reached). */
  finish: (ms: number) => void;
  /** Whether a solve runs now, without waiting for the next render. */
  running: () => boolean;
  saveError: string;
  retrySave: () => void;
}

interface Options {
  /** `penalty` (the inspection's), `memo` and `splits` come only when one of them applies. */
  onStop: (ms: number, penalty?: Penalty, memo?: number, splits?: number[]) => void | Promise<void>;
  /** Temporarily prevent new attempts while keeping stop handling active. */
  canStart?: boolean;
  /** A WCA inspection before each solve: the first tap begins it, the next hold starts the solve. */
  inspection?: boolean;
  /** Blindfolded: the first tap of a running solve marks the end of the memorisation. */
  memo?: boolean;
  /** The phases a solve is timed in: each tap of a running solve but the last ends one (lib/phases). */
  phases?: number;
}

/**
 * Stackmat-style timer: hold the surface for HOLD_DELAY_MS → ready, release → start,
 * tap anywhere → stop. Releasing before the delay cancels.
 */
export function useTimer({ onStop, canStart = true, inspection = false, memo = false, phases = 1 }: Options): TimerApi {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const options = useRef({ onStop, canStart, inspection, memo, phases });
  options.current = { onStop, canStart, inspection, memo, phases };
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
    phases: () => options.current.phases,
    onChange: setSnapshot,
    onStop: (ms, penalty, memo, splits) => {
      const save = options.current.onStop;
      failedSave.current = () => splits ? save(Math.round(ms), penalty, memo, splits) : penalty !== "none" || memo !== undefined ? save(Math.round(ms), penalty, memo) : save(Math.round(ms));
      retrySave();
    },
  }));
  useEffect(() => timer.dispose, [timer]);
  // On the web (a tablet's keyboard, a laptop), the keyboard works the timer as on the desktop: the space bar is held
  // then released to start, any key stops it. Not while typing in a field.
  useEffect(() => {
    if (typeof document === "undefined") return; // Android: no keyboard events to listen to.
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    const running = () => timer.snapshot.phase === "running";
    const down = (e: KeyboardEvent) => {
      if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== "Space" && !running()) return;
      e.preventDefault();
      timer.press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      timer.release();
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, [timer]);
  // A smart timer, or a Stackmat on the web, drives the timer as its pads are touched.
  useEffect(() => {
    const stops = [smartTimer, stackmat].map(device => followTimerDevice(timer, device, () => true));
    return () => stops.forEach(stop => stop());
  }, [timer]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") timer.cancelArming();
    });
    return () => subscription.remove();
  }, [timer]);

  return { ...snapshot, saveError, retrySave, press: timer.press, release: timer.release, reset: timer.reset, begin: timer.begin, finish: timer.finish, running: () => timer.snapshot.phase === "running" };
}
