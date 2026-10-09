import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { AppState } from "react-native";
import { authToken, live } from "../api";
import { userAtom } from "../state";

/** Keeps the app's one socket open, signed in as the current account (or without one for a guest). */
export function LiveConnection() {
  const user = useAtomValue(userAtom);
  const sessionToken = authToken.get();
  useEffect(() => live.ensure(), [user?.id, user?.isGuest, sessionToken]);
  useEffect(() => {
    // Back in front: a socket Android closed meanwhile opens again at once, its retry may be waiting.
    const appState = AppState.addEventListener("change", state => { if (state === "active") live.wake(); });
    return () => appState.remove();
  }, []);
  return null;
}
