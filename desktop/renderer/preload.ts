/**
 * The pages that read the server, read ahead once the account is known: each finds its data in memory on its first
 * opening, then reads it anew behind what it shows. The clients keep it across pages; the daily page keeps its own.
 */
import { store as s } from "./store";
import { community } from "./community/client";
import { coaching } from "./coaching/client";
import { duel } from "./duelClient";

export function preloadAll() {
  if (!s.ready || !s.signedIn || s.user.isGuest) return;
  void duel.loadLevel(s.event().id);
  void import("./daily").then((m) => m.preloadDaily(), () => {});
  // The latest conversations, the first the one a wide window opens on.
  // ponytail: the five latest only; the others load when opened.
  void community.load("conversations").then(() => {
    for (const c of community.conversations?.slice(0, 5) ?? []) {
      void community.load(`messages:${c.id}`);
      if (c.kind === "group") void community.load(`group:${c.group!.id}`);
    }
  });
  // The tournaments under way or open, and the one the list shows first (tournaments/page.tsx) whatever it is.
  void community.load("tournaments").then(() => {
    const list = community.tournaments ?? [],
      first = list.find((t) => t.myMatch) ?? list.find((t) => t.status === "open") ?? list.find((t) => t.status === "running") ?? list[0];
    for (const t of list) if (t === first || t.status === "open" || t.status === "running") void community.load(`tournament:${t.id}`);
  });
  // A coach's dashboard, or the coaches with the first one's page and slots (coaching/browse.tsx sorts by the next slot).
  void coaching.load("bookings");
  void coaching.load("me").then(async () => {
    if (coaching.isCoach) return void coaching.load("dashboard");
    await coaching.load("coaches");
    const first = coaching.coaches?.toSorted((a, b) => (a.nextSlot ?? Infinity) - (b.nextSlot ?? Infinity))[0];
    if (!first) return;
    void coaching.load(`coach:${first.id}`);
    void coaching.load(`slots:${first.id}`);
  });
}
