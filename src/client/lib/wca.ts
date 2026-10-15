/**
 * The World Cube Association: its rankings, records, competitions and people as the WCA pages show them (web and
 * phone), read through the API (go-api/wca.go), which asks the WCA and keeps its answers; the WCA ID a player gives on
 * their profile (their word for now; a link verified with the WCA's OAuth would come from the server).
 */
import type { EventRecordDto } from "../../shared/types";
import { eventLabelOf } from "../../shared/puzzles";
import { language, localFormat } from "../i18n";
import { msg } from "../i18n/msg";
import { pageUrl } from "./route";

/** A WCA ID: the year of a first competition, four letters of the name and a number, as 2009ZEMD01. */
export const WCA_ID = /^\d{4}[A-Z]{4}\d{2}$/;
/** What was typed, as a WCA ID is written, or null when it cannot be one. */
export function wcaIdOf(text: string): string | null {
  const id = text.trim().toUpperCase();
  return WCA_ID.test(id) ? id : null;
}
export const wcaPersonUrl = (id: string) => `https://www.worldcubeassociation.org/persons/${id}`;

/** A single or an average: its result in the WCA's units and its world, continent and country ranks. */
export interface WcaRecord { best: number; world_rank: number; continent_rank: number; country_rank: number }
export interface WcaPerson {
  id: string;
  name: string;
  /** ISO 3166 code, "FR". */
  country: string;
  countryName: string;
  /** "m", "f" or "o", when given. */
  gender?: string;
  competitions: number;
  records: Record<string, { single?: WcaRecord; average?: WcaRecord }>;
  medals: { gold: number; silver: number; bronze: number };
  recordsSet: { world: number; continental: number; national: number };
}
/** A person as a row names them. */
export interface WcaWho { id: string; name: string; country: string }
export interface WcaRanking { rows: (WcaWho & { rank: number; best: number })[]; page: number; pages: number; ranked: number }
export interface WcaHeld { best: number; holders: WcaWho[] }
export interface WcaRecordRow { event: string; single?: WcaHeld; average?: WcaHeld }
export interface WcaCompetition { id: string; name: string; city: string; country: string; start: string; end: string; events: string[]; cancelled?: boolean }
export interface WcaCompetitionList { items: WcaCompetition[]; page: number; pages: number }
export interface WcaCompetitionInfo extends WcaCompetition {
  venue: string; venueUrl?: string; address: string; details?: string; website: string; url: string; map?: string; limit?: number;
  /** The results are posted. */
  results: boolean;
}
/** A result of a round: its place, best, average and attempts, the records it set ("WR", "ER", "NR"…). */
export interface WcaResult { pos: number; best: number; average: number; attempts: number[]; single?: string; avg?: string }
export interface WcaRound { round: string; format: string; results: (WcaWho & WcaResult)[] }
export interface WcaHistory { competitions: WcaCompetition[]; results: (WcaResult & { competition: string; event: string; round: string })[] }
export interface WcaCountry { iso2: string; name: string; continent: string }

/** The WCA's events in its own order; the events Qbix times keep its names. */
const NAMES: Record<string, string> = { "333fm": msg("3×3 Fewest Moves"), clock: msg("Clock"), "333mbf": msg("3×3 Multi-Blind") };
export const WCA_EVENTS = ["333", "222", "444", "555", "666", "777", "333bf", "333fm", "333oh", "clock", "minx", "pyram", "skewb", "sq1", "444bf", "555bf", "333mbf"];
export const wcaEventLabel = (id: string) => NAMES[id] ?? eventLabelOf(id);
/** Events whose WCA average is a mean of 3, not an Ao5: no Qbix Ao5 beside it. */
const MEAN_OF_3 = ["666", "777", "333bf", "444bf", "555bf", "333fm"];

/**
 * A result as the WCA writes it: centiseconds as 1:02.34, moves for Fewest Moves (its mean to two decimals), cubes and
 * time for Multi-Blind; DNF, DNS; nothing for no result.
 */
export function wcaResult(event: string, kind: "single" | "average", value: number): string {
  if (value === -1) return "DNF";
  if (value === -2) return "DNS";
  if (value <= 0) return "–";
  if (event === "333fm") return kind === "single" ? String(value) : (value / 100).toFixed(2);
  if (event === "333mbf") {
    // 0DDTTTTTMM: 99 − DD is solved minus missed, TTTTT the seconds, MM the missed.
    const missed = value % 100, seconds = Math.floor(value / 100) % 100000, solved = 99 - Math.floor(value / 1e7) + missed;
    return `${solved}/${solved + missed} ${seconds < 60 ? `0:${pad(seconds)}` : clock(seconds * 100).slice(0, -3)}`;
  }
  return clock(value);
}
const pad = (n: number) => String(n).padStart(2, "0");
/** Centiseconds as H:MM:SS.CC, its leading zeros and colons dropped (the WCA's SolveTime): 4.12, 1:01.23, 1:00:04.00. */
function clock(cs: number) {
  const text = `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`.replace(/^[0:]*/, "");
  return text.startsWith(".") ? "0" + text : text;
}
/** A round's attempts as written, those not made (0) left out. */
export const wcaAttempts = (event: string, attempts: number[]) => attempts.filter((a) => a !== 0).map((a) => wcaResult(event, "single", a));

/** Each WCA event the person has a result in, in the WCA's order, with the player's Qbix single and Ao5 beside. */
export function wcaRows(person: WcaPerson, records: readonly EventRecordDto[]) {
  return WCA_EVENTS.filter((id) => person.records[id]?.single).map((id) => {
    const own = records.find((r) => r.event === id);
    return {
      event: id,
      label: wcaEventLabel(id),
      single: person.records[id]!.single!,
      average: person.records[id]!.average,
      qbixSingle: own?.best ?? null,
      qbixAverage: MEAN_OF_3.includes(id) ? null : own?.bestAo5 ?? null,
    };
  });
}

/** A round's name: "Round 1", "Semi-finals", "Final". */
export function wcaRound(id: string) {
  if (id === "f" || id === "c") return msg("Final");
  if (id === "3" || id === "g") return msg("Semi-finals");
  if (id === "0" || id === "h") return msg("Qualification");
  if (id === "b") return msg("B final");
  return msg("Round {0}", { 0: id === "d" ? 1 : id === "e" ? 2 : id });
}
/** A round's format: "Ao5", "Mo3", "Bo3". */
export const wcaFormat = (id: string) => ({ a: "Ao5", m: "Mo3", "1": "Bo1", "2": "Bo2", "3": "Bo3", "5": "Bo5" })[id] ?? "";
/** A record's reach: the world's, a continent's (ER, AsR, NAR…), a country's. */
export const recordReach = (tag: string) => (tag === "WR" ? "world" : tag === "NR" ? "national" : "continental");

/** The continents as the rankings name them. */
export const CONTINENTS = [
  { id: "africa", label: msg("Africa") },
  { id: "asia", label: msg("Asia") },
  { id: "europe", label: msg("Europe") },
  { id: "north-america", label: msg("North America") },
  { id: "oceania", label: msg("Oceania") },
  { id: "south-america", label: msg("South America") },
];
/** A country's flag, from its ISO code. */
export const flagOf = (iso2: string) => (/^[A-Z]{2}$/.test(iso2) ? String.fromCodePoint(...[...iso2].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
const regionNames = new Map<string, Intl.DisplayNames | null>();
/** A country's name in the app's language, else as the WCA names it, else its code. */
export function countryName(iso2: string, countries?: readonly WcaCountry[]) {
  const lang = language();
  if (!regionNames.has(lang)) {
    try { regionNames.set(lang, new Intl.DisplayNames([lang], { type: "region" })); } catch { regionNames.set(lang, null); }
  }
  try {
    const name = iso2 !== "XK" ? regionNames.get(lang)?.of(iso2) : undefined;
    if (name && name !== iso2) return name;
  } catch { /* An unknown code. */ }
  return countries?.find((c) => c.iso2 === iso2)?.name ?? iso2;
}
/** The countries by their names in the app's language. */
export const countriesByName = (countries: readonly WcaCountry[]) =>
  countries.map((c) => ({ ...c, name: countryName(c.iso2, countries) })).sort((a, b) => a.name.localeCompare(b.name, language()));
/** A region of the rankings and records: the world, a continent or a country (its ISO code). */
export const regionLabel = (region: string, countries?: readonly WcaCountry[]) =>
  region === "world" ? msg("World") : CONTINENTS.find((c) => c.id === region)?.label ?? countryName(region, countries);

/** The WCA pages: their tabs, and a person's and a competition's pages under them. */
export const WCA_TABS = [
  { id: "rankings", label: msg("Rankings") },
  { id: "records", label: msg("Records") },
  { id: "competitions", label: msg("Competitions") },
  { id: "persons", label: msg("People") },
] as const;
export type WcaTab = (typeof WCA_TABS)[number]["id"];
/** The tab of an address under /wca, and the person or competition it opens. */
export function readWcaView(view = ""): { tab: WcaTab; id?: string } {
  const [tab = "", id] = view.split("/");
  return { tab: WCA_TABS.some((t) => t.id === tab) ? (tab as WcaTab) : "rankings", ...(id ? { id } : {}) };
}
export const wcaUrl = (view = "") => pageUrl("wca", { view });

/** The API's paths (src/client/api-client.ts `wca`). */
export const rankingPath = (event: string, kind: string, query: { region: string; page?: number; person?: string; q?: string }) =>
  `rankings/${event}/${kind}?` + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
export interface CompetitionFilter { status: "upcoming" | "past"; country: string; month: string; q: string }
export function competitionsPath(filter: CompetitionFilter, page: number) {
  const query = new URLSearchParams({ status: filter.status, page: String(page) });
  if (filter.country) query.set("country", filter.country);
  if (filter.q) query.set("q", filter.q);
  if (filter.month) {
    const [year, month] = filter.month.split("-").map(Number);
    query.set("from", `${filter.month}-01`);
    query.set("to", `${filter.month}-${String(new Date(year!, month!, 0).getDate()).padStart(2, "0")}`);
  }
  return "competitions?" + query;
}
/** The months a filter offers, "2026-10": the next twelve, or the last twenty-four. */
export function wcaMonths(past: boolean, today = new Date()) {
  return Array.from({ length: past ? 24 : 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + (past ? -i : i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
const MONTH = localFormat({ month: "long", year: "numeric" }),
  DAY = localFormat({ day: "numeric", month: "short" }),
  DATE = localFormat({ day: "numeric", month: "short", year: "numeric" });
const at = (iso: string) => new Date(iso + "T12:00:00");
export const monthLabel = (month: string) => MONTH.format(at(month + "-01"));
/** "12 Dec 2026", or "12 Dec – 13 Dec 2026". */
export const wcaDates = (c: Pick<WcaCompetition, "start" | "end">) => (c.start === c.end ? DATE.format(at(c.start)) : `${DAY.format(at(c.start))} – ${DATE.format(at(c.end))}`);

/** A person's results in an event (all, without one), per competition, newest first. */
export function historyOf(history: WcaHistory, event?: string) {
  const rows = history.results.filter((r) => !event || r.event === event);
  return history.competitions
    .map((competition) => ({ competition, rows: rows.filter((r) => r.competition === competition.id) }))
    .filter((group) => group.rows.length);
}
/** "NR 4 · CR 4 · WR 56". */
export const wcaRanks = (r: WcaRecord) => `NR ${r.country_rank} · CR ${r.continent_rank} · WR ${r.world_rank}`;
