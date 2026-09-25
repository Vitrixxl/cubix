import {createCatalogCache,evictCatalogCache} from "./catalog-cache";
import { puzzleOf, puzzleId, puzzleInfo, contextOf, matchesPractice, solveModeOf, scrambleTypeOf, normalizeScrambleType, validContext, type PuzzleInput, type PracticeFilter } from "../../shared/puzzles";
import { ApiError, createApiClient, type AddSolveBody } from "../api-client";
import type { AuthDto, UserDto, SessionDto, SolveDto, SessionMode, Penalty, LearnedCaseDto, LearningGroupOrder, LearningGroupOrderDto } from "../../shared/types";
import { isLearningTrack, learningCases, learningKey, LEARNING_TRACKS, orderedGroups, type LearningTrack } from "../lib/dailyLearning";
import { cases } from "./catalog";
import { history, profile, chronological } from "./stats";
import { achievements } from "../lib/achievements";

type Remote = ReturnType<typeof createApiClient>;
type Session = SessionDto & { serverId?: number };
type Solve = SolveDto & { serverId?: number; deleted?: boolean };
type Operation = { id: string; kind: "session" | "solve" | "penalty" | "comment" | "delete" | "learned" | "learning-order"; localId: number; body: any; createdAt: string; error?: string };
interface Workspace { version: 1; normalScrambles?: true; sessions: Record<number, Session>; solves: Record<number, Solve>; learned: Record<string, boolean>; groupOrder: LearningGroupOrder; outbox: Operation[]; cursor: number }
export interface SyncStatus { state: "local" | "syncing" | "synced" | "offline" | "signin" | "error"; pending: number; error?: string }
const PREFIX = "cubix.local.v1:";
/** Learning marks were device preferences before they joined the synchronized workspace. */
const LEGACY_LEARNED_KEY = "cubix.algs.learnedCaseIds";
const GUEST: UserDto = { id: "local-guest", username: "Guest", isGuest: true, createdAt: "1970-01-01T00:00:00.000Z" };
const empty = (): Workspace => ({ version:1, normalScrambles:true, sessions:{}, solves:{}, learned:{}, groupOrder:{}, outbox:[], cursor:0 });
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
    workspace.outbox.push({ id:crypto.randomUUID(), kind, localId, body, createdAt });
  };
  const save = (id: string, value: Workspace) => write("workspace:" + id,value);
  const data = (id = owner()) => {
    const stored = read<(Workspace & { cache?: unknown }) | null>("workspace:" + id,null);
    const workspace: Workspace & { cache?: unknown } = stored ?? empty();
    workspace.learned ??= {};
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
    return workspace;
  };
  const lock = <T>(name: string, action: () => Promise<T>) => options.lock ? options.lock(name,action) : action();
  const edit = <T>(id: string, action: (workspace: Workspace) => T) => lock("cubix-local",async () => {
    const workspace = data(id); const result = action(workspace); save(id,workspace); return result;
  });
  let syncing: Promise<void> | null = null;
  let reconnecting: Promise<void> | null = null;
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
        operation(account,user.id,"solve",solve.id,{ sessionId:solve.session_id, caseId:solve.case_id, timeMs:solve.time_ms, penalty:solve.penalty, scramble:solve.scramble, comment:solve.comment ?? null, ...contextOf(solve) },solve.created_at);
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
      const dirty = new Set(workspace.outbox.map(op => op.kind === "learned" ? `learned:${op.body.caseId}` : `${op.kind === "session" ? "sessions" : "solves"}:${op.localId}`));
      for (const change of [...changes].sort((a,b) => Number(a.kind === "solves") - Number(b.kind === "solves"))) {
        if (change.kind === "learning_group_orders") {
          const row = change.value as LearningGroupOrderDto | null;
          if (!row || !isLearningTrack(row.track) || workspace.outbox.some(op => op.kind === "learning-order" && op.body.track === row.track)) continue;
          workspace.groupOrder[row.track] = orderedGroups(learningCases(cases,row.track),row.groups);
        } else if (change.kind === "learned_cases") {
          // A pending local mark wins until it is uploaded; the server then orders both edits.
          const row = change.value as LearnedCaseDto | null;
          if (!row || dirty.has(`learned:${row.case_id}`)) continue;
          if (row.learned) workspace.learned[row.case_id] = true; else delete workspace.learned[row.case_id];
        } else if (change.kind === "sessions") {
          const existing = Object.values(workspace.sessions).find(s => s.serverId === change.id);
          const localId = existing?.id ?? (id === "guest" ? newId() : change.id);
          if (dirty.has(`sessions:${localId}`)) continue;
          if (!change.value) delete workspace.sessions[localId];
          else workspace.sessions[localId] = { ...change.value as SessionDto, scramble_type:scrambleTypeOf(change.value as SessionDto), id:localId, serverId:change.id };
        } else if (change.kind === "solves") {
          const existing = Object.values(workspace.solves).find(s => s.serverId === change.id);
          const localId = existing?.id ?? (id === "guest" ? newId() : change.id);
          if (dirty.has(`solves:${localId}`)) continue;
          if (!change.value) delete workspace.solves[localId];
          else {
            const row = change.value as SolveDto;
            const sid = Object.values(workspace.sessions).find(s => s.serverId === row.session_id)?.id ?? row.session_id;
            workspace.solves[localId] = { ...row, scramble_type:scrambleTypeOf(row), id:localId, session_id:sid, serverId:change.id };
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
      const stillCurrent = () => owner() === id && options.getToken() === token && !stopped;
      if (!stillCurrent()) return;
      report("syncing");
      let activeOperation: string | undefined;
      try {
        const verified = await remote.me();
        if (verified.id !== user.id || verified.isGuest) throw new ApiError(401,"Sign in to synchronize this account.");
        if (!stillCurrent()) return;
        write("user",verified);
        while (stillCurrent()) {
          const workspace = data(id), op = workspace.outbox.find(op => !op.error);
          if (!op) break;
          activeOperation = op.id;
          let path = op.kind === "session" ? "sessions" : op.kind === "learned" ? "learned" : op.kind === "learning-order" ? "learning-group-order" : "solves";
          const body = { ...op.body };
          if (op.kind === "solve") {
            const sid = sessionServerId(workspace,body.sessionId);
            if (sid === undefined) throw new Error("The session is waiting to synchronize.");
            body.sessionId = sid;
          }
          if (op.kind === "penalty" || op.kind === "comment" || op.kind === "delete") {
            const serverId = solveServerId(workspace,op.localId);
            if (!serverId) throw new Error("The solve is waiting to synchronize.");
            path += "/" + serverId;
          }
          const method = op.kind === "delete" ? "DELETE" : op.kind === "learned" || op.kind === "learning-order" ? "PUT" : op.kind === "penalty" || op.kind === "comment" ? "PATCH" : "POST";
          const result: any = (await remote.syncPush([{ id:op.id, method, path, body, ...(method === "POST" ? {createdAt:op.createdAt} : {}) }])).results[0].value;
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
        while (stillCurrent()) {
          const page = await remote.syncPull(data(id).cursor);
          await merge(id,page.changes,page.cursor);
          if (!page.more) break;
        }
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

  async function localMutation<T>(change: (workspace: Workspace, id: string) => T): Promise<T> {
    const id = owner();
    let value: T;
    try { value = await edit(id,workspace => change(workspace,id)); }
    catch (error) { report("error",(error as Error).message); throw error; }
    notify(); schedule(); return value;
  }

  /** Synchronous reads of local data, for screens that must render without any loading state. */
  const reads = {
    catalog: (cubeSize: PuzzleInput = 3) => catalog(cubeSize),
    stats: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => profile(current(),liveSolves(),cubeSize,filter).cases.map(c => c.summary),
    caseHistory: (caseId: string, filter: PracticeFilter = {}) => history(caseId,liveSolves().filter(s => s.case_id === caseId && solveModeOf(s) === (filter.solveMode ?? "standard"))),
    profile: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => profile(current(),liveSolves(),cubeSize,filter),
    achievements: () => achievements(liveSolves(),learnedIds()),
  };

  const api = {
    ...options.remote(options.getToken()),
    me: async () => current(),
    cases: async (cubeSize: PuzzleInput = 3) => reads.catalog(cubeSize).cases,
    sets: async (cubeSize: PuzzleInput = 3) => reads.catalog(cubeSize).sets,
    register: async (username: string,password: string) => authenticate(await options.remote(null).register(username,password)),
    login: async (username: string,password: string) => authenticate(await options.remote(null).login(username,password)),
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
      const latest = Object.values(workspace.solves).reduce((at,s) => Math.max(at,Date.parse(s.created_at)),0);
      const createdAt = new Date(Math.max(Date.now(),latest+1)).toISOString();
      const solve: Solve = { id:newId(),cube_size:puzzleInfo(context.puzzle).cubeSize,puzzle_id:context.puzzle,solve_mode:context.solveMode,scramble_type:context.scrambleType,session_id:body.sessionId ?? null,case_id:body.caseId ?? null,time_ms:Math.round(body.timeMs),penalty:body.penalty ?? "none",scramble:body.scramble ?? null,comment:body.comment?.trim() || null,created_at:createdAt };
      workspace.solves[solve.id] = solve;
      operation(workspace,id,"solve",solve.id,{...body,...context,timeMs:solve.time_ms},solve.created_at); return solve;
    }),
    solves: async (mode: SessionMode, limit = 500, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => { const workspace = data(); return liveSolves(workspace).filter(s => matchesPractice(s,cubeSize,filter) && (workspace.sessions[s.session_id ?? 0]?.mode ?? (s.case_id ? "training" : "playground")) === mode).sort(chronological).reverse().slice(0,limit); },
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
    setLearned: async (caseId: string, learned: boolean) => localMutation((workspace,id) => {
      if (!cases.some(c => c.id === caseId)) throw new Error("Unknown case.");
      if (learned) workspace.learned[caseId] = true; else delete workspace.learned[caseId];
      operation(workspace,id,"learned",0,{ caseId, learned });
      return { caseId, learned };
    }),
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
    if (!current().isGuest) { await sync(); return; }
    // One-time migration of an existing server-side guest; no new guest is ever created.
    try {
      const remote = options.remote(token), user = await remote.me();
      if (options.getToken() !== token) return;
      if (user.isGuest) {
        let more = true;
        while (more) { const page = await remote.syncPull(data("guest").cursor); await merge("guest",page.changes,page.cursor); more = page.more; }
        options.clearToken();
      } else { await authenticate({user,token}); await sync(); }
      notify();
    } catch (error) { if (error instanceof ApiError && error.status === 401) options.clearToken(); }
  }
  return { api, read: reads, sync, restore, current, reconnected,
    learned: () => learnedIds(),
    learningGroupOrder: () => data().groupOrder,
    /** A live notification announced changes up to `cursor`; pull only if this device is behind. */
    remoteChanged: (cursor?: number) => cursor !== undefined && cursor <= data().cursor ? Promise.resolve() : sync(),
    retry: async () => { await edit(owner(),d => { for (const op of d.outbox) delete op.error; }); await sync(); },
    status: () => status,
    changed: () => { notify(); schedule(); },
    stop: () => { stopped = true; clearTimeout(scheduled); },
  };
}
