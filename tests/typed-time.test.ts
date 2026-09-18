import { expect, test } from "bun:test";
import { parseTypedTime } from "../src/client/lib/format";

test("bare digits read from the right, like csTimer", () => {
  expect(parseTypedTime("1234")).toBe(12340);
  expect(parseTypedTime("90")).toBe(900);
  expect(parseTypedTime("12345")).toBe(83450);
  expect(parseTypedTime("1020345")).toBe(3600000 + 2 * 60000 + 3450);
});

test("punctuated times keep their units", () => {
  expect(parseTypedTime("12.34")).toBe(12340);
  expect(parseTypedTime(" 12,3 ")).toBe(12300);
  expect(parseTypedTime(".5")).toBe(500);
  expect(parseTypedTime("9.8765")).toBe(9876);
  expect(parseTypedTime("1:23.45")).toBe(83450);
  expect(parseTypedTime("1:5")).toBe(65000);
  expect(parseTypedTime("1:02:03.4")).toBe(3723400);
});

test("empty, zero, malformed and absurd entries are refused", () => {
  for (const text of ["", "0", "0.00", ".", "1:", ":5", "12.3.4", "abc", "-5", "99999999999"]) expect(parseTypedTime(text)).toBeNull();
});
