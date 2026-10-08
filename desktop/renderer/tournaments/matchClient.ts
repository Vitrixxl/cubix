/** The match of the web app: the shared client (src/client/lib/match.ts) on the community's host and the data engine's scrambler. */
import { store as s } from "../store";
import { call } from "../bridge";
import { host } from "../community/client";
import { MatchClient } from "../../../src/client/lib/match";

export * from "../../../src/client/lib/match";

export const live = new MatchClient({ ...host, scramble: (context) => call("scramble", context), fail: (e) => s.fail(e) });
