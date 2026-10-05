/**
 * Solves on a connected cube: once the scramble is done, the cube's first turn starts the timer and the solved cube
 * stops it, with the time of the cube's own clock (first turn to last). The solve is then analysed by the engine,
 * on this device and off the page (solveAnalysis.ts), and kept as the latest analysis until the next solve starts.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { isSolved, smartCube } from "../../src/client/lib/smartCube";
import type { RecordedSolve, SolveAnalysis } from "../../src/client/lib/solveAnalysis";
import { call } from "./bridge";
import { store } from "./store";

let latest: SolveAnalysis | null = null;
/** Numbers the solves: an analysis that comes back after the next solve started is dropped. */
let solves = 0;
const listeners = new Set<() => void>();
const setLatest = (analysis: SolveAnalysis | null) => {
  latest = analysis;
  for (const listener of listeners) listener();
};
/** The analysis of the last solve done on the connected cube. */
export const useLatestAnalysis = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => latest,
  );

export function useSmartSolve(options: {
  active: boolean;
  /** The scramble is done: the next turn starts the solve. */
  scrambled: boolean;
  /** Starts the timer; false when it cannot start. */
  begin: () => boolean;
  finish: (ms: number) => void;
}) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    if (!options.active) return;
    let recording: RecordedSolve | null = null,
      count = smartCube.snapshot.count,
      orientation = smartCube.snapshot.orientation;
    return smartCube.subscribe(() => {
      const { turn, state, count: now, orientation: held } = smartCube.snapshot;
      if (held !== orientation) {
        orientation = held;
        if (recording && held) recording.orientations.push({ quaternion: held, at: Date.now() });
      }
      if (now === count) return;
      count = now;
      // A timer stopped by a key, or a cube resynchronised, ends the recording without an analysis.
      if (recording && !store.running) recording = null;
      const reported = smartCube.moves.at(-1);
      if (!turn || !reported) return void (recording = null);
      if (!recording) {
        if (!current.current.scrambled || !current.current.begin()) return;
        recording = { start: turn.before, moves: [], orientations: held ? [{ quaternion: held, at: reported.at }] : [] };
        solves++;
        setLatest(null);
      }
      recording.moves.push(reported);
      if (!isSolved(state)) return;
      const done = recording;
      recording = null;
      current.current.finish(done.moves.at(-1)!.at - done.moves[0]!.at);
      const solve = solves;
      call("analyseSolve", done)
        .then((analysis) => solve === solves && setLatest(analysis as SolveAnalysis | null))
        .catch(() => {});
    });
  }, [options.active]);
}
