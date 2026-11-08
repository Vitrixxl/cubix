/**
 * How well a case is known, shared by the web app and Android: a ladder rather than learned or not. The first rungs are
 * climbed in the case's lesson (`stage`, kept with the account), By heart is the case's learned mark, and the last two
 * are read from its attempts: nothing else to keep, and they fall back when the attempts say so.
 */
import { caseGoal, caseMatcher, goalReached, type TrainableCase } from "./smartTraining";
import { msg } from "../i18n/msg";
import type { CubeState } from "../../shared/cube";
import type { CaseStatsDto } from "../../shared/types";

export type Mastery = 0 | 1 | 2 | 3 | 4 | 5;
export const MASTERY_LABELS = [msg("New"), msg("Discovered"), msg("Guided"), msg("By heart"), msg("Fluent"), msg("Anchored")] as const;
/** The rung past which a case is known: it is then drilled, and reviewed. */
export const KNOWN: Mastery = 3;
export const MASTERY_TOP: Mastery = 5;

/** Attempts before a case's pace says it is fluent. */
const FLUENT_ATTEMPTS = 8;
/** How much slower than the usual time of its set a fluent case may be. */
const FLUENT_MARGIN = 1.1;
/** Reviews passed in a row, each further apart, before a case is anchored: past two weeks without a miss. */
const ANCHORED_BOX = 4;
/** Days past its review date after which a case no longer counts as anchored or fluent: it has to show it again. */
const STALE_DAYS = 14;

type CaseProgress = { learned: boolean; stage?: number; stat?: Pick<CaseStatsDto, "count" | "ao5" | "box" | "dueAt"> | null; usual?: number | null };

/** Where a case stands on the ladder. */
export function masteryOf({ learned, stage = 0, stat, usual }: CaseProgress, now = Date.now()): Mastery {
  if (!learned) return Math.min(2, Math.max(0, stage)) as Mastery;
  const fluent = (stat?.count ?? 0) >= FLUENT_ATTEMPTS && stat?.ao5 != null && (usual == null || stat.ao5 <= usual * FLUENT_MARGIN);
  if (!fluent) return 3;
  if (stat?.dueAt && now - Date.parse(stat.dueAt) > STALE_DAYS * 86_400_000) return 3;
  return (stat?.box ?? 0) >= ANCHORED_BOX ? 5 : 4;
}

/** A set's usual time: the mean of its known cases timed enough to mean something, by set. */
export function usualTimes(cases: readonly { id: string; set: string }[], learned: ReadonlySet<string>, stats: readonly Pick<CaseStatsDto, "caseId" | "mean" | "count">[]) {
  const setOf = new Map(cases.map((c) => [c.id, c.set])),
    sums = new Map<string, [number, number]>();
  for (const stat of stats) {
    const set = setOf.get(stat.caseId);
    if (!set || !learned.has(stat.caseId) || stat.mean == null || stat.count < 3) continue;
    const sum = sums.get(set) ?? [0, 0];
    sums.set(set, [sum[0] + stat.mean, sum[1] + 1]);
  }
  return new Map([...sums].map(([set, [total, n]]) => [set, total / n]));
}

/** Named sequences, the longest first: read as one gesture, they are what the hands remember. */
const TRIGGERS: [string, string][] = [
  ["R U2 R' U' R U' R'", "Anti-Sune"],
  ["R U R' U R U2 R'", "Sune"],
  ["F R U R' U' F'", "Sexy in F"],
  ["R U R' U'", "Sexy move"],
  ["R' F R F'", "Sledgehammer"],
  ["F R' F' R", "Hedgeslammer"],
  ["U R U' R'", "Reverse sexy"],
  ["L' U' L U", "Left sexy"],
];
/** The turns of an algorithm, without its brackets. */
export const algTurns = (alg: string) => alg.replace(/[()[\]]/g, " ").split(/\s+/).filter(Boolean);

export interface AlgChunk { turns: string[]; name?: string }
/** An algorithm cut into gestures: its named sequences, and three or four turns at a time between them. */
export function chunkAlg(alg: string): AlgChunk[] {
  const turns = algTurns(alg), chunks: AlgChunk[] = [];
  let loose: string[] = [];
  const flush = () => {
    while (loose.length) chunks.push({ turns: loose.splice(0, loose.length === 4 ? 4 : 3) });
  };
  for (let i = 0; i < turns.length;) {
    const found = TRIGGERS.find(([seq]) => { const t = seq.split(" "); return t.every((turn, k) => turns[i + k] === turn); });
    if (found) {
      flush();
      const length = found[0].split(" ").length;
      chunks.push({ turns: turns.slice(i, i + length), name: found[1] });
      i += length;
    } else loose.push(turns[i++]!);
  }
  flush();
  return chunks;
}

export type LessonPhase = "understand" | "guided" | "fading" | "recall" | "done";
export type Outcome = "good" | "hesitant" | "miss";
export interface CaseLesson {
  phase: LessonPhase;
  /** Successes in a row in this phase. */
  reps: number;
  /** While fading, how many gestures are hidden. */
  hidden: number;
}
const GUIDED_REPS = 2, RECALL_REPS = 2;
/** The ladder's rung of a moment of the lesson. */
const RUNG: Record<LessonPhase, Mastery> = { understand: 0, guided: 1, fading: 2, recall: 2, done: 3 };
export const lessonStage = (lesson: CaseLesson) => RUNG[lesson.phase];

/** A case's lesson, opened where its ladder stands. */
export function startLesson(level: Mastery): CaseLesson {
  return { phase: level >= KNOWN ? "recall" : level === 2 ? "fading" : level === 1 ? "guided" : "understand", reps: 0, hidden: level === 2 ? 1 : 0 };
}

/**
 * The lesson after one attempt: seen, then done twice with the algorithm in view, then with its gestures hidden one by
 * one, then twice in a row from memory. A hesitation earns nothing, a miss goes a step back.
 */
export function advanceLesson(lesson: CaseLesson, outcome: Outcome, chunks: number): CaseLesson {
  const { phase, reps, hidden } = lesson;
  if (phase === "understand") return { phase: "guided", reps: 0, hidden: 0 };
  if (outcome === "hesitant") return lesson;
  if (phase === "guided") {
    if (outcome === "miss") return { ...lesson, reps: 0 };
    return reps + 1 >= GUIDED_REPS ? { phase: chunks > 1 ? "fading" : "recall", reps: 0, hidden: 1 } : { ...lesson, reps: reps + 1 };
  }
  if (phase === "fading") {
    if (outcome === "miss") return hidden > 1 ? { ...lesson, hidden: hidden - 1 } : { phase: "guided", reps: 0, hidden: 0 };
    return hidden + 1 >= chunks ? { phase: "recall", reps: 0, hidden: chunks } : { ...lesson, hidden: hidden + 1 };
  }
  if (phase === "recall") {
    if (outcome === "miss") return { phase: "fading", reps: 0, hidden: Math.max(1, chunks - 1) };
    return reps + 1 >= RECALL_REPS ? { phase: "done", reps: 0, hidden: chunks } : { ...lesson, reps: reps + 1 };
  }
  return lesson;
}

/** A case a connected cube can watch: it says when the case is set up, then judges the attempt. */
export type WatchedCase = TrainableCase & { setup: string };
/** Turns beyond the algorithm's own before an attempt counts as a hesitation. */
const SPARE_TURNS = 2;
/**
 * Follows a connected cube through one attempt: `waiting` for the case to be set up on it, then `armed`; the case solved
 * gives the outcome, a hesitation when it took more turns than the algorithm has. Null for a case the cube cannot see.
 */
export function caseWatcher(c: WatchedCase, length: number) {
  const goal = caseGoal(c);
  if (!goal) return null;
  const matches = caseMatcher(c.setup, goal);
  let armedAt: number | null = null;
  return {
    get armed() { return armedAt !== null; },
    /** The cube as it stands and its turns so far: an outcome once the attempt is over. */
    see(state: CubeState, count: number): Outcome | null {
      if (armedAt === null) { if (matches(state)) armedAt = count; return null; }
      if (count === armedAt) return null;
      if (!goalReached(state, goal)) return null;
      const taken = count - armedAt;
      armedAt = null;
      return taken > length + SPARE_TURNS ? "hesitant" : "good";
    },
    /** Turns made since the case was set up. */
    made: (count: number) => (armedAt === null ? 0 : count - armedAt),
  };
}
