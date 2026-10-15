import { expect, test } from "bun:test";
import { wcaIdOf, wcaResult, wcaRows, type WcaPerson } from "../src/client/lib/wca";
import type { EventRecordDto } from "../src/shared/types";

test("a WCA ID is read as the WCA writes it", () => {
  expect(wcaIdOf(" 2009zemd01 ")).toBe("2009ZEMD01");
  expect(wcaIdOf("2009ZEMD1")).toBeNull();
});

test("results read as on the WCA: centiseconds, moves, cubes", () => {
  expect(wcaResult("333", "single", 412)).toBe("4.12");
  expect(wcaResult("444", "average", 6123)).toBe("1:01.23");
  expect(wcaResult("333fm", "single", 24)).toBe("24");
  expect(wcaResult("333fm", "average", 2733)).toBe("27.33");
  expect(wcaResult("333mbf", "single", 880282100)).toBe("11/11 47:01");
  expect(wcaResult("333mbf", "single", 970360001)).toBe("3/4 60:00");
  expect(wcaResult("333", "single", -1)).toBe("DNF");
});

test("the WCA's events in its order, the Qbix single and Ao5 beside, no Ao5 against a mean of 3", () => {
  const r = (best: number) => ({ best, world_rank: 1, continent_rank: 1, country_rank: 1 });
  const person: WcaPerson = { id: "2009ZEMD01", name: "F", country: "AU", countryName: "Australia", competitions: 1,
    records: { "666": { single: r(9000), average: r(9500) }, "222": { single: r(100) }, "333": { single: r(412), average: r(553) }, "magic": { single: r(90) } } };
  const own = [{ event: "333", best: 7000, bestAo5: 9000 }, { event: "666", best: 99000, bestAo5: 100000 }] as EventRecordDto[];
  expect(wcaRows(person, own).map(row => [row.event, row.qbixSingle, row.qbixAverage])).toEqual([["333", 7000, 9000], ["222", null, null], ["666", 99000, null]]);
});
