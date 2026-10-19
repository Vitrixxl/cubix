/**
 * The WCA's sign-in, on the web and the phone's web app (go-api/wca_auth.go): the page leaves for the WCA's, which sends
 * the browser back to the same page, a ticket in its address that `wcaFinish` redeems.
 */

/** The address's parameter the WCA's sign-in comes back with. */
const TICKET = "wcaAuth";

/** Leaves for the WCA's sign-in page: to sign in, or (`link`) to link a WCA account to the one signed in. */
export async function leaveForWca(start: (body: { origin: string; back: string; link: boolean }) => Promise<{ url: string }>, link: boolean) {
  const { url } = await start({ origin: location.origin, back: location.pathname + location.search, link });
  location.assign(url);
}

/** The ticket the WCA's sign-in left in the address, taken out of it; null when there is none. */
export function takeWcaTicket(): string | null {
  if (typeof location === "undefined") return null;
  const url = new URL(location.href),
    ticket = url.searchParams.get(TICKET);
  if (!ticket) return null;
  url.searchParams.delete(TICKET);
  history.replaceState(history.state, "", url);
  return ticket;
}
