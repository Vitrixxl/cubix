/**
 * Solves on a connected cube: once the scramble is done, the cube's first turn starts the timer and the solved cube
 * stops it, with the time of the cube's own clock (first turn to last). The solve is then analysed by the engine,
 * on this device and off the page (solveAnalysis.ts), and kept as the latest analysis until the next solve starts.
 * The turns of the solve are saved with it, as its solution (solution.ts).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isSolved, smartCube, stopPenalty } from "../../src/client/lib/smartCube";
import type { RecordedSolve, SolveAnalysis } from "../../src/client/lib/solveAnalysis";
import { writeSolution } from "../../src/client/lib/solution";
import type { CubeState } from "../../src/shared/cube";
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
  const current = useRef(options),
    /** The solve being turned, if any. */
    solving = useRef<RecordedSolve | null>(null),
    /** The solution of the solve the cube is finishing, while its time is saved. */
    finished = useRef<string | null>(null);
  current.current = options;
  useEffect(() => {
    if (!options.active) return;
    let recording: RecordedSolve | null = null;
    const record = (next: RecordedSolve | null) => void (recording = solving.current = next);
    let count = smartCube.snapshot.count,
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
      if (recording && !store.running) record(null);
      const reported = smartCube.moves.at(-1);
      if (!turn || !reported) return void record(null);
      if (!recording) {
        if (!current.current.scrambled || !current.current.begin()) return;
        record({ start: turn.before, moves: [], orientations: held ? [{ quaternion: held, at: reported.at }] : [] });
        solves++;
        setLatest(null);
      }
      recording!.moves.push(reported);
      if (!isSolved(state)) return;
      const done = recording!;
      record(null);
      finished.current = writeSolution(done.moves);
      current.current.finish(done.moves.at(-1)!.at - done.moves[0]!.at);
      finished.current = null;
      const solve = solves;
      call("analyseSolve", done)
        .then((analysis) => solve === solves && setLatest(analysis as SolveAnalysis | null))
        .catch(() => {});
    });
    return () => record(null);
  }, [options.active]);
  /**
   * What the cube knows of the solve stopped now: its turns, saved as its solution, and its penalty when a key stops
   * it before the cube is solved: +2 when one face turn is left, DNF otherwise (WCA 10e); that solve is dropped,
   * without an analysis. Undefined when no solve on the cube is running.
   */
  return (): { penalty?: "none" | "+2" | "dnf"; solution: string | null } | undefined => {
    if (finished.current) return { solution: finished.current };
    if (!solving.current) return undefined;
    const solution = writeSolution(solving.current.moves);
    solving.current = null;
    return { penalty: stopPenalty(smartCube.snapshot.state), solution };
  };
}

/**
 * A case trained on a connected cube (smartTraining.ts): once the cube shows the case, its first turn away from it
 * starts the timer (a turn of the top keeps the case) and the case solved stops it, with the time of the cube's own
 * clock. The turns are saved with the attempt, as its solution. `set` tells whether the case is set up, for the line
 * under the timer.
 */
export function useSmartCase(options: {
  active: boolean;
  matches: ((state: CubeState) => boolean) | null;
  solved: ((state: CubeState) => boolean) | null;
  begin: () => boolean;
  finish: (ms: number) => void;
}) {
  const current = useRef(options),
    solving = useRef<{ move: string; at: number }[] | null>(null),
    finished = useRef<string | null>(null),
    [set, setSet] = useState(false);
  current.current = options;
  useEffect(() => {
    setSet(false);
    if (!options.active || !options.matches) return;
    let moves: { move: string; at: number }[] | null = null;
    const record = (next: typeof moves) => void (moves = solving.current = next);
    let count = smartCube.snapshot.count,
      ready = options.matches(smartCube.snapshot.state);
    setSet(ready);
    const unsubscribe = smartCube.subscribe(() => {
      const { turn, state, count: now } = smartCube.snapshot;
      if (now === count) return;
      count = now;
      const { matches, solved, begin, finish } = current.current;
      // A timer stopped by a key, or a cube resynchronised, ends the attempt.
      if (moves && !store.running) record(null);
      const reported = smartCube.moves.at(-1),
        was = ready;
      ready = !!matches?.(state);
      setSet(ready);
      if (!turn || !reported) return void record(null);
      if (!moves) {
        if (!was || ready || !begin()) return;
        record([]);
      }
      moves!.push(reported);
      if (!solved?.(state)) return;
      const done = moves!;
      record(null);
      finished.current = writeSolution(done);
      finish(done.at(-1)!.at - done[0]!.at);
      finished.current = null;
    });
    return () => {
      unsubscribe();
      record(null);
    };
  }, [options.active, options.matches]);
  /** The turns of the attempt stopped now, saved as its solution; undefined when none runs on the cube. */
  const stop = (): { solution: string | null } | undefined => {
    if (finished.current) return { solution: finished.current };
    if (!solving.current) return undefined;
    const solution = writeSolution(solving.current);
    solving.current = null;
    return { solution };
  };
  return { set, stop };
}
