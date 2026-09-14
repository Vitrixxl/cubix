import { useAtom, useAtomValue } from "jotai";
import { puzzleAtom, cubeSwitchLockedAtom } from "../state";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../shared/puzzles";
import { PuzzleIcon } from "./PuzzleIcon";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

/** A shadcn select listing every puzzle with its WCA glyph. */
export function PuzzleSelect({ value, onChange, disabled, compact, className = "" }: { value: PuzzleId; onChange: (puzzle: PuzzleId) => void; disabled?: boolean; compact?: boolean; className?: string }) {
  return <Select value={value} disabled={disabled} onValueChange={next => onChange(next as PuzzleId)}>
    <SelectTrigger className={`puzzle-trigger ${compact ? "compact" : ""} ${className}`} aria-label={`Puzzle: ${puzzleInfo(value).label}`}>
      <PuzzleIcon puzzle={value} />{!compact && <span>{puzzleInfo(value).label}</span>}
    </SelectTrigger>
    <SelectContent className="puzzle-options">
      {PUZZLES.map(p => <SelectItem key={p.id} value={p.id} textValue={p.label}><PuzzleIcon puzzle={p.id} /><span>{p.label}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}

/** The app-wide puzzle, shown in the navigation. */
export function PuzzlePicker({ compact }: { compact?: boolean }) {
  const [puzzle, setPuzzle] = useAtom(puzzleAtom), locked = useAtomValue(cubeSwitchLockedAtom);
  return <PuzzleSelect value={puzzle} onChange={setPuzzle} disabled={locked} compact={compact} className="nav-puzzle" />;
}
