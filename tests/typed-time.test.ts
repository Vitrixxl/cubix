import { expect, test } from "bun:test";
import { parseTypedSolve, parseTypedTime, typedDisplay, typedSolveChars } from "../src/client/lib/format";

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
  expect(parseTypedTime("9.8765")).toBe(9870);
  expect(parseTypedTime("1:23.45")).toBe(83450);
  expect(parseTypedTime("1:5")).toBe(65000);
  expect(parseTypedTime("1:02:03.4")).toBe(3723400);
});

test("empty, zero, malformed and absurd entries are refused", () => {
  for (const text of ["", "0", "0.00", ".", "1:", ":5", "12.3.4", "abc", "-5", "99999999999"]) expect(parseTypedTime(text)).toBeNull();
});

test("a typed solve takes a +2 or a DNF as csTimer does; the bare time stays without one", () => {
  expect(parseTypedSolve("12.34")).toEqual({ ms: 12340, penalty: "none" });
  expect(parseTypedSolve("1234+")).toEqual({ ms: 12340, penalty: "+2" });
  expect(parseTypedSolve(" 12.34+ ")).toEqual({ ms: 12340, penalty: "+2" });
  expect(parseTypedSolve("DNF")).toEqual({ ms: 0, penalty: "dnf" });
  expect(parseTypedSolve("dnf(12.34)")).toEqual({ ms: 12340, penalty: "dnf" });
  for (const text of ["+", "12+3", "12++", "DNF(", "DNF()", "DN", "DNF12"]) expect(parseTypedSolve(text)).toBeNull();
  // A best declared in the introduction is a time, never a penalty.
  for (const text of ["DNF", "12.34+"]) expect(parseTypedTime(text)).toBeNull();
  expect(typedSolveChars("Dnf(1a2.3)+x")).toBe("123");
});

test("a time being typed is shown to the hundredth, the digits coming in from the right", () => {
  expect(["1", "12", "123", "1234", "12345"].map(typedDisplay)).toEqual(["0.01", "0.12", "1.23", "12.34", "1:23.45"]);
  expect(typedDisplay("12.34+")).toBe("12.34+");
  expect(typedDisplay("DNF")).toBe("DNF");
  expect(typedDisplay("dnf(1234)")).toBe("DNF(12.34)");
  for (const text of ["0", "1:", "dn"]) expect(typedDisplay(text)).toBe(text);
});
