/** The account page: overview, timer, training and achievements. */
import { shortId } from "../../src/client/lib/caseState";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Lock, LogIn, LogOut, Search, Settings, Swords, Trophy, UserPlus } from "lucide-react";
import { store as s, matches } from "./store";
import { fmtSolve, fmtTime, best, bestAverage } from "../../src/client/lib/format";
import {
  Avatar,
  Bar,
  Button,
  Choice,
  Diagram,
  Empty,
  Figure,
  Icon,
  LABEL,
  MOBILE,
  MONO,
  MenuAction,
  MenuChoice,
  PAGE,
  PageHead,
  PageSkeleton,
  PuzzleButton,
  SelectMenu,
  SolveMenu,
  Surface,
  type Props,
  plural,
  useViewport,
} from "./ui";
import { TimerStats } from "./stats";
import { DUELS_KEY, ROUNDS, battleRecord, type DuelRecord } from "./duelClient";
import { eventInfo, eventLabel } from "../../src/shared/puzzles";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** The next achievement to reach, by progress. */
function nextAchievement() {
  return (s.achievements?.achievements ?? []).filter((a: any) => !a.unlocked).sort((a: any, b: any) => b.ratio - a.ratio)[0];
}

/** How many rows of `row` px, `gap` px apart, fit in the element's height. */
function useFit(row: number, gap = 0) {
  const ref = useRef<HTMLDivElement>(null),
    [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setFit(Math.max(0, Math.floor((el.clientHeight + gap) / (row + gap))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [row, gap]);
  return [ref, fit] as const;
}

const CHART_SOLVES = 100;

/** The last solves and their Ao5 over a time axis, the best of them ringed and the latest dotted. */
function TimerChart({ times, averages }: { times: (number | null)[]; averages: (number | null)[] }) {
  const from = Math.max(0, times.length - CHART_SOLVES),
    singles = times.slice(from),
    ao5 = averages.slice(from),
    finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v),
    values = [...singles, ...ao5].filter(finite);
  const low = Math.min(...values),
    high = Math.max(low + 1, Math.max(...values)),
    x = (i: number) => (singles.length === 1 ? 50 : (i / (singles.length - 1)) * 100),
    y = (v: number) => 6 + (1 - (v - low) / (high - low)) * 88,
    // A DNF or a missing average breaks the line rather than joining its neighbours.
    line = (points: (number | null)[]) =>
      points.map((v, i) => (finite(v) ? `${finite(points[i - 1]) ? "L" : "M"}${x(i)} ${y(v)}` : "")).join(" "),
    kept = singles.filter(finite),
    bestAt = singles.indexOf(Math.min(...kept)),
    last = singles.findLastIndex(finite);
  const dot = (i: number, className: string) => (
    <i className={cn("absolute size-2 -translate-1/2 rounded-full ring-2 ring-background", className)} style={{ left: x(i) + "%", top: y(singles[i]!) + "%" }} />
  );
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-3" aria-hidden="true">
      <div className="relative w-11">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn(MONO, "absolute right-0 -translate-y-1/2 text-[11px] text-muted-foreground")} style={{ top: 6 + (i / 3) * 88 + "%" }}>
            {fmtTime(high - ((high - low) * i) / 3)}
          </span>
        ))}
      </div>
      <div className="relative min-h-0">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M0 ${6 + (i / 3) * 88} H100`} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={line(ao5)} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={line(singles)} fill="none" stroke="var(--chart-1)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {bestAt !== last && dot(bestAt, "bg-success")}
        {dot(last, "bg-chart-1")}
      </div>
    </div>
  );
}

const RECENT_ROW = 32;

/** The hour for today's solves, the day for older ones. */
const solvedAt = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : shortDate(iso);
};

/** The latest timer solves, newest first, as many as the column holds; right-click one for its menu. */
function RecentSolves({ history }: { history: any[] }) {
  const [ref, fit] = useFit(RECENT_ROW),
    shown = history.slice(Math.max(0, history.length - fit)).reverse();
  return (
    <div className="flex min-h-0 w-56 shrink-0 flex-col gap-1 border-l pl-5">
      <span className={LABEL}>Last solves</span>
      <div ref={ref} className="-mx-2 min-h-0 flex-1 overflow-hidden">
        {shown.map((v, i) => (
          <SolveMenu key={v.id ?? i} solve={{ ...v, time_ms: v.timeMs }}>
            <button
              type="button"
              data-action={"solve:" + v.id}
              onClick={(e) => {
                e.currentTarget.blur();
                void s.action("solve:" + v.id);
              }}
              className="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-muted/50"
            >
              <span className={cn(MONO, "w-8 text-right text-xs text-muted-foreground")}>{history.length - i}</span>
              <span className={cn(MONO, "flex-1 text-sm", v.time == null && "text-destructive", v.penalty === "+2" && "text-warning")}>
                {v.time == null ? "DNF" : fmtTime(v.time)}
              </span>
              <span className="text-xs text-muted-foreground">{solvedAt(v.at)}</span>
            </button>
          </SolveMenu>
        ))}
      </div>
    </div>
  );
}

/** Labelled bars, e.g. one per stage or per pending goal. */
function MiniBars({ rows }: { rows: { label: string; value: string; ratio: number; done?: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr_3.5rem] items-center gap-3">
          <span className="truncate text-sm text-muted-foreground">{r.label}</span>
          <Bar ratio={r.ratio} done={r.done ?? true} />
          <span className={cn(MONO, "text-right text-xs text-muted-foreground")}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type ActivitySolve = { at: string; time: number | null; timer: boolean };

type DayStats = { count: number; best: number | null; ao5: number | null; ao12: number | null };

const HEAT_GAP = 3,
  HEAT_LABEL = 28;

const heatColor = (ratio: number) => `color-mix(in oklab, var(--primary) ${25 + Math.round(ratio * 75)}%, var(--muted))`;

/** GitHub-style activity: solves per day, one column per week (Monday on top), up to a year wide. */
function Activity({ solves, summary, detail }: { solves: ActivitySolve[]; summary: { label: string; value: string }[]; detail: string }) {
  const ref = useRef<HTMLElement>(null),
    [fit, setFit] = useState({ weeks: 53, cell: 12 }),
    [hover, setHover] = useState<{ key: string; rect: DOMRect } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const avail = el.getBoundingClientRect().width - HEAT_LABEL - HEAT_GAP,
        weeks = Math.max(1, Math.min(53, Math.floor((avail + HEAT_GAP) / (9 + HEAT_GAP)))),
        cell = Math.max(9, Math.min(innerHeight <= 640 ? 10 : innerHeight < 800 ? 11 : 15, Math.floor((avail + HEAT_GAP) / weeks - HEAT_GAP)));
      setFit((f) => (f.weeks === weeks && f.cell === cell ? f : { weeks, cell }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, []);
  const days = new Map<string, { count: number; times: (number | null)[] }>();
  for (const solve of solves) {
    const key = dayKey(new Date(solve.at)),
      day = days.get(key) ?? { count: 0, times: [] };
    day.count++;
    if (solve.timer) day.times.push(solve.time);
    days.set(key, day);
  }
  const { weeks, cell } = fit,
    today = new Date(),
    end = new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    offset = (end.getDay() + 6) % 7,
    start = new Date(end);
  start.setDate(end.getDate() - offset - (weeks - 1) * 7);
  const peak = Math.max(1, ...[...days.values()].map((d) => d.count)),
    cells: { key: string; date: Date; count: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    cells.push({ key, date: d, count: days.get(key)?.count ?? 0, future: d > end });
  }
  // A month label sits over the first week starting in that month, unless the next label is too close.
  const months: { week: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const month = cells[w * 7].date.getMonth();
    if (w && month === cells[(w - 1) * 7].date.getMonth()) continue;
    if (months.length && w - months.at(-1)!.week < 3) months.pop();
    months.push({ week: w, label: cells[w * 7].date.toLocaleDateString(undefined, { month: "short" }) });
  }
  const shown = cells.reduce((sum, c) => sum + c.count, 0),
    width = HEAT_LABEL + weeks * (cell + HEAT_GAP),
    hovered = hover && cells.find((c) => c.key === hover.key),
    times = (hover && days.get(hover.key)?.times) ?? [],
    stats: DayStats | null = hovered ? { count: hovered.count, best: best(times), ao5: bestAverage(times, 5), ao12: bestAverage(times, 12) } : null;
  return (
    <section ref={ref} className="flex shrink-0 flex-col" aria-label="Activity">
      <div className="flex flex-col gap-3" style={{ width }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-sm font-medium">
            {plural(shown, "solve")} in the last {weeks >= 52 ? "year" : plural(weeks, "week")}
          </h2>
          <div className="flex gap-5 text-xs text-muted-foreground">
            {summary.map((m) => (
              <span key={m.label}>
                <span className={cn(MONO, "text-sm text-foreground")}>{m.value}</span> {m.label}
              </span>
            ))}
          </div>
        </div>
        <div
          className="grid"
          role="img"
          aria-label={`Solves per day over the last ${weeks} weeks`}
          onMouseLeave={() => setHover(null)}
          style={{ gridTemplateColumns: `${HEAT_LABEL}px repeat(${weeks}, ${cell}px)`, gridTemplateRows: `auto repeat(7, ${cell}px)`, gap: HEAT_GAP }}
        >
          {months.map((m) => (
            <span key={m.week} className="pb-1 text-[11px] leading-none whitespace-nowrap text-muted-foreground" style={{ gridRow: 1, gridColumn: m.week + 2 }}>
              {m.label}
            </span>
          ))}
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <span key={d} className="self-center text-[11px] leading-none text-muted-foreground" style={{ gridRow: 2 + i * 2, gridColumn: 1 }}>
              {d}
            </span>
          ))}
          {cells.map((c, i) => (
            <span
              key={c.key}
              className={cn("rounded-[3px]", c.future ? "bg-transparent" : "bg-muted", hover?.key === c.key && "ring-1 ring-foreground/60")}
              onMouseEnter={(e) => (c.future ? setHover(null) : setHover({ key: c.key, rect: e.currentTarget.getBoundingClientRect() }))}
              style={{ gridRow: 2 + (i % 7), gridColumn: 2 + Math.floor(i / 7), background: c.count ? heatColor(c.count / peak) : undefined }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{detail}</span>
          <span className="flex items-center gap-1">
            Less
            {[0, 0.25, 0.5, 0.75, 1].map((r) => (
              <span key={r} className="rounded-[3px] bg-muted" style={{ width: cell, height: cell, background: r ? heatColor(r) : undefined }} />
            ))}
            More
          </span>
        </div>
      </div>
      {hover &&
        hovered &&
        stats &&
        createPortal(
          <div
            className={cn(
              "pointer-events-none fixed z-50 flex min-w-36 -translate-y-full flex-col gap-1 rounded-lg bg-popover px-3 py-2 text-popover-foreground shadow-md ring-1 ring-foreground/10",
              hover.rect.left < 120 ? "" : hover.rect.right > innerWidth - 120 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: hover.rect.left + hover.rect.width / 2, top: hover.rect.top - 8 }}
          >
            <span className="text-xs text-muted-foreground">{hovered.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
            <strong className="text-sm font-medium">{plural(stats.count, "solve")}</strong>
            {[
              ["Best", stats.best],
              ["Best Ao5", stats.ao5],
              ["Best Ao12", stats.ao12],
            ].map(([label, value]) => (
              <span key={label as string} className="flex justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={MONO}>{fmtTime(value as number | null)}</span>
              </span>
            ))}
          </div>,
          document.body,
        )}
    </section>
  );
}

function ProfileFilters({ scramble = false }: { scramble?: boolean }) {
  return (
    <>
      <PuzzleButton profile />
      {scramble && (
        <SelectMenu
          action="profileScramble"
          caption="Scramble"
          value={s.profileScramble}
          options={s.info(s.profilePuzzle).scrambles.map((id: string) => ({ id, label: s.label("scrambles", id) }))}
        />
      )}
    </>
  );
}

/** A section of the overview (level 2): its title opens the section's own page; `rule` sets it under a hairline. */
function Section({ action, title, meta, children, className, aside, rule = false }: { action: string; title: string; meta?: React.ReactNode; aside?: React.ReactNode; rule?: boolean } & Props) {
  return (
    <section className={cn("flex min-h-0 flex-col gap-3", rule && "border-t pt-5", className)}>
      <div className="flex min-h-8 items-center gap-3">
        <Button action={action} size="sm" className="-ml-2.5 gap-1 text-sm font-medium">
          {title}
          <ChevronRight className="text-muted-foreground" />
        </Button>
        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function overviewData() {
  const p = s.profile,
    timer = p.playground?.summary ?? { count: 0 },
    cases = s.cases(s.profilePuzzle),
    learned = cases.filter((c: any) => s.learned.has(c.id)).length,
    trained = p.cases?.length ?? 0,
    trainingSolves: number = p.trainingSolves ?? 0,
    unlocked = s.achievements?.unlocked ?? 0,
    total = s.achievements?.total ?? 0,
    next = nextAchievement(),
    stages = [...new Set<string>(cases.map((c: any) => c.stage))].map((stage) => {
      const members = cases.filter((c: any) => c.stage === stage),
        done = members.filter((c: any) => s.learned.has(c.id)).length;
      return { label: stage, value: `${done} / ${members.length}`, ratio: members.length ? done / members.length : 0 };
    }),
    goals = (s.achievements?.achievements ?? [])
      .filter((a: any) => !a.unlocked)
      .sort((a: any, b: any) => b.ratio - a.ratio)
      .slice(0, 40)
      .map((a: any) => ({ label: a.title, value: `${Math.round(a.ratio * 100)}%`, ratio: a.ratio, done: false })),
    recent = (s.achievements?.achievements ?? [])
      .filter((a: any) => a.unlocked && a.unlockedAt)
      .sort((a: any, b: any) => (a.unlockedAt < b.unlockedAt ? 1 : -1))
      .slice(0, 3),
    activity: ActivitySolve[] = [
      ...(p.playground?.history ?? []).map((v: any) => ({ at: v.at, time: v.time, timer: true })),
      ...(p.cases ?? []).flatMap((c: any) => (c.history ?? []).map((v: any) => ({ at: v.at, time: v.time, timer: false }))),
    ].filter((v) => v.at),
    latest = [timer.lastAt, ...(p.cases ?? []).map((c: any) => c.summary?.lastAt)]
      .filter((at): at is string => !!at)
      .sort()
      .at(-1);
  return {
    timer,
    history: (p.playground?.history ?? []) as any[],
    timerTimes: (p.playground?.history ?? []).map((v: any) => v.time as number | null),
    timerAverages: (p.playground?.ao5 ?? []) as (number | null)[],
    timerDetail: timer.count ? `${plural(timer.count, "solve")} · ${s.label("scrambles", s.profileScramble)}` : "No solves in this selection yet",
    cases,
    learned,
    trained,
    trainingSolves,
    unlocked,
    total,
    next,
    stages,
    goals,
    recent,
    activity,
    latest,
  };
}

type OverviewData = ReturnType<typeof overviewData>;

/** The timer's figures in a row, the best single leading. */
function TimerFigures({ d }: { d: OverviewData }) {
  const t = d.timer;
  return (
    <div className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-4 xl:grid-cols-6">
      {[
        ["Best single", t.best, "good"],
        ["Best Ao5", t.bestAo5, ""],
        ["Best Ao12", t.bestAo12, ""],
        ["Ao5", t.ao5, "accent"],
        ["Ao12", t.ao12, "accent"],
        ["Mean", t.mean, ""],
      ].map(([label, value, tone]) => (
        <Figure key={label} label={label} value={t.count ? fmtTime(value as number | null) : "–"} tone={tone as any} size={label === "Best single" ? "lg" : "lg"} />
      ))}
    </div>
  );
}

/** The closest achievements, as many as the space holds, over the latest ones unlocked. */
function AchievementGoals({ d }: { d: OverviewData }) {
  const [ref, fit] = useFit(22, 10);
  return (
    <>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        <MiniBars rows={d.goals.slice(0, fit)} />
      </div>
      {d.recent.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className={LABEL}>Recently unlocked</span>
          {d.recent.map((a: any) => (
            <span key={a.id} className="flex items-center gap-2 text-sm">
              <Trophy className="size-3.5 text-warning" />
              <span className="flex-1 truncate">{a.title}</span>
              <span className="text-xs text-muted-foreground">{a.unlockedDate}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Battles raced on this device, newest first. */
const battles = (): DuelRecord[] => s.prefs[DUELS_KEY] ?? [];
const RESULT_MARK = { win: "W", loss: "L", draw: "D" } as const;
const RESULT_TONE = { win: "bg-success/15 text-success", loss: "bg-destructive/15 text-destructive", draw: "bg-muted text-muted-foreground" } as const;
const ao5Text = (v: number | null) => (v === null ? "DNF" : fmtTime(v));
const battleEvent = (b: DuelRecord) => {
  const e = eventInfo(b.event);
  return e ? eventLabel(e.puzzle, e.solveMode) : b.event;
};

function ResultMark({ result }: { result: DuelRecord["result"] }) {
  return <span className={cn(MONO, "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium", RESULT_TONE[result])}>{RESULT_MARK[result]}</span>;
}

/** The latest battles, as many as the space holds: result, opponent and both averages. */
function RecentBattles() {
  const list = battles(),
    [ref, fit] = useFit(RECENT_ROW);
  return (
    <Section action="profileMode:duels" title="Battles" meta={list.length ? battleRecord(list) : undefined} className="ov-battles flex-1" rule>
      <div ref={ref} className="-mx-2 min-h-0 flex-1 overflow-hidden">
        {!list.length && <p className="px-2 text-sm text-muted-foreground">Race another cuber from Duel: your results land here.</p>}
        {list.slice(0, fit).map((b) => (
          <div key={b.id} className="flex h-8 items-center gap-3 px-2">
            <ResultMark result={b.result} />
            <span className="min-w-0 flex-1 truncate text-sm">{b.opponent}</span>
            <span className={cn(MONO, "text-xs")}>
              {ao5Text(b.ao5[0])} <span className="text-muted-foreground">vs</span> {ao5Text(b.ao5[1])}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Every battle kept on this device: result, opponent, event, both averages and the five rounds. */
function Battles() {
  const list = battles();
  if (!list.length)
    return (
      <Empty>
        <span>No battles yet.</span>
        <Button action="nav:duel" variant="default" icon={Swords}>
          Find an opponent
        </Button>
      </Empty>
    );
  const columns = "grid grid-cols-[1.5rem_minmax(8rem,1fr)_5rem_5rem_minmax(0,2fr)_5rem] items-center gap-4 max-md:grid-cols-[1.5rem_minmax(0,1fr)_4rem_4rem] max-md:gap-3";
  return (
    <Surface className="battles flex-1">
      <div className={cn(columns, "border-b px-4 py-2.5 text-xs font-medium text-muted-foreground")}>
        <span />
        <span>Opponent</span>
        <span>You</span>
        <span>Them</span>
        <span className="max-md:hidden">Rounds</span>
        <span className="text-right max-md:hidden">Date</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.map((b) => (
          <div key={b.id} className={cn(columns, "rounded-md px-2 py-2 hover:bg-muted/50")}>
            <ResultMark result={b.result} />
            <span className="flex min-w-0 flex-col">
              <strong className="truncate text-sm font-medium">{b.opponent}</strong>
              <small className="truncate text-xs text-muted-foreground">{battleEvent(b)}</small>
            </span>
            <span className={cn(MONO, "text-sm", b.result === "win" && "text-success")}>{ao5Text(b.ao5[0])}</span>
            <span className={cn(MONO, "text-sm", b.result === "loss" && "text-success")}>{ao5Text(b.ao5[1])}</span>
            <span className={cn(MONO, "grid grid-cols-5 gap-2 text-xs max-md:hidden")}>
              {[...Array(ROUNDS).keys()].map((r) => (
                <span key={r} className="flex flex-col">
                  <span>{b.mine[r] ? fmtSolve(b.mine[r]!.ms, b.mine[r]!.penalty) : "–"}</span>
                  <span className="text-muted-foreground">{b.theirs[r] ? fmtSolve(b.theirs[r]!.ms, b.theirs[r]!.penalty) : "–"}</span>
                </span>
              ))}
            </span>
            <small className="text-right text-xs text-muted-foreground max-md:hidden">{shortDate(b.at)}</small>
          </div>
        ))}
      </div>
    </Surface>
  );
}

/**
 * Overview: the activity over the year, then the timer as the page's surface (figures, curve, last solves) on the
 * left; training, achievements and battles as quieter sections under hairlines on the right.
 */
function Overview() {
  const p = s.profile,
    d = overviewData(),
    mobile = useViewport().w <= MOBILE,
    charted = d.timerTimes.filter((v: number | null) => v != null).length >= 2;
  const legend = charted && (
    <span className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-chart-1" />
        Single
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-chart-2" />
        Ao5
      </span>
    </span>
  );
  return (
    <div className={cn("overview flex min-h-0 flex-1 gap-8 xl:gap-10", mobile && "-mx-4 flex-col gap-6 overflow-y-auto px-4 pb-4")}>
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Activity
          solves={d.activity}
          summary={[
            { label: (p.activeDays ?? 0) === 1 ? "active day" : "active days", value: String(p.activeDays ?? 0) },
            { label: "total solves", value: (p.totalSolves ?? 0).toLocaleString() },
            { label: "per active day", value: p.activeDays ? (p.totalSolves / p.activeDays).toFixed(1) : "–" },
          ]}
          detail={d.latest ? `Last practice: ${shortDate(d.latest)}` : "No practice recorded yet"}
        />
        <Surface className={cn("flex-1", mobile && "min-h-[28rem] shrink-0")}>
          <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 md:px-5">
            <Button action="profileMode:playground" size="sm" className="-ml-2.5 gap-1 text-sm font-medium">
              Timer
              <ChevronRight className="text-muted-foreground" />
            </Button>
            <span className="truncate text-xs text-muted-foreground">{d.timerDetail}</span>
            {!mobile && <span className="ml-auto">{legend}</span>}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 p-4 md:p-5">
            <TimerFigures d={d} />
            <div className="flex min-h-0 flex-1 gap-5">
              {charted ? (
                <TimerChart times={d.timerTimes} averages={d.timerAverages} />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Your progress curve appears after two timed solves.</div>
              )}
              {d.history.length > 0 && !mobile && <RecentSolves history={d.history} />}
            </div>
          </div>
        </Surface>
      </div>
      <div className={cn("flex min-h-0 shrink-0 flex-col gap-5", mobile ? "w-full" : "w-72 xl:w-80")}>
        <Section action="profileMode:training" title="Training" meta={`${d.learned} learned · ${plural(d.trainingSolves, "solve")}`}>
          <div className="flex items-baseline gap-2">
            <span className={cn(MONO, "text-3xl font-medium tracking-tight")}>{d.trained}</span>
            <span className="text-sm text-muted-foreground">/ {d.cases.length} cases trained</span>
          </div>
          <MiniBars rows={d.stages} />
        </Section>
        <Section action="profileMode:achievements" title="Achievements" meta={d.next ? `Next: ${d.next.title}` : "Everything unlocked"} className={mobile ? undefined : "flex-1"} rule>
          <div className="flex items-baseline gap-2">
            <span className={cn(MONO, "text-3xl font-medium tracking-tight")}>{d.unlocked}</span>
            <span className="text-sm text-muted-foreground">/ {d.total} unlocked</span>
          </div>
          <AchievementGoals d={d} />
        </Section>
        <RecentBattles />
      </div>
    </div>
  );
}

function TrainingProgress() {
  const p = s.profile,
    cases = s.cases(s.profilePuzzle),
    learned = cases.filter((c: any) => s.learned.has(c.id)).length;
  return (
    <Surface className="flex-1">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <Choice
          prefix="profileStage:"
          label="Stage"
          value={s.profileStage}
          options={["all", ...new Set<string>(cases.map((c: any) => c.stage))].map((stage) => ({ id: stage, label: stage === "all" ? "All" : stage }))}
        />
        <InputGroup className="w-56 max-md:w-full">
          <InputGroupInput
            placeholder="Search cases…"
            aria-label="Search cases"
            value={s.query}
            onChange={(e) => {
              s.query = e.target.value;
              s.emit();
            }}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <span className="ml-auto text-sm text-muted-foreground max-md:hidden">
          <span className={MONO}>{p.cases?.length ?? 0}</span> / {cases.length} trained · <span className={MONO}>{learned}</span> learned
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2">
        {s.allSets(s.profilePuzzle).map((set: any) => {
          const chosen = cases.filter((c: any) => c.set === set.id && (s.profileStage === "all" || s.profileStage === c.stage) && matches(c, s.query));
          if (!chosen.length) return null;
          const key = "profile:" + set.id,
            trained = chosen.filter((c: any) => p.cases?.some((v: any) => v.summary?.caseId === c.id)).length,
            closed = s.collapsed.has(key);
          return (
            <section key={key} className="flex flex-col pb-4">
              <button
                type="button"
                data-action={"collapse:" + key}
                onClick={(e) => {
                  e.currentTarget.blur();
                  void s.action("collapse:" + key);
                }}
                className="-mx-2 flex h-10 items-center gap-2 rounded-lg px-2 text-left text-sm font-medium outline-none hover:bg-muted/40"
              >
                {closed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                {set.label}
                <span className={cn(MONO, "text-xs font-normal text-muted-foreground")}>
                  {trained} / {chosen.length}
                </span>
              </button>
              {!closed && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-1 pt-1">
                  {chosen.map((c: any) => {
                    const st = p.cases?.find((v: any) => v.summary?.caseId === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-action={"profileCase:" + c.id}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          void s.action("profileCase:" + c.id);
                        }}
                        className={cn("flex flex-col items-center gap-1 rounded-lg px-1 pt-3 pb-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50", !st && "opacity-45 hover:opacity-100")}
                      >
                        <Diagram c={c} size={64} />
                        <span className="max-w-full truncate text-xs font-medium">{shortId(c)}</span>
                        <span className={cn(MONO, "text-xs", st ? "text-success" : "text-muted-foreground")}>{st ? fmtTime(st.summary.best) : "–"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Surface>
  );
}

const PROFILE_SECTIONS: Record<string, string> = {
  playground: "Timer",
  training: "Training",
  achievements: "Achievements",
  duels: "Battles",
};

/** Account page: the overview, or one of its sections opened from it as a page of its own. */
export function Profile() {
  const p = s.profile,
    mobile = useViewport().w <= MOBILE;
  if (!p) return <PageSkeleton side={false} />;
  const guest = s.user.isGuest,
    mode = s.profileMode in PROFILE_SECTIONS ? s.profileMode : "overview",
    title = PROFILE_SECTIONS[mode] ?? "Overview";
  if (mobile) return <PhoneProfile mode={mode} />;
  return (
    <div className={PAGE}>
      {mode === "overview" ? (
        <PageHead
          lead={mobile && <Avatar user={guest ? { username: "G" } : p.user} size={36} />}
          title={mobile ? (guest ? "Guest" : p.user.username) : "Profile"}
          sub={guest ? "Guest · times stay on this device" : `${p.user.username} · joined ${p.user.joined}`}
        >
          {guest && (
            <>
              <Button action="account:login">Sign in</Button>
              <Button action="account:register" variant="default">
                Create account
              </Button>
            </>
          )}
          <ProfileFilters />
        </PageHead>
      ) : (
        <PageHead
          lead={<Button action="back" icon={ChevronLeft} tip="Back to the overview" className="-ml-2" />}
          title={title}
          sub={mode === "duels" ? battleRecord(battles()) : undefined}
        >
          {mode === "training" && <ProfileFilters />}
          {mode === "playground" && <ProfileFilters scramble />}
          {mode === "achievements" && s.achievements && (
            <div className="flex items-center gap-3">
              <span className={cn(MONO, "text-sm text-muted-foreground")}>
                {s.achievements.unlocked} / {s.achievements.total}
              </span>
              <Bar ratio={s.achievements.total ? s.achievements.unlocked / s.achievements.total : 0} className="w-32 max-md:w-16" />
            </div>
          )}
        </PageHead>
      )}
      <ProfileBody mode={mode} title={title} />
    </div>
  );
}

/**
 * Phones: the account in the header (its menu holds the guides, the settings and signing in or out), the puzzle
 * beside it, and the sections as a segmented control instead of pages to open.
 */
function PhoneProfile({ mode }: { mode: string }) {
  const p = s.profile,
    guest = s.user.isGuest;
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Avatar user={guest ? { username: "G" } : p.user} size={36} />}
        title={guest ? "Guest" : p.user.username}
        more={
          <>
            <MenuAction action="help" icon={BookOpen}>Guides</MenuAction>
            <MenuAction action="settings" icon={Settings}>Settings</MenuAction>
            <DropdownMenuSeparator />
            {guest ? (
              <>
                <MenuAction action="account:login" icon={LogIn}>Sign in</MenuAction>
                <MenuAction action="account:register" icon={UserPlus}>Create account</MenuAction>
              </>
            ) : (
              <MenuAction action="logout" icon={LogOut}>Sign out</MenuAction>
            )}
          </>
        }
      >
        <ProfileFilters />
      </PageHead>
      <Tabs value={mode} onValueChange={(v: string) => void s.action("profileMode:" + v)} className="shrink-0">
        <TabsList className="h-10! w-full">
          {Object.entries({ overview: "Overview", ...PROFILE_SECTIONS, achievements: "Awards" }).map(([id, label]) => (
            <TabsTrigger key={id} value={id} data-action={"profileMode:" + id} className="px-1 text-[13px]">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {mode === "playground" && (
        <SelectMenu
          action="profileScramble"
          caption="Scramble"
          align="start"
          value={s.profileScramble}
          options={s.info(s.profilePuzzle).scrambles.map((id: string) => ({ id, label: s.label("scrambles", id) }))}
          className="-my-1 -ml-2.5 self-start"
        />
      )}
      <ProfileBody mode={mode} title={PROFILE_SECTIONS[mode] ?? "Overview"} />
    </div>
  );
}

function ProfileBody({ mode, title }: { mode: string; title: string }) {
  const p = s.profile;
  return (
      <section className="profile-main flex min-h-0 flex-1 flex-col" aria-label={title}>
        {mode === "playground" ? (
          <TimerStats
            data={p.playground}
            empty={
              <>
                <span>No times in this selection yet.</span>
                <Button action="nav:playground" variant="default">
                  Open the timer
                </Button>
              </>
            }
          />
        ) : mode === "training" ? (
          <TrainingProgress />
        ) : mode === "achievements" ? (
          <Achievements />
        ) : mode === "duels" ? (
          <Battles />
        ) : (
          <Overview />
        )}
      </section>
  );
}

function Achievements() {
  const items = s.achievements?.achievements ?? [],
    groups = [...new Set(items.map((a: any) => a.group))] as string[];
  let shown = 0;
  return (
    <Surface className="flex-1">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <SelectMenu
          action="achievementGroup"
          value={s.achievementGroup}
          align="start"
          options={[{ id: "all", label: "All puzzles" }, ...groups.map((id) => ({ id, label: id }))]}
        />
        <Choice
          prefix="achievementFilter:"
          label="Filter"
          value={s.achievementFilter}
          options={["all", "unlocked", "locked"].map((f) => ({ id: f, label: f[0].toUpperCase() + f.slice(1) }))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        {groups
          .filter((group) => s.achievementGroup === "all" || s.achievementGroup === group)
          .map((group) => {
            const members = items.filter((a: any) => a.group === group),
              visible = members.filter((a: any) => s.achievementFilter === "all" || a.unlocked === (s.achievementFilter === "unlocked"));
            shown += visible.length;
            if (!visible.length) return null;
            return (
              <section className="flex flex-col gap-1 pb-6" key={group}>
                <div className="flex items-center gap-2 pb-1">
                  {members[0].puzzle ? <Icon name={"Puzzle" + members[0].puzzle} size={16} /> : <Trophy className="size-4" />}
                  <strong className="text-sm font-medium">{group}</strong>
                  <span className={cn(MONO, "text-xs text-muted-foreground")}>
                    {members.filter((a: any) => a.unlocked).length} / {members.length}
                  </span>
                </div>
                <div className="grid gap-x-10 gap-y-1 lg:grid-cols-2">
                  {visible.map((a: any) => (
                    <div key={a.id} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40">
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", a.unlocked ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
                        {a.unlocked ? <Trophy className="size-4" /> : <Lock className="size-4" />}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-3 max-md:flex-col max-md:gap-0.5">
                          <strong className={cn("truncate text-sm font-medium", !a.unlocked && "text-foreground/80")}>{a.title}</strong>
                          <span className={cn(MONO, "shrink-0 text-xs text-muted-foreground")}>{a.unlockedDate ?? a.detail}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                        {!a.unlocked && <Bar ratio={a.ratio} done={false} />}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        {!shown && <Empty>{s.achievementFilter === "unlocked" ? "Nothing unlocked here yet. Keep practising!" : "Everything here is unlocked."}</Empty>}
      </div>
    </Surface>
  );
}
