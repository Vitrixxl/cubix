import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { isSolved, smartCube } from "../../../src/client/lib/smartCube";
import { ScrambleTracker, trackable, type ScrambleProgress } from "../../../src/client/lib/scrambleTracker";
import { writeSolution } from "../../../src/client/lib/solution";
import { tr } from "../../../src/client/i18n";
import type { TimerApi } from "./useTimer";

/**
 * Timer solves on a connected cube, as the web's (desktop/renderer/smartSolve.ts): the scramble is followed turn by
 * turn, the first turn once scrambled starts the timer and the solved cube stops it, with the cube's own clock. The
 * turns are kept for the solve's save (`take`). A tap that stops the timer first ends the recording.
 */
/** Whether a cube is connected (its taps then never split phases: the cube stops the timer). */
export const useSmartCubeOn = () => useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status) === "on";

export function useSmartCubeSolve(timer: TimerApi, scramble: string, active: boolean) {
  const link = useSmartCubeOn(),
    on = active && link && trackable(scramble);
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  const current = useRef(timer),
    recorded = useRef<string | null>(null);
  current.current = timer;
  useEffect(() => {
    if (!on) return void setProgress(null);
    const tracker = new ScrambleTracker(scramble, smartCube.snapshot.state);
    let count = smartCube.snapshot.count,
      moves: { move: string; at: number }[] | null = null;
    setProgress(tracker.progress);
    return smartCube.subscribe(() => {
      const { turn, state, count: now } = smartCube.snapshot;
      if (now === count) return;
      count = now;
      const reported = smartCube.moves.at(-1);
      if (moves && !current.current.running()) moves = null;
      if (!turn || !reported) {
        moves = null;
        tracker.sync(state);
        return setProgress(tracker.progress);
      }
      if (!moves) {
        if (!tracker.progress.scrambled || !current.current.begin()) {
          tracker.turn(reported.move, state);
          return setProgress(tracker.progress);
        }
        moves = [];
      }
      moves.push(reported);
      if (!isSolved(state)) return;
      recorded.current = writeSolution(moves);
      const ms = moves.at(-1)!.at - moves[0]!.at;
      moves = null;
      current.current.finish(ms);
    });
  }, [on, scramble]);
  return {
    /** Where the cube stands before the solve, for the line under the timer; null without a cube. */
    hint: on && progress && (timer.phase === "idle" || timer.phase === "stopped") ? scrambleHint(progress) : null,
    /** The turns of the solve the cube just finished, once. */
    take: () => {
      const solution = recorded.current;
      recorded.current = null;
      return solution;
    },
  };
}

const scrambleHint = (p: ScrambleProgress) =>
  p.lost ? tr("Solve the cube to start the scramble")
    : p.undo.length ? `${tr("Undo")} ${p.undo.join(" ")}`
    : p.scrambled ? tr("Your first turn starts the timer")
    : `${tr("Scrambling")} ${p.turns.filter(t => t === "done").length}/${p.turns.length}`;
