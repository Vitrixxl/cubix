import { expect, test } from "bun:test";
import { runStartupUpdate, type StartupUpdateClient, type StartupPhase } from "../src/lib/startupUpdate";
const limits = { check: 30, download: 30 };
function client(overrides: Partial<StartupUpdateClient> = {}) {
  let attempt: string | null = null;
  const calls: string[] = [], phases: StartupPhase[] = [];
  const api: StartupUpdateClient = {
    enabled: true, currentId: "old",
    check: async () => { calls.push("check"); return "new"; },
    download: async () => { calls.push("download"); return "new"; },
    reload: async () => { calls.push("reload"); },
    attempted: () => attempt,
    remember: id => { attempt = id; }, clearAttempt: () => { attempt = null; },
    ...overrides,
  };
  return { api, calls, phases, run: () => runStartupUpdate(api, phase => phases.push(phase), limits) };
}
test("startup downloads and automatically reloads before allowing practice", async () => {
  let finish!: (id: string) => void;
  const c = client({ download: () => new Promise(resolve => { finish = resolve; }) });
  const result = c.run();
  await Bun.sleep(1);
  expect(c.phases).toEqual(["checking", "downloading"]);
  expect(c.calls).not.toContain("reload");
  finish("new");
  expect(await result).toBe("reloading");
  expect(c.calls).toContain("reload");
  expect(c.api.attempted()).toBe("new");
});
test("current, unavailable and development versions open without downloading", async () => {
  for (const overrides of [{ enabled: false }, { check: async () => null }, { check: async () => "old" }]) {
    const c = client(overrides); expect(await c.run()).toBe("ready");
    expect(c.calls).not.toContain("download"); expect(c.calls).not.toContain("reload");
  }
});
test("offline, failed downloads and failed reloads preserve the installed app", async () => {
  for (const method of ["check", "download", "reload"] as const) {
    const c = client({ [method]: async () => { throw Error("offline"); } });
    expect(await c.run()).toBe("ready"); expect(c.api.attempted()).toBeNull();
  }
});
test("a late check or download can never restart an already opened app", async () => {
  for (const method of ["check", "download"] as const) {
    let finish!: (id: string) => void;
    const c = client({ [method]: () => new Promise(resolve => { finish = resolve; }) });
    expect(await c.run()).toBe("ready");
    finish("new"); await Bun.sleep(1);
    expect(c.calls).not.toContain("reload");
  }
});
test("native rollback and restart failure cannot create an automatic reload loop", async () => {
  const c = client();
  expect(await c.run()).toBe("reloading");
  expect(await c.run()).toBe("ready");
  expect(c.calls.filter(call => call === "reload")).toHaveLength(1);
  c.api.check = async () => "fixed"; c.api.download = async () => "fixed";
  expect(await c.run()).toBe("reloading");
  expect(c.api.attempted()).toBe("fixed");
});

test("a queued check waits for Expo's native startup download", async () => {
  let active = true;
  let finish!: (id: string) => void;
  const c = client({ nativeDownloadActive: () => active, check: () => new Promise(resolve => { finish = resolve; }) });
  let settled = false;
  const result = runStartupUpdate(c.api, () => {}, { check: 40, download: 1000 }).then(value => { settled = true; return value; });
  await Bun.sleep(150);
  expect(settled).toBe(false);
  active = false; finish("new");
  expect(await result).toBe("reloading");
  expect(c.calls).toContain("reload");
});

test("a stuck native startup download still has a deadline", async () => {
  const c = client({ nativeDownloadActive: () => true, check: () => new Promise(() => {}) });
  expect(await runStartupUpdate(c.api, () => {}, { check: 10, download: 30 })).toBe("ready");
  expect(c.calls).not.toContain("reload");
});
