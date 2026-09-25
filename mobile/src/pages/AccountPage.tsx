import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { puzzleInfo, scrambleLabel, SOLVE_MODES, type PuzzleId, type ScrambleType, type SolveMode } from "../../../src/shared/puzzles";
import type { AchievementSummaryDto } from "../../../src/shared/types";
import { api, authToken, local } from "../api";
import { deletedSolveIdAtom, goBackAtom, learnedCaseIdsAtom, previousRouteAtom, profileFiltersAtom, puzzleAtom, replaceRouteAtom, routeAtom, scrambleTypeAtom, solveModeAtom, statsVersionAtom, userAtom, type ProfileMode } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { AchievementGrid, AchievementGroups } from "../components/Achievements";
import { IconNext, IconUser, IconTimer, IconTraining, IconTrophy, IconCheck, type Icon } from "../components/icons";
import { ProfileCaseDetails, ProfileCaseGallery, ProfileStats } from "../components/ProfileProgress";
import { PuzzleSelect } from "../components/PuzzlePicker";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { Avatar, Btn, Empty, FormError, H1, Input, Muted, Segmented, mono } from "../components/ui";

export function AccountForm({ initialMode = "register", onDone }: { initialMode?: "register" | "login"; onDone?: () => void } = {}) {
  const t = useTheme();
  const [mode, setMode] = useState<"register" | "login">(initialMode);
  const [, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) { setError("Username: 3–24 letters, digits or underscores."); return; }
    if (password.length < (mode === "register" ? 10 : 1)) { setError(mode === "register" ? "Password: 10 characters or more." : "Enter your password."); return; }
    setBusy(true); setError("");
    try {
      const result = mode === "register" ? await api.register(username, password) : await api.login(username, password);
      authToken.set(result.token); setUser(result.user); bumpStats(v => v + 1);
      setRoute({ page: "profile" });
      onDone?.();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <View style={styles.form}>
    <Segmented options={[{ id: "login", label: "Sign in" }, { id: "register", label: "Create account" }]} value={mode} onChange={m => { setMode(m); setError(""); }} disabled={busy} style={{ alignSelf: "flex-start" }} />
    <Muted>{mode === "register" ? "An account keeps your times, statistics and achievements in sync between devices." : "Your local times are merged into your account."}</Muted>
    <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.text2 }]}>Username</Text><Input accessibilityLabel="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={24} editable={!busy} /></View>
    <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.text2 }]}>Password</Text><Input accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === "register" ? "new-password" : "current-password"} textContentType={mode === "register" ? "newPassword" : "password"} maxLength={128} editable={!busy} onSubmitEditing={() => void submit()} /></View>
    {mode === "register" && <Muted size={12}>3–24 letters, digits or underscores. Password: 10 characters or more.</Muted>}
    {error ? <FormError>{error}</FormError> : null}
    <Btn variant="primary" disabled={busy} label={busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"} onPress={() => void submit()} style={{ alignSelf: "flex-start" }} />
  </View>;
}

/** Full-width cards share the available height; smaller windows keep the key figures visible. */
const StatTile = memo(function StatTile({ label, value, suffix, detail, metrics, icon: Icon, progress, onPress }: {
  label: string; value: string; suffix?: string; detail: string;
  metrics: { label: string; value: string }[]; icon: Icon; progress?: number; onPress?: () => void;
}) {
  const t = useTheme();
  const [height, setHeight] = useState(140);
  const tiny = height < 105;
  const dense = height < 125;
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined}
    accessibilityLabel={`${label}: ${value}${suffix ?? ""}. ${detail}. ${metrics.map(metric => `${metric.label}: ${metric.value}`).join(". ")}`}
    onLayout={event => setHeight(event.nativeEvent.layout.height)}
    style={({ pressed }) => [styles.tile, { paddingHorizontal: dense ? 12 : 18, paddingVertical: tiny ? 6 : dense ? 10 : 16, backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.line }]}>
    {!tiny && <View style={styles.tileHead}>
      <View style={styles.tileTitle}><View style={[styles.tileIcon, { backgroundColor: t.accentSoft }]}><Icon size={15} color={t.accent} /></View><Text style={[styles.tileLabel, { color: t.text2 }]}>{label}</Text></View>
      {onPress && <IconNext size={16} color={t.readableMuted} />}
    </View>}
    <View style={styles.tileBody}>
      <View style={styles.tilePrimary}>
        {tiny && <Text numberOfLines={1} style={[styles.tileLabel, { color: t.text2 }]}>{label}</Text>}
        <Text numberOfLines={1} adjustsFontSizeToFit style={[mono(t, tiny ? 23 : dense ? 28 : 36, "700"), { color: t.accent, letterSpacing: -0.8 }]}>
          {value}{suffix && <Text style={[mono(t, tiny ? 11 : 14, "500"), { color: t.readableMuted, letterSpacing: 0 }]}>{suffix}</Text>}
        </Text>
      </View>
      <View style={styles.tileMetrics}>{metrics.map(metric => <View key={metric.label} style={styles.tileMetric}>
        <Text numberOfLines={1} style={{ color: t.readableMuted, fontSize: 10 }}>{metric.label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[mono(t, tiny ? 12 : 15, "600"), { color: t.text }]}>{metric.value}</Text>
      </View>)}</View>
    </View>
    {!tiny && <View style={{ gap: 5 }}>
      <Muted size={11} numberOfLines={1}>{detail}</Muted>
      {progress !== undefined && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={[styles.progressTrack, { backgroundColor: t.surface3 }]}>
        <View style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, height: "100%", backgroundColor: t.accent, borderRadius: 3 }} />
      </View>}
    </View>}
  </Pressable>;
});

/** The toolbar of a detail view: a title and optional controls. The account tab and the back button lead up. */
function DetailBar({ title, children }: { title: string; children?: ReactNode }) {
  const t = useTheme();
  return <View style={styles.detailBar}>
    <Text style={[styles.detailTitle, { color: t.text }]} numberOfLines={1}>{title}</Text>
    {children}
  </View>;
}

const plural = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

/** The next achievement to reach, by progress. */
function nextAchievement(summary: AchievementSummaryDto) {
  return summary.achievements.filter(a => !a.unlocked).sort((a, b) => b.ratio - a.ratio)[0];
}

export function ProfilePage({ mode, caseId, group }: { mode?: ProfileMode; caseId?: string; group?: string }) {
  const t = useTheme();
  const { navSpace, pagePadding, phone, short, landscape } = useLayout();
  // The profile browses any puzzle without touching the puzzle used by the rest of the app.
  const [filters, setFilters] = useAtom(profileFiltersAtom);
  const appPuzzle = useAtomValue(puzzleAtom), appSolveMode = useAtomValue(solveModeAtom), appScrambleType = useAtomValue(scrambleTypeAtom);
  const cube = filters.cube ?? appPuzzle, solveMode = filters.solveMode ?? appSolveMode;
  const preferredScrambleType = filters.scrambleType ?? appScrambleType;
  const setCube = useCallback((value: PuzzleId) => setFilters(f => ({ ...f, cube: value })), [setFilters]);
  const setSolveMode = (value: SolveMode) => setFilters(f => ({ ...f, solveMode: value }));
  const setScrambleType = (value: ScrambleType) => setFilters(f => ({ ...f, scrambleType: value }));
  const scrambleType = puzzleInfo(cube).scrambles.includes(preferredScrambleType) ? preferredScrambleType : puzzleInfo(cube).scrambles[0];
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [user, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom);
  const previousRoute = useAtomValue(previousRouteAtom);
  // Everything is computed from the local workspace, so the page renders complete on first paint.
  const catalog = useMemo(() => local.read.catalog(cube), [cube]);
  const profile = useMemo(() => local.read.profile(cube, { solveMode, scrambleType }), [cube, solveMode, scrambleType, user?.id, deletedSolveId, statsVersion]);
  const summary = useMemo(() => local.read.achievements(), [user?.id, deletedSolveId, statsVersion]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const openCase = useCallback((id: string) => setRoute({ page: "profile", mode: "training", caseId: id }), [setRoute]);
  const closeCase = () => {
    if (previousRoute?.page === "profile" && previousRoute.mode === "training" && !previousRoute.caseId) goBack();
    else replaceRoute({ page: "profile", mode: "training" });
  };
  const scroll = usePreservedScroll(`profile:${cube}:${solveMode}:${scrambleType}:${mode ?? "overview"}:${group ?? ""}`);
  if (!user) return null;
  const guest = user.isGuest;
  const logout = async () => {
    setBusy(true); setError("");
    try { await api.logout(); authToken.clear(); setUser(await api.me()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const page = [styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }];

  const selectedCase = catalog.cases.find(c => c.id === caseId);
  const selectedStats = profile.cases.find(c => c.summary.caseId === caseId);
  const details = selectedCase && <ProfileCaseDetails c={selectedCase} data={selectedStats} phone={phone} onClose={closeCase} />;
  if (phone && selectedCase) return <View style={page}><View style={{ flex: 1, minHeight: 0 }}>{details}</View></View>;

  if (mode === "training") return <View style={page}>
    <ProfileCaseGallery cases={catalog.cases} sets={catalog.sets} profile={profile} onOpen={openCase} phone={phone} scrollKey={`profile-gallery:${cube}:${solveMode}`}
      header={<DetailBar title="Training"><PuzzleSelect value={cube} onChange={setCube} compact /></DetailBar>} />
    <Sheet open={!phone && !!selectedCase} title={`${selectedCase?.id ?? "Case"} statistics`} header={false} tall wide onClose={closeCase}>{details}</Sheet>
  </View>;

  if (mode === "achievements" && group) return <View style={page}>
    <AchievementGrid summary={summary} group={group} header={<DetailBar title={group} />} scrollKey={`profile-achievements:${group}`} />
  </View>;

  if (mode === "achievements") return <View style={page}>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: navSpace }}>
      <DetailBar title="Achievements"><Text style={[mono(t, 13), { color: t.readableMuted }]}>{summary.unlocked} / {summary.total}</Text></DetailBar>
      <AchievementGroups summary={summary} onOpen={name => setRoute({ page: "profile", mode: "achievements", group: name })} />
    </ScrollView>
  </View>;

  if (mode === "playground") return <View style={page}>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: navSpace }}>
      <DetailBar title="Solve" />
      <View style={styles.filterRow}>
        <PuzzleSelect value={cube} onChange={setCube} compact={phone} />
        <Select value={solveMode} accessibilityLabel="Solve mode" minWidth={140} style={phone && styles.filterSelect} options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={value => setSolveMode(value as SolveMode)} />
        <Select value={scrambleType} accessibilityLabel="Scramble type" minWidth={140} style={phone && styles.filterSelect} options={puzzleInfo(cube).scrambles.map(type => ({ value: type, label: scrambleLabel(type) }))} onChange={value => setScrambleType(value as ScrambleType)} />
      </View>
      {profile.playground.summary.count ? <ProfileStats data={profile.playground} />
        : <Empty icon={<IconUser size={28} color={t.readableMuted} />}><Muted>No times in this selection yet.</Muted><Btn small label="Open the timer" onPress={() => setRoute({ page: "playground" })} /></Empty>}
    </ScrollView>
  </View>;

  // Overview stays inside the window; each card receives an equal share of the remaining height.
  const timer = profile.playground.summary;
  const next = nextAchievement(summary);
  const trained = profile.cases.length;
  const learnedCount = catalog.cases.filter(c => learned.has(c.id)).length;
  const latest = [timer.lastAt, ...profile.cases.map(c => c.summary.lastAt)].filter((at): at is string => !!at).sort().at(-1);
  const lastPractice = latest ? `Last practice: ${new Date(latest).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "No practice recorded yet";
  return <View style={page}>
    <View style={[styles.overview, landscape && { flexDirection: "row" }, { gap: short ? 8 : 12, paddingBottom: navSpace }]}>
      <View style={[{ gap: short ? 8 : 12 }, landscape && { width: 200 }]}>
        <View style={[styles.profileHeader, landscape && { flexWrap: "wrap" }]}>
          <Avatar username={guest ? "G" : user.username} large={!short} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <H1 size={short ? 20 : 24}>{guest ? "Guest" : user.username}</H1>
            <Muted size={12} numberOfLines={1}>{guest ? "Times stay on this device" : `Joined ${new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}</Muted>
          </View>
          {guest ? <Btn small variant="primary" label="Sign in" onPress={() => setAccountOpen(true)} />
            : <Btn small variant="ghost" label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void logout()} />}
        </View>
        {error ? <FormError>{error}</FormError> : null}
        <View style={styles.filterRow}>
          <PuzzleSelect value={cube} onChange={setCube} compact={phone || landscape} />
          <Select style={styles.filterSelect} value={solveMode} accessibilityLabel="Solve mode" minWidth={140} options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={value => setSolveMode(value as SolveMode)} />
        </View>
      </View>
      <View style={styles.tiles}>
        <StatTile icon={IconTimer} label="Timer · best" value={timer.count ? fmtTime(timer.best) : "—"}
          metrics={[{ label: "Ao5", value: fmtTime(timer.ao5) }, { label: "Ao12", value: fmtTime(timer.ao12) }]}
          detail={`${plural(timer.count, "solve")} · mean ${fmtTime(timer.mean)} · ${scrambleLabel(scrambleType)}`}
          onPress={() => setRoute({ page: "profile", mode: "playground" })} />
        <StatTile icon={IconTraining} label="Training" value={String(trained)} suffix={` / ${catalog.cases.length}`}
          metrics={[{ label: "Learned", value: String(learnedCount) }, { label: "Solves", value: String(profile.trainingSolves) }]}
          detail={`${plural(trained, "case")} trained · ${catalog.cases.length ? Math.round(learnedCount / catalog.cases.length * 100) : 0}% learned`}
          progress={catalog.cases.length ? learnedCount / catalog.cases.length : 0}
          onPress={() => setRoute({ page: "profile", mode: "training" })} />
        <StatTile icon={IconTrophy} label="Achievements" value={String(summary.unlocked)} suffix={` / ${summary.total}`}
          metrics={[{ label: "Remaining", value: String(summary.total - summary.unlocked) }, { label: "Next goal", value: next ? `${Math.round(next.ratio * 100)}%` : "100%" }]}
          detail={next ? `Next: ${next.title} · ${next.detail}` : "Everything unlocked"}
          progress={summary.total ? summary.unlocked / summary.total : 0}
          onPress={() => setRoute({ page: "profile", mode: "achievements" })} />
        <StatTile icon={IconCheck} label="Active days" value={String(profile.activeDays)}
          metrics={[{ label: "Total solves", value: String(profile.totalSolves) }, { label: "Per active day", value: profile.activeDays ? (profile.totalSolves / profile.activeDays).toFixed(1) : "—" }]}
          detail={lastPractice} />
      </View>
    </View>
    <Sheet open={accountOpen} title="Account" onClose={() => setAccountOpen(false)}>
      <View style={{ paddingBottom: 8 }}><AccountForm onDone={() => setAccountOpen(false)} /></View>
    </Sheet>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  form: { gap: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  overview: { flex: 1, minHeight: 0 },
  /** The three solve filters stay on one line; on a phone the two labelled ones share the width. */
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterSelect: { flex: 1, minWidth: 0 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  tiles: { flex: 1, minHeight: 0, flexDirection: "column", gap: 8 },
  tile: { flex: 1, minHeight: 0, borderRadius: 18, borderWidth: 1, justifyContent: "space-between", overflow: "hidden" },
  tileTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  tileIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tileBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  tilePrimary: { flex: 1, minWidth: 0 },
  tileMetrics: { flex: 1.2, flexDirection: "row", gap: 10 },
  tileMetric: { flex: 1, minWidth: 0, gap: 3 },
  progressTrack: { height: 3, borderRadius: 3, overflow: "hidden" },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tileLabel: { fontSize: 13, fontWeight: "600" },
  detailBar: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  detailTitle: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: "700" },
});
