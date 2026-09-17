import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { puzzleInfo, scrambleLabel, SOLVE_MODES, type PuzzleId, type ScrambleType, type SolveMode } from "../../../src/shared/puzzles";
import type { AchievementSummaryDto, CaseDto, ProfileDto, SetDto } from "../../../src/shared/types";
import { api, authToken } from "../api";
import { deletedSolveIdAtom, goBackAtom, puzzleAtom, routeAtom, scrambleTypeAtom, solveModeAtom, statsVersionAtom, userAtom, type ProfileMode } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { Achievements } from "../components/Achievements";
import { IconTrophy, IconUser } from "../components/icons";
import { ProfileCaseDetails, ProfileCaseGallery, ProfileStats } from "../components/ProfileProgress";
import { PuzzleSelect } from "../components/PuzzlePicker";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { SolvingCube } from "../components/SolvingCube";
import { Avatar, Btn, Empty, FormError, H1, Input, Kpi, Muted, Segmented } from "../components/ui";

export function AccountForm({ initialMode = "register" }: { initialMode?: "register" | "login" } = {}) {
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

/** Guests see their own statistics and achievements too; the form only adds synchronisation. */
function GuestHeader() {
  const { pagePadding, phone } = useLayout();
  return <View style={[styles.narrow, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18, gap: 22 }]}>
    <H1 size={26}>Account</H1>
    <Muted>Practise as a guest, or sign in to keep your times, statistics and achievements on every device.</Muted>
    <AccountForm />
  </View>;
}

export function ProfilePage({ mode = "playground", caseId }: { mode?: ProfileMode; caseId?: string }) {
  const t = useTheme();
  const { navSpace, pagePadding, phone } = useLayout();
  // The profile browses any puzzle without touching the puzzle used by the rest of the app.
  const appPuzzle = useAtomValue(puzzleAtom);
  const [cube, setCube] = useState<PuzzleId>(appPuzzle);
  const appSolveMode = useAtomValue(solveModeAtom);
  const [solveMode, setSolveMode] = useState<SolveMode>(appSolveMode);
  const appScrambleType = useAtomValue(scrambleTypeAtom);
  const [preferredScrambleType, setScrambleType] = useState<ScrambleType>(appScrambleType);
  const scrambleType = puzzleInfo(cube).scrambles.includes(preferredScrambleType) ? preferredScrambleType : puzzleInfo(cube).scrambles[0];
  const [cases, setCases] = useState<CaseDto[]>([]);
  const [sets, setSets] = useState<SetDto[]>([]);
  useEffect(() => { let active = true; Promise.all([api.cases(cube), api.sets(cube)]).then(([c, s]) => { if (active) { setCases(c); setSets(s); } }); return () => { active = false; }; }, [cube]);
  const openedFromGallery = useRef(false);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const [user, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom);
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [summary, setSummary] = useState<AchievementSummaryDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setMode = (next: ProfileMode) => setRoute({ page: "profile", mode: next });
  const openCase = useCallback((id: string) => { openedFromGallery.current = true; setRoute({ page: "profile", mode: "training", caseId: id }); }, [setRoute]);
  const closeCase = () => {
    if (openedFromGallery.current) { openedFromGallery.current = false; goBack(); }
    else setRoute({ page: "profile", mode: "training" });
  };
  useEffect(() => {
    if (!user) return;
    let active = true;
    setError("");
    Promise.all([api.profile(user.username, undefined, cube, { solveMode, scrambleType }), api.achievements()])
      .then(([value, achievements]) => { if (active) { setProfile(value); setSummary(achievements); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [cube, solveMode, scrambleType, user?.id, user?.isGuest, deletedSolveId, statsVersion]);
  const activeMode: ProfileMode = caseId ? "training" : mode;
  const scroll = usePreservedScroll(`profile:${cube}:${solveMode}:${activeMode}`);
  if (!user) return null;
  const guest = user.isGuest;
  const logout = async () => {
    setBusy(true); setError("");
    try { await api.logout(); authToken.clear(); setUser(await api.me()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  if (!profile || !summary) return <View style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}>{error ? <Empty><FormError>{error}</FormError></Empty> : <Empty><SolvingCube size={104} /></Empty>}</View>;
  const selectedCase = cases.find(c => c.id === caseId);
  const selectedStats = profile.cases.find(c => c.summary.caseId === caseId);
  const details = selectedCase && <ProfileCaseDetails c={selectedCase} data={selectedStats} phone={phone} onClose={closeCase} />;
  const header = <View style={styles.profileHeader}>
    <Avatar username={guest ? "G" : profile.user.username} large />
    <View style={{ flex: 1, minWidth: 140 }}><H1 size={24}>{guest ? "Guest" : profile.user.username}</H1><Muted>{guest ? "Times stay on this device" : `Joined ${new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}</Muted></View>
    {!guest && <Btn small variant="ghost" label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void logout()} />}
  </View>;
  const modes = <View style={styles.toolbar}>
    <Segmented options={[{ id: "playground", label: "Timer" }, { id: "training", label: "Training" }, { id: "achievements", label: "Achievements", count: summary.unlocked }]} value={activeMode} onChange={setMode} />
    {activeMode !== "achievements" && <PuzzleSelect value={cube} onChange={setCube} />}
    {activeMode === "playground" && <Select value={scrambleType} accessibilityLabel="Scramble type" options={puzzleInfo(cube).scrambles.map(type => ({ value: type, label: scrambleLabel(type) }))} onChange={value => setScrambleType(value as ScrambleType)} />}
    {activeMode !== "achievements" && <Select value={solveMode} accessibilityLabel="Solve mode" options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={value => setSolveMode(value as SolveMode)} />}
  </View>;
  const summaryBlock = <>
    {error ? <FormError>{error}</FormError> : null}
    {modes}
    {activeMode === "achievements"
      ? <View style={styles.kpiRow}><Kpi label="Unlocked" value={`${summary.unlocked} / ${summary.total}`} /><Kpi label="Solves" value={profile.totalSolves.toLocaleString()} /><Kpi label="Active days" value={String(profile.activeDays)} /></View>
      : <View style={styles.kpiRow}><Kpi label="Solves" value={profile.totalSolves.toLocaleString()} /><Kpi label="Training" value={profile.trainingSolves.toLocaleString()} /><Kpi label="Cases" value={String(profile.cases.length)} /><Kpi label="Active days" value={String(profile.activeDays)} /></View>}
  </>;
  return <View style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}>
    {phone && selectedCase ? <View style={{ flex: 1, minHeight: 0 }}>{details}</View> : <View style={{ flex: 1, minHeight: 0, gap: 14 }}>
      {guest ? null : header}
      {activeMode === "achievements" ? <Achievements summary={summary} header={<>{guest && <GuestHeader />}{summaryBlock}</>} scrollKey="profile-achievements" />
        : activeMode === "training" ? <ProfileCaseGallery cases={cases} sets={sets} profile={profile} onOpen={openCase} phone={phone} header={<>{guest && <GuestHeader />}{summaryBlock}</>} scrollKey={`profile-gallery:${cube}:${solveMode}`} />
        : <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled">
          {guest && <GuestHeader />}
          {summaryBlock}
          {profile.playground.summary.count ? <ProfileStats data={profile.playground} />
          : <Empty icon={<IconUser size={28} color={t.readableMuted} />}><Muted>No times in this selection yet.</Muted><Btn small label="Open the timer" onPress={() => setRoute({ page: "playground" })} /></Empty>}
        </ScrollView>}
    </View>}
    <Sheet open={!phone && !!selectedCase} title={`${selectedCase?.id ?? "Case"} statistics`} header={false} tall wide onClose={closeCase}>{details}</Sheet>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  narrow: { maxWidth: 560, marginBottom: 8 },
  form: { gap: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  profileHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 12 },
});
