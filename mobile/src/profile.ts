import { atom } from "jotai";
import { unwrap } from "jotai/utils";
import { activityOf, heatDays, heatmap, heatYears, latestOf, streaks } from "../../src/client/lib/profile";
import { puzzleInfo } from "../../src/shared/puzzles";
import { local } from "./api";
import { deletedSolveIdAtom, profileFiltersAtom, puzzleAtom, scrambleTypeAtom, solveModeAtom, statsVersionAtom, userAtom } from "./state";

// Store-level selectors survive page unmounts. Returning to the profile or opening a detail page must not
// rebuild all histories and achievements; workspace changes still invalidate them, including sync and edits.
export const profilePuzzleAtom = atom(get => get(profileFiltersAtom).cube ?? get(puzzleAtom));
export const profileSolveModeAtom = atom(get => get(profileFiltersAtom).solveMode ?? get(solveModeAtom));
export const profileScrambleTypeAtom = atom(get => {
  const preferred = get(profileFiltersAtom).scrambleType ?? get(scrambleTypeAtom);
  const types = puzzleInfo(get(profilePuzzleAtom)).scrambles;
  return types.includes(preferred) ? preferred : types[0]!;
});
export const profileCatalogAtom = atom(get => local.read.catalog(get(profilePuzzleAtom)));
/** The account and selection a profile is about: data prepared for another one is not shown as this one's. */
export const profileKeyAtom = atom(get => `${get(userAtom)?.id ?? ""}:${get(profilePuzzleAtom)}:${get(profileSolveModeAtom)}:${get(profileScrambleTypeAtom)}`);

/** Resolves once the frame being drawn is on screen, so a page shows before the work it waits for runs. */
const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
/** The work of a superseded preparation: never runs, never settles. */
const superseded = new Promise<never>(() => {});

/**
 * The profile and everything drawn from its histories (every event's activity, streaks, the solves of the week, the
 * contribution graph's days and default year), prepared once per change of the workspace and kept while pages come and go. It is worked out after a frame
 * is painted, never during the render of the page asking for it: until then the last prepared one stays on screen
 * (`null` the very first time), so opening the profile never waits for it.
 */
const preparedProfileAtom = atom(async (get, { signal }) => {
  get(statsVersionAtom); get(deletedSolveIdAtom);
  const key = get(profileKeyAtom), cube = get(profilePuzzleAtom);
  const filter = { solveMode: get(profileSolveModeAtom), scrambleType: get(profileScrambleTypeAtom) };
  await afterPaint();
  if (signal.aborted) return superseded;
  const profile = local.read.profile(cube, filter);
  // Every event's solves, as the web's: the figures, the streak and the graph count all of them.
  const activity = profile.activity ?? activityOf(profile), days = heatDays(activity), weekAgo = Date.now() - 7 * 86_400_000;
  return {
    key, profile, activity, days, years: heatYears(days), heat: heatmap(days, null), latest: latestOf(activity), streak: streaks(activity),
    week: activity.filter(v => new Date(v.at).getTime() > weekAgo).length,
  };
});
export type PreparedProfile = Awaited<ReturnType<(typeof preparedProfileAtom)["read"]>>;
export const profileDataAtom = unwrap(preparedProfileAtom, previous => previous ?? null);

/** The achievements, prepared the same way. */
const preparedAchievementsAtom = atom(async (get, { signal }) => {
  get(userAtom); get(statsVersionAtom); get(deletedSolveIdAtom);
  await afterPaint();
  if (signal.aborted) return superseded;
  return local.read.achievements();
});
export const profileAchievementsAtom = unwrap(preparedAchievementsAtom, previous => previous ?? null);
