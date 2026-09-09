import { puzzleId, type PuzzleInput, type PracticeFilter, type PuzzleId, type SolveMode, type ScrambleType, type CubeSize } from "../shared/puzzles";
import type { AuthDto, UserDto, ProfileDto, FriendDto, ChatMessageDto, CaseDto, SetDto, CaseStatsDto, CaseHistoryDto, SessionDto, SessionMode, SolveDto, Penalty } from "../shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface SendMessageBody { text: string; solveId?: number; clientId: string }
export interface AddSolveBody { puzzle?: PuzzleId; solveMode?: SolveMode; scrambleType?: ScrambleType; cubeSize?: CubeSize; sessionId?: number | null; caseId?: string | null; timeMs: number; penalty?: Penalty; scramble?: string | null }
type ChatInput = { type: "auth"; token: string } | { type: "ping" } | ({ type: "send"; peer: string } & SendMessageBody);
type ChatOutput = { type: "ready" | "changed" | "pong" }
  | { type: "sent"; clientId: string; message: ChatMessageDto }
  | { type: "error"; clientId: string; status: number; error: string };
type ChatEvents = { open: Event; message: { data: ChatOutput }; close: CloseEvent; error: Event };

const practiceQuery = (puzzle: PuzzleInput, filter: PracticeFilter = {}) => new URLSearchParams({ puzzle: puzzleId(puzzle), solveMode: filter.solveMode ?? "standard", ...(filter.scrambleType ? {scrambleType: filter.scrambleType} : {}) }).toString();
/** Native browser HTTP/WebSocket client; the Rust server owns persistence and auth. */
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
    syncPull: (after: number) => request<{ changes: { kind: "sessions" | "solves"; id: number; value: SessionDto | SolveDto | null }[]; cursor: number; more: boolean }>(`/sync?after=${after}`),
    syncPush: (operations: { id: string; method: string; path: string; body: unknown; createdAt?: string }[]) => request<{ results: { id: string; value: SessionDto | SolveDto | UserDto | null }[] }>("/sync", "POST", { operations }),
    friends: () => request<FriendDto[]>("/social/friends"),
    addFriend: (username: string) => request<FriendDto[]>("/social/friends", "POST", { username }),
    acceptFriend: (id: number) => request<FriendDto[]>(`/social/friends/${id}/accept`, "POST"),
    removeFriend: (id: number) => request<{ ok: boolean }>(`/social/friends/${id}`, "DELETE"),
    sharedSolve: (id: number) => request<SolveDto>(`/social/solves/${id}`),
    messages: (peer: string, before?: number) => request<ChatMessageDto[]>(`/social/messages/${encodeURIComponent(peer)}${before === undefined ? "" : `?before=${before}`}`),
    sendMessage: (peer: string, body: SendMessageBody) => request<ChatMessageDto>(`/social/messages/${encodeURIComponent(peer)}`, "POST", body),
    connectChat: () => {
      const url = new URL(base + "/social/live"); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      return {
        ws,
        send: (message: ChatInput) => ws.send(JSON.stringify(message)),
        close: () => ws.close(),
        on<T extends keyof ChatEvents>(type: T, listener: (event: ChatEvents[T]) => void) {
          ws.addEventListener(type, event => {
            if (type === "message") {
              let data: ChatOutput;
              try { data = JSON.parse(String((event as MessageEvent).data)); } catch { return; }
              listener({ data } as ChatEvents[T]);
            } else listener(event as ChatEvents[T]);
          });
        },
      };
    },
    me: () => request<UserDto>("/auth/me", "GET", undefined, undefined, true),
    guest: () => request<AuthDto>("/auth/guest", "POST", undefined, undefined, true),
    register: (username: string, password: string) => request<AuthDto>("/auth/register", "POST", { username, password }, undefined, true),
    login: (username: string, password: string) => request<AuthDto>("/auth/login", "POST", { username, password }, undefined, true),
    logout: () => request<{ ok: boolean }>("/auth/logout", "POST", undefined, undefined, true),
    updateAccount: (body: { bio: string }) => request<UserDto>("/account", "PATCH", body),
    users: (query: string, signal?: AbortSignal) => request<UserDto[]>(`/users?q=${encodeURIComponent(query)}`, "GET", undefined, signal),
    profile: (username: string, signal?: AbortSignal, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<ProfileDto>(`/users/${encodeURIComponent(username)}?${practiceQuery(cubeSize, filter)}`, "GET", undefined, signal),
    sets: (cubeSize: PuzzleInput = 3) => request<SetDto[]>(`/sets?${practiceQuery(cubeSize)}`),
    cases: (cubeSize: PuzzleInput = 3) => request<CaseDto[]>(`/cases?${practiceQuery(cubeSize)}`),
    stats: (cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<CaseStatsDto[]>(`/stats?${practiceQuery(cubeSize, filter)}`),
    caseHistory: (caseId: string, filter: PracticeFilter = {}) => request<CaseHistoryDto>(`/cases/${encodeURIComponent(caseId)}/stats?${practiceQuery(3,filter)}`),
    createSession: (mode: SessionMode, caseIds: string[] = [], cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<SessionDto>("/sessions", "POST", { mode, caseIds, puzzle: puzzleId(cubeSize), ...filter }),
    solves: (mode: SessionMode, limit = 500, cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}) => request<SolveDto[]>(`/solves?mode=${mode}&limit=${limit}&${practiceQuery(cubeSize, filter)}`),
    addSolve: (body: AddSolveBody) => request<SolveDto>("/solves", "POST", body),
    deleteSolve: (id: number) => request<SolveDto>(`/solves/${id}`, "DELETE"),
    setPenalty: (id: number, penalty: Penalty) => request<SolveDto>(`/solves/${id}`, "PATCH", { penalty }),
  };
}
