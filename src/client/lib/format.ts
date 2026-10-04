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

/** Formatters built once: `toLocaleDateString` with options builds a new one per call, sixty times slower
 * over a profile's thousands of solves. */
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }),
  HOUR = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }),
  MONTH = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return DAY.format(d) + " " + HOUR.format(d);
}

/** Average of N with best/worst dropped (WCA). More than one DNF → null. */
export function averageOf(times: (number | null)[]): number | null {
  if (times.length < 3) return null;
  let sum = 0, min = Infinity, max = -Infinity, dnfs = 0;
  for (const time of times) {
    if (time === null) { if (++dnfs > 1) return null; }
    else { sum += time; min = Math.min(min, time); max = Math.max(max, time); }
  }
  return (sum - min - (dnfs ? 0 : max)) / (times.length - 2);
}

export function mean(times: (number | null)[]): number | null {
  let sum = 0, count = 0;
  for (const time of times) if (time !== null) { sum += time; count++; }
  return count ? sum / count : null;
}

export function best(times: (number | null)[]): number | null {
  let minimum: number | null = null;
  for (const time of times) if (time !== null) minimum = minimum === null ? time : Math.min(minimum, time);
  return minimum;
}

/** Sliding sum and monotone queues: O(N) time, O(size) scratch space, including Ao100.
 * DNF is excluded from the sum and counts as the discarded worst time. */
function visitAverages(times: readonly (number | null)[], size: number, visit: (value: number | null, index: number) => void) {
  if (!Number.isInteger(size) || size < 3 || size > times.length) {
    for (let i = 0; i < times.length; i++) visit(null, i);
    return;
  }
  const mins = new Array<number>(size), maxs = new Array<number>(size);
  let minHead = 0, minTail = 0, maxHead = 0, maxTail = 0, sum = 0, dnfs = 0;
  for (let i = 0; i < times.length; i++) {
    if (i >= size) {
      const expired = times[i - size];
      if (expired === null) dnfs--; else sum -= expired;
    }
    while (minHead < minTail && mins[minHead % size] <= i - size) minHead++;
    while (maxHead < maxTail && maxs[maxHead % size] <= i - size) maxHead++;
    const time = times[i];
    if (time === null) dnfs++;
    else {
      sum += time;
      while (minTail > minHead && times[mins[(minTail - 1) % size]]! >= time) minTail--;
      while (maxTail > maxHead && times[maxs[(maxTail - 1) % size]]! <= time) maxTail--;
      mins[minTail++ % size] = i;
      maxs[maxTail++ % size] = i;
    }
    visit(i + 1 < size || dnfs > 1 ? null :
      (sum - times[mins[minHead % size]]! - (dnfs ? 0 : times[maxs[maxHead % size]]!)) / (size - 2), i);
  }
}

/** Average of `size` ending at each time, oldest first; null until `size` times exist. */
export function rollingAverages(times: readonly (number | null)[], size: number): (number | null)[] {
  const result = new Array<number | null>(times.length);
  visitAverages(times, size, (value, i) => { result[i] = value; });
  return result;
}

/** Best rolling average of `size`, e.g. the best Ao5 of a series. */
export function bestAverage(times: readonly (number | null)[], size: number): number | null {
  let minimum: number | null = null;
  visitAverages(times, size, value => { if (value !== null) minimum = minimum === null ? value : Math.min(minimum, value); });
  return minimum;
}

/** "1 solve", "1,204 solves". */
export const plural = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

/** A day as "12 Mar". */
export const shortDate = (iso: string) => DAY.format(new Date(iso));

/** The hour for today's solves, the day for older ones. */
export function solvedAt(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? HOUR.format(d) : shortDate(iso);
}

/** When an account was created, as "Mar 2026". */
export const joinedDate = (iso: string) => MONTH.format(new Date(iso));
