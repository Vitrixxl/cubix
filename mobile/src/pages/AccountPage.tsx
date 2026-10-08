import { useAtomValue, useSetAtom } from "jotai";
import { BookA, BookOpen, FileJson, LogOut, MessageCircle, Settings, Sheet as SheetIcon, Swords, Timer as TimerIcon, Trophy, Upload } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { fmtTime, joinedDate, plural, shortDate } from "../../../src/client/lib/format";
import { timerFigures } from "../../../src/client/lib/practiceSummary";
import { achievementLists, stageCounts } from "../../../src/client/lib/profile";
import { eventInfo, eventOf, scrambleLabel, puzzleInfo, type EventId } from "../../../src/shared/puzzles";
import type { CaseDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { profileAchievementsAtom, profileCatalogAtom, profileDataAtom, profileKeyAtom, profilePuzzleAtom, profileScrambleTypeAtom, profileSolveModeAtom, type PreparedProfile } from "../profile";
import { AchievementList, AchievementTotal } from "../components/Achievements";
import { ImportTimes } from "../components/ImportTimes";
import { Bar, Empty, Figure, ListGroup, ListRow, ListSkeleton, MenuItem, MoreMenu, Numeric, Page, PageHead, SectionHead, Surface } from "../components/layout";
import {
  AchievementBadge, EmptyLine, Goal, Heatmap, LatestSolves, MoreLink, ProfileCaseDialog, Section, Stat, Stats, TrainingProgress, Trend,
} from "../components/ProfileProgress";
import { ChoiceButton, EventPicker } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { TimerStats } from "../components/TimesChart";
import { toastAtom } from "../components/Toast";
import { UserAvatar } from "../components/UserAvatar";
import { useTourTarget } from "../tour";
import { useAfterPaint } from "../hooks/useAfterPaint";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { exportData } from "../lib/files";
import { RESULT_MARK, ao5Text, battleRecord, battles, useDuel, type DuelRecord } from "../lib/duel";
import {
  PROFILE_SECTIONS, guidesAtom, learnedCaseIdsAtom, notationAtom, profileFiltersAtom, replaceRouteAtom, routeAtom, settingsOpenAtom, userAtom, type ProfileMode,
} from "../state";
import { tr } from "../../../src/client/i18n";
import { msg } from "../../../src/client/i18n/msg";

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
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {list.map(b => <View key={b.id} className="min-h-14 flex-row items-center gap-3 border-b border-border px-3 py-2">
          <ResultMark b={b} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-medium">{b.opponent}</Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">{shortDate(b.at)}</Text>
          </View>
          <Numeric className={cn("w-16 text-sm", b.result === "win" && "text-success")}>{ao5Text(b.ao5[0])}</Numeric>
          <Numeric className={cn("w-16 text-sm", b.result === "loss" && "text-success")}>{ao5Text(b.ao5[1])}</Numeric>
        </View>)}
      </ScrollView>
    </Surface>
  </>;
}

function overviewData({ profile, days, years, heat, latest, streak, week, activity }: PreparedProfile, cases: CaseDto[], learned: ReadonlySet<string>) {
  const trainedIds = new Set(profile.cases.map(c => c.summary.caseId));
  return {
    timer: profile.playground.summary, history: profile.playground.history, ao5: profile.playground.ao5,
    learned: cases.filter(c => learned.has(c.id)).length, trained: trainedIds.size, stages: stageCounts(cases, learned, trainedIds),
    days, years, heat, latest, streak, week, solves: activity.length, trainingSolves: profile.trainingSolves,
  };
}
type Overview = ReturnType<typeof overviewData>;

/**
 * Who they are and how much they practise, every event together, as the web's phone: the avatar and name with the
 * page's "…" menu, then six figures two by two.
 */
function Identity({ d, onImport }: { d: Overview | null; onImport: () => void }) {
  const user = useAtomValue(userAtom)!;
  const openSettings = useSetAtom(settingsOpenAtom), openGuides = useSetAtom(guidesAtom), openNotation = useSetAtom(notationAtom);
  const toast = useSetAtom(toastAtom);
  const download = (kind: "csv" | "json") => void exportData(kind).catch(e => toast({ title: (e as Error).message }));
  return <Surface className="gap-4 p-4">
    <View className="flex-row items-center gap-3">
      <UserAvatar user={user} size={48} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} accessibilityRole="header" className="font-sans text-xl font-semibold tracking-tight">{user.username}</Text>
        <Text numberOfLines={1} className="text-sm text-muted-foreground">{tr("Joined {0}", { 0: joinedDate(user.createdAt) })}</Text>
      </View>
      <MoreMenu>
        <MenuItem icon={Upload} onPress={onImport}>{tr("Import times")}</MenuItem>
        <MenuItem icon={SheetIcon} onPress={() => download("csv")}>{tr("Export my solves (CSV)")}</MenuItem>
        <MenuItem icon={FileJson} onPress={() => download("json")}>{tr("Export all my data (JSON)")}</MenuItem>
        <MenuItem icon={BookA} onPress={() => openNotation(true)}>{tr("Notation")}</MenuItem>
        <MenuItem icon={BookOpen} onPress={() => openGuides("about")}>{tr("Guides")}</MenuItem>
        <MenuItem icon={Settings} onPress={() => openSettings(true)}>{tr("Settings")}</MenuItem>
      </MoreMenu>
    </View>
    {d ? <View className="flex-row flex-wrap gap-y-3" accessibilityLabel={tr("Summary")}>
      <Figure className="w-1/2" size="lg" label={tr("Solves")} value={d.solves.toLocaleString()} />
      <Figure className="w-1/2" size="lg" label={tr("Active days")} value={d.days.size.toLocaleString()} />
      <Figure className="w-1/2" size="lg" label={tr("Streak")} value={String(d.streak.current)} tone={d.streak.current ? "warning" : ""} />
      <Figure className="w-1/2" size="lg" label={tr("Best streak")} value={String(d.streak.longest)} />
      <Figure className="w-1/2" size="lg" label={tr("This week")} value={d.week.toLocaleString()} />
      <Figure className="w-1/2" size="lg" label={tr("Trained")} value={d.trainingSolves.toLocaleString()} />
    </View> : <Skeleton accessibilityLabel={tr("Loading your figures")} className="h-36 rounded-lg" />}
  </Surface>;
}

/** The chosen event's card: its best single beside where it stands now, its curve and its latest solves. */
function TimerSection({ d, picker, label, onMore, onTimer }: { d: Overview; picker: React.ReactNode; label: string; onMore: () => void; onTimer: () => void }) {
  const t = d.timer, all = timerFigures(t), figures = [all[0]!, ...all.slice(3, 6)];
  return <Section label={tr("Timer")} title={picker} onMore={t.count ? onMore : undefined} more={tr("Statistics")}>
    {!t.count ? <Empty icon={TimerIcon} title={tr("No {0} solves yet.", { 0: label })} className="flex-none p-2">
      <Button variant="outline" onPress={onTimer}><Icon as={TimerIcon} size={16} /><Text>{tr("Open the timer")}</Text></Button>
    </Empty> : <>
      <View className="flex-row">
        {figures.map(([label, value, tone]) => <Figure key={label} className="flex-1" label={label} value={value} tone={tone} />)}
      </View>
      <Trend history={d.history} averages={d.ao5} />
      <View className="gap-1">
        <SectionHead title={tr("Latest solves")}><MoreLink onPress={onMore}>{tr("View all")}</MoreLink></SectionHead>
        <LatestSolves history={d.history} />
      </View>
    </>}
  </Section>;
}

function TrainingSection({ d, total, onMore }: { d: Overview; total: number; onMore: () => void }) {
  return <Section label={tr("Training")} title={tr("Training")} meta={tr("{0} of {1} learned", { 0: d.learned, 1: total })} onMore={onMore} more={tr("Cases")}>
    <Stats>
      <Stat label={tr("Learned")} value={d.learned.toLocaleString()} tone="accent" />
      <Stat label={tr("Trained")} value={d.trained.toLocaleString()} />
      <Stat label={tr("Solves")} value={d.trainingSolves.toLocaleString()} />
    </Stats>
    {d.stages.length ? <View className="gap-3">
      {d.stages.map(r => <View key={r.stage} className="flex-row items-center gap-4" accessibilityLabel={tr("{0} learned · {1} trained · {2} cases", { 0: r.learned, 1: r.trained, 2: r.total })}>
        <Text className="w-14 text-sm font-medium">{r.stage}</Text>
        <Bar ratio={r.total ? r.learned / r.total : 0} behind={r.total ? r.trained / r.total : 0} className="h-1.5 min-w-12 flex-1" />
        <Numeric className="w-16 text-right text-xs text-muted-foreground"><Numeric className="text-xs text-foreground">{r.learned}</Numeric> / {r.total}</Numeric>
      </View>)}
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1.5"><View className="size-2 rounded-xs bg-primary" /><Text className="text-xs text-muted-foreground">{tr("Learned")}</Text></View>
        <View className="flex-row items-center gap-1.5"><View className="size-2 rounded-xs bg-primary/35" /><Text className="text-xs text-muted-foreground">{tr("Trained")}</Text></View>
      </View>
    </View> : <EmptyLine>{tr("No algorithm sets for this puzzle.")}</EmptyLine>}
  </Section>;
}

function AchievementsSection({ onMore }: { onMore: () => void }) {
  const summary = useAtomValue(profileAchievementsAtom);
  const d = useMemo(() => {
    if (!summary) return null;
    const { goals, recent } = achievementLists(summary.achievements);
    return { goals: goals.slice(0, 3), recent: recent.slice(0, 3) };
  }, [summary]);
  if (!summary || !d) return <SectionSkeleton title={tr("Achievements")} height={220} />;
  return <Section label={tr("Achievements")} title={tr("Achievements")} meta={tr("{0} of {1} unlocked", { 0: summary.unlocked, 1: summary.total })} onMore={onMore} more={tr("All")}>
    <View className="gap-2">
      <SectionHead title={tr("Recently unlocked")} />
      {d.recent.length ? <View className="flex-row gap-3">
        {d.recent.map(a => <View key={a.id} className="min-w-0 flex-1 items-start gap-2" accessibilityLabel={`${tr(a.title)}: ${tr(a.description)}`}>
          <AchievementBadge a={a} />
          <View className="min-w-0 gap-0.5">
            <Text numberOfLines={2} className="text-sm leading-snug font-medium">{tr(a.title)}</Text>
            <Text className="text-xs text-muted-foreground">{a.unlockedAt ? shortDate(a.unlockedAt) : ""}</Text>
          </View>
        </View>)}
        {Array.from({ length: 3 - d.recent.length }, (_, i) => <View key={i} className="flex-1" />)}
      </View> : <EmptyLine>{tr("Your first solves unlock the first ones.")}</EmptyLine>}
    </View>
    <View className="gap-2">
      <SectionHead title={tr("Closest goals")} />
      {d.goals.length ? <View className="gap-3">{d.goals.map(a => <Goal key={a.id} a={a} />)}</View>
        : <EmptyLine>{tr("Everything is unlocked.")}</EmptyLine>}
    </View>
  </Section>;
}

function BattlesSection({ onMore, onDuel }: { onMore: () => void; onDuel: () => void }) {
  useDuel();
  const list = battles();
  const won = list.filter(b => b.result === "win").length, lost = list.filter(b => b.result === "loss").length;
  return <Section label={tr("Battles")} title={tr("Battles")} meta={list.length ? tr(battleRecord(list)) : undefined} onMore={list.length ? onMore : undefined} more={tr("History")}>
    {!list.length ? <Empty title={tr("No battles yet")} className="flex-none p-2">{tr("Race a cuber of your level, solve for solve.")}<Button variant="outline" onPress={onDuel}><Icon as={Swords} size={16} /><Text>{tr("Find an opponent")}</Text></Button>
    </Empty> : <>
      <Stats>
        <Stat label={tr("Played")} value={String(list.length)} />
        <Stat label={tr("Won")} value={String(won)} tone="good" />
        <Stat label={tr("Win rate")} value={`${Math.round((won / Math.max(1, won + lost)) * 100)}%`} />
      </Stats>
      <View className="gap-1">
        <SectionHead title={tr("Recent battles")} />
        {list.slice(0, 3).map(b => <View key={b.id} className="h-10 flex-row items-center gap-3">
          <ResultMark b={b} />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium">{b.opponent}</Text>
          <Numeric className="text-xs">{ao5Text(b.ao5[0])}<Text className="text-xs text-muted-foreground">{" "}{tr("vs")}{" "}</Text>{ao5Text(b.ao5[1])}</Numeric>
          <Text className="w-12 text-right text-xs text-muted-foreground">{shortDate(b.at)}</Text>
        </View>)}
      </View>
    </>}
  </Section>;
}

/** A section still being prepared: its card and title, a placeholder for its body. */
function SectionSkeleton({ title, height }: { title: string; height: number }) {
  return <Section label={title} title={title}><Skeleton accessibilityLabel={tr("Loading {0}", { 0: title.toLowerCase() })} style={{ height }} /></Section>;
}

/** A section page whose figures are still being prepared: its summary, then rows. */
function PageSkeleton() {
  return <View className="min-h-0 flex-1 gap-3 overflow-hidden">
    <Skeleton className="h-24 rounded-xl" />
    <ListSkeleton />
  </View>;
}

/** Every achievement, by group. */
function AchievementsPage({ group }: { group?: string }) {
  const summary = useAtomValue(profileAchievementsAtom);
  if (!summary) return <PageSkeleton />;
  return <View className="min-h-0 flex-1 gap-2">
    <AchievementTotal summary={summary} />
    <AchievementList summary={summary} initialGroup={group} scrollKey="profile-achievements" />
  </View>;
}

/** Where the guided tour shows the account page: its figures. */
function TourTarget({ name, children }: { name: string; children: React.ReactNode }) {
  return <View {...useTourTarget(name)}>{children}</View>;
}

const SECTION_TITLE: Record<ProfileMode, string> = { playground: msg("Timer"), training: msg("Training"), achievements: msg("Achievements"), duels: msg("Battles") };

/**
 * The account, as the web app's profile on a phone: the sections as tabs on top (Overview · Timer · Training · Awards
 * · Battles). The overview scrolls under them: who they are with the page's "…" menu (import, export, notation, guides,
 * settings), the ways to Messages and Tournaments, the chosen event's card, the activity, training, achievements and
 * battles, then signing out. The other sections keep the screen's height and scroll inside. The puzzle, scramble and
 * solve-mode filters are the profile's own and leave the rest of the app untouched.
 */
export function ProfilePage({ mode, group }: { mode?: ProfileMode; group?: string }) {
  const setFilters = useSetAtom(profileFiltersAtom);
  const cube = useAtomValue(profilePuzzleAtom), solveMode = useAtomValue(profileSolveModeAtom);
  const scrambleType = useAtomValue(profileScrambleTypeAtom);
  const setEvent = useCallback((id: EventId) => {
    const event = eventInfo(id);
    if (event) setFilters(f => ({ ...f, cube: event.puzzle, solveMode: event.solveMode }));
  }, [setFilters]);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const user = useAtomValue(userAtom);
  const setRoute = useSetAtom(routeAtom), replaceRoute = useSetAtom(replaceRouteAtom);
  // Everything comes from the local workspace, prepared in the background (profile.ts): the page never computes it
  // while it opens. Figures prepared for another account or selection are not shown; placeholders stand in for them.
  const catalog = useAtomValue(profileCatalogAtom);
  const prepared = useAtomValue(profileDataAtom), key = useAtomValue(profileKeyAtom);
  const current = prepared?.key === key ? prepared : null, profile = current?.profile;
  const [caseId, setCaseId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false), [loggingOut, setLoggingOut] = useState(false);
  const scroll = usePreservedScroll(`profile:${cube}:${solveMode}:${scrambleType}`);
  const section = mode && mode in SECTION_TITLE ? mode : "overview";
  // A tab replaces the section shown; a card's link opens its section as a step the back button returns from.
  const pick = (next: string) => replaceRoute(next === "overview" ? { page: "profile" } : { page: "profile", mode: next as ProfileMode });
  const show = (next: ProfileMode) => setRoute({ page: "profile", mode: next });
  const d = useMemo(() => current && overviewData(current, catalog.cases, learned), [current, catalog.cases, learned]);
  // The sections under the fold come a frame after the rest: the tab shows at once.
  const below = useAfterPaint();
  if (!user) return null;
  const selected = catalog.cases.find(c => c.id === caseId);
  const event = eventOf(cube, solveMode);
  const eventLabel = tr(event?.label ?? puzzleInfo(cube).label);
  const picker = <EventPicker value={event?.id ?? cube} onChange={setEvent} />;
  const logOut = async () => { setLoggingOut(true); try { await api.logout(); } finally { setLoggingOut(false); } };
  return <Page className="pb-0">
    <Tabs value={section} onValueChange={pick}>
      <TabsList className="h-11 w-full">
        {PROFILE_SECTIONS.map(s => <TabsTrigger key={s.id} value={s.id} className="h-9 flex-1 px-1"><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className="text-xs">{tr(s.label)}</Text></TabsTrigger>)}
      </TabsList>
    </Tabs>
    {section === "overview" ? <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={below && d ? scroll.onContentSizeChange : undefined} scrollEventThrottle={64}
      showsVerticalScrollIndicator={false} className="-mx-4 flex-1" contentContainerClassName="gap-3 px-4 pt-px pb-6">
      <TourTarget name="profile-overview"><Identity d={d} onImport={() => setImporting(true)} /></TourTarget>
      <ListGroup>
        <ListRow first icon={MessageCircle} title={tr("Messages")} onPress={() => setRoute({ page: "community" })} />
        <ListRow icon={Trophy} title={tr("Tournaments")} onPress={() => setRoute({ page: "tournaments" })} />
      </ListGroup>
      {profile && d ? <>
        <TimerSection d={d} picker={picker} label={eventLabel} onMore={() => show("playground")} onTimer={() => setRoute({ page: "playground" })} />
        <Heatmap days={d.days} years={d.years} heat={d.heat} latest={d.latest} />
        <TrainingSection d={d} total={catalog.cases.length} onMore={() => show("training")} />
      </> : <>
        <SectionSkeleton title={tr("Timer")} height={360} />
        <SectionSkeleton title={tr("Activity")} height={140} />
        <SectionSkeleton title={tr("Training")} height={160} />
      </>}
      {below && <>
        <AchievementsSection onMore={() => show("achievements")} />
        <BattlesSection onMore={() => show("duels")} onDuel={() => setRoute({ page: "duel" })} />
        <Button variant="ghost" className="h-11 self-center" disabled={loggingOut} onPress={() => void logOut()}>
          <Icon as={LogOut} size={16} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Log out")}</Text>
        </Button>
      </>}
    </ScrollView> : <>
      <PageHead title={tr(SECTION_TITLE[section])} sub={section === "playground" && d?.timer.count ? plural(d.timer.count, "solve") : section === "duels" && battles().length ? plural(battles().length, "battle") : undefined}>
        {section === "playground" || section === "training" ? picker : null}
      </PageHead>
      {section === "playground" && <View className="min-h-0 flex-1 gap-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-muted-foreground">{tr("Scramble")}</Text>
          <ChoiceButton label={tr("Scramble type")} value={scrambleType} options={puzzleInfo(cube).scrambles.map(type => ({ id: type, label: scrambleLabel(type) }))}
            onChange={value => setFilters(f => ({ ...f, scrambleType: value }))} />
        </View>
        {profile ? <TimerStats fill data={profile.playground} empty={<Empty icon={TimerIcon} title={tr("No times in this selection yet.")}>
          <Button onPress={() => setRoute({ page: "playground" })}><Text>{tr("Open the timer")}</Text></Button>
        </Empty>} /> : <PageSkeleton />}
      </View>}
      {section === "training" && !profile && <PageSkeleton />}
      {section === "training" && profile && <>
        <TrainingProgress cases={catalog.cases} sets={catalog.sets} profile={profile} learned={learned} onOpen={setCaseId} scrollKey={`profile-training:${cube}:${solveMode}`} />
        <ProfileCaseDialog c={selected} data={profile.cases.find(c => c.summary.caseId === caseId)} onClose={() => setCaseId(null)} />
      </>}
      {section === "achievements" && <AchievementsPage group={group} />}
      {section === "duels" && <BattlesPage />}
    </>}
    <Sheet open={importing} onClose={() => setImporting(false)} title={tr("Import times")} scroll>
      <ImportTimes />
    </Sheet>
  </Page>;
}
