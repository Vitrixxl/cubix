import { createApiClient } from "./api-client";
export { ApiError } from "./api-client";

/** The browser always uses the web server and its local SQLite database. */
export const API_BASE = "";

export const tokenKey = `cubix.auth:${API_BASE || window.location.origin}`;
export const authToken = {
  get: () => localStorage.getItem(tokenKey),
  set: (token: string) => localStorage.setItem(tokenKey, token),
  clear: () => localStorage.removeItem(tokenKey),
};

export const api = createApiClient(API_BASE || window.location.origin, {
  getToken: authToken.get,
  onSessionExpired: () => window.dispatchEvent(new Event("cubix-session-expired")),
});
