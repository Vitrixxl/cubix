import { ListOrdered, MessageSquare, Rotate3d } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import { sessionExtremes, sessionMetrics, solveTone } from "../../../src/client/lib/practiceSummary";
import { TONE_TEXT } from "../../../src/client/lib/tone";
import type { SolveDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Empty, Figure, Numeric } from "./layout";
import { Sheet, SheetFlatList } from "./Sheet";
import { SolveMenu } from "./SolveMenus";
import { tr } from "../../../src/client/i18n";

/** Every time takes one row of this height (`h-11`). */
const ROW = 44;

/**
 * The session's times in a sheet resting half open: its figures, then every time newest first. A tap opens a time,
 * holding it offers +2, DNF, a comment or its deletion.
 */
export function TimesSheet({ open, onClose, solves, title }: { open: boolean; onClose: () => void; solves: SolveDto[]; title: string }) {
  const metrics = useMemo(() => sessionMetrics(solves), [solves]);
  const extremes = useMemo(() => sessionExtremes(solves), [solves]);
  const data = useMemo(() => [...solves].reverse(), [solves]);
  return <Sheet open={open} onClose={onClose} contentClassName="gap-3 px-0"
    title={<Text accessibilityRole="header" className="text-base font-semibold">{title} <Numeric className="text-base font-normal text-muted-foreground">{solves.length}</Numeric></Text>}
    description={tr("Tap a time for its details · hold it for +2, DNF or delete")}>
    <View className="mx-5 flex-row flex-wrap gap-y-3 rounded-xl bg-muted/45 px-3 py-3">
      {metrics.map(([label, value, tone]) => <View key={label} style={{ width: "25%" }} className="pr-2"><Figure label={label} value={value} tone={tone} size="sm" /></View>)}
    </View>
    <SheetFlatList data={data} keyExtractor={solve => String(solve.id)} initialNumToRender={20} getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
      ListEmptyComponent={<Empty icon={ListOrdered} title={tr("No times yet")} className="px-4 py-8">{tr("Every solve of this session lands here.")}</Empty>}
      renderItem={({ item: v, index }) => <SolveMenu solve={v} className="h-11 flex-row items-center gap-3 rounded-lg px-2 active:bg-muted/50">
        <Numeric className="w-7 text-right text-xs text-muted-foreground">{solves.length - index}</Numeric>
        <Numeric className={cn("text-base", TONE_TEXT[solveTone(v, extremes)])}>{fmtSolve(v.time_ms, v.penalty)}</Numeric>
        {v.comment ? <Icon as={MessageSquare} size={12} className="text-muted-foreground" accessibilityLabel={tr("Comment")} /> : null}
        {v.solution ? <Icon as={Rotate3d} size={12} className="text-muted-foreground" accessibilityLabel={tr("Turned on a connected cube")} /> : null}
      </SolveMenu>} />
  </Sheet>;
}
