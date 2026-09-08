import { memo, useId, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { STAGES, type CaseDto, type CaseHistoryDto, type ProfileDto, type SetDto } from "../../shared/types";
import { animationsEnabledAtom, routeAtom, selectedCaseIdsAtom } from "../state";
import { caseState, maskForStage } from "../lib/caseState";
import { fmtDate, fmtTime } from "../lib/format";
import { StaticCubeSvg } from "./StaticCubeSvg";
import { TimesChart } from "./TimesChart";
import { IconBack, IconClose, IconSearch, IconTimer } from "./icons";

export function ProfileStats({ data, own }: { data: CaseHistoryDto; own: boolean }) {
  const metrics: [string, number | null][] = [["Best single", data.summary.best], ["Mean", data.summary.mean], ["Ao5", data.summary.ao5], ["Ao12", data.summary.ao12], ["Best Ao5", data.summary.bestAo5], ["Best Ao12", data.summary.bestAo12]];
  return <>
    <div className="profile-kpis">{metrics.map(([label, value]) => <div className="kpi" key={label}><div className="label">{label}</div><div className="value">{fmtTime(value)}</div></div>)}</div>
    <TimesChart history={data.history} ao5={data.ao5} height={260} />
    <div className="profile-recent"><div className="profile-section-heading"><h2>Recent times</h2><span className="muted">{data.summary.count} solves · latest 20</span></div><div className="recent-time-list">{data.history.slice(-20).reverse().map(s => <div className="recent-time" key={s.id} data-solve-id={own ? s.id : undefined} tabIndex={own ? 0 : undefined}><span className={`mono ${s.time === null ? "form-error" : ""}`}>{s.time === null ? "DNF" : fmtTime(s.time)}{s.penalty === "+2" && <small> +2</small>}</span><span className="muted">{fmtDate(s.at)}</span></div>)}</div></div>
  </>;
}

const CaseTile = memo(function CaseTile({ c, stats, onOpen }: { c: CaseDto; stats?: CaseHistoryDto; onOpen: (id: string) => void }) {
  const trained = !!stats?.summary.count;
  return <button type="button" className={`profile-case-tile ${trained ? "trained" : "untrained"}`} data-case-id={c.id} aria-label={`${c.id}, ${trained ? `${stats.summary.count} solves` : "not trained"}`} onClick={() => onOpen(c.id)}>
    <span className="profile-case-cube" aria-hidden="true"><StaticCubeSvg state={caseState(c)} size={76} mask={maskForStage(c.stage)} /></span>
    <strong>{c.id}</strong>
    <span className="profile-case-best">{trained ? fmtTime(stats.summary.best) : "—"}</span>
    <small>{trained ? `${stats.summary.count} solves` : "Not trained"}</small>
  </button>;
});

export function ProfileCaseGallery({ cases, sets, profile, onOpen }: { cases: CaseDto[]; sets: SetDto[]; profile: ProfileDto; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groupId = useId();
  const animationsEnabled = useAtomValue(animationsEnabledAtom);
  const reducedMotion = useReducedMotion();
  const transition = { duration: animationsEnabled && !reducedMotion ? .22 : 0, ease: [.22, 1, .36, 1] as const };
  const byCase = useMemo(() => new Map(profile.cases.map(c => [c.summary.caseId, c])), [profile.cases]);
  const q = query.trim().toLowerCase();
  const groups = sets.map(set => ({ set, cases: cases.filter(c => c.set === set.id && (stage === "all" || c.stage === stage) && (!q || `${c.id} ${c.name} ${c.group} ${set.label}`.toLowerCase().includes(q))) })).filter(group => group.cases.length);
  return <div className="profile-case-gallery">
    <div className="profile-gallery-toolbar">
      <label className="profile-case-search"><IconSearch /><input className="input" type="search" aria-label="Search training cases" placeholder="Find a case…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="profile-stage-filters" aria-label="Filter cases by stage">{["all", ...STAGES].map(value => <button type="button" key={value} aria-pressed={stage === value} onClick={() => setStage(value)}>{value === "all" ? "All cases" : value}</button>)}</div>
    </div>
    <p className="profile-gallery-caption"><span>{profile.cases.length} / {cases.length} cases trained</span><span>Grey cases haven’t been trained yet.</span></p>
    {groups.map(({ set, cases: list }) => {
      const expanded = !collapsed[set.id];
      const contentId = `${groupId}-${set.id}`;
      return <section className="profile-case-group" key={set.id} aria-label={set.label} data-expanded={expanded}>
        <h3 className="profile-case-group-title"><button type="button" className="profile-case-group-heading" aria-label={set.label} aria-expanded={expanded} aria-controls={contentId} onClick={() => setCollapsed(previous => ({ ...previous, [set.id]: !previous[set.id] }))}>
          <span className="profile-case-group-name">{set.label}</span>
          <span className="profile-case-group-count">{list.filter(c => byCase.has(c.id)).length} / {list.length}</span>
          <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" initial={false} animate={{ rotate: expanded ? 0 : -90 }} transition={transition}><path d="m6 9 6 6 6-6" /></motion.svg>
        </button></h3>
        <div id={contentId} inert={!expanded}>
          <AnimatePresence initial={false}>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition} style={{ overflow: "hidden" }}>
            <div className="profile-case-grid">{list.map(c => <CaseTile key={c.id} c={c} stats={byCase.get(c.id)} onOpen={onOpen} />)}</div>
          </motion.div>}</AnimatePresence>
        </div>
      </section>;
    })}
    {!groups.length && <p className="empty">No cases match your search.</p>}
  </div>;
}

export function ProfileCaseDetails({ c, data, own, username, mobile, onClose }: { c: CaseDto; data?: CaseHistoryDto; own: boolean; username: string; mobile: boolean; onClose: () => void }) {
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const setRoute = useSetAtom(routeAtom);
  return <>
    <div className="profile-case-topline">
      {mobile ? <button type="button" className="btn ghost" onClick={onClose}><IconBack />All cases</button> : <span className="eyebrow">CASE PROGRESS</span>}
      {!mobile && <button type="button" className="btn icon" aria-label="Close case statistics" onClick={onClose}><IconClose /></button>}
    </div>
    <div className="profile-case-detail-scroll">
      <header className="profile-case-detail-heading">
        <span className="profile-case-detail-cube" aria-hidden="true"><StaticCubeSvg state={caseState(c)} size={104} mask={maskForStage(c.stage)} /></span>
        <div><span className="eyebrow">{username} · {c.stage}</span><h1>{c.id}</h1><p>{c.name !== c.id ? c.name : c.group}</p><span className="chip">{data?.summary.count ?? 0} solves</span></div>
        {own && <button type="button" className="btn profile-train-case" onClick={() => { setSelection([c.id]); setRoute({ page: "training" }); }}><IconTimer />Train this case</button>}
      </header>
      {data?.summary.count ? <ProfileStats key={c.id} data={data} own={own} /> : <div className="profile-case-empty"><h2>Not trained yet</h2><p>{own ? "Your times, averages and progress will appear here after your first solve." : "No times have been recorded for this case yet."}</p></div>}
    </div>
  </>;
}
