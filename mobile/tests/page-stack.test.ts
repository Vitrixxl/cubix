import { expect, mock, test } from "bun:test";
import { createStore } from "jotai";

mock.module("react-native", () => ({ Animated: {}, Easing: { bezier: () => (t: number) => t }, StyleSheet: { create: (styles: unknown) => styles }, View: "View", AccessibilityInfo: {} }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: { current: () => null } }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390 }) }));
const { slideOf } = await import("../src/components/PageStack");
const { TABS, goBackAtom, openTabAtom, routeAtom, routeOfUrl, tabOf, trainingSetupModeAtom, trainingStepAtom, urlOfRoute } = await import("../src/state");
import type { Route } from "../src/state";

test("the web phone's seven tabs; the account holds the community, tournaments and matches", () => {
  expect(TABS).toEqual(["timer", "algorithms", "learn", "train", "duel", "coaching", "profile"]);
  expect(tabOf("algorithms")).toBe("algorithms");
  expect(tabOf("duel")).toBe("duel");
  expect(tabOf("playground")).toBe("timer");
  expect(tabOf("match")).toBe("profile");
});

test("web addresses read as routes and back", () => {
  const cases: [string, Route][] = [
    ["/community/messages/4", { page: "community", view: "messages/4" }],
    ["/community/add/l%C3%A9na", { page: "community", view: "add/léna" }],
    ["/tournaments", { page: "tournaments" }],
    ["/match/9", { page: "match", id: 9 }],
    ["/coaching/call/abc", { page: "coaching", view: "call/abc" }],
    ["/coaching", { page: "coaching" }],
    ["/algorithms/OLL%201", { page: "algorithms", caseId: "OLL 1" }],
    ["/profile/achievements", { page: "profile", mode: "achievements" }],
    ["/timer", { page: "playground" }],
  ];
  for (const [url, route] of cases) {
    expect(routeOfUrl("https://cubix.vitrixxl.fr" + url)?.route).toEqual(route);
    expect(urlOfRoute(route)).toBe(url);
  }
  expect(routeOfUrl("/learn/cfop?puzzle=222&step=2")).toEqual({ route: { page: "learn", method: "cfop" }, puzzle: "222" });
  expect(routeOfUrl("/profile/analysis")?.route).toEqual({ page: "profile" });
  expect(routeOfUrl("/solve/abc")).toBeNull();
  expect(routeOfUrl("/match/x")).toBeNull();
});

test("another tab opens immediately; a page opened inside a tab slides in from the right and back from the left", () => {
  expect(slideOf({ page: "playground" }, { page: "profile" }, "push")).toEqual({ kind: "none" });
  expect(slideOf({ page: "learn" }, { page: "learn", method: "cfop" }, "push")).toEqual({ kind: "slide", direction: 1 });
  expect(slideOf({ page: "learn", method: "cfop" }, { page: "learn" }, "pop")).toEqual({ kind: "slide", direction: -1 });
  // The account's sections are tabs of its page; Messages opens over it.
  expect(slideOf({ page: "profile" }, { page: "profile", mode: "training" }, "push")).toEqual({ kind: "none" });
  expect(slideOf({ page: "profile" }, { page: "community" }, "push")).toEqual({ kind: "slide", direction: 1 });
  expect(slideOf({ page: "training" }, { page: "duel" }, "push")).toEqual({ kind: "none" });
});

test("a case of the library slides itself; a conversation slides over Messages", () => {
  expect(slideOf({ page: "learn" }, { page: "algorithms" }, "replace")).toEqual({ kind: "none" });
  expect(slideOf({ page: "community" }, { page: "community", view: "messages/4" }, "push")).toEqual({ kind: "slide", direction: 1 });
  expect(slideOf({ page: "algorithms" }, { page: "algorithms", caseId: "OLL 1" }, "push")).toEqual({ kind: "none" });
});

test("reduced motion swaps pages without moving", () => {
  expect(slideOf({ page: "playground" }, { page: "learn" }, "push", true)).toEqual({ kind: "none" });
  expect(slideOf({ page: "learn" }, { page: "learn", method: "cfop" }, "push", true)).toEqual({ kind: "none" });
});

test("a tab comes back to the page it showed last", () => {
  const store = createStore();
  store.set(routeAtom, { page: "learn", method: "cfop" });
  store.set(openTabAtom, "profile");
  expect(store.get(routeAtom)).toEqual({ page: "profile" });
  store.set(openTabAtom, "learn");
  expect(store.get(routeAtom)).toEqual({ page: "learn", method: "cfop" });
});

test("tapping the current tab goes back to its first page and drops the pages opened in it", () => {
  const store = createStore();
  store.set(routeAtom, { page: "profile" });
  store.set(routeAtom, { page: "profile", mode: "achievements" });
  store.set(openTabAtom, "profile");
  expect(store.get(routeAtom)).toEqual({ page: "profile" });
  // Nothing left of the section to come back to.
  store.set(goBackAtom);
  expect(store.get(routeAtom)).not.toEqual({ page: "profile", mode: "achievements" });
});

test("the library's tab button closes the case shown, and stays in the library", () => {
  const store = createStore();
  store.set(routeAtom, { page: "algorithms" });
  store.set(routeAtom, { page: "algorithms", caseId: "OLL 1" });
  store.set(openTabAtom, "algorithms");
  expect(store.get(routeAtom)).toEqual({ page: "algorithms" });
});

test("tapping Train again leaves a session for the ways to practise", () => {
  const store = createStore();
  store.set(routeAtom, { page: "training" });
  store.set(trainingSetupModeAtom, "practice");
  store.set(trainingStepAtom, "practice");
  store.set(openTabAtom, "train");
  expect(store.get(trainingStepAtom)).toBe("setup");
  expect(store.get(trainingSetupModeAtom)).toBe("");
  // The duel has a tab of its own; Train comes back to the list from it.
  store.set(openTabAtom, "duel");
  expect(store.get(routeAtom)).toEqual({ page: "duel" });
  store.set(openTabAtom, "train");
  expect(store.get(routeAtom)).toEqual({ page: "training" });
});

test("a training started from a selection does not start again when its tab is reopened", () => {
  const store = createStore();
  store.set(routeAtom, { page: "training", autostart: true });
  store.set(openTabAtom, "timer");
  store.set(openTabAtom, "train");
  expect(store.get(routeAtom)).toEqual({ page: "training" });
});
