/**
 * Solve statistics. The page (stats/1.html, "the period"): a period picked on the curve or its ruler; the curve, the
 * table of figures (period, latest, record), the solves or sessions of the period and the beaten records follow it.
 * Inside a case dialog (`TimerStats`): the figures, then the chart or the table.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ChartLine, List, MessageSquare, Plus, Rotate3d, Timer } from "lucide-react";
import { store as s } from "./store";
import { HistoryChart, fitRange, type ChartRange } from "./HistoryChart";
import { fmtTime, joinedDate, rollingAverages, shortDate } from "../../src/client/lib/format";
import { sessionName } from "../../src/client/lib/sessions";
import { periodFigures, singleRecords, solveTone, timerFigures, type PeriodFigure } from "../../src/client/lib/practiceSummary";
import { Back, Button, Choice, Empty, MenuChoice, NUMERIC, PuzzleButton, PuzzlePicker, ROW, SelectMenu, Segmented, SolveActions, SolveMenu, Surface, Tip, plural, run } from "./ui";
import { InHead, MoreMenu, StatCard, Stats, dots, useViewport } from "./base";
import { TONE_TEXT } from "../../src/client/lib/tone";
import { EVENTS } from "../../src/shared/puzzles";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

type SolveSort = "newest" | "oldest" | "fastest" | "slowest";

const SOLVE_SORTS: { id: SolveSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "fastest", label: "Fastest first" },
  { id: "slowest", label: "Slowest first" },
];

/** Rows drawn before the table asks for more; long timer histories stay light. */
const SOLVE_PAGE = 100;

const byTime = (a: any, b: any, direction: 1 | -1) => (a.time == null ? (b.time == null ? 0 : 1) : b.time == null ? -1 : (a.time - b.time) * direction);
/** A difference of times, signed: "−0.240", "+1.450". */
const signed = (ms: number) => (ms < 0 ? "−" : "+") + fmtTime(Math.abs(ms));
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const DAY = 86400000;

/* ------------------------------------------------------------------ The page */

/** The timer's statistics page, under the profile: one event, one scramble, every solve. */
export function StatsPage({ phone }: { phone: boolean }) {
  const data = s.profile?.playground;
  // The list's order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<SolveSort>("newest"),
    [commented, setCommented] = useState(false);
  const by = data?.sessions?.length && s.statsBy === "session" ? "session" : "solve";
  const empty = (
    <Surface className="flex-1">
      <Empty icon={Timer}>
        <span>{tr("No times in this selection yet.")}</span>
        <Button action="nav:playground" icon={Timer} variant="outline">
          {tr("Open the timer")}
        </Button>
      </Empty>
    </Surface>
  );
  const history: any[] = data?.history ?? [];
  return (
    <>
      <StatsHead phone={phone} by={by} />
      {!data?.summary?.count ? empty : <StatsBody key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}:${by}`} data={data} by={by} phone={phone} table={{ sort, setSort, commented, setCommented }} />}
    </>
  );
}

/** The way back, the title, the events with solves (the others in a menu), the scramble and per solve or per session. */
function StatsHead({ phone, by }: { phone: boolean; by: string }) {
  const current = s.event(s.profilePuzzle, s.profileSolveMode).id,
    counts = new Map<string, number>((s.profile?.records ?? []).map((r: any) => [r.event, r.count])),
    events = EVENTS.filter((e) => e.id === current || (counts.get(e.id) ?? 0) > 0),
    scrambles = s.info(s.profilePuzzle).scrambles.map((id: string) => ({ id, label: s.label("scrambles", id) })),
    sessions = !!s.profile?.playground?.sessions?.length,
    byOptions = [
      { id: "solve", label: tr("Per solve") },
      { id: "session", label: tr("Per session") },
    ];
  if (phone)
    return (
      <InHead.Provider value={true}>
        <header className="flex min-h-10 shrink-0 items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.03em]">{tr("Statistics")}</h1>
          <PuzzleButton profile />
          <MoreMenu>
            <MenuChoice label="Scramble" action="profileScramble" value={s.profileScramble} options={scrambles} />
            {sessions && <MenuChoice label="Show" action="statsBy" value={by} options={byOptions} />}
          </MoreMenu>
        </header>
      </InHead.Provider>
    );
  return (
    <InHead.Provider value={true}>
      <header className="flex min-h-10 shrink-0 items-center gap-3">
        <Back action="profileMode:overview" label="Back to the profile" />
        <h1 className="shrink-0 text-[28px] font-extrabold tracking-[-0.03em]">{tr("Statistics")}</h1>
        {/* The events as one menu: tabs ran past the window with no way to reach the last ones. */}
        <div className="flex min-w-0 items-center gap-1">
          <SelectMenu
            action="profilePuzzle"
            caption="Event"
            align="start"
            value={current}
            options={events.map((e) => ({ id: e.id, label: `${said(e.label)} · ${(counts.get(e.id) ?? 0).toLocaleString()}` }))}
          />
          <PuzzlePicker
            profile
            trigger={
              <UiButton variant="ghost" size="icon" aria-label={tr("Other events")}>
                <Plus />
              </UiButton>
            }
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SelectMenu action="profileScramble" caption="Scramble" value={s.profileScramble} options={scrambles} />
          {sessions && <Choice prefix="statsBy:" label={tr("Show")} value={by} options={byOptions} />}
        </div>
      </header>
    </InHead.Provider>
  );
}

const CARD = "flex min-h-0 flex-col gap-3 overflow-hidden px-5 py-4 max-md:px-4 max-md:py-3";

/** A card's heading row: its title, then its controls on the right. */
function CardHead({ title, meta, children }: { title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-8 shrink-0 items-center gap-3">
      <h2 className="truncate text-base font-extrabold tracking-[-0.01em]">{said(title)}</h2>
      {meta && <span className="text-xs font-semibold text-muted-foreground">{meta}</span>}
      {children && <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>}
    </div>
  );
}

const SESSION_METRICS = [
  { id: "mean", label: "Mean" },
  { id: "best", label: "Best" },
  { id: "ao5", label: "Best Ao5" },
  { id: "ao12", label: "Best Ao12" },
] as const;
type SessionMetric = (typeof SESSION_METRICS)[number]["id"];
const METRIC_LEGEND: Record<SessionMetric, string> = { mean: "session mean", best: "session best", ao5: "session's best Ao5", ao12: "session's best Ao12" };

type Preset = "all" | "90" | "30" | "last";

function StatsBody({ data, by, phone, table }: { data: any; by: "solve" | "session"; phone: boolean; table: SolveTableState }) {
  const history: any[] = data.history;
  const sessions: any[] = useMemo(() => (data.sessions ?? []).filter((x: any) => x.count > 0), [data]);
  const event = s.event(s.profilePuzzle, s.profileSolveMode).label;
  const derived = useMemo(() => {
    const times = history.map((v) => v.time);
    // Each solve's session: its own when the summaries have it, its day's otherwise (lib/sessions groups them so).
    const byId = new Map<number, any>(), byDay = new Map<string, any>();
    for (const x of sessions) x.id != null ? byId.set(x.id, x) : byDay.set(x.at.slice(0, 10), x);
    return {
      ao50: rollingAverages(times, 50),
      ao100: rollingAverages(times, 100),
      session: history.map((v) => (v.sessionId != null && byId.get(v.sessionId)) || byDay.get(String(v.at).slice(0, 10)) || null),
      records: singleRecords(history),
    };
  }, [history, sessions]);
  const [solveRange, setSolveRange] = useState<ChartRange>([0, history.length - 1]);
  const [sessionRange, setSessionRange] = useState<ChartRange>([0, Math.max(0, sessions.length - 1)]);
  const [metric, setMetric] = useState<SessionMetric>("mean");
  const viewport = useViewport(),
    narrow = viewport.w < 1100,
    // A short window keeps the curve as a tab of its own, beside the list, the figures and the records.
    chartTab = viewport.h < 760;
  const [panel, setPanel] = useState(chartTab ? "chart" : "list");
  const perSession = by === "session";
  // The solves of the period: those of its sessions, per session.
  const range: ChartRange = useMemo(() => {
    if (!perSession) return solveRange;
    const from = sessions[sessionRange[0]]?.at, to = sessions[sessionRange[1]]?.lastAt;
    let a = history.findIndex((v) => v.at >= from), b = history.length - 1;
    while (b > 0 && history[b].at > to) b--;
    if (a < 0) a = 0;
    return [Math.min(a, b), b];
  }, [perSession, solveRange, sessionRange, sessions, history]);
  const items = perSession ? sessions : history,
    shown = perSession ? sessionRange : solveRange,
    setShown = perSession ? setSessionRange : setSolveRange;
  // Long periods draw the Ao50: the Ao5 would hide the trend under its noise.
  const long = solveRange[1] - solveRange[0] > 300;
  const sessionLabel = (x: any) => (x ? (x.name ? `${x.name} · ${shortDate(x.at)}` : sessionName(x, event)) : "");
  const chart = perSession ? (
    <HistoryChart
      history={sessions.map((x) => ({ time: x[metric], at: x.at, displayDate: sessionLabel(x) }))}
      averages={[]}
      range={sessionRange}
      onRange={setSessionRange}
      marks={(() => {
        let best = -1;
        sessions.forEach((x, i) => x[metric] != null && (best < 0 || x[metric] < sessions[best][metric]) && (best = i));
        return best < 0 ? [] : [best];
      })()}
      xTitle={tr("session date")}
      tip={(i) => plural(sessions[i]?.count ?? 0, "solve")}
    />
  ) : (
    <HistoryChart
      history={history}
      averages={long ? derived.ao50 : data.ao5 ?? []}
      averageLabel={long ? "Ao50" : "Ao5"}
      range={solveRange}
      onRange={setSolveRange}
      points
      marks={derived.records.map((r) => r.index)}
      xTitle={tr("solve date")}
      tip={(i) => sessionLabel(derived.session[i])}
    />
  );
  const blind = history.some((v) => v.memoMs != null);
  const legend = perSession
    ? [
        ["h-0.5 w-4 bg-chart-1", METRIC_LEGEND[metric]],
        ["size-2 rounded-full bg-success", "best session"],
      ]
    : [
        ["size-2 rounded-full bg-chart-1", "one solve"],
        ["h-0.5 w-4 bg-chart-2", long ? "average of 50 (Ao50)" : "average of 5 (Ao5)"],
        ["size-2 rounded-full bg-success", "single record"],
        ...(blind ? [["size-2 rounded-[2px] bg-warning", "memo"]] : []),
        ...(history.some((v) => v.time == null) && solveRange[1] - solveRange[0] < 300 ? [["text-destructive", "DNF", "×"]] : []),
      ];
  const stacked = phone || narrow;
  const legendRow = (
    <span className={cn("flex items-center text-xs font-semibold whitespace-nowrap text-muted-foreground", stacked ? "-mt-2 shrink-0 flex-wrap gap-x-3 gap-y-0.5" : "ml-auto gap-4")}>
      {legend.map(([swatch, label, glyph]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn(swatch, glyph ? "font-extrabold" : "")}>
            {glyph}
          </span>
          {said(label)}
        </span>
      ))}
    </span>
  );
  const chartCard = (
    <Surface className={cn(CARD, "pb-3")} aria-label={tr("Chart")}>
      <CardHead title={perSession ? "One value per session" : "All solves"}>
        {perSession &&
          (stacked ? (
            <SelectMenu action="sessionMetric" label="Figure per session" variant="ghost" onChange={(id) => setMetric(id as SessionMetric)} value={metric} options={[...SESSION_METRICS]} className="ml-auto" />
          ) : (
            <Segmented label={tr("Figure per session")} value={metric} onChange={(id) => setMetric(id as SessionMetric)} options={SESSION_METRICS.map((m) => ({ id: m.id, label: tr(m.label) }))} className="bg-muted/60" />
          ))}
        {!stacked && legendRow}
      </CardHead>
      {stacked && legendRow}
      {chart}
      <PeriodBar items={items} range={shown} onRange={setShown} lastSession={perSession || !derived.session.at(-1) ? null : derived.session.indexOf(derived.session.at(-1))} phone={phone} count={range[1] - range[0] + 1} sessionsShown={perSession ? sessionRange[1] - sessionRange[0] + 1 : null} />
    </Surface>
  );
  const listCard = perSession ? <SessionList sessions={sessions.slice(sessionRange[0], sessionRange[1] + 1)} label={sessionLabel} phone={phone} /> : <SolveList history={history} ao5={data.ao5 ?? []} ao12={data.ao12 ?? []} sessionOf={derived.session} range={range} phone={phone} records={derived.records} {...table} />;
  const figures = <FiguresCard rows={periodFigures(history, { 5: data.ao5 ?? [], 12: data.ao12 ?? [], 100: derived.ao100 }, range)} event={event} scramble={s.label("scrambles", s.profileScramble)} />;
  const records = <RecordsCard records={derived.records} history={history} sessionOf={derived.session} />;
  // Narrow windows stack the cards as phones do: the curve, then one of the three under it.
  if (stacked)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {!chartTab && <div className="flex h-[18.5rem] shrink-0 flex-col">{chartCard}</div>}
        <Segmented
          label={tr("Show")}
          value={panel}
          onChange={setPanel}
          options={[
            ...(chartTab ? [{ id: "chart", label: tr("Chart") }] : []),
            { id: "list", label: perSession ? tr("Sessions") : tr("Solves") },
            { id: "figures", label: tr("Figures") },
            { id: "records", label: tr("Records") },
          ]}
          className="w-full shrink-0 *:flex-1"
        />
        {panel === "figures" ? figures : panel === "records" ? records : panel === "chart" && chartTab ? <div className="flex min-h-0 flex-1 flex-col *:flex-1">{chartCard}</div> : listCard}
      </div>
    );
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem] gap-4">
      <div className="grid min-h-0 grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4">
        {chartCard}
        {listCard}
      </div>
      <div className="flex min-h-0 flex-col gap-4 *:last:min-h-28 *:last:flex-1">
        {figures}
        {records}
      </div>
    </div>
  );
}

/**
 * Under the curve: the quick periods, then a ruler of the months with the period shown framed on it (a click or a drag
 * moves it), then the period in words.
 */
function PeriodBar({ items, range, onRange, lastSession, phone, count, sessionsShown }: { items: any[]; range: ChartRange; onRange: (r: ChartRange) => void; lastSession: number | null; phone: boolean; count: number; sessionsShown: number | null }) {
  const end = items.length - 1;
  const presets = useMemo(() => {
    const lastAt = Date.parse(items[end]?.at),
      since = (days: number) => Math.max(0, items.findIndex((v) => Date.parse(v.at) > lastAt - days * DAY)),
      fit = (a: number): ChartRange => [Math.max(0, Math.min(a, end - 1)), end];
    return { all: [0, end], "90": fit(since(90)), "30": fit(since(30)), last: fit(lastSession ?? end) } as Record<Preset, ChartRange>;
  }, [items, end, lastSession]);
  const preset = (["all", "90", "30", "last"] as Preset[]).find((k) => presets[k][0] === range[0] && presets[k][1] === range[1]) ?? "";
  const ruler = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(300);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    if (ruler.current) observer.observe(ruler.current);
    return () => observer.disconnect();
  }, []);
  const moveTo = (clientX: number) => {
    const r = ruler.current!.getBoundingClientRect(),
      width = range[1] - range[0],
      centre = Math.round(((clientX - r.left) / r.width) * end);
    onRange(fitRange(centre - width / 2, width, end));
  };
  // The first solve of each month, its name written where there is room (the year with January).
  const months = useMemo(() => {
    const out: { at: number; text: string }[] = [];
    let prev = "", lastLeft = -1;
    items.forEach((v, i) => {
      const d = new Date(v.at), key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key === prev) return;
      prev = key;
      const left = (i / Math.max(1, end)) * 100;
      const text = d.getMonth() === 0 || !out.length ? joinedDate(v.at) : d.toLocaleDateString([], { month: "short" });
      // About 7 px a letter, on the ruler's width: written where the last one written ends.
      const px = (left / 100) * width, fits = px > lastLeft && left < 94;
      out.push({ at: left, text: fits ? text : "" });
      if (fits) lastLeft = px + text.length * 7 + 8;
    });
    return out;
  }, [items, end, width]);
  const from = items[range[0]]?.at, to = items[range[1]]?.lastAt ?? items[range[1]]?.at;
  return (
    <div className="flex shrink-0 items-center gap-3 max-md:flex-wrap max-md:gap-2">
      <Segmented
        label={tr("Period")}
        value={preset}
        onChange={(id) => onRange(presets[id as Preset])}
        options={[
          { id: "all", label: tr("All") },
          { id: "90", label: tr("3 months") },
          { id: "30", label: tr("30 days") },
          ...(lastSession != null ? [{ id: "last", label: tr("Last session") }] : []),
        ]}
        className="shrink-0 bg-muted/60 max-md:w-full max-md:*:flex-1"
      />
      {!phone && (
        <div
          ref={ruler}
          role="slider"
          tabIndex={0}
          aria-label={tr("Period shown: click or drag to move it")}
          aria-valuemin={0}
          aria-valuemax={end}
          aria-valuenow={range[0]}
          className="relative h-11 min-w-24 flex-1 cursor-pointer touch-none overflow-hidden rounded-[10px] bg-background outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            moveTo(e.clientX);
          }}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && moveTo(e.clientX)}
          onKeyDown={(e) => {
            const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
            if (!step) return;
            e.preventDefault();
            const width = range[1] - range[0];
            onRange(fitRange(range[0] + step * Math.max(1, Math.round(width / 2)), width, end));
          }}
        >
          {months.map((m, i) => (
            <span key={i} aria-hidden="true" className="pointer-events-none absolute inset-y-0 flex items-end bg-[linear-gradient(var(--border),var(--border))] bg-[length:1px_100%] bg-no-repeat pb-1.5 pl-1 text-[11px] font-semibold whitespace-nowrap text-muted-foreground" style={{ left: m.at + "%" }}>
              {m.text}
            </span>
          ))}
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 rounded-[9px] border-2 border-muted-foreground" style={{ left: (range[0] / Math.max(1, end)) * 100 + "%", width: `max(4px, ${((range[1] - range[0]) / Math.max(1, end)) * 100}%)` }} />
        </div>
      )}
      <span data-count={count} className={cn(NUMERIC, "shrink-0 text-[13px] font-semibold whitespace-nowrap text-muted-foreground")}>
        {from && (
          <b className="text-foreground">
            {shortDate(from)} → {shortDate(to)}
          </b>
        )}{" "}
        · {plural(count, "solve")}
        {sessionsShown != null && <> · {plural(sessionsShown, "session")}</>}
      </span>
    </div>
  );
}

/** Label, period, latest and record: the period in bold, the record in mint with its day. */
const FIGURE_LABEL: Record<PeriodFigure["id"], string> = { memo: "Mean memo", success: "Success", single: "Single", ao5: "Ao5", ao12: "Ao12", ao100: "Ao100", mean: "Mean", count: "Solves", dnf: "DNF" };

function FiguresCard({ rows, event, scramble }: { rows: PeriodFigure[]; event: string; scramble: string }) {
  const value = (r: PeriodFigure, v: number | null) => (v == null ? "–" : r.id === "success" ? Math.round(v * 100) + " %" : r.id === "count" || r.id === "dnf" ? v.toLocaleString() : fmtTime(v));
  const totals = ["mean", "count", "dnf"];
  return (
    <Surface className={CARD} aria-label={tr("Figures")}>
      <CardHead title="Figures" meta={`${said(event)} · ${said(scramble)}`} />
      <div className="min-h-0 overflow-y-auto">
        <table className={cn(NUMERIC, "w-full border-collapse text-sm")}>
          <thead>
            <tr className="text-xs text-muted-foreground *:pb-2 *:font-semibold">
              <th />
              <th className="text-right">{tr("period")}</th>
              <th className="text-right">{tr("latest")}</th>
              <th className="text-right">{tr("record")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("*:py-1.5", r.id === "mean" && "*:pt-4")}>
                <td className="font-semibold text-muted-foreground">{tr(FIGURE_LABEL[r.id])}</td>
                <td className={cn("text-right", totals.includes(r.id) && r.id !== "mean" && r.id !== "count" ? "text-muted-foreground" : "text-base font-extrabold")}>{value(r, r.period)}</td>
                <td className="text-right text-muted-foreground">{totals.includes(r.id) || r.id === "success" ? "" : value(r, r.current)}</td>
                <td className={cn("text-right", totals.includes(r.id) ? "text-muted-foreground" : "font-bold text-success")}>
                  {value(r, r.record)}
                  {(r.at || (totals.includes(r.id) && r.id !== "dnf")) && <small className="block text-[11px] font-semibold text-muted-foreground">{r.at ? shortDate(r.at) : tr("all")}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

/** Every time the best single fell, newest first: the time, the session or day, and what it took off. */
function RecordsCard({ records, history, sessionOf }: { records: ReturnType<typeof singleRecords>; history: any[]; sessionOf: any[] }) {
  return (
    <Surface className={CARD} aria-label={tr("Records broken")}>
      <CardHead title="Records broken" meta={tr("single")} />
      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
        {records.map((r) => {
          const session = sessionOf[r.index], open = "solve:" + history[r.index].id;
          return (
            <button key={r.index} type="button" data-action={open} onClick={run(open)} className={cn(ROW, "grid h-9 w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-3 px-2 text-sm")}>
              <b className={cn(NUMERIC, "text-base text-success")}>{fmtTime(r.time)}</b>
              <span className="truncate text-muted-foreground">{session?.name ? `${session.name} · ${shortDate(r.at)}` : shortDate(r.at)}</span>
              <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{r.gain == null ? tr("first") : signed(-r.gain)}</span>
            </button>
          );
        })}
      </div>
    </Surface>
  );
}

/** Session, solves, best, mean, best Ao5, best Ao12 and date; phones keep the session, the mean and the solves. */
const SESSION_COLUMNS = "grid-cols-[minmax(0,1fr)_4rem_5.5rem_5.5rem_5.5rem_5.5rem_5rem] max-md:grid-cols-[minmax(0,1fr)_5rem_3rem]";

function SessionList({ sessions, label, phone }: { sessions: any[]; label: (x: any) => string; phone: boolean }) {
  return (
    <Surface className={CARD} aria-label={tr("Sessions of the period")}>
      <CardHead title="Sessions of the period" />
      <div className={cn(NUMERIC, "grid shrink-0 items-center gap-4 px-2 text-xs font-semibold text-muted-foreground *:text-right *:first:text-left", SESSION_COLUMNS)}>
        <span>{tr("Session")}</span>
        <span className="max-md:hidden">{tr("Solves")}</span>
        <span className="max-md:hidden">{tr("Best")}</span>
        <span>{tr("Mean")}</span>
        <span className="max-md:hidden">{tr("Ao5")}</span>
        <span className="max-md:hidden">{tr("Ao12")}</span>
        <span>{phone ? tr("Solves") : tr("Date")}</span>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {[...sessions].reverse().map((x) => (
          <div key={x.id ?? x.at} className={cn(NUMERIC, "grid h-9 items-center gap-4 rounded-[10px] px-2 text-sm text-muted-foreground *:text-right *:first:text-left hover:bg-muted", SESSION_COLUMNS)}>
            <span className="truncate font-bold text-foreground">{x.name ? x.name : label(x)}</span>
            <span className="max-md:hidden">{x.count}</span>
            <span className="text-success max-md:hidden">{fmtTime(x.best)}</span>
            <span className="font-bold text-foreground">{fmtTime(x.mean)}</span>
            <span className="max-md:hidden">{fmtTime(x.ao5)}</span>
            <span className="max-md:hidden">{fmtTime(x.ao12)}</span>
            <span className="text-xs">{phone ? x.count : shortDate(x.at)}</span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

/** #, time, gap to the session's mean, marks and comment, Ao5 · Ao12, hour and the actions; phones keep #, time and hour. */
const COLUMNS = "grid-cols-[3rem_6rem_4.5rem_minmax(0,1fr)_8.5rem_4rem_auto] max-md:grid-cols-[2.5rem_minmax(0,1fr)_auto]";

/** The solves of the period, sorted as asked; in time order, under the heading of their session. */
function SolveList({ history, ao5, ao12, sessionOf, range, phone, records, sort, setSort, commented, setCommented }: { history: any[]; ao5: (number | null)[]; ao12: (number | null)[]; sessionOf: any[]; range: ChartRange; phone: boolean; records: { index: number }[] } & SolveTableState) {
  const [shown, setShown] = useState(SOLVE_PAGE);
  const pbs = useMemo(() => new Set(records.map((r) => r.index)), [records]);
  // Each session's memo mean, blindfolded.
  const memos = useMemo(() => {
    const sums = new Map<any, [number, number]>();
    history.forEach((v, i) => {
      if (v.memoMs == null || !sessionOf[i]) return;
      const m = sums.get(sessionOf[i]) ?? [0, 0];
      sums.set(sessionOf[i], [m[0] + v.memoMs, m[1] + 1]);
    });
    return new Map([...sums].map(([k, [sum, n]]) => [k, sum / n]));
  }, [history, sessionOf]);
  let rows = history
    .slice(range[0], range[1] + 1)
    .map((v, i) => ({ v, index: range[0] + i }))
    .filter((r) => !commented || r.v.comment);
  if (sort === "newest") rows.reverse();
  else if (sort === "fastest") rows.sort((a, b) => byTime(a.v, b.v, 1) || b.index - a.index);
  else if (sort === "slowest") rows.sort((a, b) => byTime(a.v, b.v, -1) || b.index - a.index);
  const grouped = sort === "newest" || sort === "oldest",
    commentCount = useMemo(() => history.filter((v) => v.comment).length, [history]);
  rows = rows.slice(0, shown);
  const out: React.ReactNode[] = [];
  let current: any = undefined;
  for (const { v, index } of rows) {
    const session = sessionOf[index];
    if (grouped && session !== current) {
      current = session;
      if (session)
        out.push(
          <div key={"s" + index} className="sticky top-0 z-[1] flex items-baseline gap-3 bg-card px-2 pt-3 pb-1.5">
            <b className="shrink-0 text-sm">{session.name || shortDate(session.at)}</b>
            <span className={cn(NUMERIC, "truncate text-xs font-semibold text-muted-foreground")}>
              {[session.name && shortDate(session.at), plural(session.count, "solve"), tr("mean {0}", { 0: fmtTime(session.mean) }), tr("best {0}", { 0: fmtTime(session.best) }), memos.has(session) && tr("mean memo {0}", { 0: fmtTime(memos.get(session)) })].filter(Boolean).join(" · ")}
            </span>
          </div>,
        );
    }
    out.push(<SolveRow key={v.id} v={v} index={index} pb={pbs.has(index)} session={session} ao5={ao5[index]} ao12={ao12[index]} when={grouped ? hourOf(v.at) : shortDate(v.at)} phone={phone} />);
  }
  const total = history.slice(range[0], range[1] + 1).filter((v) => !commented || v.comment).length;
  return (
    <Surface className={CARD} aria-label={tr("Solves of the period")}>
      <CardHead title={phone ? "Solves" : "Solves of the period"}>
        <SelectMenu action="solveSort" label="Sort solves" variant="ghost" onChange={(id) => (setSort(id as SolveSort), setShown(SOLVE_PAGE))} value={sort} options={SOLVE_SORTS} icon={<ArrowDownUp className="text-muted-foreground" />} />
        <Toggle pressed={commented} onPressedChange={(on: boolean) => (setCommented(on), setShown(SOLVE_PAGE))} aria-label={tr("Show only commented solves")} className="aria-pressed:text-foreground">
          <MessageSquare />
          <span className="max-md:hidden">{tr("Commented")}</span>
          <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{commentCount}</span>
        </Toggle>
      </CardHead>
      <div className={cn("solves-head grid shrink-0 items-center gap-3 px-2 text-xs font-semibold text-muted-foreground", COLUMNS)}>
        <span className="text-right">#</span>
        <span>{tr("Time")}</span>
        <Tip content={tr("Gap to the session's mean")}>
          <span className="max-md:hidden">{tr("vs session")}</span>
        </Tip>
        <span className="max-md:hidden" />
        <span className="text-right max-md:hidden">{tr("Ao5 · Ao12")}</span>
        <span className="max-md:hidden" />
        <span className="w-40 max-md:hidden" />
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1" key={`${range.join(":")}:${sort}:${commented}`}>
        {!rows.length && <Empty>{commented ? tr("No commented solve yet. Add one with the bubble on a time.") : tr("No solves match.")}</Empty>}
        {out}
        {total > shown && (
          <UiButton variant="ghost" className="my-2 w-full text-muted-foreground" onClick={() => setShown(shown + SOLVE_PAGE)}>
            {tr("Show more ({0} left)", { 0: total - shown })}
          </UiButton>
        )}
      </div>
    </Surface>
  );
}

function SolveRow({ v, index, pb, session, ao5, ao12, when, phone }: { v: any; index: number; pb: boolean; session: any; ao5: number | null | undefined; ao12: number | null | undefined; when: string; phone: boolean }) {
  const open = "solve:" + v.id,
    gap = v.time != null && session?.mean != null ? v.time - session.mean : null;
  const marks = (
    <>
      {v.memoMs != null && <span className={cn(NUMERIC, "rounded-[7px] px-1.5 py-0.5 text-xs font-bold whitespace-nowrap ring-1 ring-border")}>{tr("memo {0}", { 0: fmtTime(v.memoMs) })}</span>}
      {pb && <Badge variant="success">{tr("Record")}</Badge>}
      {v.smart && (
        <Tip content={tr("Turned on a connected cube: its analysis is available")}>
          <Badge variant="secondary" className="text-muted-foreground">
            <Rotate3d />
            {tr("analysis")}
          </Badge>
        </Tip>
      )}
      {v.comment && <q className="truncate text-[13px] text-muted-foreground italic">{v.comment}</q>}
    </>
  );
  return (
    <SolveMenu solve={{ ...v, time_ms: v.timeMs }}>
      <div className={cn(ROW, "history-row group/row has-[[data-row]:focus-visible]:ring-3 has-[[data-row]:focus-visible]:ring-ring/50 has-[[data-row]:focus-visible]:ring-inset")}>
        <div className={cn("grid items-center gap-3 px-2", COLUMNS)}>
          <button type="button" data-action={open} data-row onClick={run(open)} className="col-span-6 grid h-9 grid-cols-subgrid items-center text-left outline-none max-md:col-span-3">
            <span className={cn(NUMERIC, "text-right text-xs text-muted-foreground")}>{index + 1}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn(NUMERIC, "text-base font-bold", TONE_TEXT[solveTone({ id: v.id, penalty: v.time == null ? "dnf" : v.penalty }, { best: pb ? v.id : undefined })])}>{fmtTime(v.time, { blank: "DNF" })}</span>
              {v.penalty === "+2" && <sup className="text-[10px] font-bold text-warning">+2</sup>}
              {phone && <span className="flex min-w-0 items-center gap-1.5">{marks}</span>}
            </span>
            <span className={cn(NUMERIC, "text-xs font-bold max-md:hidden", gap != null && gap < 0 ? "text-success" : "text-muted-foreground")}>{gap == null ? "" : signed(gap)}</span>
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden max-md:hidden">{!phone && marks}</span>
            <span className={cn(NUMERIC, "text-right text-xs whitespace-nowrap text-muted-foreground max-md:hidden")}>
              {fmtTime(ao5)} · {fmtTime(ao12)}
            </span>
            <span className={cn(NUMERIC, "text-right text-xs text-muted-foreground")}>{when}</span>
          </button>
          <SolveActions solve={v} full className="w-40 justify-end max-md:hidden" />
        </div>
      </div>
    </SolveMenu>
  );
}

/* ------------------------------------------------------------- Case dialogs */

/** A case's attempts inside its dialog: the figures, then the chart or the table. */
export function TimerStats({ data, empty, tools }: { data: any; empty: React.ReactNode; tools?: React.ReactNode }) {
  // The table order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<SolveSort>("newest"),
    [commented, setCommented] = useState(false);
  // The source of the times (`tools`) stays in reach when it has none.
  if (!data?.summary?.count)
    return (
      <div className="flex flex-col items-start gap-3">
        {tools}
        <Empty className="flex-none items-start p-0 py-1 text-left">{empty}</Empty>
      </div>
    );
  const history = data.history ?? [];
  return <TimerStatsView key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`} data={data} tools={tools} table={{ sort, setSort, commented, setCommented }} />;
}

type SolveTableState = {
  sort: SolveSort;
  setSort: (sort: SolveSort) => void;
  commented: boolean;
  setCommented: (commented: boolean) => void;
};

function TimerStatsView({ data, table, tools }: { data: any; table: SolveTableState; tools?: React.ReactNode }) {
  const history: any[] = data.history ?? [];
  const [range, setRange] = useState<ChartRange>([0, history.length - 1]);
  const zoomed = range[0] > 0 || range[1] < history.length - 1,
    count = range[1] - range[0] + 1,
    total = <span className="text-sm text-muted-foreground">{zoomed ? tr("{0} of {1} solves", { 0: count, 1: history.length }) : plural(count, "solve")}</span>;
  const figures = timerFigures(data.summary);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <Stats columns={figures.length} className="shrink-0 gap-2.5 max-md:grid-cols-2">
        {figures.map(([label, value, tone], i) => (
          <StatCard key={label} label={said(label)} value={value} dot={dots(figures.map((f) => f[2]))[i]} size="sm" className="bg-background" />
        ))}
      </Stats>
      {s.statsView === "table" ? (
        <SolvesTable history={history} ao5={data.ao5 ?? []} ao12={data.ao12 ?? []} range={range} total={total} tools={tools} {...table} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {tools}
            <StatsViewToggle />
            {total}
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded-[20px] bg-background px-4 pt-4 pb-3">
            <HistoryChart history={history} averages={data.ao5 ?? []} range={range} onRange={setRange} xTitle={tr("attempt date")} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Chart or table: the solves of the period drawn over time, or listed with their actions. */
function StatsViewToggle() {
  return (
    <Choice
      prefix="statsView:"
      label={tr("View")}
      value={s.statsView}
      options={[
        {
          id: "chart",
          label: (
            <>
              <ChartLine />
              {tr("Chart")}
            </>
          ),
        },
        {
          id: "table",
          label: (
            <>
              <List />
              {tr("Table")}
            </>
          ),
        },
      ]}
    />
  );
}

/** #, time, Ao5, Ao12, comment, date and the actions; phones keep #, time and date. */
const TABLE_COLUMNS = "grid-cols-[3.5rem_7rem_5.5rem_5.5rem_minmax(0,1fr)_8rem_auto] max-md:grid-cols-[2.5rem_minmax(0,1fr)_auto]";

/** Every attempt of the visible period, sorted as asked; right-click a row for its menu. */
function SolvesTable({ history, ao5, ao12, range, total, tools, sort, setSort, commented, setCommented }: { history: any[]; ao5: (number | null)[]; ao12: (number | null)[]; range: ChartRange; total: React.ReactNode; tools?: React.ReactNode } & SolveTableState) {
  const [shown, setShown] = useState(SOLVE_PAGE);
  const rows = history
    .slice(range[0], range[1] + 1)
    .map((v, i) => {
      const index = range[0] + i,
        previous = history[index - 1];
      return { v, index, pb: v.time != null && v.time === v.best && (!previous || previous.best == null || previous.best > v.time) };
    })
    .filter((r) => !commented || r.v.comment);
  if (sort === "newest") rows.reverse();
  else if (sort === "fastest") rows.sort((a, b) => byTime(a.v, b.v, 1) || b.index - a.index);
  else if (sort === "slowest") rows.sort((a, b) => byTime(a.v, b.v, -1) || b.index - a.index);
  const commentCount = history.filter((v) => v.comment).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {tools}
        <StatsViewToggle />
        {total}
        <span className="ml-auto flex items-center gap-1">
          <SelectMenu action="solveSort" label="Sort solves" onChange={(id) => setSort(id as SolveSort)} value={sort} options={SOLVE_SORTS} icon={<ArrowDownUp className="text-muted-foreground" />} />
          <Toggle pressed={commented} onPressedChange={setCommented} aria-label={tr("Show only commented solves")} className="aria-pressed:text-foreground">
            <MessageSquare />
            <span className="max-md:hidden">{tr("Commented")}</span>
            <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{commentCount}</span>
          </Toggle>
        </span>
      </div>
      <div className={cn("solves-head grid shrink-0 items-center gap-4 border-b px-2 pb-2 text-xs font-medium text-muted-foreground", TABLE_COLUMNS)}>
        <span className="text-right">#</span>
        <span>{tr("Time")}</span>
        <span className="max-md:hidden">{tr("Ao5")}</span>
        <span className="max-md:hidden">{tr("Ao12")}</span>
        <span className="max-md:hidden">{tr("Comment")}</span>
        <span>{tr("Date")}</span>
        <span className="w-40 max-md:hidden" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1" key={`${range.join(":")}:${sort}:${commented}`}>
        {!rows.length && <Empty>{commented ? tr("No commented solve yet. Add one with the bubble on a time.") : tr("No solves match.")}</Empty>}
        {rows.slice(0, shown).map(({ v, index, pb }) => {
          // A case done during a smart cube solve opens that solve; its time is the case's, so it has no actions.
          const open = "solve:" + (v.solveId ?? v.id),
            row = (
              <div className={cn(ROW, "history-row group/row has-[[data-row]:focus-visible]:ring-3 has-[[data-row]:focus-visible]:ring-ring/50 has-[[data-row]:focus-visible]:ring-inset")}>
                <div className={cn("grid items-center gap-4 px-2", TABLE_COLUMNS)}>
                  <button type="button" data-action={open} data-row onClick={run(open)} className="col-span-6 grid h-9 grid-cols-subgrid items-center text-left outline-none max-md:col-span-3">
                    <span className={cn(NUMERIC, "text-right text-xs text-muted-foreground")}>{index + 1}</span>
                    <span className="flex items-center gap-2">
                      <span className={cn(NUMERIC, "text-sm", TONE_TEXT[solveTone({ id: v.id, penalty: v.time == null ? "dnf" : v.penalty }, { best: pb ? v.id : undefined })])}>{fmtTime(v.time, { blank: "DNF" })}</span>
                      {pb && <Badge variant="success">{tr("PB")}</Badge>}
                      {v.penalty === "+2" && <Badge variant="warning">+2</Badge>}
                      {v.solveId !== undefined ? (
                        <Tip content={tr("Done during a solve on a connected cube")}>
                          <Badge variant="secondary" className="text-muted-foreground">
                            <Rotate3d />
                            {tr("In solve")}
                          </Badge>
                        </Tip>
                      ) : (
                        v.smart && <Rotate3d className="size-3 text-muted-foreground" aria-label={tr("Turned on a connected cube")} />
                      )}
                    </span>
                    <span className={cn(NUMERIC, "text-xs text-muted-foreground max-md:hidden")}>{fmtTime(ao5[index])}</span>
                    <span className={cn(NUMERIC, "text-xs text-muted-foreground max-md:hidden")}>{fmtTime(ao12[index])}</span>
                    <span className="truncate text-xs text-muted-foreground max-md:hidden">{v.comment}</span>
                    <span className="truncate text-xs text-muted-foreground">{v.displayDate}</span>
                  </button>
                  {v.solveId === undefined ? <SolveActions solve={v} full className="w-40 justify-end max-md:hidden" /> : <span className="w-40 max-md:hidden" />}
                </div>
              </div>
            );
          return v.solveId === undefined ? (
            <SolveMenu key={v.id} solve={{ ...v, time_ms: v.timeMs }}>
              {row}
            </SolveMenu>
          ) : (
            <div key={v.id}>{row}</div>
          );
        })}
        {rows.length > shown && (
          <UiButton variant="ghost" className="my-2 w-full text-muted-foreground" onClick={() => setShown(shown + SOLVE_PAGE)}>
            {tr("Show more ({0} left)", { 0: rows.length - shown })}
          </UiButton>
        )}
      </div>
    </div>
  );
}
