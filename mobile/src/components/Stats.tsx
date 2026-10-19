import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { CalendarDays, ChevronDown, ChevronRight, ListOrdered, MessageSquare, Rotate3d, Timer as TimerIcon, Trophy, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { effective, fmtValue, plural, rollingAverages, shortDate } from "../../../src/client/lib/format";
import { historyRecords, periodFigures, periodSpread, singleRecords, SPREAD_LABEL, type PeriodFigure, type SpreadFigure } from "../../../src/client/lib/practiceSummary";
import { sessionName } from "../../../src/client/lib/sessions";
import { eventInfo, eventOf, puzzleInfo, scrambleLabel, type EventId } from "../../../src/shared/puzzles";
import type { CaseHistoryDto, HistoryPoint, SessionSummary } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { profileDataAtom, profileKeyAtom, profilePuzzleAtom, profileScrambleTypeAtom, profileSolveModeAtom } from "../profile";
import { profileFiltersAtom, routeAtom } from "../state";
import { PushedBar } from "./AppBar";
import { Empty, Numeric } from "./layout";
import { useBackTo } from "./Practice";
import { useLayout } from "../hooks/useLayout";
import { Pill, PillSeg, PuzzleGrid, PuzzleIcon, SheetChoice } from "./PuzzlePicker";
import { Sheet, SheetFlatList } from "./Sheet";
import { SolveMenu, useSolveMenu, type SolveSummary } from "./SolveMenus";
import { HistoryChart, type Range } from "./TimesChart";
import { locale, said, tr } from "../../../src/client/i18n";

/** A figure of the event shown: a time, or Fewest Moves' moves and Multi-Blind's cubes (`fmtValue`). */
const shownMode = () => getDefaultStore().get(profileSolveModeAtom);
const fmtTime = (value: number | null | undefined, opts?: { blank?: string }) => fmtValue(value, shownMode(), opts);

/**
 * The timer's statistics, pushed from the profile (the web's StatsPage): one event and one scramble type. A board of
 * tiles: the curve with its period, the four key figures of the period (latest, record), the records broken, then two
 * doors to the lists, which open as a full-screen tool (sort and filter at the bottom).
 */

type By = "solve" | "session";
type Metric = "mean" | "best" | "ao5" | "ao12";
const METRICS: { id: Metric; label: string }[] = [{ id: "mean", label: "Mean" }, { id: "best", label: "Best" }, { id: "ao5", label: "Best Ao5" }, { id: "ao12", label: "Best Ao12" }];
type Preset = "all" | "90" | "30" | "last";
type Sort = "newest" | "oldest" | "fastest" | "slowest";
const DAY = 86_400_000;
/** A difference of times, signed: "−0.240", "+1.450". */
const signed = (ms: number) => (ms < 0 ? "−" : "+") + fmtTime(Math.abs(ms));
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
const byTime = (a: number | null, b: number | null, direction: 1 | -1) => a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * direction;

export function StatsScreen() {
  const prepared = useAtomValue(profileDataAtom), key = useAtomValue(profileKeyAtom);
  const profile = prepared?.key === key ? prepared.profile : null;
  const cube = useAtomValue(profilePuzzleAtom), solveMode = useAtomValue(profileSolveModeAtom), scrambleType = useAtomValue(profileScrambleTypeAtom);
  const setFilters = useSetAtom(profileFiltersAtom), navigate = useSetAtom(routeAtom);
  const [by, setBy] = useState<By>("solve");
  const [picking, setPicking] = useState<null | "event" | "scramble">(null);
  // A list opened from the board takes the whole screen, head included.
  const [tool, setTool] = useState<Tool>(null);
  const event = eventOf(cube, solveMode);
  const eventId = (event?.id ?? cube) as EventId;
  const eventLabel = tr(event?.label ?? puzzleInfo(cube).label);
  const data = profile?.playground;
  const count = profile?.records?.find(r => r.event === eventId)?.count ?? data?.summary.count ?? 0;
  const sessions = !!data?.sessions?.some(x => x.count > 0);
  const setEvent = (id: EventId) => { const e = eventInfo(id); if (e) setFilters(f => ({ ...f, cube: e.puzzle, solveMode: e.solveMode })); };
  const scrambles = puzzleInfo(cube).scrambles;
  const { tablet, wide } = useLayout();
  // On a wide screen the lists are docked beside the board instead of taking the screen.
  const listing = !!tool && !!data?.summary.count && !wide;
  return <View className="flex-1">
    {!listing && <>
    <PushedBar title={tr("Statistics")}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Puzzle: {0}", { 0: eventLabel })} onPress={() => setPicking("event")}
        className="h-10 flex-row items-center gap-1.5 rounded-full bg-accent px-3.5 active:bg-muted">
        <PuzzleIcon puzzle={eventId} size={16} />
        <Text numberOfLines={1} className="max-w-28 text-[13px] font-bold">{eventLabel}</Text>
        <Numeric className="text-[13px] font-bold text-primary">{count.toLocaleString()}</Numeric>
      </Pressable>
    </PushedBar>
    <View className={cn("px-4", tablet && "px-7")}>
      <View className="flex-row items-center justify-between gap-2">
        {scrambles.length > 1 ? <Pill label={tr(scrambleLabel(scrambleType))} trailing={ChevronDown} accessibilityLabel={tr("Scramble type")} onPress={() => setPicking("scramble")} /> : <View />}
        {sessions && <PillSeg<By> label={tr("Show")} value={by} onChange={setBy} options={[{ id: "solve", label: tr("Per solve") }, { id: "session", label: tr("Per session") }]} />}
      </View>
    </View>
    </>}
    <View className={cn("min-h-0 flex-1 px-4 pb-3", tablet && "px-7", listing ? "pt-1" : "pt-2.5")}>
      {!profile ? <View className="flex-1 gap-2.5"><Skeleton className="flex-1 rounded-3xl" /><Skeleton className="h-48 rounded-3xl" /></View>
        : !data?.summary.count ? <Empty icon={TimerIcon} title={tr("No times in this selection yet.")}>
          <Button accessibilityLabel={tr("Open the timer")} onPress={() => navigate({ page: "playground" })}><Text>{tr("Timer")}</Text></Button>
        </Empty>
        : <Board key={`${data.history[0]?.id}:${data.history.at(-1)?.id}:${data.history.length}:${sessions ? by : "solve"}`} data={data} by={sessions ? by : "solve"}
          title={`${eventLabel} · ${tr(scrambleLabel(scrambleType))}`} event={eventLabel} tool={tool} setTool={setTool} />}
    </View>
    <Sheet open={picking === "event"} onClose={() => setPicking(null)} title={tr("Puzzle")}>
      <PuzzleGrid value={eventId} onChange={id => { setPicking(null); setEvent(id); }} />
    </Sheet>
    <Sheet open={picking === "scramble"} onClose={() => setPicking(null)} title={tr("Scramble type")} scroll={scrambles.length > 8}>
      <SheetChoice label={tr("Scramble")} columns={2} value={scrambleType} options={scrambles.map(id => ({ id, label: scrambleLabel(id) }))}
        onChange={id => { setPicking(null); setFilters(f => ({ ...f, scrambleType: id })); }} />
    </Sheet>
  </View>;
}

type Data = CaseHistoryDto & { sessions?: SessionSummary[] };
type Tool = null | "solves" | "sessions";

/** The board of one selection, or the list opened from it. */
function Board({ data, by, title, event, tool, setTool }: { data: Data; by: By; title: string; event: string; tool: Tool; setTool: (tool: Tool) => void }) {
  const history = data.history;
  const sessions = useMemo(() => (data.sessions ?? []).filter(x => x.count > 0), [data]);
  const derived = useMemo(() => {
    const times = history.map(v => v.time);
    // Each solve's session: its own when the summaries have it, its day's otherwise (lib/sessions groups them so).
    const byId = new Map<number, SessionSummary>(), byDay = new Map<string, SessionSummary>();
    for (const x of sessions) x.id != null ? byId.set(x.id, x) : byDay.set(x.at.slice(0, 10), x);
    return {
      ao50: rollingAverages(times, 50), ao100: rollingAverages(times, 100), records: singleRecords(history),
      session: history.map(v => (v.sessionId != null && byId.get(v.sessionId)) || byDay.get(v.at.slice(0, 10)) || null),
    };
  }, [history, sessions]);
  const perSession = by === "session";
  const [solveRange, setSolveRange] = useState<Range>([0, history.length - 1]);
  const [sessionRange, setSessionRange] = useState<Range>([0, Math.max(0, sessions.length - 1)]);
  const [metric, setMetric] = useState<Metric>("mean");
  const [records, setRecords] = useState(false);
  // The curve, or how the period's times spread beside the solves before it (Multi-Blind's points have no spread).
  const [view, setView] = useState<"curve" | "spread">("curve");
  const spreads = shownMode() !== "multi-blind", spread = spreads && view === "spread";
  // The solves of the period: per session, those of its sessions.
  const range: Range = useMemo(() => {
    if (!perSession) return solveRange;
    const from = sessions[sessionRange[0]]?.at ?? "", to = sessions[sessionRange[1]]?.lastAt ?? "";
    let a = history.findIndex(v => v.at >= from), b = history.length - 1;
    while (b > 0 && history[b]!.at > to) b--;
    if (a < 0) a = 0;
    return [Math.min(a, b), b];
  }, [perSession, solveRange, sessionRange, sessions, history]);
  const periodSessions = useMemo(() => {
    const from = history[range[0]]?.at ?? "", to = history[range[1]]?.at ?? "";
    return sessions.filter(x => x.lastAt >= from && x.at <= to);
  }, [sessions, history, range]);
  // Long periods draw the Ao50: the Ao5 would hide the trend under its noise.
  const long = solveRange[1] - solveRange[0] > 300;
  const sessionLabel = (x: SessionSummary | null) => x ? (x.name ? `${x.name} · ${shortDate(x.at)}` : sessionName(x, event)) : "";
  // The records over every solve read once, not again at each period.
  const averages = useMemo(() => ({ 5: data.ao5, 12: data.ao12, 100: derived.ao100 }), [data, derived]);
  const allRecords = useMemo(() => historyRecords(history, averages), [history, averages]);
  const figures = useMemo(() => Object.fromEntries(periodFigures(history, averages, range, allRecords).map(r => [r.id, r])) as Partial<Record<PeriodFigure["id"], PeriodFigure>>,
    [history, averages, range, allRecords]);
  const periodRecords = derived.records.filter(r => r.index >= range[0] && r.index <= range[1]);
  const span = `${shortDate(history[range[0]]!.at)} → ${shortDate(history[range[1]]!.at)}`;
  const { tablet, wide } = useLayout();
  // Docked beside the board on a wide screen, the list shows the solves first and switches to the sessions itself.
  const [docked, setDocked] = useState<"solves" | "sessions">("solves");
  useBackTo(() => setTool(null), tool !== null && !wide);
  const list = (kind: "solves" | "sessions", onKind: (kind: "solves" | "sessions") => void, dock: boolean) =>
    <ListTool docked={dock} kind={kind} onKind={onKind} onClose={() => setTool(null)} history={history} data={data} sessionOf={derived.session} sessions={periodSessions}
      range={range} records={derived.records} title={kind === "solves" ? plural(range[1] - range[0] + 1, "solve") : plural(periodSessions.length, "session")} sub={`${title} · ${span}`} label={sessionLabel} />;

  if (tool && !wide) return list(tool, setTool, false);

  const latest = derived.records[0];
  const tiles = [
    <FigureTile key="single" label={tr("Single")} figure={figures.single} />,
    <FigureTile key="ao5" label="Ao5" figure={figures.ao5} />,
    <FigureTile key="ao12" label="Ao12" figure={figures.ao12} />,
    figures.memo
      ? <Tile key="memo" label={tr("Memo · success")} value={fmtTime(figures.memo.period)} line={tr("{0}% success · {1} DNF", { 0: Math.round((figures.success?.period ?? 0) * 100), 1: figures.dnf?.period ?? 0 })} />
      : <Tile key="mean" label={figures.ao100 ? tr("Mean · Ao100") : tr("Mean")} value={fmtTime(figures.mean?.period ?? null)}
        line={[figures.ao100 && `Ao100 ${fmtTime(figures.ao100.period)}`, tr("{0} DNF", { 0: figures.dnf?.period ?? 0 })].filter(Boolean).join(" · ")} />,
  ];
  const doors = <View className={cn("flex-row gap-2.5", tablet && "flex-1")}>
    <Door icon={ListOrdered} label={plural(range[1] - range[0] + 1, "solve")} onPress={() => setTool("solves")} />
    <Door icon={CalendarDays} label={plural(periodSessions.length, "session")} disabled={!periodSessions.length} onPress={() => setTool("sessions")} />
  </View>;
  const board = <View className="min-h-0 flex-1 gap-2.5">
    {/* The curve: every solve and its rolling average, or one value per session; its period under it. */}
    <View className="min-h-48 flex-1 gap-1.5 rounded-3xl bg-card p-3.5">
      <View className="flex-row items-center justify-between gap-2">
        {spreads ? <PillSeg<"curve" | "spread"> label={tr("Chart")} value={view} onChange={setView} options={[{ id: "curve", label: tr("Curve") }, { id: "spread", label: tr("Spread") }]} className="h-9" />
          : <Text className="text-base font-bold tracking-[-0.015em]">{perSession ? tr("Per session") : tr("All solves")}</Text>}
        {spread
          ? <View className="flex-row flex-wrap items-center gap-x-3">
            <Legend swatch="size-2.5 rounded-[3px] bg-primary" label={tr("this period")} />
            <Legend swatch="size-2.5 rounded-[3px] border border-dashed border-muted-foreground" label={tr("before")} />
          </View>
          : perSession
          ? <MetricChoice value={metric} onChange={setMetric} />
          : <View className="flex-row flex-wrap items-center gap-x-3">
            <Legend swatch="size-2 rounded-full bg-primary" label={tr("solve")} />
            <Legend swatch="h-[2.5px] w-3.5 rounded-full bg-chart-2" label={long ? "Ao50" : "Ao5"} />
            <Legend swatch="size-2 rounded-full bg-success" label={tr("record")} />
          </View>}
      </View>
      {spread ? <SpreadChart history={history} range={range} />
        : perSession
        ? <HistoryChart history={sessions.map(x => ({ time: x[metric], at: x.at }))} averages={[]} range={sessionRange} onRange={setSessionRange} mode={shownMode()}
          marks={(() => { let best = -1; sessions.forEach((x, i) => { if (x[metric] != null && (best < 0 || x[metric]! < sessions[best]![metric]!)) best = i; }); return best < 0 ? [] : [best]; })()}
          label={i => `${sessionLabel(sessions[i] ?? null)} · ${plural(sessions[i]?.count ?? 0, "solve")}`} />
        : <HistoryChart history={history} averages={long ? derived.ao50 : data.ao5} range={solveRange} onRange={setSolveRange} mode={shownMode()} points dnfs
          marks={derived.records.map(r => r.index)} label={i => `#${i + 1} · ${sessionLabel(derived.session[i] ?? null) || shortDate(history[i]!.at)}`} />}
      <PeriodBar items={perSession ? sessions : history} range={perSession ? sessionRange : solveRange} onRange={perSession ? setSessionRange : setSolveRange}
        lastSession={perSession || !derived.session.at(-1) ? null : derived.session.indexOf(derived.session.at(-1)!)} count={range[1] - range[0] + 1} />
    </View>
    {/* The key figures of the period, with the latest and the record: two rows of two, one row on a tablet. */}
    {tablet ? <View className="flex-row gap-2.5">{tiles}</View> : <>
      <View className="flex-row gap-2.5">{tiles.slice(0, 2)}</View>
      <View className="flex-row gap-2.5">{tiles.slice(2)}</View>
    </>}
    {/* The records broken, and the doors to the lists beside them on a tablet (docked lists need none). */}
    <View className={cn("gap-2.5", tablet && "flex-row")}>
      <Pressable accessibilityRole="button" onPress={() => setRecords(true)} disabled={!derived.records.length} className={cn("flex-row items-center gap-2.5 rounded-3xl bg-card px-3.5 py-3 active:bg-card/80", tablet && "flex-1")}>
        <View className="size-10 items-center justify-center rounded-xl bg-success/15"><Icon as={Trophy} size={20} className="text-success" /></View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-base font-bold">{periodRecords.length ? plural(periodRecords.length, "record") + " " + tr("broken") : tr("No record broken in this period")}</Text>
          {latest && <Numeric numberOfLines={1} className="text-[13px] text-muted-foreground">{tr("{0} on {1}", { 0: fmtTime(latest.time), 1: shortDate(latest.at) })}{latest.gain != null ? ` · ${signed(-latest.gain)}` : ""}</Numeric>}
        </View>
        <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
      </Pressable>
      {!wide && doors}
    </View>
    <RecordsSheet open={records} onClose={() => setRecords(false)} records={derived.records} history={history} label={i => sessionLabel(derived.session[i] ?? null)} />
  </View>;
  return wide ? <View className="min-h-0 flex-1 flex-row gap-4">
    {board}
    <View className="w-[380px] rounded-[26px] bg-popover px-4 pt-2 pb-4">{list(docked, setDocked, true)}</View>
  </View> : board;
}

/** The period's times as columns, as many solves just before it dashed behind them, and the four figures of both (the gap in mint when better). */
function SpreadChart({ history, range }: { history: HistoryPoint[]; range: Range }) {
  const spread = useMemo(() => periodSpread(history, range, 10), [history, range]);
  const max = Math.max(1, ...spread.now, ...spread.before), edge = (i: number) => fmtTime(spread.from + i * spread.width);
  const value = (f: SpreadFigure, v: number | null) => (v == null ? "–" : f.id === "dnf" ? Math.round(v * 100) + " %" : fmtTime(v));
  return <View className="min-h-0 flex-1 gap-2">
    <View className="flex-row gap-1.5">
      {spread.figures.map(f => {
        const gap = f.now != null && f.before != null && Number.isFinite(f.now - f.before) && Math.abs(f.now - f.before) > 1e-9 ? f.now - f.before : null;
        return <View key={f.id} className="min-w-0 flex-1 rounded-xl bg-muted/50 px-2 py-1.5">
          <Text numberOfLines={1} className="text-[11px] font-semibold text-muted-foreground">{tr(SPREAD_LABEL[f.id])}</Text>
          <Numeric numberOfLines={1} adjustsFontSizeToFit className="text-[15px] font-extrabold">{value(f, f.now)}</Numeric>
          <Numeric numberOfLines={1} className={cn("text-[11px] font-bold", gap == null ? "text-muted-foreground" : gap < 0 ? "text-success" : "text-destructive")}>
            {gap == null ? " " : f.id === "dnf" ? (gap < 0 ? "−" : "+") + Math.round(Math.abs(gap) * 100) + " %" : signed(gap)}
          </Numeric>
        </View>;
      })}
    </View>
    <View className="min-h-0 flex-1 flex-row items-end gap-1 border-b border-border">
      {spread.now.map((n, i) => {
        const before = spread.before[i]!;
        return <View key={i} accessible accessibilityRole="image" accessibilityLabel={`${edge(i)} · ${plural(n, "solve")}${spread.beforeCount ? ` · ${tr("before")} ${before}` : ""}`}
          className="h-full min-w-0 flex-1 items-center justify-end">
          {!!before && <View className="absolute inset-x-0 bottom-0 rounded-t-[5px] border-2 border-b-0 border-dashed border-muted-foreground/50" style={{ height: `${(before / max) * 100}%` }} />}
          <View className="w-[64%] rounded-t-[5px] bg-primary" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }} />
        </View>;
      })}
    </View>
    <View className="flex-row gap-1" importantForAccessibility="no-hide-descendants">
      {spread.now.map((_, i) => <Numeric key={i} numberOfLines={1} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">{i % 2 === 0 ? edge(i) : ""}</Numeric>)}
    </View>
  </View>;
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return <View className="flex-row items-center gap-1.5"><View className={swatch} /><Text className="text-xs font-semibold text-muted-foreground">{said(label)}</Text></View>;
}

/** The value drawn for each session: its mean, best, best Ao5 or best Ao12. */
function MetricChoice({ value, onChange }: { value: Metric; onChange: (metric: Metric) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Pill label={said(METRICS.find(m => m.id === value)!.label)} trailing={ChevronDown} accessibilityLabel={tr("Figure per session")} onPress={() => setOpen(true)} className="h-9" />
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Figure per session")}>
      <SheetChoice label={tr("Figure per session")} columns={2} value={value} options={METRICS} onChange={id => { setOpen(false); onChange(id); }} />
    </Sheet>
  </>;
}

/** The quick periods under the curve and the number of solves in the one shown (a drag on the curve picks any other). */
function PeriodBar({ items, range, onRange, lastSession, count }: { items: readonly { at: string }[]; range: Range; onRange: (range: Range) => void; lastSession: number | null; count: number }) {
  const end = items.length - 1;
  const presets = useMemo(() => {
    const lastAt = Date.parse(items[end]?.at ?? ""), since = (days: number) => Math.max(0, items.findIndex(v => Date.parse(v.at) > lastAt - days * DAY));
    const fit = (a: number): Range => [Math.max(0, Math.min(a, end - 1)), end];
    return { all: [0, end], "90": fit(since(90)), "30": fit(since(30)), last: fit(lastSession ?? end) } as Record<Preset, Range>;
  }, [items, end, lastSession]);
  const preset = (["all", "90", "30", "last"] as Preset[]).find(k => presets[k][0] === range[0] && presets[k][1] === range[1]) ?? ("" as Preset);
  return <View className="flex-row items-center justify-between gap-2">
    <PillSeg<Preset> label={tr("Period")} value={preset} onChange={id => onRange(presets[id])}
      options={[{ id: "all", label: tr("All") }, { id: "90", label: tr("3 mo") }, { id: "30", label: tr("30 d") }, ...(lastSession != null ? [{ id: "last" as const, label: tr("Last") }] : [])]} />
    <Numeric numberOfLines={1} className="shrink text-[13px] text-muted-foreground">{plural(count, "solve")}</Numeric>
  </View>;
}

/** A figure of the period: its best in it (mint when it is the record), then the latest and the record's day. */
function FigureTile({ label, figure }: { label: string; figure?: PeriodFigure }) {
  if (!figure) return <Tile label={label} value="–" line="" />;
  const record = figure.period != null && figure.period === figure.record;
  return <Tile label={label} value={fmtTime(figure.period)} good={record}
    line={[figure.current != null && tr("latest {0}", { 0: fmtTime(figure.current) }), figure.at && tr("PB {0}", { 0: shortDate(figure.at) })].filter(Boolean).join(" · ")} />;
}

function Tile({ label, value, line, good }: { label: string; value: string; line: string; good?: boolean }) {
  return <View className="min-w-0 flex-1 gap-0.5 rounded-3xl bg-card px-3.5 py-3">
    <Text numberOfLines={1} className="text-[11px] font-bold tracking-[0.09em] text-muted-foreground uppercase">{said(label)}</Text>
    <Numeric numberOfLines={1} className={cn("text-[28px] leading-8 font-extrabold tracking-[-0.03em]", good && "text-success", value === "–" && "text-muted-foreground/60")}>{value}</Numeric>
    <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{line}</Numeric>
  </View>;
}

function Door({ icon, label, onPress, disabled }: { icon: typeof ListOrdered; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} className={cn("min-h-14 flex-1 flex-row items-center gap-2 rounded-3xl bg-card px-3.5 active:bg-card/80", disabled && "opacity-50")}>
    <Icon as={icon} size={18} className="text-primary" />
    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-bold">{label}</Text>
  </Pressable>;
}

/** Every time the best single fell, newest first: the time, the session or day, and what it took off. */
function RecordsSheet({ open, onClose, records, history, label }: { open: boolean; onClose: () => void; records: ReturnType<typeof singleRecords>; history: HistoryPoint[]; label: (index: number) => string }) {
  const { openSolve } = useSolveMenu();
  return <Sheet open={open} onClose={onClose} title={tr("Records broken")} contentClassName="px-3">
    <SheetFlatList data={records} keyExtractor={r => String(r.index)} renderItem={({ item: r }) => <Pressable accessibilityRole="button" onPress={() => openSolve(summaryOf(history[r.index]!))}
      className="h-11 flex-row items-center gap-3 rounded-xl px-2 active:bg-muted/50">
      <Numeric className="w-20 text-base font-bold text-success">{fmtTime(r.time)}</Numeric>
      <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-muted-foreground">{label(r.index) || shortDate(r.at)}</Text>
      <Numeric className="text-xs text-muted-foreground">{r.gain == null ? tr("first") : signed(-r.gain)}</Numeric>
    </Pressable>} />
  </Sheet>;
}

const summaryOf = (v: HistoryPoint): SolveSummary => ({ id: v.id, time_ms: v.timeMs, penalty: v.penalty, created_at: v.at, comment: v.comment,
  ...(v.solve_mode ? { solve_mode: v.solve_mode, moves: v.moves, cubes_solved: v.cubes_solved, cubes_attempted: v.cubes_attempted } : {}) });

type Row = { kind: "head"; session: SessionSummary | null; key: string } | { kind: "solve"; v: HistoryPoint; index: number; session: SessionSummary | null; key: string; first: boolean; last: boolean };

/**
 * The solves (or the sessions) of the period as a full-screen tool: in time order under the heading of their session,
 * or sorted by time; the sort, the commented filter and solves / sessions at the bottom.
 */
function ListTool({ docked = false, kind, onKind, onClose, history, data, sessionOf, sessions, range, records, title, sub, label }: {
  /** Docked beside the board (a wide screen): no way to close it, its tools at its foot in the panel. */
  docked?: boolean;
  kind: "solves" | "sessions"; onKind: (kind: "solves" | "sessions") => void; onClose: () => void; history: HistoryPoint[]; data: Data; sessionOf: (SessionSummary | null)[];
  sessions: SessionSummary[]; range: Range; records: { index: number }[]; title: string; sub: string; label: (x: SessionSummary | null) => string;
}) {
  const [sort, setSort] = useState<Sort>("newest");
  const [commented, setCommented] = useState(false);
  const { tablet } = useLayout();
  const { optimistic } = useSolveMenu();
  const pbs = useMemo(() => new Set(records.map(r => r.index)), [records]);
  const grouped = sort === "newest" || sort === "oldest";
  const commentCount = useMemo(() => history.slice(range[0], range[1] + 1).filter(v => v.comment).length, [history, range]);
  const rows = useMemo(() => {
    // A pending penalty or deletion shows before the history is recomputed.
    const list = history.slice(range[0], range[1] + 1).flatMap((point, i) => {
      const pending = optimistic.get(point.id);
      if (pending === null) return [];
      const v = pending ? { ...point, penalty: pending.penalty, comment: pending.comment ?? null, time: effective(point.timeMs, pending.penalty) } : point;
      return !commented || v.comment ? [{ v, index: range[0] + i }] : [];
    });
    if (sort === "newest") list.reverse();
    else if (sort === "fastest") list.sort((a, b) => byTime(a.v.time, b.v.time, 1) || b.index - a.index);
    else if (sort === "slowest") list.sort((a, b) => byTime(a.v.time, b.v.time, -1) || b.index - a.index);
    const out: Row[] = [];
    list.forEach(({ v, index }, i) => {
      const session = sessionOf[index] ?? null, next = list[i + 1];
      if (grouped && (i === 0 || sessionOf[list[i - 1]!.index] !== session)) out.push({ kind: "head", session, key: "h" + index });
      // In time order each session is a card under its heading; sorted by time, the whole list is one card.
      out.push({ kind: "solve", v, index, session, key: String(v.id), first: !grouped && i === 0, last: grouped ? !next || (sessionOf[next.index] ?? null) !== session : !next });
    });
    return out;
  }, [history, range, optimistic, commented, sort, grouped, sessionOf]);
  const sessionRows = useMemo(() => {
    const list = [...sessions];
    if (sort === "newest") list.reverse();
    else if (sort === "fastest" || sort === "slowest") list.sort((a, b) => byTime(a.mean, b.mean, sort === "fastest" ? 1 : -1));
    return list;
  }, [sessions, sort]);
  return <View className="min-h-0 flex-1">
    <View className="min-h-14 flex-row items-center gap-2">
      {!docked && <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={X} size={22} /></Pressable>}
      <View className={cn("min-w-0 flex-1", !docked && "items-center")}>
        <Text numberOfLines={1} accessibilityRole="header" className="text-base font-extrabold tracking-[-0.02em]">{title}</Text>
        <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{sub}</Numeric>
      </View>
      {!docked && <View className="size-11" />}
    </View>
    {kind === "solves" ? <>
      <View className="h-6 flex-row items-center gap-2 px-1.5">
        <Text className="w-6 text-right text-xs font-bold text-muted-foreground">#</Text>
        <Text className="w-[76px] text-xs font-bold text-muted-foreground">{tr("Time")}</Text>
        <Text className="w-12 text-xs font-bold text-muted-foreground">{tr("vs sess.")}</Text>
        <Text className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">{tr("Ao5 · Ao12")}</Text>
        <Text className="text-xs font-bold text-muted-foreground">{tr("At")}</Text>
      </View>
      <FlatList data={rows} keyExtractor={r => r.key} className="min-h-0 flex-1" initialNumToRender={20} windowSize={7} showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Empty title={tr("No solves match.")} />}
        renderItem={({ item: r }) => r.kind === "head"
          ? <View className="mt-2 rounded-t-2xl bg-card px-2.5 pt-2.5 pb-1">
            <Text numberOfLines={1} className="text-xs font-semibold text-muted-foreground">
              <Text className="text-xs font-bold text-foreground">{label(r.session) || tr("No session")}</Text>
              {r.session ? ` · ${plural(r.session.count, "solve")} · ${tr("mean {0}", { 0: fmtTime(r.session.mean) })} · ${tr("best {0}", { 0: fmtTime(r.session.best) })}` : ""}
            </Text>
          </View>
          : <SolveRow v={r.v} index={r.index} pb={pbs.has(r.index)} session={r.session} ao5={data.ao5[r.index] ?? null} ao12={data.ao12[r.index] ?? null}
            when={grouped ? hourOf(r.v.at) : shortDate(r.v.at)} first={r.first} last={r.last} />} />
    </> : <FlatList data={sessionRows} keyExtractor={x => String(x.id ?? x.at)} className="min-h-0 flex-1" contentContainerClassName="gap-1.5" showsVerticalScrollIndicator={false}
      renderItem={({ item: x }) => <View className="gap-0.5 rounded-2xl bg-card px-3.5 py-2.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-bold">{label(x)}</Text>
          <Numeric className="text-[15px] font-extrabold">{fmtTime(x.mean)}</Numeric>
        </View>
        <Numeric numberOfLines={1} className="text-xs text-muted-foreground">
          {plural(x.count, "solve")} · <Text className="text-xs text-success">{tr("best {0}", { 0: fmtTime(x.best) })}</Text> · Ao5 {fmtTime(x.ao5)} · Ao12 {fmtTime(x.ao12)}
        </Numeric>
      </View>} />}
    <View className={cn("gap-2 pt-2.5", !docked && "-mx-4 border-t border-border bg-card px-3.5", !docked && tablet && "-mx-7 px-6")}>
      <PillSeg<Sort> block label={tr("Sort solves")} value={sort} onChange={setSort}
        options={[{ id: "newest", label: tr("Newest") }, { id: "oldest", label: tr("Oldest") }, { id: "fastest", label: tr("Fastest") }, { id: "slowest", label: tr("Slowest") }]} />
      <View className="flex-row items-center justify-between gap-2">
        {kind === "solves" ? <Pill icon={MessageSquare} label={tr("Commented")} value={commentCount} on={commented} role="tab" accessibilityLabel={tr("Show only commented solves")} onPress={() => setCommented(!commented)} /> : <View />}
        <PillSeg<"solves" | "sessions"> label={tr("Show")} value={kind} onChange={onKind} options={[{ id: "solves", label: tr("Solves") }, { id: "sessions", label: tr("Sessions") }]} />
      </View>
    </View>
  </View>;
}

/** A solve of the list: number, time and its marks, gap to its session's mean, Ao5 · Ao12 (or Record), hour. */
function SolveRow({ v, index, pb, session, ao5, ao12, when, first, last }: { v: HistoryPoint; index: number; pb: boolean; session: SessionSummary | null; ao5: number | null; ao12: number | null; when: string; first: boolean; last: boolean }) {
  const gap = v.time != null && session?.mean != null ? v.time - session.mean : null;
  return <SolveMenu solve={summaryOf(v)} accessibilityLabel={tr("Solve {0}: {1}", { 0: index + 1, 1: fmtTime(v.time, { blank: "DNF" }) })}
    className={cn("h-10 flex-row items-center gap-2 bg-card px-1.5 active:bg-muted", first && "mt-2 rounded-t-2xl", last && "mb-0.5 rounded-b-2xl")}>
    <Numeric className="w-6 text-right text-xs text-muted-foreground">{index + 1}</Numeric>
    <View className="w-[76px] flex-row items-center gap-1">
      <Numeric numberOfLines={1} className={cn("text-[15px] font-bold", v.time == null ? "text-destructive" : pb ? "text-success" : v.penalty === "+2" && "text-warning")}>{fmtTime(v.time, { blank: "DNF" })}</Numeric>
      {v.penalty === "+2" && <Text className="text-[10px] font-bold text-warning">+2</Text>}
      {v.comment ? <Icon as={MessageSquare} size={12} className="text-muted-foreground" /> : null}
      {v.smart ? <Icon as={Rotate3d} size={12} className="text-muted-foreground" /> : null}
    </View>
    <Numeric className={cn("w-12 text-xs font-semibold", gap == null ? "text-muted-foreground" : gap < 0 ? "text-success" : "text-destructive")}>{gap == null ? "–" : signed(gap)}</Numeric>
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      {pb && <View className="rounded-full bg-success/15 px-2 py-0.5"><Text className="text-[11px] font-bold text-success">{tr("Record")}</Text></View>}
      {v.memoMs != null && <Numeric className="text-[11px] font-bold">{tr("memo {0}", { 0: fmtTime(v.memoMs) })}</Numeric>}
      <Numeric numberOfLines={1} className="shrink text-xs text-muted-foreground">{pb ? fmtTime(ao5) : `${fmtTime(ao5)} · ${fmtTime(ao12)}`}</Numeric>
    </View>
    <Numeric className="text-xs text-muted-foreground">{when}</Numeric>
  </SolveMenu>;
}
