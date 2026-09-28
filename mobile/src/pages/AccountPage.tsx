import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { puzzleInfo, scrambleLabel, SOLVE_MODES, type PuzzleId, type ScrambleType, type SolveMode } from "../../../src/shared/puzzles";
import type { AchievementSummaryDto, CaseDto, ProfileDto } from "../../../src/shared/types";
import { local } from "../api";
import { deletedSolveIdAtom, goBackAtom, learnedCaseIdsAtom, previousRouteAtom, profileFiltersAtom, puzzleAtom, replaceRouteAtom, routeAtom, scrambleTypeAtom, solveModeAtom, statsVersionAtom, userAtom, type ProfileMode } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { AchievementList, AchievementTotal } from "../components/Achievements";
import { Activity, MiniBars, OverviewCard, plural, ProfileCaseDialog, Ring, Sparkline, TrainingProgress, type ActivitySolve } from "../components/ProfileProgress";
import { PuzzleSelect } from "../components/PuzzlePicker";
import { Select } from "../components/Select";
import { SettingsDialog, type AuthMode } from "../components/Settings";
import { TimerStats } from "../components/TimesChart";
import { Avatar, Btn, Empty, Label, PageHead, mono } from "../components/ui";

/** Kept here for older imports (the sync indicator's sign-in sheet); the form lives with the settings. */
export { AccountForm } from "../components/Settings";

/**
 * The web app's account page (`Profile` in desktop/renderer/main.tsx) at phone size: the overview (activity,
 * timer bests, training progress, achievements), each card opening its own page — Timer statistics,
 * Training progress, Achievements — with a back button. The puzzle, scramble and solve-mode filters are the
 * profile's own and leave the rest of the app untouched.
 */

const SECTIONS: Record<ProfileMode, string> = { playground: "Timer", training: "Training", achievements: "Achievements" };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** `ProfileFilters`: puzzle, optionally scramble type, and solve mode. */
function ProfileFilters({ cube, setCube, solveMode, setSolveMode, scrambleType, setScrambleType }: {
  cube: PuzzleId; setCube: (cube: PuzzleId) => void; solveMode: SolveMode; setSolveMode: (mode: SolveMode) => void;
  scrambleType?: ScrambleType; setScrambleType?: (type: ScrambleType) => void;
}) {
  return <>
    <PuzzleSelect value={cube} onChange={setCube} />
    {scrambleType && setScrambleType && <Select value={scrambleType} accessibilityLabel="Scramble type" minWidth={180} options={puzzleInfo(cube).scrambles.map(type => ({ value: type, label: scrambleLabel(type) }))} onChange={setScrambleType} />}
    <Select value={solveMode} accessibilityLabel="Solve mode" minWidth={180} options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={setSolveMode} />
  </>;
}

/** The next achievement to reach, by progress. */
const nextAchievement = (summary: AchievementSummaryDto) => summary.achievements.filter(a => !a.unlocked).sort((a, b) => b.ratio - a.ratio)[0];

function overviewData(profile: ProfileDto, cases: CaseDto[], learned: ReadonlySet<string>, summary: AchievementSummaryDto, scrambleType: ScrambleType) {
  const timer = profile.playground.summary;
  const learnedCount = cases.filter(c => learned.has(c.id)).length;
  const trained = profile.cases.length;
  const next = nextAchievement(summary);
  const stages = [...new Set(cases.map(c => c.stage))].map(stage => {
    const members = cases.filter(c => c.stage === stage), done = members.filter(c => learned.has(c.id)).length;
    return { label: stage, value: `${done} / ${members.length}`, ratio: members.length ? done / members.length : 0 };
  });
  const goals = summary.achievements.filter(a => !a.unlocked).sort((a, b) => b.ratio - a.ratio).slice(0, 8)
    .map(a => ({ label: a.title, value: `${Math.round(a.ratio * 100)}%`, ratio: a.ratio }));
  const activity: ActivitySolve[] = [
    ...profile.playground.history.map(v => ({ at: v.at, time: v.time, timer: true })),
    ...profile.cases.flatMap(c => c.history.map(v => ({ at: v.at, time: v.time, timer: false }))),
  ].filter(v => v.at);
  const latest = [timer.lastAt, ...profile.cases.map(c => c.summary.lastAt)].filter((at): at is string => !!at).sort().at(-1);
  const learnedRatio = cases.length ? learnedCount / cases.length : 0;
  return {
    timer, timerTimes: profile.playground.history.map(v => v.time),
    timerDetail: timer.count ? `Best of ${plural(timer.count, "solve")} · ${scrambleLabel(scrambleType)}` : "No solves in this selection yet",
    training: { ratio: learnedRatio, value: String(trained), suffix: `/ ${cases.length} cases`, detail: `${learnedCount} learned · ${plural(profile.trainingSolves, "solve")}`, rows: stages },
    achievements: { ratio: summary.total ? summary.unlocked / summary.total : 0, value: String(summary.unlocked), suffix: `/ ${summary.total} unlocked`, detail: next ? `Next: ${next.title} · ${next.detail}` : "Everything unlocked", rows: goals },
    activity, latest,
  };
}

/** `.ov-bests`: best single in front, best Ao5 and Ao12 beside or under it. */
function TimerBests({ summary }: { summary: ProfileDto["playground"]["summary"] }) {
  const t = useTheme();
  const { short } = useLayout();
  const figure = (label: string, value: number | null, lead = false) => <View key={label} style={styles.heroFigure}>
    <Label>{label}</Label>
    <Text numberOfLines={1} style={[mono(t, lead ? (short ? 34 : 44) : 26), { lineHeight: lead ? (short ? 38 : 48) : 30, letterSpacing: lead ? -1.2 : -0.5 }]}>{summary.count ? fmtTime(value) : "—"}</Text>
  </View>;
  return <View style={styles.bests}>
    {figure("Best single", summary.best, true)}
    {figure("Best Ao5", summary.bestAo5)}
    {figure("Best Ao12", summary.bestAo12)}
  </View>;
}

/** `GaugeCard`: ring, figure and detail on one line, bars underneath. */
function GaugeCard({ label, g, onPress }: { label: string; g: { ratio: number; value: string; suffix: string; detail: string; rows: { label: string; value: string; ratio: number }[] }; onPress: () => void }) {
  const t = useTheme();
  return <OverviewCard title={label} onPress={onPress} accessibilityLabel={`${label}: ${g.value} ${g.suffix}. ${g.detail}`}>
    <View style={styles.ringHead}>
      <Ring ratio={g.ratio} />
      <View style={styles.ringText}>
        <Text numberOfLines={1} style={[mono(t, 26), { lineHeight: 30, letterSpacing: -0.5 }]}>{g.value}<Text style={[mono(t, 13, "400"), { color: t.muted, letterSpacing: 0 }]}> {g.suffix}</Text></Text>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12.5 }}>{g.detail}</Text>
      </View>
    </View>
    <MiniBars rows={g.rows} />
  </OverviewCard>;
}

export function ProfilePage({ mode, group }: { mode?: ProfileMode; caseId?: string; group?: string }) {
  const t = useTheme();
  const { navSpace, pagePadding, short } = useLayout();
  // The profile browses any puzzle without touching the puzzle used by the rest of the app.
  const [filters, setFilters] = useAtom(profileFiltersAtom);
  const appPuzzle = useAtomValue(puzzleAtom), appSolveMode = useAtomValue(solveModeAtom), appScrambleType = useAtomValue(scrambleTypeAtom);
  const cube = filters.cube ?? appPuzzle, solveMode = filters.solveMode ?? appSolveMode;
  const preferredScrambleType = filters.scrambleType ?? appScrambleType;
  const setCube = useCallback((value: PuzzleId) => setFilters(f => ({ ...f, cube: value })), [setFilters]);
  const setSolveMode = useCallback((value: SolveMode) => setFilters(f => ({ ...f, solveMode: value })), [setFilters]);
  const setScrambleType = useCallback((value: ScrambleType) => setFilters(f => ({ ...f, scrambleType: value })), [setFilters]);
  const scrambleType = puzzleInfo(cube).scrambles.includes(preferredScrambleType) ? preferredScrambleType : puzzleInfo(cube).scrambles[0];
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const user = useAtomValue(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom);
  const previousRoute = useAtomValue(previousRouteAtom);
  // Everything is computed from the local workspace, so the page renders complete on first paint.
  const catalog = useMemo(() => local.read.catalog(cube), [cube]);
  const profile = useMemo(() => local.read.profile(cube, { solveMode, scrambleType }), [cube, solveMode, scrambleType, user?.id, deletedSolveId, statsVersion]);
  const summary = useMemo(() => local.read.achievements(), [user?.id, deletedSolveId, statsVersion]);
  const [account, setAccount] = useState<AuthMode | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const scroll = usePreservedScroll(`profile:${cube}:${solveMode}:${scrambleType}`);
  if (!user) return null;
  const guest = user.isGuest;
  const back = () => { if (previousRoute?.page === "profile" && !previousRoute.mode) goBack(); else replaceRoute({ page: "profile" }); };
  const filterProps = { cube, setCube, solveMode, setSolveMode };

  if (mode && mode in SECTIONS) {
    const head = <PageHead onBack={back} title={SECTIONS[mode]} sub={puzzleInfo(cube).label} padding={pagePadding}
      controls={mode === "achievements" ? <AchievementTotal summary={summary} />
        : <ProfileFilters {...filterProps} {...(mode === "playground" ? { scrambleType, setScrambleType } : {})} />} />;
    if (mode === "training") {
      const selected = catalog.cases.find(c => c.id === caseId);
      return <View style={styles.page}>
        {head}
        <TrainingProgress cases={catalog.cases} sets={catalog.sets} profile={profile} learned={learned} onOpen={setCaseId} scrollKey={`profile-training:${cube}:${solveMode}`} />
        <ProfileCaseDialog c={selected} data={profile.cases.find(c => c.summary.caseId === caseId)} onClose={() => setCaseId(null)} />
      </View>;
    }
    if (mode === "achievements") return <View style={styles.page}>
      {head}
      <AchievementList summary={summary} initialGroup={group} scrollKey="profile-achievements" />
    </View>;
    return <View style={styles.page}>
      {head}
      <View style={[styles.main, { paddingHorizontal: pagePadding, paddingBottom: navSpace }]}>
        <TimerStats fill bleed={pagePadding} data={profile.playground} empty={<Empty style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 14 }}>No times in this selection yet.</Text>
          <Btn variant="primary" label="Open the timer" onPress={() => setRoute({ page: "playground" })} />
        </Empty>} />
      </View>
    </View>;
  }

  const d = overviewData(profile, catalog.cases, learned, summary, scrambleType);
  return <View style={styles.page}>
    <PageHead padding={pagePadding}
      lead={<Avatar username={guest ? "G" : user.username} size={36} />}
      title={guest ? "Guest" : user.username}
      sub={guest ? "Times stay on this device" : `Joined ${new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}
      controls={<>
        {guest && <>
          <Btn label="Sign in" onPress={() => setAccount("login")} />
          <Btn variant="primary" label="Create account" onPress={() => setAccount("register")} />
          <View style={{ width: 4 }} />
        </>}
        <ProfileFilters {...filterProps} />
      </>} />
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} showsVerticalScrollIndicator={false}
      style={{ flex: 1 }} contentContainerStyle={[styles.overview, { gap: short ? 12 : 16, paddingHorizontal: pagePadding, paddingBottom: navSpace }]}>
      <OverviewCard>
        <Activity solves={d.activity} detail={d.latest ? `Last practice: ${shortDate(d.latest)}` : "No practice recorded yet"}
          summary={[
            { label: profile.activeDays === 1 ? "active day" : "active days", value: String(profile.activeDays) },
            { label: "total solves", value: profile.totalSolves.toLocaleString() },
            { label: "per active day", value: profile.activeDays ? (profile.totalSolves / profile.activeDays).toFixed(1) : "—" },
          ]} />
      </OverviewCard>
      <OverviewCard title="Timer" detail={d.timerDetail} accessibilityLabel={`Timer: ${d.timerDetail}`} onPress={() => setRoute({ page: "profile", mode: "playground" })}>
        <TimerBests summary={d.timer} />
        {d.timerTimes.filter(v => v != null).length >= 2 ? <Sparkline values={d.timerTimes} height={short ? 80 : 100} />
          : <Text style={[styles.chartEmpty, { color: t.muted, borderTopColor: t.line }]}>Your progress curve appears after two timed solves.</Text>}
      </OverviewCard>
      <GaugeCard label="Training" g={d.training} onPress={() => setRoute({ page: "profile", mode: "training" })} />
      <GaugeCard label="Achievements" g={d.achievements} onPress={() => setRoute({ page: "profile", mode: "achievements" })} />
    </ScrollView>
    <SettingsDialog open={account !== null} authMode={account ?? "register"} onClose={() => setAccount(null)} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  main: { flex: 1, minHeight: 0, paddingTop: 12 },
  overview: { paddingTop: 12 },
  bests: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: 36, rowGap: 14 },
  heroFigure: { gap: 6, minWidth: 0 },
  chartEmpty: { fontSize: 12.5, textAlign: "center", borderTopWidth: 1, paddingTop: 14, paddingBottom: 8 },
  ringHead: { flexDirection: "row", alignItems: "center", gap: 16 },
  ringText: { flex: 1, minWidth: 0, gap: 3 },
});
