import { useSetAtom } from "jotai";
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, Gauge, Layers, MessageSquare, Timer, Trophy, type LucideIcon } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { best, bestAverage, fmtTime, plural, shortDate, solvedAt } from "../../../src/client/lib/format";
import { HEAT_LEVELS, heatDays, heatmap, heatYears, trendScale, type ActivitySolve, type HeatCell } from "../../../src/client/lib/profile";
import { TONE_TEXT, type Tone } from "../../../src/client/lib/tone";
import { puzzleOf } from "../../../src/shared/puzzles";
import type { AchievementDto, CaseDto, CaseHistoryDto, HistoryPoint, ProfileDto, SetDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { usePreservedList } from "../hooks/usePreservedList";
import { shortId } from "../lib/caseState";
import { puzzleAtom, routeAtom, selectedCaseIdsAtom } from "../state";
import { useColors } from "../theme";
import { CaseDiagram } from "./CaseDiagram";
import { Choice, Empty, Label, Mono, SearchField } from "./layout";
import { ChoiceButton } from "./PuzzlePicker";
import { Sheet, SheetScrollView } from "./Sheet";
import { SolveMenu } from "./SolveMenus";
import { TimerStats } from "./TimesChart";

/**
 * The account's building blocks, after the web app's GitHub-style profile (desktop/renderer/profile/*): the `Section`
 * card every overview block is built with, its figures (`Stat`), the contribution graph (`Heatmap`), the timer curve
 * (`Trend`), the latest solves, the training bars and achievement goals; then the training progress grid of cases
 * (`TrainingProgress`) and the statistics sheet of one case (`ProfileCaseDialog`).
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** A profile section, every one built the same: a heading row (title, muted meta, a link to its page) and a body. */
export function Section({ title, meta, more = "Details", onMore, aside, children, className, bodyClassName, label }: {
  title: ReactNode; meta?: ReactNode; more?: string; onMore?: () => void; aside?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; label?: string;
}) {
  return <Card className={cn("gap-0 py-0", className)} accessibilityLabel={label}>
    <View className="min-h-13 flex-row items-center gap-3 pt-2 pr-3 pl-5">
      <Text accessibilityRole="header" className="shrink-0 text-base font-semibold tracking-tight">{title}</Text>
      {meta != null ? <Text numberOfLines={1} className="min-w-0 shrink text-sm text-muted-foreground">{meta}</Text> : null}
      <View className="ml-auto shrink-0 flex-row items-center gap-1">
        {aside}
        {onMore ? <MoreLink onPress={onMore}>{more}</MoreLink> : null}
      </View>
    </View>
    <View className={cn("gap-5 px-5 pt-3 pb-5", bodyClassName)}>{children}</View>
  </Card>;
}

/** A quiet link at the end of a heading row: "Details ›". */
export function MoreLink({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return <Button variant="ghost" size="sm" className="h-9 gap-0.5 px-2" onPress={onPress}>
    <Text className="text-sm text-muted-foreground">{children}</Text>
    <Icon as={ChevronRight} size={15} className="text-muted-foreground" />
  </Button>;
}

/** A small heading inside a section, with an optional control on the right. */
export function SubHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <View className="h-8 flex-row items-center gap-2">
    <Text className="text-sm font-medium text-muted-foreground">{title}</Text>
    {children ? <View className="ml-auto flex-row items-center">{children}</View> : null}
  </View>;
}

/** A figure: its label over the value in mono; an empty one is a faded dash. */
export function Stat({ label, value, tone = "" }: { label: string; value: string | null | undefined; tone?: Tone }) {
  const empty = value == null || value === "–" || value === "-";
  return <View className="w-1/3 min-w-0 gap-1.5 pr-3">
    <Text numberOfLines={1} className="text-xs text-muted-foreground">{label}</Text>
    <Mono numberOfLines={1} className={cn("text-xl font-medium tracking-tight", empty ? "text-muted-foreground/60" : TONE_TEXT[tone])}>{empty ? "–" : value}</Mono>
  </View>;
}

/** Figures three to a row. */
export function Stats({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-y-4">{children}</View>;
}

const HEAT_GAP = 3, HEAT_CELL = 12, HEAT_LABEL = 30, MONTH_ROW = 16;

/**
 * The contribution graph (the web's profile/heatmap.tsx): solves per day as squares, a week per column (Monday on
 * top), a year wide. The weeks scroll sideways and open on the latest months; the day names stay put. Tapping a day
 * names its solves and best times under the graph.
 */
export const Heatmap = memo(function Heatmap({ solves, latest }: { solves: ActivitySolve[]; latest: string | null }) {
  const [year, setYear] = useState<number | null>(null);
  const [picked, setPicked] = useState<HeatCell | null>(null);
  const scroller = useRef<ScrollView>(null);
  const days = useMemo(() => heatDays(solves), [solves]);
  const years = useMemo(() => heatYears(days), [days]);
  const { cells, weeks, months, level, total } = useMemo(() => heatmap(days, year), [days, year]);
  useEffect(() => { setPicked(null); }, [year, solves]);
  const step = HEAT_CELL + HEAT_GAP;
  const times = (picked && days.get(picked.key)?.times) ?? [];
  const finite = times.filter(t => t != null);
  return <Card className="gap-0 py-0" accessibilityLabel="Activity">
    <View className="min-h-13 flex-row items-center gap-3 pt-2 pr-2 pl-5">
      <Text className="text-base font-semibold tracking-tight">{plural(total, "solve")}</Text>
      <ChoiceButton label="Period" variant="ghost" value={String(year)} className="ml-auto px-2"
        options={[{ id: "null", label: "Last 12 months" }, ...years.map(y => ({ id: String(y), label: String(y) }))]}
        onChange={v => setYear(v === "null" ? null : Number(v))} />
    </View>
    <View className="px-5 pt-2 pb-4">
      <View className="flex-row">
        <View style={{ width: HEAT_LABEL, paddingTop: MONTH_ROW + HEAT_GAP, gap: HEAT_GAP }} importantForAccessibility="no-hide-descendants">
          {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => <View key={i} className="justify-center" style={{ height: HEAT_CELL }}>
            <Text className="text-[11px] leading-[13px] text-muted-foreground">{d}</Text>
          </View>)}
        </View>
        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} className="-mr-5 min-w-0 flex-1" contentContainerClassName="pr-5"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
          <View accessibilityRole="image" accessibilityLabel={`${plural(total, "solve")} ${year == null ? "over the last 12 months" : `in ${year}`}`}
            style={{ width: weeks * step - HEAT_GAP, height: MONTH_ROW + HEAT_GAP + 7 * step - HEAT_GAP }}>
            {months.map(m => <Text key={m.week} className="absolute top-0 text-[11px] leading-[13px] text-muted-foreground" style={{ left: m.week * step }}>{m.label}</Text>)}
            <View className="absolute flex-row" style={{ top: MONTH_ROW + HEAT_GAP, gap: HEAT_GAP }}>
              {Array.from({ length: weeks }, (_, w) => <View key={w} style={{ gap: HEAT_GAP }}>
                {cells.slice(w * 7, w * 7 + 7).map(c => c.hidden ? <View key={c.key} style={{ width: HEAT_CELL, height: HEAT_CELL }} />
                  : <Pressable key={c.key} hitSlop={1} onPress={() => setPicked(p => p?.key === c.key ? null : c)} accessibilityLabel={`${plural(c.count, "solve")} on ${c.date.toDateString()}`}
                    className={cn("rounded-[3px]", HEAT_LEVELS[level(c.count)], picked?.key === c.key && "border border-foreground")} style={{ width: HEAT_CELL, height: HEAT_CELL }} />)}
              </View>)}
            </View>
          </View>
        </ScrollView>
      </View>
      {picked ? <View className="mt-3 h-4 flex-row items-center gap-2">
        <Text numberOfLines={1} className="shrink text-xs">
          <Text className="text-xs font-medium">{picked.count ? plural(picked.count, "solve") : "No solves"}</Text>
          <Text className="text-xs text-muted-foreground"> on {picked.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</Text>
        </Text>
        {finite.length ? <Mono numberOfLines={1} className="ml-auto text-xs text-muted-foreground">Best {fmtTime(best(times))}{times.length >= 5 ? ` · Ao5 ${fmtTime(bestAverage(times, 5))}` : ""}</Mono> : null}
      </View> : <View className="mt-3 h-4 flex-row items-center justify-between gap-4">
        <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{latest ? `Last practice ${shortDate(latest)}` : "No practice yet"}</Text>
        <View className="shrink-0 flex-row items-center gap-1">
          <Text className="text-xs text-muted-foreground">Less</Text>
          {HEAT_LEVELS.map(c => <View key={c} className={cn("size-2.5 rounded-[2px]", c)} />)}
          <Text className="text-xs text-muted-foreground">More</Text>
        </View>
      </View>}
    </View>
  </Card>;
});

/** The latest solves and their Ao5 as two lines over three quiet ticks, the first and last dates under it. */
export function Trend({ history, averages, count = 100, height = 160 }: { history: HistoryPoint[]; averages: (number | null)[]; count?: number; height?: number }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const h = height - 22, scale = trendScale(history, averages, count, h);
  if (!scale) return <View className="items-center justify-center" style={{ height }}><Text className="text-sm text-muted-foreground">Your curve appears after two timed solves.</Text></View>;
  const { shown, ao5, y, ticks } = scale;
  const x = (i: number) => shown.length === 1 ? width / 2 : (i / (shown.length - 1)) * width;
  const line = (points: (number | null)[]) => scale.line(points, x, n => n.toFixed(1));
  return <View style={{ height }} accessibilityRole="image" accessibilityLabel={`Last ${shown.length} solves and their average of five`}>
    <View className="flex-1 flex-row gap-3">
      <View className="w-12" importantForAccessibility="no-hide-descendants">
        {ticks.map(t => <Mono key={t} className="absolute right-0 text-[11px] leading-[13px] text-muted-foreground" style={{ top: y(t) - 6.5 }}>{fmtTime(t)}</Mono>)}
      </View>
      <View className="flex-1" onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && <Svg width={width} height={h}>
          {ticks.map(t => <Path key={t} d={`M0 ${y(t)} H${width}`} stroke={colors.border} strokeWidth={1} />)}
          <Path d={line(shown.map(v => v.time))} fill="none" stroke={colors.primary} strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" />
          <Path d={line(ao5)} fill="none" stroke={colors.chart2} strokeWidth={2} strokeLinejoin="round" />
        </Svg>}
      </View>
    </View>
    <View className="ml-15 h-[22px] flex-row items-end justify-between">
      <Text className="text-xs text-muted-foreground">{shown[0]?.at ? shortDate(shown[0].at) : ""}</Text>
      <Text className="text-xs text-muted-foreground">{shown.at(-1)?.at ? shortDate(shown.at(-1)!.at) : ""}</Text>
    </View>
  </View>;
}

/** The two series named beside the chart. */
export function TrendLegend() {
  return <View className="flex-row items-center gap-4">
    <View className="flex-row items-center gap-1.5"><View className="h-0.5 w-3 rounded-full bg-primary" /><Text className="text-xs text-muted-foreground">Single</Text></View>
    <View className="flex-row items-center gap-1.5"><View className="h-0.5 w-3 rounded-full bg-chart-2" /><Text className="text-xs text-muted-foreground">Ao5</Text></View>
  </View>;
}

/** The latest timer solves, newest first; a tap opens one, a long press its menu. */
export function LatestSolves({ history, count = 5 }: { history: HistoryPoint[]; count?: number }) {
  const from = Math.max(0, history.length - count);
  const rows = history.slice(from).map((v, i) => ({ v, index: from + i })).reverse();
  return <View className="-mx-2">
    {rows.map(({ v, index }) => {
      const previous = history[index - 1];
      const pb = v.time != null && v.time === v.best && (!previous || previous.best == null || previous.best > v.time);
      return <SolveMenu key={v.id} solve={{ id: v.id, time_ms: v.timeMs, penalty: v.penalty, comment: v.comment, created_at: v.at }}
        className="h-10 flex-row items-center gap-3 rounded-md px-2 active:bg-muted/60">
        <Mono className="w-9 text-right text-xs text-muted-foreground">{index + 1}</Mono>
        <View className="w-24 flex-row items-center gap-1.5">
          <Mono className={cn("text-sm font-medium", v.time == null ? "text-destructive" : pb ? "text-success" : "")}>{fmtTime(v.time, { blank: "DNF" })}</Mono>
          {v.penalty === "+2" ? <Mono className="text-xs text-warning">+2</Mono> : null}
          {pb ? <Text className="text-xs font-medium text-success">PB</Text> : null}
        </View>
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          {v.comment ? <><Icon as={MessageSquare} size={13} className="text-muted-foreground" /><Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{v.comment}</Text></> : null}
        </View>
        <Text className="text-xs text-muted-foreground">{solvedAt(v.at)}</Text>
      </SolveMenu>;
    })}
  </View>;
}

/** Two tones on one bar: the cases trained, and over them the ones learned. */
export function TwoTone({ trained, learned, total }: { trained: number; learned: number; total: number }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%` as const;
  return <View className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: learned }}>
    <View className="absolute inset-y-0 left-0 rounded-full bg-primary/35" style={{ width: pct(Math.max(trained, learned)) }} />
    <View className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(learned) }} />
  </View>;
}

const CATEGORY_ICON: Record<string, LucideIcon> = { knowledge: BookOpen, speed: Timer, average: Gauge, volume: Layers, dedication: CalendarDays };

/** An achievement's mark: its category's icon on a square, in the accent once unlocked. */
export function AchievementBadge({ a, large = false }: { a: AchievementDto; large?: boolean }) {
  return <View className={cn("shrink-0 items-center justify-center rounded-lg", large ? "size-10" : "size-9", a.unlocked ? "bg-primary/15" : "bg-muted")}>
    <Icon as={CATEGORY_ICON[a.category] ?? Trophy} size={large ? 20 : 16} className={a.unlocked ? "text-primary" : "text-muted-foreground"} />
  </View>;
}

/** A goal on its way: its mark, title, percentage and a bar. */
export function Goal({ a }: { a: AchievementDto }) {
  return <View className="flex-row items-center gap-3">
    <AchievementBadge a={a} />
    <View className="min-w-0 flex-1 gap-1.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text numberOfLines={1} className="shrink text-sm font-medium">{a.title}</Text>
        <Mono className="shrink-0 text-xs text-muted-foreground">{Math.round(a.ratio * 100)}%</Mono>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full bg-primary/70" style={{ width: `${clamp01(a.ratio) * 100}%` }} />
      </View>
    </View>
  </View>;
}

/** A case of the progress grid: picture, short name and best time; untrained cases are faded. */
const CaseTile = memo(function CaseTile({ c, stats, width, onOpen }: { c: CaseDto; stats?: CaseHistoryDto; width: number; onOpen: (id: string) => void }) {
  const trained = !!stats?.summary.count;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${c.id}, ${trained ? `best ${fmtTime(stats!.summary.best)}, ${stats!.summary.count} solves` : "not trained"}`} onPress={() => onOpen(c.id)}
    className="items-center gap-1 rounded-lg px-1 pt-2.5 pb-2 active:bg-muted/50" style={{ width, opacity: trained ? 1 : 0.5 }}>
    <CaseDiagram c={c} size={Math.min(64, width - 12)} />
    <Text numberOfLines={1} className="text-xs font-medium">{shortId(c)}</Text>
    <Mono numberOfLines={1} className="text-[11px] text-muted-foreground">{trained ? fmtTime(stats!.summary.best) : "–"}</Mono>
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
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const set of sets) {
      const chosen = cases.filter(c => c.set === set.id && (stage === "all" || c.stage === stage) && (!q || matches(c, set.label, q)));
      if (!chosen.length) continue;
      const open = !closed[set.id];
      result.push({ key: set.id, kind: "set", set, trained: chosen.filter(c => byCase.has(c.id)).length, count: chosen.length, open });
      if (open) for (let i = 0; i < chosen.length; i += columns) result.push({ key: `${set.id}:${i}`, kind: "cases", cases: chosen.slice(i, i + columns) });
    }
    return result;
  }, [sets, cases, stage, q, closed, columns, byCase]);
  const key = `${scrollKey}:${columns}`;
  const scroll = usePreservedList<Row>(key);
  const previousFilter = useRef(`${stage}:${q}`);
  useEffect(() => {
    const filter = `${stage}:${q}`;
    if (filter !== previousFilter.current) scroll.ref.current?.scrollToOffset({ offset: 0, animated: false });
    previousFilter.current = filter;
  }, [stage, q]);
  const learnedCount = cases.filter(c => learned.has(c.id)).length;
  const stages = ["all", ...new Set(cases.map(c => c.stage))];
  return <View className="min-h-0 flex-1 gap-2">
    <Choice label="Stage" value={stage} onChange={setStage} options={stages.map(value => ({ id: value, label: value === "all" ? "All" : value }))} />
    <SearchField value={query} onChangeText={setQuery} placeholder="Search cases…" />
    <Text className="text-xs text-muted-foreground">{profile.cases.length} / {cases.length} trained · {learnedCount} learned</Text>
    <View className="min-h-0 flex-1" onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && <FlatList key={key} {...scroll} data={rows} keyExtractor={row => row.key}
        initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
        className="flex-1" contentContainerClassName="pb-4" keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Empty>No cases match.</Empty>}
        renderItem={({ item: row }) => row.kind === "set"
          ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: row.open }} onPress={() => setClosed({ ...closed, [row.set.id]: row.open })}
            className="mt-1 h-10 flex-row items-center gap-2 rounded-lg px-1 active:bg-muted/50">
            <Icon as={row.open ? ChevronDown : ChevronRight} size={16} className="text-muted-foreground" />
            <Text className="text-sm font-medium">{row.set.label}</Text>
            <Mono className="text-xs text-muted-foreground">{row.trained} / {row.count}</Mono>
          </Pressable>
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
  return <Sheet open={!!c} onClose={onClose} title={shown?.id ?? "Case"} description={shown ? (shown.name !== shown.id ? shown.name : shown.group) : undefined} snapPoints={["75%", "100%"]} contentClassName="px-0"
    right={shown && <Button variant="ghost" size="sm" className="h-9 gap-1.5" onPress={train}><Icon as={Timer} size={15} className="text-muted-foreground" /><Text className="text-[13px] text-muted-foreground">Train</Text></Button>}>
    {shown && <SheetScrollView style={{ flex: 1 }} contentContainerClassName="gap-4 px-5 pb-8">
      <View className="flex-row items-center gap-3">
        <CaseDiagram c={shown} size={56} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-semibold">{shown.setLabel} · {shown.group}</Text>
          <Label>{plural(data?.summary.count ?? 0, "solve")}</Label>
        </View>
      </View>
      <TimerStats compact data={data} empty="No attempts on this case yet." />
    </SheetScrollView>}
  </Sheet>;
}
