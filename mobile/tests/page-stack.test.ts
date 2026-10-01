import { expect, mock, test } from "bun:test";

mock.module("react-native", () => ({ Animated: {}, Easing: { bezier: () => (t: number) => t }, StyleSheet: { create: (styles: unknown) => styles }, View: "View" }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: { current: () => null } }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390 }) }));
const { slideDirection } = await import("../src/components/PageStack");

const overview = { page: "profile" } as const, training = { page: "profile", mode: "training" } as const;

test("the account's sections are tabs of one page: switching them never slides", () => {
  expect(slideDirection(overview, training, "push", true)).toBe(0);
  expect(slideDirection(training, overview, "pop", true)).toBe(0);
  expect(slideDirection(training, { page: "profile", mode: "achievements" }, "push", true)).toBe(0);
});

test("switching tabs never slides", () => {
  expect(slideDirection(training, { page: "algorithms" }, "push", true)).toBe(0);
  expect(slideDirection({ page: "algorithms" }, training, "pop", true)).toBe(0);
  expect(slideDirection({ page: "algorithms" }, { page: "playground" }, "push", true)).toBe(0);
});
