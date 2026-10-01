import { expect, mock, test } from "bun:test";

mock.module("react-native", () => ({ Animated: {}, Easing: { bezier: () => (t: number) => t }, StyleSheet: { create: (styles: unknown) => styles }, View: "View", AccessibilityInfo: {} }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: { current: () => null } }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390 }) }));
const { slideDirection, slideOf, tabDirection, TAB_ORDER } = await import("../src/components/PageStack");

const overview = { page: "profile" } as const, training = { page: "profile", mode: "training" } as const;

test("the account's sections are tabs of one page: switching them never slides", () => {
  expect(slideDirection(overview, training, "push", true)).toBe(0);
  expect(slideDirection(training, overview, "pop", true)).toBe(0);
  expect(slideOf(training, { page: "profile", mode: "achievements" }, "push", true)).toEqual({ axis: "x", direction: 0 });
});

test("tabs follow the tab bar's order", () => {
  expect(TAB_ORDER).toEqual(["playground", "algorithms", "training", "duel", "learn", "profile"]);
});

test("switching tabs is a vertical carousel: a later tab rises from below, an earlier one comes down from above", () => {
  expect(tabDirection({ page: "playground" }, { page: "algorithms" })).toBe(1);
  expect(slideOf({ page: "playground" }, { page: "profile" }, "push", true)).toEqual({ axis: "y", direction: 1 });
  expect(slideOf(training, { page: "algorithms" }, "push", true)).toEqual({ axis: "y", direction: -1 });
  // A back step to an earlier tab also comes from above: the direction follows the tabs, not the history.
  expect(slideOf({ page: "learn" }, { page: "duel" }, "pop", true)).toEqual({ axis: "y", direction: -1 });
  expect(slideOf({ page: "duel" }, { page: "learn" }, "pop", true)).toEqual({ axis: "y", direction: 1 });
});

test("reduced motion swaps tabs without moving", () => {
  expect(slideOf({ page: "playground" }, { page: "algorithms" }, "push", true, true).direction).toBe(0);
});

test("a course and its method list stay on one tab", () => {
  expect(slideOf({ page: "learn" }, { page: "learn", method: "cfop" }, "push", true)).toEqual({ axis: "x", direction: 0 });
});
