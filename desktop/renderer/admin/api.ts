/** The administration's client: the admin API under its HttpOnly cookie, the page's address as its router, and the live
 * socket. Nothing here touches the app's data engine. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

export class AdminError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type LogRow = {
  id: number;
  at: number;
  ip: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId: string | null;
  username: string | null;
  userAgent: string | null;
  kind: string;
  important: boolean;
};
export type Day = { day: string; requests: number; ips: number; errors: number; serverErrors: number; limited: number; signups: number; registrations: number; active: number; solves: number; duels: number };
export type Overview = {
  users: { total: number; registered: number; guests: number; new: { today: number; d7: number; d30: number }; active: { today: number; d7: number; d30: number } };
  solves: { total: number; today: number; d7: number };
  requests: { today: number; errorsToday: number; serverErrorsToday: number; rateLimitedToday: number };
  ips: { today: number; d7: number; d30: number; live: number };
  duels: { total: number; today: number; d7: number };
  series: Day[];
  server: {
    now: number;
    startedAt: number;
    uptimeMs: number;
    version: string;
    build: number | string | null;
    commit: string | null;
    db: { bytes: number; freeBytes: number; logRows: number; importantLogRows: number; oldestLogAt: number | null };
    log: { retentionDays: number; maxRows: number; maxImportantRows: number; trafficDays: number; dropped: number };
  };
};
export type UserRow = {
  id: string;
  username: string;
  isGuest: boolean;
  createdAt: number;
  lastSeenAt: number | null;
  solves: number;
  solves7d: number;
  learnedCases: number;
  duels: number;
  activeSessions: number;
  lastSolveAt: number | null;
};
export type Users = { counts: { all: number; registered: number; guests: number }; total: number; rows: UserRow[]; page: number; limit: number };
export type UserDetail = {
  user: UserRow & { practiceSessions: number };
  puzzles: { puzzleId: string; solveMode: string; solves: number; dnf: number; trainingSolves: number; bestMs: number | null; meanMs: number | null; lastAt: number | null }[];
  activity: { day: string; requests: number; active: boolean; solves: number }[];
  recentSolves: { id: number; at: number; timeMs: number; penalty: string; effectiveMs: number | null; puzzleId: string; solveMode: string; scrambleType: string; caseId: string | null }[];
  recentRequests: LogRow[];
  sessions: { id: string; createdAt: number; lastUsedAt: number | null; expiresAt: number }[];
  duels: { played: number; won: number; lost: number; drawn: number; recent: { id: number; endedAt: number; event: string; opponent: string; opponentId: string | null; ao5: number | null; opponentAo5: number | null; result: "win" | "loss" | "draw" }[] };
  ips: { ip: string; days: number; lastDay: string }[];
};
/** `total` stops at 10 000 matching rows; `totalCapped` says there are more. */
export type Requests = { rows: LogRow[]; total: number; totalCapped: boolean; page: number; limit: number; kinds: string[] };
export type IpRow = {
  ip: string;
  requests: number;
  errors: number;
  serverErrors: number;
  limited: number;
  firstSeenAt: number;
  lastSeenAt: number;
  activeDays: number;
  userCount: number;
  users: { id: string; username: string; isGuest: boolean }[];
};
export type Ips = { days: number; since: string; rows: IpRow[]; total: number; totals: { ips: number; requests: number; errors: number; limited: number }; page: number; limit: number };

/** Called when the admin session is refused: the shell returns to the token screen. */
let expired: (message: string) => void = () => {};
export const onExpired = (handler: (message: string) => void) => {
  expired = handler;
};

export async function admin<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/admin" + path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      signal: init.signal,
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new AdminError(0, "The server cannot be reached.");
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof value?.error === "string" ? value.error : `The server answered ${response.status}.`;
    if ((response.status === 401 || response.status === 503) && path !== "/login" && path !== "/session") expired(message);
    throw new AdminError(response.status, message);
  }
  return value as T;
}

/** The moment the last view data arrived, for the header. */
let refreshed = 0;
const refreshListeners = new Set<() => void>();
export function useRefreshed() {
  return useSyncExternalStore(
    (fn) => (refreshListeners.add(fn), () => refreshListeners.delete(fn)),
    () => refreshed,
  );
}
function markRefreshed() {
  refreshed = Date.now();
  refreshListeners.forEach((fn) => fn());
}

/** Asks the current view to fetch again (the header's refresh button). */
let generation = 0;
const generationListeners = new Set<() => void>();
export function refreshAll() {
  generation++;
  generationListeners.forEach((fn) => fn());
}
function useGeneration() {
  return useSyncExternalStore(
    (fn) => (generationListeners.add(fn), () => generationListeners.delete(fn)),
    () => generation,
  );
}

/**
 * A GET of the admin API. `data` stays while the same path reloads (live refreshes, the refresh button) and is dropped
 * when the path changes unless `keep` is set (a table paging or sorting keeps its rows until the next ones arrive).
 */
export function useAdmin<T>(path: string | null, { tick = 0, keep = false }: { tick?: number; keep?: boolean } = {}) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: AdminError | null; loading: boolean }>({
    path,
    data: null,
    error: null,
    loading: !!path,
  });
  const [retry, setRetry] = useState(0);
  const all = useGeneration();
  const last = useRef(path);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const changed = last.current !== path;
    last.current = path;
    setState((s) => ({ path, data: changed && !keep ? null : s.data, error: null, loading: true }));
    admin<T>(path, { signal: controller.signal }).then(
      (data) => {
        markRefreshed();
        setState({ path, data, error: null, loading: false });
      },
      (error) => {
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, error: error instanceof AdminError ? error : new AdminError(0, String(error?.message ?? error)), loading: false }));
      },
    );
    return () => controller.abort();
  }, [path, tick, retry, all]);
  const reload = useCallback(() => setRetry((n) => n + 1), []);
  return { ...state, reload };
}

/** The accounts with the most solves in the last 7 days (only those with some), the busiest first. */
export function useMostActive(tick = 0, limit = 8) {
  return useAdmin<Users>(`/users?sort=solves7d&limit=${limit}`, { tick });
}

/** The address as the router: /admin, /admin/users, /admin/users/<id>, /admin/requests, /admin/ips, /admin/server. */
const routeListeners = new Set<() => void>();
addEventListener("popstate", () => routeListeners.forEach((fn) => fn()));
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  routeListeners.forEach((fn) => fn());
  document.querySelector("[data-admin-scroll]")?.scrollTo({ top: 0 });
}
export function useRoute() {
  const href = useSyncExternalStore(
    (fn) => (routeListeners.add(fn), () => routeListeners.delete(fn)),
    () => location.pathname + location.search,
  );
  const url = new URL(href, location.origin);
  const parts = url.pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] ?? "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "", params: url.searchParams };
}
/** The same view with some query parameters changed; empty values are removed. */
export function withParams(params: URLSearchParams, changes: Record<string, string | number | null | undefined>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const text = next.toString();
  return location.pathname + (text ? "?" + text : "");
}

/**
 * The live socket: connected or not, a `tick` that moves at most every `every` ms while traffic arrives (views refetch
 * on it), and each new important request as it is stored. The server only says `changed` (at most every 500 ms, never
 * for the administration's own requests) and sends no data but the important rows.
 */
export function useLive(enabled: boolean, every = 5000) {
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);
  const [important, setImportant] = useState<LogRow[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | undefined,
      stopped = false,
      retry: ReturnType<typeof setTimeout> | undefined,
      pending: ReturnType<typeof setTimeout> | undefined,
      lastTick = 0;
    const bump = () => {
      const wait = lastTick + every - Date.now();
      if (wait <= 0) {
        lastTick = Date.now();
        setTick((n) => n + 1);
      } else if (!pending)
        pending = setTimeout(() => {
          pending = undefined;
          bump();
        }, wait);
    };
    const open = () => {
      const current = new WebSocket(location.origin.replace(/^http/, "ws") + "/api/admin/live");
      socket = current;
      current.onopen = () => {
        current.send(JSON.stringify({ type: "subscribe", live: true, filters: {} }));
        setConnected(true);
      };
      current.onmessage = (event) => {
        let message: any;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === "changed") bump();
        else if (message.type === "important") {
          setImportant((rows) => (rows.some((r) => r.id === message.data.id) ? rows : [message.data, ...rows].slice(0, 100)));
          bump();
        }
      };
      current.onclose = (event) => {
        if (socket !== current) return;
        setConnected(false);
        if (stopped) return;
        if (event.code === 4001) return expired(event.reason || "Admin session expired");
        retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(pending);
      socket?.close();
      setConnected(false);
    };
  }, [enabled, every]);
  return { connected, tick, important };
}

/** The live socket's state, shared by the shell with every view. */
export const LiveContext = createContext<{ connected: boolean; tick: number; important: LogRow[] }>({ connected: false, tick: 0, important: [] });
export const useLiveState = () => useContext(LiveContext);

/** The list a detail was opened from, with its filters and page, for the detail's back button. */
export const listUrl = { users: "/admin/users" };
