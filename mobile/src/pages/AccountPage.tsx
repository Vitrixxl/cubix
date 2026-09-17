import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { puzzleInfo, scrambleLabel, SOLVE_MODES, type PuzzleId, type ScrambleType, type SolveMode } from "../../../src/shared/puzzles";
import type { AchievementSummaryDto } from "../../../src/shared/types";
import { api, authToken, local } from "../api";
import { deletedSolveIdAtom, goBackAtom, previousRouteAtom, puzzleAtom, routeAtom, scrambleTypeAtom, solveModeAtom, statsVersionAtom, userAtom, type ProfileMode, type Route } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { AchievementGrid, AchievementGroups } from "../components/Achievements";
import { IconBack, IconNext, IconUser } from "../components/icons";
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

/** Gap and radius shared by the overview tiles and their skeleton. */
const TILE_GAP = 10;

/** A big number with its label; tapping opens the matching detail view. */
const StatTile = memo(function StatTile({ label, value, suffix, detail, width, onPress }: { label: string; value: string; suffix?: string; detail: string; width: number; onPress?: () => void }) {
  const t = useTheme();
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={`${label}: ${value}${suffix ?? ""}, ${detail}`}
    style={({ pressed }) => [styles.tile, { width, backgroundColor: pressed ? t.surface2 : t.surface }]}>
    <View style={styles.tileHead}>
      <Text style={[styles.tileLabel, { color: t.readableMuted }]}>{label}</Text>
      {onPress && <IconNext size={16} color={t.muted} />}
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit style={[mono(t, 34, "700"), { color: t.text, lineHeight: 40, letterSpacing: -0.8 }]}>
      {value}{suffix && <Text style={[mono(t, 17, "600"), { color: t.readableMuted, letterSpacing: 0 }]}>{suffix}</Text>}
    </Text>
    <Muted size={12} numberOfLines={1}>{detail}</Muted>
  </Pressable>;
});

/** The toolbar of a detail view: back to its parent, a title and optional controls. */
function DetailBar({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  const t = useTheme();
  return <View style={styles.detailBar}>
    <Btn small variant="ghost" icon={<IconBack size={16} color={t.text2} />} label="Profile" onPress={onBack} />
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
  const { navSpace, pagePadding, phone, width } = useLayout();
  // The profile browses any puzzle without touching the puzzle used by the rest of the app.
  const appPuzzle = useAtomValue(puzzleAtom);
  const [cube, setCube] = useState<PuzzleId>(appPuzzle);
  const appSolveMode = useAtomValue(solveModeAtom);
  const [solveMode, setSolveMode] = useState<SolveMode>(appSolveMode);
  const appScrambleType = useAtomValue(scrambleTypeAtom);
  const [preferredScrambleType, setScrambleType] = useState<ScrambleType>(appScrambleType);
  const scrambleType = puzzleInfo(cube).scrambles.includes(preferredScrambleType) ? preferredScrambleType : puzzleInfo(cube).scrambles[0];
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const [user, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom);
  const previousRoute = useAtomValue(previousRouteAtom);
  // Everything is computed from the local workspace, so the page renders complete on first paint.
  const catalog = useMemo(() => local.read.catalog(cube), [cube]);
  const profile = useMemo(() => local.read.profile(cube, { solveMode, scrambleType }), [cube, solveMode, scrambleType, user?.id, deletedSolveId, statsVersion]);
  const summary = useMemo(() => local.read.achievements(), [user?.id, deletedSolveId, statsVersion]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const openedFromGallery = useRef(false);
  const openCase = useCallback((id: string) => { openedFromGallery.current = true; setRoute({ page: "profile", mode: "training", caseId: id }); }, [setRoute]);
  const closeCase = () => {
    if (openedFromGallery.current) { openedFromGallery.current = false; goBack(); }
    else setRoute({ page: "profile", mode: "training" });
  };
  /** Step up to a parent view: pop the history when it leads there, push it otherwise. */
  const up = (parent: Route) => { if (previousRoute && JSON.stringify(previousRoute) === JSON.stringify(parent)) goBack(); else setRoute(parent); };
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
      header={<DetailBar title="Training" onBack={() => up({ page: "profile" })}><PuzzleSelect value={cube} onChange={setCube} compact /></DetailBar>} />
    <Sheet open={!phone && !!selectedCase} title={`${selectedCase?.id ?? "Case"} statistics`} header={false} tall wide onClose={closeCase}>{details}</Sheet>
  </View>;

  if (mode === "achievements" && group) return <View style={page}>
    <AchievementGrid summary={summary} group={group} header={<DetailBar title={group} onBack={() => up({ page: "profile", mode: "achievements" })} />} scrollKey={`profile-achievements:${group}`} />
  </View>;

  if (mode === "achievements") return <View style={page}>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: navSpace }}>
      <DetailBar title="Achievements" onBack={() => up({ page: "profile" })}><Text style={[mono(t, 13), { color: t.readableMuted }]}>{summary.unlocked} / {summary.total}</Text></DetailBar>
      <AchievementGroups summary={summary} onOpen={name => setRoute({ page: "profile", mode: "achievements", group: name })} />
    </ScrollView>
  </View>;

  if (mode === "playground") return <View style={page}>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: navSpace }}>
      <DetailBar title="Timer" onBack={() => up({ page: "profile" })}>
        <Select value={scrambleType} accessibilityLabel="Scramble type" minWidth={140} options={puzzleInfo(cube).scrambles.map(type => ({ value: type, label: scrambleLabel(type) }))} onChange={value => setScrambleType(value as ScrambleType)} />
      </DetailBar>
      <View style={styles.toolbar}>
        <PuzzleSelect value={cube} onChange={setCube} />
        <Select value={solveMode} accessibilityLabel="Solve mode" minWidth={140} options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={value => setSolveMode(value as SolveMode)} />
      </View>
      {profile.playground.summary.count ? <ProfileStats data={profile.playground} />
        : <Empty icon={<IconUser size={28} color={t.readableMuted} />}><Muted>No times in this selection yet.</Muted><Btn small label="Open the timer" onPress={() => setRoute({ page: "playground" })} /></Empty>}
    </ScrollView>
  </View>;

  // Overview: who you are, which puzzle, and four numbers that open the details.
  const columns = width >= 900 ? 4 : 2;
  const tileWidth = Math.floor((Math.min(width, 1100) - pagePadding * 2 - TILE_GAP * (columns - 1)) / columns);
  const timer = profile.playground.summary;
  const next = nextAchievement(summary);
  const trained = profile.cases.length;
  return <View style={page}>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled">
      <View style={styles.profileHeader}>
        <Avatar username={guest ? "G" : user.username} large />
        <View style={{ flex: 1, minWidth: 120 }}>
          <H1 size={24}>{guest ? "Guest" : user.username}</H1>
          <Muted>{guest ? "Times stay on this device" : `Joined ${new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}</Muted>
        </View>
        {guest ? <Btn small variant="primary" label="Sign in" onPress={() => setAccountOpen(true)} />
          : <Btn small variant="ghost" label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void logout()} />}
      </View>
      {error ? <FormError>{error}</FormError> : null}
      <View style={styles.toolbar}>
        <PuzzleSelect value={cube} onChange={setCube} />
        <Select value={solveMode} accessibilityLabel="Solve mode" minWidth={140} options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={value => setSolveMode(value as SolveMode)} />
      </View>
      <View style={styles.tiles}>
        <StatTile width={tileWidth} label="Timer · best" value={timer.count ? fmtTime(timer.best) : "—"} detail={timer.count ? `${plural(timer.count, "solve")} · Ao5 ${fmtTime(timer.ao5)}` : `No ${scrambleLabel(scrambleType).toLowerCase()} solves yet`} onPress={() => setRoute({ page: "profile", mode: "playground" })} />
        <StatTile width={tileWidth} label="Training" value={String(trained)} suffix={` / ${catalog.cases.length}`} detail={trained ? `cases trained · ${plural(profile.trainingSolves, "solve")}` : "No case trained yet"} onPress={() => setRoute({ page: "profile", mode: "training" })} />
        <StatTile width={tileWidth} label="Achievements" value={String(summary.unlocked)} suffix={` / ${summary.total}`} detail={next ? `Next: ${next.title} · ${Math.round(next.ratio * 100)}%` : "Everything unlocked"} onPress={() => setRoute({ page: "profile", mode: "achievements" })} />
        <StatTile width={tileWidth} label="Active days" value={String(profile.activeDays)} detail={`${plural(profile.totalSolves, "solve")} in total`} />
      </View>
    </ScrollView>
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
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  profileHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  tile: { minHeight: 124, borderRadius: 18, padding: 16, gap: 6, justifyContent: "space-between" },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tileLabel: { fontSize: 13, fontWeight: "600" },
  detailBar: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  detailTitle: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: "700" },
});
