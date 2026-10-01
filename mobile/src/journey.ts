import { atom } from "jotai";
import { LOCKED_PAGES, PROFILE_KEY, journeyProfile, puzzleLocked, withKnownPuzzle } from "../../src/client/lib/journey";
import { puzzleInfo, type EventId, type PuzzleId } from "../../src/shared/puzzles";
import { api, local } from "./api";
import { eventAtom, puzzleAtom, replaceRouteAtom, routeAtom, statsVersionAtom, userAtom, type Page } from "./state";

export const introductionAtom = atom<"setup" | "tour" | "goal" | null>(null);
export const editingGoalAtom = atom("");
export const journeyAtom = atom(get => { get(statsVersionAtom); get(userAtom); return local.read.journey(); });
export const goalsAtom = atom(get => { get(statsVersionAtom); get(userAtom); return local.read.goals(); });

/** The current puzzle cannot be solved yet: only Learn and the account are open on it (as on the web). */
export const puzzleLockedAtom = atom(get => puzzleLocked(journeyProfile(get(journeyAtom)), get(puzzleAtom)));
/** Whether a section waits for the current puzzle's course. */
export const isLockedPage = (locked: boolean, page: Page) => locked && (LOCKED_PAGES as readonly string[]).includes(page);
/** "Learn to solve this puzzle?", after picking one that cannot be solved yet: the event and section it came from. */
export const learnPromptAtom = atom<{ event: EventId; page: Page } | null>(null);
/** The greyed section a tap tried to open, while "Skip the tutorial?" is asked. */
export const skipLearningAtom = atom<Page | null>(null);
/**
 * Picks an event in the puzzle sheet (as on the web): a new puzzle opens on the timer wherever the player was; one that
 * cannot be solved yet on its course, with the question first: learn it, or unlock everything at once.
 */
export const pickEventAtom = atom(null, (get, set, id: EventId) => {
  const from = { event: get(eventAtom), page: get(routeAtom).page }, previous = get(puzzleAtom);
  set(eventAtom, id);
  const locked = get(puzzleLockedAtom);
  if (locked && get(puzzleAtom) !== previous) set(learnPromptAtom, from);
  set(replaceRouteAtom, { page: locked ? "learn" : "playground" });
});
/** The current puzzle can be solved from now on: after its course, or with the tutorial skipped. */
export const unlockPuzzleAtom = atom(null, async (get, _set, method?: string) => {
  const profile = journeyProfile(get(journeyAtom));
  if (profile && get(puzzleLockedAtom)) await api.updateJourney({ [PROFILE_KEY]: withKnownPuzzle(profile, get(puzzleAtom), method) });
});

export const puzzleLabel = (id: PuzzleId) => puzzleInfo(id).label;
