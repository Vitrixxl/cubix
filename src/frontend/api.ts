import { createApiClient } from "./api-client";
import { createLocalClient, type SyncStatus } from "./local/client";
export { ApiError } from "./api-client";
export const API_BASE = "";
export const tokenKey = `cubix.auth:${window.location.origin}`;
export const authToken = {
  get: () => localStorage.getItem(tokenKey),
  set: (token: string) => localStorage.setItem(tokenKey, token),
  clear: () => localStorage.removeItem(tokenKey),
};
export const local = createLocalClient({
  storage: localStorage, getToken: authToken.get, setToken: authToken.set, clearToken: authToken.clear,
  remote: token => createApiClient(window.location.origin,{getToken: () => token}),
  changed: () => window.dispatchEvent(new Event("cubix-local-changed")),
  status: (status: SyncStatus) => window.dispatchEvent(new CustomEvent("cubix-sync-status",{detail:status})),
  lock: async (name,action) => await (navigator.locks ? navigator.locks.request(name,action) : action()),
});
export const api = local.api;
