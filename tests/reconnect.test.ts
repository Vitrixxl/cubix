import { afterEach, expect, mock, test } from "bun:test";
import { createApiClient } from "../src/client/api-client";
import { createLocalClient } from "../src/client/local/client";
import type { UserDto } from "../src/shared/types";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(stop => stop()));

function device() {
  const user: UserDto = { id: "account", username: "Alice", isGuest: false, createdAt: "2026-01-01T00:00:00.000Z" };
  const values = new Map([["cubix.local.v1:user", JSON.stringify(user)], ["token", "session"]]);
  const changed = mock(() => {});
  const remote = {
    ...createApiClient("http://unused.invalid", { getToken: () => null }),
    me: mock(async () => user),
    syncPull: mock(async (_cursor: number): Promise<Awaited<ReturnType<ReturnType<typeof createApiClient>["syncPull"]>>> => ({ changes: [], cursor: 0, more: false })),
    syncPush: mock(async (_ops: unknown[]) => ({ results: [{ id: "ack", value: null }] })),
  };
  const local = createLocalClient({
    autoSync: false,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } },
    getToken: () => values.get("token") ?? null,
    setToken: token => { values.set("token", token); }, clearToken: () => { values.delete("token"); },
    remote: () => remote, changed,
  });
  cleanup.push(local.stop);
  return { local, remote, changed, values };
}

test("reconnection refetches and uploads offline edits even with an unchanged server cursor", async () => {
  const { local, remote, changed } = device();
  await local.sync();
  await local.api.setLearned("PLL Aa", true);
  remote.me.mockRejectedValueOnce(new TypeError("Offline"));
  await local.sync();
  expect(local.status().state).toBe("offline");
  const before = changed.mock.calls.length;
  await local.reconnected();
  expect(remote.syncPull).toHaveBeenCalledTimes(2);
  expect(remote.syncPull).toHaveBeenLastCalledWith(0);
  expect(remote.syncPush).toHaveBeenCalledTimes(1);
  expect(local.status()).toEqual({ state: "synced", pending: 0 });
  expect(changed.mock.calls.length).toBe(before + 1);
  // Ordinary live notifications still skip data we already have.
  await local.remoteChanged(0);
  expect(remote.syncPull).toHaveBeenCalledTimes(2);
});

test("reconnection pulls changes missed during the outage and refreshes local readers", async () => {
  const { local, remote, changed } = device();
  await local.sync();
  remote.syncPull.mockResolvedValueOnce({
    changes: [{ kind: "learned_cases", id: 1, value: { id: 1, case_id: "PLL Ab", learned: 1, updated_at: "2026-09-25T12:00:00.000Z" } }],
    cursor: 1, more: false,
  });
  await local.reconnected();
  expect(local.learned()).toEqual(["PLL Ab"]);
  expect(changed).toHaveBeenCalledTimes(2);
});

test("reconnection waits for a pre-outage request to fail, then refetches once", async () => {
  const { local, remote } = device();
  const pending = Promise.withResolvers<UserDto>();
  remote.me.mockImplementationOnce(() => pending.promise);
  const previous = local.sync();
  const reconnect = local.reconnected();
  expect(local.reconnected()).toBe(reconnect);
  pending.reject(new TypeError("Connection lost"));
  await previous;
  await reconnect;
  expect(remote.me).toHaveBeenCalledTimes(2);
  expect(remote.syncPull).toHaveBeenCalledTimes(1);
  expect(local.status().state).toBe("synced");
});

test("a queued reconnect does not refresh after the client stops or the session changes", async () => {
  for (const stop of [true, false]) {
    const { local, remote, values } = device();
    const pending = Promise.withResolvers<UserDto>();
    remote.me.mockImplementationOnce(() => pending.promise);
    const previous = local.sync();
    const reconnect = local.reconnected();
    if (stop) local.stop(); else values.set("token", "another-session");
    pending.reject(new TypeError("Connection lost"));
    await previous;
    await reconnect;
    expect(remote.me).toHaveBeenCalledTimes(1);
    expect(remote.syncPull).not.toHaveBeenCalled();
  }
});
