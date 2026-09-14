import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { puzzleInfo, scrambleLabel, SOLVE_MODES, type PuzzleId, type ScrambleType, type SolveMode } from "../../../src/shared/puzzles";
import type { CaseDto, ProfileDto, SetDto, UserDto } from "../../../src/shared/types";
import { api, authToken } from "../api";
import { chatPeerAtom, deletedSolveIdAtom, goBackAtom, puzzleAtom, routeAtom, scrambleTypeAtom, solveModeAtom, statsVersionAtom, userAtom } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { FriendActions, useFriendActions } from "../components/FriendActions";
import { IconBack, IconMessage, IconSearch, IconUser } from "../components/icons";
import { ProfileCaseDetails, ProfileCaseGallery, ProfileStats } from "../components/ProfileProgress";
import { PuzzleSelect } from "../components/PuzzlePicker";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { Avatar, Btn, Empty, FormError, H1, Input, Kpi, MiniBtn, Muted, Segmented } from "../components/ui";

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
    <Muted>{mode === "register" ? "An account syncs your times between devices and lets you add friends." : "Your local times are merged into your account."}</Muted>
    <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.text2 }]}>Username</Text><Input accessibilityLabel="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={24} editable={!busy} /></View>
    <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.text2 }]}>Password</Text><Input accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === "register" ? "new-password" : "current-password"} textContentType={mode === "register" ? "newPassword" : "password"} maxLength={128} editable={!busy} onSubmitEditing={() => void submit()} /></View>
    {mode === "register" && <Muted size={12}>3–24 letters, digits or underscores. Password: 10 characters or more.</Muted>}
    {error ? <FormError>{error}</FormError> : null}
    <Btn variant="primary" disabled={busy} label={busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"} onPress={() => void submit()} style={{ alignSelf: "flex-start" }} />
  </View>;
}

function GuestPage({ title, intro }: { title: string; intro: string }) {
  const { navSpace, pagePadding, phone } = useLayout();
  return <View style={[styles.page, styles.narrow, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}>
    <ScrollView contentContainerStyle={{ gap: 22, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled">
      <H1 size={26}>{title}</H1>
      <Muted>{intro}</Muted>
      <AccountForm />
    </ScrollView>
  </View>;
}

export function CommunityPage() {
  const t = useTheme();
  const { navSpace, pagePadding, phone } = useLayout();
  const friendship = useFriendActions();
  const [user] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const setPeer = useSetAtom(chatPeerAtom);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!user || user.isGuest) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setResults([]);
    const timeout = setTimeout(() => {
      api.users(query.trim(), controller.signal).then(setResults).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, user, retry]);
  const scroll = usePreservedScroll(`community:${query}`);
  if (!user || user.isGuest) return <GuestPage title="Account" intro="Sign in to sync your times, find friends and read your messages." />;
  const members: Pick<UserDto, "id" | "username" | "bio">[] = [...results];
  for (const friend of friendship.friends) {
    if (friend.status !== "pending" || !friend.username.toLowerCase().includes(query.trim().toLowerCase()) || members.some(m => m.id === friend.userId)) continue;
    members.push({ id: friend.userId, username: friend.username, bio: "" });
  }
  const openChat = (userId?: string) => { setPeer(userId ?? ""); setRoute({ page: "messages" }); };
  return <View style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18, gap: 12 }]}>
    <View style={styles.toolbar}>
      <H1>Friends</H1>
    </View>
    <View><View style={styles.searchIcon} pointerEvents="none"><IconSearch size={16} color={t.readableMuted} /></View><Input accessibilityLabel="Search cubers" placeholder="Search cubers…" value={query} maxLength={80} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={{ paddingLeft: 40 }} /></View>
    {friendship.error ? <FormError>{friendship.error} <MiniBtn label="Retry" onPress={friendship.retry} /></FormError> : null}
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: navSpace }} keyboardShouldPersistTaps="handled">
      {loading ? <Empty>Searching…</Empty> : error ? <Empty><FormError>{error}</FormError><Btn small label="Try again" onPress={() => setRetry(v => v + 1)} /></Empty> : members.length === 0 ? <Empty>{query.trim() ? "No cubers found." : "No other cubers yet."}</Empty> : members.map(member => {
        const friend = friendship.friends.find(f => f.userId === member.id);
        return <View key={member.id} style={[styles.memberRow, { borderBottomColor: t.line }, phone && { flexWrap: "wrap" }]}>
          <Pressable onPress={() => setRoute({ page: "profile", username: member.username })} style={[styles.memberProfile, phone && { flexBasis: "100%" }]}>
            <Avatar username={member.username} />
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{member.username}</Text>{!!member.bio && <Muted size={13} numberOfLines={1}>{member.bio}</Muted>}</View>
          </Pressable>
          {friend?.status === "accepted" && <Btn small icon={<IconMessage size={16} color={t.text} />} label="Message" onPress={() => openChat(member.id)} />}
          <FriendActions userId={member.id} username={member.username} state={friendship} />
        </View>;
      })}
    </ScrollView>
  </View>;
}

export function ProfilePage({ username, mode = "playground", caseId }: { username?: string; mode?: "playground" | "training"; caseId?: string }) {
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
  const friendship = useFriendActions();
  const [user, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const goBack = useSetAtom(goBackAtom);
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const setMode = (next: "playground" | "training") => setRoute({ page: "profile", username, mode: next });
  const openCase = useCallback((id: string) => { openedFromGallery.current = true; setRoute({ page: "profile", username, mode: "training", caseId: id }); }, [setRoute, username]);
  const closeCase = () => {
    if (openedFromGallery.current) { openedFromGallery.current = false; goBack(); }
    else setRoute({ page: "profile", username, mode: "training" });
  };
  const target = username ?? user?.username;
  const own = target === user?.username;
  useEffect(() => {
    if (!target || !user || user.isGuest) return;
    const controller = new AbortController();
    setProfile(current => current?.user.username === target ? current : null); setError(""); setEditing(false);
    api.profile(target, controller.signal, cube, { solveMode, scrambleType }).then(value => { if (!controller.signal.aborted) setProfile(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [cube, solveMode, scrambleType, target, user?.id, user?.isGuest, version, deletedSolveId, statsVersion]);
  // Refresh after returning to the app to show profile changes made elsewhere.
  useEffect(() => { const sub = AppState.addEventListener("change", state => { if (state === "active") setVersion(v => v + 1); }); return () => sub.remove(); }, []);
  const activeMode = caseId ? "training" : mode;
  const scroll = usePreservedScroll(`profile:${username ?? "self"}:${cube}:${solveMode}:${activeMode}`);
  if (!user || user.isGuest) return <GuestPage title="Account" intro="Practise as a guest, or sign in to keep your times on every device." />;
  const logout = async () => {
    setBusy(true); setError("");
    try { await api.logout(); authToken.clear(); setUser(await api.me()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const backButton = !own && <Btn small variant="ghost" icon={<IconBack size={16} color={t.text2} />} label="Friends" onPress={() => setRoute({ page: "community" })} />;
  if (!profile) return <View style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}><View style={styles.toolbar}>{backButton}</View>{error ? <Empty><FormError>{error}</FormError><Btn small label="Try again" onPress={() => setVersion(v => v + 1)} /></Empty> : <Empty>Loading…</Empty>}</View>;
  const selectedCase = cases.find(c => c.id === caseId);
  const selectedStats = profile.cases.find(c => c.summary.caseId === caseId);
  const details = selectedCase && <ProfileCaseDetails c={selectedCase} data={selectedStats} own={own} username={profile.user.username} phone={phone} onClose={closeCase} />;
  const summary = <>
        {friendship.error ? <FormError>{friendship.error} <MiniBtn label="Retry" onPress={friendship.retry} /></FormError> : null}
        {editing && <ProfileSettings user={profile.user} busy={busy} onLogout={() => void logout()} onSaved={updated => { setUser(updated); setProfile({ ...profile, user: updated }); setEditing(false); }} />}
        {error ? <FormError>{error}</FormError> : null}
        <View style={styles.toolbar}>
          <Segmented options={[{ id: "playground", label: "Timer" }, { id: "training", label: "Training" }]} value={activeMode} onChange={setMode} />
          <PuzzleSelect value={cube} onChange={setCube} />
          {activeMode === "playground" && <Select value={scrambleType} accessibilityLabel="Scramble type" options={puzzleInfo(cube).scrambles.map(type => ({ value: type, label: scrambleLabel(type) }))} onChange={value => setScrambleType(value as ScrambleType)} />}
          <Select value={solveMode} accessibilityLabel="Solve mode" options={SOLVE_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={value => setSolveMode(value as SolveMode)} />
        </View>
        <View style={styles.kpiRow}><Kpi label="Solves" value={profile.totalSolves.toLocaleString()} /><Kpi label="Training" value={profile.trainingSolves.toLocaleString()} /><Kpi label="Cases" value={String(profile.cases.length)} /><Kpi label="Active days" value={String(profile.activeDays)} /></View>
  </>;
  return <View style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}>
    {phone && selectedCase ? <View style={{ flex: 1, minHeight: 0 }}>{details}</View> : <View style={{ flex: 1, minHeight: 0, gap: 14 }}>
      <View style={styles.profileHeader}>
        {backButton}
        <Avatar username={profile.user.username} large />
        <View style={{ flex: 1, minWidth: 140 }}><H1 size={24}>{profile.user.username}</H1><Muted>{profile.user.bio ? profile.user.bio : `Joined ${new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}</Muted></View>
        {own ? <Btn small label={editing ? "Close" : "Edit"} onPress={() => { setEditing(v => !v); setError(""); }} /> : <FriendActions userId={profile.user.id} username={profile.user.username} state={friendship} />}
      </View>
      {activeMode === "training" ? <ProfileCaseGallery cases={cases} sets={sets} profile={profile} onOpen={openCase} phone={phone} header={summary} scrollKey={`profile-gallery:${target}:${cube}:${solveMode}`} />
        : <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: navSpace }} keyboardShouldPersistTaps="handled">
          {summary}
          {profile.playground.summary.count ? <ProfileStats data={profile.playground} own={own} />
          : <Empty icon={<IconUser size={28} color={t.readableMuted} />}><Muted>{own ? "No times in this selection yet." : "No times recorded yet."}</Muted>{own && <Btn small label="Open the timer" onPress={() => setRoute({ page: "playground" })} />}</Empty>}
        </ScrollView>}

    </View>}
    <Sheet open={!phone && !!selectedCase} title={`${selectedCase?.id ?? "Case"} statistics`} header={false} tall wide onClose={closeCase}>{details}</Sheet>
  </View>;
}

function ProfileSettings({ user, busy, onLogout, onSaved }: { user: UserDto; busy: boolean; onLogout: () => void; onSaved: (user: UserDto) => void }) {
  const t = useTheme();
  const [bio, setBio] = useState(user.bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setSaving(true); setError("");
    try { onSaved(await api.updateAccount({ bio })); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <>
    <View style={[styles.form, { maxWidth: 420 }]}>
      <View style={styles.field}><Text style={[styles.fieldLabel, { color: t.text2 }]}>Bio</Text><Input accessibilityLabel="Bio" value={bio} onChangeText={setBio} maxLength={240} multiline numberOfLines={2} placeholder="Your main cube, your next goal…" editable={!saving} style={{ minHeight: 64, textAlignVertical: "top" }} /></View>
      {error ? <FormError>{error}</FormError> : null}
      <View style={styles.toolbar}><Btn small variant="primary" disabled={saving} label={saving ? "Saving…" : "Save"} onPress={() => void submit()} /><Btn small variant="ghost" label="Sign out" onPress={onLogout} disabled={busy} /></View>
    </View>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  narrow: { maxWidth: 560 },
  form: { gap: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  searchIcon: { position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  memberProfile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  profileHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 12 },
});
