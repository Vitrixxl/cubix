import { groupCases, toggleSelection } from "../../../src/client/lib/practiceCatalog";
import { useSetAtom } from "jotai";
import { memo, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { CaseDto, SetDto } from "../../../src/shared/types";
import { routeAtom } from "../state";
import { useTheme } from "../theme";
import { usePreservedList } from "../hooks/usePreservedList";
import { useLayout } from "../hooks/useLayout";
import { shortId } from "../lib/caseState";
import { CaseDiagram } from "./CaseDiagram";
import { IconCheck, IconMinus } from "./icons";
import { Caption, Input, MiniBtn, Muted } from "./ui";

const selectorExpansion = new Map<string, Record<string, boolean>>();

function Checkbox({ state }: { state: "on" | "off" | "partial" }) {
  const t = useTheme();
  const on = state !== "off";
  return <View style={[styles.checkbox, { backgroundColor: on ? t.accent : t.surface2, borderColor: on ? t.accent : t.surface3 }]}>
    {state === "on" ? <IconCheck size={12} color="#fff" /> : state === "partial" ? <IconMinus size={12} color="#fff" /> : null}
  </View>;
}

export const CaseSelector = memo(function CaseSelector({ cases, sets, selected, onChange, defaultExpanded = false, onOpenCase }: { cases: CaseDto[]; sets: SetDto[]; selected: string[]; onChange: (ids: string[]) => void; defaultExpanded?: boolean; onOpenCase?: () => void }) {
  const t = useTheme();
  const { navSpace } = useLayout();
  const [query, setQuery] = useState("");
  const selectorKey = sets.map(s => s.id).join(":");
  const [open, setOpen] = useState<Record<string, boolean>>(() => selectorExpansion.get(selectorKey) ?? {});
  useEffect(() => { selectorExpansion.set(selectorKey, open); }, [selectorKey, open]);
  const setRoute = useSetAtom(routeAtom);
  const sel = useMemo(() => new Set(selected), [selected]);
  const q = query.trim().toLowerCase();
  const toggleCase = (id: string) => onChange([...toggleSelection(sel, [id])]);
  const toggleSet = (ids: string[]) => onChange([...toggleSelection(sel, ids)]);
  type Row = { key: string } & (
    | { kind: "stage"; stage: string }
    | { kind: "set"; set: SetDto; ids: string[]; count: number; expanded: boolean }
    | { kind: "group"; group: string; ids: string[]; count: number }
    | { kind: "cases"; cases: CaseDto[] }
  );
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const stage of new Set(sets.map(s => s.stage))) {
      const matching = sets.filter(s => s.stage === stage).map(set => ({ set,
        list: cases.filter(c => c.set === set.id && (!q || `${c.id} ${c.name} ${c.group}`.toLowerCase().includes(q)))
      })).filter(({ list }) => list.length);
      if (!matching.length) continue;
      result.push({ key: stage, kind: "stage", stage });
      for (const { set, list } of matching) {
        const ids = list.map(c => c.id), count = ids.filter(id => sel.has(id)).length;
        const expanded = !!q || (open[set.id] ?? (defaultExpanded || count > 0));
        result.push({ key: set.id, kind: "set", set, ids, count, expanded });
        if (!expanded) continue;
        const groups = groupCases(list);
        for (const [group, members] of groups) {
          if (groups.size > 1) result.push({ key: `${set.id}:${group}`, kind: "group", group, ids: members.map(c => c.id), count: members.filter(c => sel.has(c.id)).length });
          for (let i = 0; i < members.length; i += 3)
            result.push({ key: `${set.id}:${group}:${i}`, kind: "cases", cases: members.slice(i, i + 3) });
        }
      }
    }
    return result;
  }, [sets, cases, q, sel, open, defaultExpanded]);
  const scroll = usePreservedList<Row>(`case-selector:${selectorKey}:${query}`);
  return <View style={styles.panel}>
    <View style={styles.panelHeader}>
      <Muted size={13}>{selected.length} selected</Muted>
      {selected.length > 0 && <MiniBtn label="Clear" onPress={() => onChange([])} />}
    </View>
    <Input small accessibilityLabel="Search cases" placeholder="Search cases…" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
    <FlatList key={`${selectorKey}:${query}`} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={9} maxToRenderPerBatch={6} windowSize={5} scrollEventThrottle={64}
      style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingRight: 4, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Muted>No cases match.</Muted>}
      renderItem={({ item: row }) => {
        if (row.kind === "stage") return <Caption style={styles.stageLabel}>{row.stage}</Caption>;
        if (row.kind === "set") {
          const state = row.count === 0 ? "off" : row.count === row.ids.length ? "on" : "partial";
          return <View style={styles.setControls}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state === "partial" ? "mixed" : state === "on" }} accessibilityLabel={`Select all ${row.set.label} cases`} onPress={() => toggleSet(row.ids)} style={styles.checkButton}><Checkbox state={state} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: row.expanded }} onPress={() => setOpen({ ...open, [row.set.id]: !row.expanded })} style={styles.setHeader}>
              <Text numberOfLines={1} style={[styles.setLabel, { color: t.text, flexShrink: 1 }]}>{row.set.label}</Text>
              <Text style={[styles.count, { color: t.readableMuted }]}>{row.count}/{row.ids.length}</Text>
              <Text style={[styles.chevron, { color: t.readableMuted }]}>{row.expanded ? "−" : "+"}</Text>
            </Pressable>
          </View>;
        }
        if (row.kind === "group") return <Pressable accessibilityRole="button" accessibilityLabel={`Toggle all ${row.group} cases`} onPress={() => toggleSet(row.ids)} style={({ pressed }) => [styles.groupHeader, { backgroundColor: pressed ? t.hover : "transparent" }]}>
          <Text numberOfLines={1} style={[styles.groupLabel, { color: t.text2, flexShrink: 1 }]}>{row.group}</Text>
          <Text style={[styles.count, { color: t.readableMuted }]}>{row.count}/{row.ids.length}</Text>
        </Pressable>;
        return <View style={styles.grid}>{row.cases.map(c => <Tile key={c.id} c={c} on={sel.has(c.id)} onPress={() => toggleCase(c.id)} onLongPress={() => { onOpenCase?.(); setRoute({ page: "algorithms", caseId: c.id }); }} />)}</View>;
      }} />
  </View>;
});

const Tile = memo(function Tile({ c, on, onPress, onLongPress }: { c: CaseDto; on: boolean; onPress: () => void; onLongPress: () => void }) {
  const t = useTheme();
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${c.id}${c.name !== c.id ? `, ${c.name}` : ""}`}
    style={({ pressed }) => [styles.tile, { backgroundColor: on ? t.accentSoft : pressed ? t.hover : "transparent" }]}>
    <CaseDiagram c={c} size={58} />
    <Text numberOfLines={1} style={[styles.tileId, { color: on ? t.text : t.text2 }]}>{shortId(c)}</Text>
    {on && <View style={[styles.tileCheck, { backgroundColor: t.accent }]}><IconCheck size={10} color="#fff" /></View>}
  </Pressable>;
});

const styles = StyleSheet.create({
  panel: { flex: 1, gap: 10, minHeight: 0 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 30 },
  stageLabel: { marginTop: 12, marginBottom: 2, letterSpacing: 1.1 },
  setControls: { flexDirection: "row", alignItems: "center", gap: 4 },
  checkButton: { width: 32, height: 38, alignItems: "center", justifyContent: "center" },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  setHeader: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, minWidth: 0 },
  setLabel: { fontSize: 14, fontWeight: "600" },
  count: { fontSize: 12, fontFamily: "monospace" },
  chevron: { marginLeft: "auto", fontSize: 14 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32, marginTop: 4, paddingHorizontal: 6, borderRadius: 8 },
  groupLabel: { fontSize: 13, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingTop: 2, paddingBottom: 10 },
  tile: { width: "32%", alignItems: "center", gap: 4, paddingTop: 8, paddingBottom: 6, borderRadius: 14 },
  tileId: { fontSize: 12, fontWeight: "600", paddingHorizontal: 4, maxWidth: "100%" },
  tileCheck: { position: "absolute", top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
