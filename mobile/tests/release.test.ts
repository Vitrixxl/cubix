import { expect, test } from "bun:test";
import { parseRelease, updateAvailable } from "../src/lib/release";

test("the update button only appears for a known installed build behind the server's build", () => {
  const server = parseRelease({ version: "0.1.0", build: 29_800_010, commit: "abc", apk: "https://example.com/cubix.apk" });
  expect(updateAvailable(29_800_000, server)).toBe(true);
  expect(updateAvailable(29_800_010, server)).toBe(false);
  expect(updateAvailable(29_800_020, server)).toBe(false);
  expect(updateAvailable(null, server)).toBe(false);
  expect(updateAvailable(29_800_000, null)).toBe(false);
  expect(updateAvailable(29_800_000, parseRelease({ version: "0.1.0", build: null, commit: null, apk: "x" }))).toBe(false);
});

test("malformed release answers are ignored", () => {
  expect(parseRelease(null)).toBeNull();
  expect(parseRelease({ build: 3 })).toBeNull();
  expect(parseRelease({ version: "0.1.0", apk: "x", build: "12", commit: "" })).toEqual({ version: "0.1.0", apk: "x", build: null, commit: null });
});
