/**
 * The account's data as files to keep (Settings, the profile's Export): everything as JSON, which Import reads back
 * (timerImport.ts), or only the solves as a table for a spreadsheet. Shared by the web app and the Android app.
 */
import { eventOf, type PuzzleId, type SolveMode } from "../../shared/puzzles";

type ExportedSolve = { created_at: string; puzzle_id?: string | null; solve_mode?: string | null; time_ms: number; penalty: string; case_id?: string | null; scramble?: string | null; comment?: string | null };

const cell = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));

/** The solves as CSV; the columns stay in English: the file is data, for any spreadsheet. */
export function solvesCsv(solves: readonly ExportedSolve[]): string {
  return [
    "Date,Event,Time (s),Penalty,Case,Scramble,Comment".split(","),
    ...solves.map((x) => [
      x.created_at,
      eventOf((x.puzzle_id ?? "333") as PuzzleId, (x.solve_mode ?? "standard") as SolveMode)?.id ?? x.puzzle_id,
      (x.time_ms / 1000).toFixed(3),
      x.penalty,
      x.case_id,
      x.scramble,
      x.comment,
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
