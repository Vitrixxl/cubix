/** The match of the web app: the shared client (src/client/lib/match.ts) on the community's host and the data engine's scrambler. */
import { store as s } from "../store";
import { call } from "../bridge";
import { community, host } from "../community/client";
import { MatchClient } from "../../../src/client/lib/match";

export * from "../../../src/client/lib/match";

class WebMatch extends MatchClient {
  /** A match opens on what the community holds of it (its card, its tournament's bracket) until the server's state comes. */
  open(id: number) {
    super.open(id);
    this.match = community.cards.get(id) ?? [...community.details.values()].flatMap((t) => t.matches).find((m) => m.id === id) ?? null;
    this.host.changed();
  }
}

export const live = new WebMatch({ ...host, scramble: (context) => call("scramble", context), fail: (e) => s.fail(e) });
