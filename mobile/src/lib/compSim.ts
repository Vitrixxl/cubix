import { getDefaultStore } from "jotai";
import { compSimName, roundRecord } from "../../../src/client/lib/compSim";
import { effective } from "../../../src/client/lib/format";
import { contextKey, eventOf, roundFormat, type PracticeContext, type RoundFormat } from "../../../src/shared/puzzles";
import type { Penalty } from "../../../src/shared/types";
import { tr } from "../../../src/client/i18n";
import { api, localChanged } from "../api";
import { persisted } from "../state";
import { launchSessionId, setLaunchSession } from "./launchSession";

/**
 * The timer's competition simulation (src/client/lib/compSim), as the web's `compSim`: its context and session, the
 * session to go back to, its format, the record it is compared with, and the attempt stopped and waiting for its judge.
 * Kept on the device: the round goes on whenever the timer shows its context and session again, after a restart too.
 */
export interface Round {
  key: string;
  session: number;
  previous: number | null;
  format: RoundFormat;
  record: number | null;
  pending: { ms: number; penalty: Penalty; memo?: number } | null;
}
export const compSimAtom = persisted<Round | null>("cubix.compSim", null);
const store = getDefaultStore();

/** The round of `context`, while its session is the timer's. */
export const roundOf = (round: Round | null, context: PracticeContext) =>
  round && round.key === contextKey(context) && launchSessionId("playground", context) === round.session ? round : null;

/** Starts a round of the context's event (random scrambles) in a session of its own, named for it. */
export async function startCompSim(context: PracticeContext) {
  const format = roundFormat(eventOf(context.puzzle, context.solveMode)?.id ?? context.puzzle),
    earlier = await api.solves("playground", Infinity, context.puzzle, context),
    previous = roundOf(store.get(compSimAtom), context)?.previous ?? launchSessionId("playground", context),
    { id } = await api.createSession("playground", [], context.puzzle, { solveMode: context.solveMode, scrambleType: context.scrambleType }, tr(compSimName()));
  setLaunchSession("playground", context, id);
  store.set(compSimAtom, { key: contextKey(context), session: id, previous, format, pending: null, record: roundRecord(format, [...earlier].reverse().map(v => effective(v.time_ms, v.penalty))) });
  localChanged.emit();
}

/** Leaves the round: its attempts stay in its session, the timer goes back to the one before (a new one without). */
export async function endCompSim(context: PracticeContext, round: Round) {
  setLaunchSession("playground", context, round.previous ?? (await api.createSession("playground", [], context.puzzle, { solveMode: context.solveMode, scrambleType: context.scrambleType })).id);
  store.set(compSimAtom, null);
  localChanged.emit();
}
