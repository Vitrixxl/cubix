import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useAtomValue } from "jotai";
import { analyseSolve, type CatalogCase, type PhaseId, type PhaseSpan, type SolveAnalysis } from "../../../../src/client/lib/solveAnalysis";
import { phaseSpans } from "../../../../src/client/lib/phases";
import { phasesAtom } from "../../state";
import { readSolution, recordedSolve } from "../../../../src/client/lib/solution";
import { said, tr } from "../../../../src/client/i18n";
import { local } from "../../api";
import { alpha, useColors } from "../../theme";
import { Numeric } from "../layout";

/** Seconds to the hundredth, as the analysis writes its times. */
export const seconds = (ms: number) => (ms / 1000).toFixed(2);

/** The 3×3 catalogue, as the analysis reads its cases (the same array each time: its indexes are kept per array). */
export const catalogCases = () => local.read.catalog("333").cases as unknown as CatalogCase[];

/** A timed 3×3 solution's analysis (a smart cube solve): its steps, cases and times; null when it has none. */
export function analyseSolution(scramble: string | null | undefined, solution: string | null | undefined): SolveAnalysis | null {
  const turns = readSolution(solution), recording = turns && recordedSolve(scramble, turns);
  if (!recording) return null;
  try { return analyseSolve(recording, catalogCases()); } catch { return null; }
}

/**
 * The steps' colours, as the web's (desktop/renderer/stepColour.ts): the first block in lilac, the pairs in mint, each
 * a little fuller, the orientation in butter and the last step in the accent. From the theme's tokens.
 */
export function useStepColour() {
  const v = useColors().variables, lilac = v["--lilac"]!, success = v["--success"]!, warning = v["--warning"]!, primary = v["--primary"]!;
  const colour: Record<PhaseId, string> = {
    cross: lilac, eoline: lilac, fb: lilac,
    f2l1: alpha(success, 50), f2l2: alpha(success, 65), f2l3: alpha(success, 82), f2l4: success, sb: success,
    cmll: warning, oll: warning, lse: primary, pll: primary,
  };
  return (id: PhaseId) => colour[id];
}

/** A coloured dot, for a step or a figure. */
export const Dot = ({ colour, size = 8 }: { colour: string; size?: number }) =>
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour }} />;

/**
 * The steps side by side, each as wide as it took (skipped ones take no room); a tap opens a step's analysis. The
 * selected one stands taller.
 */
export function SolveBar({ analysis, selected, onSelect, height = 18 }: { analysis: { phases: readonly PhaseSpan[] }; selected?: PhaseId; onSelect?: (id: PhaseId) => void; height?: number }) {
  const colour = useStepColour();
  return <View accessibilityLabel={tr("Solve steps")} className="flex-row items-center gap-1" style={{ height: height + 8 }}>
    {analysis.phases.filter(p => !p.skip).map(phase => {
      const on = selected === phase.id;
      return <Pressable key={phase.id} disabled={!onSelect} onPress={() => onSelect?.(phase.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${said(phase.label)}, ${seconds(phase.end - phase.start)} s`} hitSlop={{ top: 10, bottom: 10 }}
        className={cn("min-w-2 rounded-full", on && "border-2 border-foreground")}
        style={{ flexGrow: Math.max(phase.end - phase.start, 1), flexBasis: 0, height: on ? height + 8 : height, backgroundColor: colour(phase.id) }} />;
    })}
  </View>;
}

/** Each step's name; the selected one with its time, or each one with `times`. */
export function StepNames({ analysis, selected, onSelect, times = false }: { analysis: { phases: readonly PhaseSpan[] }; selected?: PhaseId; onSelect?: (id: PhaseId) => void; times?: boolean }) {
  return <View className="flex-row flex-wrap gap-x-3">
    {analysis.phases.filter(p => !p.skip).map(phase => <Pressable key={phase.id} disabled={!onSelect} onPress={() => onSelect?.(phase.id)} className="min-h-8 justify-center">
      <Numeric className={cn("text-xs", selected === phase.id ? "font-bold text-foreground" : "text-muted-foreground")}>
        {said(phase.label)}{times || selected === phase.id ? ` · ${seconds(phase.end - phase.start)} s` : ""}
      </Numeric>
    </Pressable>)}
  </View>;
}

/** A solve timed in phases without a smart cube (lib/phases): the same bar, each phase with its time. */
export function PhaseSplits({ solve, height = 12 }: { solve: { time_ms: number; splits?: number[] | null }; height?: number }) {
  const phases = useAtomValue(phasesAtom);
  if (!solve.splits?.length) return null;
  const analysis = { phases: phaseSpans(solve.splits, solve.time_ms, phases) };
  return <View accessibilityLabel={tr("Phases")}>
    <SolveBar analysis={analysis} height={height} />
    <StepNames analysis={analysis} times />
  </View>;
}

/** The legend of a solve's bar: Cross, F2L ×4, OLL, PLL (or the method's own steps), each with its colour. */
export function StepLegend({ analysis }: { analysis: SolveAnalysis }) {
  const colour = useStepColour();
  const shown = analysis.phases.filter(p => !p.skip), pairs = shown.filter(p => p.id.startsWith("f2l"));
  const items = shown.filter(p => !p.id.startsWith("f2l") || p === pairs.at(-1));
  return <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
    {items.map(p => <View key={p.id} className="flex-row items-center gap-1">
      <Dot colour={colour(p.id)} />
      <Text className="text-xs text-muted-foreground">{p.id.startsWith("f2l") ? `F2L${pairs.length > 1 ? ` ×${pairs.length}` : ""}` : said(p.label)}</Text>
    </View>)}
  </View>;
}

/** A time with its decimals in the accent, as the timer writes it. */
export function SplitTime({ text, className, size }: { text: string; className?: string; size: number }) {
  const dot = text.lastIndexOf(".");
  return <Numeric numberOfLines={1} className={cn("font-extrabold tracking-[-0.04em]", className)} style={{ fontSize: size, lineHeight: size * 1.1 }}>
    {dot < 0 ? text : <>{text.slice(0, dot + 1)}<Text className="text-primary" style={{ fontSize: size * 0.8 }}>{text.slice(dot + 1)}</Text></>}
  </Numeric>;
}
