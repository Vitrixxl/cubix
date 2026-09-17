import { puzzleId, type PuzzleInput, type PracticeFilter, type PuzzleId, type SolveMode, type ScrambleType, type CubeSize } from "../shared/puzzles";
import type { AuthDto, UserDto, CaseDto, SetDto, CaseStatsDto, CaseHistoryDto, SessionDto, SessionMode, SolveDto, Penalty, LearnedCaseDto } from "../shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface AddSolveBody { puzzle?: PuzzleId; solveMode?: SolveMode; scrambleType?: ScrambleType; cubeSize?: CubeSize; sessionId?: number | null; caseId?: string | null; timeMs: number; penalty?: Penalty; scramble?: string | null; comment?: string | null }
type LiveInput = { type: "auth"; token: string } | { type: "ping" };
/** `sync` carries the account's latest change cursor; devices behind it pull immediately. */
type LiveOutput = { type: "pong" }
  | { type: "ready"; cursor?: number }
  | { type: "sync"; cursor: number };
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
    syncPull: (after: number) => request<{ changes: { kind: "sessions" | "solves" | "learned_cases"; id: number; value: SessionDto | SolveDto | LearnedCaseDto | null }[]; cursor: number; more: boolean }>(`/sync?after=${after}`),
    syncPush: (operations: { id: string; method: string; path: string; body: unknown; createdAt?: string }[]) => request<{ results: { id: string; value: SessionDto | SolveDto | LearnedCaseDto | null }[] }>("/sync", "POST", { operations }),
    learnedCases: () => request<string[]>("/learned"),
    setLearned: (caseId: string, learned: boolean) => request<LearnedCaseDto>("/learned", "PUT", { caseId, learned }),
    /** Live sync notifications for the signed-in account; practice writes never depend on it. */
    connectLive: () => {
      const ws = new WebSocket(base.replace(/^http/, "ws") + "/live");
      return {
        ws,
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
    guest: () => request<AuthDto>("/auth/guest", "POST", undefined, undefined, true),
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
  };
}
