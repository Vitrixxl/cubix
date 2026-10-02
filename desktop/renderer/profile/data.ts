/** What the profile shows, derived from the store with the shared rules of src/client/lib/profile.ts. */
import { useMemo } from "react";
import { store as s } from "../store";
import { DUELS_KEY, type DuelRecord } from "../duelClient";
import type { EventRecordDto } from "../../../src/shared/types";
import { achievementLists, activityOf, dayKey, type ActivitySolve, latestOf, stageCounts, streaks } from "../../../src/client/lib/profile";

/** Battles raced on this device, newest first. */
export const battles = (): DuelRecord[] => s.prefs[DUELS_KEY] ?? [];

function profileData(p: any, achievements: any, learnedIds: ReadonlySet<string>, puzzle: string) {
  const timer = p.playground?.summary ?? { count: 0 },
    history: any[] = p.playground?.history ?? [],
    cases: any[] = s.cases(puzzle),
    trainedIds = new Set<string>((p.cases ?? []).map((c: any) => c.summary?.caseId)),
    // Every event's solves when the engine sends them, this event's otherwise.
    activity: ActivitySolve[] = p.activity ?? activityOf(p),
    { goals, recent } = achievementLists<any>(achievements?.achievements ?? []);
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
    learned: cases.filter((c) => learnedIds.has(c.id)).length,
    stages: stageCounts(cases, learnedIds, trainedIds),
    unlocked: (achievements?.unlocked ?? 0) as number,
    totalAchievements: (achievements?.total ?? 0) as number,
    goals,
    recent,
    records: (p.records ?? []) as EventRecordDto[],
    activity,
    /** Days with at least one solve, every event together. */
    days: new Set(activity.map((v) => dayKey(new Date(v.at)))).size,
    streak: streaks(activity),
    latest: latestOf(activity),
    /** Solves of the last seven days, every event together. */
    week: activity.filter((v) => new Date(v.at).getTime() > Date.now() - 7 * 86_400_000).length,
  };
}

/** The profile's figures, computed again only when the profile, the achievements or the learned cases change. */
export function useProfileData() {
  const { profile, achievements, learned, profilePuzzle } = s;
  return useMemo(() => profileData(profile, achievements, learned, profilePuzzle), [profile, achievements, learned, profilePuzzle]);
}

export type ProfileData = ReturnType<typeof profileData>;
