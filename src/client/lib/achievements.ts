import { PUZZLES, puzzleOf, scrambleTypeOf, solveModeOf, type PuzzleId } from "../../shared/puzzles";
import type { AchievementDto, AchievementSummaryDto, SolveDto } from "../../shared/types";
import { averageOf, effective, fmtTime } from "./format";
import { cases, sets } from "../local/catalog";

/** Single-time goals in seconds, per puzzle, from casual to expert. */
const SINGLE_GOALS: Record<PuzzleId, number[]> = {
  "222": [15, 10, 7, 5, 3],
  "333": [60, 45, 30, 25, 20, 15, 12, 10],
  "444": [180, 120, 90, 60, 45],
  "555": [300, 180, 120, 90],
  "666": [480, 300, 240, 180],
  "777": [600, 420, 300, 240],
  sq1: [60, 30, 20, 15, 10],
  pyram: [20, 10, 6, 4],
  skewb: [20, 10, 6, 4],
  minx: [300, 180, 120, 90, 60],
  clock: [20, 12, 8, 6],
};
/** Average-of-5 goals reuse the ladder without its hardest step. */
const AVERAGE_GOALS: Record<PuzzleId, number[]> = Object.fromEntries(Object.entries(SINGLE_GOALS).map(([id, goals]) => [id, goals.slice(0, -1)])) as Record<PuzzleId, number[]>;
const ONE_HANDED_GOALS = [90, 60, 45, 30, 20];
const BLINDFOLDED_GOALS = [300, 180, 120, 60];
const VOLUME_GOALS = [1, 10, 100, 1000];
const TRAINING_GOALS = [10, 100, 1000, 5000];
const DAY_GOALS = [7, 30, 100, 365];
const STREAK_GOALS = [3, 7, 30];
const LEARNED_GOALS = [1, 10, 50, 100];
const TOTAL_GOALS = [100, 1000, 10000];

const chronological = (a: SolveDto, b: SolveDto) => a.created_at.localeCompare(b.created_at) || a.id - b.id;
/** Full-scramble solves only: partial-scramble drills (2-gen, last layer…) are not solves. */
const fullScramble = (s: SolveDto) => !s.case_id && ["competition", "random-moves"].includes(scrambleTypeOf(s));
const label = (id: PuzzleId) => PUZZLES.find(p => p.id === id)?.label ?? id;
const seconds = (n: number) => n >= 60 && n % 60 === 0 ? `${n / 60}:00` : String(n);

function counter(id: string, title: string, description: string, category: AchievementDto["category"], group: string, unit: string, goal: number, dates: string[], puzzle?: PuzzleId): AchievementDto {
  const progress = Math.min(dates.length, goal);
  return { id, title, description, category, group, ...(puzzle ? { puzzle } : {}), progress, target: goal, ratio: progress / goal,
    detail: `${dates.length.toLocaleString()} / ${goal.toLocaleString()} ${unit}`, unlocked: dates.length >= goal, ...(dates.length >= goal ? { unlockedAt: dates[goal - 1] } : {}) };
}
/** Time goals count down: the running best and the first moment it beat the goal. */
function timeGoal(id: string, title: string, description: string, category: AchievementDto["category"], group: string, goalSeconds: number, series: { at: string; value: number | null }[], puzzle?: PuzzleId): AchievementDto {
  const target = goalSeconds * 1000;
  let best: number | null = null, unlockedAt: string | undefined;
  for (const point of series) {
    if (point.value === null) continue;
    if (best === null || point.value < best) best = point.value;
    if (!unlockedAt && point.value < target) unlockedAt = point.at;
  }
  const unlocked = !!unlockedAt;
  const ratio = best === null ? 0 : unlocked ? 1 : Math.max(0, Math.min(1, target / best));
  return { id, title, description, category, group, ...(puzzle ? { puzzle } : {}), progress: best ?? 0, target, ratio,
    detail: best === null ? `No solve yet · goal ${fmtTime(target)}` : `Best ${fmtTime(best)} · goal ${fmtTime(target)}`, unlocked, ...(unlockedAt ? { unlockedAt } : {}) };
}

/** Every achievement with its progress. Learning goals come from marks, the rest from solves. */
export function achievements(rows: SolveDto[], learned: readonly string[]): AchievementSummaryDto {
  const solves = [...rows].sort(chronological);
  const learnedSet = new Set(learned);
  const out: AchievementDto[] = [];
  for (const info of PUZZLES) {
    const group = info.label, puzzle = info.id;
    const own = solves.filter(s => puzzleOf(s) === puzzle);
    const timed = own.filter(s => !s.case_id);
    const series = (mode: string) => own.filter(s => fullScramble(s) && solveModeOf(s) === mode).map(s => ({ at: s.created_at, value: effective(s.time_ms, s.penalty) }));
    const standard = series("standard");
    for (const goal of SINGLE_GOALS[puzzle])
      out.push(timeGoal(`${puzzle}:single:${goal}`, `Sub-${seconds(goal)}`, `Solve ${group} in under ${seconds(goal)} seconds on a full scramble.`, "speed", group, goal, standard, puzzle));
    const averages: { at: string; value: number | null }[] = standard.map((point, i) => ({ at: point.at, value: i < 4 ? null : averageOf(standard.slice(i - 4, i + 1).map(p => p.value)) }));
    for (const goal of AVERAGE_GOALS[puzzle])
      out.push(timeGoal(`${puzzle}:ao5:${goal}`, `Sub-${seconds(goal)} average`, `Average of 5 under ${seconds(goal)} seconds on ${group}.`, "average", group, goal, averages, puzzle));
    if (puzzle === "333") {
      const oneHanded = series("one-handed");
      for (const goal of ONE_HANDED_GOALS)
        out.push(timeGoal(`333:oh:${goal}`, `Sub-${seconds(goal)} one-handed`, `Solve 3×3 one-handed in under ${seconds(goal)} seconds.`, "speed", group, goal, oneHanded, puzzle));
      const blind = series("blindfolded");
      const successes = blind.filter(p => p.value !== null).map(p => p.at);
      out.push(counter("333:bld:first", "Blindfolded success", "Complete a 3×3 blindfolded solve without a DNF.", "speed", group, "solve", 1, successes, puzzle));
      for (const goal of BLINDFOLDED_GOALS)
        out.push(timeGoal(`333:bld:${goal}`, `Sub-${seconds(goal)} blindfolded`, `Solve 3×3 blindfolded, memorisation included, in under ${seconds(goal)} seconds.`, "speed", group, goal, blind, puzzle));
    }
    for (const goal of VOLUME_GOALS)
      out.push(counter(`${puzzle}:solves:${goal}`, goal === 1 ? "First solve" : `${goal.toLocaleString()} solves`, goal === 1 ? `Record a first ${group} time.` : `Record ${goal.toLocaleString()} ${group} times.`, "volume", group, "solves", goal, timed.map(s => s.created_at), puzzle));
    // Reduced big cubes reuse the 3×3 sets, so their learning goals live under 3×3 only.
    for (const set of sets.filter(set => puzzleOf(set) === puzzle && !/^\dx\d-(f2l|oll|pll|2look)/.test(set.id))) {
      const ids = cases.filter(c => c.set === set.id).map(c => c.id);
      const known = ids.filter(id => learnedSet.has(id)).length;
      out.push({ id: `learn:${set.id}`, title: `${set.label} master`, description: `Mark every ${set.label} case of ${group} as learned.`, category: "knowledge", group, puzzle,
        progress: known, target: ids.length, ratio: ids.length ? known / ids.length : 0, detail: `${known} / ${ids.length} cases`, unlocked: ids.length > 0 && known === ids.length });
    }
  }
  const general = "General";
  const learnedCount = cases.filter(c => learnedSet.has(c.id)).length;
  for (const goal of LEARNED_GOALS)
    out.push({ id: `learn:total:${goal}`, title: goal === 1 ? "First algorithm" : `${goal} algorithms`, description: goal === 1 ? "Mark a first case as learned." : `Mark ${goal} cases as learned across all puzzles.`, category: "knowledge", group: general,
      progress: Math.min(learnedCount, goal), target: goal, ratio: Math.min(1, learnedCount / goal), detail: `${learnedCount} / ${goal} cases`, unlocked: learnedCount >= goal });
  for (const goal of TOTAL_GOALS)
    out.push(counter(`total:${goal}`, `${goal.toLocaleString()} times`, `Record ${goal.toLocaleString()} times across every puzzle and mode.`, "volume", general, "times", goal, solves.map(s => s.created_at)));
  for (const goal of TRAINING_GOALS)
    out.push(counter(`training:${goal}`, `${goal.toLocaleString()} drills`, `Complete ${goal.toLocaleString()} algorithm training attempts.`, "volume", general, "drills", goal, solves.filter(s => s.case_id).map(s => s.created_at)));
  const days = [...new Map(solves.map(s => [s.created_at.slice(0, 10), s.created_at])).values()];
  for (const goal of DAY_GOALS)
    out.push(counter(`days:${goal}`, `${goal} active days`, `Practise on ${goal} different days.`, "dedication", general, "days", goal, days));
  // Longest run of consecutive calendar days, with the date each goal was first reached.
  const streakDates: (string | undefined)[] = STREAK_GOALS.map(() => undefined);
  let longest = 0, run = 0, previous: number | null = null;
  for (const at of days) {
    const day = Math.floor(Date.parse(at.slice(0, 10)) / 86400000);
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    previous = day; longest = Math.max(longest, run);
    STREAK_GOALS.forEach((goal, i) => { if (run >= goal && !streakDates[i]) streakDates[i] = at; });
  }
  STREAK_GOALS.forEach((goal, i) => out.push({ id: `streak:${goal}`, title: `${goal}-day streak`, description: `Practise ${goal} days in a row.`, category: "dedication", group: general,
    progress: Math.min(longest, goal), target: goal, ratio: Math.min(1, longest / goal), detail: `${longest} / ${goal} days`, unlocked: longest >= goal, ...(streakDates[i] ? { unlockedAt: streakDates[i] } : {}) }));
  return { unlocked: out.filter(a => a.unlocked).length, total: out.length, achievements: out };
}

/** Group order for display: puzzles in registry order, then general goals. */
export const ACHIEVEMENT_GROUPS = [...PUZZLES.map(p => p.label), "General"];
export const achievementPuzzle = (group: string): PuzzleId | undefined => PUZZLES.find(p => p.label === group)?.id;
