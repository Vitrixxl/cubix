import { describe, expect, test } from "bun:test";
import { isCompact, isPhone } from "../src/client/lib/viewport";

describe("which app a window gets", () => {
  test("phones get the phone layout", () => {
    expect(isPhone(390)).toBe(true);
    expect(isPhone(700)).toBe(true);
    expect(isPhone(701)).toBe(false);
  });
  test("a laptop or a desktop with a mouse keeps the desktop app", () => {
    for (const [w, h] of [[1366, 768], [1280, 800], [1024, 600], [1920, 1080]]) expect(isCompact(w, h, true)).toBe(false);
  });
  test("a window under 1024×600 gets the phone app", () => {
    for (const [w, h] of [[1023, 800], [1280, 599], [800, 600]]) expect(isCompact(w, h, true)).toBe(true);
  });
  test("a touch tablet gets the phone app at any size", () => {
    for (const [w, h] of [[1024, 768], [1366, 1024], [2560, 1600]]) expect(isCompact(w, h, false)).toBe(true);
  });
  test("a phone is never compact, it is a phone", () => expect(isCompact(390, 844, false)).toBe(false));
});
