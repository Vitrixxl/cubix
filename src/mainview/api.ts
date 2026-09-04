import type { AuthDto, UserDto, ProfileDto, CaseDto, CaseHistoryDto, CaseStatsDto, Penalty, SessionDto, SessionMode, SetDto, SolveDto } from "../shared/types";

/**
 * API base URL. Inside Electrobun the page is served from views:// and the main process
 * passes the API origin as ?api=...; in browser dev mode the API is same-origin.
 */
export const API_BASE: string = (() => {
  const fromQuery = new URLSearchParams(window.location.search).get("api");
  if (fromQuery) return fromQuery.replace(/\/$/, "");
  if (window.location.protocol.startsWith("http")) return "";
  return "http://127.0.0.1:47129";
})();

export const tokenKey = `cubix.auth:${API_BASE || window.location.origin}`;
export const authToken = {
  get: () => localStorage.getItem(tokenKey),
  set: (token: string) => localStorage.setItem(tokenKey, token),
  clear: () => localStorage.removeItem(tokenKey),
};
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(API_BASE + path, {
    ...rest,
    headers: { ...(authToken.get() ? { authorization: `Bearer ${authToken.get()}` } : {}), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("cubix-session-expired"));
    throw new ApiError(res.status, error?.error ?? "Something went wrong. Please try again.");
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<UserDto>("/api/auth/me"),
  guest: () => request<AuthDto>("/api/auth/guest", { method: "POST" }),
  register: (username: string, displayName: string, password: string) => request<AuthDto>("/api/auth/register", { method: "POST", json: { username, displayName, password } }),
  login: (username: string, password: string) => request<AuthDto>("/api/auth/login", { method: "POST", json: { username, password } }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  updateAccount: (body: { displayName: string; bio: string; isPrivate: boolean }) => request<UserDto>("/api/account", { method: "PATCH", json: body }),
  users: (query: string, signal?: AbortSignal) => request<UserDto[]>(`/api/users?q=${encodeURIComponent(query)}`, { signal }),
  profile: (username: string, signal?: AbortSignal) => request<ProfileDto>(`/api/users/${encodeURIComponent(username)}`, { signal }),
  sets: () => request<SetDto[]>("/api/sets"),
  cases: () => request<CaseDto[]>("/api/cases"),
  stats: () => request<CaseStatsDto[]>("/api/stats"),
  caseHistory: (caseId: string) => request<CaseHistoryDto>(`/api/cases/${encodeURIComponent(caseId)}/stats`),
  createSession: (mode: SessionMode, caseIds: string[] = []) => request<SessionDto>("/api/sessions", { method: "POST", json: { mode, caseIds } }),
  solves: (mode: SessionMode, limit = 500) => request<SolveDto[]>(`/api/solves?mode=${mode}&limit=${limit}`),
  addSolve: (body: { sessionId: number | null; caseId: string | null; timeMs: number; scramble?: string | null; penalty?: Penalty }) =>
    request<SolveDto>("/api/solves", { method: "POST", json: body }),
  deleteSolve: (id: number) => request<SolveDto>(`/api/solves/${id}`, { method: "DELETE" }),
  setPenalty: (id: number, penalty: Penalty) => request<SolveDto>(`/api/solves/${id}`, { method: "PATCH", json: { penalty } }),
};
