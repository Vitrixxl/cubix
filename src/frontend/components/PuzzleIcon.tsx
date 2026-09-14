import type { PuzzleId } from "../../shared/puzzles";

/** Official WCA event glyphs from the @cubing/icons font (MIT). */
const CODEPOINT: Record<PuzzleId, number> = {
  "222": 0xf10a, "333": 0xf106, "444": 0xf101, "555": 0xf10c, "666": 0xf113, "777": 0xf111,
  sq1: 0xf102, pyram: 0xf112, skewb: 0xf105, minx: 0xf103, clock: 0xf108,
};

export function PuzzleIcon({ puzzle, className = "" }: { puzzle: PuzzleId; className?: string }) {
  return <span className={`wca-icon ${className}`} aria-hidden="true">{String.fromCodePoint(CODEPOINT[puzzle])}</span>;
}
