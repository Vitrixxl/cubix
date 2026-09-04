import type { Penalty } from "../../shared/types";

/** 12345 → "12.34", 61234 → "1:01.23" */
export function fmtTime(ms: number | null | undefined, opts: { blank?: string } = {}): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return opts.blank ?? "–";
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = (total % 60000) / 1000;
  if (minutes > 0) return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  return seconds.toFixed(2);
}

export function fmtSolve(timeMs: number, penalty: Penalty): string {
  if (penalty === "dnf") return "DNF";
  if (penalty === "+2") return `${fmtTime(timeMs + 2000)}+`;
  return fmtTime(timeMs);
}

export const effective = (timeMs: number, penalty: Penalty): number | null => (penalty === "dnf" ? null : timeMs + (penalty === "+2" ? 2000 : 0));

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Average of N with best/worst dropped (WCA). More than one DNF → null. */
export function averageOf(times: (number | null)[]): number | null {
  if (times.length < 3) return null;
  if (times.filter((t) => t === null).length > 1) return null;
  const sorted = [...times].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  const trimmed = sorted.slice(1, -1) as number[];
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

export function mean(times: (number | null)[]): number | null {
  const v = times.filter((t): t is number => t !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function best(times: (number | null)[]): number | null {
  const v = times.filter((t): t is number => t !== null);
  return v.length ? Math.min(...v) : null;
}
