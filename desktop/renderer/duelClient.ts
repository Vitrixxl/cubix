/** The duel of the web app: the shared client (src/client/lib/duel.ts) on the data engine and the store. */
import { store as s } from "./store";
import { call } from "./bridge";
import { DUELS_KEY, DuelClient, type DuelRecord } from "../../src/client/lib/duel";
import { eventInfo } from "../../src/shared/puzzles";

export * from "../../src/client/lib/duel";

class WebDuel extends DuelClient {
  get showCube(): boolean {
    return s.prefs["cubix.duel.showCube"] ?? true;
  }
  async action(arg: string) {
    switch (arg) {
      case "search":
        return this.search(s.event().id);
      case "leave":
        s.running = false;
        return this.leave();
      case "next":
        return this.next();
      case "rematch":
        return this.askRematch();
      case "+2":
      case "dnf":
        return this.penalty(arg);
      case "cancel":
        return this.cancel();
      case "cube":
        return s.pref("cubix.duel.showCube", !this.showCube);
      case "chat":
        return this.toggleChat();
      case "dismiss":
        return this.showResult(false);
      case "result":
        return this.showResult(true);
    }
  }
}

export const duel = new WebDuel({
  origin: location.origin,
  changed: () => s.emit(),
  reset: () => void s.timerEpoch++,
  scramble: (context) => call("scramble", context),
  level: async (id) => {
    const event = eventInfo(id);
    return event ? call("duelLevel", event.puzzle, event.solveMode) : null;
  },
  token: () => call("duelToken"),
  // The engine keeps the battles; a race already kept as it stands is not written again.
  record: (record: DuelRecord) => {
    const existing = (s.prefs[DUELS_KEY] ?? []).find((v: DuelRecord) => v.id === record.id);
    if (existing && JSON.stringify({ ...existing, at: record.at }) === JSON.stringify(record)) return;
    void call("duelRecord", record)
      .then((list) => {
        s.prefs[DUELS_KEY] = list;
        s.emit();
      })
      .catch((e) => s.fail(e));
  },
  // The store is still being created while this module loads: reach it only when needed.
  fail: (e) => s.fail(e),
});
