/** What the profile shows, derived from the store: activity by day, streaks, training per stage and achievements. */
import { store as s } from "../store";
import { DUELS_KEY, type DuelRecord } from "../duelClient";

export type ActivitySolve = { at: string; time: number | null; timer: boolean };

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** The hour for today's solves, the day for older ones. */
export const solvedAt = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : shortDate(iso);
};

/** Battles raced on this device, newest first. */
export const battles = (): DuelRecord[] => s.prefs[DUELS_KEY] ?? [];

/** Consecutive active days: the run reaching today (or yesterday, still alive) and the longest one. */
function streaks(days: Set<string>) {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let current = 0;
  while (days.has(dayKey(d))) {
    current++;
    d.setDate(d.getDate() - 1);
  }
  let longest = 0,
    run = 0,
    previous = 0;
  for (const key of [...days].sort()) {
    const [y, m, day] = key.split("-").map(Number) as [number, number, number];
    const t = Date.UTC(y, m - 1, day) / 86400000;
    run = t - previous === 1 ? run + 1 : 1;
    previous = t;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

export function profileData() {
  const p = s.profile,
    timer = p.playground?.summary ?? { count: 0 },
    history: any[] = p.playground?.history ?? [],
    cases: any[] = s.cases(s.profilePuzzle),
    trainedIds = new Set<string>((p.cases ?? []).map((c: any) => c.summary?.caseId)),
    learned = cases.filter((c) => s.learned.has(c.id)).length,
    stageNames = [...new Set<string>(cases.map((c) => c.stage).filter(Boolean))],
    stages = stageNames.map((stage) => {
      const members = cases.filter((c) => c.stage === stage);
      return {
        stage,
        total: members.length,
        learned: members.filter((c) => s.learned.has(c.id)).length,
        trained: members.filter((c) => trainedIds.has(c.id)).length,
      };
    }),
    all: any[] = s.achievements?.achievements ?? [],
    goals = all.filter((a) => !a.unlocked).sort((a, b) => b.ratio - a.ratio),
    recent = all.filter((a) => a.unlocked && a.unlockedAt).sort((a, b) => (a.unlockedAt < b.unlockedAt ? 1 : -1)),
    activity: ActivitySolve[] = [
      ...history.map((v) => ({ at: v.at, time: v.time, timer: true })),
      ...(p.cases ?? []).flatMap((c: any) => (c.history ?? []).map((v: any) => ({ at: v.at, time: v.time, timer: false }))),
    ].filter((v) => v.at),
    days = new Set(activity.map((v) => dayKey(new Date(v.at)))),
    latest = activity.reduce<string | null>((max, v) => (!max || v.at > max ? v.at : max), null);
  return {
    user: p.user,
    totalSolves: (p.totalSolves ?? 0) as number,
    trainingSolves: (p.trainingSolves ?? 0) as number,
    activeDays: (p.activeDays ?? 0) as number,
    timer,
    history,
    ao5: (p.playground?.ao5 ?? []) as (number | null)[],
    cases,
    trained: trainedIds.size,
    learned,
    stages,
    unlocked: (s.achievements?.unlocked ?? 0) as number,
    totalAchievements: (s.achievements?.total ?? 0) as number,
    goals,
    recent,
    activity,
    streak: streaks(days),
    latest,
  };
}

export type ProfileData = ReturnType<typeof profileData>;
