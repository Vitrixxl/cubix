import { useSyncExternalStore } from "react";
import { DUELS_KEY, DuelClient, keepRecord, levelOf, type DuelRecord } from "../../../src/client/lib/duel";
import { eventInfo } from "../../../src/shared/puzzles";
import { API_ORIGIN, api, authToken, local } from "../api";
import { storage } from "../platform/storage";
import { generatePracticeScramble } from "./practiceScramble";

export * from "../../../src/client/lib/duel";

/**
 * The duel of the Android app: the shared client (src/client/lib/duel.ts) on the local workspace, the native
 * scrambler and the app's storage. Screens read it through `useDuel`; `version` changes on every update.
 */
const listeners = new Set<() => void>();
let version = 0;
/** Bumped when a race or a game starts, so the player's timer starts over. */
let epoch = 0;
const emit = () => { version++; listeners.forEach(listener => listener()); };

export const battles = (): DuelRecord[] => {
  try { return JSON.parse(storage.getItem(DUELS_KEY) ?? "[]"); } catch { return []; }
};

export const duel = new DuelClient({
  origin: API_ORIGIN,
  changed: emit,
  reset: () => { epoch++; },
  scramble: generatePracticeScramble,
  level: async id => {
    const event = eventInfo(id);
    return event ? levelOf(await api.solves("playground", 12, event.puzzle, { solveMode: event.solveMode, scrambleType: "normal" })) : null;
  },
  token: async () => local.current().isGuest ? null : authToken.get(),
  record: record => {
    const list = battles(), next = keepRecord(list, record);
    if (JSON.stringify(next) === JSON.stringify(list)) return;
    storage.setItem(DUELS_KEY, JSON.stringify(next));
    emit();
  },
  fail: () => { /* The race goes on; a missing scramble shows as the skeleton of the prompt. */ },
});

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Re-renders on every change of the duel; returns it with the timer epoch. */
export function useDuel() {
  useSyncExternalStore(subscribe, () => version);
  return { duel, epoch };
}
