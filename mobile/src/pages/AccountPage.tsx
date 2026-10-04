import { useAtomValue, useSetAtom } from "jotai";
import { Settings, Swords, Timer as TimerIcon } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { fmtSolve, fmtTime, joinedDate, plural, shortDate } from "../../../src/client/lib/format";
import { timerFigures } from "../../../src/client/lib/practiceSummary";
import { achievementLists, activityOf, latestOf, stageCounts, streaks } from "../../../src/client/lib/profile";
import { eventInfo, eventOf, puzzleInfo, scrambleLabel, type EventId } from "../../../src/shared/puzzles";
import type { CaseDto, ProfileDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { profileAchievementsAtom, profileCatalogAtom, profileDataAtom, profilePuzzleAtom, profileScrambleTypeAtom, profileSolveModeAtom } from "../profile";
import { AchievementList, AchievementTotal } from "../components/Achievements";
import { BackButton, Empty, HeadButton, Numeric, Page, PageHead } from "../components/layout";
import {
  AchievementBadge, EmptyLine, Goal, Heatmap, LatestSolves, MoreLink, ProfileCaseDialog, Section, Stat, Stats, SubHead, TrainingProgress, Trend, TrendLegend, TwoTone,
} from "../components/ProfileProgress";
import { ChoiceButton, EventPicker } from "../components/PuzzlePicker";
import { TimerStats } from "../components/TimesChart";
import { UserAvatar } from "../components/UserAvatar";
import { useTourTarget } from "../tour";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { RESULT_MARK, ao5Text, battleRecord, battles, useDuel, ROUNDS, type DuelRecord } from "../lib/duel";
import {
  PROFILE_SECTIONS, goBackAtom, learnedCaseIdsAtom, previousRouteAtom, profileFiltersAtom, replaceRouteAtom, routeAtom,
  settingsOpenAtom, userAtom, type ProfileMode,
} from "../state";

/** A battle's result as its letter, green for a win and red for a loss. */
function BattleMark({ b }: { b: DuelRecord }) {
  return <Numeric className={cn("text-[13px] font-semibold", b.result === "win" ? "text-success" : b.result === "loss" ? "text-destructive" : "text-muted-foreground")}>{RESULT_MARK[b.result]}</Numeric>;
}

/** Every battle kept on this device: result, opponent and event, both averages, then the five rounds. */
function BattleList() {
  useDuel();
  const list = battles();
  const setRoute = useSetAtom(routeAtom);
  if (!list.length) return <Empty className="flex-1">
    <Text className="text-sm">No battles yet.</Text>
    <Button onPress={() => setRoute({ page: "duel" })}><Text>Find an opponent</Text></Button>
  </Empty>;
  return <ScrollView className="flex-1" contentContainerClassName="gap-2 pb-4" showsVerticalScrollIndicator={false}>
    {list.map(b => <View key={b.id} className="overflow-hidden rounded-xl border border-border bg-card">
      <View className="h-14 flex-row items-center gap-3 px-3">
        <View className="size-8 items-center justify-center rounded-lg bg-muted"><BattleMark b={b} /></View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-semibold">{b.opponent}</Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">{`${eventInfo(b.event)?.label ?? b.event} · ${shortDate(b.at)}`}</Text>
        </View>
        <Numeric className="text-sm">{ao5Text(b.ao5[0])}<Text className="text-sm text-muted-foreground"> vs </Text>{ao5Text(b.ao5[1])}</Numeric>
      </View>
      <View className="h-12 flex-row border-t border-border bg-muted/30">
        {[...Array(ROUNDS).keys()].map(r => <View key={r} className={cn("flex-1 items-center justify-center gap-0.5", r > 0 && "border-l border-border")}>
          <Numeric className="text-[11.5px]">{b.mine[r] ? fmtSolve(b.mine[r]!.ms, b.mine[r]!.penalty) : "–"}</Numeric>
          <Numeric className="text-[11.5px] text-muted-foreground">{b.theirs[r] ? fmtSolve(b.theirs[r]!.ms, b.theirs[r]!.penalty) : "–"}</Numeric>
        </View>)}
      </View>
    </View>)}
  </ScrollView>;
}

const RESULT_TONE = { win: "bg-success/15", loss: "bg-destructive/15", draw: "bg-muted" } as const;
/** A battle's result as its letter on a tinted square. */
function ResultMark({ b }: { b: DuelRecord }) {
  return <View className={cn("size-7 items-center justify-center rounded-md", RESULT_TONE[b.result])}><BattleMark b={b} /></View>;
}

function overviewData(profile: ProfileDto, cases: CaseDto[], learned: ReadonlySet<string>) {
  const trainedIds = new Set(profile.cases.map(c => c.summary.caseId));
  const activity = activityOf(profile);
  return {
    timer: profile.playground.summary, history: profile.playground.history, ao5: profile.playground.ao5,
    learned: cases.filter(c => learned.has(c.id)).length, trained: trainedIds.size, stages: stageCounts(cases, learned, trainedIds),
    activity, latest: latestOf(activity), streak: streaks(activity).current,
  };
}
type Overview = ReturnType<typeof overviewData>;

/** One figure of the strip under the identity: a big tabular number over its label; an empty one is a faded dash. */
function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  const empty = value === "–";
  return <View className={cn("min-w-0 flex-1 gap-0.5 px-3 py-3", className)} accessibilityLabel={`${label}: ${empty ? "none" : value}`}>
    <Numeric numberOfLines={1} className={cn("text-2xl font-semibold tracking-tight", empty && "text-muted-foreground/60")}>{value}</Numeric>
    <Text numberOfLines={1} className="text-xs text-muted-foreground">{label}</Text>
  </View>;
}

/** Solves, active days, streak on the first row; cases learned and best single on the second: an even grid of cells. */
function KpiStrip({ solves, days, streak, learned, best }: { solves: number; days: number; streak: number; learned: number; best: string }) {
  return <View className="overflow-hidden rounded-xl border border-border bg-card" accessibilityLabel="Your figures">
    <View className="flex-row">
      <Kpi label={solves === 1 ? "Solve" : "Solves"} value={solves.toLocaleString()} />
      <Kpi label={days === 1 ? "Active day" : "Active days"} value={days.toLocaleString()} className="border-l border-border" />
      <Kpi label="Day streak" value={String(streak)} className="border-l border-border" />
    </View>
    <View className="flex-row border-t border-border">
      <Kpi label="Cases learned" value={String(learned)} />
      <Kpi label="Best single" value={best} className="border-l border-border" />
    </View>
  </View>;
}

function TimerSection({ d, label, onMore, onTimer }: { d: Overview; label: string; onMore: () => void; onTimer: () => void }) {
  const t = d.timer;
  return <Section label="Timer" title="Timer" meta={t.count ? plural(t.count, "solve") : label} onMore={t.count ? onMore : undefined} more="Statistics">
    {!t.count ? <EmptyLine action={<Button variant="outline" size="sm" className="h-9" onPress={onTimer}><Icon as={TimerIcon} size={15} /><Text>Open the timer</Text></Button>}>No timed solves yet.</EmptyLine> : <>
      <Stats>
        {/* The count is in the heading. */}
        {timerFigures(t).slice(0, 6).map(([label, value, tone]) => <Stat key={label} label={label} value={value} tone={tone} />)}
      </Stats>
      <View className="gap-2">
        <SubHead title={`Last ${Math.min(100, d.history.length)} solves`}><TrendLegend /></SubHead>
        <Trend history={d.history} averages={d.ao5} />
      </View>
      <View className="gap-1">
        <SubHead title="Latest solves"><MoreLink onPress={onMore}>View all</MoreLink></SubHead>
        <LatestSolves history={d.history} />
      </View>
    </>}
  </Section>;
}

function TrainingSection({ d, total, trainingSolves, onMore }: { d: Overview; total: number; trainingSolves: number; onMore: () => void }) {
  return <Section label="Training" title="Training" meta={`${d.learned} of ${total} learned`} onMore={onMore} more="Cases">
    <Stats>
      <Stat label="Learned" value={d.learned.toLocaleString()} tone="accent" />
      <Stat label="Trained" value={d.trained.toLocaleString()} />
      <Stat label="Solves" value={trainingSolves.toLocaleString()} />
    </Stats>
    {d.stages.length ? <View className="gap-3">
      {d.stages.map(r => <View key={r.stage} className="flex-row items-center gap-4" accessibilityLabel={`${r.stage}: ${r.learned} learned, ${r.trained} trained, ${r.total} cases`}>
        <Text className="w-14 text-sm font-medium">{r.stage}</Text>
        <TwoTone {...r} />
        <Numeric className="w-16 text-right text-xs text-muted-foreground"><Numeric className="text-xs">{r.learned}</Numeric> / {r.total}</Numeric>
      </View>)}
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1.5"><View className="size-2.5 rounded-[2px] bg-primary" /><Text className="text-xs text-muted-foreground">Learned</Text></View>
        <View className="flex-row items-center gap-1.5"><View className="size-2.5 rounded-[2px] bg-primary/35" /><Text className="text-xs text-muted-foreground">Trained</Text></View>
      </View>
    </View> : <EmptyLine>No algorithm sets for this puzzle.</EmptyLine>}
  </Section>;
}

function AchievementsSection({ onMore }: { onMore: () => void }) {
  const summary = useAtomValue(profileAchievementsAtom);
  const d = useMemo(() => {
    const { goals, recent } = achievementLists(summary.achievements);
    return { goals: goals.slice(0, 3), recent: recent.slice(0, 3) };
  }, [summary]);
  return <Section label="Achievements" title="Achievements" meta={`${summary.unlocked} of ${summary.total} unlocked`} onMore={onMore} more="All">
    <View className="gap-2">
      <SubHead title="Recently unlocked" />
      {d.recent.length ? <View className="flex-row gap-3">
        {d.recent.map(a => <View key={a.id} className="min-w-0 flex-1 items-start gap-2" accessibilityLabel={`${a.title}: ${a.description}`}>
          <AchievementBadge a={a} large />
          <View className="min-w-0 gap-0.5">
            <Text numberOfLines={2} className="text-sm leading-snug font-medium">{a.title}</Text>
            <Text className="text-xs text-muted-foreground">{a.unlockedAt ? shortDate(a.unlockedAt) : ""}</Text>
          </View>
        </View>)}
        {Array.from({ length: 3 - d.recent.length }, (_, i) => <View key={i} className="flex-1" />)}
      </View> : <EmptyLine>Your first solves unlock the first ones.</EmptyLine>}
    </View>
    <View className="gap-2">
      <SubHead title="Closest goals" />
      {d.goals.length ? <View className="gap-3">{d.goals.map(a => <Goal key={a.id} a={a} />)}</View>
        : <EmptyLine>Everything is unlocked.</EmptyLine>}
    </View>
  </Section>;
}

function BattlesSection({ onMore, onDuel }: { onMore: () => void; onDuel: () => void }) {
  useDuel();
  const list = battles();
  const won = list.filter(b => b.result === "win").length, lost = list.filter(b => b.result === "loss").length;
  return <Section label="Battles" title="Battles" meta={list.length ? battleRecord(list) : undefined} onMore={list.length ? onMore : undefined} more="History">
    {!list.length ? <EmptyLine action={<Button variant="outline" size="sm" className="h-9" onPress={onDuel}><Icon as={Swords} size={15} /><Text>Find an opponent</Text></Button>}>No battles yet.</EmptyLine> : <>
      <Stats>
        <Stat label="Played" value={String(list.length)} />
        <Stat label="Won" value={String(won)} tone="good" />
        <Stat label="Win rate" value={`${Math.round((won / Math.max(1, won + lost)) * 100)}%`} />
      </Stats>
      <View className="gap-1">
        <SubHead title="Recent battles" />
        {list.slice(0, 3).map(b => <View key={b.id} className="h-10 flex-row items-center gap-3">
          <ResultMark b={b} />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium">{b.opponent}</Text>
          <Numeric className="text-xs">{ao5Text(b.ao5[0])}<Text className="text-xs text-muted-foreground"> vs </Text>{ao5Text(b.ao5[1])}</Numeric>
          <Text className="w-12 text-right text-xs text-muted-foreground">{shortDate(b.at)}</Text>
        </View>)}
      </View>
    </>}
  </Section>;
}

/** Every achievement, by group. */
function AchievementsPage({ group }: { group?: string }) {
  const summary = useAtomValue(profileAchievementsAtom);
  return <View className="min-h-0 flex-1 gap-2">
    <AchievementTotal summary={summary} />
    <AchievementList summary={summary} initialGroup={group} scrollKey="profile-achievements" />
  </View>;
}

/**
 * The account, as the web app's profile on a phone: the player and the puzzle the statistics are about in the head,
 * the sections as tabs (Overview · Timer · Training · Awards · Battles), settings and guides in its "…" menu, and
 * signing out at the end of the overview. The puzzle, scramble and solve-mode filters are the profile's own and leave the rest of the app untouched.
 */
/** Where the guided tour shows the account page: its figures. */
function TourTarget({ name, children }: { name: string; children: React.ReactNode }) {
  return <View {...useTourTarget(name)}>{children}</View>;
}

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
  const setRoute = useSetAtom(routeAtom), replaceRoute = useSetAtom(replaceRouteAtom), goBack = useSetAtom(goBackAtom);
  const previousRoute = useAtomValue(previousRouteAtom);
  const openSettings = useSetAtom(settingsOpenAtom);
  // Everything is computed from the local workspace, so the page renders complete on first paint.
  const catalog = useAtomValue(profileCatalogAtom);
  const profile = useAtomValue(profileDataAtom);
  const [caseId, setCaseId] = useState<string | null>(null);
  const scroll = usePreservedScroll(`profile:${cube}:${solveMode}:${scrambleType}`);
  const section = mode && PROFILE_SECTIONS.some(s => s.id === mode) ? mode : "overview";
  // A section opens as a page of its own over the overview; its back arrow returns to it.
  const show = (next: ProfileMode) => setRoute({ page: "profile", mode: next });
  const back = () => previousRoute?.page === "profile" && !previousRoute.mode ? goBack() : replaceRoute({ page: "profile" });
  const d = useMemo(() => overviewData(profile, catalog.cases, learned), [profile, catalog.cases, learned]);
  // The sections under the fold, achievements first among them (the costliest to compute), come a frame after the
  // rest: the tab shows at once.
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setBelow(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!user) return null;
  const selected = catalog.cases.find(c => c.id === caseId);
  const event = eventOf(cube, solveMode);
  const eventLabel = event?.label ?? puzzleInfo(cube).label;
  const picker = <EventPicker value={event?.id ?? cube} onChange={setEvent} />;
  const sectionTitle = section === "achievements" ? "Achievements" : PROFILE_SECTIONS.find(s => s.id === section)?.label;
  if (section !== "overview") return <Page className="pb-0">
    <PageHead lead={<BackButton label="Profile" onPress={back} />} title={sectionTitle}
      sub={section === "playground" && d.timer.count ? plural(d.timer.count, "solve") : undefined}>
      {section !== "achievements" && section !== "duels" ? picker : null}
    </PageHead>
    {section === "playground" && <View className="min-h-0 flex-1 gap-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm text-muted-foreground">Scramble</Text>
        <ChoiceButton label="Scramble type" value={scrambleType} options={puzzleInfo(cube).scrambles.map(type => ({ id: type, label: scrambleLabel(type) }))}
          onChange={value => setFilters(f => ({ ...f, scrambleType: value }))} />
      </View>
      <TimerStats fill data={profile.playground} empty={<Empty className="flex-1">
        <Text className="text-sm">No times in this selection yet.</Text>
        <Button onPress={() => setRoute({ page: "playground" })}><Text>Open the timer</Text></Button>
      </Empty>} />
    </View>}
    {section === "training" && <>
      <TrainingProgress cases={catalog.cases} sets={catalog.sets} profile={profile} learned={learned} onOpen={setCaseId} scrollKey={`profile-training:${cube}:${solveMode}`} />
      <ProfileCaseDialog c={selected} data={profile.cases.find(c => c.summary.caseId === caseId)} onClose={() => setCaseId(null)} />
    </>}
    {section === "achievements" && <AchievementsPage group={group} />}
    {section === "duels" && <View className="min-h-0 flex-1 gap-2">
      <Text className="text-sm text-muted-foreground">{battles().length ? battleRecord(battles()) : "Your battles appear here."}</Text>
      <BattleList />
    </View>}
  </Page>;
  return <Page className="pb-0">
    <View className="min-h-12 flex-row items-center gap-3">
      <UserAvatar user={user} size={44} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} accessibilityRole="header" className="font-sans text-xl font-semibold tracking-tight">{user.username}</Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">Joined {joinedDate(user.createdAt)}</Text>
      </View>
      {picker}
      <HeadButton icon={Settings} label="Settings" onPress={() => openSettings(true)} />
    </View>
    {/* The scroll comes back once the whole overview is there. */}
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={below ? scroll.onContentSizeChange : undefined} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
      className="-mx-4 flex-1" contentContainerClassName="gap-3 px-4 pt-1 pb-6">
      <TourTarget name="profile-overview">
        <KpiStrip solves={profile.totalSolves} days={profile.activeDays} streak={d.streak} learned={d.learned} best={d.timer.count ? fmtTime(d.timer.best) : "–"} />
      </TourTarget>
      <Heatmap solves={d.activity} latest={d.latest} />
      <TimerSection d={d} label={eventLabel} onMore={() => show("playground")} onTimer={() => setRoute({ page: "playground" })} />
      <TrainingSection d={d} total={catalog.cases.length} trainingSolves={profile.trainingSolves} onMore={() => show("training")} />
      {below && <>
        <AchievementsSection onMore={() => show("achievements")} />
        <BattlesSection onMore={() => show("duels")} onDuel={() => setRoute({ page: "duel" })} />
      </>}
    </ScrollView>
  </Page>;
}
