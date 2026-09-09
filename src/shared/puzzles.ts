export const CUBE_SIZES = [2, 3, 4, 5, 6, 7] as const;
export type CubeSize = typeof CUBE_SIZES[number];
export const isCubeSize = (value: unknown): value is CubeSize => CUBE_SIZES.includes(value as CubeSize);
export const cubeLabel = (size: number) => `${size}×${size}`;
/** Data saved before multi-cube support belongs to 3×3. */
export const cubeOf = (value: { cube_size?: CubeSize | null }): CubeSize => value.cube_size ?? 3;

import registry from "../../data/puzzles.json";
export type PuzzleId = "222" | "333" | "444" | "555" | "666" | "777" | "sq1" | "pyram" | "skewb" | "minx" | "clock";
export type PuzzleInput = CubeSize | PuzzleId;
export type SolveMode = "standard" | "one-handed" | "blindfolded";
export type ScrambleType = "competition" | "random-moves" | "2gen-ru" | "2gen-lu" | "2gen-rf" | "2gen-mu" | "3gen-rul" | "3gen-ruf" | "half-turns" | "edges-only" | "corners-only" | "last-layer" | "oll" | "pll" | "f2l" | "outer-turns" | "case";
export interface PracticeFilter { solveMode?: SolveMode; scrambleType?: ScrambleType }
export interface PracticeContext { puzzle: PuzzleId; solveMode: SolveMode; scrambleType: ScrambleType }
export interface StoredContext { puzzle_id?: PuzzleId; cube_size?: CubeSize | null; solve_mode?: SolveMode; scramble_type?: ScrambleType; case_id?: string | null; mode?: string }
export const PUZZLES = registry.puzzles as { id: PuzzleId; label: string; cubeSize: CubeSize | null; twisty: string; scrambles: ScrambleType[] }[];
export const SOLVE_MODES = registry.solveModes as { id: SolveMode; label: string }[];
export const SCRAMBLE_TYPES = [...registry.scrambles, { id: "case", label: "Algorithm case" }] as { id: ScrambleType; label: string }[];
export const puzzleId = (value: PuzzleInput): PuzzleId => (typeof value === "number" ? String(value).repeat(3) : value) as PuzzleId;
export const puzzleOf = (value: StoredContext): PuzzleId => value.puzzle_id ?? puzzleId(value.cube_size ?? 3);
export const puzzleInfo = (value: PuzzleInput) => PUZZLES.find(p => p.id === puzzleId(value))!;
export const isPuzzle = (value: unknown): value is PuzzleId => PUZZLES.some(p => p.id === value);
export const solveModeOf = (value: StoredContext): SolveMode => value.solve_mode ?? "standard";
export const scrambleTypeOf = (value: StoredContext): ScrambleType => value.scramble_type ?? (value.case_id || value.mode === "training" ? "case" : "random-moves");
export const contextOf = (value: StoredContext): PracticeContext => ({ puzzle: puzzleOf(value), solveMode: solveModeOf(value), scrambleType: scrambleTypeOf(value) });
export const contextKey = (context: PracticeContext) => `${context.puzzle}:${context.solveMode}:${context.scrambleType}`;
export const modeLabel = (mode: SolveMode) => SOLVE_MODES.find(m => m.id === mode)?.label ?? mode;
export const scrambleLabel = (type: ScrambleType) => SCRAMBLE_TYPES.find(s => s.id === type)?.label ?? type;
export const contextLabel = (value: StoredContext) => `${puzzleInfo(puzzleOf(value)).label} · ${scrambleLabel(scrambleTypeOf(value))} · ${modeLabel(solveModeOf(value))}`;
export function validContext(context: PracticeContext, training = false): boolean {
  return isPuzzle(context.puzzle) && SOLVE_MODES.some(m => m.id === context.solveMode)
    && (training ? context.scrambleType === "case" : puzzleInfo(context.puzzle).scrambles.includes(context.scrambleType));
}
export const matchesPractice = (value: StoredContext, puzzle: PuzzleInput, filter: PracticeFilter = {}) => puzzleOf(value) === puzzleId(puzzle)
  && solveModeOf(value) === (filter.solveMode ?? "standard") && (!filter.scrambleType || scrambleTypeOf(value) === filter.scrambleType);
