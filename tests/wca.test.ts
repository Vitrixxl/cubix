import { expect, test } from "bun:test";
import { competitionsPath, countryName, flagOf, historyOf, rankingPath, readWcaView, regionLabel, wcaAttempts, wcaDates, wcaEventLabel, wcaFormat, wcaIdOf, wcaMonths, wcaResult, wcaRound, wcaRows, wcaUrl, type WcaHistory, type WcaPerson } from "../src/client/lib/wca";
import { readRoute } from "../src/client/lib/route";
import type { EventRecordDto } from "../src/shared/types";

test("a WCA ID is read as the WCA writes it", () => {
  expect(wcaIdOf(" 2009zemd01 ")).toBe("2009ZEMD01");
  expect(wcaIdOf("2009ZEMD1")).toBeNull();
});

test("results read as on the WCA: centiseconds, moves, cubes", () => {
  expect(wcaResult("333", "single", 412)).toBe("4.12");
  expect(wcaResult("444", "average", 6123)).toBe("1:01.23");
  expect(wcaResult("777", "average", 59579)).toBe("9:55.79");
  expect(wcaResult("333fm", "single", 24)).toBe("24");
  expect(wcaResult("333fm", "average", 2733)).toBe("27.33");
  expect(wcaResult("333mbf", "single", 880282100)).toBe("11/11 47:01");
  // An hour and more shows its hours, as the WCA writes it.
  expect(wcaResult("333mbf", "single", 970360001)).toBe("3/4 1:00:00");
  expect(wcaResult("333mbf", "single", 960360402)).toBe("5/7 1:00:04");
  expect(wcaResult("333mbf", "single", 970004500)).toBe("2/2 0:45");
  expect(wcaResult("333mbf", "single", 970000500)).toBe("2/2 0:05");
  expect(wcaResult("555bf", "single", 372345)).toBe("1:02:03.45");
  expect(wcaResult("222", "single", 39)).toBe("0.39");
  expect(wcaResult("333mbf", "single", 380350302)).toBe("63/65 58:23");
  expect(wcaResult("333", "single", -1)).toBe("DNF");
  expect(wcaResult("333", "average", -2)).toBe("DNS");
  expect(wcaResult("333", "average", 0)).toBe("–");
  // A mean of 3 in Fewest Moves: the attempts not made are left out.
  expect(wcaAttempts("333fm", [20, 21, -1, 0, 0])).toEqual(["20", "21", "DNF"]);
});

test("the WCA's events, rounds and formats by their names", () => {
  expect(wcaEventLabel("333")).toBe("3×3");
  expect(wcaEventLabel("333fm")).toBe("3×3 Fewest Moves");
  expect(wcaEventLabel("clock")).toBe("Clock");
  expect([wcaRound("1"), wcaRound("d"), wcaRound("2"), wcaRound("3"), wcaRound("f"), wcaRound("c")]).toEqual(["Round 1", "Round 1", "Round 2", "Semi-finals", "Final", "Final"]);
  expect([wcaFormat("a"), wcaFormat("m"), wcaFormat("3")]).toEqual(["Ao5", "Mo3", "Bo3"]);
});

test("countries by their flags and names, regions by theirs", () => {
  expect(flagOf("FR")).toBe("🇫🇷");
  expect(flagOf("fr")).toBe("");
  expect(countryName("FR")).toBe("France");
  expect(countryName("XK", [{ iso2: "XK", name: "Kosovo", continent: "europe" }])).toBe("Kosovo");
  expect([regionLabel("world"), regionLabel("north-america"), regionLabel("JP")]).toEqual(["World", "North America", "Japan"]);
});

test("the WCA pages' addresses, and the API's", () => {
  expect(wcaUrl("persons/2009ZEMD01")).toBe("/wca/persons/2009ZEMD01");
  expect(readRoute("/wca/competitions/WC2025", "")).toMatchObject({ page: "wca", view: "competitions/WC2025" });
  expect(readWcaView("competitions/WC2025")).toEqual({ tab: "competitions", id: "WC2025" });
  expect(readWcaView("")).toEqual({ tab: "rankings" });
  expect(readWcaView("nowhere")).toEqual({ tab: "rankings" });
  expect(rankingPath("333", "single", { region: "FR", page: 2, q: "" })).toBe("rankings/333/single?region=FR&page=2");
  expect(competitionsPath({ status: "past", country: "FR", month: "2024-02", q: "open" }, 3)).toBe("competitions?status=past&page=3&country=FR&q=open&from=2024-02-01&to=2024-02-29");
  expect(wcaMonths(true, new Date(2026, 0, 15)).slice(0, 2)).toEqual(["2026-01", "2025-12"]);
  expect(wcaMonths(false, new Date(2026, 11, 15))).toHaveLength(12);
  expect(wcaDates({ start: "2026-12-12", end: "2026-12-13" })).toMatch(/12.*13.*2026/);
});

test("a person's results per competition, newest first, filtered by event", () => {
  const c = (id: string, start: string) => ({ id, name: id, city: "", country: "FR", start, end: start, events: [] });
  const r = (competition: string, event: string, round: string) => ({ competition, event, round, pos: 1, best: 500, average: 600, attempts: [500] });
  const history: WcaHistory = { competitions: [c("New", "2020-01-01"), c("Old", "2010-01-01")], results: [r("New", "333", "f"), r("New", "222", "1"), r("Old", "222", "1")] };
  expect(historyOf(history).map((g) => [g.competition.id, g.rows.length])).toEqual([["New", 2], ["Old", 1]]);
  expect(historyOf(history, "333").map((g) => g.competition.id)).toEqual(["New"]);
});

test("the WCA's events in its order, the Qbix single and Ao5 beside, no Ao5 against a mean of 3", () => {
  const r = (best: number) => ({ best, world_rank: 1, continent_rank: 1, country_rank: 1 });
  const person = { id: "2009ZEMD01", name: "F", country: "AU", countryName: "Australia", competitions: 1,
    records: { "666": { single: r(9000), average: r(9500) }, "222": { single: r(100) }, "333": { single: r(412), average: r(553) }, "magic": { single: r(90) } } } as unknown as WcaPerson;
  const own = [{ event: "333", scrambleType: "normal", best: 7000, bestAo5: 9000 }, { event: "666", scrambleType: "normal", best: 99000, bestAo5: 100000 }] as EventRecordDto[];
  expect(wcaRows(person, own).map(row => [row.event, row.qbixSingle, row.qbixAverage])).toEqual([["333", 7000, 9000], ["222", null, null], ["666", 99000, null]]);
});
