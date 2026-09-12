import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { memo, useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import { type CaseDto, type CaseHistoryDto, type ProfileDto, type SetDto } from "../../shared/types";
import { routeAtom, selectedCaseIdsAtom } from "../state";
import { fmtDate, fmtTime } from "../lib/format";
import { CaseDiagram } from "./CaseDiagram";
import { TimesChart } from "./TimesChart";
import { IconBack, IconClose, IconTimer } from "./icons";

export function ProfileStats({ data, own }: { data: CaseHistoryDto; own: boolean }) {
  const metrics: [string, number | null][] = [["Best", data.summary.best], ["Mean", data.summary.mean], ["Ao5", data.summary.ao5], ["Ao12", data.summary.ao12], ["Best Ao5", data.summary.bestAo5], ["Best Ao12", data.summary.bestAo12]];
  return <>
    <div className="kpi-row profile-kpis">{metrics.map(([label, value]) => <div className="kpi" key={label}><div className="label">{label}</div><div className="value">{fmtTime(value)}</div></div>)}</div>
    <TimesChart history={data.history} ao5={data.ao5} height={240} />
    <div className="profile-recent"><div className="section-heading"><h2>Recent times</h2><span className="muted">{data.summary.count} solves</span></div><div className="recent-time-list">{data.history.slice(-20).reverse().map(s => <div className="recent-time" key={s.id} data-solve-id={own ? s.id : undefined} tabIndex={own ? 0 : undefined}><span className={`mono ${s.time === null ? "form-error" : ""}`}>{s.time === null ? "DNF" : fmtTime(s.time)}{s.penalty === "+2" && <small> +2</small>}</span><span className="muted">{fmtDate(s.at)}</span></div>)}</div></div>
  </>;
}

const CaseTile = memo(function CaseTile({ c, stats, onOpen }: { c: CaseDto; stats?: CaseHistoryDto; onOpen: (id: string) => void }) {
  const trained = !!stats?.summary.count;
  return <button type="button" className={`profile-case-tile ${trained ? "trained" : "untrained"}`} data-case-id={c.id} aria-label={`${c.id}, ${trained ? `${stats.summary.count} solves` : "not trained"}`} onClick={() => onOpen(c.id)}>
    <span className="profile-case-cube" aria-hidden="true"><CaseDiagram c={c} size={72} /></span>
    <strong>{c.id}</strong>
    <span className="profile-case-best">{trained ? fmtTime(stats.summary.best) : "—"}</span>
  </button>;
});

export function ProfileCaseGallery({ cases, sets, profile, onOpen }: { cases: CaseDto[]; sets: SetDto[]; profile: ProfileDto; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const byCase = useMemo(() => new Map(profile.cases.map(c => [c.summary.caseId, c])), [profile.cases]);
  const q = query.trim().toLowerCase();
  const groups = sets.map(set => ({ set, cases: cases.filter(c => c.set === set.id && (stage === "all" || c.stage === stage) && (!q || `${c.id} ${c.name} ${c.group} ${set.label}`.toLowerCase().includes(q))) })).filter(group => group.cases.length);
  return <div className="profile-case-gallery">
    <div className="toolbar">
      <input className="input" type="search" aria-label="Search cases" placeholder="Search cases…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="segmented" aria-label="Stage">{["all", ...new Set(sets.map(s => s.stage))].map(value => <button type="button" key={value} aria-pressed={stage === value} onClick={() => setStage(value)}>{value === "all" ? "All" : value}</button>)}</div>
    </div>
    <p className="muted">{profile.cases.length} / {cases.length} cases trained</p>
    {groups.map(({ set, cases: list }) => <details className="profile-case-group" key={set.id} open>
      <summary><span>{set.label}</span><span className="count">{list.filter(c => byCase.has(c.id)).length} / {list.length}</span></summary>
      <div className="profile-case-grid">{list.map(c => <CaseTile key={c.id} c={c} stats={byCase.get(c.id)} onOpen={onOpen} />)}</div>
    </details>)}
    {!groups.length && <p className="empty">No cases match.</p>}
  </div>;
}

export function ProfileCaseDetails({ c, data, own, username, mobile, onClose }: { c: CaseDto; data?: CaseHistoryDto; own: boolean; username: string; mobile: boolean; onClose: () => void }) {
  const scrollRef = usePreservedScroll(`profile-case:${username}:${c.id}`);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const setRoute = useSetAtom(routeAtom);
  return <>
    <div className="profile-case-topline">
      {mobile ? <button type="button" className="btn ghost" onClick={onClose}><IconBack />All cases</button> : <span className="eyebrow">{username}</span>}
      {!mobile && <button type="button" className="btn icon" aria-label="Close" onClick={onClose}><IconClose /></button>}
    </div>
    <div className="profile-case-detail-scroll" ref={scrollRef}>
      <header className="profile-case-detail-heading">
        <span aria-hidden="true"><CaseDiagram c={c} size={96} /></span>
        <div><h1>{c.id}</h1><p className="muted">{c.name !== c.id ? c.name : c.group} · {data?.summary.count ?? 0} solves</p></div>
        {own && <button type="button" className="btn" onClick={() => { setSelection([c.id]); setRoute({ page: "training" }); }}><IconTimer />Train</button>}
      </header>
      {data?.summary.count ? <ProfileStats key={c.id} data={data} own={own} /> : <div className="empty">Not trained yet.</div>}
    </div>
  </>;
}
