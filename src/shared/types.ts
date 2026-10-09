/** HTTP and WebSocket contracts for the API and native clients. */

import type { CubeSize, EventId, PuzzleId, SolveMode, ScrambleType } from "./puzzles";
export type Stage = "F2L" | "OLL" | "PLL" | "ZBLL" | "PBL" | "Centers" | "Edges" | "Parity" | "Basics" | "Cube shape" | "Corners" | "Last layer" | "Dials";

export type LearningGroupOrder = Partial<Record<"F2L" | "OLL" | "PLL", string[]>>;
export interface LearningGroupOrderDto {
  id: number;
  track: "F2L" | "OLL" | "PLL";
  groups: string[];
  updated_at: string;
}

export interface AlgEntry {
  alg: string;
  source: string;
  votes?: number;
  etm?: number;
  stm?: number;
  gen?: string;
  youtube?: string;
  recommended_by?: string[];
  /** AUF to perform before the algorithm when starting from the case as shown by `setup`. */
  pre_auf?: string;
}

export interface CaseDto {
  puzzle_id?: PuzzleId;
  diagram?: string;
  notes?: string;
  cube_size?: CubeSize;
  id: string;
  name: string;
  stage: Stage;
  set: string;
  setLabel: string;
  group: string;
  subgroup?: string;
  probability?: string;
  setup: string;
  setups_alt: string[];
  algorithms: AlgEntry[];
}

export interface SetDto {
  puzzle_id?: PuzzleId;
  cube_size?: CubeSize;
  id: string;
  label: string;
  stage: Stage;
  description: string;
  count: number;
}

export type SessionMode = "training" | "playground";
export type Penalty = "none" | "+2" | "dnf";

export interface SolveDto {
  puzzle_id?: PuzzleId;
  solve_mode?: SolveMode;
  scramble_type?: ScrambleType;
  cube_size?: CubeSize | null;
  id: number;
  session_id: number | null;
  case_id: string | null;
  time_ms: number;
  penalty: Penalty;
  scramble: string | null;
  /** Free-text note; absent in data saved before notes existed. */
  comment?: string | null;
  /** The turns that were made, when they are known (a smart cube records them); see `lib/solution`. */
  solution?: string | null;
  created_at: string;
}

export interface SessionDto {
  puzzle_id?: PuzzleId;
  solve_mode?: SolveMode;
  scramble_type?: ScrambleType;
  cube_size?: CubeSize | null;
  id: number;
  mode: SessionMode;
  case_ids: string[];
  created_at: string;
}

/** Learning status is independent of timed solves and follows the account across devices. */
export interface LearnedCaseDto {
  id: number;
  case_id: string;
  learned: 0 | 1;
  /** The catalogue algorithms the case was learned with, if some were chosen. */
  algs?: string[];
  /** The first of them, for older clients. */
  alg?: string | null;
  updated_at: string;
}

export interface CaseStatsDto {
  caseId: string;
  count: number;
  best: number | null;
  worst: number | null;
  mean: number | null;
  ao5: number | null;
  ao12: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  last: number | null;
  lastAt: string | null;
}

export interface HistoryPoint {
  id: number;
  time: number | null;
  /** Raw time before penalties, for editing the solve from a history row. */
  timeMs: number;
  penalty: Penalty;
  comment: string | null;
  at: string;
  /** best time so far (running minimum) */
  best: number | null;
  sessionId: number | null;
  /** Turned on a smart cube: its turns were recorded. */
  smart?: boolean;
  /** A case done during a smart cube solve rather than trained on its own: the solve it was part of. */
  solveId?: number;
}

export interface CaseHistoryDto {
  summary: CaseStatsDto;
  history: HistoryPoint[];
  ao5: (number | null)[];
  ao12: (number | null)[];
}

export interface UserDto {
  id: string;
  username: string;
  isGuest: boolean;
  createdAt: string;
}
export interface AuthDto { user: UserDto; token: string }
export interface ProfileDto {
  user: UserDto;
  playground: CaseHistoryDto;
  cases: (CaseHistoryDto & { name: string; stage: Stage })[];
  totalSolves: number;
  trainingSolves: number;
  activeDays: number;
  /** The records of every event timed, on its standard scrambles, whatever the profile's filter. */
  records?: EventRecordDto[];
  /** Every solve of every event, for the activity graph and the streak; `timer` marks the profile's own timer solves. */
  activity?: { at: string; time: number | null; timer: boolean }[];
}

export interface EventRecordDto {
  event: EventId;
  puzzle: PuzzleId;
  solveMode: SolveMode;
  count: number;
  best: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  bestAo100: number | null;
  lastAt: string | null;
  /** The single is the best time given at setup, which no solve has beaten yet. */
  declared?: boolean;
}

/** Computed locally from synchronized solves and learning marks, so every device agrees. */
export type AchievementCategory = "knowledge" | "speed" | "average" | "volume" | "dedication";
export interface AchievementDto {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  /** Section the achievement is listed under: a puzzle label or "General". */
  group: string;
  puzzle?: PuzzleId;
  /** Current value and goal in the achievement's own unit (cases, solves, days or milliseconds). */
  progress: number;
  target: number;
  /** Completion between 0 and 1, already inverted for time goals. */
  ratio: number;
  /** Short human-readable progress, e.g. "12 / 21 cases" or "Best 23.45 · goal 20.00". */
  detail: string;
  unlocked: boolean;
  /** Date of the solve that unlocked it; absent for learning goals. */
  unlockedAt?: string;
}
export interface AchievementSummaryDto {
  unlocked: number;
  total: number;
  achievements: AchievementDto[];
}
