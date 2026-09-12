import { useAtom, useAtomValue } from "jotai";
import { puzzleAtom, cubeSwitchLockedAtom } from "../state";
import { PUZZLES, type PuzzleId } from "../../shared/puzzles";
import { IconCube } from "./icons";

/** One native select switches the puzzle for every page. */
export function PuzzlePicker() {
  const [puzzle, setPuzzle] = useAtom(puzzleAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  return <label className="puzzle-picker nav-item" title="Puzzle">
    <IconCube aria-hidden="true" />
    <select aria-label="Puzzle" value={puzzle} disabled={locked} data-timer-ignore onChange={event => { setPuzzle(event.target.value as PuzzleId); event.currentTarget.blur(); }}>
      {PUZZLES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  </label>;
}
