import { useSetAtom } from "jotai";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { averageOf, best, fmtTime } from "../../../src/client/lib/format";
import { puzzleOf } from "../../../src/shared/puzzles";
import type { CaseDto, CaseHistoryDto, ProfileDto, SetDto } from "../../../src/shared/types";
import { puzzleAtom, routeAtom, selectedCaseIdsAtom } from "../state";
import { mix, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { shortId } from "../lib/caseState";
import { CaseDiagram } from "./CaseDiagram";
import { IconChevronDown, IconNext, IconTimer } from "./icons";
import { Sheet, SheetScrollView } from "./Sheet";
import { TimerStats } from "./TimesChart";
import { Btn, Empty, Input, Label, ProgressBar, Segmented, mono } from "./ui";

/**
 * The account pages' building blocks, after the web app (desktop/renderer/main.tsx): the overview cards
 * (`Activity` heatmap, `Sparkline`, `Ring`, `MiniBars`, `OverviewCard`), the training progress grid of cases
 * (`TrainingProgress`) and the statistics dialog of one case (`ProfileCaseDialog`).
 */

export const plural = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** `.ov-card` (`Go` when pressable): a raised card with a title row and a chevron when it opens a page. */
export function OverviewCard({ title, detail, onPress, accessibilityLabel, children, gap }: { title?: string; detail?: string; onPress?: () => void; accessibilityLabel?: string; children: ReactNode; gap?: number }) {
  const t = useTheme();
  const { short } = useLayout();
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={accessibilityLabel}
    style={({ pressed }) => [styles.card, short && styles.cardShort, gap !== undefined && { gap }, { backgroundColor: t.raised, borderColor: pressed ? t.lineStrong : t.line }]}>
    {title !== undefined && <View style={styles.cardHead}>
      <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text>
      {detail ? <Text numberOfLines={1} style={[styles.cardDetail, { color: t.muted }]}>{detail}</Text> : null}
      {onPress && <View style={styles.chevron}><IconNext size={14} color={t.muted} /></View>}
    </View>}
    {children}
  </Pressable>;
}

/** `.ring`: a track and an accent arc, the percentage in the middle. */
export function Ring({ ratio, size = 58, stroke = 5 }: { ratio: number; size?: number; stroke?: number }) {
  const t = useTheme();
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.surface2} strokeWidth={stroke} />
      {ratio > 0 && <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.accent} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - clamp01(ratio))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </Svg>
    <View style={[StyleSheet.absoluteFill, styles.center]}><Text style={[mono(t, 11.5), { color: t.text }]}>{Math.round(clamp01(ratio) * 100)}%</Text></View>
  </View>;
}

/** `.mini-bars`: label, bar and value per row, the columns aligned like the web grid. */
export function MiniBars({ rows }: { rows: { label: string; value: string; ratio: number; done?: boolean }[] }) {
  const t = useTheme();
  const { short } = useLayout();
  if (!rows.length) return null;
  const gap = short ? 7 : 9;
  return <View style={styles.bars}>
    <View style={{ gap, maxWidth: "50%" }}>{rows.map(r => <Text key={r.label} numberOfLines={1} style={[styles.barCell, { color: t.secondary, fontSize: 12 }]}>{r.label}</Text>)}</View>
    <View style={{ gap, flex: 1, minWidth: 40 }}>{rows.map(r => <View key={r.label} style={[styles.barCell, { justifyContent: "center" }]}><ProgressBar value={r.ratio} unlocked={r.done ?? true} /></View>)}</View>
    <View style={{ gap, alignItems: "flex-end" }}>{rows.map(r => <Text key={r.label} style={[styles.barCell, mono(t, 11, "400"), { color: t.muted }]}>{r.value}</Text>)}</View>
  </View>;
}

/** `.sparkline`: the latest 40 timed solves as an area line; the best (hollow) and last dots stand out. */
export function Sparkline({ values, height = 96 }: { values: (number | null)[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const points = values.filter((v): v is number => v != null).slice(-40);
  if (points.length < 2) return null;
  const low = Math.min(...points), high = Math.max(low + 1, Math.max(...points));
  const pad = 5, w = Math.max(0, width - pad * 2), h = height - 8;
  const x = (i: number) => pad + (i / (points.length - 1)) * w;
  const y = (v: number) => 4 + (4 + (1 - (v - low) / (high - low)) * 26) / 32 * h;
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const bestIndex = points.indexOf(low), last = points.length - 1;
  return <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {width > 0 && <Svg width={width} height={height}>
      <Path d={`${line} L${x(last)} ${height} L${x(0)} ${height} Z`} fill={t.accent} fillOpacity={0.07} />
      <Path d={line} fill="none" stroke={t.accent} strokeWidth={1.5} strokeLinejoin="round" />
      {bestIndex !== last && <Circle cx={x(bestIndex)} cy={y(points[bestIndex])} r={4} fill={t.raised} stroke={t.accent} strokeWidth={2} />}
      <Circle cx={x(last)} cy={y(points[last])} r={5} fill={t.accent} stroke={t.raised} strokeWidth={2} />
    </Svg>}
  </View>;
}

const HEAT_GAP = 3, HEAT_LABEL = 28, MONTH_ROW = 14;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export type ActivitySolve = { at: string; time: number | null; timer: boolean };
/** Best rolling average of `size` over a day's timer solves, in order. */
const bestAverage = (times: (number | null)[], size: number) => best(times.slice(size - 1).map((_, i) => averageOf(times.slice(i, i + size))));

/**
 * `Activity`: GitHub-style solves per day, one column per week (Monday on top), as many weeks as fit.
 * Tapping a day shows its solves and best times.
 */
export const Activity = memo(function Activity({ solves, summary, detail }: { solves: ActivitySolve[]; summary: { label: string; value: string }[]; detail: string }) {
  const t = useTheme();
  const { height: windowHeight } = useLayout();
  const [avail, setAvail] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const weeks = avail ? Math.max(1, Math.min(53, Math.floor((avail - HEAT_LABEL - HEAT_GAP + HEAT_GAP) / (9 + HEAT_GAP)))) : 0;
  const cell = weeks ? Math.max(9, Math.min(windowHeight <= 640 ? 10 : windowHeight < 800 ? 12 : 17, Math.floor((avail - HEAT_LABEL) / weeks - HEAT_GAP))) : 9;
  const days = useMemo(() => {
    const map = new Map<string, { count: number; times: (number | null)[] }>();
    for (const solve of solves) {
      const key = dayKey(new Date(solve.at)), day = map.get(key) ?? { count: 0, times: [] };
      day.count++;
      if (solve.timer) day.times.push(solve.time);
      map.set(key, day);
    }
    return map;
  }, [solves]);
  const { cells, months, peak } = useMemo(() => {
    const today = new Date(), end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end);
    start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7);
    const cells: { key: string; date: Date; count: number; future: boolean }[] = [];
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
    return { cells, months, peak: Math.max(1, ...[...days.values()].map(d => d.count)) };
  }, [days, weeks]);
  useEffect(() => { setPicked(null); }, [weeks, solves]);
  const heat = (ratio: number) => mix(t.accent, 30 + Math.round(ratio * 70), t.surface2);
  const shown = cells.reduce((sum, c) => sum + c.count, 0);
  const step = cell + HEAT_GAP;
  const gridHeight = MONTH_ROW + HEAT_GAP + 7 * step - HEAT_GAP;
  const width = HEAT_LABEL + weeks * step;
  const onPress = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const week = Math.floor((locationX - HEAT_LABEL - HEAT_GAP) / step), day = Math.floor((locationY - MONTH_ROW - HEAT_GAP) / step);
    const i = week * 7 + day;
    if (week < 0 || week >= weeks || day < 0 || day > 6 || cells[i]?.future) { setPicked(null); return; }
    setPicked(current => current === i ? null : i);
  };
  const hovered = picked !== null ? cells[picked] : null;
  const times = (hovered && days.get(hovered.key)?.times) ?? [];
  const tipLeft = picked !== null ? Math.max(0, Math.min(width - 150, HEAT_LABEL + HEAT_GAP + Math.floor(picked / 7) * step + cell / 2 - 75)) : 0;
  const tipBottom = picked !== null ? gridHeight - (MONTH_ROW + HEAT_GAP + (picked % 7) * step) + 6 : 0;
  return <View onLayout={e => setAvail(Math.floor(e.nativeEvent.layout.width))} accessibilityLabel="Activity">
    {weeks > 0 && <View style={[styles.activity, { width: Math.min(avail, Math.max(width, 0)) }]}>
      <View style={styles.activityHead}>
        <Text style={[styles.activityTitle, { color: t.text }]}>{plural(shown, "solve")} in the last {weeks >= 52 ? "year" : plural(weeks, "week")}</Text>
        <View style={styles.activitySummary}>{summary.map(m => <Text key={m.label} style={{ fontSize: 13, color: t.muted }}>
          <Text style={[mono(t, 13, "600")]}>{m.value}</Text> {m.label}
        </Text>)}</View>
      </View>
      <Pressable onPress={onPress} accessibilityRole="image" accessibilityLabel={`Solves per day over the last ${weeks} weeks`} style={{ width, height: gridHeight }}>
        {months.map(m => <Text key={m.week} style={[styles.heatLabel, { color: t.muted, left: HEAT_LABEL + HEAT_GAP + m.week * step, top: 0 }]}>{m.label}</Text>)}
        {["Mon", "Wed", "Fri"].map((d, i) => <Text key={d} style={[styles.heatLabel, { color: t.muted, left: 0, top: MONTH_ROW + HEAT_GAP + i * 2 * step + (cell - 12) / 2 }]}>{d}</Text>)}
        <View style={[styles.weeks, { left: HEAT_LABEL + HEAT_GAP, top: MONTH_ROW + HEAT_GAP, gap: HEAT_GAP }]} pointerEvents="none">
          {Array.from({ length: weeks }, (_, w) => <View key={w} style={{ gap: HEAT_GAP }}>
            {cells.slice(w * 7, w * 7 + 7).map((c, d) => <View key={c.key} style={{ width: cell, height: cell, borderRadius: 3, backgroundColor: c.count ? heat(c.count / peak) : t.surface2, opacity: c.future ? 0.25 : 1, borderWidth: picked === w * 7 + d ? 1 : 0, borderColor: t.text }} />)}
          </View>)}
        </View>
        {hovered && <View pointerEvents="none" style={[styles.heatTip, { left: tipLeft, bottom: tipBottom, backgroundColor: t.surface2, borderColor: t.line }, t.menuShadow]}>
          <Text style={{ color: t.muted, fontSize: 12 }}>{hovered.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</Text>
          <Text style={{ color: t.text, fontSize: 14, fontWeight: "600", marginBottom: 2 }}>{plural(hovered.count, "solve")}</Text>
          {([["Best", best(times)], ["Best Ao5", bestAverage(times, 5)], ["Best Ao12", bestAverage(times, 12)]] as const).map(([label, value]) => <View key={label} style={styles.tipRow}>
            <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text><Text style={[mono(t, 12)]}>{fmtTime(value)}</Text>
          </View>)}
        </View>}
      </Pressable>
      <View style={styles.activityFoot}>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12, flexShrink: 1 }}>{detail}</Text>
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: t.muted }]}>Less</Text>
          {[0, 0.25, 0.5, 0.75, 1].map(r => <View key={r} style={{ width: cell, height: cell, borderRadius: 3, backgroundColor: r ? heat(r) : t.surface2 }} />)}
          <Text style={[styles.legendText, { color: t.muted }]}>More</Text>
        </View>
      </View>
    </View>}
  </View>;
});

/** `.profile-tile`: diagram, short name and best time; untrained cases are faded. */
const CaseTile = memo(function CaseTile({ c, stats, width, onOpen }: { c: CaseDto; stats?: CaseHistoryDto; width: number; onOpen: (id: string) => void }) {
  const t = useTheme();
  const trained = !!stats?.summary.count;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${c.id}, ${trained ? `best ${fmtTime(stats!.summary.best)}, ${stats!.summary.count} solves` : "not trained"}`} onPress={() => onOpen(c.id)}
    style={({ pressed }) => [styles.tile, { width, backgroundColor: pressed ? t.surface2 : t.raised, borderColor: t.line, opacity: trained ? 1 : 0.5 }]}>
    <CaseDiagram c={c} size={72} />
    <Text numberOfLines={1} style={{ color: t.text, fontSize: 12.5, fontWeight: "600" }}>{shortId(c)}</Text>
    <Text numberOfLines={1} style={[mono(t, 11.5), { color: t.secondary }]}>{trained ? fmtTime(stats!.summary.best) : "—"}</Text>
  </Pressable>;
});

const matches = (c: CaseDto, setLabel: string, q: string) => {
  const text = [c.id, c.name, setLabel, c.stage, c.group].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every(word => text.includes(word));
};

/**
 * `TrainingProgress`: stage tabs, a search and the trained / learned counts, then each set as a collapsible
 * grid of case tiles. A tile opens the case statistics.
 */
export function TrainingProgress({ cases, sets, profile, learned, onOpen, scrollKey }: { cases: CaseDto[]; sets: SetDto[]; profile: ProfileDto; learned: ReadonlySet<string>; onOpen: (id: string) => void; scrollKey: string }) {
  const t = useTheme();
  const { width, pagePadding, navSpace } = useLayout();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const byCase = useMemo(() => new Map(profile.cases.map(c => [c.summary.caseId, c])), [profile.cases]);
  const inner = Math.min(width, 1100) - pagePadding * 2;
  const columns = Math.max(2, Math.floor((inner + 8) / 100));
  const tileWidth = Math.floor((inner - 8 * (columns - 1)) / columns);
  const q = query.trim();
  type Row = { key: string } & ({ kind: "set"; set: SetDto; trained: number; count: number; open: boolean } | { kind: "cases"; cases: CaseDto[] });
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const set of sets) {
      const chosen = cases.filter(c => c.set === set.id && (stage === "all" || c.stage === stage) && (!q || matches(c, set.label, q)));
      if (!chosen.length) continue;
      const open = !closed[set.id];
      result.push({ key: set.id, kind: "set", set, trained: chosen.filter(c => byCase.has(c.id)).length, count: chosen.length, open });
      if (open) for (let i = 0; i < chosen.length; i += columns) result.push({ key: `${set.id}:${i}`, kind: "cases", cases: chosen.slice(i, i + columns) });
    }
    return result;
  }, [sets, cases, stage, q, closed, columns, byCase]);
  const key = `${scrollKey}:${columns}`;
  const scroll = usePreservedList<Row>(key);
  const previousFilter = useRef(`${stage}:${q}`);
  useEffect(() => {
    const filter = `${stage}:${q}`;
    if (filter !== previousFilter.current) scroll.ref.current?.scrollToOffset({ offset: 0, animated: false });
    previousFilter.current = filter;
  }, [stage, q]);
  const learnedCount = cases.filter(c => learned.has(c.id)).length;
  const stages = ["all", ...new Set(cases.map(c => c.stage))];
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={[styles.toolbar, { paddingHorizontal: pagePadding }]}>
      <Segmented plain scroll options={stages.map(value => ({ id: value, label: value === "all" ? "All" : value }))} value={stage} onChange={setStage} />
      <View style={styles.searchRow}>
        <Input accessibilityLabel="Search cases" placeholder="Search cases…" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.search} />
        <Text numberOfLines={2} style={{ color: t.muted, fontSize: 12, flexShrink: 1 }}>{profile.cases.length} / {cases.length} trained · {learnedCount} learned</Text>
      </View>
    </View>
    <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
      style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: pagePadding, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Empty>No cases match.</Empty>}
      renderItem={({ item: row }) => row.kind === "set"
        ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: row.open }} onPress={() => setClosed({ ...closed, [row.set.id]: row.open })} style={({ pressed }) => [styles.setTitle, pressed && { backgroundColor: t.hover }]}>
          <View style={{ transform: [{ rotate: row.open ? "0deg" : "-90deg" }] }}><IconChevronDown size={12} color={t.text} /></View>
          <Text style={{ color: t.text, fontSize: 13.5, fontWeight: "600" }}>{row.set.label}</Text>
          <Text style={[mono(t, 11.5), { color: t.muted }]}>{row.trained} / {row.count}</Text>
        </Pressable>
        : <View style={styles.grid}>{row.cases.map(c => <CaseTile key={c.id} c={c} stats={byCase.get(c.id)} width={tileWidth} onOpen={onOpen} />)}</View>} />
  </View>;
}

/** The statistics of one case in a dialog (web `profileCase` overlay), with a shortcut to train it. */
export function ProfileCaseDialog({ c, data, onClose }: { c: CaseDto | undefined; data?: CaseHistoryDto; onClose: () => void }) {
  const t = useTheme();
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const setPuzzle = useSetAtom(puzzleAtom);
  const setRoute = useSetAtom(routeAtom);
  // The dialog keeps showing its case while it fades out.
  const last = useRef(c);
  if (c) last.current = c;
  const shown = c ?? last.current;
  const train = () => { if (!shown) return; setPuzzle(puzzleOf(shown)); setSelection([shown.id]); setRoute({ page: "training" }); };
  return <Sheet open={!!c} onClose={onClose} title={shown?.id ?? "Case"} wide
    actions={shown && <Btn small variant="ghost" icon={IconTimer} label="Train" onPress={train} />}>
    {shown && <SheetScrollView contentContainerStyle={{ gap: 14 }}>
      <View style={styles.caseHead}>
        <CaseDiagram c={shown} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>{shown.name !== shown.id ? shown.name : shown.group}</Text>
          <Label>{plural(data?.summary.count ?? 0, "solve")}</Label>
        </View>
      </View>
      <TimerStats compact data={data} empty="No attempts on this case yet." />
    </SheetScrollView>}
  </Sheet>;
}

const styles = StyleSheet.create({
  card: { gap: 16, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1 },
  cardShort: { gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  cardHead: { flexDirection: "row", alignItems: "baseline", gap: 10, minWidth: 0 },
  cardTitle: { fontSize: 13, fontWeight: "600", flexShrink: 0 },
  cardDetail: { fontSize: 12, flexShrink: 1, minWidth: 0 },
  chevron: { marginLeft: "auto", alignSelf: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", gap: 12 },
  barCell: { height: 18, lineHeight: 18 },
  activity: { gap: 10, maxWidth: "100%" },
  activityHead: { gap: 4 },
  activityTitle: { fontSize: 13, fontWeight: "600" },
  activitySummary: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 },
  heatLabel: { position: "absolute", fontSize: 11, lineHeight: 12 },
  weeks: { position: "absolute", flexDirection: "row" },
  heatTip: { position: "absolute", width: 150, gap: 2, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  tipRow: { flexDirection: "row", justifyContent: "space-between", gap: 14 },
  activityFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  legend: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendText: { fontSize: 11, marginHorizontal: 4 },
  toolbar: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: { flex: 1, minWidth: 160, maxWidth: 300, minHeight: 32, height: 32, paddingVertical: 0 },
  setTitle: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 4, borderRadius: 8, marginTop: 4, marginBottom: 4 },
  grid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tile: { alignItems: "center", gap: 2, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1 },
  caseHead: { flexDirection: "row", alignItems: "center", gap: 12 },
});
