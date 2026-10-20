/**
 * The account's data as files to keep (Settings, the profile's Export): everything as JSON, which Import reads back
 * (timerImport.ts), or only the solves as a table for a spreadsheet. Shared by the web app and the Android app.
 */
import { eventOf, type PuzzleId, type SolveMode } from "../../shared/puzzles";
import { phaseTimes } from "./phases";
import { numberedScrambles } from "./wca";
import { toHundredths } from "./format";

type ExportedSolve = { created_at: string; puzzle_id?: string | null; solve_mode?: string | null; time_ms: number; penalty: string; case_id?: string | null; scramble?: string | null; comment?: string | null; splits?: number[] | null };

const cell = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));

/** The solves as CSV; the columns stay in English: the file is data, for any spreadsheet. */
export function solvesCsv(solves: readonly ExportedSolve[]): string {
  return [
    "Date,Event,Time (s),Penalty,Case,Scramble,Comment,Phases (s)".split(","),
    ...solves.map((x) => [
      x.created_at,
      eventOf((x.puzzle_id ?? "333") as PuzzleId, (x.solve_mode ?? "standard") as SolveMode)?.id ?? x.puzzle_id,
      (toHundredths(x.time_ms) / 1000).toFixed(2),
      x.penalty,
      x.case_id,
      x.scramble,
      x.comment,
      x.splits && phaseTimes(x.splits, x.time_ms).map((t) => (toHundredths(t) / 1000).toFixed(2)).join(" "),
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\n");
}

/** The file of an export: its text, type and name ("qbix-<user>-solves-<date>.csv", "qbix-<user>-<date>.json"). */
export function exportFile(kind: "csv" | "json", data: { solves: readonly ExportedSolve[] }, username: string, date = new Date().toISOString().slice(0, 10)) {
  return kind === "csv"
    ? { body: solvesCsv(data.solves), type: "text/csv", name: `qbix-${username}-solves-${date}.csv` }
    : { body: JSON.stringify(data, null, 2), type: "application/json", name: `qbix-${username}-${date}.json` };
}

/**
 * Scrambles to take away (the timer's Export) as a numbered sheet, a table or JSON: a relay's scramble (a line a puzzle)
 * split by `parts`, its puzzles' names.
 */
export function scramblesFile(kind: "txt" | "csv" | "json", list: readonly string[], event: string, parts?: readonly string[]) {
  const split = (x: string) => (parts ? x.split("\n") : [x]);
  if (kind === "csv")
    return { body: [["#", ...(parts ?? ["Scramble"])], ...list.map((x, i) => [i + 1, ...split(x)])].map((row) => row.map(cell).join(",")).join("\n") + "\n", type: "text/csv" };
  if (kind === "json")
    return { body: JSON.stringify({ event, scrambles: parts ? list.map((x) => Object.fromEntries(split(x).map((line, j) => [parts[j], line]))) : list }, null, 2) + "\n", type: "application/json" };
  return { body: `${event}\n\n${numberedScrambles(list, parts)}\n`, type: "text/plain" };
}
