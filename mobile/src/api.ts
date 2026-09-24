import { createApiClient } from "../../src/client/api-client";
import { createLocalClient, type SyncStatus } from "../../src/client/local/client";
import { storage } from "./platform/storage";
import { createEvent } from "./platform/events";
import Constants from "expo-constants";
import { apiOrigin } from "./lib/apiOrigin";
export { ApiError } from "../../src/client/api-client";

/** app.config.ts configures both OTA delivery and API traffic for the running update. */
export const API_ORIGIN = apiOrigin(Constants.expoConfig?.updates?.url);
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
