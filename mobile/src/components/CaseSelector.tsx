import { Check } from "lucide-react-native";
import { memo, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { groupCases, matches, toggleSelection } from "../../../src/client/lib/practiceCatalog";
import type { CaseDto, SetDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { usePreservedList } from "../hooks/usePreservedList";
import { shortId } from "../lib/caseState";
import { CaseDiagram } from "./CaseDiagram";
import { Empty, GroupToggle, Numeric } from "./layout";
import { tr } from "../../../src/client/i18n";

/** Open sets survive leaving the setup screen, per catalogue. */
const selectorExpansion = new Map<string, Record<string, boolean>>();

const TILE_MIN = 84, TILE_GAP = 4;
type Row = { key: string } & (
  | { kind: "set"; set: SetDto; ids: string[]; count: number; open: boolean }
  | { kind: "group"; group: string; ids: string[]; count: number }
  | { kind: "tiles"; cases: CaseDto[]; end: boolean }
);

/**
 * The free practice catalogue (web `CasesSetup`): one row per set (chevron, stage, name, selected count and Select
 * all); an open set lists its groups (a tap selects the group) and a grid of case pictures, the chosen ones lit and
 * ticked. A long press on a picture opens the case.
 */
export const CaseSelector = memo(function CaseSelector({ cases, sets, selected, onChange, query, onOpenCase }: {
  cases: CaseDto[]; sets: SetDto[]; selected: string[]; onChange: (ids: string[]) => void; query: string; onOpenCase?: (id: string) => void;
}) {
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
      const chosen = cases.filter(c => c.set === set.id && (!q || matches(c, q)));
      if (!chosen.length) continue;
      const ids = chosen.map(c => c.id), count = ids.filter(id => sel.has(id)).length;
      const expanded = open[set.id] ?? (count > 0 || !!q);
      result.push({ key: set.id, kind: "set", set, ids, count, open: expanded });
      if (!expanded) continue;
      const groups = groupCases(chosen);
      for (const [group, members] of groups) {
        if (groups.size > 1) result.push({ key: `${set.id}:${group}`, kind: "group", group, ids: members.map(c => c.id), count: members.filter(c => sel.has(c.id)).length });
        for (let i = 0; i < members.length; i += columns)
          result.push({ key: `${set.id}:${group}:${i}`, kind: "tiles", cases: members.slice(i, i + columns), end: i + columns >= members.length });
      }
    }
    return result;
  }, [sets, cases, q, sel, open, columns]);
  const scroll = usePreservedList<Row>(`case-selector:${selectorKey}:${q}`);
  const tileWidth = width > 0 ? (width - TILE_GAP * (columns - 1)) / columns : TILE_MIN;
  return <View className="min-h-0 flex-1" onLayout={event => setWidth(event.nativeEvent.layout.width - 24)}>
    {width > 0 && <FlatList key={`${selectorKey}:${q}:${columns}`} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} scrollEventThrottle={64} keyboardShouldPersistTaps="handled"
      className="flex-1" contentContainerClassName="px-3 pt-1 pb-4"
      ListEmptyComponent={<Empty>{tr("No cases match.")}</Empty>}
      renderItem={({ item: row }) => {
        if (row.kind === "set") {
          const all = row.count === row.ids.length;
          return <GroupToggle className="mt-1" title={row.set.label} open={row.open} onPress={() => setOpen({ ...open, [row.set.id]: !row.open })}
            accessibilityLabel={tr("{0}, {1} of {2} selected", { 0: row.set.label, 1: row.count, 2: row.ids.length })}
            meta={<Numeric className={cn("text-xs", row.count ? "font-medium text-primary" : "text-muted-foreground")}>{row.count} / {row.ids.length}</Numeric>}>
            <Button variant="ghost" size="sm" className="h-11 px-2.5" onPress={() => all ? onChange(selected.filter(id => !row.ids.includes(id))) : toggle(row.ids.filter(id => !sel.has(id)))}>
              <Text className="text-sm text-muted-foreground">{all ? tr("Unselect all") : tr("Select all")}</Text>
            </Button>
          </GroupToggle>;
        }
        if (row.kind === "group") return <Pressable accessibilityRole="button" accessibilityLabel={tr("Select the {0} cases", { 0: row.group })} onPress={() => toggle(row.ids)}
          className="mt-2 h-8 flex-row items-center gap-2 self-start rounded-md px-1 active:bg-muted/50">
          <Text numberOfLines={1} className="text-xs font-medium text-muted-foreground">{row.group}</Text>
          <Numeric className="text-xs text-muted-foreground">{row.count} / {row.ids.length}</Numeric>
        </Pressable>;
        return <View className={cn("flex-row", row.end ? "pb-3" : "pb-1")} style={{ gap: TILE_GAP }}>
          {row.cases.map(c => <Tile key={c.id} c={c} width={tileWidth} on={sel.has(c.id)} onPress={() => toggle([c.id])} onLongPress={() => onOpenCase?.(c.id)} />)}
        </View>;
      }} />}
  </View>;
});

/** A case to pick: its picture and short name; chosen, it is lit and ticked. */
const Tile = memo(function Tile({ c, width, on, onPress, onLongPress }: { c: CaseDto; width: number; on: boolean; onPress: () => void; onLongPress: () => void }) {
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${c.id}${c.name !== c.id ? `, ${c.name}` : ""}`}
    className={cn("items-center gap-1.5 rounded-lg px-1 pt-2.5 pb-2 active:bg-muted/50", on && "bg-primary/10")} style={{ width }}>
    <View style={{ opacity: on ? 1 : 0.55 }}><CaseDiagram c={c} size={Math.min(56, width - 12)} /></View>
    <Text numberOfLines={1} className={cn("text-xs", on ? "text-foreground" : "text-muted-foreground")}>{shortId(c)}</Text>
    {on ? <View className="absolute top-1.5 right-1.5 size-4 items-center justify-center rounded-full bg-primary"><Icon as={Check} size={11} className="text-primary-foreground" /></View> : null}
  </Pressable>;
});
