import { createApiClient } from "../../src/client/api-client";
import { createLocalClient, type SyncStatus } from "../../src/client/local/client";
import { storage } from "./platform/storage";
import { createEvent } from "./platform/events";
export { ApiError } from "../../src/client/api-client";

/** Production API by default; `EXPO_PUBLIC_API_ORIGIN` points a development build at a local server. */
export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
export const tokenKey = `cubix.auth:${API_ORIGIN}`;
export const authToken = {
  get: () => storage.getItem(tokenKey),
  set: (token: string) => storage.setItem(tokenKey, token),
  clear: () => storage.removeItem(tokenKey),
};
/** Fired after any local write, exactly like the `cubix-local-changed` window event on the web. */
export const localChanged = createEvent();
export const syncStatusChanged = createEvent<SyncStatus>();

export const local = createLocalClient({
  storage, getToken: authToken.get, setToken: authToken.set, clearToken: authToken.clear,
  remote: token => createApiClient(API_ORIGIN, { getToken: () => token }),
  changed: () => localChanged.emit(),
  status: status => syncStatusChanged.emit(status),
});
export const api = local.api;
