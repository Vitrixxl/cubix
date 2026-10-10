/**
 * What a profile shows, derived from the profile and the achievements the engine returns: activity by day, streaks,
 * training per stage, the closest goals, the contribution graph and the timer curve. Shared by the web app
 * (desktop/renderer/profile/*) and the Android app (mobile/src/pages/AccountPage.tsx, components/ProfileProgress.tsx).
 */

/** A solve of the activity: when, its time (null for a DNF), and whether it was timed on the timer page. */
export type ActivitySolve = { at: string; time: number | null; timer: boolean };

/** A local day as "2026-03-12". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Timed = { at: string; time: number | null };

/** Every solve of a profile, the timer's and the cases', with a date. */
export function activityOf(profile: { playground?: { history?: Timed[] }; cases?: { history?: Timed[] }[] }): ActivitySolve[] {
  return [
    ...(profile.playground?.history ?? []).map((v) => ({ at: v.at, time: v.time, timer: true })),
    ...(profile.cases ?? []).flatMap((c) => (c.history ?? []).map((v) => ({ at: v.at, time: v.time, timer: false }))),
  ].filter((v) => v.at);
}

/** The latest date of the activity, or null without any. */
export const latestOf = (activity: readonly ActivitySolve[]) => activity.reduce<string | null>((max, v) => (!max || v.at > max ? v.at : max), null);

/** Consecutive active days: the run reaching today (or yesterday, still alive) and the longest one. */
export function streaks(activity: readonly ActivitySolve[]) {
  const days = new Set(activity.map((v) => dayKey(new Date(v.at))));
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let current = 0;
  while (days.has(dayKey(d))) {
    current++;
    d.setDate(d.getDate() - 1);
  }
  let longest = 0,
    run = 0,
    previous = 0;
  for (const key of [...days].sort()) {
    const [y, m, day] = key.split("-").map(Number) as [number, number, number];
    const t = Date.UTC(y, m - 1, day) / 86400000;
    run = t - previous === 1 ? run + 1 : 1;
    previous = t;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

/** Per stage of the cases: how many there are, how many are learned and how many were trained. */
export function stageCounts(cases: readonly { id: string; stage?: string }[], learned: ReadonlySet<string>, trained: ReadonlySet<string>) {
  return [...new Set(cases.map((c) => c.stage).filter((stage): stage is string => !!stage))].map((stage) => {
    const members = cases.filter((c) => c.stage === stage);
    return {
      stage,
      total: members.length,
      learned: members.filter((c) => learned.has(c.id)).length,
      trained: members.filter((c) => trained.has(c.id)).length,
    };
  });
}

/** The achievements still locked, closest first, and the unlocked ones, latest first. */
export function achievementLists<A extends { unlocked: boolean; ratio: number; unlockedAt?: string | null }>(all: readonly A[]) {
  return {
    goals: all.filter((a) => !a.unlocked).sort((a, b) => b.ratio - a.ratio),
    recent: all.filter((a) => a.unlocked && a.unlockedAt).sort((a, b) => (a.unlockedAt! < b.unlockedAt! ? 1 : -1)),
  };
}

/* The contribution graph. */

/** A day of the graph: how many solves, and the timer's times. */
export type HeatDay = { count: number; times: (number | null)[] };
export type HeatCell = { key: string; date: Date; count: number; hidden: boolean };

/** Five steps of the accent: none, then the four quarters of the active days (GitHub's graph). */
export const HEAT_LEVELS = ["bg-muted", "bg-primary/35", "bg-primary/60", "bg-primary/85", "bg-primary"];

/** The solves of each day. */
export function heatDays(solves: readonly ActivitySolve[]) {
  const map = new Map<string, HeatDay>();
  for (const solve of solves) {
    const key = dayKey(new Date(solve.at)),
      day = map.get(key) ?? { count: 0, times: [] };
    day.count++;
    if (solve.timer) day.times.push(solve.time);
    map.set(key, day);
  }
  return map;
}

/** The years with solves, and this one, newest first. */
export const heatYears = (days: ReadonlyMap<string, HeatDay>) =>
  [...new Set([new Date().getFullYear(), ...[...days.keys()].map((k) => Number(k.slice(0, 4)))])].sort((a, b) => b - a);

/** The days to draw: the last 53 weeks up to today, or one calendar year. */
function period(year: number | null) {
  const today = new Date(),
    first = year == null ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364) : new Date(year, 0, 1),
    last = year == null ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : new Date(year, 11, 31),
    start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks = Math.ceil(((last.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return { first, last, start, weeks, today };
}

/**
 * The graph of a period (`year`, or the last twelve months when null): a cell per day, a week per column from Monday,
 * the level of each count, the months named over their first week, and the total.
 */
export function heatmap(days: ReadonlyMap<string, HeatDay>, year: number | null) {
  const { first, last, start, weeks, today } = period(year),
    cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = dayKey(date);
    cells.push({ key, date, count: days.get(key)?.count ?? 0, hidden: date < first || date > last || date > today });
  }
  // The active days split in four quarters, like GitHub's graph: a few busy days don't flatten the rest.
  const counts = cells.filter((c) => !c.hidden && c.count).map((c) => c.count).sort((a, b) => a - b),
    quartile = (q: number) => counts[Math.min(counts.length - 1, Math.floor(q * counts.length))] ?? 0,
    steps = [quartile(0.25), quartile(0.5), quartile(0.75)] as const,
    level = (count: number) => (!count ? 0 : count <= steps[0] ? 1 : count <= steps[1] ? 2 : count <= steps[2] ? 3 : 4);
  // A month is named over the week of its first day, unless the previous name is too close.
  const months: { week: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const week = cells.slice(w * 7, w * 7 + 7),
      opening = w === 0 ? week.find((c) => c.date >= first) : week.find((c) => c.date.getDate() === 1);
    if (!opening || opening.date > last) continue;
    if (months.length && w - months.at(-1)!.week < 3) months.pop();
    months.push({ week: w, label: opening.date.toLocaleDateString(undefined, { month: "short" }) });
  }
  return { cells, weeks, months, level, total: counts.reduce((sum, n) => sum + n, 0) };
}

/* The timer curve. */

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * The scale of the timer curve over the latest `count` solves and their Ao5, drawn `height` tall with `top` and
 * `bottom` margins: null under two times. The slowest few percent would squash the rest, so the scale stops near the
 * top 3 %. `line` draws a series as an SVG path, `x` mapping an index to its abscissa.
 */
export function trendScale<P extends { time: number | null }>(history: readonly P[], averages: readonly (number | null)[], count: number, height: number, margin = 8) {
  const from = Math.max(0, history.length - count),
    shown = history.slice(from),
    ao5 = averages.slice(from),
    values = [...shown.map((v) => v.time), ...ao5].filter(finite);
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b),
    low = sorted[0]!,
    high = Math.max(low + 1, sorted[Math.floor(sorted.length * 0.97)]!),
    y = (v: number) => margin + (1 - (Math.min(v, high) - low) / (high - low)) * (height - 2 * margin),
    line = (points: readonly (number | null)[], x: (i: number) => number, round: (n: number) => number | string = (n) => n) =>
      points.map((v, i) => (finite(v) ? `${finite(points[i - 1]) ? "L" : "M"}${round(x(i))} ${round(y(v))}` : "")).join(" ");
  return { from, shown, ao5, low, high, y, line, ticks: [0, 1, 2].map((i) => high - ((high - low) * i) / 2), finite };
}

/* The journal. */

/** A day of the journal: its solves, the event's best single and best Ao5 that day, and the records it set. */
export type JournalDay = { key: string; date: Date; count: number; best: number | null; ao5: number | null; records: { kind: "single" | "ao5"; time: number; gain: number | null }[] };

/**
 * The active days, newest first, from every event's solves (`activity`) and one event's timer history in order with
 * its Ao5 (`history`, `averages`): each day's best single and Ao5, and the records beaten that day with their gain.
 */
export function journalDays(activity: readonly ActivitySolve[], history: readonly Timed[], averages: readonly (number | null)[]): JournalDay[] {
  const days = new Map<string, JournalDay>(),
    day = (at: string) => {
      const date = new Date(at),
        key = dayKey(date);
      let d = days.get(key);
      if (!d) days.set(key, (d = { key, date: new Date(date.getFullYear(), date.getMonth(), date.getDate()), count: 0, best: null, ao5: null, records: [] }));
      return d;
    };
  for (const v of activity) day(v.at).count++;
  const best = { single: null as number | null, ao5: null as number | null };
  history.forEach((v, i) => {
    if (!v.at) return;
    const d = day(v.at);
    for (const [kind, time] of [["single", v.time], ["ao5", averages[i]]] as const) {
      if (!finite(time)) continue;
      const own = kind === "single" ? "best" : "ao5";
      if (d[own] == null || time < d[own]!) d[own] = time;
      const previous = best[kind];
      if (previous != null && time >= previous) continue;
      best[kind] = time;
      // A day keeps one record of each kind, its best; `gain` holds the record before the day until the end.
      const set = d.records.find((r) => r.kind === kind);
      if (set) set.time = time;
      else d.records.push({ kind, time, gain: previous });
    }
  });
  // The gain: how much the day took off the record standing before it (none for a first time).
  for (const d of days.values()) for (const r of d.records) r.gain = r.gain == null ? null : r.gain - r.time;
  return [...days.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** The best Ao5 of each of the last `count` weeks (from Monday), oldest first, null for a week without one. */
export function weeklyBestAo5(history: readonly Timed[], averages: readonly (number | null)[], count = 10, today = new Date()) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)),
    weeks = Array.from({ length: count }, (_, i) => ({ start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (count - 1 - i)), best: null as number | null }));
  history.forEach((v, i) => {
    const time = averages[i],
      at = new Date(v.at);
    if (!finite(time)) return;
    const week = weeks.findLast((w) => w.start <= at);
    if (week && at.getTime() - week.start.getTime() < 7 * 86_400_000 && (week.best == null || time < week.best)) week.best = time;
  });
  return weeks;
}
