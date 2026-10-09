import {createCatalogCache,evictCatalogCache} from "./catalog-cache";
import { isPuzzle, puzzleOf, puzzleId, puzzleInfo, contextOf, eventInfo, matchesPractice, solveModeOf, scrambleTypeOf, normalizeScrambleType, validContext, type PuzzleInput, type PracticeFilter } from "../../shared/puzzles";
import type { ImportedSolve } from "../lib/timerImport";
import { readSolution, SOLUTION_MAX } from "../lib/solution";
import { ApiError, createApiClient, type AddSolveBody, type LiveOutput } from "../api-client";
import type { AuthDto, UserDto, SessionDto, SolveDto, SessionMode, Penalty, LearnedCaseDto, LearningGroupOrder, LearningGroupOrderDto } from "../../shared/types";
import { isLearningTrack, learningCases, learningKey, LEARNING_TRACKS, orderedGroups, type LearningTrack } from "../lib/dailyLearning";
import { cases } from "./catalog";
import { history, profile, caseStats, chronological } from "./stats";
import { achievements } from "../lib/achievements";
import { PROFILE_KEY, journeyProfile, validJourneyEntry, withoutRetired, type Journey, type JourneyEntryDto } from "../lib/journey";

type Remote = ReturnType<typeof createApiClient>;
type Session = SessionDto & { serverId?: number };
type Solve = SolveDto & { serverId?: number; deleted?: boolean };
type Operation = { id: string; kind: "session" | "solve" | "penalty" | "comment" | "solution" | "delete" | "learned" | "learning-order" | "journey"; localId: number; body: any; createdAt: string; error?: string };
interface Workspace { version: 1; normalScrambles?: true; sessions: Record<number, Session>; solves: Record<number, Solve>; learned: Record<string, boolean>; /** The algorithms each learned case was learned with, when some were chosen. */ learnedAlgs?: Record<string, string[]>; /** Before: a single one. */ learnedAlg?: Record<string, string>; groupOrder: LearningGroupOrder; journey: Journey; outbox: Operation[]; cursor: number }
export interface SyncStatus { state: "local" | "syncing" | "synced" | "offline" | "signin" | "error"; pending: number; error?: string }
const PREFIX = "cubix.local.v1:";
/** Learning marks were device preferences before they joined the synchronized workspace. */
const LEGACY_LEARNED_KEY = "cubix.algs.learnedCaseIds";
const GUEST: UserDto = { id: "local-guest", username: "Guest", isGuest: true, createdAt: "1970-01-01T00:00:00.000Z" };
const empty = (): Workspace => ({ version:1, normalScrambles:true, sessions:{}, solves:{}, learned:{}, groupOrder:{}, journey:{}, outbox:[], cursor:0 });
const newId = () => -Number.parseInt(crypto.randomUUID().replaceAll("-", "").slice(0,12),16) - 1;

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
  const catalog = createCatalogCache(storage);
  const read = <T>(key: string, fallback: T): T => {
    const text = storage.getItem(PREFIX + key);
    if (text === null) return fallback;
    try { return JSON.parse(text) as T; } catch { throw new Error("Local data could not be read. Your saved data has been preserved."); }
  };
  const write = (key: string, value: unknown) => {
    try { storage.setItem(PREFIX + key, JSON.stringify(value)); }
    catch {
      // Rebuildable algorithms must never prevent saving a personal solve.
      evictCatalogCache(storage);
      try { storage.setItem(PREFIX + key, JSON.stringify(value)); }
      catch { throw new Error("Your device storage is full or unavailable. This change could not be saved."); }
    }
  };
  const current = () => read<UserDto>("user",GUEST);
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
   * a reopened app) changed it since. `generation` numbers each state for the reads derived from it. */
  let cached: { id: string; revision: string; workspace: Workspace } | undefined;
  let generation = 0;
  const cachedWorkspace = () => cached?.workspace;
  const revisionKey = (id: string) => PREFIX + "revision:" + id;
  const remember = (id: string, workspace: Workspace) => {
    const revision = crypto.randomUUID();
    storage.setItem(revisionKey(id), revision);
    cached = { id, revision, workspace }; generation++;
  };
  const save = (id: string, value: Workspace) => {
    try { write("workspace:" + id,value); remember(id, value); }
    catch (error) { cached = undefined; generation++; throw error; }
  };
  const data = (id = owner()) => {
    if (cached?.id === id && storage.getItem(revisionKey(id)) === cached.revision) return cached.workspace;
    cached = undefined;
    const stored = read<(Workspace & { cache?: unknown }) | null>("workspace:" + id,null);
    const workspace: Workspace & { cache?: unknown } = stored ?? empty();
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
    // Retired puzzles (Clock): their sessions and solves leave this device; the server keeps its copy untouched.
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
    if (cachedWorkspace() !== workspace) try { remember(id, workspace); } catch { /* Read again next time. */ }
    return workspace;
  };
  const lock = <T>(name: string, action: () => Promise<T>) => options.lock ? options.lock(name,action) : action();
  const edit = <T>(id: string, action: (workspace: Workspace) => T) => lock("cubix-local",async () => {
    const workspace = data(id);
    let result: T;
    // A failed change may have half-modified the object in memory: the stored workspace stays the truth.
    try { result = action(workspace); } catch (error) { cached = undefined; generation++; throw error; }
    save(id,workspace); return result;
  });
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
        operation(account,user.id,"session",session.id,{ mode:session.mode, caseIds:session.case_ids, ...contextOf(session) },session.created_at);
      }
      for (const solve of liveSolves(guest)) if (!account.solves[solve.id]) {
        account.solves[solve.id] = { ...solve, serverId:undefined };
        operation(account,user.id,"solve",solve.id,{ sessionId:solve.session_id, caseId:solve.case_id, timeMs:solve.time_ms, penalty:solve.penalty, scramble:solve.scramble, comment:solve.comment ?? null, ...(solve.solution ? { solution:solve.solution } : {}), ...contextOf(solve) },solve.created_at);
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
      if (cursor < workspace.cursor) return;
      const dirty = new Set(workspace.outbox.map(op => op.kind === "learned" ? `learned:${op.body.caseId}` : `${op.kind === "session" ? "sessions" : "solves"}:${op.localId}`));
      // Local IDs by server ID, built once: a first pull brings thousands of rows.
      const byServer = (rows: Record<number, Session | Solve>) => new Map(Object.values(rows).flatMap(r => r.serverId === undefined ? [] : [[r.serverId, r.id] as const]));
      const sessionIds = byServer(workspace.sessions), solveIds = byServer(workspace.solves);
      for (const change of [...changes].sort((a,b) => Number(a.kind === "solves") - Number(b.kind === "solves"))) {
        if (change.kind === "personal_entries") {
          const row = change.value ? { ...change.value as JourneyEntryDto, value:withoutRetired((change.value as JourneyEntryDto).value) as JourneyEntryDto["value"] } : null;
          if (!row || !validJourneyEntry(row.key, row.value) || workspace.outbox.some(op => op.kind === "journey" && op.body.key === row.key)) continue;
          workspace.journey[row.key] = row.value;
        } else if (change.kind === "learning_group_orders") {
          const row = change.value as LearningGroupOrderDto | null;
          if (!row || !isLearningTrack(row.track) || workspace.outbox.some(op => op.kind === "learning-order" && op.body.track === row.track)) continue;
          workspace.groupOrder[row.track] = orderedGroups(learningCases(cases,row.track),row.groups);
        } else if (change.kind === "learned_cases") {
          // A pending local mark wins until it is uploaded; the server then orders both edits.
          const row = change.value as LearnedCaseDto | null;
          if (!row || dirty.has(`learned:${row.case_id}`)) continue;
          if (row.learned) workspace.learned[row.case_id] = true; else delete workspace.learned[row.case_id];
          const algs = row.algs?.length ? row.algs : row.alg ? [row.alg] : [];
          workspace.learnedAlgs ??= {};
          if (row.learned && algs.length) workspace.learnedAlgs[row.case_id] = algs; else delete workspace.learnedAlgs[row.case_id];
        } else if (change.kind === "sessions") {
          const localId = sessionIds.get(change.id) ?? (id === "guest" ? newId() : change.id);
          if (dirty.has(`sessions:${localId}`)) continue;
          if (!change.value || !isPuzzle(puzzleOf(change.value as SessionDto))) { delete workspace.sessions[localId]; sessionIds.delete(change.id); }
          else { workspace.sessions[localId] = { ...change.value as SessionDto, scramble_type:scrambleTypeOf(change.value as SessionDto), id:localId, serverId:change.id }; sessionIds.set(change.id, localId); }
        } else if (change.kind === "solves") {
          const localId = solveIds.get(change.id) ?? (id === "guest" ? newId() : change.id);
          // A remote deletion wins even over an edit queued locally but not uploaded yet.
          if (!change.value || !isPuzzle(puzzleOf(change.value as SolveDto))) {
            delete workspace.solves[localId]; solveIds.delete(change.id);
            workspace.outbox = workspace.outbox.filter(op => !(op.localId === localId && ["penalty", "comment", "solution", "delete"].includes(op.kind)));
          }
          else {
            if (dirty.has(`solves:${localId}`)) continue;
            const row = change.value as SolveDto;
            const sid = (row.session_id == null ? undefined : sessionIds.get(row.session_id)) ?? row.session_id;
            workspace.solves[localId] = { ...row, scramble_type:scrambleTypeOf(row), id:localId, session_id:sid, serverId:change.id };
            solveIds.set(change.id, localId);
          }
        }
      }
      workspace.cursor = cursor;
    });
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
            const batch = workspace.outbox.filter(o => !o.error && o.kind === "solve" && sessionServerId(workspace,o.body.sessionId) !== undefined).slice(0,100);
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
                batch.forEach((o,i) => { if (latest.solves[o.localId]) latest.solves[o.localId].serverId = results[i]!.value.id; });
                const done = new Set(batch.map(o => o.id));
                latest.outbox = latest.outbox.filter(item => !done.has(item.id));
              });
              continue;
            }
          }
          activeOperation = op.id;
          let path = op.kind === "session" ? "sessions" : op.kind === "learned" ? "learned" : op.kind === "learning-order" ? "learning-group-order" : op.kind === "journey" ? "journey" : "solves";
          const body = { ...op.body };
          if (op.kind === "solve") {
            const sid = sessionServerId(workspace,body.sessionId);
            if (sid === undefined) throw new Error("The session is waiting to synchronize.");
            body.sessionId = sid;
          }
          if (op.kind === "penalty" || op.kind === "comment" || op.kind === "solution" || op.kind === "delete") {
            const serverId = solveServerId(workspace,op.localId);
            if (!serverId) throw new Error("The solve is waiting to synchronize.");
            path += "/" + serverId;
          }
          const method = op.kind === "delete" ? "DELETE" : op.kind === "learned" || op.kind === "learning-order" || op.kind === "journey" ? "PUT" : op.kind === "penalty" || op.kind === "comment" || op.kind === "solution" ? "PATCH" : "POST";
          const result: any = (await (socket?.connection ?? remote).syncPush([{ id:op.id, method, path, body, ...(method === "POST" ? {createdAt:op.createdAt} : {}) }])).results[0].value;
          // Write only the acknowledgement; preserve edits made while the request was in flight.
          await edit(id, latest => {
            if (op.kind === "session" && latest.sessions[op.localId]) latest.sessions[op.localId].serverId = result.id;
            if (op.kind === "solve" && latest.solves[op.localId]) latest.solves[op.localId].serverId = result.id;
            if (op.kind === "delete") delete latest.solves[op.localId];
            if (op.kind === "learning-order" && result && !latest.outbox.some(item => item.kind === op.kind && item.body.track === op.body.track && item.id !== op.id)) {
              latest.groupOrder[result.track as LearningTrack] = orderedGroups(learningCases(cases,result.track),result.groups);
            }
            latest.outbox = latest.outbox.filter(item => item.id !== op.id);
          });
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

  async function localMutation<T>(change: (workspace: Workspace, id: string) => T): Promise<T> {
    const id = owner();
    let value: T;
    try { value = await edit(id,workspace => change(workspace,id)); }
    catch (error) { report("error",(error as Error).message); throw error; }
    notify(); schedule(); return value;
  }

  /** Every solve kept, oldest first: sorted once per change rather than by each read. */
  const ordered = () => derived("ordered", () => liveSolves().sort(chronological));
  const args = (...values: unknown[]) => JSON.stringify(values);
  /** Synchronous reads of local data, for screens that must render without any loading state. Unchanged data gives
   * back the very same objects, so screens can tell nothing changed. */
  const reads = {
    journey: () => data().journey,
    catalog: (cubeSize: PuzzleInput = 3) => catalog(cubeSize),
    stats: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => derived("stats" + args(puzzleId(cubeSize), filter.solveMode), () => caseStats(ordered(),cubeSize,filter)),
    caseHistory: (caseId: string, filter: PracticeFilter = {}) => derived("case" + args(caseId, filter.solveMode), () =>
      history(caseId,ordered().filter(s => s.case_id === caseId && solveModeOf(s) === (filter.solveMode ?? "standard")))),
    profile: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => derived("profile" + args(puzzleId(cubeSize), filter.solveMode, filter.scrambleType, current()), () =>
      profile(current(),ordered(),cubeSize,filter,journeyProfile(data().journey)?.bests)),
    achievements: () => derived("achievements", () => achievements(ordered(),learnedIds())),
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
    register: async (username: string,password: string) => authenticate(await options.remote(null).register(username,password)),
    login: async (username: string,password: string) => authenticate(await options.remote(null).login(username,password)),
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
    /** The account deleted on the server with its password, then forgotten on this device, which goes back to a guest. */
    deleteAccount: async (password: string) => {
      const id = owner(), token = options.getToken();
      if (id === "guest" || !token) throw new Error("Sign in first.");
      await options.remote(token).deleteAccount(password);
      for (const key of ["workspace:" + id, "revision:" + id]) storage.removeItem(PREFIX + key);
      cached = undefined; generation++;
      write("user",GUEST); options.clearToken(); report("local"); notify();
      return { ok:true };
    },
    logout: async () => {
      const token = options.getToken();
      write("user",GUEST); options.clearToken(); report("local"); notify();
      // Local sign-out is immediate, even if the server cannot be contacted.
      if (token) void options.remote(token).logout().catch(() => {});
      return { ok:true };
    },
    latestSession: async (mode: SessionMode, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => Object.values(data().sessions).filter(s => s.mode === mode && matchesPractice(s,cubeSize,filter)).sort((a,b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    createSession: async (mode: SessionMode, caseIds: string[] = [], cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => localMutation((workspace,id) => {
      const context = { puzzle: puzzleId(cubeSize), solveMode: filter.solveMode ?? "standard", scrambleType: normalizeScrambleType(filter.scrambleType ?? (mode === "training" ? "case" : "normal")) };
      if (!validContext(context, mode === "training") || caseIds.some(id => !cases.some(c => c.id === id && puzzleOf(c) === context.puzzle))) throw new Error("Case, cube and practice context do not match.");
      const session: Session = { id:newId(), cube_size:puzzleInfo(cubeSize).cubeSize, puzzle_id:context.puzzle, solve_mode:context.solveMode, scramble_type:context.scrambleType, mode, case_ids:caseIds, created_at:new Date().toISOString() };
      workspace.sessions[session.id] = session;
      operation(workspace,id,"session",session.id,{mode,caseIds,...context},session.created_at); return session;
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
          session = { id:newId(), cube_size:puzzleInfo(puzzle).cubeSize, puzzle_id:puzzle, solve_mode:solveMode, scramble_type:"normal", mode:"playground", case_ids:[], created_at:at };
          workspace.sessions[session.id] = session; sessions.set(group,session);
          operation(workspace,id,"session",session.id,{ mode:"playground", caseIds:[], ...context },at);
        }
        const row: Solve = { id:newId(), cube_size:puzzleInfo(puzzle).cubeSize, puzzle_id:puzzle, solve_mode:solveMode, scramble_type:"normal", session_id:session.id, case_id:null, time_ms:timeMs, penalty:solve.penalty, scramble:solve.scramble, comment:solve.comment?.slice(0,500) || null, created_at:at };
        workspace.solves[row.id] = row;
        operation(workspace,id,"solve",row.id,{ sessionId:session.id, caseId:null, timeMs, penalty:row.penalty, scramble:row.scramble, comment:row.comment, ...context },at);
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
      const latest = Date.parse(derived("latest", () => Object.values(workspace.solves).reduce((at,s) => s.created_at > at ? s.created_at : at,""))) || 0;
      const createdAt = new Date(Math.max(Date.now(),latest+1)).toISOString();
      // A solution that cannot be read is left out: it never keeps the time from being saved.
      const solution = readSolution(body.solution) ? body.solution!.trim() : undefined;
      const solve: Solve = { id:newId(),cube_size:puzzleInfo(context.puzzle).cubeSize,puzzle_id:context.puzzle,solve_mode:context.solveMode,scramble_type:context.scrambleType,session_id:body.sessionId ?? null,case_id:body.caseId ?? null,time_ms:Math.round(body.timeMs),penalty:body.penalty ?? "none",scramble:body.scramble ?? null,comment:body.comment?.trim() || null,...(solution ? { solution } : {}),created_at:createdAt };
      workspace.solves[solve.id] = solve;
      operation(workspace,id,"solve",solve.id,{...body,...context,timeMs:solve.time_ms,solution},solve.created_at); return solve;
    }),
    solves: async (mode: SessionMode, limit = 500, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => {
      const newest = derived("solves" + args(mode, puzzleId(cubeSize), filter.solveMode, filter.scrambleType), () => {
        const workspace = data();
        return ordered().filter(s => matchesPractice(s,cubeSize,filter) && (workspace.sessions[s.session_id ?? 0]?.mode ?? (s.case_id ? "training" : "playground")) === mode).reverse();
      });
      return newest.slice(0,limit);
    },
    setPenalty: async (solveId: number, penalty: Penalty) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      solve.penalty = penalty; operation(workspace,id,"penalty",solveId,{penalty}); return solve;
    }),
    /** Trimmed; an empty text clears the note. Only the latest note of a solve needs uploading. */
    setComment: async (solveId: number, comment: string | null) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      const text = comment?.trim() || null;
      if ((text ?? "").length > 500) throw new Error("Comments are limited to 500 characters.");
      solve.comment = text;
      workspace.outbox = workspace.outbox.filter(op => !(op.kind === "comment" && !op.error && op.localId === solveId));
      operation(workspace,id,"comment",solveId,{comment:text}); return solve;
    }),
    /** The turns written by hand for a solve (see `lib/solution`); null clears them. Only the latest needs uploading. */
    setSolution: async (solveId: number, solution: string | null) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      const text = solution?.trim() || null;
      if ((text ?? "").length > SOLUTION_MAX) throw new Error("The solution is too long.");
      solve.solution = text;
      workspace.outbox = workspace.outbox.filter(op => !(op.kind === "solution" && !op.error && op.localId === solveId));
      operation(workspace,id,"solution",solveId,{solution:text}); return solve;
    }),
    /** The link's token for a solve, once it reached the server. */
    shareSolve: async (solveId: number) => {
      const token = options.getToken();
      if (current().isGuest || !token) throw new Error("Sign in to share a solve.");
      const serverId = solveServerId(data(),solveId);
      if (!serverId) throw new Error("The solve is waiting to synchronize.");
      return (await options.remote(token).shareSolve(serverId)).token;
    },
    deleteSolve: async (solveId: number) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      solve.deleted = true; operation(workspace,id,"delete",solveId,{}); return solve;
    }),
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
