import { expect, mock, test } from "bun:test";

mock.module("react-native", () => ({ Animated: {}, Easing: { bezier: () => (t: number) => t }, StyleSheet: { create: (styles: unknown) => styles }, View: "View" }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ api: {}, local: { current: () => null } }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390 }) }));
const { slideDirection } = await import("../src/components/PageStack");

const overview = { page: "profile" } as const, training = { page: "profile", mode: "training" } as const;
const phoneCase = { page: "profile", mode: "training", caseId: "OLL 1" } as const;

test("deeper profile pages slide forward and back, whatever the history step", () => {
  expect(slideDirection(overview, training, "push", true)).toBe(1);
  expect(slideDirection(training, phoneCase, "push", true)).toBe(1);
  expect(slideDirection(phoneCase, training, "pop", true)).toBe(-1);
  expect(slideDirection(phoneCase, training, "replace", true)).toBe(-1);
  // The profile tab leads back up to the overview.
  expect(slideDirection(training, overview, "push", true)).toBe(-1);
  // Pages of the same depth swap in place; a tablet shows a case in a sheet over the gallery.
  expect(slideDirection(training, { page: "profile", mode: "achievements" }, "push", true)).toBe(0);
  expect(slideDirection(training, phoneCase, "push", false)).toBe(0);
});

test("switching tabs never slides; guides slide over the page that opened them", () => {
  expect(slideDirection(training, { page: "algorithms" }, "push", true)).toBe(0);
  expect(slideDirection({ page: "algorithms" }, training, "pop", true)).toBe(0);
  expect(slideDirection({ page: "algorithms" }, { page: "guides", guide: "methods" }, "push", true)).toBe(1);
  expect(slideDirection({ page: "guides", guide: "methods" }, { page: "algorithms" }, "pop", true)).toBe(-1);
  expect(slideDirection({ page: "guides" }, { page: "playground" }, "push", true)).toBe(0);
  expect(slideDirection({ page: "guides" }, { page: "guides", guide: "timer" }, "push", true)).toBe(0);
});
