import { expect, mock, test } from "bun:test";
import { createStore } from "jotai";

mock.module("react-native", () => ({ Animated: {}, Easing: { bezier: () => (t: number) => t }, StyleSheet: { create: (styles: unknown) => styles }, View: "View", AccessibilityInfo: {} }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: { current: () => null } }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390 }) }));
const { slideOf } = await import("../src/components/PageStack");
const { TABS, goBackAtom, openTabAtom, routeAtom, tabOf, trainingSetupModeAtom, trainingStepAtom } = await import("../src/state");

test("five tabs: the timer, practice, the duel, learning and the profile", () => {
  expect(TABS).toEqual(["timer", "train", "battle", "learn", "profile"]);
  expect(tabOf("algorithms")).toBe("learn");
  expect(tabOf("duel")).toBe("battle");
  expect(tabOf("playground")).toBe("timer");
});

test("another tab opens immediately; a page opened inside a tab slides in from the right and back from the left", () => {
  expect(slideOf({ page: "playground" }, { page: "profile" }, "push")).toEqual({ kind: "none" });
  expect(slideOf({ page: "learn" }, { page: "learn", method: "cfop" }, "push")).toEqual({ kind: "slide", direction: 1 });
  expect(slideOf({ page: "learn", method: "cfop" }, { page: "learn" }, "pop")).toEqual({ kind: "slide", direction: -1 });
  expect(slideOf({ page: "profile" }, { page: "profile", mode: "training" }, "push")).toEqual({ kind: "slide", direction: 1 });
  expect(slideOf({ page: "training" }, { page: "duel" }, "push")).toEqual({ kind: "none" });
});

test("Learn's two parts fade into each other; a case of the library slides itself", () => {
  expect(slideOf({ page: "learn" }, { page: "algorithms" }, "replace")).toEqual({ kind: "fade" });
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
  store.set(openTabAtom, "learn");
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
  store.set(openTabAtom, "battle");
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
