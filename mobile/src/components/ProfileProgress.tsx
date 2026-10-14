import { useSetAtom } from "jotai";
import { Timer } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { fmtTime, plural } from "../../../src/client/lib/format";
import { puzzleOf } from "../../../src/shared/puzzles";
import type { CaseDto, CaseHistoryDto, ProfileDto, SetDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePreservedList } from "../hooks/usePreservedList";
import { shortId } from "../lib/caseState";
import { puzzleAtom, routeAtom, selectedCaseIdsAtom } from "../state";
import { CaseDiagram } from "./CaseDiagram";
import { Choice, Empty, GroupToggle, Label, Numeric, SearchField } from "./layout";
import { Sheet, SheetScrollView } from "./Sheet";
import { TimerStats } from "./TimesChart";
import { tr } from "../../../src/client/i18n";
import { caseContext, groupBySet } from "../../../src/client/lib/practiceCatalog";

/**
 * The profile's cases (pushed from its shortcuts): the training progress grid of cases (`TrainingProgress`) and the
 * statistics sheet of one case (`ProfileCaseDialog`).
 */

/** A case of the progress grid: picture, short name and best time; untrained cases are faded. */
const CaseTile = memo(function CaseTile({ c, stats, width, onOpen }: { c: CaseDto; stats?: CaseHistoryDto; width: number; onOpen: (id: string) => void }) {
  const trained = !!stats?.summary.count;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${c.id}, ${trained ? tr("best {0}, {1}", { 0: fmtTime(stats!.summary.best), 1: plural(stats!.summary.count, "solve") }) : tr("not trained")}`} onPress={() => onOpen(c.id)}
    className="items-center gap-1 rounded-lg px-1 pt-2.5 pb-2 active:bg-muted/50" style={{ width, opacity: trained ? 1 : 0.5 }}>
    <CaseDiagram c={c} size={Math.min(64, width - 12)} />
    <Text numberOfLines={1} className="text-xs font-medium">{shortId(c)}</Text>
    <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{trained ? fmtTime(stats!.summary.best) : "–"}</Numeric>
  </Pressable>;
});

const matches = (c: CaseDto, setLabel: string, q: string) => {
  const text = [c.id, c.name, setLabel, c.stage, c.group].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every(word => text.includes(word));
};

/**
 * Stage filters, a search and the trained / learned counts, then each set as a collapsible grid of case tiles. A tile
 * opens the case's statistics.
 */
export function TrainingProgress({ cases, sets, profile, learned, onOpen, scrollKey }: { cases: CaseDto[]; sets: SetDto[]; profile: ProfileDto; learned: ReadonlySet<string>; onOpen: (id: string) => void; scrollKey: string }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [width, setWidth] = useState(0);
  const byCase = useMemo(() => new Map(profile.cases.map(c => [c.summary.caseId, c])), [profile.cases]);
  const columns = Math.max(3, Math.floor((width + 4) / 88));
  const tileWidth = width ? Math.floor((width - 4 * (columns - 1)) / columns) : 84;
  const q = query.trim();
  type Row = { key: string } & ({ kind: "set"; set: SetDto; trained: number; count: number; open: boolean } | { kind: "cases"; cases: CaseDto[] });
  const bySet = useMemo(() => groupBySet(cases), [cases]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const set of sets) {
      const chosen = (bySet.get(set.id) ?? []).filter(c => (stage === "all" || c.stage === stage) && (!q || matches(c, set.label, q)));
      if (!chosen.length) continue;
      const open = !closed[set.id];
      result.push({ key: set.id, kind: "set", set, trained: chosen.filter(c => byCase.has(c.id)).length, count: chosen.length, open });
      if (open) for (let i = 0; i < chosen.length; i += columns) result.push({ key: `${set.id}:${i}`, kind: "cases", cases: chosen.slice(i, i + columns) });
    }
    return result;
  }, [sets, bySet, stage, q, closed, columns, byCase]);
  const key = `${scrollKey}:${columns}`;
  const scroll = usePreservedList<Row>(key);
  const previousFilter = useRef(`${stage}:${q}`);
  useEffect(() => {
    const filter = `${stage}:${q}`;
    if (filter !== previousFilter.current) scroll.ref.current?.scrollToOffset({ offset: 0, animated: false });
    previousFilter.current = filter;
  }, [stage, q]);
  const learnedCount = useMemo(() => cases.filter(c => learned.has(c.id)).length, [cases, learned]);
  const stages = useMemo(() => ["all", ...new Set(cases.map(c => c.stage))], [cases]);
  return <View className="min-h-0 flex-1 gap-2">
    <Choice label={tr("Stage")} value={stage} onChange={setStage} options={stages.map(value => ({ id: value, label: value === "all" ? tr("All") : value }))} />
    <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases…")} />
    <Text className="text-xs text-muted-foreground">{tr("{0} / {1} trained · {2} learned", { 0: profile.cases.length, 1: cases.length, 2: learnedCount })}</Text>
    <View className="min-h-0 flex-1" onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
        initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
        className="flex-1" contentContainerClassName="pb-4" keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Empty>{tr("No cases match.")}</Empty>}
        renderItem={({ item: row }) => row.kind === "set"
          ? <GroupToggle className="mx-0 mt-1" title={row.set.label} meta={`${row.trained} / ${row.count}`} open={row.open} onPress={() => setClosed({ ...closed, [row.set.id]: row.open })} />
          : <View className="flex-row gap-1">{row.cases.map(c => <CaseTile key={c.id} c={c} stats={byCase.get(c.id)} width={tileWidth} onOpen={onOpen} />)}</View>} />}
    </View>
  </View>;
}

/** The statistics of one case in a sheet, with a shortcut to train it. */
export function ProfileCaseDialog({ c, data, onClose }: { c: CaseDto | undefined; data?: CaseHistoryDto; onClose: () => void }) {
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const setPuzzle = useSetAtom(puzzleAtom);
  const setRoute = useSetAtom(routeAtom);
  // The sheet keeps showing its case while it goes away.
  const last = useRef(c);
  if (c) last.current = c;
  const shown = c ?? last.current;
  const train = () => { if (!shown) return; onClose(); setPuzzle(puzzleOf(shown)); setSelection([shown.id]); setRoute({ page: "training", autostart: true }); };
  return <Sheet open={!!c} onClose={onClose} title={shown?.id ?? tr("Case")} description={shown ? (shown.name !== shown.id ? shown.name : shown.group) : undefined} contentClassName="px-0"
    right={shown && <Button variant="ghost" size="sm" className="h-9 gap-1.5" onPress={train}><Icon as={Timer} size={15} className="text-muted-foreground" /><Text className="text-sm text-muted-foreground">{tr("Train")}</Text></Button>}>
    {shown && <SheetScrollView contentContainerClassName="gap-4 px-5 pb-8">
      <View className="flex-row items-center gap-3">
        <CaseDiagram c={shown} size={56} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-semibold">{caseContext(shown)}</Text>
          <Label>{plural(data?.summary.count ?? 0, "solve")}</Label>
        </View>
      </View>
      <TimerStats compact data={data} empty={tr("No attempts on this case yet.")} />
    </SheetScrollView>}
  </Sheet>;
}
