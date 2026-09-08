import { afterEach, expect, test } from "vitest";
import { initialRoute, LAST_TAB_KEY, parseRoute, rememberTab } from "../src/frontend/lib/navigation";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

function browser(saved: string | null = null, history: unknown = null) {
  const storage = new Map(saved === null ? [] : [[LAST_TAB_KEY, saved]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    history: { state: { cubixRoute: history } },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  } });
  return storage;
}

test("last tab survives reopening without replaying a transient action", () => {
  for (const page of ["algorithms", "training", "playground", "community", "messages", "profile"] as const) {
    browser();
    rememberTab({ page });
    expect(initialRoute()).toEqual({ page });
  }
  const storage = browser();
  rememberTab({ page: "messages", solveId: 12 });
  expect(storage.get(LAST_TAB_KEY)).toBe('{"page":"messages"}');
  expect(initialRoute()).toEqual({ page: "messages" });
  browser('{"page":"training","autostart":true}');
  expect(initialRoute()).toEqual({ page: "training" });
});

test("current history entry takes priority over the last tab from another window", () => {
  browser('{"page":"playground"}', { page: "algorithms", caseId: "PLL T" });
  expect(initialRoute()).toEqual({ page: "algorithms", caseId: "PLL T" });
});

test("profile case navigation restores the member and case without replaying it in a new tab", () => {
  const route = { page: "profile", username: "another_cuber", mode: "training", caseId: "F2L 7" } as const;
  browser(null, route);
  expect(initialRoute()).toEqual(route);
  const storage = browser();
  rememberTab(route);
  expect(storage.get(LAST_TAB_KEY)).toBe('{"page":"profile"}');
  expect(initialRoute()).toEqual({ page: "profile" });
  expect(parseRoute({ page: "profile", mode: "invalid", caseId: 42 })).toEqual({ page: "profile" });
});

test("invalid routes and unavailable storage fall back safely", () => {
  for (const saved of ["broken", "null", "[]", '{"page":"unknown"}']) {
    browser(saved, { page: "unknown" });
    expect(initialRoute()).toEqual({ page: "algorithms" });
  }
  expect(parseRoute({ page: "messages", solveId: -1 })).toEqual({ page: "messages" });
  expect(parseRoute({ page: "profile", username: {} })).toEqual({ page: "profile" });
  browser();
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
  expect(initialRoute()).toEqual({ page: "algorithms" });
  expect(() => rememberTab({ page: "training" })).not.toThrow();
});
