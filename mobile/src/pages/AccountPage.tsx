import { useAtomValue, useSetAtom } from "jotai";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Download, FileJson, Flame, Gauge, LogIn, LogOut, NotebookPen, Settings, Sheet as SheetIcon, Swords, Trophy, Upload, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode, type Ref } from "react";
import { FlatList, Pressable, ScrollView, View, type PressableProps } from "react-native";
import { fmtTime, joinedDate, plural, shortDate } from "../../../src/client/lib/format";
import { achievementLists, dayKey, journalDays, weeklyBestAo5, type JournalDay } from "../../../src/client/lib/profile";
import { level } from "../../../src/client/lib/achievements";
import { journeyProfile } from "../../../src/client/lib/journey";
import { METHODS } from "../../../src/shared/methods";
import { eventInfo, eventLabel, eventOf, puzzleInfo, type EventId } from "../../../src/shared/puzzles";
import type { AchievementDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { journeyAtom } from "../journey";
import { profileAchievementsAtom, profileCatalogAtom, profileDataAtom, profileKeyAtom, profilePuzzleAtom, profileSolveModeAtom, type PreparedProfile } from "../profile";
import { AchievementBadge, AchievementDialog, AchievementsScreen } from "../components/Achievements";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { ImportSheet } from "../components/ImportTimes";
import { Bar, Empty, Figure, MenuItem, Numeric, Segmented, Surface } from "../components/layout";
import { ProfileCaseDialog, TrainingProgress } from "../components/ProfileProgress";
import { EventPicker } from "../components/PuzzlePicker";
import { StatsScreen } from "../components/Stats";
import { toastAtom } from "../components/Toast";
import { UserAvatar } from "../components/UserAvatar";
import { useTourTarget } from "../tour";
import { exportData } from "../lib/files";
import { RESULT_MARK, ao5Text, battleRecord, battles, useDuel, type DuelRecord } from "../lib/duel";
import { guestModeAtom, learnedCaseIdsAtom, profileFiltersAtom, routeAtom, userAtom, type ProfileMode } from "../state";
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
  if (!list.length) return <Surface className="flex-1"><Empty icon={Swords} title={tr("No battles yet")}>{tr("Race a cuber of your level, solve for solve.")}<Button variant="outline" onPress={() => setRoute({ page: "duel" })}><Icon as={Swords} size={16} /><Text>{tr("Find an opponent")}</Text></Button>
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

/** A filled button of the identity's row. */
function Action({ icon, label, square, ...props }: { icon: LucideIcon; label: string; square?: boolean } & PressableProps & { ref?: Ref<View> }) {
  // The rest (a menu trigger's press and ref) goes to the button itself.
  return <Pressable accessibilityRole="button" accessibilityLabel={label} {...props}
    className={cn("h-10 flex-row items-center justify-center gap-1.5 rounded-xl bg-muted active:bg-accent", square ? "w-10" : "min-w-0 flex-1 px-2")}>
    <Icon as={icon} size={16} className="text-foreground" />
    {!square && <Text numberOfLines={1} className="shrink text-[13px] font-bold">{label}</Text>}
  </Pressable>;
}

/**
 * Who they are: the face, the name with the streak (which opens the activity), the method and the date they joined,
 * the level and its XP; then importing, exporting, the settings and signing out.
 */
function Identity({ d, onImport, onActivity }: { d: PreparedProfile | null; onImport: () => void; onActivity: () => void }) {
  const user = useAtomValue(userAtom)!;
  const journey = useAtomValue(journeyAtom), navigate = useSetAtom(routeAtom), toast = useSetAtom(toastAtom);
  const xp = useAtomValue(profileAchievementsAtom)?.xp ?? 0, l = level(xp);
  const [loggingOut, setLoggingOut] = useState(false);
  // The 3×3 method they solve with, the latest one they know.
  const method = METHODS["333"].find(m => m.id === journeyProfile(journey)?.knownMethods?.["333"]?.at(-1));
  const line = [method && said(method.name), !user.isGuest && tr("Joined {0}", { 0: joinedDate(user.createdAt) })].filter(Boolean).join(" · ");
  const download = (kind: "csv" | "json") => void exportData(kind).catch(e => toast({ title: (e as Error).message }));
  const setGuest = useSetAtom(guestModeAtom);
  // Without an account, the same place leads to the sign-in screen.
  const logOut = async () => { if (user.isGuest) return setGuest(false); if (loggingOut) return; setLoggingOut(true); try { await api.logout(); } finally { setLoggingOut(false); } };
  const streak = d?.streak.current ?? 0;
  return <View className="gap-2.5">
    <View className="flex-row items-center gap-3">
      <UserAvatar user={user} size={64} className="rounded-[20px]" />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} accessibilityRole="header" className="min-w-0 shrink text-2xl font-extrabold tracking-[-0.03em]">{user.username}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={tr("Activity")} accessibilityHint={tr("{0} days in a row", { 0: streak })} onPress={onActivity}
            className={cn("h-7 flex-row items-center gap-1 rounded-full px-2.5", streak ? "bg-warning/15" : "bg-muted")}>
            <Icon as={Flame} size={13} className={streak ? "text-warning" : "text-muted-foreground"} />
            <Numeric className={cn("text-xs font-bold", streak ? "text-warning" : "text-muted-foreground")}>{tr("{0} d", { 0: streak })}</Numeric>
          </Pressable>
        </View>
        <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{line}</Text>
        <View className="flex-row items-baseline justify-between gap-2" accessibilityLabel={tr("{0} XP in all", { 0: xp.toLocaleString() })}>
          <Text className="text-[13px] font-bold">{tr("Level {0}", { 0: l.level })}</Text>
          <Numeric className="text-xs font-bold text-muted-foreground">{tr("{0} / {1} XP", { 0: l.into.toLocaleString(), 1: l.span.toLocaleString() })}</Numeric>
        </View>
        <Bar ratio={l.into / l.span} className="h-1.5" />
      </View>
    </View>
    <View className="flex-row gap-1.5">
      <Action icon={Upload} label={tr("Import")} onPress={onImport} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Action icon={Download} label={tr("Export")} /></DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-60 rounded-2xl">
          <MenuItem icon={SheetIcon} onPress={() => download("csv")}>{tr("My solves, as a table (CSV)")}</MenuItem>
          <MenuItem icon={FileJson} onPress={() => download("json")}>{tr("All my profile's data (JSON)")}</MenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Action icon={Settings} label={tr("Account")} onPress={() => navigate({ page: "settings" })} />
      <Action icon={user.isGuest ? LogIn : LogOut} label={user.isGuest ? tr("Sign in") : loggingOut ? tr("Logging out…") : tr("Log out")} square onPress={() => void logOut()} />
    </View>
  </View>;
}

/** Each event's best single large and its best Ao5 under it, on small cards sliding sideways; one set this week in mint. */
function Records({ d, onStatistics }: { d: PreparedProfile | null; onStatistics: () => void }) {
  const week = Date.now() - 7 * 86_400_000;
  const records = (d?.profile.records ?? []).filter(r => r.best != null);
  return <View className="gap-1">
    <Caption link={<Pressable accessibilityRole="button" onPress={onStatistics} className="h-8 flex-row items-center gap-0.5 pl-2">
      <Text className="text-[13px] font-bold text-primary">{tr("Statistics")}</Text><Icon as={ChevronRight} size={15} className="text-primary" />
    </Pressable>}>{tr("Records · single / Ao5")}</Caption>
    {!d ? <Skeleton className="h-[70px] rounded-2xl" /> : records.length ? <View className="-mx-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4">
        {records.map(r => <View key={r.event} className="w-[98px] rounded-2xl bg-card px-3 py-2">
          <Text numberOfLines={1} className="text-xs font-bold text-muted-foreground">{said(eventLabel(r.puzzle, r.solveMode))}</Text>
          <Numeric numberOfLines={1} className={cn("text-xl font-extrabold tracking-[-0.02em]", r.lastAt && new Date(r.lastAt).getTime() > week && "text-success")}>{fmtTime(r.best)}</Numeric>
          <Numeric numberOfLines={1} className="text-xs font-semibold text-muted-foreground">{r.bestAo5 != null ? tr("Ao5 {0}", { 0: fmtTime(r.bestAo5) }) : "–"}</Numeric>
        </View>)}
      </ScrollView>
    </View> : <Text className="text-[13px] text-muted-foreground">{tr("Your records appear after your first timed solves.")}</Text>}
  </View>;
}

/** The profile's other pages as four shortcuts, each with its count. */
function Shortcuts({ learned, unlocked, battlesCount, show }: { learned: number; unlocked: number | null; battlesCount: number; show: (route: ProfileMode | "analysis") => void }) {
  const items: [ProfileMode | "analysis", LucideIcon, string, number | null][] = [
    ["analysis", Gauge, tr("Analysis"), null], ["training", BookOpen, tr("Cases"), learned], ["achievements", Trophy, tr("Awards"), unlocked], ["duels", Swords, tr("Battles"), battlesCount],
  ];
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
 * and Ao5, then what happened (records, achievements, battles). The puzzle is the profile's own; the calendar opens
 * the activity.
 */
function Journal({ d, onActivity }: { d: PreparedProfile | null; onActivity: () => void }) {
  useDuel();
  const event = useProfileEvent();
  const summary = useAtomValue(profileAchievementsAtom);
  const [filter, setFilter] = useState<Filter>("all");
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
  return <View className="min-h-0 flex-1 gap-2 rounded-3xl bg-card px-3.5 pt-3">
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="text-lg font-extrabold tracking-tight">{tr("Journal")}</Text>
      <View className="flex-row items-center gap-1">
        <EventPicker value={event.value} onChange={event.onChange} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Activity")} onPress={onActivity} className="size-11 items-center justify-center rounded-xl active:bg-muted">
          <Icon as={CalendarDays} size={19} className="text-muted-foreground" />
        </Pressable>
      </View>
    </View>
    <Segmented label={tr("Show")} value={filter} onChange={setFilter}
      options={[{ id: "all", label: tr("All") }, { id: "records", label: tr("Records") }, { id: "achievements", label: tr("Awards") }, { id: "battles", label: tr("Battles") }]} />
    {!d ? <View className="flex-1 gap-3 pt-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></View>
      : <FlatList data={shown} keyExtractor={day => day.key} className="flex-1" contentContainerClassName="pb-3" showsVerticalScrollIndicator={false}
        initialNumToRender={8} windowSize={7}
        ListEmptyComponent={<Empty icon={NotebookPen} title={days.length ? tr("Nothing of this kind yet.") : tr("Your practice days appear here.")} />}
        renderItem={({ item: day, index }) => <View className={cn("flex-row gap-3 pt-3 pb-3.5", index > 0 && "border-t border-background")}>
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

/** The Me section's first page: who they are, the records, the shortcuts and the journal, in the screen's height. */
function Overview({ show }: { show: (mode: ProfileMode | "analysis") => void }) {
  const d = usePrepared();
  const catalog = useAtomValue(profileCatalogAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => { const set = new Set(learnedIds); return catalog.cases.filter(c => set.has(c.id)).length; }, [catalog.cases, learnedIds]);
  const unlocked = useAtomValue(profileAchievementsAtom)?.unlocked ?? null;
  useDuel();
  const [importing, setImporting] = useState(false);
  const tour = useTourTarget("profile-overview");
  return <View className="flex-1">
    <AppBar />
    <SectionTabs />
    <View className="min-h-0 flex-1 gap-2.5 px-4 pt-3">
      <View {...tour} className="gap-2.5">
        <Identity d={d} onImport={() => setImporting(true)} onActivity={() => show("activity")} />
        <Records d={d} onStatistics={() => show("playground")} />
      </View>
      <Shortcuts learned={learned} unlocked={unlocked} battlesCount={battles().length} show={show} />
      <Journal d={d} onActivity={() => show("activity")} />
    </View>
    <ImportSheet open={importing} onClose={() => setImporting(false)} />
  </View>;
}

/** The month as a calendar: each active day marked by a bar as long as its solves, in the streak's colour while the run lasts. */
function MonthCard({ d }: { d: PreparedProfile }) {
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
        if (n == null) return <View key={"lead" + i} className="h-9 w-[14.28%]" />;
        const date = new Date(month.getFullYear(), month.getMonth(), n), key = dayKey(date), count = counts.get(key)?.count ?? 0;
        return <View key={key} className="h-9 w-[14.28%] p-0.5" accessibilityLabel={date.toLocaleDateString(locale(), { day: "numeric", month: "long" }) + (count ? " · " + plural(count, "solve") : "")}>
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
      <PushedBar title={tr("Battles")} sub={battles().length ? plural(battles().length, "battle") : undefined} />
      <View className="min-h-0 flex-1 gap-3 px-4 pb-3"><BattlesPage /></View>
    </View>;
    default: return <Overview show={show} />;
  }
}
