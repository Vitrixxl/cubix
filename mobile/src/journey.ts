import { atom } from "jotai";
import { PROFILE_KEY, journeyProfile, puzzleLocked, withKnownPuzzle } from "../../src/client/lib/journey";
import type { EventId } from "../../src/shared/puzzles";
import { api, local } from "./api";
import { eventAtom, puzzleAtom, replaceRouteAtom, statsVersionAtom, userAtom } from "./state";

export const introductionAtom = atom<"setup" | "tour" | null>(null);
export const journeyAtom = atom(get => { get(statsVersionAtom); get(userAtom); return local.read.journey(); });

/** The current puzzle is not one the player said they solve yet; nothing waits for it (as on the web), only Finish records it. */
const puzzleLockedAtom = atom(get => puzzleLocked(journeyProfile(get(journeyAtom)), get(puzzleAtom)));
/** Picks an event in the puzzle sheet (as on the web): a new puzzle opens on the timer, wherever the player was. */
export const pickEventAtom = atom(null, (_get, set, id: EventId) => {
  set(eventAtom, id);
  set(replaceRouteAtom, { page: "playground" });
});
/** A finished course makes its puzzle one the player knows, with its method. */
export const unlockPuzzleAtom = atom(null, async (get, _set, method?: string) => {
  const profile = journeyProfile(get(journeyAtom));
  if (profile && get(puzzleLockedAtom)) await api.updateJourney({ [PROFILE_KEY]: withKnownPuzzle(profile, get(puzzleAtom), method) });
});
