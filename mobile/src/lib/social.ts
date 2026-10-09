import { getDefaultStore } from "jotai";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { Coaching } from "../../../src/client/lib/coaching";
import { Community, type Notice, type SocialHost } from "../../../src/client/lib/community";
import { MatchClient } from "../../../src/client/lib/match";
import type { UserDto } from "../../../src/shared/types";
import { API_ORIGIN, authToken, live as socket, local } from "../api";
import { ask } from "../components/Confirm";
import { toastAtom } from "../components/Toast";
import { puzzleAtom, routeAtom, routeOfUrl, urlOfRoute } from "../state";
import { generatePracticeScramble } from "./practiceScramble";

/**
 * The community, the coaching and live matches of the Android app: the shared clients (src/client/lib) on the app's
 * session, its toasts, its confirmations and its routes (web addresses read through `routeOfUrl`). Screens redraw with
 * `useSocial`. The app's jotai store is the default one (App.tsx), so the host reaches the route and the toast.
 */
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const store = getDefaultStore();

const notify = (notice: Notice) => store.set(toastAtom, notice);
/** Opens an address of the app; returns whether it has a page for it. */
export function openUrl(url: string) {
  const target = routeOfUrl(url);
  if (!target) return false;
  if (target.puzzle) store.set(puzzleAtom, target.puzzle);
  store.set(routeAtom, target.route);
  return true;
}

const host: SocialHost = {
  origin: API_ORIGIN,
  token: async () => (local.current()?.isGuest ? null : authToken.get()),
  live: socket,
  account: () => { const user = local.current(); return { id: user?.id ?? "", username: user?.username ?? "" }; },
  changed,
  notify,
  confirm: ask,
  navigate: openUrl,
  path: () => urlOfRoute(store.get(routeAtom)),
  visible: () => AppState.currentState === "active",
};

export const community = new Community(host);
export const coaching = new Coaching(host);
export const live = new MatchClient({
  ...host,
  scramble: generatePracticeScramble,
  fail: error => notify({ error: true, title: error instanceof Error ? error.message : String(error) }),
});

/** Follows the signed-in account, as the web does: coaching for every account, the community for those not guests. */
export function attachSocial(user: Pick<UserDto, "id" | "isGuest"> | null) {
  coaching.attach(user?.id ?? null);
  community.attach(user && !user.isGuest ? user.id : null);
}

// Back in front: what is on screen counts as read (the socket opens again in LiveConnection).
AppState.addEventListener("change", state => {
  if (state === "active") changed();
});

/**
 * Redraws when the community, the coaching or a match changes. With `read`, only when what it returns changes (keep it
 * a number or a string); without, on every change.
 */
export function useSocial<T = number>(read?: () => T): T {
  return useSyncExternalStore(subscribe, read ?? (() => version as T));
}
/** Each client, drawing again on every change. */
export const useCommunity = () => (useSocial(), community);
export const useCoaching = () => (useSocial(), coaching);
export const useLive = () => (useSocial(), live);

export * from "../../../src/client/lib/community";
