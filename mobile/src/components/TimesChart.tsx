import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { fmtDate, fmtTime } from "../../../src/client/lib/format";
import type { HistoryPoint } from "../../../src/shared/types";
import { FONT, useTheme } from "../theme";
import { Btn, Empty, mono } from "./ui";

/**
 * Time evolution for one case: single times (series 1) and rolling ao5 (series 2).
 * Line chart, hairline grid, crosshair + tooltip on touch, table view toggle.
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

export function TimesChart({ history, ao5, height = 220 }: { history: HistoryPoint[]; ao5: (number | null)[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const pad = { l: 44, r: 16, t: 12, b: 26 };
  const W = Math.max(200, width), H = height, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, n = history.length;
  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = [...history.map(h => h.time), ...ao5].filter((v): v is number => v !== null).map(v => v / 1000);
    if (!vals.length) return { yMin: 0, yMax: 1, ticks: [0, 1] };
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { lo = Math.max(0, lo - 0.5); hi = hi + 0.5; }
    const margin = (hi - lo) * 0.12;
    const ticks = niceTicks(Math.max(0, lo - margin), hi + margin);
    return { yMin: Math.min(ticks[0], lo - margin), yMax: Math.max(ticks.at(-1)!, hi + margin), ticks };
  }, [history, ao5]);
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (sec: number) => pad.t + ih - ((sec - yMin) / (yMax - yMin)) * ih;
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v / 1000).toFixed(1)} `; pen = true; });
    return d;
  };
  const singles = history.map(h => h.time);
  const lastIdx = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return i; return -1; };
  // Moving the crosshair only updates its tooltip; long histories are not rebuilt on every touch.
  const paths = useMemo(() => ({ ao5: path(ao5), singles: path(singles) }), [history, ao5, W, H, yMin, yMax]);
  if (n === 0) return <Empty>No solves yet — train this case to start a history.</Empty>;
  const onMove = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hp = hover !== null ? history[hover] : null;
  const tipLeft = hover !== null ? Math.min(x(hover) + 12, W - 170) : 0;
  const series = [{ label: "Single", color: t.accent }, { label: "Ao5", color: t.series2 }];
  return <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ position: "relative" }}>
    <View style={styles.header}>
      <View style={styles.legend}>{series.map(s => <View key={s.label} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: s.color }]} /><Text style={{ color: t.readableMuted, fontSize: 12, fontWeight: "500" }}>{s.label}</Text></View>)}</View>
      <Btn variant="ghost" small label={table ? "Chart" : "Table"} onPress={() => setTable(v => !v)} />
    </View>
    {table ? <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
      <Row cells={["#", "Time", "Ao5", "Best", "Date"]} header />
      {history.map((h, i) => <Row key={h.id} cells={[String(i + 1), h.time === null ? "DNF" : fmtTime(h.time), fmtTime(ao5[i]), fmtTime(h.best), fmtDate(h.at)]} monoCells={[1, 2, 3]} mutedCells={[4]} />)}
    </ScrollView> : width > 0 && <>
      <Svg width={W} height={H} onStartShouldSetResponder={() => true} onResponderGrant={onMove} onResponderMove={onMove} onResponderRelease={() => setHover(null)} onResponderTerminate={() => setHover(null)}>
        <G>{ticks.map(tick => <Line key={tick} x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke={t.line} strokeWidth={1} />)}</G>
        {ticks.map(tick => <SvgText key={tick} x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fill={t.muted} fontSize={10} fontFamily={FONT.mono}>{tick.toFixed(tick < 10 ? 1 : 0)}</SvgText>)}
        <SvgText x={pad.l} y={H - 8} fill={t.muted} fontSize={10} fontFamily={FONT.mono}>1</SvgText>
        {n > 1 && <SvgText x={W - pad.r} y={H - 8} textAnchor="end" fill={t.muted} fontSize={10} fontFamily={FONT.mono}>{n}</SvgText>}
        <Path d={paths.ao5} fill="none" stroke={t.series2} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Path d={paths.singles} fill="none" stroke={t.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {([[singles, t.accent], [ao5, t.series2]] as const).map(([vals, color], k) => { const li = lastIdx(vals); return li < 0 ? null : <Circle key={k} cx={x(li)} cy={y(vals[li]! / 1000)} r={3} fill={color} />; })}
        {hover !== null && <>
          <Line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={t.muted} strokeDasharray="3 3" />
          {singles[hover] !== null && <Circle cx={x(hover)} cy={y(singles[hover]! / 1000)} r={4} fill={t.accent} />}
          {ao5[hover] !== null && <Circle cx={x(hover)} cy={y(ao5[hover]! / 1000)} r={4} fill={t.series2} />}
        </>}
      </Svg>
      {hp && <View pointerEvents="none" style={[styles.tooltip, { left: tipLeft, top: 8, backgroundColor: t.surface, borderColor: t.line }, t.shadow]}>
        <Text style={{ color: t.readableMuted, fontSize: 12 }}>#{hover! + 1} · {fmtDate(hp.at)}</Text>
        <View style={styles.tipRow}><View style={[styles.dot, { backgroundColor: t.accent }]} /><Text style={{ color: t.text, fontSize: 12 }}>{hp.time === null ? "DNF" : fmtTime(hp.time)}{hp.penalty === "+2" ? "+" : ""}</Text></View>
        {ao5[hover!] !== null && <View style={styles.tipRow}><View style={[styles.dot, { backgroundColor: t.series2 }]} /><Text style={{ color: t.text, fontSize: 12 }}>Ao5 {fmtTime(ao5[hover!])}</Text></View>}
      </View>}
    </>}
  </View>;
}

function Row({ cells, header, monoCells = [], mutedCells = [] }: { cells: string[]; header?: boolean; monoCells?: number[]; mutedCells?: number[] }) {
  const t = useTheme();
  return <View style={[styles.row, { borderBottomColor: t.line }]}>
    {cells.map((cell, i) => <Text key={i} numberOfLines={1} style={[{ flex: i === 4 ? 1.6 : 1, paddingHorizontal: 10, paddingVertical: header ? 8 : 9, fontSize: header ? 12 : 14, fontWeight: header ? "600" : "500", color: header || mutedCells.includes(i) ? t.readableMuted : t.text }, monoCells.includes(i) && !header && mono(t, 14)]}>{cell}</Text>)}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  legend: { flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
  tooltip: { position: "absolute", zIndex: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 2 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1 },
});
