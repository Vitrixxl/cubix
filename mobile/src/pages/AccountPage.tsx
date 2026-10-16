import { useAtomValue, useSetAtom } from "jotai";
import { BookOpen, CalendarDays, ChartLine, Check, Pencil, ChevronLeft, ChevronRight, Flame, Gauge, History, NotebookPen, Settings, SlidersHorizontal, Swords, Trophy, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { fmtResult, fmtTime, plural, shortDate } from "../../../src/client/lib/format";
import { achievementLists, dayKey, journalDays, weeklyBestAo5, type JournalDay } from "../../../src/client/lib/profile";
import { level } from "../../../src/client/lib/achievements";
import { PROFILE_KEY, journeyProfile, type JourneyProfile } from "../../../src/client/lib/journey";
import { CUBES_333 } from "../../../src/shared/cubes";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { api } from "../api";
import { METHODS } from "../../../src/shared/methods";
import { attemptMode, eventInfo, eventLabel, eventOf, puzzleInfo, type EventId } from "../../../src/shared/puzzles";
import type { AchievementDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useLayout } from "../hooks/useLayout";
import { journeyAtom } from "../journey";
import { profileAchievementsAtom, profileCatalogAtom, profileDataAtom, profileKeyAtom, profilePuzzleAtom, profileSolveModeAtom, type PreparedProfile } from "../profile";
import { AchievementBadge, AchievementDialog, AchievementsScreen } from "../components/Achievements";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { Bar, Empty, Figure, HeadButton, Numeric, Segmented, Surface } from "../components/layout";
import { ProfileCaseDialog, TrainingProgress } from "../components/ProfileProgress";
import { Caption as SheetCaption, EventPicker, PuzzleGrid } from "../components/PuzzlePicker";
import { Sheet, SheetFlatList } from "../components/Sheet";
import { StatsScreen } from "../components/Stats";
import { UserAvatar } from "../components/UserAvatar";
import { WcaPill } from "../components/Wca";
import { useTourTarget } from "../tour";
import { RESULT_MARK, ao5Text, battleRecord, battles, useDuel, type DuelRecord } from "../lib/duel";
import { learnedCaseIdsAtom, profileFiltersAtom, routeAtom, userAtom, type ProfileMode } from "../state";
import { useColors } from "../theme";
import { locale, said, tr } from "../../../src/client/i18n";

const RESULT_TONE = { win: "bg-success/15", loss: "bg-destructive/15", draw: "bg-muted" } as const;
const RESULT_TEXT = { win: "text-success", loss: "text-destructive", draw: "text-muted-foreground" } as const;
/** A battle's result as its letter on a tinted square. */
function ResultMark({ b }: { b: DuelRecord }) {
  return <View className={cn("size-7 items-center justify-center rounded-md", RESULT_TONE[b.result])} accessibilityLabel={b.result}>
    <Numeric className={cn("text-xs font-semibold", RESULT_TEXT[b.result])}>{RESULT_MARK[b.result]}</Numeric>
  </View>;
}

/** Every battle kept on this device, as the web's page: its figures on a strip, then a table of the battles. */
function BattlesPage() {
  useDuel();
  const list = battles();
  const setRoute = useSetAtom(routeAtom);
  if (!list.length) return <Surface className="flex-1"><Empty icon={Swords} title={tr("No battles yet")}><Button variant="outline" accessibilityLabel={tr("Find an opponent")} onPress={() => setRoute({ page: "duel" })}><Icon as={Swords} size={16} /><Text>{tr("Duel")}</Text></Button>
  </Empty></Surface>;
  const count = (r: DuelRecord["result"]) => list.filter(b => b.result === r).length;
  const averages = list.map(b => b.ao5[0]).filter((v): v is number => v != null);
  return <>
    <Surface className="flex-row px-4 py-3" accessibilityLabel={tr("Summary")}>
      <Figure className="flex-1" label={tr("Played")} value={String(list.length)} />
      <Figure className="flex-1" label={tr("Won")} value={String(count("win"))} tone="good" />
      <Figure className="flex-1" label={tr("Lost")} value={String(count("loss"))} />
      <Figure className="flex-1" label={tr("Win rate")} value={`${Math.round((count("win") / Math.max(1, count("win") + count("loss"))) * 100)}%`} />
      <Figure className="flex-1" label={tr("Best Ao5")} value={averages.length ? fmtTime(Math.min(...averages)) : "–"} tone="accent" />
    </Surface>
    <Surface className="min-h-0 flex-1" accessibilityLabel={tr(battleRecord(list))}>
      <View className="h-10 flex-row items-center gap-3 border-b border-border px-3">
        <View className="w-7" />
        <Text className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">{tr("Opponent")}</Text>
        <Text className="w-16 text-xs font-medium text-muted-foreground">{tr("You")}</Text>
        <Text className="w-16 text-xs font-medium text-muted-foreground">{tr("Them")}</Text>
      </View>
      <FlatList data={list} keyExtractor={b => b.id} className="flex-1" showsVerticalScrollIndicator={false}
        renderItem={({ item: b }) => <View className="min-h-14 flex-row items-center gap-3 border-b border-border px-3 py-2">
          <ResultMark b={b} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-medium">{b.opponent}</Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">{shortDate(b.at)}</Text>
          </View>
          <Numeric className={cn("w-16 text-sm", b.result === "win" && "text-success")}>{ao5Text(b.ao5[0])}</Numeric>
          <Numeric className={cn("w-16 text-sm", b.result === "loss" && "text-success")}>{ao5Text(b.ao5[1])}</Numeric>
        </View>} />
    </Surface>
  </>;
}

/** The profile's prepared figures for the account and selection shown; null while they are worked out. */
function usePrepared() {
  const prepared = useAtomValue(profileDataAtom), key = useAtomValue(profileKeyAtom);
  return prepared?.key === key ? prepared : null;
}

/** The profile's own event, changed by its pickers without touching the rest of the app. */
function useProfileEvent() {
  const setFilters = useSetAtom(profileFiltersAtom);
  const cube = useAtomValue(profilePuzzleAtom), solveMode = useAtomValue(profileSolveModeAtom);
  const value = eventOf(cube, solveMode)?.id ?? cube;
  const onChange = (id: EventId) => {
    const event = eventInfo(id);
    if (event) setFilters(f => ({ ...f, cube: event.puzzle, solveMode: event.solveMode }));
  };
  return { value, onChange, label: tr(eventInfo(value)?.label ?? puzzleInfo(cube).label) };
}

/** A small upper-case heading over a group, its link at the end. */
function Caption({ children, link }: { children: ReactNode; link?: ReactNode }) {
  return <View className="min-h-7 flex-row items-center gap-2">
    <Text className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{children}</Text>
    {link ? <View className="ml-auto">{link}</View> : null}
  </View>;
}

/**
 * Who they are: the face, the name with the streak (which opens the activity), the method they solve with,
 * the level and its XP. Importing, the exports and signing out are in the settings, behind the head's gear. On a
 * tablet it is a card: `large` (portrait) with a bigger face, `compact` beside other columns.
 */
function Identity({ d, onActivity, size }: { d: PreparedProfile | null; onActivity: () => void; size?: "large" | "compact" }) {
  const user = useAtomValue(userAtom)!;
  const journey = useAtomValue(journeyAtom);
  const xp = useAtomValue(profileAchievementsAtom)?.xp ?? 0, l = level(xp);
  // The 3×3 method they solve with, the latest one they know.
  const profile = journeyProfile(journey), method = METHODS["333"].find(m => m.id === profile?.knownMethods?.["333"]?.at(-1));
  const streak = d?.streak.current ?? 0;
  const [cube, setCube] = useState(false);
  return <View className={cn("gap-2.5", size && "gap-3 rounded-3xl bg-card p-4")}>
    <View className={cn("flex-row items-center gap-3", size === "large" && "gap-4")}>
      <UserAvatar user={user} size={size === "large" ? 88 : 64} className={size === "large" ? "rounded-3xl" : "rounded-[20px]"} />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} accessibilityRole="header" className={cn("min-w-0 shrink text-2xl font-extrabold tracking-[-0.03em]", size === "large" && "text-[32px]")}>{user.username}</Text>
          <View className="flex-1" />
          <Pressable accessibilityRole="button" accessibilityLabel={tr("Activity")} accessibilityHint={tr("{0} days in a row", { 0: streak })} onPress={onActivity}
            className={cn("h-7 flex-row items-center gap-1 rounded-full px-2.5", streak ? "bg-warning/15" : "bg-muted")}>
            <Icon as={Flame} size={13} className={streak ? "text-warning" : "text-muted-foreground"} />
            <Numeric className={cn("text-xs font-bold", streak ? "text-warning" : "text-muted-foreground")}>{tr("{0} d", { 0: streak })}</Numeric>
          </Pressable>
        </View>
        {/* The method they solve with, and the 3×3 they main, a tap away from another. */}
        {/* The WCA ID beside the main cube, which keeps the name's width. */}
        {profile ? <View className="flex-row items-center gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel={tr("Main cube")} accessibilityValue={profile.mainCube ? { text: profile.mainCube } : undefined} onPress={() => setCube(true)}
            className="min-h-6 min-w-0 shrink flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 shrink text-[13px] text-muted-foreground">{[method && said(method.name), profile.mainCube ?? tr("Main cube")].filter(Boolean).join(" · ")}</Text>
            <Icon as={Pencil} size={12} className="text-muted-foreground" />
          </Pressable>
          <View className="flex-1" />
          <WcaPill profile={profile} />
        </View> : method ? <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{said(method.name)}</Text> : null}
        <View className="flex-row items-baseline justify-between gap-2" accessibilityLabel={tr("{0} XP in all", { 0: xp.toLocaleString() })}>
          <Text className="text-[13px] font-bold">{tr("Level {0}", { 0: l.level })}</Text>
          <Numeric className="text-xs font-bold text-muted-foreground">{tr("{0} / {1} XP", { 0: l.into.toLocaleString(), 1: l.span.toLocaleString() })}</Numeric>
        </View>
        <Bar ratio={l.into / l.span} className="h-1.5" />
      </View>
    </View>
    {profile && <MainCubeSheet key={String(cube)} open={cube} onClose={() => setCube(false)} profile={profile} />}
  </View>;
}

/** The 3×3 they main: the known cubes filtered as they type, a tap saving one; Save keeps any other name as typed. */
function MainCubeSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: JourneyProfile }) {
  const [query, setQuery] = useState(profile.mainCube ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const q = query.trim().toLowerCase(), matches = CUBES_333.filter(name => name.toLowerCase().includes(q)).slice(0, 40);
  const save = async (name: string) => {
    if (busy) return;
    const { mainCube: _, ...rest } = profile, chosen = name.trim().slice(0, 60);
    setBusy(true); setError("");
    try { await api.updateJourney({ [PROFILE_KEY]: chosen ? { ...rest, mainCube: chosen } : rest }); onClose(); }
    catch (e) { setError(said((e as Error).message)); } finally { setBusy(false); }
  };
  return <Sheet open={open} onClose={onClose} title={tr("Main cube")} scroll contentClassName="gap-2">
    <Input value={query} onChangeText={setQuery} accessibilityLabel={tr("Main cube")} placeholder="GAN 16 3x3 Max" maxLength={60} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => void save(query)} />
    {error ? <Alert variant="destructive">{error}</Alert> : null}
    <View className="flex-row justify-end gap-2">
      {profile.mainCube ? <Button variant="ghost" disabled={busy} onPress={() => void save("")}><Text>{tr("Remove")}</Text></Button> : null}
      <Button disabled={busy || !query.trim()} onPress={() => void save(query)}><Text>{tr("Save")}</Text></Button>
    </View>
    {matches.map(name => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: name === profile.mainCube }} disabled={busy} onPress={() => void save(name)}
      className="min-h-11 flex-row items-center justify-between gap-2 rounded-xl px-3 active:bg-muted">
      <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px]">{name}</Text>
      {name === profile.mainCube && <Icon as={Check} size={16} className="text-primary" />}
    </Pressable>)}
  </Sheet>;
}

/**
 * Each event's best single large and its best Ao5 beside it, one set this week in mint. A phone shows the profile's
 * event (else the first) on one card, every event in a drawer behind it; `list` (a tablet) makes it a card of its own,
 * the events one per row, scrolling inside it.
 */
function Records({ d, onStatistics, list, className }: { d: PreparedProfile | null; onStatistics: () => void; list?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const event = useProfileEvent();
  const week = Date.now() - 7 * 86_400_000;
  const records = (d?.profile.records ?? []).filter(r => r.best != null);
  const recent = (r: (typeof records)[number]) => !!r.lastAt && new Date(r.lastAt).getTime() > week;
  const current = records.find(r => r.event === event.value) ?? records[0];
  const row = (r: (typeof records)[number]) => <View key={r.event} className="min-h-14 flex-row items-center gap-2 rounded-2xl bg-muted px-3 py-2">
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-xs font-bold text-muted-foreground">{said(eventLabel(r.puzzle, r.solveMode))}</Text>
      <Numeric numberOfLines={1} className={cn("text-xl font-extrabold tracking-[-0.02em]", recent(r) && "text-success")}>{fmtResult(r.best, r.solveMode)}</Numeric>
    </View>
    <Numeric numberOfLines={1} className="text-[13px] font-semibold text-muted-foreground">{r.bestAo5 != null && !attemptMode(r.solveMode) ? tr("Ao5 {0}", { 0: fmtTime(r.bestAo5) }) : "–"}</Numeric>
  </View>;
  return <View className={cn("gap-1", list && "min-h-0 gap-2 rounded-3xl bg-card p-3.5", className)}>
    <Caption link={<Pressable accessibilityRole="button" onPress={onStatistics} className="h-8 flex-row items-center gap-0.5 pl-2">
      <Text className="text-[13px] font-bold text-primary">{tr("Statistics")}</Text><Icon as={ChevronRight} size={15} className="text-primary" />
    </Pressable>}>{tr("Records")}</Caption>
    {!d ? <Skeleton className="h-14 rounded-2xl" /> : records.length && list ? <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-1.5" showsVerticalScrollIndicator={false}>
      {records.map(row)}
    </ScrollView> : current ? <>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Records")} onPress={() => setOpen(true)} className="min-h-14 flex-row items-center gap-3 rounded-2xl bg-card px-3 py-2 active:bg-muted">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-xs font-bold text-muted-foreground">{said(eventLabel(current.puzzle, current.solveMode))}</Text>
          <View className="flex-row items-baseline gap-2">
            <Numeric numberOfLines={1} className={cn("text-xl font-extrabold tracking-[-0.02em]", recent(current) && "text-success")}>{fmtResult(current.best, current.solveMode)}</Numeric>
            {current.bestAo5 != null && !attemptMode(current.solveMode) && <Numeric numberOfLines={1} className="text-xs font-semibold text-muted-foreground">{tr("Ao5 {0}", { 0: fmtTime(current.bestAo5) })}</Numeric>}
          </View>
        </View>
        <Icon as={Trophy} size={15} className="text-muted-foreground" />
        <Numeric className="text-[13px] font-bold text-muted-foreground">{records.length}</Numeric>
        <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={tr("Records")} scroll contentClassName="gap-1.5">{records.map(row)}</Sheet>
    </> : <Text className="text-[13px] text-muted-foreground">{tr("No times yet")}</Text>}
  </View>;
}

/**
 * The profile's other pages as four shortcuts, each with its count. On a tablet the statistics join them, as 48 dp
 * pills on one `row` (portrait) or two by two (`grid`, in a column).
 */
function Shortcuts({ learned, unlocked, battlesCount, show, layout }: { learned: number; unlocked: number | null; battlesCount: number; show: (route: ProfileMode | "analysis") => void; layout?: "row" | "grid" }) {
  const items: [ProfileMode | "analysis", LucideIcon, string, number | null][] = [
    ...(layout ? [["playground", ChartLine, tr("Statistics"), null] as [ProfileMode, LucideIcon, string, null]] : []),
    ["analysis", Gauge, tr("Analysis"), null], ["training", BookOpen, tr("Cases"), learned], ["achievements", Trophy, tr("Awards"), unlocked], ["duels", Swords, tr("Battles"), battlesCount],
  ];
  if (layout) return <View className={cn("flex-row gap-2", layout === "grid" && "flex-wrap")}>
    {items.map(([id, icon, label, count]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={count != null ? `${label} ${count}` : label} onPress={() => show(id)}
      className={cn("h-12 min-w-0 flex-row items-center justify-center gap-2 rounded-2xl bg-card px-3 active:bg-muted", layout === "grid" ? "basis-[45%] grow" : "flex-1")}>
      <Icon as={icon} size={18} className="text-primary" />
      <Text numberOfLines={1} className="shrink text-sm font-bold">{label}{count != null ? <Text className="text-sm font-bold text-muted-foreground/70">{" "}{count}</Text> : null}</Text>
    </Pressable>)}
  </View>;
  return <View className="flex-row gap-1.5">
    {items.map(([id, icon, label, count]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={count != null ? `${label} ${count}` : label} onPress={() => show(id)}
      className="min-w-0 flex-1 items-center gap-1 rounded-2xl bg-card px-1 py-2.5 active:bg-muted">
      <Icon as={icon} size={19} className="text-primary" />
      <Text numberOfLines={1} className="text-xs font-bold">{label}{count != null ? <Text className="text-xs font-bold text-muted-foreground/70">{" "}{count}</Text> : null}</Text>
    </Pressable>)}
  </View>;
}

const FILTERS = ["all", "records", "achievements", "battles"] as const;
type Filter = (typeof FILTERS)[number];
type Day = JournalDay & { duels: DuelRecord[]; unlocked: AchievementDto[] };

/** Something that happened on a day, as a tinted pill: a record, an achievement (its badge), a battle. */
function Moment({ icon, badge, tone, children }: { icon?: LucideIcon; badge?: ReactNode; tone: "accent" | "good" | "bad" | "muted"; children: ReactNode }) {
  const ground = { accent: "bg-primary/15", good: "bg-success/15", bad: "bg-destructive/15", muted: "bg-muted" }[tone];
  const ink = { accent: "text-primary", good: "text-success", bad: "text-destructive", muted: "text-muted-foreground" }[tone];
  return <View className={cn("h-7 max-w-full flex-row items-center gap-1.5 rounded-[10px] pr-2.5 pl-2", ground)}>
    {badge ?? (icon ? <Icon as={icon} size={13} className={ink} /> : null)}
    <Text numberOfLines={1} className={cn("shrink text-[13px] font-semibold", ink)}>{children}</Text>
  </View>;
}

/**
 * The journal of the active days, newest first, scrolling inside its card: each day's solves, the event's best single
 * and Ao5, then what happened (records, achievements, battles). Its head names the puzzle (the profile's own) and the
 * kind shown; both are chosen in a sheet, which also opens the activity. `sheet`: drawn in a phone's drawer, not a card.
 */
function Journal({ d, onActivity, sheet = false }: { d: PreparedProfile | null; onActivity: () => void; sheet?: boolean }) {
  useDuel();
  const event = useProfileEvent();
  const summary = useAtomValue(profileAchievementsAtom);
  const [filter, setFilter] = useState<Filter>("all"), [filtering, setFiltering] = useState(false);
  const [picked, setPicked] = useState<AchievementDto | null>(null);
  const list = battles();
  const days = useMemo<Day[]>(() => {
    if (!d) return [];
    const duels = new Map<string, DuelRecord[]>(), unlocked = new Map<string, AchievementDto[]>();
    for (const b of list) { const key = dayKey(new Date(b.at)); duels.set(key, [...(duels.get(key) ?? []), b]); }
    for (const a of summary ? achievementLists(summary.achievements).recent : []) { const key = dayKey(new Date(a.unlockedAt!)); unlocked.set(key, [...(unlocked.get(key) ?? []), a]); }
    return journalDays(d.activity, d.profile.playground.history, d.profile.playground.ao5).map(day => ({ ...day, duels: duels.get(day.key) ?? [], unlocked: unlocked.get(day.key) ?? [] }));
  }, [d, summary, list.length]);
  const shown = days.filter(day => filter === "all" || (filter === "records" ? day.records.length : filter === "achievements" ? day.unlocked.length : day.duels.length));
  const today = dayKey(new Date());
  const kinds: { id: Filter; label: string }[] = [{ id: "all", label: tr("All") }, { id: "records", label: tr("Records") }, { id: "achievements", label: tr("Awards") }, { id: "battles", label: tr("Battles") }];
  const List = (sheet ? SheetFlatList : FlatList) as typeof FlatList;
  return <View className={sheet ? "min-h-0 shrink gap-2 px-5" : "min-h-0 flex-1 gap-2 rounded-3xl bg-card px-3.5 pt-3"}>
    <View className="flex-row items-center gap-2">
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text accessibilityRole="header" className="text-lg font-extrabold tracking-tight">{tr("Journal")}</Text>
        <Text numberOfLines={1} className="min-w-0 shrink text-[13px] font-semibold text-muted-foreground">{[event.label, filter !== "all" && kinds.find(k => k.id === filter)!.label].filter(Boolean).join(" · ")}</Text>
      </View>
      <HeadButton icon={SlidersHorizontal} label={tr("Filter")} onPress={() => setFiltering(true)} active={filter !== "all"} badge={filter !== "all" ? 1 : undefined} />
    </View>
    {/* The puzzle and the kind of moments shown, and the way to the activity's calendar. */}
    <Sheet open={filtering} onClose={() => setFiltering(false)} title={tr("Journal")} scroll contentClassName="gap-3">
      <SheetCaption>{tr("Puzzle")}</SheetCaption>
      <PuzzleGrid value={event.value} onChange={event.onChange} />
      <SheetCaption>{tr("Show")}</SheetCaption>
      <Segmented label={tr("Show")} value={filter} onChange={setFilter} options={kinds} />
      <Button variant="outline" className="mt-1 h-11 rounded-lg" onPress={() => { setFiltering(false); onActivity(); }}>
        <Icon as={CalendarDays} size={16} /><Text>{tr("Activity")}</Text>
      </Button>
    </Sheet>
    {!d ? <View className="flex-1 gap-3 pt-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></View>
      : <List data={shown} keyExtractor={day => day.key} className={sheet ? undefined : "flex-1"} contentContainerClassName="pb-3" showsVerticalScrollIndicator={false}
        initialNumToRender={8} windowSize={7}
        ListEmptyComponent={<Empty icon={NotebookPen} title={days.length ? tr("Nothing of this kind yet.") : tr("Your practice days appear here.")} />}
        renderItem={({ item: day, index }) => <View className={cn("flex-row gap-3 pt-3 pb-3.5", index > 0 && (sheet ? "border-t border-border" : "border-t border-background"))}>
          <View className="w-11 items-center">
            <Numeric className={cn("text-[28px] leading-8 font-extrabold tracking-[-0.04em]", day.key === today && "text-primary")}>{day.date.getDate()}</Numeric>
            <Text className="text-xs font-bold text-muted-foreground">{day.date.toLocaleDateString(locale(), { weekday: "short" })}</Text>
          </View>
          <View className="min-w-0 flex-1 gap-1.5">
            <Text className="text-[15px] font-bold">{plural(day.count, "solve")}
              {day.best != null ? <Text className="text-[15px] font-semibold text-muted-foreground">{` · ${tr("best {0}", { 0: fmtTime(day.best) })}`}{day.ao5 != null ? ` · ${tr("Ao5 {0}", { 0: fmtTime(day.ao5) })}` : ""}</Text> : null}
            </Text>
            <View className="flex-row flex-wrap gap-1">
              {(filter === "all" || filter === "records") && day.records.map(r => <Moment key={r.kind} icon={Trophy} tone="accent">
                {`${r.kind === "single" ? tr("Single {0}", { 0: fmtTime(r.time) }) : tr("Ao5 {0}", { 0: fmtTime(r.time) })}${r.gain != null ? ` (−${fmtTime(r.gain)})` : ""}`}
              </Moment>)}
              {(filter === "all" || filter === "achievements") && day.unlocked.map(a => <Pressable key={a.id} accessibilityRole="button" onPress={() => setPicked(a)}>
                <Moment tone="muted" badge={<AchievementBadge a={a} size={20} />}>{said(a.title)}</Moment>
              </Pressable>)}
              {(filter === "all" || filter === "battles") && day.duels.map(b => <Moment key={b.id} icon={Swords} tone={b.result === "win" ? "good" : b.result === "loss" ? "bad" : "muted"}>
                {`${b.result === "win" ? tr("Won vs {0}", { 0: b.opponent }) : b.result === "loss" ? tr("Lost vs {0}", { 0: b.opponent }) : tr("Drawn vs {0}", { 0: b.opponent })}${eventInfo(b.event) && b.event !== event.value ? ` · ${said(eventInfo(b.event)!.label)}` : ""}`}
              </Moment>)}
            </View>
          </View>
        </View>} />}
    {summary && <AchievementDialog a={picked} all={summary.achievements} onPick={setPicked} onClose={() => setPicked(null)} />}
  </View>;
}

/**
 * The Me section's first page: who they are, the records, the shortcuts and the journal, in the screen's height. A
 * tablet adds the month and the weekly averages: in portrait under the identity, the journal below; held sideways
 * (or in a short window) in columns, the journal docked at the right (without the month and weeks when too narrow:
 * the activity, opened from the streak or the journal, has them).
 */
function Overview({ show }: { show: (mode: ProfileMode | "analysis") => void }) {
  const { tablet, wide, height } = useLayout();
  const d = usePrepared();
  const catalog = useAtomValue(profileCatalogAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => { const set = new Set(learnedIds); return catalog.cases.filter(c => set.has(c.id)).length; }, [catalog.cases, learnedIds]);
  const unlocked = useAtomValue(profileAchievementsAtom)?.unlocked ?? null;
  useDuel();
  const tour = useTourTarget("profile-overview");
  const [history, setHistory] = useState(false);
  const shortcuts = (layout?: "row" | "grid") => <Shortcuts learned={learned} unlocked={unlocked} battlesCount={battles().length} show={show} layout={layout} />;
  if (tablet && (wide || height < 900)) return <View className="flex-1 flex-row">
    <View className="min-w-0 flex-1">
      <AppBar><SettingsButton /></AppBar>
      <SectionTabs />
      <View className="min-h-0 flex-1 flex-row gap-3 pt-4 pb-3 pl-7">
        <View {...tour} className="min-h-0 flex-1 gap-3">
          <Identity d={d} size="compact" onActivity={() => show("activity")} />
          <Records list d={d} onStatistics={() => show("playground")} className="flex-1" />
          {!wide && shortcuts("grid")}
        </View>
        {wide && (d ? <>
          <View className="flex-1"><MonthCard d={d} /></View>
          <View className="min-h-0 flex-1 gap-3"><WeeksCard d={d} />{shortcuts("grid")}</View>
        </> : <Skeleton className="flex-[2] rounded-3xl" />)}
      </View>
    </View>
    {/* The journal as a docked side sheet, the whole height beside the page. */}
    <View className={cn("py-3 pr-3 pl-3", wide ? "w-[404px]" : "flex-1")}><Journal d={d} onActivity={() => show("activity")} /></View>
  </View>;
  if (tablet) return <View className="flex-1">
    <AppBar><SettingsButton /></AppBar>
    <SectionTabs />
    <View className="min-h-0 flex-1 gap-3 px-7 pt-4">
      <View {...tour} className="gap-3">
        <Identity d={d} size="large" onActivity={() => show("activity")} />
        {d ? <View className="flex-row gap-3">
          <View className="flex-1"><MonthCard d={d} large /></View>
          {/* Laid over its column: the month alone sets the row's height, the records scroll inside what is left. */}
          <View className="flex-1"><View className="absolute inset-0 gap-3"><Records list d={d} onStatistics={() => show("playground")} className="flex-1" /><WeeksCard d={d} /></View></View>
        </View> : <Skeleton className="h-80 rounded-3xl" />}
      </View>
      {shortcuts("row")}
      <Journal d={d} onActivity={() => show("activity")} />
    </View>
  </View>;
  return <View className="flex-1">
    <AppBar><SettingsButton /></AppBar>
    <SectionTabs />
    <View className="min-h-0 flex-1 gap-2.5 px-4 pt-3">
      <View {...tour} className="gap-2.5">
        <Identity d={d} onActivity={() => show("activity")} />
        <Records d={d} onStatistics={() => show("playground")} />
      </View>
      <Shortcuts learned={learned} unlocked={unlocked} battlesCount={battles().length} show={show} />
      {/* The journal is a history: behind this button, in a drawer. */}
      <Pressable accessibilityRole="button" accessibilityLabel={tr("History")} onPress={() => setHistory(true)}
        className="min-h-14 flex-row items-center gap-3 rounded-2xl bg-card px-3.5 active:bg-muted">
        <Icon as={History} size={19} className="text-primary" />
        <Text className="min-w-0 flex-1 text-[15px] font-bold">{tr("History")}</Text>
        <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
    <Sheet open={history} onClose={() => setHistory(false)} title={tr("Journal")} hideTitle contentClassName="gap-0 px-0">
      <Journal sheet d={d} onActivity={() => { setHistory(false); show("activity"); }} />
    </Sheet>
  </View>;
}

/**
 * The month as a calendar: each active day marked by a bar as long as its solves, in the streak's colour while the run
 * lasts. `large` (a portrait tablet) gives the days taller cells.
 */
function MonthCard({ d, large }: { d: PreparedProfile; large?: boolean }) {
  const [shift, setShift] = useState(0);
  const now = new Date(), month = new Date(now.getFullYear(), now.getMonth() + shift, 1), today = dayKey(now);
  const counts = d.days, most = Math.max(1, ...[...counts.values()].map(v => v.count));
  const lead = (month.getDay() + 6) % 7, length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // The run still alive: back from today (or yesterday) while every day has solves.
  const run = new Set<string>();
  for (let day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (counts.has(today) ? 0 : 1)); counts.has(dayKey(day)); day.setDate(day.getDate() - 1)) run.add(dayKey(day));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: "narrow" }));
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length }, (_, i) => i + 1)];
  return <View className="gap-1 rounded-3xl bg-card px-3 pt-3 pb-2" accessibilityLabel={tr("Calendar")}>
    <View className="flex-row items-center justify-between pl-1">
      <Text className="text-lg font-extrabold capitalize">{month.toLocaleDateString(locale(), { month: "long", year: "numeric" })}</Text>
      <View className="flex-row gap-1">
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Previous month")} onPress={() => setShift(shift - 1)} className="size-10 items-center justify-center rounded-xl bg-muted active:bg-accent"><Icon as={ChevronLeft} size={18} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Next month")} disabled={shift >= 0} onPress={() => setShift(shift + 1)} className={cn("size-10 items-center justify-center rounded-xl active:bg-accent", shift >= 0 && "opacity-40")}><Icon as={ChevronRight} size={18} /></Pressable>
      </View>
    </View>
    <View className="flex-row flex-wrap">
      {weekdays.map((w, i) => <Text key={i} className="w-[14.28%] pb-0.5 text-center text-[11px] font-bold text-muted-foreground uppercase">{w}</Text>)}
      {cells.map((n, i) => {
        if (n == null) return <View key={"lead" + i} className={cn("h-9 w-[14.28%]", large && "h-11")} />;
        const date = new Date(month.getFullYear(), month.getMonth(), n), key = dayKey(date), count = counts.get(key)?.count ?? 0;
        return <View key={key} className={cn("h-9 w-[14.28%] p-0.5", large && "h-11")} accessibilityLabel={date.toLocaleDateString(locale(), { day: "numeric", month: "long" }) + (count ? " · " + plural(count, "solve") : "")}>
          <View className={cn("flex-1 items-center justify-center rounded-xl", key === today && "border-2 border-primary")}>
            <Numeric className={cn("text-[13px] font-bold", count ? "text-foreground" : "text-muted-foreground/60")}>{n}</Numeric>
            {count > 0 && <View className={cn("absolute bottom-1 h-1 rounded-full", run.has(key) ? "bg-warning" : "bg-primary")} style={{ width: 6 + (count / most) * 18 }} />}
          </View>
        </View>;
      })}
    </View>
  </View>;
}

/** The best Ao5 of each of the last ten weeks as labelled columns, the best of them in lilac. */
function WeeksCard({ d }: { d: PreparedProfile }) {
  const colors = useColors(), lilac = colors.variables["--lilac"] ?? colors.primary;
  const event = useProfileEvent();
  const weeks = useMemo(() => weeklyBestAo5(d.profile.playground.history, d.profile.playground.ao5), [d]);
  const values = weeks.map(w => w.best).filter((v): v is number => v != null);
  const low = Math.min(...values), high = Math.max(...values);
  return <View className="min-h-0 flex-1 gap-2 rounded-3xl bg-card p-3.5" accessibilityLabel={tr("Best Ao5 per week")}>
    <Caption link={values.length ? <Numeric className="text-[13px] font-bold" style={{ color: lilac }}>{fmtTime(low)}</Numeric> : undefined}>
      {tr("Best Ao5 per week")} · {event.label}
    </Caption>
    {values.length ? <View className="min-h-24 flex-1 flex-row items-end gap-1.5">
      {weeks.map(w => <View key={w.start.getTime()} className="h-full min-w-0 flex-1 items-center justify-end gap-1"
        accessibilityLabel={`${w.start.toLocaleDateString(locale(), { day: "numeric", month: "long" })}${w.best != null ? " · " + tr("Ao5 {0}", { 0: fmtTime(w.best) }) : ""}`}>
        {/* The fastest week stands tallest; the slowest still shows. */}
        <View className={cn("w-full rounded-t-md rounded-b-[3px]", w.best !== low && "bg-accent")}
          style={{ height: w.best == null ? 0 : `${high === low ? 80 : 25 + ((high - w.best) / (high - low)) * 60}%`, ...(w.best === low ? { backgroundColor: lilac } : {}) }} />
        <Numeric numberOfLines={1} className="text-[10px] font-bold text-muted-foreground" style={w.best === low ? { color: lilac } : undefined}>
          {w.start.toLocaleDateString(locale(), { day: "numeric", month: "numeric" })}
        </Numeric>
      </View>)}
    </View> : <Text className="flex-1 text-sm text-muted-foreground">{tr("No Ao5 in the last ten weeks.")}</Text>}
  </View>;
}

/** The activity, pushed from the streak or the journal: the month, the counters and the weeks. */
function Activity() {
  const d = usePrepared(), event = useProfileEvent();
  const catalog = useAtomValue(profileCatalogAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => { const set = new Set(learnedIds); return catalog.cases.filter(c => set.has(c.id)).length; }, [catalog.cases, learnedIds]);
  const tally: [string, string, boolean?][] = d ? [
    [d.streak.longest ? tr("streak · record {0}", { 0: d.streak.longest }) : tr("streak"), tr("{0} d", { 0: d.streak.current }), d.streak.current > 0],
    [tr("this week"), d.week.toLocaleString()],
    [tr("active days"), d.days.size.toLocaleString()],
    [tr("solves in all"), d.activity.length.toLocaleString()],
    [tr("training solves"), d.profile.trainingSolves.toLocaleString()],
    [tr("cases learned"), learned.toLocaleString()],
  ] : [];
  return <View className="flex-1">
    <PushedBar title={tr("Activity")}><EventPicker value={event.value} onChange={event.onChange} /></PushedBar>
    {!d ? <View className="flex-1 gap-2.5 px-4 pb-3"><Skeleton className="h-72 rounded-3xl" /><Skeleton className="flex-1 rounded-3xl" /></View>
      : <View className="min-h-0 flex-1 gap-2.5 px-4 pb-3">
        <MonthCard d={d} />
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
          {tally.map(([label, value, warm]) => <View key={label} className="w-1/3 p-[3px]">
            <View className="rounded-2xl bg-card px-3 py-2">
              <Numeric numberOfLines={1} className={cn("text-xl font-extrabold", warm && "text-warning")}>{value}</Numeric>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">{label}</Text>
            </View>
          </View>)}
        </View>
        <WeeksCard d={d} />
      </View>}
  </View>;
}

/** The cases of the profile's puzzle, pushed from the shortcuts: their progress grid, a case's statistics in a sheet. */
function Cases() {
  const d = usePrepared(), event = useProfileEvent();
  const catalog = useAtomValue(profileCatalogAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [caseId, setCaseId] = useState<string | null>(null);
  return <View className="flex-1">
    <PushedBar title={tr("Cases")}><EventPicker value={event.value} onChange={event.onChange} /></PushedBar>
    <View className="min-h-0 flex-1 px-4 pb-3">
      {d ? <>
        <TrainingProgress cases={catalog.cases} sets={catalog.sets} profile={d.profile} learned={learned} onOpen={setCaseId} scrollKey={`profile-training:${event.value}`} />
        <ProfileCaseDialog c={catalog.cases.find(c => c.id === caseId)} data={d.profile.cases.find(c => c.summary.caseId === caseId)} onClose={() => setCaseId(null)} />
      </> : <Skeleton className="flex-1 rounded-3xl" />}
    </View>
  </View>;
}

/**
 * The Me section's Profile page (direction A): the identity, the records, the shortcuts and the journal under the app
 * bar and the section's tabs. Its modes are pushed screens: the statistics (`playground`), the cases (`training`),
 * the achievements, the battles (`duels`) and the activity. The puzzle filters are the profile's own and leave the
 * rest of the app untouched.
 */
export function ProfilePage({ mode, group }: { mode?: ProfileMode; group?: string }) {
  const user = useAtomValue(userAtom), navigate = useSetAtom(routeAtom);
  if (!user) return null;
  const show = (next: ProfileMode | "analysis") => navigate(next === "analysis" ? { page: "analysis" } : { page: "profile", mode: next });
  switch (mode) {
    case "playground": return <StatsScreen />;
    case "training": return <Cases />;
    case "achievements": return <AchievementsScreen group={group} />;
    case "activity": return <Activity />;
    case "duels": return <View className="flex-1">
      <PushedBar title={tr("Battles")} />
      <View className="min-h-0 flex-1 gap-3 px-4 pb-3"><BattlesPage /></View>
    </View>;
    default: return <Overview show={show} />;
  }
}

/** The settings (with the account, the guides, importing times…), from the profile's head: the app bar has no account menu. */
function SettingsButton() {
  const navigate = useSetAtom(routeAtom);
  return <HeadButton icon={Settings} label={tr("Settings")} onPress={() => navigate({ page: "settings" })} />;
}
