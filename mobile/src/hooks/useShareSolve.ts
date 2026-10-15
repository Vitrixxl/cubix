import { useAtomValue, useSetAtom } from "jotai";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import { sharedSolveUrl } from "../../../src/client/lib/sharedSolve";
import { said, tr } from "../../../src/client/i18n";
import { API_ORIGIN, api } from "../api";
import { toastAtom } from "../components/Toast";
import { guestModeAtom, signedInAtom } from "../state";

/**
 * Shares a solve by its public link (sharedSolve.ts), in the share sheet, the link copied where there is none (a browser
 * without one); a guest is asked to sign in first, a failure shown.
 */
export function useShareSolve() {
  const signedIn = useAtomValue(signedInAtom), setGuest = useSetAtom(guestModeAtom), toast = useSetAtom(toastAtom);
  /** `title` names the share; `text`, when given, comes before the link. */
  return async (id: number, title: string, text?: string) => {
    if (!signedIn) return setGuest(false);
    try {
      const url = sharedSolveUrl(API_ORIGIN, await api.shareSolve(id));
      await Share.share({ message: text ? `${text} · ${url}` : url, title }).catch(async (e: Error) => {
        if (e.name === "AbortError") return;
        await Clipboard.setStringAsync(url);
        toast({ title: tr("Link copied"), description: url });
      });
    } catch (e) {
      toast({ error: true, title: said((e as Error).message) });
    }
  };
}
