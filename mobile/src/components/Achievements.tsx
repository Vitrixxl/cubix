/**
 * The achievements, as the web's (desktop/renderer/profile/achievements.tsx) on a phone: a pushed screen with the puzzle
 * and Unlocked / To do, the category on a button (every one a card in a drawer, its dots coloured once unlocked), then the
 * journal: the unlocked ones month by month, or those to do from the closest. A badge opens its sheet in a full-screen
 * dialog: what it asks, where it stands, its series and the closest ones of its category. On a tablet the journal's
 * achievements are rows, two by two, and on a wide screen the chosen one's sheet stays docked at the right.
 */
import { useAtomValue, useSetAtom } from "jotai";
import { BookOpen, ChevronDown, Eye, Flame, Gauge, Layers, Share2, Target, Timer, Trophy, X, type LucideIcon } from "lucide-react-native";
import { memo, useMemo, useState, type ReactNode } from "react";
import { FlatList, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { achievementBadge, achievementKind, achievementSeries, isTimeGoal, level } from "../../../src/client/lib/achievements";
import { fmtTime, plural } from "../../../src/client/lib/format";
import { sets as catalogSets } from "../../../src/client/local/catalog";
import { eventOf, type PuzzleId } from "../../../src/shared/puzzles";
import type { AchievementCategory, AchievementDto, AchievementSummaryDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { local } from "../api";
import { profileAchievementsAtom, profilePuzzleAtom } from "../profile";
import { eventAtom, puzzleAtom, routeAtom } from "../state";
import { useColors } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { useShareSolve } from "../hooks/useShareSolve";
import { PushedBar } from "./AppBar";
import { Bar, Empty, Numeric, Segmented } from "./layout";
import { ChoiceButton } from "./PuzzlePicker";
import { Sheet } from "./Sheet";
import { useSolveMenu } from "./SolveMenus";
import { localFormat, said, tr } from "../../../src/client/i18n";

type A = AchievementDto;

/** The categories in their order: each one's name and icon (its badges, its card). */
export const CATEGORIES: { id: AchievementCategory; label: string; icon: LucideIcon }[] = [
  { id: "speed", label: "Speed", icon: Timer },
  { id: "average", label: "Averages", icon: Gauge },
  { id: "volume", label: "Volume", icon: Layers },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "dedication", label: "Dedication", icon: Flame },
];
export const categoryOf = (a: { category: string }) => CATEGORIES.find(c => c.id === a.category) ?? CATEGORIES[0]!;

/**
 * An achievement's badge, the same wherever one shows: its category's icon over its goal (10, 1:00, OLL…), tinted with
 * the app's colour once unlocked; until then a quiet disc whose ring fills with the progress. Small ones keep the goal
 * only.
 */
export const AchievementBadge = memo(function AchievementBadge({ a, size = 44 }: { a: A; size?: number }) {
  const colors = useColors();
  const value = achievementBadge(a, catalogSets), small = size < 44, r = 18, round = 2 * Math.PI * r, tone = a.unlocked ? "text-primary" : "text-muted-foreground";
  return <View importantForAccessibility="no-hide-descendants" className={cn("items-center justify-center rounded-full", a.unlocked ? "bg-primary/15" : "bg-muted")}
    style={{ width: size, height: size }}>
    {!a.unlocked && <Svg width={size} height={size} viewBox="0 0 40 40" style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={20} cy={20} r={r} fill="none" strokeWidth={2.6} stroke={colors.variables["--accent"] ?? colors.border} />
      <Circle cx={20} cy={20} r={r} fill="none" strokeWidth={2.6} stroke={colors.primary} strokeLinecap="round" strokeDasharray={`${Math.max(0.005, a.ratio) * round} ${round}`} />
    </Svg>}
    {!small && <Icon as={categoryOf(a).icon} size={Math.round(size * 0.3)} strokeWidth={2.4} className={cn("mb-0.5", tone)} />}
    <Numeric className={cn("font-extrabold tracking-[-0.03em]", tone)}
      style={{ fontSize: Math.round(size * (value.length > 4 ? 0.2 : small ? 0.36 : 0.26)), lineHeight: Math.round(size * (value.length > 4 ? 0.24 : small ? 0.42 : 0.3)) }}>{value}</Numeric>
  </View>;
});

/** The series' names, after what they count. */
const SERIES: Record<string, string> = {
  single: "Single", ao5: "Average of 5", oh: "One-handed", bld: "Blindfolded", solves: "Solves", sets: "Algorithm sets",
  algorithms: "Algorithms learned", times: "Times recorded", drills: "Drills", days: "Active days", streak: "Streaks",
};
/** What a count goal counts, one at a time. */
const NOUN: Record<string, string> = { solves: "solve", times: "solve", drills: "solve", bld: "solve", days: "day", streak: "day", sets: "case", algorithms: "case" };

/** What is left to unlock it: "0.06 to go", "3 solves to go"; none before a first solve. */
function left(a: A) {
  if (a.unlocked) return "";
  if (isTimeGoal(a)) return a.progress ? tr("{0} to go", { 0: fmtTime(a.progress - a.target + 1) }) : tr("No solve yet");
  return tr("{0} to go", { 0: plural(a.target - a.progress, NOUN[achievementKind(a)] ?? "solve") });
}

/** What moves it on: the timer of its event, the training, or the algorithms of its set. */
function useNext() {
  const navigate = useSetAtom(routeAtom), setEvent = useSetAtom(eventAtom), setPuzzle = useSetAtom(puzzleAtom);
  return (a: A): { label: string; name?: string; icon: LucideIcon; go: () => void } => {
    const kind = achievementKind(a), puzzle = a.puzzle as PuzzleId | undefined;
    if (kind === "sets") {
      const set = catalogSets.find(v => `learn:${v.id}` === a.id);
      return { label: tr("Learn"), name: tr("Learn {0}", { 0: said(set?.label ?? a.group) }), icon: BookOpen, go: () => {
        if (puzzle) setPuzzle(puzzle);
        navigate(set ? { page: "algorithms", set: set.id } : { page: "algorithms" });
      } };
    }
    if (kind === "algorithms") return { label: tr("Algorithms"), icon: BookOpen, go: () => navigate({ page: "algorithms" }) };
    if (kind === "drills") return { label: tr("Train"), icon: Target, go: () => navigate({ page: "training" }) };
    if (!puzzle) return { label: tr("Timer"), icon: Timer, go: () => navigate({ page: "playground" }) };
    const event = eventOf(puzzle, kind === "oh" ? "one-handed" : kind === "bld" ? "blindfolded" : "standard");
    return { label: tr("Timer"), icon: Timer, go: () => { setEvent(event?.id ?? puzzle); navigate({ page: "playground" }); } };
  };
}

const latestFirst = (list: A[]) => [...list].sort((x, y) => (y.unlockedAt ?? "").localeCompare(x.unlockedAt ?? ""));
const closestFirst = (list: A[]) => [...list].sort((x, y) => y.ratio - x.ratio);
const closest = (list: A[]) => closestFirst(list.filter(a => !a.unlocked && a.ratio > 0));
const MONTH = localFormat({ month: "long", year: "numeric" }), DAY = localFormat({ day: "numeric", month: "short" }), DATE = localFormat({ day: "numeric", month: "short", year: "numeric" });
/** How far from unlocked, the bands of the list still to do. */
const BANDS: [string, (a: A) => boolean][] = [
  ["Almost", a => a.ratio >= 0.9],
  ["On the way", a => a.ratio >= 0.5 && a.ratio < 0.9],
  ["Further", a => a.ratio > 0 && a.ratio < 0.5],
  ["Not started", a => a.ratio === 0],
];

/** The pushed screen: its head with the level, the filters, the categories, the journal; `group` preselects a puzzle. */
export function AchievementsScreen({ group: initialGroup }: { group?: string }) {
  const summary = useAtomValue(profileAchievementsAtom);
  const xp = summary?.xp ?? 0;
  // A tablet shows the level with its XP over the journal instead.
  const { tablet } = useLayout();
  const head = <PushedBar title={tr("Awards")}>
    {!tablet && <View className="h-8 justify-center rounded-full bg-primary/15 px-3"><Text className="text-[13px] font-bold text-primary">{tr("Level {0}", { 0: level(xp).level })}</Text></View>}
  </PushedBar>;
  return summary ? <Journal summary={summary} initialGroup={initialGroup} head={head} /> : <View className="flex-1">
    {head}
    <View className="flex-1 gap-3 px-4 pb-3">
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="flex-1 rounded-3xl" />
    </View>
  </View>;
}

type Row = { key: string } & ({ kind: "head"; title: string; count: number } | { kind: "tiles"; items: A[] });

function Journal({ summary, initialGroup, head }: { summary: AchievementSummaryDto; initialGroup?: string; head: ReactNode }) {
  const all = summary.achievements, profilePuzzle = useAtomValue(profilePuzzleAtom);
  const { tablet, wide } = useLayout();
  // Tiles three by three on a phone, rows two by two on a tablet.
  const per = tablet ? 2 : 3;
  const [group, setGroup] = useState(initialGroup && all.some(a => a.group === initialGroup) ? initialGroup : "all");
  const [mode, setMode] = useState<"unlocked" | "locked">("unlocked");
  const [category, setCategory] = useState("all");
  const [picked, setPicked] = useState<A | null>(null);
  // The profile's puzzle first, then the others in their order.
  const groups = useMemo(() => [...new Set(all.map(a => a.group))].sort((a, b) =>
    Number(all.find(v => v.group === b)?.puzzle === profilePuzzle) - Number(all.find(v => v.group === a)?.puzzle === profilePuzzle)), [all, profilePuzzle]);
  const inGroup = useMemo(() => all.filter(a => group === "all" || a.group === group), [all, group]);
  const unlocked = inGroup.filter(a => a.unlocked).length;
  const pool = useMemo(() => inGroup.filter(a => (category === "all" || a.category === category) && a.unlocked === (mode === "unlocked")), [inGroup, category, mode]);
  const rows = useMemo(() => {
    const sections: [string, A[]][] = [];
    if (mode === "unlocked") for (const a of latestFirst(pool)) {
      const key = a.unlockedAt ? MONTH.format(new Date(a.unlockedAt)) : tr("Without a date"), last = sections.at(-1);
      if (last?.[0] === key) last[1].push(a); else sections.push([key, [a]]);
    }
    else for (const [name, test] of BANDS) { const items = closestFirst(pool).filter(test); if (items.length) sections.push([tr(name), items]); }
    const result: Row[] = [];
    for (const [title, items] of sections) {
      result.push({ key: "head:" + title, kind: "head", title, count: items.length });
      for (let i = 0; i < items.length; i += per) result.push({ key: items[i]!.id, kind: "tiles", items: items.slice(i, i + per) });
    }
    return result;
  }, [pool, mode, per]);
  // Docked on a wide screen, the sheet shows the first of the list until one is picked.
  const docked = wide ? picked ?? rows.flatMap(row => row.kind === "tiles" ? row.items : [])[0] ?? null : null;
  const puzzle = <ChoiceButton label={tr("Puzzle")} value={group} onChange={setGroup} className="rounded-full border-0 bg-muted"
    options={[{ id: "all", label: tr("All") }, ...groups.map(id => ({ id, label: said(id) }))]} />;
  const show = <Segmented label={tr("Show")} value={mode} onChange={setMode} className={tablet ? (wide ? "h-12 w-72" : "h-12") : "w-52"}
    options={[{ id: "unlocked", label: tr("Unlocked"), count: unlocked }, { id: "locked", label: tr("To do"), count: inGroup.length - unlocked }]} />;
  const l = level(summary.xp);
  const content = <View className={cn("min-h-0 flex-1 gap-2.5 px-4 pb-3", tablet && "gap-3 px-7")}>
    {tablet ? <>
      {/* The count unlocked in large, the level and its XP beside it. */}
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-baseline gap-1">
          <Numeric className="text-[52px] leading-[56px] font-extrabold tracking-[-0.04em]">{unlocked}</Numeric>
          <Numeric className="text-lg font-bold text-muted-foreground">/ {inGroup.length}</Numeric>
        </View>
        <View className="min-w-0 flex-1 gap-1.5" accessibilityLabel={tr("{0} XP in all", { 0: summary.xp.toLocaleString() })}>
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="text-[15px] font-bold">{tr("Level {0}", { 0: l.level })}</Text>
            <Numeric className="text-xs font-bold text-muted-foreground">{tr("{0} / {1} XP", { 0: l.into.toLocaleString(), 1: l.span.toLocaleString() })}</Numeric>
          </View>
          <Bar ratio={l.into / l.span} className="h-2" />
        </View>
        {puzzle}
        {wide && show}
      </View>
      {!wide && show}
    </> : <View className="flex-row items-center justify-between gap-2">{puzzle}{show}</View>}
    <Categories items={inGroup} category={category} onChange={setCategory} />
    <View className="min-h-0 flex-1 rounded-3xl bg-card pt-3 pl-3.5">
      <Text className="pr-3.5 text-lg font-extrabold tracking-tight">{mode === "unlocked" ? tr("Your journal") : tr("To unlock")}</Text>
      <FlatList data={rows} keyExtractor={row => row.key} className="flex-1" contentContainerClassName="gap-1.5 pr-3.5 pt-1 pb-3" showsVerticalScrollIndicator={false}
        initialNumToRender={8} windowSize={7}
        ListEmptyComponent={<Empty icon={Trophy} title={mode === "unlocked" ? tr("Nothing unlocked yet") : tr("Everything here is unlocked.")} />}
        renderItem={({ item: row }) => row.kind === "head"
          ? <View className="flex-row items-baseline gap-2 pt-2.5"><Text className="text-[15px] font-extrabold capitalize">{row.title}</Text><Numeric className="text-xs text-muted-foreground">{plural(row.count, "achievement")}</Numeric></View>
          : <View className={cn("flex-row gap-1.5", tablet && "gap-2")}>
            {row.items.map(a => tablet ? <Line key={a.id} a={a} on={a.id === docked?.id} onPress={() => setPicked(a)} /> : <Tile key={a.id} a={a} onPress={() => setPicked(a)} />)}
            {Array.from({ length: per - row.items.length }, (_, i) => <View key={i} className="flex-1" />)}
          </View>} />
    </View>
  </View>;
  if (wide) return <View className="flex-1 flex-row">
    <View className="min-w-0 flex-1">{head}{content}</View>
    <View className="w-[404px] p-3 pl-0">
      <ScrollView className="flex-1 rounded-3xl bg-card" contentContainerClassName="gap-2.5 p-4" showsVerticalScrollIndicator={false}>
        {docked ? <AchievementDetail key={docked.id} a={docked} all={all} onPick={setPicked} docked /> : <Empty icon={Trophy} title={tr("Everything here is unlocked.")} />}
      </ScrollView>
    </View>
  </View>;
  return <View className="flex-1">
    {head}
    {content}
    <AchievementDialog a={picked} all={all} onPick={setPicked} onClose={() => setPicked(null)} />
  </View>;
}

/** An achievement of the journal: its badge, title, puzzle and its date (or what is left). */
const Tile = memo(function Tile({ a, onPress }: { a: A; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${said(a.title)}, ${said(a.group)}`} onPress={onPress}
    className="min-w-0 flex-1 items-center gap-0.5 rounded-[18px] bg-background px-1.5 pt-3 pb-2.5 active:bg-muted">
    <View className="mb-1"><AchievementBadge a={a} size={48} /></View>
    <Text numberOfLines={2} className="text-center text-[13px] leading-tight font-bold">{said(a.title)}</Text>
    <Numeric numberOfLines={1} className={cn("text-center text-xs font-semibold", a.unlocked ? "text-muted-foreground" : "text-primary")}>
      {a.unlocked ? `${said(a.group)}${a.unlockedAt ? " · " + DAY.format(new Date(a.unlockedAt)) : ""}` : left(a)}
    </Numeric>
  </Pressable>;
});

/** On a tablet, an achievement of the journal as a row: its badge, title, puzzle, category and XP, then its date or what is left. */
const Line = memo(function Line({ a, on, onPress }: { a: A; on: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${said(a.title)}, ${said(a.group)}`} onPress={onPress}
    className={cn("min-h-16 min-w-0 flex-1 flex-row items-center gap-3 rounded-[18px] px-3 py-2.5", on ? "bg-accent" : "bg-background active:bg-muted")}>
    <AchievementBadge a={a} size={44} />
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-[15px] font-bold">{said(a.title)}</Text>
      <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{said(a.group)} · {said(categoryOf(a).label)} · {a.unlocked ? tr("+{0} XP", { 0: a.xp ?? 0 }) : tr("{0} XP", { 0: a.xp ?? 0 })}</Text>
    </View>
    <Numeric numberOfLines={1} className={cn("text-xs font-bold", a.unlocked ? "text-muted-foreground" : "text-primary")}>
      {a.unlocked ? a.unlockedAt ? DAY.format(new Date(a.unlockedAt)) : "" : left(a)}
    </Numeric>
  </Pressable>;
});

/**
 * The categories that filter the journal: the one chosen on a button, every one in a drawer behind it as a card with
 * its count and a dot per achievement.
 */
function Categories({ items, category, onChange }: { items: A[]; category: string; onChange: (id: string) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const all = [{ id: "all", label: "All", icon: Trophy, colour: colors.foreground, list: items },
    ...CATEGORIES.map(c => ({ id: c.id as string, label: c.label, icon: c.icon, colour: colors.primary, list: items.filter(a => a.category === c.id) }))];
  const current = all.find(c => c.id === category) ?? all[0]!, unlocked = (list: A[]) => list.filter(a => a.unlocked).length;
  const card = ({ id, label, icon, colour, list }: (typeof all)[number]) => {
    const done = unlocked(list), on = category === id;
    return <View key={id} className="w-1/2 p-1"><Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${said(label)}, ${done} / ${list.length}`} onPress={() => { setOpen(false); onChange(id); }}
      className={cn("gap-2 rounded-2xl px-3 py-2.5", on ? "bg-accent" : "bg-card active:bg-muted")}>
      <View className="flex-row items-center gap-2">
        <View className="size-7 items-center justify-center rounded-full" style={{ backgroundColor: colour }}><Icon as={icon} size={14} className="text-background" /></View>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-bold">{said(label)}</Text>
        <Numeric className="text-xs font-bold text-muted-foreground">{done}/{list.length}</Numeric>
      </View>
      {id === "all" ? <Bar ratio={list.length ? done / list.length : 0} fill="bg-foreground" className="mt-1 h-1.5" />
        : <View className="flex-row flex-wrap gap-[3px]" importantForAccessibility="no-hide-descendants">
        {list.map(a => <View key={a.id} className="size-[7px] rounded-full" style={{ backgroundColor: a.unlocked ? colour : colors.mutedForeground, opacity: a.unlocked ? 1 : 0.3 }} />)}
      </View>}
    </Pressable></View>;
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${tr("Category")}: ${said(current.label)}`} onPress={() => setOpen(true)}
      className="h-11 flex-row items-center gap-2 self-start rounded-full bg-muted pr-3 pl-1.5 active:bg-muted/70">
      <View className="size-8 items-center justify-center rounded-full" style={{ backgroundColor: current.colour }}><Icon as={current.icon} size={15} className="text-background" /></View>
      <Text numberOfLines={1} className="text-sm font-bold">{said(current.label)}</Text>
      <Numeric className="text-xs font-bold text-muted-foreground">{unlocked(current.list)}/{current.list.length}</Numeric>
      <Icon as={ChevronDown} size={15} className="text-muted-foreground" />
    </Pressable>
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Category")} scroll>
      <View className="-m-1 flex-row flex-wrap">{all.map(card)}</View>
    </Sheet>
  </>;
}

/** One achievement in full, in a dialog over the whole screen; its series and neighbours open in place. */
export function AchievementDialog({ a, all, onPick, onClose }: { a: A | null; all: A[]; onPick: (a: A) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets(), share = useShareSolve();
  if (!a) return null;
  const solve = a.solveId != null ? local.read.solve(a.solveId) : null;
  return <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="h-14 flex-row items-center justify-between px-2">
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={X} size={22} /></Pressable>
        <Text accessibilityRole="header" className="text-[17px] font-extrabold">{tr("Achievement")}</Text>
        {solve ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Share")} onPress={() => void share(a.solveId!, said(a.title), said(a.title))} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={Share2} size={20} /></Pressable> : <View className="size-11" />}
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-2.5 px-4 pb-6">
        <AchievementDetail a={a} all={all} onPick={onPick} onLeave={onClose} />
      </ScrollView>
    </View>
  </Modal>;
}

/**
 * What an achievement asks, where it stands, the way to its solve or to move it on, its series and the closest ones of
 * its category. `onLeave` runs before a way out (the dialog closes first: the page it leads to is under it); `docked`
 * (a side sheet, on a card) puts its own blocks on wells.
 */
function AchievementDetail({ a, all, onPick, onLeave, docked }: { a: A; all: A[]; onPick: (a: A) => void; onLeave?: () => void; docked?: boolean }) {
  const { openSolve } = useSolveMenu();
  const next = useNext();
  const well = docked ? "bg-muted" : "bg-card";
  const category = categoryOf(a), go = next(a), time = isTimeGoal(a), count = a.detail.split(" / ")[0];
  const series = all.filter(x => achievementSeries(x) === achievementSeries(a)), following = series.find(x => !x.unlocked);
  const nearby = closest(all.filter(x => x.category === a.category && x.id !== a.id && x.id !== following?.id)).slice(0, 2);
  const facts: [string, string][] = a.unlocked ? [
    ...(a.unlockedAt ? [[tr("Unlocked on"), DATE.format(new Date(a.unlockedAt))] as [string, string]] : []),
    [time ? tr("Your best") : tr("Your count"), time ? fmtTime(a.progress) : `${count} / ${a.target.toLocaleString()}`],
  ] : [
    [tr("Where you are"), time ? fmtTime(a.progress, { blank: "–" }) : `${count} / ${a.target.toLocaleString()}`],
    [tr("Still to go"), time ? (a.progress ? fmtTime(a.progress - a.target + 1) : "–") : plural(a.target - a.progress, NOUN[achievementKind(a)] ?? "solve")],
  ];
  const leave = (then: () => void) => { onLeave?.(); then(); };
  const solve = a.solveId != null ? local.read.solve(a.solveId) : null;
  const shareSolve = useShareSolve();
  return <>
    <View className="items-center gap-1">
      <AchievementBadge a={a} size={docked ? 96 : 120} />
      <Text className="mt-1.5 text-center text-[28px] leading-tight font-extrabold tracking-[-0.03em]">{said(a.title)}</Text>
      <Text className="text-center text-sm font-semibold text-muted-foreground">{said(a.group)} · {said(category.label)} · {a.unlocked ? tr("+{0} XP", { 0: a.xp ?? 0 }) : tr("{0} XP", { 0: a.xp ?? 0 })}</Text>
      <Text className="text-center text-[15px] text-muted-foreground">{said(a.description)}</Text>
    </View>
    <View className="flex-row gap-2">
      {facts.map(([label, value]) => <View key={label} className={cn("flex-1 rounded-2xl px-3.5 py-2.5", well)}>
        <Text className="text-xs font-bold text-muted-foreground">{label}</Text>
        <Numeric className="text-lg font-extrabold">{value}</Numeric>
      </View>)}
    </View>
    {a.unlocked ? solve && <View className="flex-row gap-2">
      <Button variant="secondary" className="h-11 flex-1" accessibilityLabel={tr("View the solve")} onPress={() => leave(() => openSolve(solve))}><Icon as={Eye} size={16} /><Text>{tr("Details")}</Text></Button>
      <Button variant="secondary" className="h-11 flex-1" onPress={() => void shareSolve(a.solveId!, said(a.title), said(a.title))}><Icon as={Share2} size={16} /><Text>{tr("Share")}</Text></Button>
    </View> : <Button className="h-11" accessibilityLabel={go.name ?? go.label} onPress={() => leave(go.go)}><Icon as={go.icon} size={16} className="text-primary-foreground" /><Text>{go.label}</Text></Button>}
    {series.length > 1 && <>
      <Text className="mt-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{tr("The series · {0}", { 0: `${said(SERIES[achievementKind(a)] ?? "")} ${said(a.group)}` })}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {series.map(x => <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={said(x.title)} accessibilityState={{ selected: x.id === a.id }} onPress={() => onPick(x)}
          className={cn("rounded-full p-[3px]", x.id === a.id && "border-2 border-foreground")}>
          <AchievementBadge a={x} size={38} />
        </Pressable>)}
      </View>
      {following && following.id !== a.id && <NextRow a={following} title={tr("Next: {0}", { 0: said(following.title) })} onPick={onPick} go={next(following)} onGo={leave} className={well} />}
    </>}
    {!!nearby.length && <>
      <Text className="mt-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{tr("Closest in {0}", { 0: said(category.label) })}</Text>
      {nearby.map(x => <NextRow key={x.id} a={x} title={`${said(x.title)} · ${said(x.group)}`} onPick={onPick} go={next(x)} onGo={leave} className={well} />)}
    </>}
  </>;
}

/** A locked achievement to work on: its badge and what is left, which open it, and the way to move it on beside. */
function NextRow({ a, title, onPick, go, onGo, className }: { a: A; title: string; onPick: (a: A) => void; go: { label: string; name?: string; icon: LucideIcon; go: () => void }; onGo: (then: () => void) => void; className?: string }) {
  return <View className="flex-row items-center gap-2">
    <Pressable accessibilityRole="button" onPress={() => onPick(a)} className={cn("min-w-0 flex-1 flex-row items-center gap-3 rounded-2xl bg-card px-3 py-2.5 active:bg-muted", className)}>
      <AchievementBadge a={a} size={40} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold">{title}</Text>
        <Numeric numberOfLines={1} className="text-[13px] font-bold text-primary">{left(a)}</Numeric>
      </View>
    </Pressable>
    <Button variant="secondary" className="h-11" accessibilityLabel={go.name ?? go.label} onPress={() => onGo(go.go)}><Icon as={go.icon} size={16} /><Text>{go.label}</Text></Button>
  </View>;
}
