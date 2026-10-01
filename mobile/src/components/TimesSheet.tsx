import { useMemo } from "react";
import { View } from "react-native";
import { effective, fmtSolve } from "../../../src/client/lib/format";
import type { SolveDto } from "../../../src/shared/types";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Figure, Mono } from "./layout";
import { sessionMetrics } from "./Practice";
import { Sheet, SheetFlatList } from "./Sheet";
import { SolveMenu } from "./SolveMenus";

/** The session's fastest and slowest solves (a DNF is the slowest), once there are two. */
function sessionExtremes(solves: SolveDto[]): { best?: number; worst?: number } {
  if (solves.length < 2) return {};
  const ranked = [...solves].sort((a, b) => (effective(a.time_ms, a.penalty) ?? Infinity) - (effective(b.time_ms, b.penalty) ?? Infinity));
  return { best: ranked[0]!.id, worst: ranked.at(-1)!.id };
}
const toneOf = (v: SolveDto, extremes: { best?: number; worst?: number }) =>
  v.penalty === "dnf" || v.id === extremes.worst ? "text-destructive" : v.id === extremes.best ? "text-success" : v.penalty === "+2" ? "text-warning" : "";

/**
 * The session's times in a sheet resting half open: its figures, then every time newest first. A tap opens a time,
 * holding it offers +2, DNF, a comment or its deletion.
 */
export function TimesSheet({ open, onClose, solves, title }: { open: boolean; onClose: () => void; solves: SolveDto[]; title: string }) {
  const metrics = sessionMetrics(solves);
  const extremes = sessionExtremes(solves);
  const data = useMemo(() => [...solves].reverse(), [solves]);
  return <Sheet open={open} onClose={onClose} snapPoints={["55%", "100%"]} contentClassName="gap-3 px-0"
    title={<Text accessibilityRole="header" className="text-base font-semibold">{title} <Mono className="text-base font-normal text-muted-foreground">{solves.length}</Mono></Text>}
    description="Tap a time for its details · hold it for +2, DNF or delete">
    <View className="mx-5 flex-row flex-wrap gap-y-3 rounded-xl bg-muted/45 px-3 py-3">
      {metrics.map(([label, value, tone]) => <View key={label} style={{ width: "25%" }} className="pr-2"><Figure label={label} value={value} tone={tone} size="sm" /></View>)}
    </View>
    <SheetFlatList style={{ flex: 1 }} data={data} keyExtractor={solve => String(solve.id)} initialNumToRender={20} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
      ListEmptyComponent={<Text className="px-2 py-3 text-sm text-muted-foreground">No solves in this session yet.</Text>}
      renderItem={({ item: v, index }) => <SolveMenu solve={v} className="h-12 flex-row items-center gap-3 rounded-lg px-2 active:bg-muted/50">
        <Mono className="w-8 text-right text-xs text-muted-foreground">{solves.length - index}</Mono>
        <Mono className={cn("text-lg", toneOf(v, extremes))}>{fmtSolve(v.time_ms, v.penalty)}</Mono>
        {v.comment ? <Text numberOfLines={1} className="flex-1 text-xs text-muted-foreground">“{v.comment}”</Text> : null}
      </SolveMenu>} />
  </Sheet>;
}
