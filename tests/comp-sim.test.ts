import { expect, test } from "bun:test";
import { attemptTexts, roundAttempts, roundRecord, roundResult, versusRecord } from "../src/client/lib/compSim";
import { roundFormat } from "../src/shared/puzzles";

test("each event's WCA round", () => {
  expect(["333", "222", "333oh", "minx"].map(roundFormat)).toEqual(["ao5", "ao5", "ao5", "ao5"]);
  expect(["666", "777"].map(roundFormat)).toEqual(["mo3", "mo3"]);
  expect(["333bf", "444bf", "555bf"].map(roundFormat)).toEqual(["bo3", "bo3", "bo3"]);
  expect([roundAttempts("ao5"), roundAttempts("mo3"), roundAttempts("bo3")]).toEqual([5, 3, 3]);
});

test("an average of 5 drops its best and its worst, a DNF being the worst", () => {
  const times = [12000, 10500, 13200, 11800, 12400], r = roundResult("ao5", times);
  expect(r.average).toBeCloseTo(12066.667, 2);
  expect(r.best).toBe(10500);
  expect(r.dropped).toEqual([1, 2]);
  expect(attemptTexts(times, r.dropped)).toEqual(["12.000", "(10.500)", "(13.200)", "11.800", "12.400"]);
  const dnf = roundResult("ao5", [12000, null, 13000, 11000, 14000]);
  expect(dnf.average).toBe(13000);
  expect(dnf.dropped).toEqual([3, 1]);
  expect(attemptTexts([12000, null, 13000, 11000, 14000], dnf.dropped)[1]).toBe("(DNF)");
  expect(roundResult("ao5", [12000, null, 13000, null, 14000]).average).toBeNull();
  // Equal times: two different attempts in parentheses.
  expect(roundResult("ao5", [10000, 10000, 10000, 10000, 10000]).dropped).toEqual([0, 4]);
});

test("a mean of 3 is a DNF with one, a best of 3 ranks by its single", () => {
  expect(roundResult("mo3", [60000, 63000, 66000]).average).toBe(63000);
  expect(roundResult("mo3", [60000, null, 66000]).average).toBeNull();
  const bld = roundResult("bo3", [null, 45000, 50000]);
  expect([bld.result, bld.average, bld.dropped]).toEqual([45000, null, []]);
});

test("the record a round is compared with", () => {
  expect(roundRecord("ao5", [10000, 11000, 12000, 13000])).toBeNull();
  expect(roundRecord("ao5", [10000, 11000, 12000, 13000, 14000, 9000])).toBe(12000);
  expect(roundRecord("mo3", [60000, null, 66000, 63000, 60000])).toBe(63000);
  expect(roundRecord("bo3", [null, 45000])).toBe(45000);
  expect(versusRecord(12000, 12440)).toEqual({ faster: true, text: "−0.440" });
  expect(versusRecord(13000, 12000)).toEqual({ faster: false, text: "+1.000" });
  expect(versusRecord(null, 12000)).toBeNull();
});
