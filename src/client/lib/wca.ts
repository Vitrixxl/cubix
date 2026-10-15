/**
 * The World Cube Association: the WCA ID a player gives on their profile (their word for now; a link verified with the
 * WCA's OAuth would come from the server), and their official results and competitions, read through the API
 * (go-api/wca.go), which asks the WCA's public API and keeps its answers 12 hours.
 */
import type { EventRecordDto } from "../../shared/types";
import { eventLabelOf } from "../../shared/puzzles";

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
  competitions: number;
  records: Record<string, { single?: WcaRecord; average?: WcaRecord }>;
}
export interface WcaCompetition { id: string; name: string; city: string; country_iso2: string; start_date: string; end_date: string; url: string }
/** `mine`: the person's own; else those of their `country`. */
export interface WcaCompetitions { mine: boolean; country?: string; competitions: WcaCompetition[] }

/** The WCA's events in its own order; those Qbix times keep its names. */
const WCA_EVENTS: [string, string?][] = [["333"], ["222"], ["444"], ["555"], ["666"], ["777"], ["333bf"], ["333fm", "3×3 Fewest Moves"], ["333oh"], ["clock", "Clock"], ["minx"], ["pyram"], ["skewb"], ["sq1"], ["444bf"], ["555bf"], ["333mbf", "3×3 Multi-Blind"]];
/** Events whose WCA average is a mean of 3, not an Ao5: no Qbix Ao5 beside it. */
const MEAN_OF_3 = ["666", "777", "333bf", "444bf", "555bf", "333fm"];

/** A result as the WCA writes it: centiseconds as 1:02.34, moves for Fewest Moves, cubes and time for Multi-Blind. */
export function wcaResult(event: string, kind: "single" | "average", value: number): string {
  if (value === -1) return "DNF";
  if (value <= 0) return "–";
  if (event === "333fm") return kind === "single" ? String(value) : (value / 100).toFixed(2);
  if (event === "333mbf") {
    // 0DDTTTTTMM: 99 − DD is solved minus missed, TTTTT the seconds, MM the missed.
    const missed = value % 100, seconds = Math.floor(value / 100) % 100000, solved = 99 - Math.floor(value / 1e7) + missed;
    return `${solved}/${solved + missed} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  const minutes = Math.floor(value / 6000), rest = ((value % 6000) / 100).toFixed(2);
  return minutes ? `${minutes}:${rest.padStart(5, "0")}` : rest;
}

/** Each WCA event the person has a result in, in the WCA's order, with the player's Qbix single and Ao5 beside. */
export function wcaRows(person: WcaPerson, records: readonly EventRecordDto[]) {
  return WCA_EVENTS.filter(([id]) => person.records[id]?.single).map(([id, label]) => {
    const own = records.find(r => r.event === id);
    return {
      event: id,
      label: label ?? eventLabelOf(id),
      single: person.records[id]!.single!,
      average: person.records[id]!.average,
      qbixSingle: own?.best ?? null,
      qbixAverage: MEAN_OF_3.includes(id) ? null : own?.bestAo5 ?? null,
    };
  });
}
/** "NR 4 · CR 4 · WR 56". */
export const wcaRanks = (r: WcaRecord) => `NR ${r.country_rank} · CR ${r.continent_rank} · WR ${r.world_rank}`;
