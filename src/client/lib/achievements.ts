import { PUZZLES, puzzleOf, scrambleTypeOf, solveModeOf, type PuzzleId } from "../../shared/puzzles";
import type { AchievementDto, AchievementSummaryDto, SolveDto } from "../../shared/types";
import { effective, fmtTime, rollingAverages } from "./format";
import { cases, sets } from "../local/catalog";
import { msg } from "../i18n/msg";

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

// ISO timestamps order like their characters: a plain comparison, many times faster than localeCompare on Hermes.
const chronological = (a: SolveDto, b: SolveDto) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) || a.id - b.id;
/** Full-scramble solves only: partial-scramble drills (2-gen, last layer…) are not solves. */
const fullScramble = (s: SolveDto) => !s.case_id && scrambleTypeOf(s) === "normal";
const seconds = (n: number) => n >= 60 && n % 60 === 0 ? `${n / 60}:00` : String(n);

/** Counts up: `points` in order, the goal-th one unlocking it (with its solve, when a solve is what is counted). */
function counter(id: string, title: string, description: string, category: AchievementDto["category"], group: string, unit: string, goal: number, points: { at: string; id?: number }[], puzzle?: PuzzleId): AchievementDto {
  const progress = Math.min(points.length, goal), reached = points.length >= goal ? points[goal - 1]! : undefined;
  return { id, title, description, category, group, ...(puzzle ? { puzzle } : {}), progress, target: goal, ratio: progress / goal,
    detail: `${points.length.toLocaleString()} / ${goal.toLocaleString()} ${unit}`, unlocked: !!reached, ...(reached ? { unlockedAt: reached.at, ...(reached.id != null ? { solveId: reached.id } : {}) } : {}) };
}
/** Time goals count down: the running best and the first moment it beat the goal. */
function timeGoal(id: string, title: string, description: string, category: AchievementDto["category"], group: string, goalSeconds: number, series: { at: string; id: number; value: number | null }[], puzzle?: PuzzleId): AchievementDto {
  const target = goalSeconds * 1000;
  let best: number | null = null, unlockedAt: string | undefined, solveId: number | undefined;
  for (const point of series) {
    if (point.value === null) continue;
    if (best === null || point.value < best) best = point.value;
    if (!unlockedAt && point.value < target) ({ at: unlockedAt, id: solveId } = point);
  }
  const unlocked = !!unlockedAt;
  const ratio = best === null ? 0 : unlocked ? 1 : Math.max(0, Math.min(1, target / best));
  return { id, title, description, category, group, ...(puzzle ? { puzzle } : {}), progress: best ?? 0, target, ratio,
    detail: best === null ? msg("No solve yet · goal {0}", { 0: fmtTime(target) }) : msg("Best {0} · goal {1}", { 0: fmtTime(best), 1: fmtTime(target) }), unlocked, ...(unlockedAt ? { unlockedAt, solveId } : {}) };
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
    const series = (mode: string) => own.filter(s => fullScramble(s) && solveModeOf(s) === mode).map(s => ({ at: s.created_at, id: s.id, value: effective(s.time_ms, s.penalty) }));
    const standard = series("standard");
    for (const goal of SINGLE_GOALS[puzzle])
      out.push(timeGoal(msg("{0}:single:{1}", { 0: puzzle, 1: goal }), msg("Sub-{0}", { 0: seconds(goal) }), msg("Solve {0} in under {1} seconds on a full scramble.", { 0: group, 1: seconds(goal) }), "speed", group, goal, standard, puzzle));
    const ao5 = rollingAverages(standard.map(p => p.value), 5), averages = standard.map((point, i) => ({ ...point, value: ao5[i] ?? null }));
    for (const goal of AVERAGE_GOALS[puzzle])
      out.push(timeGoal(msg("{0}:ao5:{1}", { 0: puzzle, 1: goal }), msg("Sub-{0} average", { 0: seconds(goal) }), msg("Average of 5 under {0} seconds on {1}.", { 0: seconds(goal), 1: group }), "average", group, goal, averages, puzzle));
    if (puzzle === "333") {
      const oneHanded = series("one-handed");
      for (const goal of ONE_HANDED_GOALS)
        out.push(timeGoal(`333:oh:${goal}`, msg("Sub-{0} one-handed", { 0: seconds(goal) }), msg("Solve 3×3 one-handed in under {0} seconds.", { 0: seconds(goal) }), "speed", group, goal, oneHanded, puzzle));
      const blind = series("blindfolded");
      const successes = blind.filter(p => p.value !== null);
      out.push(counter("333:bld:first", msg("Blindfolded success"), msg("Complete a 3×3 blindfolded solve without a DNF."), "speed", group, "solve", 1, successes, puzzle));
      for (const goal of BLINDFOLDED_GOALS)
        out.push(timeGoal(`333:bld:${goal}`, msg("Sub-{0} blindfolded", { 0: seconds(goal) }), msg("Solve 3×3 blindfolded, memorisation included, in under {0} seconds.", { 0: seconds(goal) }), "speed", group, goal, blind, puzzle));
    }
    for (const goal of VOLUME_GOALS)
      out.push(counter(msg("{0}:solves:{1}", { 0: puzzle, 1: goal }), goal === 1 ? msg("First solve") : msg("{0} solves", { 0: goal.toLocaleString() }), goal === 1 ? msg("Record a first {0} time.", { 0: group }) : msg("Record {0} {1} times.", { 0: goal.toLocaleString(), 1: group }), "volume", group, "solves", goal, timed.map(s => ({ at: s.created_at, id: s.id })), puzzle));
    // Reduced big cubes reuse the 3×3 sets, so their learning goals live under 3×3 only.
    for (const set of sets.filter(set => puzzleOf(set) === puzzle && !/^\dx\d-(f2l|oll|pll|2look)/.test(set.id))) {
      const ids = cases.filter(c => c.set === set.id).map(c => c.id);
      const known = ids.filter(id => learnedSet.has(id)).length;
      out.push({ id: `learn:${set.id}`, title: msg("{0} master", { 0: set.label }), description: msg("Mark every {0} case of {1} as learned.", { 0: set.label, 1: group }), category: "knowledge", group, puzzle,
        progress: known, target: ids.length, ratio: ids.length ? known / ids.length : 0, detail: msg("{0} / {1} cases", { 0: known, 1: ids.length }), unlocked: ids.length > 0 && known === ids.length });
    }
  }
  const general = msg("General");
  const learnedCount = cases.filter(c => learnedSet.has(c.id)).length;
  for (const goal of LEARNED_GOALS)
    out.push({ id: `learn:total:${goal}`, title: goal === 1 ? msg("First algorithm") : msg("{0} algorithms", { 0: goal }), description: goal === 1 ? msg("Mark a first case as learned.") : msg("Mark {0} cases as learned across all puzzles.", { 0: goal }), category: "knowledge", group: general,
      progress: Math.min(learnedCount, goal), target: goal, ratio: Math.min(1, learnedCount / goal), detail: msg("{0} / {1} cases", { 0: learnedCount, 1: goal }), unlocked: learnedCount >= goal });
  for (const goal of TOTAL_GOALS)
    out.push(counter(`total:${goal}`, msg("{0} times", { 0: goal.toLocaleString() }), msg("Record {0} times across every puzzle and mode.", { 0: goal.toLocaleString() }), "volume", general, "times", goal, solves.map(s => ({ at: s.created_at, id: s.id }))));
  for (const goal of TRAINING_GOALS)
    out.push(counter(`training:${goal}`, msg("{0} drills", { 0: goal.toLocaleString() }), msg("Complete {0} algorithm training attempts.", { 0: goal.toLocaleString() }), "volume", general, "drills", goal, solves.filter(s => s.case_id).map(s => ({ at: s.created_at, id: s.id }))));
  const days = [...new Map(solves.map(s => [s.created_at.slice(0, 10), s.created_at])).values()];
  for (const goal of DAY_GOALS)
    out.push(counter(`days:${goal}`, msg("{0} active days", { 0: goal }), msg("Practise on {0} different days.", { 0: goal }), "dedication", general, "days", goal, days.map(at => ({ at }))));
  // Longest run of consecutive calendar days, with the date each goal was first reached.
  const streakDates: (string | undefined)[] = STREAK_GOALS.map(() => undefined);
  let longest = 0, run = 0, previous: number | null = null;
  for (const at of days) {
    const day = Math.floor(Date.parse(at.slice(0, 10)) / 86400000);
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    previous = day; longest = Math.max(longest, run);
    STREAK_GOALS.forEach((goal, i) => { if (run >= goal && !streakDates[i]) streakDates[i] = at; });
  }
  STREAK_GOALS.forEach((goal, i) => out.push({ id: `streak:${goal}`, title: msg("{0}-day streak", { 0: goal }), description: msg("Practise {0} days in a row.", { 0: goal }), category: "dedication", group: general,
    progress: Math.min(longest, goal), target: goal, ratio: Math.min(1, longest / goal), detail: msg("{0} / {1} days", { 0: longest, 1: goal }), unlocked: longest >= goal, ...(streakDates[i] ? { unlockedAt: streakDates[i] } : {}) }));
  return { unlocked: out.filter(a => a.unlocked).length, total: out.length, achievements: out };
}

/** Group order for display: puzzles in registry order, then general goals. */
export const ACHIEVEMENT_GROUPS = [...PUZZLES.map(p => p.label), msg("General")];
export const achievementPuzzle = (group: string): PuzzleId | undefined => PUZZLES.find(p => p.label === group)?.id;

/** What an achievement counts, read from its id: a time goal (single, ao5, one-handed, blindfolded) or a count. */
export type AchievementKind = "single" | "ao5" | "oh" | "bld" | "solves" | "sets" | "algorithms" | "times" | "drills" | "days" | "streak";
export function achievementKind(a: Pick<AchievementDto, "id">): AchievementKind {
  const [head, kind] = a.id.split(":");
  if (head === "learn") return kind === "total" ? "algorithms" : "sets";
  return ({ total: "times", training: "drills", days: "days", streak: "streak" } as Record<string, AchievementKind>)[head!] ?? (kind as AchievementKind);
}
/** Whether the goal is a time to beat (its progress the best time, in ms) rather than a count to reach. */
export const isTimeGoal = (a: Pick<AchievementDto, "id">) => ["single", "ao5", "oh", "bld"].includes(achievementKind(a)) && !a.id.endsWith(":first");
/** The series an achievement is a step of: the same goal on the same puzzle (Sub-30, Sub-25…), or a puzzle's sets. */
export const achievementSeries = (a: Pick<AchievementDto, "id" | "group">) => (achievementKind(a) === "sets" ? `learn:${a.group}` : a.id.slice(0, a.id.lastIndexOf(":")));

/** A set's name in a few letters: "OLL", "2-PLL", "ZBLL T", "EP" for Edge pairing. */
function setShort(label: string) {
  const twoLook = label.match(/^2-Look (\w+)/);
  if (twoLook) return "2-" + twoLook[1];
  if (label.length <= 6) return label;
  return label.split(/\s+/).find(w => /^[A-Z0-9]{2,}$/.test(w)) ?? label.split(/\s+/).filter(w => /^\w/.test(w)).map(w => w[0]!.toUpperCase()).join("");
}
/** What an achievement's badge reads: the goal itself (10, 1:00, 1k, OLL…) over its unit (sec, ao5, solves…). */
export function achievementBadge(a: Pick<AchievementDto, "id" | "group" | "target">): { value: string; unit: string } {
  const kind = achievementKind(a), goal = a.id.slice(a.id.lastIndexOf(":") + 1);
  if (kind === "sets") return { value: setShort(sets.find(set => `learn:${set.id}` === a.id)?.label ?? goal), unit: String(a.target) };
  if (goal === "first") return { value: "1", unit: "BLD" };
  const n = Number(goal);
  if (kind === "single") return { value: seconds(n), unit: msg("sec") };
  if (kind === "ao5" || kind === "oh" || kind === "bld") return { value: seconds(n), unit: { ao5: "ao5", oh: "OH", bld: "BLD" }[kind] };
  const units = { solves: msg("solves"), algorithms: msg("algs"), times: msg("times"), drills: msg("drills"), days: msg("days"), streak: msg("in a row") };
  return { value: n >= 1000 ? n / 1000 + "k" : String(n), unit: units[kind] };
}
