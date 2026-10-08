import { puzzleId, type PuzzleInput, type PracticeFilter, type PuzzleId, type SolveMode, type ScrambleType, type CubeSize } from "../shared/puzzles";
import type { AuthDto, UserDto, CaseDto, SetDto, CaseStatsDto, CaseHistoryDto, SessionDto, SessionMode, SolveDto, Penalty, LearnedCaseDto, LearningGroupOrderDto } from "../shared/types";
import type { JourneyEntryDto } from "./lib/journey";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface AddSolveBody { puzzle?: PuzzleId; solveMode?: SolveMode; scrambleType?: ScrambleType; cubeSize?: CubeSize; sessionId?: number | null; caseId?: string | null; timeMs: number; penalty?: Penalty; scramble?: string | null; comment?: string | null; solution?: string | null }
export interface SyncPage { changes: { kind: "sessions" | "solves" | "learned_cases" | "learning_group_orders" | "personal_entries"; id: number; value: SessionDto | SolveDto | LearnedCaseDto | LearningGroupOrderDto | JourneyEntryDto | null }[]; cursor: number; more: boolean }
export interface SyncOperation { id: string; method: string; path: string; body: unknown; createdAt?: string }
export interface SyncResult { results: { id: string; value: SessionDto | SolveDto | LearnedCaseDto | LearningGroupOrderDto | JourneyEntryDto | null }[] }
type LiveInput = { type: "auth"; token: string; protocol?: 2; after?: number } | { type: "ping" };
export type LiveOutput = { type: "pong" }
  | { type: "ready"; cursor?: number; protocol?: 2; user?: UserDto }
  | { type: "sync"; cursor: number }
  | ({ type: "changes"; after: number } & SyncPage)
  | { type: "result"; requestId: string; value?: unknown; error?: string; status?: number };
type LiveEvents = { open: Event; message: { data: LiveOutput }; close: CloseEvent; error: Event };

const practiceQuery = (puzzle: PuzzleInput, filter: PracticeFilter = {}) => new URLSearchParams({ puzzle: puzzleId(puzzle), solveMode: filter.solveMode ?? "standard", ...(filter.scrambleType ? {scrambleType: filter.scrambleType} : {}) }).toString();
/** Shared HTTP/WebSocket client; the Rust server owns persistence and auth. */
export function createApiClient(origin: string, options: { getToken: () => string | null; onSessionExpired?: () => void }) {
  const base = origin.replace(/\/$/, "") + "/api";
  async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal, auth = false): Promise<T> {
    const token = options.getToken();
    const response = await fetch(base + path, {
      method, signal: signal ?? AbortSignal.timeout(10000),
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !auth) options.onSessionExpired?.();
      throw new ApiError(response.status, typeof value?.error === "string" ? value.error : "Something went wrong. Please try again.");
    }
    return value as T;
  }
  return {
    syncPull: (after: number) => request<SyncPage>(`/sync?after=${after}&learningGroups=1&journey=1`),
    syncPush: (operations: SyncOperation[]) => request<SyncResult>("/sync", "POST", { operations }),
    setLearningGroupOrder: (track: LearningGroupOrderDto["track"], groups: string[]) => request<LearningGroupOrderDto>("/learning-group-order", "PUT", { track, groups }),
    learnedCases: () => request<string[]>("/learned"),
    /** The account and everything it holds, for good; the password confirms it (a wrong one is a 401, not an expiry). */
    deleteAccount: (password: string) => request<{ ok: true }>("/account/delete", "POST", { password }, undefined, true),
    setLearned: (caseId: string, learned: boolean, algs?: string[]) => request<LearnedCaseDto>("/learned", "PUT", { caseId, learned, ...(algs?.length ? { algs } : {}) }),
    algorithmChoices: (caseIds: string[]) => request<Record<string, { total: number; algs: Record<string, number> }>>(`/algorithm-choices?cases=${caseIds.map(encodeURIComponent).join(",")}`),
    /** Incremental account sync; durable uploads can fall back to HTTP after disconnection. */
    connectLive: () => {
      const ws = new WebSocket(base.replace(/^http/, "ws") + "/live");
      const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
      const rpc = <T>(type: "push" | "pull", body: object): Promise<T> => new Promise((resolve, reject) => {
        if (ws.readyState !== WebSocket.OPEN) { reject(new TypeError("Connection closed")); return; }
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => { pending.delete(requestId); reject(new TypeError("Synchronization timed out")); ws.close(); }, 15000);
        pending.set(requestId, { resolve, reject, timer });
        try { ws.send(JSON.stringify({ type, requestId, ...body })); }
        catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
      });
      ws.addEventListener("message", event => {
        let data: LiveOutput;
        try { data = JSON.parse(String(event.data)); } catch { return; }
        if (data.type !== "result") return;
        const job = pending.get(data.requestId); if (!job) return;
        clearTimeout(job.timer); pending.delete(data.requestId);
        if (data.error) job.reject(new ApiError(data.status ?? 500, data.error)); else job.resolve(data.value);
      });
      ws.addEventListener("close", () => {
        for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new TypeError("Connection closed")); }
        pending.clear();
      });
      return {
        ws,
        syncPull: (after: number) => rpc<SyncPage>("pull", { after }),
        syncPush: (operations: SyncOperation[]) => rpc<SyncResult>("push", { operations }),
        send: (message: LiveInput) => ws.send(JSON.stringify(message)),
        close: () => ws.close(),
        on<T extends keyof LiveEvents>(type: T, listener: (event: LiveEvents[T]) => void) {
          ws.addEventListener(type, event => {
            if (type === "message") {
              let data: LiveOutput;
              try { data = JSON.parse(String((event as MessageEvent).data)); } catch { return; }
              listener({ data } as LiveEvents[T]);
            } else listener(event as LiveEvents[T]);
          });
        },
      };
    },
    me: () => request<UserDto>("/auth/me", "GET", undefined, undefined, true),
    register: (username: string, password: string) => request<AuthDto>("/auth/register", "POST", { username, password }, undefined, true),
    login: (username: string, password: string) => request<AuthDto>("/auth/login", "POST", { username, password }, undefined, true),
    logout: () => request<{ ok: boolean }>("/auth/logout", "POST", undefined, undefined, true),
    sets: (cubeSize: PuzzleInput = 3, signal?: AbortSignal) => request<SetDto[]>(`/sets?${practiceQuery(cubeSize)}`, "GET", undefined, signal),
    cases: (cubeSize: PuzzleInput = 3, signal?: AbortSignal) => request<CaseDto[]>(`/cases?${practiceQuery(cubeSize)}`, "GET", undefined, signal),
    stats: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<CaseStatsDto[]>(`/stats?${practiceQuery(cubeSize, filter)}`),
    caseHistory: (caseId: string, filter: PracticeFilter = {}) => request<CaseHistoryDto>(`/cases/${encodeURIComponent(caseId)}/stats?${practiceQuery(3,filter)}`),
    createSession: (mode: SessionMode, caseIds: string[] = [], cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<SessionDto>("/sessions", "POST", { mode, caseIds, puzzle: puzzleId(cubeSize), ...filter }),
    solves: (mode: SessionMode, limit = 500, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<SolveDto[]>(`/solves?mode=${mode}&limit=${limit}&${practiceQuery(cubeSize, filter)}`),
    addSolve: (body: AddSolveBody) => request<SolveDto>("/solves", "POST", body),
    deleteSolve: (id: number) => request<SolveDto>(`/solves/${id}`, "DELETE"),
    setPenalty: (id: number, penalty: Penalty) => request<SolveDto>(`/solves/${id}`, "PATCH", { penalty }),
    /** An empty or null comment clears the note. */
    setComment: (id: number, comment: string | null) => request<SolveDto>(`/solves/${id}`, "PATCH", { comment }),
    /** The turns of a solve, as written by hand (see `lib/solution`); null clears them. */
    setSolution: (id: number, solution: string | null) => request<SolveDto>(`/solves/${id}`, "PATCH", { solution }),
    /** The token of the link that shares a solve, made on the first call. */
    shareSolve: (id: number) => request<{ token: string }>(`/solves/${id}/share`, "POST"),
  };
}
