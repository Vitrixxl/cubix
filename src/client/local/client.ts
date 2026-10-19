import { PUZZLES, isPuzzle, puzzleOf, puzzleId, puzzleInfo, contextOf, eventInfo, matchesPractice, solveModeOf, scrambleTypeOf, normalizeScrambleType, validContext, type PuzzleInput, type PracticeFilter } from "../../shared/puzzles";
import type { ImportedSolve } from "../lib/timerImport";
import { readSolution, SOLUTION_MAX } from "../lib/solution";
import { cleanSplits } from "../lib/phases";
import { ApiError, createApiClient, type AddSolveBody, type LiveOutput } from "../api-client";
import type { AuthDto, UserDto, SessionDto, SolveDto, SessionMode, Penalty, LearnedCaseDto, LearningGroupOrder, LearningGroupOrderDto } from "../../shared/types";
import { isLearningTrack, learningCases, learningKey, LEARNING_TRACKS, orderedGroups, type LearningTrack } from "../lib/dailyLearning";
import { cases, sets } from "./catalog";
import { history, profile, caseStats, chronological } from "./stats";
import { achievements } from "../lib/achievements";
import { dayKey } from "../lib/profile";
import { sessionSummaries } from "../lib/sessions";
import { PROFILE_KEY, journeyProfile, validJourneyEntry, withoutRetired, type Journey, type JourneyEntryDto } from "../lib/journey";
import { resultFields } from "../lib/format";

/** A solve's Fewest Moves and Multi-Blind fields as the API takes them. */
const resultBody = (s: SolveDto) => ({ ...(s.moves != null ? { moves:s.moves } : {}), ...(s.cubes_attempted != null ? { cubesSolved:s.cubes_solved ?? 0, cubesAttempted:s.cubes_attempted } : {}) });

type Remote = ReturnType<typeof createApiClient>;
type Session = SessionDto & { serverId?: number };
type Solve = SolveDto & { serverId?: number; deleted?: boolean };
type Operation = { id: string; kind: "session" | "session-name" | "solve" | "penalty" | "comment" | "solution" | "delete" | "learned" | "learning-order" | "journey"; localId: number; body: any; createdAt: string; error?: string };
interface Workspace { version: 1; /** The mark of this written workspace, which its journal's entries carry (see `append`). */ base?: string; normalScrambles?: true; sessions: Record<number, Session>; solves: Record<number, Solve>; learned: Record<string, boolean>; /** The algorithms each learned case was learned with, when some were chosen. */ learnedAlgs?: Record<string, string[]>; /** Before: a single one. */ learnedAlg?: Record<string, string>; groupOrder: LearningGroupOrder; journey: Journey; outbox: Operation[]; cursor: number }
export interface SyncStatus { state: "local" | "syncing" | "synced" | "offline" | "signin" | "error"; pending: number; error?: string }
const PREFIX = "cubix.local.v1:";
/** Learning marks were device preferences before they joined the synchronized workspace. */
const LEGACY_LEARNED_KEY = "cubix.algs.learnedCaseIds";
const GUEST: UserDto = { id: "local-guest", username: "Guest", isGuest: true, createdAt: "1970-01-01T00:00:00.000Z" };
const empty = (): Workspace => ({ version:1, normalScrambles:true, sessions:{}, solves:{}, learned:{}, groupOrder:{}, journey:{}, outbox:[], cursor:0 });
const newId = () => -Number.parseInt(crypto.randomUUID().replaceAll("-", "").slice(0,12),16) - 1;
/** A session name as stored: trimmed, at most 60 characters; blank is none. */
const sessionTitle = (name: string | null | undefined) => name?.trim().slice(0,60) || null;
/** A change written alone, as an entry of the workspace's journal: rows set (null: removed), server IDs acknowledged,
 * operations queued and done, the pull's cursor. */
type Change = { sessions?: Record<number, Session | null>; solves?: Record<number, Solve | null>; serverIds?: { sessions?: Record<number, number>; solves?: Record<number, number> }; queued?: Operation[]; done?: string[]; cursor?: number };
/** Makes a journal entry's change again, over the workspace it followed. */
function replay(workspace: Workspace, change: Change) {
  for (const kind of ["sessions", "solves"] as const) {
    const rows: Record<number, Session | Solve> = workspace[kind];
    for (const [id, row] of Object.entries(change[kind] ?? {})) if (row) rows[+id] = row; else delete rows[+id];
    for (const [id, serverId] of Object.entries(change.serverIds?.[kind] ?? {})) if (rows[+id]) rows[+id].serverId = serverId;
  }
  const done = new Set(change.done);
  workspace.outbox = [...workspace.outbox.filter(op => !done.has(op.id)), ...change.queued ?? []];
  if (change.cursor !== undefined) workspace.cursor = change.cursor;
}
/** The catalogue of each puzzle, filtered once from the bundled one. */
const catalogs = new Map<string, { cases: typeof cases; sets: typeof sets }>();
function catalogOf(input: PuzzleInput) {
  const puzzle = puzzleId(input);
  let value = catalogs.get(puzzle);
  if (!value) catalogs.set(puzzle, value = { cases: cases.filter(c => puzzleOf(c) === puzzle), sets: sets.filter(s => puzzleOf(s) === puzzle) });
  return value;
}

/** Persist first. Network acknowledgements never determine whether a solve is saved. */
export function createLocalClient(options: {
  autoSync?: boolean;
  storage: Pick<Storage,"getItem" | "setItem" | "removeItem">;
  getToken: () => string | null; setToken: (token: string) => void; clearToken: () => void;
  remote: (token: string | null) => Remote;
  changed?: () => void; status?: (value: SyncStatus) => void;
  lock?: <T>(name: string, action: () => Promise<T>) => Promise<T>;
}) {
  const { storage } = options;
  // Stored preferences are shared by mobile and desktop. Discard obsolete cached scrambles:
  // the next Normal attempt must be generated with the event generator.
  for (const key of ["cubix.practice.typeByPuzzle", "cubix.playground.scrambleByContext"]) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    let values: Record<string, string>;
    try { values = JSON.parse(raw); } catch { continue; }
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    let changed = false;
    for (const [id, value] of Object.entries(values)) {
      if (key.endsWith("typeByPuzzle") && typeof value === "string" && value !== normalizeScrambleType(value)) { values[id] = normalizeScrambleType(value); changed = true; }
      if (key.endsWith("scrambleByContext") && /:(competition|random-moves)$/.test(id)) { delete values[id]; changed = true; }
    }
    if (changed) storage.setItem(key, JSON.stringify(values));
  }
  // The catalogue was once copied here too, megabytes the bundled one makes useless.
  for (const puzzle of PUZZLES) if (storage.getItem("cubix.catalog.v1:" + puzzle.id) !== null) storage.removeItem("cubix.catalog.v1:" + puzzle.id);
  const read = <T>(key: string, fallback: T): T => {
    const text = storage.getItem(PREFIX + key);
    if (text === null) return fallback;
    try { return JSON.parse(text) as T; } catch { throw new Error("Local data could not be read. Your saved data has been preserved."); }
  };
  const put = (key: string, text: string) => {
    try { storage.setItem(PREFIX + key, text); }
    catch { throw new Error("Your device storage is full or unavailable. This change could not be saved."); }
  };
  const write = (key: string, value: unknown) => put(key, JSON.stringify(value));
  /** The account signed in (a guest otherwise), parsed again only when its stored text changes. */
  let signedIn: { text: string | null; value: UserDto } | undefined;
  const current = () => {
    const text = storage.getItem(PREFIX + "user");
    if (signedIn?.text !== text) signedIn = { text, value: read<UserDto>("user",GUEST) };
    return signedIn.value;
  };
  const owner = () => current().isGuest ? "guest" : current().id;
  const operation = (workspace: Workspace, id: string, kind: Operation["kind"], localId: number, body: any, createdAt = new Date().toISOString()) => {
    if (id === "guest") return;
    // Only the latest learning mark of a case needs to reach the server.
    if (kind === "learned") workspace.outbox = workspace.outbox.filter(op => !(op.kind === "learned" && !op.error && op.body.caseId === body.caseId));
    if (kind === "learning-order") workspace.outbox = workspace.outbox.filter(op => !(op.kind === kind && op.body.track === body.track));
    if (kind === "journey") workspace.outbox = workspace.outbox.filter(op => !(op.kind === kind && op.body.key === body.key));
    workspace.outbox.push({ id:crypto.randomUUID(), kind, localId, body, createdAt });
  };
  /* The parsed workspace stays in memory: a long history is megabytes of JSON, and every screen reads it several
   * times. A small revision written beside it on each save tells whether another client sharing the storage (a tab,
   * a reopened app) changed it since. `generation` numbers each state for the reads derived from it.
   * Writing those megabytes again at each solve would be as slow: a frequent change (a solve, an acknowledgement, a
   * pull) is written alone, as the next entry of the workspace's journal (`append`, keys `workspace:<id>/<n>`), replayed
   * over it when it is read. The whole workspace is written again (`save`) by the other changes, once its journal is
   * long and when it is read with one. Entries carry the workspace's mark (`base`): those of an older one, left by a
   * stop between the two writes, are never replayed. */
  let cached: { id: string; revision: string; workspace: Workspace; entries: number; bytes: number } | undefined;
  let generation = 0;
  /** The last change written to the journal, with the generation it made (see `ordered`). */
  let journaled: { generation: number; change: Change } | undefined;
  const cachedWorkspace = () => cached?.workspace;
  const revisionKey = (id: string) => PREFIX + "revision:" + id;
  const journalKey = (id: string, n: number) => "workspace:" + id + "/" + n;
  const remember = (id: string, workspace: Workspace, entries = 0, bytes = 0) => {
    const revision = crypto.randomUUID();
    storage.setItem(revisionKey(id), revision);
    cached = { id, revision, workspace, entries, bytes }; generation++;
  };
  /** The journal, held by the workspace written: an entry that stays (a failed removal) is never replayed. */
  const dropJournal = (id: string) => {
    try { for (let n = 0; storage.getItem(PREFIX + journalKey(id,n)) !== null; n++) storage.removeItem(PREFIX + journalKey(id,n)); } catch { /* Of an older workspace. */ }
  };
  const save = (id: string, value: Workspace) => {
    const base = crypto.randomUUID();
    try { write("workspace:" + id,{ ...value, base }); value.base = base; dropJournal(id); remember(id, value); }
    catch (error) { cached = undefined; generation++; throw error; }
  };
  /** Writes `change`, already made to the workspace in memory, alone: the whole workspace once the journal is long. */
  const append = (id: string, workspace: Workspace, change: Change) => {
    const journal = cached?.id === id && cached.workspace === workspace && workspace.base && cached.entries < 200 ? cached : undefined;
    if (!journal) return save(id, workspace);
    const text = JSON.stringify({ base:workspace.base, ...change });
    if (journal.bytes + text.length > 1e6) return save(id, workspace);
    try { put(journalKey(id,journal.entries), text); remember(id, workspace, journal.entries + 1, journal.bytes + text.length); }
    catch (error) { cached = undefined; generation++; throw error; }
    journaled = { generation, change };
  };
  const data = (id = owner()) => {
    if (cached?.id === id && storage.getItem(revisionKey(id)) === cached.revision) return cached.workspace;
    cached = undefined;
    const stored = read<(Workspace & { cache?: unknown }) | null>("workspace:" + id,null);
    const workspace: Workspace & { cache?: unknown } = stored ?? empty();
    // The changes journaled since, then the workspace written with them; one that cannot be is read again next time.
    let replayed = false, kept = true;
    for (let n = 0; workspace.base; n++) {
      const entry = read<(Change & { base?: string }) | null>(journalKey(id,n),null);
      if (!entry || entry.base !== workspace.base) break;
      replay(workspace, entry); replayed = true;
    }
    if (replayed) try { save(id, workspace); } catch { kept = false; }
    workspace.learned ??= {};
    if (workspace.learnedAlg) { workspace.learnedAlgs = { ...Object.fromEntries(Object.entries(workspace.learnedAlg).map(([id, alg]) => [id, [alg]])), ...workspace.learnedAlgs }; delete workspace.learnedAlg; save(id, workspace); }
    if (!workspace.journey) { workspace.journey = {}; workspace.cursor = 0; save(id, workspace); }
    // Personal goals are gone: drop the ones kept here and their changes still waiting to be sent.
    if (Object.keys(workspace.journey).some(key => key !== PROFILE_KEY) || workspace.outbox.some(op => op.kind === "journey" && op.body.key !== PROFILE_KEY)) {
      workspace.journey = workspace.journey.profile ? { profile: workspace.journey.profile } : {};
      workspace.outbox = workspace.outbox.filter(op => op.kind !== "journey" || op.body.key === PROFILE_KEY);
      save(id, workspace);
    }
    if (!stored?.groupOrder) {
      workspace.groupOrder = {};
      // Old clients advanced past order events they could not consume; replay once on upgrade.
      workspace.cursor = 0;
      // Seed once per workspace. A device upgraded later cannot overwrite an order already online.
      for (const key of id === "guest" ? [learningKey("guest"), learningKey(GUEST.id)] : [learningKey(id)]) {
        let legacy: unknown;
        try { legacy = JSON.parse(storage.getItem(key) ?? "null")?.groupOrder; } catch { continue; }
        for (const track of LEARNING_TRACKS) {
          const saved = (legacy as LearningGroupOrder | null)?.[track];
          if (!Array.isArray(saved) || !saved.some(g => typeof g === "string" && learningCases(cases,track).some(c => c.group === g))) continue;
          const groups = orderedGroups(learningCases(cases,track),saved);
          workspace.groupOrder[track] = groups;
          operation(workspace,id,"learning-order",0,{ track, groups, onlyIfMissing:true });
        }
      }
      save(id,workspace);
    }
    if (!workspace.normalScrambles) {
      for (const row of [...Object.values(workspace.sessions), ...Object.values(workspace.solves)]) row.scramble_type = scrambleTypeOf(row);
      // Keep operation IDs: retries of a committed upload must remain idempotent.
      for (const op of workspace.outbox) if (typeof op.body.scrambleType === "string") op.body.scrambleType = normalizeScrambleType(op.body.scrambleType);
      workspace.normalScrambles = true;
      save(id, workspace);
    }
    // Retired social caches (friends, conversations) are dropped from older workspaces.
    if (workspace.cache !== undefined) { delete workspace.cache; workspace.outbox = workspace.outbox.filter(op => !["bio","message"].includes(op.kind)); save(id,workspace); }
    const profile = workspace.journey.profile;
    if (profile && JSON.stringify(withoutRetired(profile)) !== JSON.stringify(profile)) { workspace.journey.profile = withoutRetired(profile) as typeof profile; save(id,workspace); }
    // Puzzles the app no longer has: their sessions and solves leave this device; the server keeps its copy untouched.
    const retired = (row: SessionDto | SolveDto) => !isPuzzle(puzzleOf(row));
    if ([...Object.values(workspace.sessions), ...Object.values(workspace.solves)].some(retired)) {
      const gone = new Set<number>();
      for (const rows of [workspace.sessions, workspace.solves] as Record<number, SessionDto | SolveDto>[])
        for (const row of Object.values(rows)) if (retired(row)) { gone.add(row.id); delete rows[row.id]; }
      workspace.outbox = workspace.outbox.filter(op => !gone.has(op.localId) && !gone.has(op.body?.sessionId));
      save(id,workspace);
    }
    const legacyText = storage.getItem(LEGACY_LEARNED_KEY);
    if (legacyText !== null) {
      // One-time import of the pre-sync device preference; a signed-in account uploads it too.
      let legacy: unknown = [];
      try { legacy = JSON.parse(legacyText); } catch { legacy = []; }
      for (const caseId of Array.isArray(legacy) ? legacy.filter((v): v is string => typeof v === "string" && cases.some(c => c.id === v)) : []) {
        workspace.learned[caseId] = true;
        operation(workspace,id,"learned",0,{ caseId, learned:true });
      }
      save(id,workspace);
      // Imported once: other workspaces on this device receive the marks through the guest import.
      storage.removeItem(LEGACY_LEARNED_KEY);
    }
    if (kept && cachedWorkspace() !== workspace) try { remember(id, workspace); } catch { /* Read again next time. */ }
    return workspace;
  };
  const lock = <T>(name: string, action: () => Promise<T>) => options.lock ? options.lock(name,action) : action();
  /** `entry` names what the action changed, for the journal: undefined writes the whole workspace, null nothing. */
  const edit = <T>(id: string, action: (workspace: Workspace) => T, entry?: (result: T, workspace: Workspace) => Change | null | undefined) => lock("cubix-local",async () => {
    const workspace = data(id);
    let result: T, change: Change | null | undefined;
    // A failed change may have half-modified the object in memory: the stored workspace stays the truth.
    try { result = action(workspace); change = entry?.(result, workspace); } catch (error) { cached = undefined; generation++; throw error; }
    if (change) append(id,workspace,change); else if (change === undefined) save(id,workspace);
    return result;
  });
  /** The journal entry of a change to one solve: the solve, and its operation, queued last (none for a guest). */
  const solveEntry = (solve: Solve, workspace: Workspace): Change => ({ solves: { [solve.id]: solve }, queued: workspace.outbox.slice(-1).filter(op => op.localId === solve.id) });
  /** Reads derived from the workspace, kept until it changes: screens ask again for unchanged figures. */
  let memoGeneration = -1, memo = new Map<string, unknown>();
  const derived = <T>(key: string, compute: () => T): T => {
    // Reading first notices a change made by another client sharing the storage.
    data();
    if (memoGeneration !== generation) { memo = new Map(); memoGeneration = generation; }
    key = owner() + "|" + key;
    if (!memo.has(key)) memo.set(key, compute());
    return memo.get(key) as T;
  };
  let syncing: Promise<void> | null = null;
  let reconnecting: Promise<void> | null = null;
  type Connection = ReturnType<Remote["connectLive"]>;
  let live: { connection: Connection; id: string; token: string; user: UserDto; needsPull: boolean } | undefined;
  let receiving: Promise<void> = Promise.resolve();
  const transport = () => live && live.id === owner() && live.token === options.getToken() && live.connection.ws.readyState === 1 ? live : undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let status: SyncStatus = { state: current().isGuest ? "local" : "offline", pending:data().outbox.length };
  const report = (state: SyncStatus["state"], error?: string) => {
    status = { state, pending: data().outbox.length, ...(error ? {error} : {}) }; options.status?.(status);
  };
  const notify = () => options.changed?.();
  const schedule = () => {
    if (stopped || current().isGuest) { report("local"); return; }
    if (options.autoSync === false) return;
    if (!scheduled) scheduled = setTimeout(() => { scheduled = undefined; void sync(); },250);
  };
  const learnedIds = (workspace = data()) => Object.keys(workspace.learned).filter(id => workspace.learned[id]).sort();
  const liveSolves = (workspace = data()) => Object.values(workspace.solves).filter(s => !s.deleted);
  const sessionServerId = (workspace: Workspace, id: number | null | undefined) => id == null ? null : workspace.sessions[id]?.serverId ?? (id > 0 ? id : undefined);
  const solveServerId = (workspace: Workspace, id: number) => workspace.solves[id]?.serverId ?? (id > 0 ? id : undefined);

  async function importGuest(user: UserDto) {
    await lock("cubix-local",async () => {
      const guest = data("guest"), account = data(user.id);
      // Stable local IDs make a repeated import safe even if the app closes between writes.
      for (const session of Object.values(guest.sessions)) if (!account.sessions[session.id]) {
        account.sessions[session.id] = { ...session, serverId:undefined };
        operation(account,user.id,"session",session.id,{ mode:session.mode, caseIds:session.case_ids, ...(session.name ? { name:session.name } : {}), ...contextOf(session) },session.created_at);
      }
      for (const solve of liveSolves(guest)) if (!account.solves[solve.id]) {
        account.solves[solve.id] = { ...solve, serverId:undefined };
        operation(account,user.id,"solve",solve.id,{ sessionId:solve.session_id, caseId:solve.case_id, timeMs:solve.time_ms, penalty:solve.penalty, scramble:solve.scramble, comment:solve.comment ?? null, ...(solve.solution ? { solution:solve.solution } : {}), ...(solve.memo_ms != null ? { memoMs:solve.memo_ms } : {}), ...(solve.splits ? { splits:solve.splits } : {}), ...resultBody(solve), ...contextOf(solve) },solve.created_at);
      }
      for (const caseId of learnedIds(guest)) if (!account.learned[caseId]) {
        account.learned[caseId] = true;
        operation(account,user.id,"learned",0,{ caseId, learned:true });
      }
      for (const track of LEARNING_TRACKS) if (guest.groupOrder[track] && !account.groupOrder[track]) {
        account.groupOrder[track] = guest.groupOrder[track];
        operation(account,user.id,"learning-order",0,{ track, groups:guest.groupOrder[track], onlyIfMissing:true });
      }
      save(user.id,account); save("guest",empty());
    });
  }
  async function authenticate(result: AuthDto) {
    if (result.user.isGuest) throw new Error("Sign in with a registered account.");
    await importGuest(result.user);
    write("user",result.user); options.setToken(result.token); notify(); schedule();
    return result;
  }

  async function merge(id: string, changes: Awaited<ReturnType<Remote["syncPull"]>>["changes"], cursor: number) {
    await edit(id, workspace => {
      if (cursor < workspace.cursor) return null;
      // Rows go to the journal; a learning mark, an order, a profile entry or an upload dropped rewrite the workspace.
      const entry = { sessions: {} as Record<number, Session | null>, solves: {} as Record<number, Solve | null>, cursor };
      let whole = false, touched = false;
      const dirty = new Set(workspace.outbox.map(op => op.kind === "learned" ? `learned:${op.body.caseId}` : `${op.kind === "session" || op.kind === "session-name" ? "sessions" : "solves"}:${op.localId}`));
      // Local IDs by server ID, built once: a first pull brings thousands of rows.
      const byServer = (rows: Record<number, Session | Solve>) => new Map(Object.values(rows).flatMap(r => r.serverId === undefined ? [] : [[r.serverId, r.id] as const]));
      const sessionIds = byServer(workspace.sessions), solveIds = byServer(workspace.solves);
      for (const change of [...changes].sort((a,b) => Number(a.kind === "solves") - Number(b.kind === "solves"))) {
        if (change.kind === "personal_entries") {
          const row = change.value ? { ...change.value as JourneyEntryDto, value:withoutRetired((change.value as JourneyEntryDto).value) as JourneyEntryDto["value"] } : null;
          if (!row || !validJourneyEntry(row.key, row.value) || workspace.outbox.some(op => op.kind === "journey" && op.body.key === row.key)) continue;
          workspace.journey[row.key] = row.value; whole = true;
        } else if (change.kind === "learning_group_orders") {
          const row = change.value as LearningGroupOrderDto | null;
          if (!row || !isLearningTrack(row.track) || workspace.outbox.some(op => op.kind === "learning-order" && op.body.track === row.track)) continue;
          workspace.groupOrder[row.track] = orderedGroups(learningCases(cases,row.track),row.groups); whole = true;
        } else if (change.kind === "learned_cases") {
          // A pending local mark wins until it is uploaded; the server then orders both edits.
          const row = change.value as LearnedCaseDto | null;
          if (!row || dirty.has(`learned:${row.case_id}`)) continue;
          if (row.learned) workspace.learned[row.case_id] = true; else delete workspace.learned[row.case_id];
          const algs = row.algs?.length ? row.algs : row.alg ? [row.alg] : [];
          workspace.learnedAlgs ??= {};
          if (row.learned && algs.length) workspace.learnedAlgs[row.case_id] = algs; else delete workspace.learnedAlgs[row.case_id];
          whole = true;
        } else if (change.kind === "sessions") {
          const localId = sessionIds.get(change.id) ?? (id === "guest" ? newId() : change.id);
          if (dirty.has(`sessions:${localId}`)) continue;
          if (!change.value || !isPuzzle(puzzleOf(change.value as SessionDto))) { delete workspace.sessions[localId]; sessionIds.delete(change.id); }
          else { workspace.sessions[localId] = { ...change.value as SessionDto, scramble_type:scrambleTypeOf(change.value as SessionDto), id:localId, serverId:change.id }; sessionIds.set(change.id, localId); }
          entry.sessions[localId] = workspace.sessions[localId] ?? null; touched = true;
        } else if (change.kind === "solves") {
          const localId = solveIds.get(change.id) ?? (id === "guest" ? newId() : change.id);
          // A remote deletion wins even over an edit queued locally but not uploaded yet.
          if (!change.value || !isPuzzle(puzzleOf(change.value as SolveDto))) {
            delete workspace.solves[localId]; solveIds.delete(change.id);
            const pending = workspace.outbox.length;
            workspace.outbox = workspace.outbox.filter(op => !(op.localId === localId && ["penalty", "comment", "solution", "delete"].includes(op.kind)));
            if (workspace.outbox.length !== pending) whole = true;
            entry.solves[localId] = null; touched = true;
          }
          else {
            if (dirty.has(`solves:${localId}`)) continue;
            const row = change.value as SolveDto;
            const sid = (row.session_id == null ? undefined : sessionIds.get(row.session_id)) ?? row.session_id;
            // A server that does not keep memorisation times, splits or results yet leaves the ones recorded here.
            const here = workspace.solves[localId], memo = row.memo_ms ?? here?.memo_ms, splits = row.splits ?? here?.splits;
            // Fewest Moves and Multi-Blind results alike.
            const result = row.moves != null || row.cubes_attempted != null || !here ? {} : { ...(here.moves != null ? { moves:here.moves } : {}), ...(here.cubes_attempted != null ? { cubes_solved:here.cubes_solved, cubes_attempted:here.cubes_attempted } : {}) };
            workspace.solves[localId] = { ...row, ...(memo != null ? { memo_ms:memo } : {}), ...(splits ? { splits } : {}), ...result, scramble_type:scrambleTypeOf(row), id:localId, session_id:sid, serverId:change.id };
            solveIds.set(change.id, localId);
            entry.solves[localId] = workspace.solves[localId]; touched = true;
          }
        }
      }
      const moved = cursor !== workspace.cursor;
      workspace.cursor = cursor;
      return whole ? undefined : touched || moved ? entry : null;
    }, entry => entry);
  }

  async function synchronize() {
    const user = current(), id = owner(), token = options.getToken();
    if (user.isGuest) { report("local"); return; }
    if (!token) { report("signin"); return; }
    await lock("cubix-sync:" + id,async () => {
      const remote = options.remote(token);
      const socket = transport();
      const stillCurrent = () => owner() === id && options.getToken() === token && !stopped;
      if (!stillCurrent()) return;
      report("syncing");
      let activeOperation: string | undefined;
      try {
        const verified = socket ? socket.user : await remote.me();
        if (verified.id !== user.id || verified.isGuest) throw new ApiError(401,"Sign in to synchronize this account.");
        if (!stillCurrent()) return;
        write("user",verified);
        // New solves go up a hundred at a time (an import of thousands); a batch the server refuses is retried one by
        // one, so the operation at fault is the only one marked.
        let batching = true;
        while (stillCurrent()) {
          const workspace = data(id), op = workspace.outbox.find(op => !op.error);
          if (!op) break;
          if (batching && op.kind === "solve") {
            // The first hundred, found without going through the whole outbox.
            const batch: Operation[] = [];
            for (const o of workspace.outbox) if (!o.error && o.kind === "solve" && sessionServerId(workspace,o.body.sessionId) !== undefined && batch.push(o) === 100) break;
            if (batch.length > 1 && batch[0] === op) {
              const pushed = batch.map(o => ({ id:o.id, method:"POST", path:"solves", body:{ ...o.body, sessionId:sessionServerId(workspace,o.body.sessionId) }, createdAt:o.createdAt }));
              let results: { value: any }[];
              try {
                results = (await (socket?.connection ?? remote).syncPush(pushed)).results;
              } catch (error) {
                if (error instanceof ApiError && error.status < 500 && error.status !== 429 && error.status !== 401) { batching = false; continue; }
                throw error;
              }
              await edit(id, latest => {
                const serverIds: Record<number, number> = {}, done = new Set(batch.map(o => o.id));
                batch.forEach((o,i) => { if (latest.solves[o.localId]) latest.solves[o.localId].serverId = serverIds[o.localId] = results[i]!.value.id; });
                // Usually the outbox's first operations: taken off its front rather than filtered out of it.
                let front = 0;
                while (front < done.size && done.has(latest.outbox[front]?.id ?? "")) front++;
                if (front === done.size) latest.outbox.splice(0,front); else latest.outbox = latest.outbox.filter(item => !done.has(item.id));
                return { serverIds: { solves: serverIds }, done: [...done] };
              }, entry => entry);
              continue;
            }
          }
          activeOperation = op.id;
          let path = op.kind === "session" || op.kind === "session-name" ? "sessions" : op.kind === "learned" ? "learned" : op.kind === "learning-order" ? "learning-group-order" : op.kind === "journey" ? "journey" : "solves";
          const body = { ...op.body };
          if (op.kind === "solve") {
            const sid = sessionServerId(workspace,body.sessionId);
            if (sid === undefined) throw new Error("The session is waiting to synchronize.");
            body.sessionId = sid;
          }
          if (op.kind === "session-name") {
            const serverId = sessionServerId(workspace,op.localId);
            if (!serverId) throw new Error("The session is waiting to synchronize.");
            path += "/" + serverId;
          }
          if (op.kind === "penalty" || op.kind === "comment" || op.kind === "solution" || op.kind === "delete") {
            const serverId = solveServerId(workspace,op.localId);
            if (!serverId) throw new Error("The solve is waiting to synchronize.");
            path += "/" + serverId;
          }
          const method = op.kind === "delete" ? "DELETE" : op.kind === "learned" || op.kind === "learning-order" || op.kind === "journey" ? "PUT" : op.kind === "penalty" || op.kind === "comment" || op.kind === "solution" || op.kind === "session-name" ? "PATCH" : "POST";
          const result: any = (await (socket?.connection ?? remote).syncPush([{ id:op.id, method, path, body, ...(method === "POST" ? {createdAt:op.createdAt} : {}) }])).results[0].value;
          // Write only the acknowledgement; preserve edits made while the request was in flight.
          await edit(id, latest => {
            const entry: Change = { done:[op.id] };
            if (op.kind === "session" && latest.sessions[op.localId]) entry.serverIds = { sessions: { [op.localId]: latest.sessions[op.localId].serverId = result.id } };
            if (op.kind === "solve" && latest.solves[op.localId]) entry.serverIds = { solves: { [op.localId]: latest.solves[op.localId].serverId = result.id } };
            if (op.kind === "delete") { delete latest.solves[op.localId]; entry.solves = { [op.localId]: null }; }
            const order = op.kind === "learning-order" && result && !latest.outbox.some(item => item.kind === op.kind && item.body.track === op.body.track && item.id !== op.id);
            if (order) latest.groupOrder[result.track as LearningTrack] = orderedGroups(learningCases(cases,result.track),result.groups);
            latest.outbox = latest.outbox.filter(item => item.id !== op.id);
            // An order the server settled rewrites the workspace.
            return order ? undefined : entry;
          }, entry => entry);
        }
        activeOperation = undefined;
        // Pages are merged by thousands: each merge rewrites the whole workspace, megabytes for a long history.
        let cursor = data(id).cursor, batch: Awaited<ReturnType<Remote["syncPull"]>>["changes"] = [];
        while (stillCurrent() && (!socket || socket.needsPull)) {
          const page = await (socket?.connection ?? remote).syncPull(cursor);
          batch.push(...page.changes); cursor = page.cursor;
          if (page.more && batch.length < 5000) continue;
          await merge(id,batch,cursor); batch = [];
          if (!page.more) break;
        }
        if (socket) socket.needsPull = false;
        if (stillCurrent()) {
          const pending = data(id).outbox, failed = pending.find(op => op.error);
          report(failed ? "error" : pending.length ? "syncing" : "synced",failed?.error); notify();
          if (pending.some(op => !op.error)) schedule();
        }
      } catch (error) {
        if (!stillCurrent()) return;
        if (error instanceof ApiError && error.status === 401) { options.clearToken(); report("signin"); }
        else if (error instanceof ApiError && error.status < 500 && error.status !== 429) {
          if (activeOperation) await edit(id,workspace => { const op = workspace.outbox.find(op => op.id === activeOperation); if (op) op.error = error.message; });
          report("error",error.message);
          if (data(id).outbox.some(op => !op.error)) schedule();
        }
        else report("offline");
      }
    });
  }
  function sync(): Promise<void> {
    if (syncing) return syncing;
    syncing = synchronize().catch(error => report("error",(error as Error).message)).finally(() => { syncing = null; });
    return syncing;
  }

  /** A restored connection must refresh even when the server cursor has not changed.
   * Wait out a request started before the reconnect, which may still fail offline. */
  function reconnected(): Promise<void> {
    if (reconnecting) return reconnecting;
    const id = owner(), token = options.getToken();
    reconnecting = (async () => {
      if (syncing) await syncing;
      if (!stopped && owner() === id && options.getToken() === token) await sync();
    })().finally(() => { reconnecting = null; });
    return reconnecting;
  }

  /** Serialized behind upload acknowledgements, so echoed server IDs cannot duplicate offline rows. */
  function receiveLive(connection: Connection, message: LiveOutput): Promise<void> {
    if (message.channel === "live" && message.type === "ready") {
      if (message.user && message.user.id === owner() && !message.user.isGuest && options.getToken()) {
        live = { connection, id: owner(), token: options.getToken()!, user: message.user, needsPull: message.cursor === undefined || message.cursor > data().cursor };
      }
      return reconnected();
    }
    if (message.channel !== "sync" || message.type !== "changes") return Promise.resolve();
    const active = transport();
    if (!active || active.connection !== connection) return Promise.resolve();
    receiving = receiving.then(async () => {
      if (syncing) await syncing;
      if (stopped || transport() !== active) return;
      const cursor = data(active.id).cursor;
      if (message.cursor <= cursor) return;
      // A gap can follow an interrupted catch-up or a failed local write. Recover through the socket.
      if (message.after > cursor) { active.needsPull = true; await sync(); return; }
      await merge(active.id, message.changes, message.cursor);
      if (stopped || transport() !== active) return;
      const pending = data(active.id).outbox, failed = pending.find(op => op.error);
      report(failed ? "error" : pending.length ? "syncing" : "synced", failed?.error);
      notify();
    }).catch(error => { if (transport() === active && !stopped) { active.needsPull = true; report("error", (error as Error).message); } });
    return receiving;
  }
  const cursorChanged = (cursor?: number) => cursor !== undefined && cursor <= data().cursor ? Promise.resolve() : sync();

  async function localMutation<T>(change: (workspace: Workspace, id: string) => T, entry?: (result: T, workspace: Workspace) => Change): Promise<T> {
    const id = owner();
    let value: T;
    try { value = await edit(id,workspace => change(workspace,id),entry); }
    catch (error) { report("error",(error as Error).message); throw error; }
    notify(); schedule(); return value;
  }

  /** Every solve kept, oldest first: sorted once per change rather than by each read. A change journaled just after the
   * last sort keeps them when it touches no solve (an acknowledgement of the latest one included: a server ID only
   * orders solves of one date), and adds a solve later than the latest at the end. */
  let sorted: { workspace: Workspace; generation: number; rows: Solve[] } | undefined;
  const ordered = () => derived("ordered", () => {
    const workspace = data(), change = sorted?.workspace === workspace && sorted.generation === generation - 1 && journaled?.generation === generation ? journaled.change : undefined;
    const before = sorted?.rows ?? [], last = before.at(-1), added = Object.values(change?.solves ?? {}), acked = Object.keys(change?.serverIds?.solves ?? {});
    const placed = !!change && acked.every(id => Number(id) === last?.id && before.at(-2)?.created_at !== last?.created_at), next = added.length === 1 ? added[0] : undefined;
    const rows = placed && !added.length ? before
      : placed && next && !next.deleted && (!last || last.created_at < next.created_at) ? [...before, next]
      : liveSolves(workspace).sort(chronological);
    sorted = { workspace, generation, rows };
    return rows;
  });
  const args = (...values: unknown[]) => JSON.stringify(values);
  /** The solves of a practice context and mode (timer or training), oldest first. */
  const practised = (mode: SessionMode, cubeSize: PuzzleInput, filter: PracticeFilter) => derived("solves" + args(mode, puzzleId(cubeSize), filter.solveMode, filter.scrambleType), () => {
    const workspace = data();
    return ordered().filter(s => matchesPractice(s,cubeSize,filter) && (workspace.sessions[s.session_id ?? 0]?.mode ?? (s.case_id ? "training" : "playground")) === mode);
  });
  /** Synchronous reads of local data, for screens that must render without any loading state. Unchanged data gives
   * back the very same objects, so screens can tell nothing changed. */
  const reads = {
    journey: () => data().journey,
    catalog: (cubeSize: PuzzleInput = 3) => catalogOf(cubeSize),
    /** The solves of a practice context and mode, oldest first: the very same array while they are unchanged. */
    solves: (mode: SessionMode, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => practised(mode, cubeSize, filter),
    /** Those of one session. */
    session: (sessionId: number, mode: SessionMode, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => derived("session" + args(sessionId, mode, puzzleId(cubeSize), filter.solveMode, filter.scrambleType), () =>
      practised(mode, cubeSize, filter).filter(s => s.session_id === sessionId)),
    stats: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => derived("stats" + args(puzzleId(cubeSize), filter.solveMode), () => caseStats(ordered(),cubeSize,filter)),
    caseHistory: (caseId: string, filter: PracticeFilter = {}) => derived("case" + args(caseId, filter.solveMode), () =>
      history(caseId,ordered().filter(s => s.case_id === caseId && solveModeOf(s) === (filter.solveMode ?? "standard")))),
    profile: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => derived("profile" + args(puzzleId(cubeSize), filter.solveMode, filter.scrambleType, current()), () =>
      profile(current(),ordered(),cubeSize,filter,journeyProfile(data().journey)?.bests,data().sessions)),
    /** The timer sessions of a practice context, newest first, with their figures; started ones without solves too. */
    sessions: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => derived("sessions" + args(puzzleId(cubeSize), filter.solveMode, filter.scrambleType), () => {
      const workspace = data(), own = Object.values(workspace.sessions).filter(s => s.mode === "playground" && matchesPractice(s,cubeSize,filter));
      return sessionSummaries(ordered().filter(s => !s.case_id && matchesPractice(s,cubeSize,filter)), workspace.sessions, own.map(s => s.id)).reverse();
    }),
    achievements: () => derived("achievements", () => achievements(ordered(), learnedIds(), { cases, sets })),
    /** The days in a row with a solve up to today, or yesterday (as `streaks` counts them), for the reminders: read again
     * each day, from the latest solve back to the first day without one. */
    streak: () => derived("streak" + dayKey(new Date()), () => {
      const rows = ordered(), now = new Date(), day = new Date(now.getFullYear(), now.getMonth(), now.getDate()), today = dayKey(day);
      let expected = today, days = 0, solvedToday = false;
      for (let i = rows.length - 1; i >= 0; i--) {
        const key = dayKey(new Date(rows[i]!.created_at));
        if (key > expected) continue;
        // No solve today: the streak may still run up to yesterday.
        if (key < expected && expected === today && !solvedToday) { day.setDate(day.getDate() - 1); expected = dayKey(day); }
        if (key !== expected) break;
        solvedToday ||= key === today; days++;
        day.setDate(day.getDate() - 1); expected = dayKey(day);
      }
      return { current: days, today: solvedToday };
    }),
    /** A solve of any session, by its id. */
    solve: (id: number) => { const solve = data().solves[id]; return solve && !solve.deleted ? solve : null; },
  };

  const api = {
    ...options.remote(options.getToken()),
    me: async () => current(),
    /** Save the setup in one local transaction. */
    updateJourney: async (changes: Journey) => localMutation((workspace, id) => {
      if (Object.entries(changes).some(([key, value]) => !validJourneyEntry(key, value))) throw new Error("Invalid profile.");
      const next = { ...workspace.journey, ...changes };
      workspace.journey = next;
      for (const [key, value] of Object.entries(changes)) operation(workspace, id, "journey", 0, { key, value });
      return next;
    }),
    cases: async (cubeSize: PuzzleInput = 3) => reads.catalog(cubeSize).cases,
    sets: async (cubeSize: PuzzleInput = 3) => reads.catalog(cubeSize).sets,
    authConfig: () => options.remote(null).authConfig(),
    google: async (credential: string) => authenticate(await options.remote(null).google(credential)),
    devLogin: async (username: string) => authenticate(await options.remote(null).devLogin(username)),
    /** The account's data, as a file for its owner (GDPR portability): what this device holds, which the server mirrors. */
    exportData: async () => {
      const user = current(), workspace = data();
      const live = (rows: Record<number, object>) => Object.values(rows).filter((row: any) => !row.deleted).map(({ deleted, serverId, ...row }: any) => row);
      return {
        app: "Qbix", exportedAt: new Date().toISOString(),
        account: user.isGuest ? null : { username: user.username, createdAt: user.createdAt },
        solves: live(workspace.solves), sessions: live(workspace.sessions),
        learnedCases: Object.entries(workspace.learned).filter(([, learned]) => learned).map(([id]) => id),
        learningGroupOrder: workspace.groupOrder ?? {}, profile: workspace.journey ?? {},
      };
    },
    /** The account deleted on the server, then forgotten on this device, which goes back to a guest. */
    deleteAccount: async () => {
      const id = owner(), token = options.getToken();
      if (id === "guest" || !token) throw new Error("Sign in first.");
      await options.remote(token).deleteAccount();
      for (const key of ["workspace:" + id, "revision:" + id]) storage.removeItem(PREFIX + key);
      dropJournal(id);
      cached = undefined; generation++;
      write("user",GUEST); options.clearToken(); report("local"); notify();
      return { ok:true };
    },
    /** The account's new username, kept on this device once the server took it. Throws the server's message. */
    setUsername: async (username: string) => {
      const token = options.getToken();
      if (current().isGuest || !token) throw new Error("Sign in first.");
      const { user } = await options.remote(token).setUsername(username);
      write("user",{ ...current(), ...user }); notify();
      return user;
    },
    logout: async () => {
      const token = options.getToken();
      write("user",GUEST); options.clearToken(); report("local"); notify();
      // Local sign-out is immediate, even if the server cannot be contacted.
      if (token) void options.remote(token).logout().catch(() => {});
      return { ok:true };
    },
    latestSession: async (mode: SessionMode, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => Object.values(data().sessions).filter(s => s.mode === mode && matchesPractice(s,cubeSize,filter)).sort((a,b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    createSession: async (mode: SessionMode, caseIds: string[] = [], cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}, name?: string | null) => localMutation((workspace,id) => {
      const context = { puzzle: puzzleId(cubeSize), solveMode: filter.solveMode ?? "standard", scrambleType: normalizeScrambleType(filter.scrambleType ?? (mode === "training" ? "case" : "normal")) };
      if (!validContext(context, mode === "training") || caseIds.some(id => !cases.some(c => c.id === id && puzzleOf(c) === context.puzzle))) throw new Error("Case, cube and practice context do not match.");
      const title = sessionTitle(name);
      const session: Session = { id:newId(), cube_size:puzzleInfo(cubeSize).cubeSize, puzzle_id:context.puzzle, solve_mode:context.solveMode, scramble_type:context.scrambleType, mode, case_ids:caseIds, ...(title ? { name:title } : {}), created_at:new Date().toISOString() };
      workspace.sessions[session.id] = session;
      operation(workspace,id,"session",session.id,{mode,caseIds,...(title ? { name:title } : {}),...context},session.created_at); return session;
    }),
    /** Names a session (trimmed, at most 60 characters); an empty name gives back its day and event. Only the latest
     * name needs uploading. */
    renameSession: async (sessionId: number, name: string | null) => localMutation((workspace,id) => {
      const session = workspace.sessions[sessionId]; if (!session) throw new Error("Unknown local session.");
      const title = sessionTitle(name);
      session.name = title;
      workspace.outbox = workspace.outbox.filter(op => !(op.kind === "session-name" && !op.error && op.localId === sessionId));
      operation(workspace,id,"session-name",sessionId,{ name:title }); return session;
    }),
    /**
     * Solves from another timer (timerImport.ts), written at once with their own dates: one session per event and
     * session of the other timer, solves already here (same event, date and time) left out. They reach the server in
     * pushes of a hundred (see `synchronize`).
     */
    importSolves: async (solves: ImportedSolve[]) => localMutation((workspace,id) => {
      const key = (puzzle: string, mode: string, at: string, time: number) => `${puzzle}|${mode}|${at}|${time}`;
      const known = new Set(liveSolves(workspace).map(s => key(s.puzzle_id ?? "", s.solve_mode ?? "standard", s.created_at, s.time_ms)));
      const sessions = new Map<string, Session>();
      let imported = 0, duplicates = 0;
      for (const solve of [...solves].sort((a,b) => a.at - b.at)) {
        const info = eventInfo(solve.event);
        if (!info || !Number.isFinite(solve.at) || !Number.isFinite(solve.timeMs) || solve.timeMs < 0) continue;
        const { puzzle, solveMode } = info, at = new Date(solve.at).toISOString(), timeMs = Math.round(solve.timeMs);
        if (known.has(key(puzzle,solveMode,at,timeMs))) { duplicates++; continue; }
        known.add(key(puzzle,solveMode,at,timeMs));
        const context = { puzzle, solveMode, scrambleType: "normal" as const }, group = `${solve.event}|${solve.session ?? ""}`;
        let session = sessions.get(group);
        if (!session) {
          const name = sessionTitle(solve.sessionName ?? solve.session);
          session = { id:newId(), cube_size:puzzleInfo(puzzle).cubeSize, puzzle_id:puzzle, solve_mode:solveMode, scramble_type:"normal", mode:"playground", case_ids:[], ...(name ? { name } : {}), created_at:at };
          workspace.sessions[session.id] = session; sessions.set(group,session);
          operation(workspace,id,"session",session.id,{ mode:"playground", caseIds:[], ...(name ? { name } : {}), ...context },at);
        }
        const splits = cleanSplits(solve.splits, timeMs);
        const solution = solveMode === "fewest-moves" && solve.solution && solve.solution.length <= SOLUTION_MAX ? solve.solution : undefined;
        const row: Solve = { id:newId(), cube_size:puzzleInfo(puzzle).cubeSize, puzzle_id:puzzle, solve_mode:solveMode, scramble_type:"normal", session_id:session.id, case_id:null, time_ms:timeMs, penalty:solve.penalty, scramble:solve.scramble, comment:solve.comment?.slice(0,500) || null, ...(solution ? { solution } : {}), ...resultFields(solveMode, solve), ...(splits ? { splits } : {}), created_at:at };
        workspace.solves[row.id] = row;
        operation(workspace,id,"solve",row.id,{ sessionId:session.id, caseId:null, timeMs, penalty:row.penalty, scramble:row.scramble, comment:row.comment, ...(solution ? { solution } : {}), ...resultBody(row), ...(splits ? { splits } : {}), ...context },at);
        imported++;
      }
      return { imported, duplicates };
    }),
    addSolve: async (body: AddSolveBody) => localMutation((workspace,id) => {
      const session = body.sessionId == null ? null : workspace.sessions[body.sessionId];
      if (body.sessionId != null && !session) throw new Error("Unknown local session.");
      const c = cases.find(c => c.id === body.caseId);
      const inherited = contextOf(session ?? (c ? { ...c, case_id:c.id } : {}));
      const puzzle = body.puzzle ?? (body.cubeSize ? puzzleId(body.cubeSize) : inherited.puzzle);
      const context = { puzzle, solveMode: body.solveMode ?? inherited.solveMode, scrambleType: normalizeScrambleType(body.scrambleType ?? (session || c ? inherited.scrambleType : "normal")) };
      if (!validContext(context, !!body.caseId) || (body.cubeSize && puzzleInfo(context.puzzle).cubeSize !== body.cubeSize) || (session && JSON.stringify(contextOf(session)) !== JSON.stringify(context)) || (c && puzzleOf(c) !== context.puzzle)) throw new Error("Case, cube and practice context do not match.");
      if (session && (session.mode === "training") !== !!body.caseId) throw new Error("Case and session mode do not match.");
      if (!Number.isFinite(body.timeMs) || body.timeMs < 0) throw new Error("Invalid solve time.");
      if (body.caseId && !cases.some(c => c.id === body.caseId)) throw new Error("Unknown case.");
      // Preserve insertion order even for imports/tests producing several solves in one millisecond.
      const latest = Date.parse(ordered().at(-1)?.created_at ?? "") || 0;
      const createdAt = new Date(Math.max(Date.now(),latest+1)).toISOString();
      // A solution that cannot be read is left out: it never keeps the time from being saved.
      // Fewest Moves keeps the solution as written (WCA notation, rotations and wide turns too).
      const written = context.solveMode === "fewest-moves" && body.solution?.trim() && body.solution.length <= SOLUTION_MAX;
      const solution = written || readSolution(body.solution) ? body.solution!.trim() : undefined;
      // A memorisation outside the solve is left out the same way.
      const memo = Number.isFinite(body.memoMs) && body.memoMs! >= 0 && body.memoMs! <= body.timeMs ? Math.round(body.memoMs!) : undefined;
      const splits = cleanSplits(body.splits, body.timeMs);
      const result = resultFields(context.solveMode, body);
      const solve: Solve = { id:newId(),cube_size:puzzleInfo(context.puzzle).cubeSize,puzzle_id:context.puzzle,solve_mode:context.solveMode,scramble_type:context.scrambleType,session_id:body.sessionId ?? null,case_id:body.caseId ?? null,time_ms:Math.round(body.timeMs),penalty:body.penalty ?? "none",scramble:body.scramble ?? null,comment:body.comment?.trim() || null,...(solution ? { solution } : {}),...(memo !== undefined ? { memo_ms:memo } : {}),...result,...(splits ? { splits } : {}),created_at:createdAt };
      workspace.solves[solve.id] = solve;
      operation(workspace,id,"solve",solve.id,{...body,...context,timeMs:solve.time_ms,solution,memoMs:memo,splits,...resultBody(solve)},solve.created_at); return solve;
    }, solveEntry),
    /** The latest `limit` solves of a practice context and mode, newest first. */
    solves: async (mode: SessionMode, limit = 500, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => {
      const rows = practised(mode, cubeSize, filter);
      return rows.slice(Math.max(rows.length - limit, 0)).reverse();
    },
    // A solve changed is a new object: the desktop engine sends a session's solves again only when one of them is not
    // the very one it sent (desktop/engine/core.ts).
    setPenalty: async (solveId: number, penalty: Penalty) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      const changed = workspace.solves[solveId] = { ...solve, penalty }; operation(workspace,id,"penalty",solveId,{penalty}); return changed;
    }, solveEntry),
    /** Trimmed; an empty text clears the note. Only the latest note of a solve needs uploading. */
    setComment: async (solveId: number, comment: string | null) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      const text = comment?.trim() || null;
      if ((text ?? "").length > 500) throw new Error("Comments are limited to 500 characters.");
      const changed = workspace.solves[solveId] = { ...solve, comment:text };
      workspace.outbox = workspace.outbox.filter(op => !(op.kind === "comment" && !op.error && op.localId === solveId));
      operation(workspace,id,"comment",solveId,{comment:text}); return changed;
    }),
    /** The turns written by hand for a solve (see `lib/solution`); null clears them. Only the latest needs uploading. */
    setSolution: async (solveId: number, solution: string | null) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      const text = solution?.trim() || null;
      if ((text ?? "").length > SOLUTION_MAX) throw new Error("The solution is too long.");
      const changed = workspace.solves[solveId] = { ...solve, solution:text };
      workspace.outbox = workspace.outbox.filter(op => !(op.kind === "solution" && !op.error && op.localId === solveId));
      operation(workspace,id,"solution",solveId,{solution:text}); return changed;
    }),
    /** The link's token for a solve, once it reached the server. */
    shareSolve: async (solveId: number) => {
      const token = options.getToken();
      if (current().isGuest || !token) throw new Error("Sign in to share a solve.");
      // A solve just timed may not have reached the server yet: synchronized first.
      if (!solveServerId(data(),solveId)) await sync();
      const serverId = solveServerId(data(),solveId);
      if (!serverId) throw new Error("The solve is waiting to synchronize.");
      return (await options.remote(token).shareSolve(serverId)).token;
    },
    deleteSolve: async (solveId: number) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      solve.deleted = true; operation(workspace,id,"delete",solveId,{}); return solve;
    }, solveEntry),
    setLearningGroupOrder: async (track: LearningTrack, groups: string[]) => localMutation((workspace,id) => {
      if (!isLearningTrack(track)) throw new Error("Unknown learning track.");
      const order = orderedGroups(learningCases(cases,track),groups);
      workspace.groupOrder[track] = order;
      operation(workspace,id,"learning-order",0,{ track, groups:order });
      return order;
    }),
    learnedCases: async () => learnedIds(),
    /** Learned or not; learned with `algs`, some of the case's algorithms, records them. */
    setLearned: async (caseId: string, learned: boolean, algs?: string[] | null) => localMutation((workspace,id) => {
      const known = cases.find(c => c.id === caseId);
      if (!known) throw new Error("Unknown case.");
      const chosen = learned ? [...new Set(algs ?? [])] : [];
      if (chosen.some(alg => !known.algorithms.some((a: { alg: string }) => a.alg === alg))) throw new Error("Unknown algorithm.");
      workspace.learnedAlgs ??= {};
      if (learned) workspace.learned[caseId] = true; else delete workspace.learned[caseId];
      if (chosen.length) workspace.learnedAlgs[caseId] = chosen; else delete workspace.learnedAlgs[caseId];
      operation(workspace,id,"learned",0,{ caseId, learned, ...(chosen.length ? { algs: chosen } : {}) });
      return { caseId, learned, algs: chosen };
    }),
    /** Per case, how many players learned it and with which algorithm; nothing for a guest or offline. */
    algorithmChoices: async (caseIds: string[]): Promise<Record<string, { total: number; algs: Record<string, number> }>> => {
      const token = options.getToken();
      if (current().isGuest || !token || !caseIds.length) return {};
      try { return await options.remote(token).algorithmChoices(caseIds); } catch { return {}; }
    },
    stats: async (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => reads.stats(cubeSize,filter),
    caseHistory: async (caseId: string, filter: PracticeFilter = {}) => reads.caseHistory(caseId,filter),
    /** Only the signed-in account's own statistics exist; the username is kept for API parity. */
    profile: async (_username?: string, _signal?: AbortSignal, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => reads.profile(cubeSize,filter),
    achievements: async () => reads.achievements(),
  };
  // The live socket must always use the current credentials.
  api.connectLive = () => options.remote(options.getToken()).connectLive();

  async function restore() {
    const token = options.getToken();
    if (!token) { report(current().isGuest ? "local" : "signin"); return; }
    if (!current().isGuest) {
      const socket = transport();
      if (!socket || socket.needsPull || data().outbox.some(op => !op.error)) await sync();
      return;
    }
    // A token whose account this device does not know yet (server-side guests are gone: theirs fail).
    try {
      const user = await options.remote(token).me();
      if (options.getToken() !== token) return;
      await authenticate({user,token}); await sync();
      notify();
    } catch (error) { if (error instanceof ApiError && error.status === 401) options.clearToken(); }
  }
  return { api, read: reads, sync, restore, current, reconnected,
    receiveLive,
    liveCursor: () => data().cursor,
    disconnected: (connection: Connection) => { if (live?.connection === connection) live = undefined; },
    learned: () => learnedIds(),
    /** Whether a guest's workspace holds times or learned cases, which signing in brings to the account. */
    guestData: () => current().isGuest && (Object.values(data().solves).some(s => !s.deleted) || learnedIds().length > 0),
    learnedAlgs: () => ({ ...data().learnedAlgs }),
    learningGroupOrder: () => data().groupOrder,
    /** A live notification announced changes up to `cursor`; pull only if this device is behind. */
    remoteChanged: cursorChanged,
    retry: async () => { await edit(owner(),d => { for (const op of d.outbox) delete op.error; }); await sync(); },
    status: () => status,
    changed: () => { notify(); schedule(); },
    stop: () => { stopped = true; clearTimeout(scheduled); },
  };
}
