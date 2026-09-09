/** HTTP and WebSocket contracts for the Rust API and React web app. */

import type { CubeSize, PuzzleId, SolveMode, ScrambleType } from "./puzzles";
export type Stage = "F2L" | "OLL" | "PLL" | "PBL" | "Centers" | "Edges" | "Parity" | "Basics" | "Cube shape" | "Corners" | "Last layer" | "Dials";
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
  penalty: Penalty;
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
  bio: string;
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

export interface FriendDto {
  id: number;
  userId: string;
  username: string;
  status: "pending" | "accepted";
  incoming: boolean;
}
export interface ChatMessageDto {
  id: number;
  senderId: string;
  recipientId: string;
  text: string;
  solve: SolveDto | null;
  createdAt: string;
}
