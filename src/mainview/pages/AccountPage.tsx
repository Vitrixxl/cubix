import { useEffect, useState, type FormEvent } from "react";
import { useAtom, useSetAtom } from "jotai";
import { api, authToken } from "../api";
import { routeAtom, statsVersionAtom, userAtom } from "../state";
import { IconBack, IconLock, IconSearch, IconUser } from "../components/icons";
import { TimesChart } from "../components/TimesChart";
import { fmtTime, fmtDate } from "../lib/format";
import type { ProfileDto, UserDto } from "../../shared/types";

export function Avatar({ user, large = false }: { user: Pick<UserDto, "displayName">; large?: boolean }) {
  return <span className={`avatar ${large ? "large" : ""}`} aria-hidden="true">{user.displayName.trim().slice(0, 2).toUpperCase()}</span>;
}

export function AccountForm() {
  const [mode, setMode] = useState<"register" | "login">("register");
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
        ? await api.register(String(form.get("username")), String(form.get("displayName")), String(form.get("password")))
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
      <div className="account-promise"><IconLock /><div><strong>Your pace. Your privacy.</strong><p>Your profile starts private. Go public whenever you’re ready to share.</p></div></div>
    </div>
    <form className="account-form" onSubmit={submit}>
      <div className="tabs" role="tablist" aria-label="Account access">
        {(["register", "login"] as const).map(m => <button type="button" role="tab" aria-selected={mode === m} className={`tab ${mode === m ? "active" : ""}`} key={m} disabled={busy} onClick={() => { setMode(m); setError(""); }}>{mode === m && <span className="tab-pill" />}<span>{m === "register" ? "Create account" : "Sign in"}</span></button>)}
      </div>
      <div><h2>{mode === "register" ? "Make yourself at home." : "Welcome back."}</h2><p className="muted">{mode === "register" ? "Your guest times will come with you." : "Sign in to find your times and profile."}</p></div>
      {mode === "register" && <label>Display name<input className="input" name="displayName" autoComplete="nickname" placeholder="What should we call you?" maxLength={40} required disabled={busy} /></label>}
      <label>Username<input className="input" name="username" autoComplete="username" placeholder="your_username" pattern="[a-zA-Z0-9_]{3,24}" minLength={3} maxLength={24} required disabled={busy} autoCapitalize="none" spellCheck={false} /><small>3–24 letters, numbers or underscores.</small></label>
      <label>Password<input className="input" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} minLength={mode === "register" ? 10 : 1} maxLength={128} required disabled={busy} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "One moment…" : mode === "register" ? "Create my account" : "Sign in"}</button>
      {user?.isGuest && <p className="muted account-footnote">You can also keep practising as a guest from the sidebar.</p>}
    </form>
  </div>;
}

export function CommunityPage() {
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
  if (!user || user.isGuest) return <AccountForm />;
  return <div className="page community-page">
    <div className="page-header"><div><span className="eyebrow">BETTER, TOGETHER</span><h1>Find your fellow cubers.</h1><p className="subtle">Explore their times, personal bests and progress.</p></div></div>
    <label className="member-search"><IconSearch /><input className="input" aria-label="Search cubers" placeholder="Search by username or name…" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} />{query && <button className="mini-btn" onClick={() => setQuery("")}>Clear</button>}</label>
    <div className="community-caption"><h2>{query.trim() ? "Search results" : "Meet the community"}</h2><span className="muted">Public profiles only</span></div>
    <div aria-live="polite">
      {loading ? <div className="empty">Finding cubers…</div> : error ? <div className="empty"><p role="alert">{error}</p><button className="btn" onClick={() => setRetry(v => v + 1)}>Try again</button></div> : results.length === 0 ? <div className="member-empty"><IconSearch /><h2>{query.trim() ? "No cubers found." : "A community starts with you."}</h2><p>{query.trim() ? "Try another name. Private accounts don’t appear here." : "Public profiles will appear here. You can make yours public from your profile settings."}</p></div> : <div className="member-list">{results.map(member => <button className="member-row" key={member.id} onClick={() => setRoute({ page: "profile", username: member.username })}><Avatar user={member} /><span className="member-copy"><strong>{member.displayName}</strong><span className="muted">@{member.username}</span>{member.bio && <span className="subtle member-bio">{member.bio}</span>}</span><span className="member-open">View profile <span aria-hidden="true">↗</span></span></button>)}</div>}
    </div>
  </div>;
}

export function ProfilePage({ username }: { username?: string }) {
  const [user, setUser] = useAtom(userAtom);
  const setRoute = useSetAtom(routeAtom);
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"playground" | "training">("playground");
  const [caseId, setCaseId] = useState("");
  const target = username ?? user?.username;
  const own = target === user?.username;
  useEffect(() => {
    if (!target || !user || user.isGuest) return;
    const controller = new AbortController();
    setProfile(null); setError(""); setEditing(false);
    api.profile(target, controller.signal).then(setProfile).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [target, user?.id, user?.isGuest, version]);
  // Refresh after returning to the tab, including privacy changes made elsewhere.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setVersion(v => v + 1); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  if (!user || user.isGuest) return <AccountForm />;
  const logout = async () => {
    setBusy(true); setError("");
    try { await api.logout(); authToken.clear(); window.location.reload(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  if (!profile) return <div className="page"><button className="btn ghost small" onClick={() => setRoute({ page: "community" })}><IconBack /> Community</button>{error ? <div className="member-empty"><IconLock /><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="btn" onClick={() => setVersion(v => v + 1)}>Try again</button></div> : <div className="empty">Loading profile…</div>}</div>;
  const data = mode === "playground" ? profile.playground : (profile.cases.find(c => c.summary.caseId === caseId) ?? profile.cases[0]);
  return <div className="page profile-page">
    <div className="profile-topline"><button className="btn ghost small" onClick={() => setRoute({ page: "community" })}><IconBack /> Community</button>{own && <button className="btn ghost small" onClick={logout} disabled={busy}>Sign out</button>}</div>
    <header className="profile-header"><Avatar user={profile.user} large /><div className="profile-identity"><div className="profile-name"><h1>{profile.user.displayName}</h1><span className={`chip privacy-chip ${profile.user.isPrivate ? "" : "public"}`}>{profile.user.isPrivate ? <IconLock /> : <IconUser />}{profile.user.isPrivate ? "Private" : "Public"}</span></div><span className="subtle">@{profile.user.username} <span className="muted">· Joined {new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span></span>{profile.user.bio && <p className="profile-bio">{profile.user.bio}</p>}</div>{own && <button className="btn" onClick={() => { setEditing(v => !v); setError(""); }}>{editing ? "Close settings" : "Edit profile"}</button>}</header>
    {own && profile.user.isPrivate && <p className="privacy-note"><IconLock /> Only you can see this profile and your times. You’re hidden from search.</p>}
    {editing && <ProfileSettings user={profile.user} onSaved={updated => { setUser(updated); setProfile({ ...profile, user: updated }); setEditing(false); }} />}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="profile-overview"><div><strong>{profile.totalSolves.toLocaleString()}</strong><span>Total solves</span></div><div><strong>{profile.trainingSolves.toLocaleString()}</strong><span>Training solves</span></div><div><strong>{profile.cases.length}</strong><span>Cases practised</span></div><div><strong>{profile.activeDays}</strong><span>Active days</span></div></div>
    <section className="profile-progress"><div className="profile-section-heading"><div><span className="eyebrow">ONE SOLVE AT A TIME</span><h2>Progress & personal bests</h2></div><div className="tabs small">{(["playground", "training"] as const).map(m => <button className={`tab ${mode === m ? "active" : ""}`} key={m} onClick={() => setMode(m)}>{mode === m && <span className="tab-pill" />}<span>{m === "playground" ? "Playground" : "Training"}</span></button>)}</div></div>
      {mode === "training" && profile.cases.length > 0 && <label className="profile-case-picker">Case<select className="input" value={data?.summary.caseId} onChange={e => setCaseId(e.target.value)}>{profile.cases.map(c => <option key={c.summary.caseId} value={c.summary.caseId}>{c.stage} · {c.summary.caseId} — {c.name}</option>)}</select></label>}
      {!data?.summary.count ? <div className="member-empty"><IconUser /><h2>The next solve is the first step.</h2><p>{own ? "Start a session and your times and progress will appear here." : "No times recorded in this mode yet."}</p>{own && <button className="btn primary" onClick={() => setRoute({ page: mode })}>Start {mode === "training" ? "training" : "solving"}</button>}</div> : <>
        <div className="profile-kpis">{[["Best single", fmtTime(data.summary.best)], ["Mean", fmtTime(data.summary.mean)], ["Ao5", fmtTime(data.summary.ao5)], ["Ao12", fmtTime(data.summary.ao12)], ["Best Ao5", fmtTime(data.summary.bestAo5)], ["Best Ao12", fmtTime(data.summary.bestAo12)]].map(([label, value]) => <div className="kpi" key={label}><div className="label">{label}</div><div className="value">{value}</div></div>)}</div>
        <TimesChart key={`${target}:${data.summary.caseId}`} history={data.history} ao5={data.ao5} height={280} />
        <div className="profile-recent"><div className="profile-section-heading"><h2>Recent times</h2><span className="muted">{data.summary.count} solves · latest 20</span></div><div className="recent-time-list">{data.history.slice(-20).reverse().map(s => <div className="recent-time" key={s.id}><span className={`mono ${s.time === null ? "form-error" : ""}`}>{s.time === null ? "DNF" : fmtTime(s.time)}{s.penalty === "+2" && <small> +2</small>}</span><span className="muted">{fmtDate(s.at)}</span></div>)}</div></div>
      </>}
    </section>
  </div>;
}

function ProfileSettings({ user, onSaved }: { user: UserDto; onSaved: (user: UserDto) => void }) {
  const [isPrivate, setPrivate] = useState(user.isPrivate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { onSaved(await api.updateAccount({ displayName: String(data.get("displayName")), bio: String(data.get("bio")), isPrivate })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <form className="profile-settings" onSubmit={submit}><div className="profile-fields"><label>Display name<input className="input" name="displayName" defaultValue={user.displayName} required maxLength={40} disabled={busy} /></label><label>Bio<textarea className="input" name="bio" defaultValue={user.bio} maxLength={240} rows={2} placeholder="Your favourite cube, your next goal…" disabled={busy} /></label></div><div className="privacy-setting"><div><strong>Private profile</strong><p className="muted">{isPrivate ? "Only you can see your times. Your account is hidden from search." : "Other members can find your account and see all your times and progress."}</p></div><button type="button" className={`switch ${isPrivate ? "on" : ""}`} role="switch" aria-label="Private profile" aria-checked={isPrivate} disabled={busy} onClick={() => setPrivate(v => !v)}><span className="switch-track" /></button></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form>;
}
