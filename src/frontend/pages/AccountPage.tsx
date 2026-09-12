import { Avatar } from "../components/Avatar";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { AppearanceSettings } from "../components/Settings";
import { FriendActions, useFriendActions } from "../components/FriendActions";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { api, authToken } from "../api";
import { puzzleAtom, solveModeAtom, scrambleTypeAtom, casesAtom, setsAtom, viewportSizeAtom, deletedSolveIdAtom, routeAtom, statsVersionAtom, userAtom, chatActivityAtom, chatPeerAtom } from "../state";
import { IconBack, IconMessage, IconSearch, IconUser } from "../components/icons";
import { FloatingSheet } from "../components/FloatingSheet";
import { ProfileCaseGallery, ProfileCaseDetails, ProfileStats } from "../components/ProfileProgress";
import type { ProfileDto, UserDto } from "../../shared/types";
import { modeLabel, puzzleInfo, scrambleLabel, type ScrambleType } from "../../shared/puzzles";

export function AccountForm({ initialMode = "register" }: { initialMode?: "register" | "login" } = {}) {
  const [mode, setMode] = useState<"register" | "login">(initialMode);
  const [, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const result = mode === "register"
        ? await api.register(String(form.get("username")), String(form.get("password")))
        : await api.login(String(form.get("username")), String(form.get("password")));
      authToken.set(result.token); setUser(result.user); bumpStats(v => v + 1);
      setRoute({ page: "profile" });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <form className="account-form card" onSubmit={submit}>
    <div className="segmented" role="tablist" aria-label="Account">
      {(["login", "register"] as const).map(m => <button type="button" role="tab" aria-selected={mode === m} aria-pressed={mode === m} key={m} disabled={busy} onClick={() => { setMode(m); setError(""); }}>{m === "register" ? "Create account" : "Sign in"}</button>)}
    </div>
    <p className="muted">{mode === "register" ? "An account syncs your times between devices and lets you add friends." : "Your local times are merged into your account."}</p>
    <label>Username<input className="input" name="username" autoComplete="username" pattern="[a-zA-Z0-9_]{3,24}" minLength={3} maxLength={24} required disabled={busy} autoCapitalize="none" spellCheck={false} /></label>
    <label>Password<input className="input" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 10 : 1} maxLength={128} required disabled={busy} /></label>
    {mode === "register" && <small className="muted">3–24 letters, digits or underscores. Password: 10 characters or more.</small>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="btn primary" disabled={busy}>{busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"}</button>
  </form>;
}

function GuestPage({ title, intro }: { title: string; intro: string }) {
  return <div className="page account-page">
    <div className="page-scroll">
      <h1>{title}</h1>
      <p className="muted">{intro}</p>
      <AccountForm />
      <AppearanceSettings />
    </div>
  </div>;
}

export function CommunityPage() {
  const friendship = useFriendActions();
  const [user] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const setPeer = useSetAtom(chatPeerAtom);
  const activity = useAtomValue(chatActivityAtom);
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
      api.users(query.trim(), controller.signal).then(setResults).catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, user, retry]);
  const scrollRef = usePreservedScroll(`community:${query}`);
  if (!user || user.isGuest) return <GuestPage title="Friends" intro="Sign in to find other cubers, share times and chat." />;
  const members: Pick<UserDto, "id" | "username" | "bio">[] = [...results];
  for (const friend of friendship.friends) {
    if (friend.status !== "pending" || !friend.username.toLowerCase().includes(query.trim().toLowerCase()) || members.some(m => m.id === friend.userId)) continue;
    members.push({ id: friend.userId, username: friend.username, bio: "" });
  }
  const openChat = (userId?: string) => { setPeer(userId ?? ""); setRoute({ page: "messages" }); };
  return <div className="page community-page">
    <div className="toolbar">
      <h1>Friends</h1>
      <button className="btn small" onClick={() => openChat()}><IconMessage /> Messages{activity && <span className="chat-activity-dot" aria-label="New messages" />}</button>
    </div>
    <label className="search"><IconSearch /><input className="input" aria-label="Search cubers" placeholder="Search cubers…" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} /></label>
    {friendship.error && <p className="form-error" role="alert">{friendship.error} <button className="mini-btn" onClick={friendship.retry}>Retry</button></p>}
    <div ref={scrollRef} className="page-scroll" aria-live="polite">
      {loading ? <div className="empty">Searching…</div> : error ? <div className="empty"><p role="alert">{error}</p><button className="btn small" onClick={() => setRetry(v => v + 1)}>Try again</button></div> : members.length === 0 ? <div className="empty">{query.trim() ? "No cubers found." : "No other cubers yet."}</div> : <div className="member-list">{members.map(member => {
        const friend = friendship.friends.find(f => f.userId === member.id);
        return <div className="member-row" key={member.id}>
          <button className="member-profile" onClick={() => setRoute({ page: "profile", username: member.username })}><Avatar user={member} /><span className="member-copy"><strong>{member.username}</strong>{member.bio && <span className="muted member-bio">{member.bio}</span>}</span></button>
          {friend?.status === "accepted" && <button className="btn small" onClick={() => openChat(member.id)}><IconMessage /> Message</button>}
          <FriendActions userId={member.id} username={member.username} state={friendship} />
        </div>;
      })}</div>}
    </div>
  </div>;
}

export function ProfilePage({ username, mode = "playground", caseId }: { username?: string; mode?: "playground" | "training"; caseId?: string }) {
  const cube = useAtomValue(puzzleAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const [scrambleType, setScrambleType] = useAtom(scrambleTypeAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const mobile = useAtomValue(viewportSizeAtom).width <= 700;
  const openedFromGallery = useRef(false);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const friendship = useFriendActions();
  const [user, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const setMode = (next: "playground" | "training") => setRoute({ page: "profile", username, mode: next });
  const openCase = useCallback((id: string) => {
    openedFromGallery.current = true;
    setRoute({ page: "profile", username, mode: "training", caseId: id });
  }, [setRoute, username]);
  const closeCase = () => {
    if (openedFromGallery.current) { openedFromGallery.current = false; window.history.back(); }
    else setRoute({ page: "profile", username, mode: "training" });
  };
  const target = username ?? user?.username;
  const own = target === user?.username;
  useEffect(() => {
    if (!target || !user || user.isGuest) return;
    const controller = new AbortController();
    setProfile(current => current?.user.username === target ? current : null); setError(""); setEditing(false);
    api.profile(target, controller.signal, cube, {solveMode,scrambleType}).then(value => { if (!controller.signal.aborted) setProfile(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [cube, solveMode, scrambleType, target, user?.id, user?.isGuest, version, deletedSolveId, statsVersion]);
  // Refresh after returning to the tab to show profile changes made elsewhere.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setVersion(v => v + 1); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  const activeMode = caseId ? "training" : mode;
  const profileScrollRef = usePreservedScroll(`profile:${username??"self"}:${cube}:${solveMode}:${activeMode}`);
  if (!user || user.isGuest) return <GuestPage title="Account" intro="Practise as a guest, or sign in to keep your times on every device." />;
  const logout = async () => {
    setBusy(true); setError("");
    try { await api.logout(); authToken.clear(); window.location.reload(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  if (!profile) return <div className="page account-page"><div className="toolbar">{!own && <button className="btn small ghost" onClick={() => setRoute({ page: "community" })}><IconBack /> Friends</button>}</div>{error ? <div className="empty"><p role="alert">{error}</p><button className="btn small" onClick={() => setVersion(v => v + 1)}>Try again</button></div> : <div className="empty">Loading…</div>}</div>;
  const selectedCase = cases.find(c => c.id === caseId);
  const selectedStats = profile.cases.find(c => c.summary.caseId === caseId);
  const details = selectedCase && <ProfileCaseDetails c={selectedCase} data={selectedStats} own={own} username={profile.user.username} mobile={mobile} onClose={closeCase} />;
  return <div className="page account-page profile-page">
    <div className="profile-home" hidden={mobile && !!selectedCase}>
      <header className="profile-header">
        {!own && <button className="btn small ghost" onClick={() => setRoute({ page: "community" })}><IconBack /> Friends</button>}
        <Avatar user={profile.user} large />
        <div className="profile-identity"><h1>{profile.user.username}</h1>{profile.user.bio ? <p className="muted">{profile.user.bio}</p> : <p className="muted">Joined {new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>}</div>
        {own ? <button className="btn small" onClick={() => { setEditing(v => !v); setError(""); }}>{editing ? "Close" : "Edit"}</button> : <FriendActions userId={profile.user.id} username={profile.user.username} state={friendship} />}
      </header>
      <div className="page-scroll" ref={profileScrollRef}>
        {friendship.error && <p className="form-error" role="alert">{friendship.error} <button className="mini-btn" onClick={friendship.retry}>Retry</button></p>}
        {editing && <ProfileSettings user={profile.user} busy={busy} onLogout={logout} onSaved={updated => { setUser(updated); setProfile({ ...profile, user: updated }); setEditing(false); }} />}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="toolbar">
          <div className="segmented">{(["playground", "training"] as const).map(m => <button key={m} aria-pressed={activeMode === m} onClick={() => setMode(m)}>{m === "playground" ? "Timer" : "Training"}</button>)}</div>
          <span className="muted">{puzzleInfo(cube).label} · {modeLabel(solveMode)}</span>
          {activeMode === "playground" && <select className="select" aria-label="Scramble type" value={scrambleType} onChange={event => setScrambleType(event.target.value as ScrambleType)}>{puzzleInfo(cube).scrambles.map(type => <option key={type} value={type}>{scrambleLabel(type)}</option>)}</select>}
        </div>
        <div className="kpi-row profile-overview"><Kpi label="Solves" value={profile.totalSolves.toLocaleString()} /><Kpi label="Training" value={profile.trainingSolves.toLocaleString()} /><Kpi label="Cases" value={String(profile.cases.length)} /><Kpi label="Active days" value={String(profile.activeDays)} /></div>
        {activeMode === "training" ? <ProfileCaseGallery cases={cases} sets={sets} profile={profile} onOpen={openCase} />
          : profile.playground.summary.count ? <ProfileStats data={profile.playground} own={own} />
          : <div className="empty"><IconUser /><p>{own ? "No times in this selection yet." : "No times recorded yet."}</p>{own && <button className="btn small" onClick={() => setRoute({ page: "playground" })}>Open the timer</button>}</div>}
      </div>
    </div>
    {mobile && selectedCase && <section key={selectedCase.id} className="profile-case-page" aria-label={`${selectedCase.id} statistics`}>{details}</section>}
    <FloatingSheet open={!mobile && !!selectedCase} title={`${selectedCase?.id ?? "Case"} statistics`} className="profile-case-dialog" onClose={closeCase}>{details}</FloatingSheet>
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="kpi"><div className="label">{label}</div><div className="value">{value}</div></div>;
}

function ProfileSettings({ user, busy, onLogout, onSaved }: { user: UserDto; busy: boolean; onLogout: () => void; onSaved: (user: UserDto) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try { onSaved(await api.updateAccount({ bio: String(data.get("bio")) })); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <>
    <form className="card profile-settings" onSubmit={submit}>
      <label>Bio<textarea className="input" name="bio" defaultValue={user.bio} maxLength={240} rows={2} placeholder="Your main cube, your next goal…" disabled={saving} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="toolbar"><button className="btn small primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button><button type="button" className="btn small ghost" onClick={onLogout} disabled={busy}>Sign out</button></div>
    </form>
    <AppearanceSettings />
  </>;
}
