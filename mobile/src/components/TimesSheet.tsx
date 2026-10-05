import { useMemo } from "react";
import { View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import { sessionExtremes, sessionMetrics, solveTone } from "../../../src/client/lib/practiceSummary";
import { TONE_TEXT } from "../../../src/client/lib/tone";
import type { SolveDto } from "../../../src/shared/types";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Figure, Numeric } from "./layout";
import { Sheet, SheetFlatList } from "./Sheet";
import { SolveMenu } from "./SolveMenus";

/**
 * The session's times in a sheet resting half open: its figures, then every time newest first. A tap opens a time,
 * holding it offers +2, DNF, a comment or its deletion.
 */
export function TimesSheet({ open, onClose, solves, title }: { open: boolean; onClose: () => void; solves: SolveDto[]; title: string }) {
  const metrics = sessionMetrics(solves);
  const extremes = sessionExtremes(solves);
  const data = useMemo(() => [...solves].reverse(), [solves]);
  return <Sheet open={open} onClose={onClose} contentClassName="gap-3 px-0"
    title={<Text accessibilityRole="header" className="text-base font-semibold">{title} <Numeric className="text-base font-normal text-muted-foreground">{solves.length}</Numeric></Text>}
    description="Tap a time for its details · hold it for +2, DNF or delete">
    <View className="mx-5 flex-row flex-wrap gap-y-3 rounded-xl bg-muted/45 px-3 py-3">
      {metrics.map(([label, value, tone]) => <View key={label} style={{ width: "25%" }} className="pr-2"><Figure label={label} value={value} tone={tone} size="sm" /></View>)}
    </View>
    <SheetFlatList data={data} keyExtractor={solve => String(solve.id)} initialNumToRender={20} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
      ListEmptyComponent={<Text className="px-2 py-3 text-sm text-muted-foreground">No solves in this session yet.</Text>}
      renderItem={({ item: v, index }) => <SolveMenu solve={v} className="h-12 flex-row items-center gap-3 rounded-lg px-2 active:bg-muted/50">
        <Numeric className="w-8 text-right text-xs text-muted-foreground">{solves.length - index}</Numeric>
        <Numeric className={cn("text-lg", TONE_TEXT[solveTone(v, extremes)])}>{fmtSolve(v.time_ms, v.penalty)}</Numeric>
        {v.comment ? <Text numberOfLines={1} className="flex-1 text-xs text-muted-foreground">“{v.comment}”</Text> : null}
      </SolveMenu>} />
  </Sheet>;
}
