import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { fmtDate, fmtTime } from "../../../src/client/lib/format";
import type { HistoryPoint } from "../../../src/shared/types";
import { FONT, useTheme } from "../theme";
import { IconComment } from "./icons";
import { Select } from "./Select";
import { SolveRow, useSolveMenu } from "./SolveMenus";
import { Btn, Empty, MiniBtn, Muted, Segmented, mono } from "./ui";

/**
 * The history of one selection, three ways: single times with the rolling ao5 per solve, the best
 * ao5 and ao12 per day, week or month, and a sortable table where comments are read and written.
 */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const span = max - min, raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => span / s <= count + 1) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

type View3 = "solves" | "time" | "table";
type Period = "day" | "week" | "month";
type Sort = "newest" | "oldest" | "fastest" | "slowest";
const PERIODS: { id: Period; label: string }[] = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }];
const SORTS: { value: Sort; label: string }[] = [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "fastest", label: "Fastest first" }, { value: "slowest", label: "Slowest first" }];
/** Rows shown before the table asks to load more; long playground histories stay light. */
const PAGE = 50;

interface Series { label: string; color: string; values: (number | null)[] }
interface Bucket { key: string; label: string; count: number; bestAo5: number | null; bestAo12: number | null }

const pad2 = (n: number) => String(n).padStart(2, "0");
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
/** The bucket a solve falls into, in local time, with the label shown on the axis and tooltip. */
function bucketOf(iso: string, period: Period): { key: string; label: string } {
  const d = new Date(iso);
  if (period === "month") return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }) };
  if (period === "week") {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return { key: `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`, label: `Week of ${shortDay(monday)}` };
  }
  return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, label: shortDay(d) };
}
/** Best rolling averages per period; a period without a full average leaves a gap in its line. */
function bucketHistory(history: HistoryPoint[], ao5: (number | null)[], ao12: (number | null)[], period: Period): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const min = (a: number | null, b: number | null) => a === null ? b : b === null ? a : Math.min(a, b);
  history.forEach((h, i) => {
    const { key, label } = bucketOf(h.at, period);
    const bucket = buckets.get(key) ?? { key, label, count: 0, bestAo5: null, bestAo12: null };
    bucket.count++; bucket.bestAo5 = min(bucket.bestAo5, ao5[i] ?? null); bucket.bestAo12 = min(bucket.bestAo12, ao12[i] ?? null);
    buckets.set(key, bucket);
  });
  return [...buckets.values()];
}

export function TimesChart({ history, ao5, ao12, height = 220 }: { history: HistoryPoint[]; ao5: (number | null)[]; ao12: (number | null)[]; height?: number }) {
  const t = useTheme();
  const [view, setView] = useState<View3>("solves");
  const [period, setPeriod] = useState<Period>("day");
  const buckets = useMemo(() => view === "time" ? bucketHistory(history, ao5, ao12, period) : [], [history, ao5, ao12, period, view]);
  // Stable series objects, so a crosshair move never rebuilds the scale or the paths.
  const solveSeries = useMemo<Series[]>(() => [{ label: "Single", color: t.accent, values: history.map(h => h.time) }, { label: "Ao5", color: t.series2, values: ao5 }], [history, ao5, t]);
  const timeSeries = useMemo<Series[]>(() => [{ label: "Best Ao5", color: t.accent, values: buckets.map(b => b.bestAo5) }, { label: "Best Ao12", color: t.series2, values: buckets.map(b => b.bestAo12) }], [buckets, t]);
  if (history.length === 0) return <Empty>No solves yet — train this case to start a history.</Empty>;
  return <View style={{ gap: 8 }}>
    <View style={styles.header}>
      <Segmented small options={[{ id: "solves", label: "Solves" }, { id: "time", label: "Time" }, { id: "table", label: "Table" }]} value={view} onChange={setView} />
      {view === "time" && <Segmented small options={PERIODS} value={period} onChange={setPeriod} />}
    </View>
    {view === "solves" && <LineChart height={height} count={history.length} first="1" last={String(history.length)}
      series={solveSeries}
      tooltip={i => { const h = history[i]; return <>
        <Text style={{ color: t.readableMuted, fontSize: 12 }}>#{i + 1} · {fmtDate(h.at)}</Text>
        <TipRow color={t.accent}>{h.time === null ? "DNF" : fmtTime(h.time)}{h.penalty === "+2" ? "+" : ""}</TipRow>
        {ao5[i] !== null && <TipRow color={t.series2}>Ao5 {fmtTime(ao5[i])}</TipRow>}
      </>; }} />}
    {view === "time" && <LineChart height={height} count={buckets.length} first={buckets[0]?.label ?? ""} last={buckets.length > 1 ? buckets.at(-1)!.label : ""}
      series={timeSeries}
      tooltip={i => { const b = buckets[i]; return <>
        <Text style={{ color: t.readableMuted, fontSize: 12 }}>{b.label} · {b.count} solve{b.count === 1 ? "" : "s"}</Text>
        <TipRow color={t.accent}>Ao5 {fmtTime(b.bestAo5)}</TipRow>
        <TipRow color={t.series2}>Ao12 {fmtTime(b.bestAo12)}</TipRow>
      </>; }} />}
    {view === "table" && <SolvesTable history={history} />}
  </View>;
}

function TipRow({ color, children }: { color: string; children: ReactNode }) {
  const t = useTheme();
  return <View style={styles.tipRow}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={{ color: t.text, fontSize: 12 }}>{children}</Text></View>;
}

/** Line chart with a hairline grid, one point per x index, a crosshair and a tooltip on touch. */
function LineChart({ series, count: n, first, last, height: H, tooltip }: { series: Series[]; count: number; first: string; last: string; height: number; tooltip: (index: number) => ReactNode }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 16, t: 12, b: 26 };
  const W = Math.max(200, width), iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = series.flatMap(s => s.values).filter((v): v is number => v !== null).map(v => v / 1000);
    if (!vals.length) return { yMin: 0, yMax: 1, ticks: [0, 1] };
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { lo = Math.max(0, lo - 0.5); hi = hi + 0.5; }
    const margin = (hi - lo) * 0.12;
    const ticks = niceTicks(Math.max(0, lo - margin), hi + margin);
    return { yMin: Math.min(ticks[0], lo - margin), yMax: Math.max(ticks.at(-1)!, hi + margin), ticks };
  }, [series]);
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (sec: number) => pad.t + ih - ((sec - yMin) / (yMax - yMin)) * ih;
  // Moving the crosshair only updates its tooltip; long histories are not rebuilt on every touch.
  const paths = useMemo(() => series.map(s => {
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v / 1000).toFixed(1)} `; pen = true; });
    return d;
  }), [series, W, H, yMin, yMax]);
  const lastIdx = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return i; return -1; };
  const onMove = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const tipLeft = hover !== null ? Math.min(x(hover) + 12, W - 170) : 0;
  return <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ position: "relative" }}>
    <View style={styles.legend}>{series.map(s => <View key={s.label} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: s.color }]} /><Text style={{ color: t.readableMuted, fontSize: 12, fontWeight: "500" }}>{s.label}</Text></View>)}</View>
    {n === 0 ? <Muted>Not enough solves for an average yet.</Muted> : width > 0 && <>
      <Svg width={W} height={H} onStartShouldSetResponder={() => true} onResponderGrant={onMove} onResponderMove={onMove} onResponderRelease={() => setHover(null)} onResponderTerminate={() => setHover(null)}>
        <G>{ticks.map(tick => <Line key={tick} x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke={t.line} strokeWidth={1} />)}</G>
        {ticks.map(tick => <SvgText key={tick} x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fill={t.muted} fontSize={10} fontFamily={FONT.mono}>{tick.toFixed(tick < 10 ? 1 : 0)}</SvgText>)}
        <SvgText x={pad.l} y={H - 8} fill={t.muted} fontSize={10} fontFamily={FONT.mono}>{first}</SvgText>
        {n > 1 && <SvgText x={W - pad.r} y={H - 8} textAnchor="end" fill={t.muted} fontSize={10} fontFamily={FONT.mono}>{last}</SvgText>}
        {series.map((s, k) => <Path key={s.label} d={paths[k]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />).reverse()}
        {series.map(s => { const li = lastIdx(s.values); return li < 0 ? null : <Circle key={s.label} cx={x(li)} cy={y(s.values[li]! / 1000)} r={3} fill={s.color} />; })}
        {hover !== null && <>
          <Line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={t.muted} strokeDasharray="3 3" />
          {series.map(s => s.values[hover] !== null && <Circle key={s.label} cx={x(hover)} cy={y(s.values[hover]! / 1000)} r={4} fill={s.color} />)}
        </>}
      </Svg>
      {hover !== null && <View pointerEvents="none" style={[styles.tooltip, { left: tipLeft, top: 8, backgroundColor: t.surface, borderColor: t.line }, t.shadow]}>{tooltip(hover)}</View>}
    </>}
  </View>;
}

/** Every solve of the selection, sorted as asked; a row shows its comment and lets you edit it. */
function SolvesTable({ history }: { history: HistoryPoint[] }) {
  const t = useTheme();
  const { editComment, busy } = useSolveMenu();
  const [sort, setSort] = useState<Sort>("newest");
  const [commented, setCommented] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => {
    const list = history.map((h, i) => ({ h, index: i + 1 })).filter(({ h }) => !commented || !!h.comment);
    const byTime = (a: HistoryPoint, b: HistoryPoint, direction: 1 | -1) => a.time === null ? (b.time === null ? 0 : 1) : b.time === null ? -1 : (a.time - b.time) * direction;
    if (sort === "newest") list.reverse();
    else if (sort === "fastest") list.sort((a, b) => byTime(a.h, b.h, 1) || b.index - a.index);
    else if (sort === "slowest") list.sort((a, b) => byTime(a.h, b.h, -1) || b.index - a.index);
    return list;
  }, [history, sort, commented]);
  const commentCount = useMemo(() => history.filter(h => h.comment).length, [history]);
  return <View style={{ gap: 6 }}>
    <View style={styles.tableBar}>
      <Select value={sort} accessibilityLabel="Sort solves" minWidth={170} options={SORTS} onChange={setSort} />
      <Btn small pressed={commented} icon={<IconComment size={14} color={commented ? t.accent : t.readableMuted} />} label="Commented" onPress={() => setCommented(v => !v)}>
        <Text style={[mono(t, 12), { color: t.readableMuted }]}>{commentCount}</Text>
      </Btn>
    </View>
    <View style={[styles.line, { borderBottomWidth: 1, borderBottomColor: t.line }]}>
      <Text style={[styles.th, { width: 48, color: t.readableMuted }]}>#</Text>
      <Text style={[styles.th, { width: 96, color: t.readableMuted }]}>Time</Text>
      <Text style={[styles.th, { flex: 1, color: t.readableMuted }]}>Date</Text>
      <View style={{ width: 36 }} />
    </View>
    {rows.length === 0 && <Empty><Muted>{commented ? "No commented solve yet. Long-press a time or tap its bubble to add one." : "No solves match."}</Muted></Empty>}
    {rows.slice(0, shown).map(({ h, index }) => {
      const solve = { id: h.id, time_ms: h.timeMs, penalty: h.penalty, created_at: h.at, comment: h.comment };
      return <SolveRow key={h.id} solve={solve} style={[styles.rowBlock, { borderBottomColor: t.line }]}>
        <View style={styles.line}>
          <Text style={[styles.td, { width: 48, color: t.readableMuted }]}>{index}</Text>
          <Text style={[styles.td, { width: 96 }, mono(t, 15), h.time === null && { color: t.danger }]}>{h.time === null ? "DNF" : fmtTime(h.time)}{h.penalty === "+2" ? "+" : ""}</Text>
          <Text style={[styles.td, { flex: 1, color: t.readableMuted }]} numberOfLines={1}>{fmtDate(h.at)}</Text>
          <MiniBtn accessibilityRole="button" accessibilityLabel={h.comment ? "Edit comment" : "Add comment"} disabled={busy} icon={<IconComment size={15} color={h.comment ? t.accent : t.readableMuted} />} onPress={() => editComment(solve)} />
        </View>
        {h.comment ? <Text style={[styles.comment, { color: t.text }]}>{h.comment}</Text> : null}
      </SolveRow>;
    })}
    {rows.length > shown && <Btn small variant="ghost" label={`Show more (${rows.length - shown} left)`} onPress={() => setShown(v => v + PAGE)} style={{ alignSelf: "center" }} />}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  legend: { flexDirection: "row", gap: 14, marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
  tooltip: { position: "absolute", zIndex: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 2 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tableBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  line: { flexDirection: "row", alignItems: "center" },
  rowBlock: { borderBottomWidth: 1, borderRadius: 8 },
  th: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, fontWeight: "600" },
  td: { paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, fontWeight: "500" },
  comment: { fontSize: 13, lineHeight: 18, paddingHorizontal: 10, paddingBottom: 9, marginTop: -4 },
});
