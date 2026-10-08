import { atom, useAtom } from "jotai";
import { ChartLine, MessageSquare, Table } from "lucide-react-native";
import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { effective, fmtDate, fmtTime } from "../../../src/client/lib/format";
import type { CaseHistoryDto, HistoryPoint } from "../../../src/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { storage } from "../platform/storage";
import { useColors } from "../theme";
import { Empty, Figure, Numeric } from "./layout";
import { ChoiceButton } from "./PuzzlePicker";
import { SolveMenu, useSolveMenu, type SolveSummary } from "./SolveMenus";
import { tr } from "../../../src/client/i18n";

/**
 * The solve statistics of a selection (the web's `TimerStats`): a strip of figures, then a panel showing the solves
 * either as a zoomable chart (single times and the rolling Ao5) or as a list, each solve opening its sheet and, held,
 * its menu. `compact` is the case-statistics look: figures in four columns and a panel of fixed height; otherwise the
 * panel fills the page.
 */

/** Chart or table, remembered across launches like the web preference `cubix.profile.statsView`. */
type StatsView = "chart" | "table";
const VIEW_KEY = "cubix.profile.statsView";
const initialView = (): StatsView => { try { return storage.getItem(VIEW_KEY) === "table" ? "table" : "chart"; } catch { return "chart"; } };
const statsViewAtom = atom<StatsView>(initialView());

type Sort = "newest" | "oldest" | "fastest" | "slowest";
const SORTS: { id: Sort; label: string }[] = [{ id: "newest", label: "Newest first" }, { id: "oldest", label: "Oldest first" }, { id: "fastest", label: "Fastest first" }, { id: "slowest", label: "Slowest first" }];
/** Rows drawn before the list asks for more; long timer histories stay light. */
const PAGE = 100;
type Range = [number, number];

/** The seven figures: four columns over two rows, flat. */
function StatStrip({ summary }: { summary: CaseHistoryDto["summary"] }) {
  const items: [string, string, "" | "good" | "accent"][] = [
    ["Best", fmtTime(summary.best), "good"], ["Ao5", fmtTime(summary.ao5), "accent"], ["Ao12", fmtTime(summary.ao12), "accent"], ["Mean", fmtTime(summary.mean), ""],
    ["Best Ao5", fmtTime(summary.bestAo5), "good"], ["Best Ao12", fmtTime(summary.bestAo12), "good"], ["Solves", String(summary.count), ""],
  ];
  return <View className="flex-row flex-wrap gap-y-3 rounded-xl bg-muted/45 px-3 py-3">
    {items.map(([label, value, tone]) => <View key={label} style={{ width: "25%" }} className="pr-2"><Figure label={label} value={value} tone={tone} size="base" /></View>)}
  </View>;
}

/**
 * Solve statistics of one selection. `empty` shows when there is no solve; `fill` lets the panel take the remaining
 * height of a page (the chart grows, the list scrolls inside it).
 */
export function TimerStats({ data, empty, compact, fill }: { data: CaseHistoryDto | undefined; empty: ReactNode; compact?: boolean; fill?: boolean }) {
  // The list order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<Sort>("newest");
  const [commented, setCommented] = useState(false);
  if (!data?.summary.count) return typeof empty === "string" ? <Empty>{empty}</Empty> : <>{empty}</>;
  const history = data.history;
  return <View className={cn("gap-3", fill && "min-h-0 flex-1")}>
    <StatStrip summary={data.summary} />
    <StatsPanel key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`} history={history} ao5={data.ao5} compact={compact} fill={fill} table={{ sort, setSort, commented, setCommented }} />
  </View>;
}

type TableState = { sort: Sort; setSort: (sort: Sort) => void; commented: boolean; setCommented: (commented: boolean) => void };

function StatsPanel({ history, ao5, compact, fill, table }: { history: HistoryPoint[]; ao5: (number | null)[]; compact?: boolean; fill?: boolean; table: TableState }) {
  const colors = useColors();
  const [view, setView] = useAtom(statsViewAtom);
  const [range, setRange] = useState<Range>([0, history.length - 1]);
  const changeView = (next: StatsView) => { setView(next); try { storage.setItem(VIEW_KEY, next); } catch { /* Best effort. */ } };
  const toggle = <View className="flex-row items-center gap-1" accessibilityRole="tablist">
    {([["chart", "Chart", ChartLine], ["table", "Table", Table]] as const).map(([id, label, I]) => {
      const on = view === id;
      return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => changeView(id)}
        className={cn("h-11 flex-row items-center gap-1.5 rounded-lg px-2.5 active:bg-muted/50", on && "bg-muted")}>
        <Icon as={I} size={15} className={on ? "text-foreground" : "text-muted-foreground"} />
        <Text className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{tr(label)}</Text>
      </Pressable>;
    })}
  </View>;
  return <View className={cn("gap-3", compact ? "" : "rounded-xl border border-border bg-card p-3", fill && "min-h-0 flex-1")}>
    {view === "table" ? <SolvesTable history={history} range={range} toggle={toggle} fill={fill} {...table} /> : <>
      <View className="flex-row items-center justify-between gap-2">
        {toggle}
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5"><View className="h-0.5 w-3 rounded-full bg-chart-1" /><Text className="text-xs text-muted-foreground">{tr("Single")}</Text></View>
          <View className="flex-row items-center gap-1.5"><View className="h-0.5 w-3 rounded-full" style={{ backgroundColor: colors.chart2 }} /><Text className="text-xs text-muted-foreground">{tr("Ao5")}</Text></View>
        </View>
      </View>
      <HistoryChart history={history} averages={ao5} range={range} onRange={setRange} height={fill ? undefined : 200} />
    </>}
  </View>;
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
/** Inclusive solve bounds; keeps the requested width when reaching either edge. */
function fitRange(start: number, width: number, last: number): Range {
  const span = clamp(Math.round(width), Math.min(1, last), last);
  const first = clamp(Math.round(start), 0, last - span);
  return [first, first + span];
}

/**
 * Single times (accent) and the rolling Ao5 (series colour) over the visible period, four hairline levels with their
 * times on the left, the first and last dates below. A tap shows the solve under the finger; dragging across the chart
 * selects a period and zooms into it; "Reset zoom" shows every solve.
 */
const HistoryChart = memo(function HistoryChart({ history, averages, range, onRange, height }: { history: HistoryPoint[]; averages: (number | null)[]; range: Range; onRange: (range: Range) => void; height?: number }) {
  const colors = useColors();
  const [size, setSize] = useState({ w: 0, h: height ?? 0 });
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const gesture = useRef<{ x: number; moved: boolean } | null>(null);
  const [first, last] = range, end = history.length - 1;
  const zoomed = first > 0 || last < end;
  const span = Math.max(1, last - first);
  const W = size.w, H = height ?? size.h;
  const scale = useMemo(() => {
    const all = [...history.slice(first, last + 1).map(v => v.time), ...averages.slice(first, last + 1)].filter((v): v is number => v != null && Number.isFinite(v));
    const low = all.length ? Math.min(...all) : 0;
    const high = Math.max(low + 1, all.length ? Math.max(...all) : 1);
    const lo = Math.max(0, low - (high - low) * 0.12);
    return { lo, height: high + (high - low) * 0.12 - lo };
  }, [history, averages, first, last]);
  const x = (i: number) => history.length === 1 ? W / 2 : (6 + (i - first) / span * 788) / 800 * W;
  const y = (v: number) => (12 + (1 - (v - scale.lo) / scale.height) * 202) / 240 * H;
  const paths = useMemo(() => {
    const path = (series: (number | null)[]) => {
      let pen = false, d = "";
      series.slice(first, last + 1).forEach((value, offset) => {
        if (value == null || !Number.isFinite(value)) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(first + offset).toFixed(1)} ${y(value).toFixed(1)} `;
        pen = true;
      });
      return d;
    };
    return { single: path(history.map(v => v.time)), average: path(averages) };
  }, [history, averages, first, last, W, H, scale]);
  const fraction = (px: number) => W ? clamp((px / W * 800 - 6) / 788, 0, 1) : 0;
  const index = (f: number) => clamp(Math.round(first + f * span), first, last);
  const onGrant = (e: GestureResponderEvent) => { gesture.current = { x: e.nativeEvent.locationX, moved: false }; };
  const onMove = (e: GestureResponderEvent) => {
    const g = gesture.current;
    if (!g) return;
    const px = e.nativeEvent.locationX;
    if (!g.moved && Math.abs(px - g.x) < 8) return;
    g.moved = true;
    setHover(null);
    setDrag({ start: fraction(g.x), end: fraction(px) });
  };
  const onRelease = (e: GestureResponderEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (!g.moved) { const i = index(fraction(g.x)); setHover(current => current === i ? null : i); return; }
    const a = index(Math.min(fraction(g.x), fraction(e.nativeEvent.locationX))), b = index(Math.max(fraction(g.x), fraction(e.nativeEvent.locationX)));
    setDrag(null);
    if (b > a || end === 0) { setHover(null); onRange(fitRange(a, b - a, end)); }
  };
  const cancel = () => { gesture.current = null; setDrag(null); };
  const selection = drag ? [index(Math.min(drag.start, drag.end)), index(Math.max(drag.start, drag.end))] : null;
  const visible = history.slice(first, last + 1);
  const point = hover != null ? history[hover] : null;
  const value = point ? point.time ?? averages[hover!] : null;
  const onLayout = (e: LayoutChangeEvent) => { const { width, height: h } = e.nativeEvent.layout; setSize(s => s.w === width && s.h === h ? s : { w: width, h }); };
  return <View className={cn("gap-1", height === undefined && "min-h-40 flex-1")}>
    <View className={cn("flex-row gap-2.5", height === undefined && "min-h-0 flex-1")} style={height !== undefined ? { height } : undefined}>
      <View className="w-12" pointerEvents="none">
        {H > 0 && [0, 1, 2, 3].map(i => <Numeric key={i} className="absolute right-0 text-xs text-muted-foreground" style={{ top: (12 + i / 3 * 202) / 240 * H - 8 }}>{fmtTime(scale.lo + scale.height * (1 - i / 3))}</Numeric>)}
      </View>
      <View className="min-w-0 flex-1" onLayout={onLayout}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => !gesture.current?.moved}
        onResponderGrant={onGrant} onResponderMove={onMove} onResponderRelease={onRelease} onResponderTerminate={cancel}
        accessibilityLabel={tr("Solve times: tap a point to read it, drag across the chart to zoom into a period")}>
        {W > 0 && H > 0 && <Svg width={W} height={H}>
          {[0, 1, 2, 3].map(i => <Line key={i} x1={0} x2={W} y1={(12 + i / 3 * 202) / 240 * H} y2={(12 + i / 3 * 202) / 240 * H} stroke={colors.border} strokeWidth={1} />)}
          <Path d={paths.average} fill="none" stroke={colors.chart2} strokeWidth={1.6} strokeLinejoin="round" />
          <Path d={paths.single} fill="none" stroke={colors.primary} strokeWidth={1.6} strokeLinejoin="round" />
          {visible.map((v, i) => v.time != null && (visible.length < 40 || (history[first + i - 1]?.time == null && history[first + i + 1]?.time == null))
            ? <Circle key={i} cx={x(first + i)} cy={y(v.time)} r={2.5} fill={colors.primary} /> : null)}
          {hover != null && <Line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke={colors.mutedForeground} strokeDasharray="3 3" />}
          {hover != null && value != null && <Circle cx={x(hover)} cy={y(value)} r={4.5} fill={colors.primary} stroke={colors.card} strokeWidth={2} />}
          {selection && <Rect x={x(selection[0]!)} y={0} width={Math.max(1, x(selection[1]!) - x(selection[0]!))} height={H} fill={colors.primary} fillOpacity={0.12} stroke={colors.primary} strokeWidth={1} />}
        </Svg>}
        {zoomed && <Button size="sm" variant="secondary" className="absolute top-1 right-1 h-8" onPress={() => { setHover(null); onRange([0, end]); }}><Text className="text-xs">{tr("Reset zoom")}</Text></Button>}
        {selection && <View pointerEvents="none" className="absolute bottom-1 self-center rounded-md bg-popover px-2 py-1"><Text className="text-xs">{fmtDate(history[selection[0]!]!.at)} — {fmtDate(history[selection[1]!]!.at)}</Text></View>}
        {point && <View pointerEvents="none" className="absolute top-2 gap-0.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg" style={x(hover!) > W / 2 ? { right: W - x(hover!) + 10 } : { left: x(hover!) + 10 }}>
          <Numeric className="text-base font-semibold">{fmtTime(point.time, { blank: "DNF" })}</Numeric>
          {averages[hover!] != null && <Numeric className="text-xs" style={{ color: colors.chart2 }}>{tr("Ao5 {0}", { 0: fmtTime(averages[hover!]) })}</Numeric>}
          <Text className="text-xs text-muted-foreground">#{hover! + 1} · {fmtDate(point.at)}</Text>
        </View>}
      </View>
    </View>
    <View className="ml-14.5 flex-row justify-between gap-3">
      <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{history[first] ? fmtDate(history[first]!.at) : ""}</Text>
      <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{last !== first && history[last] ? fmtDate(history[last]!.at) : ""}</Text>
    </View>
  </View>;
});

/** Every solve of the visible period, sorted as asked; a solve opens its sheet, held its menu. */
function SolvesTable({ history, range, toggle, fill, sort, setSort, commented, setCommented }: { history: HistoryPoint[]; range: Range; toggle: ReactNode; fill?: boolean } & TableState) {
  const [shown, setShown] = useState(PAGE);
  const { optimistic } = useSolveMenu();
  const rows = useMemo(() => {
    const byTime = (a: HistoryPoint, b: HistoryPoint, direction: 1 | -1) => a.time == null ? (b.time == null ? 0 : 1) : b.time == null ? -1 : (a.time - b.time) * direction;
    // A pending penalty or deletion shows before the history is recomputed.
    const list = history.slice(range[0], range[1] + 1).flatMap((point, i) => {
      const index = range[0] + i, previous = history[index - 1];
      const pending = optimistic.get(point.id);
      if (pending === null) return [];
      const v = pending ? { ...point, penalty: pending.penalty, comment: pending.comment ?? null, time: effective(point.timeMs, pending.penalty) } : point;
      if (commented && !v.comment) return [];
      const pb = point.time != null && point.time === point.best && (!previous || previous.best == null || previous.best > point.time);
      return [{ v, index, pb }];
    });
    if (sort === "newest") list.reverse();
    else if (sort === "fastest") list.sort((a, b) => byTime(a.v, b.v, 1) || b.index - a.index);
    else if (sort === "slowest") list.sort((a, b) => byTime(a.v, b.v, -1) || b.index - a.index);
    return list;
  }, [history, range, sort, commented, optimistic]);
  const commentCount = useMemo(() => history.filter(v => v.comment).length, [history]);
  type Row = (typeof rows)[number];
  const renderRow = ({ item: { v, index, pb } }: { item: Row }) => {
    const solve: SolveSummary = { id: v.id, time_ms: v.timeMs, penalty: v.penalty, created_at: v.at, comment: v.comment };
    return <SolveMenu solve={solve} accessibilityLabel={tr("Solve {0}: {1}", { 0: index + 1, 1: fmtTime(v.time, { blank: "DNF" }) })} className="min-h-11 justify-center border-b border-border px-1 py-1.5 active:bg-muted/50">
      <View className="flex-row items-center gap-3">
        <Numeric className="w-9 text-right text-xs text-muted-foreground">{index + 1}</Numeric>
        <Numeric className={cn("text-base", v.time == null ? "text-destructive" : pb ? "text-primary" : v.penalty === "+2" ? "text-warning" : "")}>{fmtTime(v.time, { blank: "DNF" })}</Numeric>
        {pb && <Badge variant="accent" className="px-1.5"><Text>{tr("PB")}</Text></Badge>}
        {v.penalty === "+2" && <Badge variant="warning" className="px-1.5"><Text>+2</Text></Badge>}
        <Text numberOfLines={1} className="ml-auto text-xs text-muted-foreground">{fmtDate(v.at)}</Text>
      </View>
      {v.comment ? <Text className="pt-0.5 pl-12 text-sm">{v.comment}</Text> : null}
    </SolveMenu>;
  };
  const more = rows.length > shown ? <Button variant="outline" className="mt-2 self-center" onPress={() => setShown(shown + PAGE)}><Text>{tr("Show more ({0} left)", { 0: rows.length - shown })}</Text></Button> : null;
  const empty = <Empty>{commented ? tr("No commented solve yet. Hold a time to add a comment.") : tr("No solves match.")}</Empty>;
  return <>
    <View className="flex-row items-center justify-between gap-2">
      {toggle}
      <View className="shrink flex-row items-center gap-1">
        <ChoiceButton label={tr("Sort solves")} value={sort} options={SORTS} onChange={setSort} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Show only commented solves")} accessibilityState={{ selected: commented }} onPress={() => setCommented(!commented)}
          className={cn("h-11 flex-row items-center gap-1 rounded-lg px-2.5 active:bg-muted/50", commented && "bg-muted")}>
          <Icon as={MessageSquare} size={15} className={commented ? "text-foreground" : "text-muted-foreground"} />
          <Numeric className="text-xs text-muted-foreground">{commentCount}</Numeric>
        </Pressable>
      </View>
    </View>
    {fill
      ? <FlatList key={`${range.join(":")}:${sort}:${commented}`} data={rows.slice(0, shown)} keyExtractor={row => String(row.v.id)} renderItem={renderRow}
        className="min-h-0 flex-1" initialNumToRender={14} windowSize={7} showsVerticalScrollIndicator={false}
        ListEmptyComponent={empty} ListFooterComponent={more} contentContainerClassName="pb-2" />
      : <ScrollView nestedScrollEnabled className="max-h-72" showsVerticalScrollIndicator={false}>
        {rows.length ? rows.slice(0, shown).map(row => <View key={row.v.id}>{renderRow({ item: row })}</View>) : empty}
        {more}
      </ScrollView>}
  </>;
}
