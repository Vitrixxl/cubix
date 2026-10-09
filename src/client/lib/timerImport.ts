/**
 * Solves from other timers' exports, read on the device: csTimer (backup JSON, session CSV), Twisty Timer and Cubic
 * Timer (backup), CubeTime (csTimer JSON, CSV), CubeDesk and ZKT Timer (JSON), Cubeast and acubemy (CSV), Speedcuber
 * Timer (backup). The format is recognised from the content; a file that does not tell its event (a session's CSV)
 * gets the one the player picks.
 *
 * Times are kept raw, the penalty apart, as Cubix stores them: a +2 already added by the other timer is taken off.
 * Dates are when the solve was done, in milliseconds. Events outside the WCA ones Cubix practises, trainers and
 * custom puzzles are left out and counted.
 */
import { EVENTS, eventOf, type EventId } from "../../shared/puzzles";
import { msg } from "../i18n/msg";

export type Penalty = "none" | "+2" | "dnf";
export interface ImportedSolve {
  event: EventId;
  timeMs: number;
  penalty: Penalty;
  scramble: string | null;
  comment: string | null;
  /** When the solve was done (ms since 1970). */
  at: number;
  /** The session it had in the other timer, if it had one. */
  session?: string;
}
export interface TimerImport {
  /** The timer the file comes from, as shown to the player. */
  app: string;
  solves: ImportedSolve[];
  /** Solves left out, by reason. */
  skipped: Record<string, number>;
  /** The file names no event: the solves carry `fallbackEvent` until the player picks one. */
  needsEvent: boolean;
}

const WCA = new Set<string>(EVENTS.map((e) => e.id));
const isEvent = (id: string): id is EventId => WCA.has(id);

/** csTimer's scramble types, and the other timers' puzzle names, as WCA events. */
const CSTIMER: Record<string, EventId> = {
  "333": "333", "222so": "222", "444wca": "444", "555wca": "555", "666wca": "666", "777wca": "777",
  "333ni": "333bf", "333oh": "333oh", mgmp: "minx", pyrso: "pyram", skbso: "skewb", sqrs: "sq1",
  "444bld": "444bf", "555bld": "555bf",
  // Same puzzles, other scramblers.
  "222o": "222", "2223": "222", "444m": "444", "444": "444", "444yj": "444", "555": "555", "666si": "666", "666p": "666",
  "666s": "666", "777si": "777", "777p": "777", "777s": "777",
  mgmc: "minx", mgmo: "minx", mgmso: "minx", pyro: "pyram", pyrm: "pyram", skbo: "skewb", skb: "skewb", sq1h: "sq1",
  sq1t: "sq1",
  // CubeTime's own name for 3BLD in its csTimer files.
  "333bld": "333bf",
};
const TWISTY: Record<string, EventId> = {
  "222": "222", "333": "333", "444": "444", "555": "555", "666": "666", "777": "777", mega: "minx", pyra: "pyram",
  skewb: "skewb", sq1: "sq1", "333oh": "333oh", "333bld": "333bf", "444bld": "444bf", "555bld": "555bf",
};
const CUBEDESK: Record<string, EventId> = { "333bl": "333bf" };

/** A time as timers print it: "12.34", "1:02.345", "1:02:03.4". Null when it is not one. */
export function parseClock(text: string): number | null {
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  const [hours, minutes] = m[2] !== undefined ? [Number(m[1]), Number(m[2])] : [0, Number(m[1] ?? 0)];
  return Math.round(((hours * 60 + minutes) * 60 + Number(m[3])) * 1000);
}

/** Rows of a delimited text: quotes with doubled ("") or backslashed (\") quotes, newlines inside quotes. */
export function parseDelimited(text: string, separator: string, backslash = false): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, i = 0;
  const end = () => (row.push(field), (field = ""));
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (backslash && c === "\\" && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === separator) end();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      end();
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) (end(), rows.push(row));
  return rows.filter((r) => r.some((f) => f.trim()));
}

const nothing = (value: unknown) => value == null || value === "" || value === "null";
const text = (value: unknown) => (nothing(value) ? null : String(value).trim() || null);
const skip = (skipped: Record<string, number>, reason: string) => void (skipped[reason] = (skipped[reason] ?? 0) + 1);

/** csTimer's backup, and CubeTime's file in its format. */
function cstimer(data: any): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  const parse = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);
  const properties = parse(data.properties ?? {}) ?? {},
    sessions = parse(properties.sessionData ?? "{}") ?? {},
    cubeTime = Object.values(sessions).some((s: any) => typeof s?.name === "string" && s.name.startsWith("CubeTime Export"));
  for (const key of Object.keys(data)) {
    const m = /^session(\d+)$/.exec(key);
    if (!m) continue;
    const meta = sessions[m[1]!] ?? {},
      type = String(meta.opt?.scrType ?? meta.scrType ?? meta.scr ?? "333"),
      event = CSTIMER[type],
      name = meta.name == null ? msg("Session {0}", { 0: m[1] }) : String(meta.name);
    for (const solve of parse(data[key]) ?? []) {
      if (!event) {
        skip(skipped, "events Cubix does not practise");
        continue;
      }
      const [result, scramble, comment, at] = solve as [number[], string, string, number];
      const penalty = result?.[0] ?? 0,
        time = result?.[1];
      if (!Number.isFinite(time) || !Number.isFinite(at)) {
        skip(skipped, "unreadable solves");
        continue;
      }
      solves.push({
        event,
        timeMs: Math.round(time!),
        penalty: penalty < 0 ? "dnf" : penalty > 0 ? "+2" : "none",
        scramble: text(scramble),
        comment: text(comment),
        at: at * 1000,
        session: cubeTime ? name.replace(/^CubeTime Export - /, "") : name,
      });
    }
  }
  return { app: cubeTime ? "CubeTime" : "csTimer", solves, skipped, needsEvent: false };
}

/** A time printed by a timer, with its penalty: "14.34+" (the +2 added), "DNF(12.34)", "DNF". */
function printed(value: string): { timeMs: number; penalty: Penalty } | null {
  const v = value.trim(),
    dnf = /^DNF(?:\((.*)\))?$/i.exec(v);
  if (dnf) return { timeMs: parseClock(dnf[1] ?? "") ?? 0, penalty: "dnf" };
  const plus = v.endsWith("+"),
    ms = parseClock(plus ? v.slice(0, -1) : v);
  if (ms === null) return null;
  return plus ? { timeMs: Math.max(0, ms - 2000), penalty: "+2" } : { timeMs: ms, penalty: "none" };
}
/** "2023-10-05 12:00:00" in local time, or any date the platform reads. */
const date = (value: string) => {
  const local = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/.exec(value.trim());
  if (local) return new Date(+local[1]!, +local[2]! - 1, +local[3]!, +local[4]!, +local[5]!, +(local[6] ?? 0)).getTime();
  const t = Date.parse(value.trim().replace(/ \+0000$/, "Z").replace(/ UTC$/, "Z").replace(" ", "T"));
  return Number.isFinite(t) ? t : Date.parse(value);
};

/** Rows of a CSV with a header line, as records by column name. */
const records = (rows: string[][]) => rows.slice(1).map((row) => Object.fromEntries(rows[0]!.map((name, i) => [name.trim(), row[i] ?? ""])));

/** One csTimer session as CSV: no event in it. */
function cstimerCsv(rows: string[][], fallback: EventId): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  for (const r of records(rows)) {
    const time = printed(r.Time ?? ""),
      at = date(r.Date ?? "");
    if (!time || !Number.isFinite(at)) skip(skipped, "unreadable solves");
    else solves.push({ event: fallback, ...time, scramble: text(r.Scramble), comment: text(r.Comment), at });
  }
  return { app: "csTimer", solves, skipped, needsEvent: true };
}

/** Twisty Timer's and Cubic Timer's backups: puzzle and category per solve, the +2 in the time. */
function twisty(rows: string[][], app: string): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  for (const [puzzle = "", category = "", time = "", at = "", scramble, packed = "0", comment] of rows.slice(1)) {
    const penalty = Number(packed) % 100,
      event = TWISTY[puzzle];
    // Penalty 10 marks the placeholders that keep an empty category alive.
    if (penalty === 10) continue;
    if (!event) {
      skip(skipped, "events Cubix does not practise");
      continue;
    }
    const ms = Number(time),
      when = Number(at);
    if (!Number.isFinite(ms) || !Number.isFinite(when)) {
      skip(skipped, "unreadable solves");
      continue;
    }
    solves.push({
      event,
      timeMs: penalty === 1 ? Math.max(0, ms - 2000) : ms,
      penalty: penalty === 1 ? "+2" : penalty === 2 ? "dnf" : "none",
      scramble: text(scramble),
      comment: text(comment),
      at: when,
      session: category || undefined,
    });
  }
  return { app, solves, skipped, needsEvent: false };
}

/** CubeTime's CSV: seconds, no penalty, a scramble that may hold commas (Square-1). */
function cubeTimeCsv(source: string, fallback: EventId): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  for (const line of source.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    // Time, then the quoted comment, the scramble, and the date at the end of the line.
    const m = /^([\d.]+),"((?:[^"]|"")*)",(.*),(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4})$/.exec(line);
    const at = m ? Date.parse(m[4]!.replace(" ", "T").replace(/ ([+-]\d\d)(\d\d)$/, "$1:$2")) : NaN;
    if (!m || !Number.isFinite(at)) skip(skipped, "unreadable solves");
    else solves.push({ event: fallback, timeMs: Math.round(Number(m[1]) * 1000), penalty: "none", scramble: text(m[3]), comment: text(m[2]!.replace(/""/g, '"')), at });
  }
  return { app: "CubeTime", solves, skipped, needsEvent: true };
}

/** CubeDesk's and ZKT Timer's exports: seconds, the penalty in flags; trainer solves are left out. */
/** Qbix's own export (Settings › Download my data, or the profile's Export): its timer solves, by session. */
function qbix(data: any): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  for (const solve of data.solves) {
    if (solve.case_id) {
      skip(skipped, "training solves");
      continue;
    }
    const event = eventOf(solve.puzzle_id ?? "333", solve.solve_mode ?? "standard")?.id,
      at = Date.parse(solve.created_at);
    if (!event) {
      skip(skipped, "events Cubix does not practise");
      continue;
    }
    if (!Number.isFinite(solve.time_ms) || !Number.isFinite(at)) {
      skip(skipped, "unreadable solves");
      continue;
    }
    solves.push({ event, timeMs: solve.time_ms, penalty: solve.penalty ?? "none", scramble: text(solve.scramble), comment: text(solve.comment), at, session: solve.session_id == null ? undefined : String(solve.session_id) });
  }
  return { app: "Qbix", solves, skipped, needsEvent: false };
}

function cubedesk(data: any, app: string): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [],
    names = new Map<string, string>((data.sessions ?? []).map((s: any) => [s.id, String(s.name ?? "")]));
  for (const solve of data.solves ?? []) {
    if (solve.trainer_name && !solve.session_id) continue;
    const type = String(solve.cube_type ?? ""),
      event = CUBEDESK[type] ?? (isEvent(type) ? type : undefined);
    if (!event) {
      skip(skipped, "events Cubix does not practise");
      continue;
    }
    const raw = Number(solve.raw_time ?? solve.time),
      at = Number(solve.started_at ?? solve.ended_at ?? Date.parse(solve.created_at));
    if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(at)) {
      skip(skipped, "unreadable solves");
      continue;
    }
    solves.push({
      event,
      timeMs: Math.round(raw * 1000),
      penalty: solve.dnf ? "dnf" : solve.plus_two ? "+2" : "none",
      scramble: text(solve.scramble),
      comment: text(solve.notes),
      at,
      session: names.get(solve.session_id),
    });
  }
  return { app, solves, skipped, needsEvent: false };
}

/** Smart cube timers' CSVs (Cubeast, acubemy): 3×3 solves in milliseconds. */
function smartCsv(rows: string[][], app: "Cubeast" | "acubemy"): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  for (const r of records(rows)) {
    const ms = Number(app === "Cubeast" ? r.time : r.total_time),
      at = date(r.date ?? "");
    if (!Number.isFinite(ms) || !Number.isFinite(at)) {
      skip(skipped, "unreadable solves");
      continue;
    }
    const plusTwo = r.one_turn_away_two_second_penalty === "true" || r.inspection_two_second_penalty === "true";
    solves.push({
      event: "333",
      timeMs: Math.round(ms),
      penalty: r.dnf === "true" ? "dnf" : plusTwo ? "+2" : "none",
      scramble: text(r.scramble),
      comment: text(r.description),
      at,
      session: text(r.session_name) ?? undefined,
    });
  }
  return { app, solves, skipped, needsEvent: false };
}

/** Speedcuber Timer's backup: one JSON attempt a line, WCA events already. */
function stif(source: string): TimerImport {
  const skipped: Record<string, number> = {},
    solves: ImportedSolve[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let attempt: any;
    try {
      attempt = JSON.parse(line);
    } catch {
      skip(skipped, "unreadable solves");
      continue;
    }
    const event = String(attempt.event?.id ?? "");
    if (!isEvent(event)) {
      skip(skipped, "events Cubix does not practise");
      continue;
    }
    const time = Number(attempt.timerStop) - Number(attempt.timerStart),
      penalties = (attempt.infractions ?? []).map((i: any) => i.penalty);
    if (!Number.isFinite(time) || penalties.includes("DNS")) {
      skip(skipped, "unreadable solves");
      continue;
    }
    const scramble = attempt.solutions?.[0]?.scramble;
    solves.push({
      event,
      timeMs: Math.round(time),
      penalty: penalties.includes("DNF") ? "dnf" : penalties.includes("+2") ? "+2" : "none",
      scramble: text(Array.isArray(scramble) ? scramble.join(" ") : scramble),
      comment: text(attempt.comment),
      at: Number(attempt.timerStart),
    });
  }
  return { app: msg("Speedcuber Timer"), solves, skipped, needsEvent: false };
}

/** The timers whose files are read, as offered to the player. */
export const IMPORT_APPS = ["csTimer", msg("Twisty Timer"), msg("Cubic Timer"), "CubeTime", "CubeDesk", "ZKT Timer", msg("Cubeast"), "acubemy", msg("Speedcuber Timer")];

/**
 * Reads another timer's export. `fallback` is the event of files that do not tell it. Throws when the file is none
 * of the known formats.
 */
export function readTimerExport(source: string, fallback: EventId = "333"): TimerImport {
  const body = source.replace(/^\uFEFF/, "").trimStart(),
    first = body.slice(0, body.search(/\r?\n|$/));
  if (body.startsWith("{")) {
    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      // Speedcuber Timer writes one JSON object a line.
      if (/"timerStart"/.test(first)) return stif(body);
      throw new Error(msg("This file could not be read."));
    }
    if (data.app === "Qbix" && Array.isArray(data.solves)) return qbix(data);
    if (Object.keys(data).some((key) => /^session\d+$/.test(key))) return cstimer(data);
    if (Array.isArray(data.solves)) return cubedesk(data, data.solves.some((s: any) => "scramble_subset" in s || "is_virtual_cube" in s) ? "ZKT Timer" : "CubeDesk");
    if (data.timerStart != null) return stif(body);
  }
  if (/^Puzzle,Category,Time\(millis\),Date\(millis\),Scramble,Penalty,Comment/.test(first)) return twisty(parseDelimited(body, ";"), msg("Twisty Timer"));
  if (/^"Puzzle";"Category";"Time\(millis\)"/.test(first)) return twisty(parseDelimited(body, ";", true), msg("Cubic Timer"));
  if (/^No\.;Time;Comment;Scramble;Date/.test(first)) return cstimerCsv(parseDelimited(body, ";"), fallback);
  if (/^Time,Comment,Scramble,Date/.test(first)) return cubeTimeCsv(body, fallback);
  if (/^id,date,dnf,time,/.test(first)) return smartCsv(parseDelimited(body, ","), "Cubeast");
  if (/^solve_id,date,total_time,/.test(first)) return smartCsv(parseDelimited(body, ","), "acubemy");
  throw new Error(msg("This file is not an export Cubix knows. Export from {0}.", { 0: IMPORT_APPS.join(", ") }));
}
