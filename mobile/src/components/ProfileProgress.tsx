import { useSetAtom } from "jotai";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtDate, fmtTime } from "../../../src/client/lib/format";
import type { CaseDto, CaseHistoryDto, ProfileDto, SetDto } from "../../../src/shared/types";
import { puzzleAtom, routeAtom, selectedCaseIdsAtom } from "../state";
import { puzzleOf } from "../../../src/shared/puzzles";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { shortId } from "../lib/caseState";
import { CaseDiagram } from "./CaseDiagram";
import { IconBack, IconClose, IconTimer } from "./icons";
import { SolveRow } from "./SolveMenus";
import { TimesChart } from "./TimesChart";
import { Btn, Caption, Empty, H1, Input, Kpi, Muted, Segmented, mono } from "./ui";

export function ProfileStats({ data }: { data: CaseHistoryDto }) {
  const t = useTheme();
  const metrics: [string, number | null][] = [["Best", data.summary.best], ["Mean", data.summary.mean], ["Ao5", data.summary.ao5], ["Ao12", data.summary.ao12], ["Best Ao5", data.summary.bestAo5], ["Best Ao12", data.summary.bestAo12]];
  const recent = data.history.slice(-20).reverse();
  return <>
    <View style={styles.kpiRow}>{metrics.map(([label, value]) => <Kpi key={label} label={label} value={fmtTime(value)} />)}</View>
    <TimesChart history={data.history} ao5={data.ao5} height={240} />
    <View style={styles.sectionHeading}><Text style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>Recent times</Text><Muted>{data.summary.count} solves</Muted></View>
    <View style={{ maxWidth: 520 }}>
      <View style={[styles.tr, { borderBottomColor: t.line }]}><Th width={44}>#</Th><Th width={110}>Time</Th><Th>Date</Th></View>
      {recent.map((s, i) => <SolveRow key={s.id} solve={{ id: s.id, time_ms: s.timeMs, penalty: s.penalty, created_at: s.at, comment: s.comment }} style={[styles.tr, { borderBottomColor: t.line }]}>
        <Text style={[styles.td, { width: 44, color: t.readableMuted }]}>{data.history.length - i}</Text>
        <Text style={[styles.td, { width: 110 }, mono(t, 15), s.time === null && { color: t.danger }]}>{s.time === null ? "DNF" : fmtTime(s.time)}{s.penalty === "+2" ? "+" : ""}</Text>
        <Text style={[styles.td, { color: t.readableMuted, flex: 1 }]} numberOfLines={1}>{fmtDate(s.at)}{s.comment ? ` · ${s.comment}` : ""}</Text>
      </SolveRow>)}
    </View>
  </>;
}
function Th({ children, width }: { children: string; width?: number }) {
  const t = useTheme();
  return <Text style={[styles.th, { color: t.readableMuted, width, flex: width ? undefined : 1 }]}>{children}</Text>;
}

const CaseTile = memo(function CaseTile({ c, stats, onOpen }: { c: CaseDto; stats?: CaseHistoryDto; onOpen: (id: string) => void }) {
  const t = useTheme();
  const trained = !!stats?.summary.count;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${c.id}, ${trained ? `${stats!.summary.count} solves` : "not trained"}`} onPress={() => onOpen(c.id)}
    style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? t.hover : "transparent", opacity: trained ? 1 : 0.5 }]}>
    <CaseDiagram c={c} size={72} grey={!trained} />
    <Text style={{ color: t.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{shortId(c)}</Text>
    <Text style={[mono(t, 12), { color: t.accent }]}>{trained ? fmtTime(stats!.summary.best) : "—"}</Text>
  </Pressable>;
});

export function ProfileCaseGallery({ cases, sets, profile, onOpen, phone, header, scrollKey }: { cases: CaseDto[]; sets: SetDto[]; profile: ProfileDto; onOpen: (id: string) => void; phone: boolean; header?: ReactNode; scrollKey: string }) {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const byCase = useMemo(() => new Map(profile.cases.map(c => [c.summary.caseId, c])), [profile.cases]);
  const q = query.trim().toLowerCase();
  const { width, pagePadding, navSpace } = useLayout();
  const columns = Math.max(2, Math.floor((Math.min(width, 1100) - pagePadding * 2) / 92));
  type Row = { key: string } & ({ kind: "set"; set: SetDto; cases: CaseDto[] } | { kind: "cases"; cases: CaseDto[] });
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const set of sets) {
      const list = cases.filter(c => c.set === set.id && (stage === "all" || c.stage === stage) && (!q || `${c.id} ${c.name} ${c.group} ${set.label}`.toLowerCase().includes(q)));
      if (!list.length) continue;
      result.push({ key: set.id, kind: "set", set, cases: list });
      if (!closed[set.id]) for (let i = 0; i < list.length; i += columns)
        result.push({ key: `${set.id}:${i}`, kind: "cases", cases: list.slice(i, i + columns) });
    }
    return result;
  }, [sets, cases, stage, q, closed, columns]);
  const key = `${scrollKey}:${columns}`;
  const scroll = usePreservedList<Row>(key);
  const previousFilter = useRef(`${stage}:${q}`);
  useEffect(() => {
    const filter = `${stage}:${q}`;
    if (filter !== previousFilter.current) scroll.ref.current?.scrollToOffset({ offset: 0, animated: false });
    previousFilter.current = filter;
  }, [stage, q]);
  return <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
    initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} scrollEventThrottle={64}
    style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: navSpace }} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{ gap: 16, marginBottom: 10 }}>{header}<View style={styles.toolbar}>
      <Segmented options={["all", ...new Set(sets.map(s => s.stage))].map(value => ({ id: value, label: value === "all" ? "All" : value }))} value={stage} onChange={setStage} />
      <Input accessibilityLabel="Search cases" placeholder="Search…" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={{ width: phone ? "100%" : 200 }} />
      <Muted>{profile.cases.length} / {cases.length} trained</Muted>
    </View></View>}
    ListEmptyComponent={<Empty>No cases match.</Empty>}
    renderItem={({ item: row }) => row.kind === "set" ? <Pressable accessibilityState={{ expanded: !closed[row.set.id] }} onPress={() => setClosed({ ...closed, [row.set.id]: !closed[row.set.id] })} style={styles.summary}>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{row.set.label}</Text>
      <Text style={[mono(t, 12), { color: t.readableMuted }]}>{row.cases.filter(c => byCase.has(c.id)).length} / {row.cases.length}</Text>
    </Pressable> : <View style={styles.grid}>{row.cases.map(c => <CaseTile key={c.id} c={c} stats={byCase.get(c.id)} onOpen={onOpen} />)}</View>} />;
}

export function ProfileCaseDetails({ c, data, phone, onClose }: { c: CaseDto; data?: CaseHistoryDto; phone: boolean; onClose: () => void }) {
  const t = useTheme();
  const scroll = usePreservedScroll(`profile-case:${c.id}`);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const setPuzzle = useSetAtom(puzzleAtom);
  const setRoute = useSetAtom(routeAtom);
  return <>
    <View style={styles.topline}>
      {phone ? <Btn variant="ghost" icon={<IconBack size={16} color={t.text2} />} label="All cases" onPress={onClose} /> : <Caption>Case statistics</Caption>}
      {!phone && <Btn variant="ghost" iconOnly icon={<IconClose size={16} color={t.readableMuted} />} accessibilityLabel="Close" onPress={onClose} />}
    </View>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
      <View style={styles.detailHeading}>
        <CaseDiagram c={c} size={96} />
        <View style={{ flex: 1, minWidth: 120 }}><H1 size={24}>{c.id}</H1><Muted>{c.name !== c.id ? c.name : c.group} · {data?.summary.count ?? 0} solves</Muted></View>
        <Btn icon={<IconTimer size={16} color={t.text} />} label="Train" onPress={() => { setPuzzle(puzzleOf(c)); setSelection([c.id]); setRoute({ page: "training" }); }} />
      </View>
      {data?.summary.count ? <ProfileStats key={c.id} data={data} /> : <Empty>Not trained yet.</Empty>}
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 8 },
  tr: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  th: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, fontWeight: "600" },
  td: { paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, fontWeight: "500" },
  tile: { width: "24%", minWidth: 88, flexGrow: 1, alignItems: "center", gap: 2, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14 },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 38, paddingVertical: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingBottom: 10 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  detailHeading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
});
