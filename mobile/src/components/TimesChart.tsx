import { atom, useAtom } from "jotai";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { effective, fmtDate, fmtSolve, fmtTime } from "../../../src/client/lib/format";
import type { CaseHistoryDto, HistoryPoint } from "../../../src/shared/types";
import { storage } from "../platform/storage";
import { FONT, useTheme } from "../theme";
import { IconComment, IconGrid, IconTrash, type IconProps } from "./icons";
import { Select } from "./Select";
import { Sheet } from "./Sheet";
import { useSolveMenu, type SolveSummary } from "./SolveMenus";
import { Btn, Empty, Label, mono } from "./ui";

/**
 * The web app's solve statistics (`TimerStats` in desktop/renderer/main.tsx): a strip of figures, then a
 * panel showing the solves either as a zoomable chart (single times and the rolling Ao5) or as a table
 * with the penalty, comment and delete actions of each solve. `compact` is the case-statistics look:
 * flat figures in four columns and a borderless panel of fixed height; otherwise the panel fills the page.
 */

/** Chart or table, remembered across launches like the web preference `cubix.profile.statsView`. */
type StatsView = "chart" | "table";
const VIEW_KEY = "cubix.profile.statsView";
const initialView = (): StatsView => { try { return storage.getItem(VIEW_KEY) === "table" ? "table" : "chart"; } catch { return "chart"; } };
const statsViewAtom = atom<StatsView>(initialView());

type Sort = "newest" | "oldest" | "fastest" | "slowest";
const SORTS: { value: Sort; label: string }[] = [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "fastest", label: "Fastest first" }, { value: "slowest", label: "Slowest first" }];
/** Rows drawn before the table asks for more; long timer histories stay light. */
const PAGE = 100;
type Range = [number, number];

const IconChart = ({ size = 16, color = "currentColor", strokeWidth = 2 }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 4v16h16" /><Path d="m7 14 4-4 3 3 5-6" /></Svg>;

/** `.stat-strip`: the seven figures, as raised tiles scrolling sideways, or flat in four columns (`compact`). */
function StatStrip({ summary, compact, bleed = 0 }: { summary: CaseHistoryDto["summary"]; compact?: boolean; bleed?: number }) {
  const t = useTheme();
  const items: [string, string, boolean][] = [
    ["Best", fmtTime(summary.best), true], ["Ao5", fmtTime(summary.ao5), false], ["Ao12", fmtTime(summary.ao12), false],
    ["Mean", fmtTime(summary.mean), false], ["Best Ao5", fmtTime(summary.bestAo5), false], ["Best Ao12", fmtTime(summary.bestAo12), false],
    ["Solves", String(summary.count), false],
  ];
  if (compact) {
    const rows = [items.slice(0, 4), items.slice(4)];
    return <View style={{ gap: 12 }}>{rows.map((row, r) => <View key={r} style={styles.compactRow}>
      {Array.from({ length: 4 }, (_, c) => {
        const item = row[c];
        return <View key={c} style={[styles.compactCell, c > 0 && { paddingLeft: 12, borderLeftWidth: item ? 1 : 0, borderColor: t.line }]}>
          {item && <><Label numberOfLines={1}>{item[0]}</Label><Text numberOfLines={1} style={[mono(t, 17), item[2] && { color: t.accent }]}>{item[1]}</Text></>}
        </View>;
      })}
    </View>)}</View>;
  }
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -bleed }} contentContainerStyle={[styles.strip, { paddingHorizontal: bleed }]}>
    {items.map(([label, value, accent]) => <View key={label} accessibilityLabel={`${label}: ${value}`} style={[styles.statTile, { backgroundColor: t.raised, borderColor: t.line }]}>
      <Label numberOfLines={1}>{label}</Label>
      <Text numberOfLines={1} style={[mono(t, 21), accent && { color: t.accent }]}>{value}</Text>
    </View>)}
  </ScrollView>;
}

/**
 * Solve statistics of one selection. `empty` shows when there is no solve; `fill` lets the panel take the
 * remaining height of a page (the chart grows, the table scrolls inside it); `bleed` lets the figures
 * scroll sideways to the edges of a page with that padding.
 */
export function TimerStats({ data, empty, compact, fill, bleed }: { data: CaseHistoryDto | undefined; empty: ReactNode; compact?: boolean; fill?: boolean; bleed?: number }) {
  // The table order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<Sort>("newest");
  const [commented, setCommented] = useState(false);
  if (!data?.summary.count) return typeof empty === "string" ? <Empty>{empty}</Empty> : <>{empty}</>;
  const history = data.history;
  return <View style={[{ gap: 14 }, fill && { flex: 1, minHeight: 0 }]}>
    <StatStrip summary={data.summary} compact={compact} bleed={bleed} />
    <StatsPanel key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`} history={history} ao5={data.ao5} compact={compact} fill={fill} table={{ sort, setSort, commented, setCommented }} />
  </View>;
}

/** The chart/table panel alone, for screens that show their own figures (case detail). */
export function TimesChart({ history, ao5, height = 200 }: { history: HistoryPoint[]; ao5: (number | null)[]; height?: number }) {
  const [sort, setSort] = useState<Sort>("newest");
  const [commented, setCommented] = useState(false);
  if (history.length === 0) return <Empty>No attempts on this case yet.</Empty>;
  return <StatsPanel key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`} history={history} ao5={ao5} compact chartHeight={height} table={{ sort, setSort, commented, setCommented }} />;
}

type TableState = { sort: Sort; setSort: (sort: Sort) => void; commented: boolean; setCommented: (commented: boolean) => void };

function StatsPanel({ history, ao5, compact, fill, chartHeight = 200, table }: { history: HistoryPoint[]; ao5: (number | null)[]; compact?: boolean; fill?: boolean; chartHeight?: number; table: TableState }) {
  const t = useTheme();
  const [view, setView] = useAtom(statsViewAtom);
  const [range, setRange] = useState<Range>([0, history.length - 1]);
  const changeView = (next: StatsView) => { setView(next); try { storage.setItem(VIEW_KEY, next); } catch { /* Best effort. */ } };
  const toggle = <ViewToggle value={view} onChange={changeView} />;
  return <View style={[styles.panel, compact ? [styles.panelFlat, { borderTopColor: t.line }] : { backgroundColor: t.raised, borderColor: t.line }, fill && { flex: 1, minHeight: 0 }]}>
    {view === "table" ? <SolvesTable history={history} range={range} toggle={toggle} fill={fill} {...table} /> : <>
      <View style={styles.between}>
        {toggle}
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: t.accent }]} /><Text style={[styles.legendText, { color: t.accent }]}>Single</Text></View>
          <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: t.series2 }]} /><Text style={[styles.legendText, { color: t.series2 }]}>Ao5</Text></View>
        </View>
      </View>
      <HistoryChart history={history} averages={ao5} range={range} onRange={setRange} height={fill ? undefined : chartHeight} />
    </>}
  </View>;
}

/** `.stats-view-toggle`: chart or table, icons only on phones. */
function ViewToggle({ value, onChange }: { value: StatsView; onChange: (view: StatsView) => void }) {
  const t = useTheme();
  return <View style={[styles.toggle, { borderColor: t.line }]} accessibilityRole="tablist">
    {([["chart", "Chart", IconChart], ["table", "Table", IconGrid]] as const).map(([id, label, Icon]) => {
      const active = value === id;
      return <Pressable key={id} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={() => onChange(id)}
        style={({ pressed }) => [styles.toggleItem, { backgroundColor: active ? t.surface3 : pressed ? t.hover : "transparent" }]}>
        <Icon size={15} color={active ? t.text : t.muted} />
      </Pressable>;
    })}
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
 * `HistoryChart`: single times (accent) and the rolling Ao5 (series colour) over the visible period, four
 * hairline levels with their times on the left, the first and last dates below. A tap shows the solve under
 * the finger; dragging across the chart selects a period and zooms into it; "Reset zoom" shows every solve.
 */
const HistoryChart = memo(function HistoryChart({ history, averages, range, onRange, height }: { history: HistoryPoint[]; averages: (number | null)[]; range: Range; onRange: (range: Range) => void; height?: number }) {
  const t = useTheme();
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
  return <View style={[styles.chartArea, height === undefined && { flex: 1, minHeight: 160 }]}>
    <View style={[styles.chartRow, height !== undefined ? { height } : { flex: 1, minHeight: 0 }]}>
      <View style={styles.axis} pointerEvents="none">
        {H > 0 && [0, 1, 2, 3].map(i => <Text key={i} style={[styles.axisText, { color: t.muted, top: (12 + i / 3 * 202) / 240 * H - 7 }]}>{fmtTime(scale.lo + scale.height * (1 - i / 3))}</Text>)}
      </View>
      <View style={{ flex: 1, minWidth: 0 }} onLayout={onLayout}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => !gesture.current?.moved}
        onResponderGrant={onGrant} onResponderMove={onMove} onResponderRelease={onRelease} onResponderTerminate={cancel}
        accessibilityLabel="Solve times: tap a point to read it, drag across the chart to zoom into a period">
        {W > 0 && H > 0 && <Svg width={W} height={H}>
          {[0, 1, 2, 3].map(i => <Line key={i} x1={0} x2={W} y1={(12 + i / 3 * 202) / 240 * H} y2={(12 + i / 3 * 202) / 240 * H} stroke={t.line} strokeWidth={1} />)}
          <Path d={paths.single} fill="none" stroke={t.accent} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d={paths.average} fill="none" stroke={t.series2} strokeWidth={1.8} strokeLinejoin="round" />
          {visible.map((v, i) => v.time != null && (visible.length < 40 || (history[first + i - 1]?.time == null && history[first + i + 1]?.time == null))
            ? <Circle key={i} cx={x(first + i)} cy={y(v.time)} r={2.5} fill={t.accent} /> : null)}
          {hover != null && <Line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke={t.muted} strokeDasharray="3 3" />}
          {hover != null && value != null && <Circle cx={x(hover)} cy={y(value)} r={4.5} fill={t.accent} stroke={t.raised} strokeWidth={2} />}
          {selection && <Rect x={x(selection[0])} y={0} width={Math.max(1, x(selection[1]) - x(selection[0]))} height={H} fill={t.soft} stroke={t.accent} strokeWidth={1} />}
        </Svg>}
        {zoomed && <Btn small label="Reset zoom" onPress={() => { setHover(null); onRange([0, end]); }} style={[styles.reset, { backgroundColor: t.surface2 }]} textStyle={{ fontSize: 11 }} />}
        {selection && <View pointerEvents="none" style={[styles.selectionLabel, { backgroundColor: t.surface2 }]}><Text style={{ color: t.text, fontSize: 11 }}>{fmtDate(history[selection[0]].at)} — {fmtDate(history[selection[1]].at)}</Text></View>}
        {point && <View pointerEvents="none" style={[styles.tip, { backgroundColor: t.surface2, borderColor: t.line }, t.menuShadow, x(hover!) > W / 2 ? { right: W - x(hover!) + 10 } : { left: x(hover!) + 10 }]}>
          <Text style={[mono(t, 15, "600")]}>{point.time == null ? "DNF" : fmtTime(point.time)}</Text>
          {averages[hover!] != null && <Text style={[mono(t, 12), { color: t.series2 }]}>Ao5 {fmtTime(averages[hover!])}</Text>}
          <Text style={{ color: t.muted, fontSize: 11 }}>#{hover! + 1} · {fmtDate(point.at)}</Text>
        </View>}
      </View>
    </View>
    <View style={styles.dates}>
      <Text numberOfLines={1} style={[styles.dateText, { color: t.muted }]}>{history[first] ? fmtDate(history[first].at) : ""}</Text>
      <Text numberOfLines={1} style={[styles.dateText, { color: t.muted }]}>{last !== first && history[last] ? fmtDate(history[last].at) : ""}</Text>
    </View>
  </View>;
});

/** Every solve of the visible period, sorted as asked, each with its penalty, comment and delete buttons. */
function SolvesTable({ history, range, toggle, fill, sort, setSort, commented, setCommented }: { history: HistoryPoint[]; range: Range; toggle: ReactNode; fill?: boolean } & TableState) {
  const t = useTheme();
  const [shown, setShown] = useState(PAGE);
  const [details, setDetails] = useState<{ solve: SolveSummary; index: number } | null>(null);
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
    return <View style={[styles.solveRow, { borderBottomColor: t.line }]}>
      <View style={styles.solveLine}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Solve ${index + 1}: ${v.time == null ? "DNF" : fmtTime(v.time)}. Show details`} onPress={() => setDetails({ solve, index })}
          style={({ pressed }) => [styles.historyRow, pressed && { backgroundColor: t.hover }]}>
          <Text style={[styles.index, { color: t.muted }]}>{index + 1}</Text>
          <Text numberOfLines={1} style={[styles.time, mono(t, 13, "600"), v.time == null ? { color: t.danger } : pb ? { color: t.accent } : null]}>{v.time == null ? "DNF" : fmtTime(v.time)}</Text>
          <View style={styles.tags}>
            {pb && <Tag accent>PB</Tag>}
            {v.penalty === "+2" && <Tag>+2</Tag>}
          </View>
        </Pressable>
        <SolveActions solve={solve} />
      </View>
      {v.comment ? <Text style={[styles.comment, { color: t.text }]}>{v.comment}</Text> : null}
    </View>;
  };
  const more = rows.length > shown ? <Btn label={`Show more (${rows.length - shown} left)`} onPress={() => setShown(shown + PAGE)} style={{ alignSelf: "center", marginTop: 6 }} /> : null;
  const empty = <Empty>{commented ? "No commented solve yet. Add one with the bubble on a time." : "No solves match."}</Empty>;
  return <>
    <View style={styles.between}>
      {toggle}
      <View style={styles.tableTools}>
        <Select value={sort} accessibilityLabel="Sort solves" options={SORTS} onChange={setSort} style={{ backgroundColor: t.surface3, borderColor: "transparent" }} />
        <Btn variant="ghost" active={commented} accessibilityLabel="Show only commented solves" icon={<IconComment size={14} color={commented ? t.text : t.muted} />} onPress={() => setCommented(!commented)}>
          <Text style={[mono(t, 12), { color: t.muted }]}>{commentCount}</Text>
        </Btn>
      </View>
    </View>
    <View style={[styles.solvesHead, { borderBottomColor: t.line }]}>
      <Text style={[styles.headText, styles.index, { color: t.muted }]}>#</Text>
      <Text style={[styles.headText, { flex: 1, color: t.muted }]}>Time</Text>
      <Text style={[styles.headText, { color: t.muted, paddingRight: 8 }]}>Actions</Text>
    </View>
    {fill
      ? <FlatList key={`${range.join(":")}:${sort}:${commented}`} data={rows.slice(0, shown)} keyExtractor={row => String(row.v.id)} renderItem={renderRow}
        style={{ flex: 1, minHeight: 0, marginHorizontal: -6, marginTop: -12 }} initialNumToRender={14} windowSize={7} showsVerticalScrollIndicator={false}
        ListEmptyComponent={empty} ListFooterComponent={more} contentContainerStyle={{ paddingBottom: 8 }} />
      : <ScrollView nestedScrollEnabled style={{ maxHeight: 260, marginHorizontal: -6, marginTop: -12 }} showsVerticalScrollIndicator={false}>
        {rows.length ? rows.slice(0, shown).map(row => <View key={row.v.id}>{renderRow({ item: row })}</View>) : empty}
        {more}
      </ScrollView>}
    <SolveDetails details={details} onClose={() => setDetails(null)} />
  </>;
}

/** `.tag`: tiny PB / +2 badge. */
function Tag({ children, accent }: { children: string; accent?: boolean }) {
  const t = useTheme();
  return <View style={[styles.tag, { backgroundColor: accent ? t.soft : t.surface2 }]}><Text style={[styles.tagText, { color: accent ? t.accent : t.muted }]}>{children}</Text></View>;
}

/** `.solve-row-actions`: +2, DNF, comment and delete of one solve. */
function SolveActions({ solve, labels }: { solve: SolveSummary; labels?: boolean }) {
  const t = useTheme();
  const { deleteTime, togglePenalty, editComment, busy } = useSolveMenu();
  const size = labels ? 32 : 28;
  const text = labels ? 13 : 12;
  return <View style={[styles.actions, labels && { width: undefined, justifyContent: "center", gap: 6 }]}>
    <Btn variant="ghost" size={size} active={solve.penalty === "+2"} label="+2" textStyle={{ fontSize: text }} style={styles.action} disabled={busy} accessibilityLabel="+2 penalty" onPress={() => void togglePenalty(solve, "+2")} />
    <Btn variant="ghost" size={size} active={solve.penalty === "dnf"} label="DNF" textStyle={{ fontSize: text }} style={styles.action} disabled={busy} accessibilityLabel="Did not finish" onPress={() => void togglePenalty(solve, "dnf")} />
    <Btn variant="ghost" size={size} style={styles.action} disabled={busy} accessibilityLabel={solve.comment ? "Edit comment" : "Add comment"} icon={<IconComment size={15} color={solve.comment ? t.accent : t.secondary} />} label={labels ? "Comment" : undefined} textStyle={{ fontSize: text }} onPress={() => editComment(solve)} />
    <Btn variant="ghost" size={size} style={styles.action} disabled={busy} accessibilityLabel="Delete solve" icon={<IconTrash size={15} strokeWidth={2} color={t.danger} />} label={labels ? "Delete" : undefined} textStyle={{ fontSize: text, color: t.danger }} onPress={() => void deleteTime(solve.id)} />
  </View>;
}

/** The "Solve" dialog of a table row: the time, its date and comment, and the same actions centred. */
function SolveDetails({ details, onClose }: { details: { solve: SolveSummary; index: number } | null; onClose: () => void }) {
  const t = useTheme();
  const { optimistic } = useSolveMenu();
  const last = useRef(details);
  useEffect(() => { if (details) last.current = details; }, [details]);
  const shown = details ?? last.current;
  const pending = shown ? optimistic.get(shown.solve.id) : undefined;
  // A deleted solve closes its dialog.
  useEffect(() => { if (details && pending === null) onClose(); }, [details, pending, onClose]);
  const solve = shown && pending ? pending : shown?.solve;
  return <Sheet open={!!details} onClose={onClose} title="Solve" sub={shown ? `#${shown.index + 1}` : undefined}>
    {solve && <View style={styles.details}>
      <Text style={[mono(t, 44, "500"), { letterSpacing: -1 }, solve.penalty === "dnf" && { color: t.danger }]}>{fmtSolve(solve.time_ms, solve.penalty)}</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>{fmtDate(solve.created_at)}</Text>
      {solve.comment ? <Text style={{ color: t.text, fontSize: 14, textAlign: "center" }} selectable>{solve.comment}</Text> : null}
      <SolveActions solve={solve} labels />
    </View>}
  </Sheet>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 10 },
  statTile: { minWidth: 104, gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  compactRow: { flexDirection: "row" },
  compactCell: { flex: 1, minWidth: 0, gap: 4 },
  panel: { gap: 12, minHeight: 0, minWidth: 0, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  panelFlat: { paddingHorizontal: 0, paddingBottom: 0, paddingTop: 12, borderWidth: 0, borderTopWidth: 1, borderRadius: 0 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  legend: { flexDirection: "row", alignItems: "center", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontSize: 12, fontWeight: "600" },
  swatch: { width: 10, height: 3, borderRadius: 2 },
  toggle: { flexDirection: "row", gap: 2, padding: 2, borderWidth: 1, borderRadius: 9 },
  toggleItem: { height: 26, paddingHorizontal: 10, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  chartArea: { gap: 4 },
  chartRow: { flexDirection: "row", gap: 10 },
  axis: { width: 52, position: "relative" },
  axisText: { position: "absolute", right: 0, fontSize: 11, lineHeight: 14, fontFamily: FONT.mono },
  dates: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginLeft: 62 },
  dateText: { fontSize: 11, flexShrink: 1 },
  reset: { position: "absolute", right: 4, top: 4, height: 26, minHeight: 26, paddingHorizontal: 8 },
  selectionLabel: { position: "absolute", bottom: 4, alignSelf: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tip: { position: "absolute", top: 8, gap: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  tableTools: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  solvesHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6, borderBottomWidth: 1, marginHorizontal: -6, paddingLeft: 6 },
  headText: { fontSize: 12, fontWeight: "600" },
  solveRow: { borderBottomWidth: 1 },
  solveLine: { flexDirection: "row", alignItems: "center" },
  historyRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36, paddingHorizontal: 6, borderRadius: 8 },
  index: { width: 34, fontSize: 12 },
  time: { width: 72 },
  tags: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  tag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  tagText: { fontSize: 10, fontWeight: "700" },
  actions: { width: 150, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2 },
  action: { paddingHorizontal: 8 },
  comment: { fontSize: 13, lineHeight: 18, paddingLeft: 50, paddingRight: 6, paddingBottom: 8 },
  details: { alignItems: "center", gap: 10, paddingTop: 4 },
});
