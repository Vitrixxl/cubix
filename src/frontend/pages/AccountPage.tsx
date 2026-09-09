import {usePreservedScroll} from "../hooks/usePreservedScroll";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AnimationSetting } from "../components/AnimationSetting";
import { FriendActions, useFriendActions } from "../components/FriendActions";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { api, authToken, local } from "../api";
import { puzzleAtom, solveModeAtom, scrambleTypeAtom, casesAtom, setsAtom, viewportSizeAtom, deletedSolveIdAtom, routeAtom, statsVersionAtom, userAtom } from "../state";
import { IconBack, IconLock, IconSearch, IconUser } from "../components/icons";
import { motion } from "motion/react";
import { FloatingSheet } from "../components/FloatingSheet";
import { ProfileCaseGallery, ProfileCaseDetails, ProfileStats } from "../components/ProfileProgress";
import type { ProfileDto, UserDto } from "../../shared/types";
import { modeLabel, puzzleInfo, scrambleLabel, type ScrambleType } from "../../shared/puzzles";

export function Avatar({ user, large = false }: { user: Pick<UserDto, "username">; large?: boolean }) {
  return <span className={`avatar ${large ? "large" : ""}`} aria-hidden="true"><span className="avatar-initials">{user.username.trim().slice(0, 2).toUpperCase()}</span></span>;
}

export function AccountForm({ initialMode = "register" }: { initialMode?: "register" | "login" } = {}) {
  const [mode, setMode] = useState<"register" | "login">(initialMode);
  const [user, setUser] = useAtom(userAtom);
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
  return <div className="page account-welcome">
    <div className="account-intro">
      <span className="eyebrow">YOUR CUBIX JOURNEY</span>
      <h1>Every solve.<br /><span>Your progress.</span></h1>
      <p>Give your times a home. Track your personal bests, see how far you’ve come, and find the cubers who inspire you.</p>
      <div className="account-promise"><IconUser /><div><strong>Join the community.</strong><p>Find other cubers and share your progress through your profile.</p></div></div>
    </div>
    <form className="account-form" onSubmit={submit}>
      <div className="tabs" role="tablist" aria-label="Account access">
        {(["register", "login"] as const).map(m => <button type="button" role="tab" aria-selected={mode === m} className={`tab ${mode === m ? "active" : ""}`} key={m} disabled={busy} onClick={() => { setMode(m); setError(""); }}>{mode === m && <span className="tab-pill" />}<span>{m === "register" ? "Create account" : "Sign in"}</span></button>)}
      </div>
      <div><h2>{mode === "register" ? "Make yourself at home." : "Welcome back."}</h2><p className="muted">{mode === "register" ? "Keep your times and progress." : "Sign in to find your times and profile."}</p></div>
      <label>Username<input className="input" name="username" autoComplete="username" placeholder="your_username" pattern="[a-zA-Z0-9_]{3,24}" minLength={3} maxLength={24} required disabled={busy} autoCapitalize="none" spellCheck={false} /><small>3–24 letters, numbers or underscores.</small></label>
      <label>Password<input className="input" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} minLength={mode === "register" ? 10 : 1} maxLength={128} required disabled={busy} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "One moment…" : mode === "register" ? "Create my account" : "Sign in"}</button>
      {user?.isGuest && <p className="muted account-footnote">You can also keep practising as a guest using the tabs below.</p>}
    </form>
  </div>;
}

export function CommunityPage() {
  const friendship = useFriendActions();
  const [user] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
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
  const scrollRef=usePreservedScroll(`community:${query}`);
  if (!user || user.isGuest) return <AccountForm />;
  const members: Pick<UserDto, "id" | "username" | "bio">[] = [...results];
  for (const friend of friendship.friends) {
    if (friend.status !== "pending" || !friend.username.toLowerCase().includes(query.trim().toLowerCase()) || members.some(m => m.id === friend.userId)) continue;
    members.push({ id: friend.userId, username: friend.username, bio: "" });
  }
  return <div className="page community-page">
    <div className="page-header"><div><span className="eyebrow">BETTER, TOGETHER</span><h1>Find your fellow cubers.</h1><p className="subtle">Explore their times, personal bests and progress.</p></div></div>
    <label className="member-search"><IconSearch /><input className="input" aria-label="Search cubers" placeholder="Search cubers…" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} />{query && <button className="mini-btn" onClick={() => setQuery("")}>Clear</button>}</label>
    {friendship.error && <p className="form-error" role="alert">{friendship.error} <button className="mini-btn" onClick={friendship.retry}>Retry</button></p>}
    <div className="community-caption"><h2>{query.trim() ? "Search results" : "Meet the community"}</h2><span className="muted">Cubers & invitations</span></div>
    <div ref={scrollRef} className="community-results" aria-live="polite">
      {loading ? <div className="empty">Finding cubers…</div> : error ? <div className="empty"><p role="alert">{error}</p><button className="btn" onClick={() => setRetry(v => v + 1)}>Try again</button></div> : members.length === 0 ? <div className="member-empty"><IconSearch /><h2>{query.trim() ? "No cubers found." : "A community starts with you."}</h2><p>{query.trim() ? "Try another name." : "Registered cubers will appear here."}</p></div> : <div className="member-list">{members.map(member => <div className="member-row" key={member.id}><button className="member-profile" onClick={() => setRoute({ page: "profile", username: member.username })}><Avatar user={member} /><span className="member-copy"><strong>{member.username}</strong>{member.bio && <span className="subtle member-bio">{member.bio}</span>}</span><span className="member-open">View profile <span aria-hidden="true">↗</span></span></button><FriendActions userId={member.id} username={member.username} state={friendship} /></div>)}</div>}
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
  const profileScrollRef=usePreservedScroll(`profile:${username??"self"}:${cube}:${solveMode}:${activeMode}`);
  if (!user || user.isGuest) return <AccountForm />;
  const logout = async () => {
    setBusy(true); setError("");
    try { await api.logout(); authToken.clear(); window.location.reload(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  if (!profile) return <div className="page"><button className="btn ghost small" onClick={() => setRoute({ page: "community" })}><IconBack /> Community</button>{error ? <div className="member-empty"><IconLock /><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="btn" onClick={() => setVersion(v => v + 1)}>Try again</button></div> : <div className="empty">Loading profile…</div>}</div>;
  const selectedCase = cases.find(c => c.id === caseId);
  const selectedStats = profile.cases.find(c => c.summary.caseId === caseId);
  const details = selectedCase && <ProfileCaseDetails c={selectedCase} data={selectedStats} own={own} username={profile.user.username} mobile={mobile} onClose={closeCase} />;
  return <div className="page profile-page">
    <div className="profile-home" hidden={mobile && !!selectedCase}>
    <div className="profile-topline"><button className="btn ghost small" onClick={() => setRoute({ page: "community" })}><IconBack /> Community</button>{own && <button className="btn ghost small" onClick={logout} disabled={busy}>Sign out</button>}</div>
    <header className="profile-header"><Avatar user={profile.user} large /><div className="profile-identity"><div className="profile-name"><h1>{profile.user.username}</h1></div><span className="subtle">Joined {new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>{profile.user.bio && <p className="profile-bio">{profile.user.bio}</p>}</div>{own && <button className="btn" onClick={() => { setEditing(v => !v); setError(""); }}>{editing ? "Close settings" : "Edit profile"}</button>}{!own && <FriendActions userId={profile.user.id} username={profile.user.username} state={friendship} />}</header>
    <div className="profile-body" ref={profileScrollRef}>
    {friendship.error && <p className="form-error" role="alert">{friendship.error} <button className="mini-btn" onClick={friendship.retry}>Retry</button></p>}
    {editing && <ProfileSettings user={profile.user} onSaved={updated => { setUser(updated); setProfile({ ...profile, user: updated }); setEditing(false); }} />}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="practice-controls"><span className="subtle">{puzzleInfo(cube).label} · {modeLabel(solveMode)}</span><label>Playground scramble type<Select value={scrambleType} onValueChange={value => setScrambleType(value as ScrambleType)}><SelectTrigger aria-label="Playground scramble type"><SelectValue/></SelectTrigger><SelectContent>{puzzleInfo(cube).scrambles.map(type => <SelectItem key={type} value={type}>{scrambleLabel(type)}</SelectItem>)}</SelectContent></Select></label></div>
    <div className="profile-overview"><div><strong>{profile.totalSolves.toLocaleString()}</strong><span>Solves in this selection</span></div><div><strong>{profile.trainingSolves.toLocaleString()}</strong><span>Training solves</span></div><div><strong>{profile.cases.length}</strong><span>Cases practised</span></div><div><strong>{profile.activeDays}</strong><span>Active days</span></div></div>
    <section className="profile-progress"><div className="profile-section-heading"><div><span className="eyebrow">ONE SOLVE AT A TIME</span><h2>Progress & personal bests</h2></div><div className="tabs small">{(["playground", "training"] as const).map(m => <button className={`tab ${activeMode === m ? "active" : ""}`} key={m} onClick={() => setMode(m)}>{activeMode === m && <span className="tab-pill" />}<span>{m === "playground" ? "Playground" : "Training"}</span></button>)}</div></div>
      {activeMode === "training" ? <ProfileCaseGallery cases={cases} sets={sets} profile={profile} onOpen={openCase} />
        : profile.playground.summary.count ? <ProfileStats data={profile.playground} own={own} />
        : <div className="member-empty"><IconUser /><h2>The next solve is the first step.</h2><p>{own ? "Start a session and your times and progress will appear here." : "No times recorded in this mode yet."}</p>{own && <button className="btn primary" onClick={() => setRoute({ page: "playground" })}>Start solving</button>}</div>}

    </section>
    </div>
    </div>
    {mobile && selectedCase && <motion.section key={selectedCase.id} className="profile-case-page" aria-label={`${selectedCase.id} statistics`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>{details}</motion.section>}
    <FloatingSheet open={!mobile && !!selectedCase} title={`${selectedCase?.id ?? "Case"} statistics`} className="profile-case-dialog" onClose={closeCase}>{details}</FloatingSheet>
  </div>;
}

function ProfileSettings({ user, onSaved }: { user: UserDto; onSaved: (user: UserDto) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { onSaved(await api.updateAccount({ bio: String(data.get("bio")) })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <form className="profile-settings" onSubmit={submit}><AnimationSetting /><div className="profile-fields"><label>Bio<textarea className="input" name="bio" defaultValue={user.bio} maxLength={240} rows={2} placeholder="Your favourite cube, your next goal…" disabled={busy} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form>;
}
