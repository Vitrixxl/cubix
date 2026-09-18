import { expect, test } from "bun:test";
import { beatenRecords, recordMessage, solveRecords } from "../src/client/lib/personalBest";
import type { SolveDto } from "../src/shared/types";

test("a faster single beats the record, the first solve and an equal time do not", () => {
  expect(beatenRecords([12000])).toEqual([]);
  expect(beatenRecords([12000, 11000])).toEqual(["single"]);
  expect(beatenRecords([12000, 12000])).toEqual([]);
  expect(beatenRecords([12000, 13000])).toEqual([]);
  expect(beatenRecords([12000, null])).toEqual([]);
  expect(beatenRecords([null, 12000])).toEqual([]);
});

test("the first average sets the record and a faster one beats it", () => {
  const five = [10000, 10000, 10000, 10000, 10000];
  expect(beatenRecords(five)).toEqual([]);
  expect(beatenRecords([...five, 10000])).toEqual([]);
  expect(beatenRecords([...five, 9900])).toEqual(["single"]);
  // The slow 20000 leaves the window: the average improves without a new single.
  expect(beatenRecords([9000, 20000, 11000, 10000, 10000, 10000, 9500])).toEqual(["ao5"]);
});

test("single, Ao5 and Ao12 can fall together", () => {
  const times = [...Array(12).fill(10000), 9000, 8000];
  expect(beatenRecords(times)).toEqual(["single", "ao5", "ao12"]);
});

test("a DNF average never beats a record", () => {
  expect(beatenRecords([10000, 10000, 10000, 10000, 10000, null, null])).toEqual([]);
});

test("records are judged at the solve, ignoring later ones", () => {
  const solve = (id: number, time_ms: number, penalty: SolveDto["penalty"] = "none"): SolveDto => ({ id, session_id: null, case_id: null, time_ms, penalty, scramble: null, created_at: "" });
  const history = [solve(1, 12000), solve(2, 11000), solve(3, 9000)];
  expect(solveRecords(history, 2)).toEqual(["single"]);
  expect(solveRecords(history, 1)).toEqual([]);
  expect(solveRecords(history, 99)).toEqual([]);
  // Penalties count: 10.50+2 does not beat 12.00, and a DNF beats nothing.
  expect(solveRecords([solve(1, 12000), solve(2, 10500, "+2")], 2)).toEqual([]);
  expect(solveRecords([solve(1, 12000), solve(2, 9000, "dnf")], 2)).toEqual([]);
});

test("the message names every beaten record", () => {
  expect(recordMessage([])).toBeNull();
  expect(recordMessage(["single"])).toBe("New personal best: single!");
  expect(recordMessage(["single", "ao5"])).toBe("New personal best: single and Ao5!");
  expect(recordMessage(["single", "ao5", "ao12"])).toBe("New personal best: single, Ao5 and Ao12!");
});
