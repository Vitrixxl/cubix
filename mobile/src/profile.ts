import { atom } from "jotai";
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
export const profileDataAtom = atom(get => {
  get(userAtom); get(statsVersionAtom); get(deletedSolveIdAtom);
  return local.read.profile(get(profilePuzzleAtom), { solveMode: get(profileSolveModeAtom), scrambleType: get(profileScrambleTypeAtom) });
});
export const profileAchievementsAtom = atom(get => {
  get(userAtom); get(statsVersionAtom); get(deletedSolveIdAtom);
  return local.read.achievements();
});
