import type { Penalty } from "../../shared/types";

/** Times read to the millisecond: 12345 → "12.345", 61234 → "1:01.234" */
export function fmtTime(ms: number | null | undefined, opts: { blank?: string } = {}): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return opts.blank ?? "–";
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = (total % 60000) / 1000;
  if (minutes > 0) return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
  return seconds.toFixed(3);
}

/** How a time reaches the timer page: the built-in timer, a time typed from an external timer, or a timer that records nothing. */
export type TimeEntry = "timer" | "typing" | "casual";
export const TIME_ENTRIES: { id: TimeEntry; label: string }[] = [
  { id: "timer", label: "Timer" },
  { id: "typing", label: "Typing" },
  { id: "casual", label: "Casual" },
];

/** Longest time accepted from the keyboard: ten hours. */
const MAX_TYPED_MS = 36_000_000;

/**
 * A time typed by hand, in ms. Bare digits read from the right like csTimer ("1234" → 12.34,
 * "12345" → 1:23.45); otherwise "12.34", "1:23.45" or "1:02:03.4". Returns null when invalid.
 */
export function parseTypedTime(text: string): number | null {
  const value = text.trim().replace(",", ".");
  let ms: number;
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    ms = (Math.floor(n / 1_000_000) * 3600 + (Math.floor(n / 10_000) % 100) * 60 + (Math.floor(n / 100) % 100)) * 1000 + (n % 100) * 10;
  } else {
    const match = /^(?:(?:(\d+):)?(\d+):)?(\d*)(?:\.(\d*))?$/.exec(value);
    if (!match || !(match[3] || match[4])) return null;
    const [, hours = "0", minutes = "0", seconds, fraction = ""] = match;
    ms = (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds || "0")) * 1000 + Number(fraction.slice(0, 3).padEnd(3, "0"));
  }
  return ms > 0 && ms < MAX_TYPED_MS ? ms : null;
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
