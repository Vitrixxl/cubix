/**
 * The WCA's sign-in, on the web and the phone's web app (go-api/wca_auth.go): the page leaves for the WCA's, which sends
 * the browser back to the same page, a ticket in its address that `wcaFinish` redeems with the nonce this tab kept, so
 * that a ticket sent by someone else opens nothing.
 */

/** The address's parameter the WCA's sign-in comes back with. */
const TICKET = "wcaAuth";
/** Where this tab keeps the nonce of the sign-in it started. */
const NONCE = "cubix.wcaNonce";

/** What the WCA's sign-in came back with: its ticket, and the nonce of the tab that started it. */
export interface WcaReturn { ticket: string; nonce: string }

/** Leaves for the WCA's sign-in page: to sign in, or (`link`) to link a WCA account to the one signed in. */
export async function leaveForWca(start: (body: { origin: string; back: string; link: boolean; nonce: string }) => Promise<{ url: string }>, link: boolean) {
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(NONCE, nonce);
  const { url } = await start({ origin: location.origin, back: location.pathname + location.search, link, nonce });
  location.assign(url);
}

/** The ticket the WCA's sign-in left in the address, taken out of it; null when there is none, or this tab started none. */
export function takeWcaTicket(): WcaReturn | null {
  if (typeof location === "undefined") return null;
  const url = new URL(location.href),
    ticket = url.searchParams.get(TICKET);
  if (!ticket) return null;
  url.searchParams.delete(TICKET);
  history.replaceState(history.state, "", url);
  const nonce = sessionStorage.getItem(NONCE);
  sessionStorage.removeItem(NONCE);
  return nonce ? { ticket, nonce } : null;
}
