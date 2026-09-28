import { groupCases, toggleSelection } from "../../../src/client/lib/practiceCatalog";
import { memo, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { CaseDto, SetDto } from "../../../src/shared/types";
import { FONT, useTheme } from "../theme";
import { usePreservedList } from "../hooks/usePreservedList";
import { shortId } from "../lib/caseState";
import { CaseDiagram } from "./CaseDiagram";
import { IconChevronDown, IconNext } from "./icons";
import { Checkbox, Label, Muted } from "./ui";

/** Open sets survive leaving the setup screen, per catalogue. */
const selectorExpansion = new Map<string, Record<string, boolean>>();

/** Every word of the search appears in the case's id, name, set, stage or group (web `matches`). */
function matchesCase(c: CaseDto, query: string) {
  const text = [c.id, c.name, c.setLabel, c.stage, c.group, c.subgroup].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every(word => text.includes(word));
}

const TILE_MIN = 68, TILE_GAP = 2;
type Row = { key: string; last: boolean } & (
  | { kind: "set"; set: SetDto; ids: string[]; all: string[]; count: number; open: boolean }
  | { kind: "group"; group: string; all: string[]; count: number; total: number }
  | { kind: "tiles"; cases: CaseDto[]; first: boolean; end: boolean }
);

/**
 * The free practice catalogue of the training setup (`.setup-scroll`): one row per set with its checkbox,
 * stage, name, selected count and chevron; an open set lists its groups and a grid of case pictures, the
 * chosen ones lit, the others dimmed. A long press on a picture opens the case.
 */
export const CaseSelector = memo(function CaseSelector({ cases, sets, selected, onChange, query, onOpenCase }: {
  cases: CaseDto[]; sets: SetDto[]; selected: string[]; onChange: (ids: string[]) => void; query: string; onOpenCase?: (id: string) => void;
}) {
  const t = useTheme();
  const selectorKey = sets.map(s => s.id).join(":");
  const [open, setOpen] = useState<Record<string, boolean>>(() => selectorExpansion.get(selectorKey) ?? {});
  useEffect(() => { selectorExpansion.set(selectorKey, open); }, [selectorKey, open]);
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN + TILE_GAP)));
  const sel = useMemo(() => new Set(selected), [selected]);
  const q = query.trim();
  const toggle = (ids: string[]) => onChange([...toggleSelection(sel, ids)]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const set of sets) {
      const inSet = cases.filter(c => c.set === set.id);
      const chosen = q ? inSet.filter(c => matchesCase(c, q)) : inSet;
      if (!chosen.length) continue;
      const ids = chosen.map(c => c.id), count = ids.filter(id => sel.has(id)).length;
      const expanded = open[set.id] ?? (count > 0 || !!q);
      const setRows: Row[] = [{ key: set.id, last: false, kind: "set", set, ids, all: inSet.map(c => c.id), count, open: expanded }];
      if (expanded) {
        const groups = groupCases(chosen);
        for (const [group, members] of groups) {
          if (groups.size > 1) setRows.push({ key: `${set.id}:${group}`, last: false, kind: "group", group, all: inSet.filter(c => c.group === group).map(c => c.id), count: members.filter(c => sel.has(c.id)).length, total: members.length });
          for (let i = 0; i < members.length; i += columns)
            setRows.push({ key: `${set.id}:${group}:${i}`, last: false, kind: "tiles", cases: members.slice(i, i + columns), first: i === 0, end: i + columns >= members.length });
        }
      }
      setRows.at(-1)!.last = true;
      result.push(...setRows);
    }
    return result;
  }, [sets, cases, q, sel, open, columns]);
  const scroll = usePreservedList<Row>(`case-selector:${selectorKey}:${q}`);
  const tileWidth = width > 0 ? (width - TILE_GAP * (columns - 1)) / columns : TILE_MIN;
  return <View style={styles.list} onLayout={event => setWidth(event.nativeEvent.layout.width - 20)}>
    {width > 0 && <FlatList key={`${selectorKey}:${q}:${columns}`} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} scrollEventThrottle={64}
      style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Muted style={{ padding: 16, textAlign: "center" }}>No cases match.</Muted>}
      renderItem={({ item: row }) => {
        const divider = row.last && { borderBottomWidth: 1, borderColor: t.line };
        if (row.kind === "set") return <View style={[styles.setHead, divider]}>
          <Checkbox checked={row.count > 0 && row.count === row.ids.length} mixed={row.count > 0 && row.count < row.ids.length}
            onPress={() => toggle(row.all)} accessibilityLabel={`Select ${row.set.label}`} style={styles.checkButton} />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: row.open }} accessibilityLabel={`${row.set.label}, ${row.count} of ${row.ids.length} selected`}
            onPress={() => setOpen({ ...open, [row.set.id]: !row.open })}
            style={({ pressed }) => [styles.setTitle, { backgroundColor: pressed ? t.hover : "transparent" }]}>
            <Label style={styles.stage} numberOfLines={1}>{row.set.stage}</Label>
            <Text numberOfLines={1} style={[styles.setLabel, { color: t.text }]}>{row.set.label}</Text>
            <Text style={[styles.count, { color: t.muted }]}>{row.count} / {row.ids.length}</Text>
            <View style={{ marginLeft: "auto" }}>{row.open ? <IconChevronDown size={12} color={t.muted} /> : <IconNext size={12} color={t.muted} />}</View>
          </Pressable>
        </View>;
        if (row.kind === "group") return <View style={divider}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Select the ${row.group} cases`} onPress={() => toggle(row.all)}
            style={({ pressed }) => [styles.groupTitle, { backgroundColor: pressed ? t.hover : "transparent" }]}>
            <Text numberOfLines={1} style={[styles.groupLabel, { color: t.secondary }]}>{row.group}</Text>
            <Text style={[styles.groupCount, { color: t.muted }]}>{row.count} / {row.total}</Text>
          </Pressable>
        </View>;
        return <View style={[styles.grid, { paddingTop: row.first ? 4 : 0, paddingBottom: row.end ? 14 : TILE_GAP }, divider]}>
          {row.cases.map(c => <Tile key={c.id} c={c} width={tileWidth} on={sel.has(c.id)} onPress={() => toggle([c.id])} onLongPress={() => onOpenCase?.(c.id)} />)}
        </View>;
      }} />}
  </View>;
});

/** `.setup-tile`: the case picture and its short name; chosen = surface2 and full opacity. */
const Tile = memo(function Tile({ c, width, on, onPress, onLongPress }: { c: CaseDto; width: number; on: boolean; onPress: () => void; onLongPress: () => void }) {
  const t = useTheme();
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${c.id}${c.name !== c.id ? `, ${c.name}` : ""}`}
    style={({ pressed }) => [styles.tile, { width, backgroundColor: on ? t.surface2 : pressed ? t.hover : "transparent" }]}>
    <View style={{ opacity: on ? 1 : 0.38 }}><CaseDiagram c={c} size={Math.min(60, width - 8)} /></View>
    <Text numberOfLines={1} style={[styles.tileId, { color: on ? t.text : t.muted, fontWeight: on ? "600" : "400" }]}>{shortId(c)}</Text>
  </Pressable>;
});

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 },
  setHead: { flexDirection: "row", alignItems: "center", gap: 2, height: 52 },
  checkButton: { width: 30, height: 32 },
  setTitle: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, height: 40, paddingHorizontal: 10, borderRadius: 8 },
  stage: { width: 42, flexShrink: 0 },
  setLabel: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  count: { fontFamily: FONT.mono, fontSize: 12, flexShrink: 0 },
  groupTitle: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, height: 28, paddingHorizontal: 8, borderRadius: 8, maxWidth: "100%" },
  groupLabel: { fontSize: 12, fontWeight: "500", flexShrink: 1 },
  groupCount: { fontFamily: FONT.mono, fontSize: 11 },
  grid: { flexDirection: "row", gap: TILE_GAP },
  tile: { alignItems: "center", gap: 4, paddingTop: 8, paddingBottom: 6, borderRadius: 8 },
  tileId: { fontSize: 12, paddingHorizontal: 2, maxWidth: "100%" },
});
