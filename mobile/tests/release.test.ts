import { expect, test } from "bun:test";
import { parseRelease, updateAvailable } from "../src/lib/release";

test("the update button only appears for a known installed build behind the stored APK", () => {
  const server = parseRelease({ version: "0.1.0", build: 29_800_010, commit: "abc", apk: "/api/mobile/apk", apkBuild: 29_800_010, apkCommit: "abc" });
  expect(updateAvailable(29_800_000, server)).toBe(true);
  expect(updateAvailable(29_800_010, server)).toBe(false);
  expect(updateAvailable(29_800_020, server)).toBe(false);
  expect(updateAvailable(null, server)).toBe(false);
  expect(updateAvailable(29_800_000, null)).toBe(false);
  // A newer server whose APK was not uploaded yet has nothing to offer.
  expect(updateAvailable(29_800_000, parseRelease({ version: "0.1.0", build: 29_800_010, commit: "abc", apk: "/api/mobile/apk", apkBuild: null }))).toBe(false);
  expect(updateAvailable(29_800_000, parseRelease({ version: "0.1.0", build: null, commit: null, apk: "x" }))).toBe(false);
});

test("malformed release answers are ignored", () => {
  expect(parseRelease(null)).toBeNull();
  expect(parseRelease({ build: 3 })).toBeNull();
  expect(parseRelease({ version: "0.1.0", apk: "x", build: "12", commit: "", apkBuild: "7" })).toEqual({ version: "0.1.0", apk: "x", build: null, commit: null, apkBuild: null, apkCommit: null });
});
