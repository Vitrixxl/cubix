import { LaunchSessions } from "../../../src/client/lib/launchSessions";
import { contextKey, type PracticeContext } from "../../../src/shared/puzzles";
import type { SessionMode } from "../../../src/shared/types";
import { api, local } from "../api";

/**
 * Sessions belong to this launch of the app: one per account, mode and practice context, created
 * with the first solve and never restored from an earlier launch or another device. Solves still
 * synchronize to the account and count in the profile; only the session grouping stays local.
 */
const sessions = new LaunchSessions();

const key = (mode: SessionMode, context: PracticeContext) => `${local.current()?.id ?? "guest"}:${mode}:${contextKey(context)}`;

/** The session this launch already opened for the context, if any. */
export function launchSessionId(mode: SessionMode, context: PracticeContext): number | null {
  return sessions.get(key(mode, context)) ?? null;
}

/** The launch session for the context, created on first use. */
export async function ensureLaunchSession(mode: SessionMode, context: PracticeContext, caseIds: string[] = []): Promise<number> {
  return sessions.ensure(key(mode, context), () => api.createSession(mode, caseIds, context.puzzle, { solveMode: context.solveMode, scrambleType: context.scrambleType }));
}
