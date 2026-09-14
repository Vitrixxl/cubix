import { expect, test } from "bun:test";
import { createApiClient } from "../src/client/api-client";
import { createLocalClient } from "../src/client/local/client";
import type { FriendDto } from "../src/shared/types";

const pending: FriendDto = { id: 1, userId: "bob", username: "bob", status: "pending", incoming: false };
const accepted: FriendDto = { ...pending, status: "accepted" };

async function device(friends: () => Promise<FriendDto[]>) {
  const values = new Map<string, string>();
  let token: string | null = null;
  const remote = {
    ...createApiClient("http://unused.invalid", { getToken: () => null }), friends,
    register: async () => ({ token: "test-token", user: { id: "alice", username: "alice", bio: "", isGuest: false, createdAt: "2026-01-01T00:00:00Z" } }),
  };
  const local = createLocalClient({ autoSync: false,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } },
    getToken: () => token, setToken: value => { token = value; }, clearToken: () => { token = null; }, remote: () => remote,
  });
  await local.api.register("alice", "test-password");
  return local;
}

test("a live social change bypasses the cache's refresh cooldown", async () => {
  let calls = 0, rows = [pending];
  const local = await device(async () => { calls++; return rows; });
  try {
    await local.api.friends(); await Bun.sleep(0);
    expect(await local.api.friends()).toEqual([pending]);
    expect(calls).toBe(1);
    rows = [accepted]; local.invalidateSocial();
    await local.api.friends(); await Bun.sleep(0);
    expect(await local.api.friends()).toEqual([accepted]);
    expect(calls).toBe(2);
  } finally { local.stop(); }
});

test("a notification during an older request triggers a fresh read after it settles", async () => {
  let calls = 0, release!: (rows: FriendDto[]) => void;
  const older = new Promise<FriendDto[]>(resolve => { release = resolve; });
  const local = await device(() => ++calls === 1 ? older : Promise.resolve([accepted]));
  try {
    await local.api.friends();
    local.invalidateSocial();
    await local.api.friends();
    expect(calls).toBe(1);
    release([pending]); await Bun.sleep(0);
    expect(await local.api.friends()).toEqual([accepted]);
    expect(calls).toBe(2);
  } finally { release([]); local.stop(); }
});
