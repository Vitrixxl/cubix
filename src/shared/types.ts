/** HTTP and WebSocket contracts for the Rust API and native clients. */

import type { CubeSize, PuzzleId, SolveMode, ScrambleType } from "./puzzles";
export type Stage = "F2L" | "OLL" | "PLL" | "ZBLL" | "PBL" | "Centers" | "Edges" | "Parity" | "Basics" | "Cube shape" | "Corners" | "Last layer" | "Dials";
export const STAGES: readonly Stage[] = ["F2L", "OLL", "PLL"];

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
