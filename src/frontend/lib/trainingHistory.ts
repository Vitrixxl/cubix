import type { CaseDto } from "../../shared/types";

export interface TrainingCase { c: CaseDto; auf: string; }
export interface TrainingHistory { entries: TrainingCase[]; index: number; revision: number; }
export const EMPTY_TRAINING_HISTORY: TrainingHistory = { entries: [], index: -1, revision: 0 };
export const TRAINING_HISTORY_LIMIT = 100;
type Action = { type: "previous" } | { type: "next"; pool: CaseDto[]; sample: number; auf: string };

/** Retain a bounded sequence so back/forward restores the exact setup. */
export function trainingHistoryReducer(state: TrainingHistory, action: Action): TrainingHistory {
  if (action.type === "previous") return state.index > 0 ? { ...state, index: state.index - 1, revision: state.revision + 1 } : state;
  if (!action.pool.length) return state.entries.length ? EMPTY_TRAINING_HISTORY : state;
  const available = new Set(action.pool.map(c => c.id));
  const forward = state.entries.findIndex((entry, index) => index > state.index && available.has(entry.c.id));
  if (forward !== -1) return { ...state, index: forward, revision: state.revision + 1 };
  const currentId = state.entries[state.index]?.c.id;
  const candidates = action.pool.length > 1 ? action.pool.filter(c => c.id !== currentId) : action.pool;
  const c = candidates[Math.min(candidates.length - 1, Math.floor(action.sample * candidates.length))]!;
  const entries = [...state.entries.slice(0, state.index + 1), { c, auf: action.auf }].slice(-TRAINING_HISTORY_LIMIT);
  return { entries, index: entries.length - 1, revision: state.revision + 1 };
}
