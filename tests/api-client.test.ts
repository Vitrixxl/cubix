import { afterEach, expect, test } from "bun:test";
import { createApi, openDb } from "./backend";
import { ApiError, createApiClient } from "../src/frontend/api-client";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); });

function setup() {
  const db = openDb(":memory:");
  const app = createApi(db).listen({ port: 0, hostname: "127.0.0.1" });
  cleanup.push(() => { app.server?.stop(true); db.db.close(); });
  let token: string | null = null;
  let expired = 0;
  const api = createApiClient(`http://127.0.0.1:${app.server!.port}`, {
    getToken: () => token,
    onSessionExpired: () => { expired++; },
  });
  return { api, setToken: (value: string) => { token = value; }, expired: () => expired };
}

test("Native client preserves authentication, dates and parameterized solve/history routes", async () => {
  const { api, setToken } = setup();
  const guest = await api.guest();
  setToken(guest.token);
  expect((await api.me()).id).toBe(guest.user.id);
  expect(typeof guest.user.createdAt).toBe("string");
  expect((await api.sets()).length).toBeGreaterThan(0);
  const c = (await api.cases()).find(c => c.id === "PLL Aa")!;
  const session = await api.createSession("training", [c.id]);
  const solve = await api.addSolve({ sessionId: session.id, caseId: c.id, timeMs: 1250 });
  expect((await api.caseHistory(c.id)).history[0].id).toBe(solve.id);
  expect((await api.solves("training"))[0].created_at).toBe(solve.created_at);
  expect((await api.setPenalty(solve.id, "+2")).penalty).toBe("+2");
  const account = await api.register("native_user", "a-long-test-password");
  setToken(account.token);
  expect(account.user.id).toBe(guest.user.id);
  expect((await api.updateAccount({ bio: "Testing HTTP" })).bio).toBe("Testing HTTP");
  expect((await api.users("native_user"))[0].username).toBe("native_user");
  expect((await api.profile("native_user")).totalSolves).toBe(1);
  await api.deleteSolve(solve.id);
  expect(await api.solves("training")).toEqual([]);
});

test("Native client preserves API errors, session expiry and request cancellation", async () => {
  const { api, setToken, expired } = setup();
  await expect(api.login("missing", "incorrect")).rejects.toMatchObject({ status: 401, message: "Incorrect username or password." });
  expect(expired()).toBe(0);
  const guest = await api.guest();
  setToken(guest.token);
  await expect(api.deleteSolve(-1)).rejects.toBeInstanceOf(ApiError);
  const controller = new AbortController();
  controller.abort();
  await expect(api.users("test", controller.signal)).rejects.toThrow();
  await api.logout();
  await expect(api.stats()).rejects.toMatchObject({ status: 401 });
  expect(expired()).toBe(1);
});
