import { expect, test } from "bun:test";
import { learningPlan, puzzleLocked, validJourneyEntry, withKnownPuzzle } from "../src/client/lib/journey";
import { METHODS } from "../src/shared/methods";
import methodIds from "../data/method-ids.json";

const AT = "2026-10-01T10:00:00.000Z";

test("the setup is the only entry: personal goals are rejected, and the setup cannot be deleted", () => {
  const profile = { kind: "profile", knownPuzzles: ["333"], priority: null, completedAt: AT };
  expect(validJourneyEntry("profile", profile)).toBe(true);
  expect(validJourneyEntry("goal:00000000-0000-4000-8000-000000000000", { kind: "time", puzzle: "333", solveMode: "standard", metric: "single", targetMs: 20000, createdAt: AT })).toBe(false);
  expect(validJourneyEntry("profile", null)).toBe(false);
});
test("known and priority methods belong to their puzzle; the server registry matches the catalogue", () => {
  expect(methodIds as Record<string, string[]>).toEqual(Object.fromEntries(Object.entries(METHODS).map(([p, methods]) => [p, methods.map(m => m.id)])));
  const profile = { kind: "profile", level: "beginner", knownPuzzles: ["333"], knownMethods: { "333": ["cfop", "roux"] }, priority: "222", priorityMethod: "ortega", completedAt: AT };
  expect(validJourneyEntry("profile", profile)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, priorityMethod: "cfop" })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, knownMethods: { "222": ["ortega"] } })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, knownMethods: { "333": ["cfop", "cfop"] } })).toBe(false);
});

test("learning plans support several puzzles and methods, no selection and legacy single priorities", () => {
  const profile = { kind: "profile", level: "beginner", knownPuzzles: [], priority: "444", learningPuzzles: ["444", "222"], learningMethods: { "444": ["reduction", "yau"], "222": ["ortega"] }, completedAt: AT };
  expect(validJourneyEntry("profile", profile)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, learningPuzzles: ["444", "444"] })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, learningMethods: { "444": ["cfop"] } })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, learningMethods: { "444": ["yau", "yau"] } })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, learningMethods: { "333": ["cfop"] } })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, priority: null })).toBe(false);
  expect(validJourneyEntry("profile", { ...profile, priority: null, learningPuzzles: [], learningMethods: {} })).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, priority: null, learningPuzzles: [], learningMethods: {}, priorityMethod: "yau" })).toBe(false);
  expect(learningPlan({ kind: "profile", level: "beginner", knownPuzzles: [], priority: "222", priorityMethod: "ortega", completedAt: AT })).toEqual({ puzzles: ["222"], methods: { "222": ["ortega"] } });
});

test("a puzzle stays locked until it can be solved, and a level is no longer required", () => {
  const profile = { kind: "profile" as const, knownPuzzles: ["333" as const], priority: null, completedAt: AT };
  expect(validJourneyEntry("profile", profile)).toBe(true);
  expect(validJourneyEntry("profile", { ...profile, level: "expert" })).toBe(false);
  expect(puzzleLocked(undefined, "444")).toBe(false);
  expect(puzzleLocked(profile, "333")).toBe(false);
  expect(puzzleLocked(profile, "444")).toBe(true);
  const unlocked = withKnownPuzzle(profile, "444", "reduction");
  expect(unlocked.knownPuzzles).toEqual(["333", "444"]);
  expect(unlocked.knownMethods).toEqual({ "444": ["reduction"] });
  expect(puzzleLocked(unlocked, "444")).toBe(false);
  expect(validJourneyEntry("profile", unlocked)).toBe(true);
  // Skipping the tutorial adds the puzzle without a method; an unknown method is ignored.
  expect(withKnownPuzzle(profile, "222", "nope")).toEqual({ ...profile, knownPuzzles: ["333", "222"] });
});
