import { ApiError, createApiClient, type AddSolveBody, type SendMessageBody } from "../api-client";
import type { AuthDto, UserDto, SessionDto, SolveDto, SessionMode, Penalty, ChatMessageDto, FriendDto } from "../../shared/types";
import { cases, sets } from "./catalog";
import { history, profile, chronological } from "./stats";

type Remote = ReturnType<typeof createApiClient>;
type Session = SessionDto & { serverId?: number };
type Solve = SolveDto & { serverId?: number; deleted?: boolean };
type Operation = { id: string; kind: "session" | "solve" | "penalty" | "delete" | "bio" | "message"; localId: number; body: any; createdAt: string; error?: string };
interface Workspace { version: 1; sessions: Record<number, Session>; solves: Record<number, Solve>; outbox: Operation[]; cursor: number; cache: Record<string, unknown> }
export interface SyncStatus { state: "local" | "syncing" | "synced" | "offline" | "signin" | "error"; pending: number; error?: string }
const PREFIX = "cubix.local.v1:";
const GUEST: UserDto = { id: "local-guest", username: "Guest", bio: "", isGuest: true, createdAt: "1970-01-01T00:00:00.000Z" };
const empty = (): Workspace => ({ version:1, sessions:{}, solves:{}, outbox:[], cursor:0, cache:{} });
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
  const read = <T>(key: string, fallback: T): T => {
    const text = storage.getItem(PREFIX + key);
    if (text === null) return fallback;
    try { return JSON.parse(text) as T; } catch { throw new Error("Local data could not be read. Your saved data has been preserved."); }
  };
  const write = (key: string, value: unknown) => {
    try { storage.setItem(PREFIX + key, JSON.stringify(value)); }
    catch { throw new Error("Your browser storage is full or unavailable. This change could not be saved."); }
  };
  const current = () => read<UserDto>("user",GUEST);
  const owner = () => current().isGuest ? "guest" : current().id;
  const data = (id = owner()) => read<Workspace>("workspace:" + id,empty());
  const save = (id: string, value: Workspace) => write("workspace:" + id,value);
  const lock = <T>(name: string, action: () => Promise<T>) => options.lock ? options.lock(name,action) : action();
  const edit = <T>(id: string, action: (workspace: Workspace) => T) => lock("cubix-local",async () => {
    const workspace = data(id); const result = action(workspace); save(id,workspace); return result;
  });
  let syncing: Promise<void> | null = null;
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
  const operation = (workspace: Workspace, id: string, kind: Operation["kind"], localId: number, body: unknown, createdAt = new Date().toISOString()) => {
    if (id !== "guest") workspace.outbox.push({ id:crypto.randomUUID(), kind, localId, body, createdAt });
  };
  const liveSolves = (workspace = data()) => Object.values(workspace.solves).filter(s => !s.deleted);
  const sessionServerId = (workspace: Workspace, id: number | null | undefined) => id == null ? null : workspace.sessions[id]?.serverId ?? (id > 0 ? id : undefined);
  const solveServerId = (workspace: Workspace, id: number) => workspace.solves[id]?.serverId ?? (id > 0 ? id : undefined);

  async function importGuest(user: UserDto) {
    await lock("cubix-local",async () => {
      const guest = data("guest"), account = data(user.id);
      // Stable local IDs make a repeated import safe even if the browser closes between writes.
      for (const session of Object.values(guest.sessions)) if (!account.sessions[session.id]) {
        account.sessions[session.id] = { ...session, serverId:undefined };
        operation(account,user.id,"session",session.id,{ mode:session.mode, caseIds:session.case_ids },session.created_at);
      }
      for (const solve of liveSolves(guest)) if (!account.solves[solve.id]) {
        account.solves[solve.id] = { ...solve, serverId:undefined };
        operation(account,user.id,"solve",solve.id,{ sessionId:solve.session_id, caseId:solve.case_id, timeMs:solve.time_ms, penalty:solve.penalty, scramble:solve.scramble },solve.created_at);
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
      const dirty = new Set(workspace.outbox.map(op => `${op.kind === "session" ? "sessions" : "solves"}:${op.localId}`));
      for (const change of [...changes].sort((a,b) => Number(a.kind === "solves") - Number(b.kind === "solves"))) {
        if (change.kind === "sessions") {
          const existing = Object.values(workspace.sessions).find(s => s.serverId === change.id);
          const localId = existing?.id ?? (id === "guest" ? newId() : change.id);
          if (dirty.has(`sessions:${localId}`)) continue;
          if (!change.value) delete workspace.sessions[localId];
          else workspace.sessions[localId] = { ...change.value as SessionDto, id:localId, serverId:change.id };
        } else {
          const existing = Object.values(workspace.solves).find(s => s.serverId === change.id);
          const localId = existing?.id ?? (id === "guest" ? newId() : change.id);
          if (dirty.has(`solves:${localId}`)) continue;
          if (!change.value) delete workspace.solves[localId];
          else {
            const row = change.value as SolveDto;
            const sid = Object.values(workspace.sessions).find(s => s.serverId === row.session_id)?.id ?? row.session_id;
            workspace.solves[localId] = { ...row, id:localId, session_id:sid, serverId:change.id };
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
        if (!data(id).outbox.some(op => op.kind === "bio")) write("user",verified);
        while (stillCurrent()) {
          const workspace = data(id), op = workspace.outbox.find(op => !op.error);
          if (!op) break;
          activeOperation = op.id;
          let result: any;
          if (op.kind === "message") {
            const { peer, ...body } = op.body;
            if (body.solveId != null) {
              const serverId = solveServerId(workspace,body.solveId);
              if (!serverId) throw new Error("The attached solve is waiting to synchronize.");
              body.solveId = serverId;
            }
            result = await remote.sendMessage(peer,body);
          } else {
            let path = op.kind === "session" ? "sessions" : op.kind === "bio" ? "account" : "solves";
            const body = { ...op.body };
            if (op.kind === "solve") {
              const sid = sessionServerId(workspace,body.sessionId);
              if (sid === undefined) throw new Error("The session is waiting to synchronize.");
              body.sessionId = sid;
            }
            if (op.kind === "penalty" || op.kind === "delete") {
              const serverId = solveServerId(workspace,op.localId);
              if (!serverId) throw new Error("The solve is waiting to synchronize.");
              path += "/" + serverId;
            }
            const method = op.kind === "delete" ? "DELETE" : ["penalty","bio"].includes(op.kind) ? "PATCH" : "POST";
            result = (await remote.syncPush([{ id:op.id, method, path, body, ...(method === "POST" ? {createdAt:op.createdAt} : {}) }])).results[0].value;
          }
          // Write only the acknowledgement; preserve edits made while the request was in flight.
          await edit(id, latest => {
            if (op.kind === "session" && latest.sessions[op.localId]) latest.sessions[op.localId].serverId = result.id;
            if (op.kind === "solve" && latest.solves[op.localId]) latest.solves[op.localId].serverId = result.id;
            if (op.kind === "delete") delete latest.solves[op.localId];
            if (op.kind === "message") {
              const key = "messages:" + op.body.peer;
              const messages = (latest.cache[key] ?? []) as ChatMessageDto[];
              latest.cache[key] = [...messages.filter(m => m.id !== op.localId && m.id !== result.id), result];
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

  // Cached social reads stay available offline. These caches are isolated by account.
  const refreshes = new Map<string, Promise<unknown>>();
  const refreshedAt = new Map<string,number>();
  function refreshCache<T>(key: string, load: (remote: Remote) => Promise<T>, combine?: (previous: T | undefined, value: T) => T) {
    const id = owner(), token = options.getToken(), requestKey = id+":"+key;
    if (id === "guest" || !token || refreshes.has(requestKey) || Date.now() - (refreshedAt.get(requestKey) ?? 0) < 2000) return;
    refreshedAt.set(requestKey,Date.now());
    const promise = load(options.remote(token)).then(async value => {
      let changed = false;
      await edit(id,workspace => {
        const previous = workspace.cache[key] as T | undefined;
        const next = combine ? combine(previous,value) : value;
        if (JSON.stringify(previous) !== JSON.stringify(next)) { workspace.cache[key] = next; changed = true; }
      });
      if (changed && owner() === id) notify();
    }).catch(() => {}).finally(() => refreshes.delete(requestKey));
    refreshes.set(requestKey,promise);
  }
  async function cached<T>(key: string, load: (remote: Remote) => Promise<T>, fallback: T): Promise<T> {
    refreshCache(key,load);
    return data().cache[key] as T ?? fallback;
  }
  async function localMutation<T>(change: (workspace: Workspace, id: string) => T): Promise<T> {
    const id = owner();
    let value: T;
    try { value = await edit(id,workspace => change(workspace,id)); }
    catch (error) { report("error",(error as Error).message); throw error; }
    notify(); schedule(); return value;
  }

  const api = {
    ...options.remote(options.getToken()),
    me: async () => current(),
    cases: async () => cases,
    sets: async () => sets,
    register: async (username: string,password: string) => authenticate(await options.remote(null).register(username,password)),
    login: async (username: string,password: string) => authenticate(await options.remote(null).login(username,password)),
    logout: async () => {
      const token = options.getToken();
      write("user",GUEST); options.clearToken(); report("local"); notify();
      // Local sign-out is immediate, even if the server cannot be contacted.
      if (token) void options.remote(token).logout().catch(() => {});
      return { ok:true };
    },
    latestSession: async (mode: SessionMode) => Object.values(data().sessions).filter(s => s.mode === mode).sort((a,b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    createSession: async (mode: SessionMode, caseIds: string[] = []) => localMutation((workspace,id) => {
      const session: Session = { id:newId(), mode, case_ids:caseIds, created_at:new Date().toISOString() };
      workspace.sessions[session.id] = session;
      operation(workspace,id,"session",session.id,{mode,caseIds},session.created_at); return session;
    }),
    addSolve: async (body: AddSolveBody) => localMutation((workspace,id) => {
      const session = body.sessionId == null ? null : workspace.sessions[body.sessionId];
      if (body.sessionId != null && !session) throw new Error("Unknown local session.");
      if (!Number.isFinite(body.timeMs) || body.timeMs < 0) throw new Error("Invalid solve time.");
      if (body.caseId && !cases.some(c => c.id === body.caseId)) throw new Error("Unknown case.");
      // Preserve insertion order even for imports/tests producing several solves in one millisecond.
      const latest = Object.values(workspace.solves).reduce((at,s) => Math.max(at,Date.parse(s.created_at)),0);
      const createdAt = new Date(Math.max(Date.now(),latest+1)).toISOString();
      const solve: Solve = { id:newId(),session_id:body.sessionId ?? null,case_id:body.caseId ?? null,time_ms:Math.round(body.timeMs),penalty:body.penalty ?? "none",scramble:body.scramble ?? null,created_at:createdAt };
      workspace.solves[solve.id] = solve;
      operation(workspace,id,"solve",solve.id,{...body,timeMs:solve.time_ms},solve.created_at); return solve;
    }),
    solves: async (mode: SessionMode, limit = 500) => { const workspace = data(); return liveSolves(workspace).filter(s => (workspace.sessions[s.session_id ?? 0]?.mode ?? (s.case_id ? "training" : "playground")) === mode).sort(chronological).reverse().slice(0,limit); },
    setPenalty: async (solveId: number, penalty: Penalty) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      solve.penalty = penalty; operation(workspace,id,"penalty",solveId,{penalty}); return solve;
    }),
    deleteSolve: async (solveId: number) => localMutation((workspace,id) => {
      const solve = workspace.solves[solveId]; if (!solve || solve.deleted) throw new Error("Unknown local solve.");
      solve.deleted = true; operation(workspace,id,"delete",solveId,{}); return solve;
    }),
    stats: async () => profile(current(),liveSolves()).cases.map(c => c.summary),
    caseHistory: async (caseId: string) => history(caseId,liveSolves().filter(s => s.case_id === caseId)),
    profile: async (username: string, signal?: AbortSignal) => {
      if (username === current().username) return profile(current(),liveSolves());
      const value = await cached("profile:"+username,r => r.profile(username,signal),null);
      if (!value) throw new Error("This profile has not been downloaded yet. Reconnect to load it.");
      return value;
    },
    updateAccount: async (body: {bio: string}) => {
      if (current().isGuest) throw new Error("Sign in to edit your profile.");
      if (body.bio.length > 240) throw new Error("Your bio must be at most 240 characters.");
      await localMutation((workspace,id) => operation(workspace,id,"bio",0,body));
      const user = {...current(),bio:body.bio}; write("user",user); return user;
    },
    friends: () => cached("friends",r => r.friends(),[] as FriendDto[]),
    users: (query: string, signal?: AbortSignal) => cached("users:"+query,r => r.users(query,signal),[] as UserDto[]),
    sharedSolve: async (id: number) => {
      const solve = data().solves[id]; if (solve && !solve.deleted) return solve;
      return options.remote(options.getToken()).sharedSolve(id);
    },
    messages: async (peer: string,before?: number) => {
      const key = "messages:"+peer;
      const combine = (previous: ChatMessageDto[] | undefined, rows: ChatMessageDto[]) => [...new Map([...(previous ?? []),...rows].map(m => [m.id,m])).values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id-b.id).slice(-500);
      if (before !== undefined && options.getToken()) {
        // Explicit pagination can wait for the network; opening the conversation never does.
        try { const id = owner(); const rows = await options.remote(options.getToken()).messages(peer,before); await edit(id,d => { d.cache[key] = combine(d.cache[key] as ChatMessageDto[] | undefined,rows); }); return rows; } catch {}
      } else refreshCache(key,r => r.messages(peer),combine);
      const messages = (data().cache[key] ?? []) as ChatMessageDto[];
      return messages.filter(m => before === undefined || m.id > 0 && m.id < before).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id-b.id).slice(-50);
    },
    sendMessage: async (peer: string, body: SendMessageBody) => {
      if (current().isGuest) throw new Error("Sign in to send messages.");
      return localMutation((workspace,id) => {
        const pending = workspace.outbox.find(op => op.kind === "message" && op.body.clientId === body.clientId);
        const key = "messages:"+peer, rows = (workspace.cache[key] ?? []) as ChatMessageDto[];
        if (pending) return rows.find(m => m.id === pending.localId)!;
        const solve = body.solveId == null ? null : workspace.solves[body.solveId];
        if (body.solveId != null && (!solve || solve.deleted)) throw new Error("Unknown local solve.");
        const message: ChatMessageDto = {id:newId(),senderId:current().id,recipientId:peer,text:body.text,solve:solve ?? null,createdAt:new Date().toISOString()};
        workspace.cache[key] = [...rows,message];
        operation(workspace,id,"message",message.id,{peer,...body}); return message;
      });
    },
  };
  // Remote-only account/social actions must always use the current credentials.
  api.connectChat = () => options.remote(options.getToken()).connectChat();
  api.addFriend = async username => { const id = owner(); const value = await options.remote(options.getToken()).addFriend(username); await edit(id,d => {d.cache.friends=value;}); return value; };
  api.acceptFriend = async id => { const account = owner(); const value = await options.remote(options.getToken()).acceptFriend(id); await edit(account,d => {d.cache.friends=value;}); return value; };
  api.removeFriend = async id => { const account = owner(); const value = await options.remote(options.getToken()).removeFriend(id); await edit(account,d => {delete d.cache.friends;}); return value; };

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
  return { api, sync, restore, current,
    retry: async () => { await edit(owner(),d => { for (const op of d.outbox) delete op.error; }); await sync(); },
    status: () => status,
    changed: () => { notify(); schedule(); },
    stop: () => { stopped = true; clearTimeout(scheduled); },
  };
}
