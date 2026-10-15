import { expect, test } from "bun:test";
import { matches, movesText, searchCases } from "../src/client/lib/practiceCatalog";

const kase = (id: string, name: string, algs: string[]) =>
  ({ id, name, setLabel: "OLL", stage: "OLL", group: "Dot", algorithms: algs.map(alg => ({ alg })) }) as any;
const sune = kase("OLL 27", "Sune", ["(R U R' U) R U2' R'"]);
const sexy = kase("OLL 33", "Shoelaces", ["R U R’ U’ R’ F R F’"]);
const wide = kase("OLL 1", "Dot", ["Rw U Rw' U2 R U' R'"]);

test("moves are written one way", () => {
  expect(movesText("(R U  R’) [U2']  Rw")).toBe(" R U R' U2 r ");
});

test("a case is found by its name or by moves of its algorithms", () => {
  expect(matches(sune, "sune")).toBe(true);
  expect(matches(sexy, "R U R' U'")).toBe(true);
  expect(matches(sexy, "(R U) R’ U’")).toBe(true);
  expect(matches(sune, "R U R' U'")).toBe(false);
  expect(matches(sune, "R U2 R'")).toBe(true);
  expect(matches(wide, "r U r'")).toBe(true);
  expect(matches(sexy, "r u r' u'")).toBe(true);
  // One move alone, or a move cut short, is no search by moves.
  expect(matches(sexy, "F")).toBe(false);
  expect(matches(sexy, "R U R' U' R' F R F")).toBe(false);
});

test("cases found by name come first", () => {
  const named = kase("PLL R", "R U", ["F R F'"]);
  expect(searchCases([sexy, sune, named], "r u").map(c => c.id)).toEqual(["PLL R", "OLL 33", "OLL 27"]);
});
