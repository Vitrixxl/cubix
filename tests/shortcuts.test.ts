import { expect, test } from "vitest";
import { matchesShortcut } from "../src/frontend/hooks/useShortcuts";

test("shortcut letters follow AZERTY and QWERTY instead of physical key positions", () => {
  expect(matchesShortcut({ key: "a", code: "KeyQ" }, "a")).toBe(true);
  expect(matchesShortcut({ key: "q", code: "KeyA" }, "a")).toBe(false);
  expect(matchesShortcut({ key: "a", code: "KeyA" }, "a")).toBe(true);
  expect(matchesShortcut({ key: "A", code: "KeyQ" }, "a")).toBe(true);
});

test("Alt-generated symbols and number-row shortcuts retain their fallback", () => {
  expect(matchesShortcut({ key: "å", code: "KeyA" }, "a")).toBe(true);
  expect(matchesShortcut({ key: "&", code: "Digit1" }, "1")).toBe(true);
  expect(matchesShortcut({ key: "Dead", code: "KeyN" }, "n")).toBe(true);
});
