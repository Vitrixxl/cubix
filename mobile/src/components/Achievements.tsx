/**
 * The achievements, as the web's (desktop/renderer/profile/achievements.tsx) on a phone: a pushed screen with the puzzle
 * and Unlocked / To do, the categories as cards sliding sideways (each one's dots coloured once unlocked), then the
 * journal: the unlocked ones month by month, or those to do from the closest. A badge opens its sheet in a full-screen
 * dialog: what it asks, where it stands, its series and the closest ones of its category.
 */
import { useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Eye, Flame, Gauge, Layers, Share2, Target, Timer, Trophy, X, type LucideIcon } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Share, View } from "react-native";
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
import { API_ORIGIN, api, local } from "../api";
import { profileAchievementsAtom, profilePuzzleAtom } from "../profile";
import { eventAtom, puzzleAtom, routeAtom } from "../state";
import { useColors } from "../theme";
import { PushedBar } from "./AppBar";
import { Bar, Empty, Numeric, Segmented } from "./layout";
import { ChoiceButton } from "./PuzzlePicker";
import { useSolveMenu } from "./SolveMenus";
import { localFormat, said, tr } from "../../../src/client/i18n";

type A = AchievementDto;

/** The categories in their order: each one's name, icon and colour token (its badges, its card). */
export const CATEGORIES: { id: AchievementCategory; label: string; icon: LucideIcon; token: string }[] = [
  { id: "speed", label: "Speed", icon: Timer, token: "primary" },
  { id: "average", label: "Averages", icon: Gauge, token: "lilac" },
  { id: "volume", label: "Volume", icon: Layers, token: "warning" },
  { id: "knowledge", label: "Knowledge", icon: BookOpen, token: "success" },
  { id: "dedication", label: "Dedication", icon: Flame, token: "destructive" },
];
export const categoryOf = (a: { category: string }) => CATEGORIES.find(c => c.id === a.category) ?? CATEGORIES[0]!;
/** A category's colour in the current theme. */
export function useCategoryColour() {
  const colors = useColors();
  return (a: { category: string }) => colors.variables[`--${categoryOf(a).token}`] ?? colors.primary;
}

/**
 * An achievement's badge, the same wherever one shows: its goal (10, 1:00, OLL…) over its unit, on a disc filled with
 * its category's colour once unlocked; until then a quiet disc whose ring fills with the progress. Small ones keep the
 * goal only.
 */
export const AchievementBadge = memo(function AchievementBadge({ a, size = 44 }: { a: A; size?: number }) {
  const colors = useColors(), colour = useCategoryColour()(a);
  const { value, unit } = achievementBadge(a), small = size < 36, r = 18, round = 2 * Math.PI * r;
  return <View importantForAccessibility="no-hide-descendants" className="items-center justify-center rounded-full"
    style={{ width: size, height: size, backgroundColor: a.unlocked ? colour : colors.muted }}>
    {!a.unlocked && <Svg width={size} height={size} viewBox="0 0 40 40" style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={20} cy={20} r={r} fill="none" strokeWidth={2.6} stroke={colors.variables["--accent"] ?? colors.border} />
      <Circle cx={20} cy={20} r={r} fill="none" strokeWidth={2.6} stroke={colour} strokeLinecap="round" strokeDasharray={`${Math.max(0.005, a.ratio) * round} ${round}`} />
    </Svg>}
    <Numeric className={cn("font-extrabold tracking-[-0.03em]", a.unlocked ? "text-background" : "text-muted-foreground")}
      style={{ fontSize: Math.round(size * (value.length > 4 ? 0.22 : small ? 0.42 : 0.3)), lineHeight: Math.round(size * (value.length > 4 ? 0.26 : small ? 0.48 : 0.34)) }}>{value}</Numeric>
    {!small && <Text className={cn("font-bold opacity-80", a.unlocked ? "text-background" : "text-muted-foreground")}
      style={{ fontSize: Math.round(size * 0.17), lineHeight: Math.round(size * 0.2) }}>{said(unit)}</Text>}
  </View>;
});

/** The series' names, after what they count. */
const SERIES: Record<string, string> = {
  single: "Single", ao5: "Average of 5", oh: "One-handed", bld: "Blindfolded", solves: "Solves", sets: "Algorithm sets",
  algorithms: "Algorithms learned", times: "Times recorded", drills: "Drills", days: "Active days", streak: "Streaks",
};
/** What a count goal counts, one at a time. */
const NOUN: Record<string, string> = { solves: "solve", times: "solve", drills: "solve", bld: "solve", days: "day", streak: "day", sets: "case", algorithms: "case" };

/** What is left to unlock it: "0.061 to go", "3 solves to go"; none before a first solve. */
function left(a: A) {
  if (a.unlocked) return "";
  if (isTimeGoal(a)) return a.progress ? tr("{0} to go", { 0: fmtTime(a.progress - a.target + 1) }) : tr("No solve yet");
  return tr("{0} to go", { 0: plural(a.target - a.progress, NOUN[achievementKind(a)] ?? "solve") });
}

/** What moves it on: the timer of its event, the training, or the algorithms of its set. */
function useNext() {
  const navigate = useSetAtom(routeAtom), setEvent = useSetAtom(eventAtom), setPuzzle = useSetAtom(puzzleAtom);
  return (a: A): { label: string; icon: LucideIcon; go: () => void } => {
    const kind = achievementKind(a), puzzle = a.puzzle as PuzzleId | undefined;
    if (kind === "sets") {
      const set = catalogSets.find(v => `learn:${v.id}` === a.id);
      return { label: tr("Learn {0}", { 0: said(set?.label ?? a.group) }), icon: BookOpen, go: () => {
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
  return <View className="flex-1">
    <PushedBar title={tr("Achievements")}>
      <View className="h-8 justify-center rounded-full bg-primary/15 px-3"><Text className="text-[13px] font-bold text-primary">{tr("Level {0}", { 0: level(xp).level })}</Text></View>
    </PushedBar>
    {summary ? <Journal summary={summary} initialGroup={initialGroup} /> : <View className="flex-1 gap-3 px-4 pb-3">
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="flex-1 rounded-3xl" />
    </View>}
  </View>;
}

type Row = { key: string } & ({ kind: "head"; title: string; count: number } | { kind: "tiles"; items: A[] });

function Journal({ summary, initialGroup }: { summary: AchievementSummaryDto; initialGroup?: string }) {
  const all = summary.achievements, profilePuzzle = useAtomValue(profilePuzzleAtom);
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
      for (let i = 0; i < items.length; i += 3) result.push({ key: items[i]!.id, kind: "tiles", items: items.slice(i, i + 3) });
    }
    return result;
  }, [pool, mode]);
  return <View className="min-h-0 flex-1 gap-2.5 px-4 pb-3">
    <View className="flex-row items-center justify-between gap-2">
      <ChoiceButton label={tr("Puzzle")} value={group} onChange={setGroup} className="rounded-full border-0 bg-muted"
        options={[{ id: "all", label: tr("All puzzles") }, ...groups.map(id => ({ id, label: said(id) }))]} />
      <Segmented label={tr("Show")} value={mode} onChange={setMode} className="w-52"
        options={[{ id: "unlocked", label: tr("Unlocked"), count: unlocked }, { id: "locked", label: tr("To do"), count: inGroup.length - unlocked }]} />
    </View>
    <Categories items={inGroup} category={category} onChange={setCategory} />
    <View className="min-h-0 flex-1 rounded-3xl bg-card pt-3 pl-3.5">
      <View className="flex-row items-baseline gap-2 pr-3.5">
        <Text className="text-lg font-extrabold tracking-tight">{mode === "unlocked" ? tr("Your journal") : tr("To unlock")}</Text>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {mode === "unlocked" ? tr("{0} achievements, latest first", { 0: pool.length }) : tr("{0} achievements, closest first", { 0: pool.length })}
        </Text>
      </View>
      <FlatList data={rows} keyExtractor={row => row.key} className="flex-1" contentContainerClassName="gap-1.5 pr-3.5 pt-1 pb-3" showsVerticalScrollIndicator={false}
        initialNumToRender={8} windowSize={7}
        ListEmptyComponent={<Empty icon={Trophy} title={mode === "unlocked" ? tr("Nothing unlocked here yet. Keep practising!") : tr("Everything here is unlocked.")} />}
        renderItem={({ item: row }) => row.kind === "head"
          ? <View className="flex-row items-baseline gap-2 pt-2.5"><Text className="text-[15px] font-extrabold capitalize">{row.title}</Text><Numeric className="text-xs text-muted-foreground">{plural(row.count, "achievement")}</Numeric></View>
          : <View className="flex-row gap-1.5">
            {row.items.map(a => <Tile key={a.id} a={a} onPress={() => setPicked(a)} />)}
            {Array.from({ length: 3 - row.items.length }, (_, i) => <View key={i} className="flex-1" />)}
          </View>} />
    </View>
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

/** The categories as cards sliding sideways that filter the journal: each one's count, and a dot per achievement. */
function Categories({ items, category, onChange }: { items: A[]; category: string; onChange: (id: string) => void }) {
  const colors = useColors();
  const card = (id: string, label: string, icon: LucideIcon, colour: string, list: A[]) => {
    const done = list.filter(a => a.unlocked).length, on = category === id;
    return <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${said(label)}, ${done} / ${list.length}`} onPress={() => onChange(id)}
      className={cn("w-[150px] gap-2 rounded-2xl px-3 py-2.5", on ? "bg-accent" : "bg-card active:bg-muted")}>
      <View className="flex-row items-center gap-2">
        <View className="size-7 items-center justify-center rounded-full" style={{ backgroundColor: colour }}><Icon as={icon} size={14} className="text-background" /></View>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-bold">{said(label)}</Text>
        <Numeric className="text-xs font-bold text-muted-foreground">{done}/{list.length}</Numeric>
      </View>
      {id === "all" ? <>
        <Bar ratio={list.length ? done / list.length : 0} fill="bg-foreground" className="mt-1 h-1.5" />
        <Text className="text-xs text-muted-foreground">{tr("{0} % unlocked", { 0: list.length ? Math.round((done / list.length) * 100) : 0 })}</Text>
      </> : <View className="flex-row flex-wrap gap-[3px]" importantForAccessibility="no-hide-descendants">
        {list.map(a => <View key={a.id} className="size-[7px] rounded-full" style={{ backgroundColor: a.unlocked ? colour : colors.mutedForeground, opacity: a.unlocked ? 1 : 0.3 }} />)}
      </View>}
    </Pressable>;
  };
  return <View className="-mx-4">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-start gap-2 px-4">
      {card("all", "All", Trophy, colors.foreground, items)}
      {CATEGORIES.map(c => card(c.id, c.label, c.icon, colors.variables[`--${c.token}`] ?? colors.primary, items.filter(a => a.category === c.id)))}
    </ScrollView>
  </View>;
}

/** One achievement in full, in a dialog over the whole screen; its series and neighbours open in place. */
export function AchievementDialog({ a, all, onPick, onClose }: { a: A | null; all: A[]; onPick: (a: A) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { openSolve } = useSolveMenu();
  const next = useNext();
  if (!a) return null;
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
  // The way out closes the dialog first: the page it leads to is under it.
  const leave = (then: () => void) => { onClose(); then(); };
  const solve = a.solveId != null ? local.read.solve(a.solveId) : null;
  const share = async () => {
    if (a.solveId == null) return;
    const url = API_ORIGIN + "/solve/" + await api.shareSolve(a.solveId);
    await Share.share({ message: `${said(a.title)} · ${url}`, title: said(a.title) }).catch(() => {});
  };
  return <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="h-14 flex-row items-center justify-between px-2">
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={X} size={22} /></Pressable>
        <Text accessibilityRole="header" className="text-[17px] font-extrabold">{tr("Achievement")}</Text>
        {solve ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Share")} onPress={() => void share()} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={Share2} size={20} /></Pressable> : <View className="size-11" />}
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-2.5 px-4 pb-6">
        <View className="items-center gap-1">
          <AchievementBadge a={a} size={120} />
          <Text className="mt-1.5 text-center text-[28px] leading-tight font-extrabold tracking-[-0.03em]">{said(a.title)}</Text>
          <Text className="text-center text-sm font-semibold text-muted-foreground">{said(a.group)} · {said(category.label)} · {a.unlocked ? tr("+{0} XP", { 0: a.xp ?? 0 }) : tr("{0} XP", { 0: a.xp ?? 0 })}</Text>
          <Text className="text-center text-[15px] text-muted-foreground">{said(a.description)}</Text>
        </View>
        <View className="flex-row gap-2">
          {facts.map(([label, value]) => <View key={label} className="flex-1 rounded-2xl bg-card px-3.5 py-2.5">
            <Text className="text-xs font-bold text-muted-foreground">{label}</Text>
            <Numeric className="text-lg font-extrabold">{value}</Numeric>
          </View>)}
        </View>
        {a.unlocked ? solve && <View className="flex-row gap-2">
          <Button variant="secondary" className="h-11 flex-1" onPress={() => leave(() => openSolve(solve))}><Icon as={Eye} size={16} /><Text>{tr("View the solve")}</Text></Button>
          <Button variant="secondary" className="h-11 flex-1" onPress={() => void share()}><Icon as={Share2} size={16} /><Text>{tr("Share")}</Text></Button>
        </View> : <Button className="h-11" onPress={() => leave(go.go)}><Icon as={go.icon} size={16} className="text-primary-foreground" /><Text>{go.label}</Text></Button>}
        {series.length > 1 && <>
          <Text className="mt-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{tr("The series · {0}", { 0: `${said(SERIES[achievementKind(a)] ?? "")} ${said(a.group)}` })}</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {series.map(x => <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={said(x.title)} accessibilityState={{ selected: x.id === a.id }} onPress={() => onPick(x)}
              className={cn("rounded-full p-[3px]", x.id === a.id && "border-2 border-foreground")}>
              <AchievementBadge a={x} size={38} />
            </Pressable>)}
          </View>
          {following && following.id !== a.id && <NextRow a={following} title={tr("Next: {0}", { 0: said(following.title) })} onPick={onPick} go={next(following)} onGo={leave} />}
        </>}
        {!!nearby.length && <>
          <Text className="mt-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">{tr("Closest in {0}", { 0: said(category.label) })}</Text>
          {nearby.map(x => <NextRow key={x.id} a={x} title={`${said(x.title)} · ${said(x.group)}`} onPick={onPick} go={next(x)} onGo={leave} />)}
        </>}
      </ScrollView>
    </View>
  </Modal>;
}

/** A locked achievement to work on: its badge and what is left, which open it, and the way to move it on beside. */
function NextRow({ a, title, onPick, go, onGo }: { a: A; title: string; onPick: (a: A) => void; go: { label: string; icon: LucideIcon; go: () => void }; onGo: (then: () => void) => void }) {
  return <View className="flex-row items-center gap-2">
    <Pressable accessibilityRole="button" onPress={() => onPick(a)} className="min-w-0 flex-1 flex-row items-center gap-3 rounded-2xl bg-card px-3 py-2.5 active:bg-muted">
      <AchievementBadge a={a} size={40} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold">{title}</Text>
        <Numeric numberOfLines={1} className="text-[13px] font-bold text-primary">{left(a)}</Numeric>
      </View>
    </Pressable>
    <Button variant="secondary" className="h-11" accessibilityLabel={go.label} onPress={() => onGo(go.go)}><Icon as={go.icon} size={16} /><Text>{go.label.split(" · ")[0]}</Text></Button>
  </View>;
}
