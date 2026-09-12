import { Kpi } from "../components/Kpi";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { unwrap } from "jotai/utils";
import { puzzleAtom, solveModeAtom, collapsedAlgorithmGroupsAtom, trainedOnlyAtom, casesAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, stageAtom, statsAtom } from "../state";
import { type CaseDto, type CaseHistoryDto, type CaseStatsDto, type SetDto, type Stage } from "../../shared/types";
import { CaseDiagram } from "../components/CaseDiagram";
import { displayAlg } from "../lib/caseState";
import { fmtTime } from "../lib/format";
import { api } from "../api";
import { AlgorithmBadges, AlgText } from "../components/AlgorithmList";
import { TimesChart } from "../components/TimesChart";
import { IconBack, IconTimer } from "../components/icons";
import { formatAlg } from "../../shared/cube";
import { puzzleInfo, puzzleOf } from "../../shared/puzzles";
import { useShortcuts } from "../hooks/useShortcuts";
import { ShortcutKey } from "../components/ShortcutKey";

const statsMapAtom = unwrap(statsAtom, (prev) => prev ?? new Map<string, CaseStatsDto>());

export function AlgorithmsPage() {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const stats = useAtomValue(statsMapAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const caseId = route.page === "algorithms" ? route.caseId : undefined;
  const selected = caseId ? cases.find(c => c.id === caseId) : undefined;
  return <div className="page algorithms-page">
    {selected ? <CaseDetail key={selected.id} c={selected} stats={stats.get(selected.id)} onBack={() => setRoute({page:'algorithms'})}/>
      : <AlgorithmBrowser key={puzzle} puzzle={puzzle} cases={cases} sets={sets} stats={stats}/>}
  </div>;
}

function AlgorithmBrowser({puzzle,cases,sets,stats}:{puzzle:string;cases:CaseDto[];sets:SetDto[];stats:Map<string,CaseStatsDto>}){
  const [trainedOnly,setTrainedOnly]=useAtom(trainedOnlyAtom);
  const [collapsed,setCollapsed]=useAtom(collapsedAlgorithmGroupsAtom);
  const [stage,setStage]=useAtom(stageAtom);
  const [setByStage,setSetByStage]=useAtom(setByStageAtom);
  const setRoute=useSetAtom(routeAtom),setSelection=useSetAtom(selectedCaseIdsAtom);
  const sections=useMemo(()=>[...new Set(sets.map(set=>set.stage))].map(stage=>{
    const variants=sets.filter(set=>set.stage===stage);
    const active=variants.find(set=>set.id===setByStage[stage])??variants[0];
    const all=cases.filter(c=>c.set===active.id),trained=all.filter(c=>(stats.get(c.id)?.count??0)>0);
    const groups=new Map<string,CaseDto[]>();
    for(const c of trainedOnly?trained:all){const list=groups.get(c.group)??[];list.push(c);groups.set(c.group,list);}
    return {stage,variants,active,all,trained,groups:[...groups]};
  }),[sets,cases,setByStage,stats,trainedOnly]);
  const listRef=useRef<HTMLDivElement|null>(null);
  const preserveScroll=usePreservedScroll(`algorithms:${puzzle}:${trainedOnly}`);
  // The active stage tab follows the section under the top of the list.
  const scrollRef=useCallback((element:HTMLDivElement|null)=>{
    listRef.current=element;if(!element)return;
    const cleanup=preserveScroll(element);let frame=0,previousStage:string|undefined;
    const track=()=>{
      frame=0;const top=element.getBoundingClientRect().top;
      const sections=[...element.querySelectorAll<HTMLElement>('[data-catalog-stage]')];
      const current=sections.filter(section=>section.getBoundingClientRect().top<=top+16).at(-1)??sections[0];
      if(current&&current.dataset.catalogStage!==previousStage){previousStage=current.dataset.catalogStage;setStage(previousStage as Stage);}
    };
    const onScroll=()=>{if(!frame)frame=requestAnimationFrame(track);};
    element.addEventListener('scroll',onScroll,{passive:true});onScroll();
    return()=>{cancelAnimationFrame(frame);element.removeEventListener('scroll',onScroll);cleanup?.();listRef.current=null;};
  },[preserveScroll,setStage]);
  const jumpTo=(stage:Stage)=>{
    const list=listRef.current;
    const target=list&&[...list.querySelectorAll<HTMLElement>('[data-catalog-stage]')].find(section=>section.dataset.catalogStage===stage);
    if(!list||!target)return;
    list.scrollTo({top:list.scrollTop+target.getBoundingClientRect().top-list.getBoundingClientRect().top});
    setStage(stage);
  };
  const openCase=useCallback((id:string)=>setRoute({page:'algorithms',caseId:id}),[setRoute]);
  const trainAll=(list:CaseDto[])=>{setSelection(list.map(c=>c.id));setRoute({page:'training',autostart:true});};
  return <div className="case-browser">
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Stage">
        {sections.map(section=><button type="button" key={section.stage} aria-pressed={section.stage===stage} onClick={()=>jumpTo(section.stage)}>{section.stage}</button>)}
      </div>
      <button type="button" className="btn small toggle" aria-pressed={trainedOnly} onClick={()=>setTrainedOnly(value=>!value)}>
        Trained only <span className="count">{sections.reduce((sum,s)=>sum+s.trained.length,0)}/{sections.reduce((sum,s)=>sum+s.all.length,0)}</span>
      </button>
    </div>
    <div ref={scrollRef} className="case-list">
      {sections.map(({stage:sectionStage,variants,active,groups})=><section key={sectionStage} className="catalog-stage" data-catalog-stage={sectionStage} aria-label={sectionStage}>
        <header className="catalog-stage-header">
          <h2>{sectionStage}</h2>
          {variants.length>1&&<div className="segmented small" role="group" aria-label={`${sectionStage} sets`}>
            {variants.map(variant=><button type="button" key={variant.id} aria-pressed={variant.id===active.id} title={variant.description} onClick={()=>setSetByStage(previous=>({...previous,[sectionStage]:variant.id}))}>{variant.label} <span className="count">{variant.count}</span></button>)}
          </div>}
        </header>
        {groups.map(([group,list])=>{
          const key=`${active.id}:${group}`,expanded=!collapsed[key];
          return <section key={key} aria-label={group} className="catalog-group">
            <div className="group-title">
              <button type="button" className="group-toggle" aria-expanded={expanded} onClick={()=>setCollapsed(previous=>({...previous,[key]:!previous[key]}))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{transform:expanded?'none':'rotate(-90deg)'}}><path d="m6 9 6 6 6-6"/></svg>
                <span>{group}</span><span className="count">{list.length}</span>
              </button>
              <button type="button" className="mini-btn" onClick={()=>trainAll(list)} title={`Train the ${list.length} cases of ${group}`}><IconTimer/> Train all</button>
            </div>
            {expanded&&<div className="grid-cases">{list.map(c=><CaseCard key={c.id} c={c} stats={stats.get(c.id)} onOpen={openCase}/>)}</div>}
          </section>;
        })}
        {!groups.length&&<div className="empty"><p>No trained cases in this set yet.</p><button type="button" className="btn small" onClick={()=>setTrainedOnly(false)}>Show all cases</button></div>}
      </section>)}
    </div>
  </div>;
}

const CaseCard=memo(function CaseCard({ c, stats, onOpen }: { c: CaseDto; stats?: CaseStatsDto; onOpen: (id:string) => void }) {
  return (
    <button className="case-card" onClick={()=>onOpen(c.id)}>
      {stats && <span className="trained-dot" title={`${stats.count} solves`} />}
      <CaseDiagram c={c} size={96} />
      <div className="case-id">{c.id.replace(/^\S+\s+/, "")}</div>
      {c.name !== c.id && <div className="case-name">{c.name}</div>}
      <div className="case-stats">{stats ? <><b>{fmtTime(stats.best)}</b> · {fmtTime(stats.mean)}</> : <span className="muted">—</span>}</div>
    </button>
  );
});

function CaseDetail({ c, stats, onBack }: { c: CaseDto; stats?: CaseStatsDto; onBack: () => void }) {
  const setRoute = useSetAtom(routeAtom);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const detailScrollRef = usePreservedScroll(`case:${c.id}:detail`);
  const [history, setHistory] = useState<CaseHistoryDto | null>(null);
  const isCube = !!puzzleInfo(puzzleOf(c)).cubeSize;

  useEffect(() => {
    let alive = true;
    api.caseHistory(c.id,{solveMode}).then((h) => alive && setHistory(h));
    return () => { alive = false; };
  }, [c.id, stats?.count, solveMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[aria-modal="true"]')) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const train = () => {
    setSelection([c.id]);
    setRoute({ page: "training", autostart: true });
  };
  useShortcuts([{ key: "b", run: onBack }, { key: "t", run: train }]);
  const summary = history?.summary ?? stats;

  return (
    <div className="detail">
      <div className="toolbar">
        <button className="btn small ghost" onClick={onBack}><IconBack /> {c.setLabel} <ShortcutKey letter="B" /></button>
        <button className="btn small primary" onClick={train} aria-keyshortcuts="Alt+t"><IconTimer /> Train <ShortcutKey letter="T" /></button>
      </div>
      <div className="detail-body" ref={detailScrollRef}>
        <header className="detail-hero">
          <CaseDiagram c={c} size={150} />
          <div>
            <h1>{c.id}</h1>
            {c.name !== c.id && <p>{c.name}</p>}
            <div className="chips"><span className="chip">{c.group}</span>{c.subgroup && c.subgroup !== c.group && <span className="chip">{c.subgroup}</span>}{c.probability && <span className="chip">P = {c.probability}</span>}</div>
          </div>
        </header>
        <section className="card">
          <h2>Setup</h2>
          <AlgText alg={isCube ? formatAlg(c.setup) : c.setup} className="large" />
          {c.setups_alt.length > 0 && <p className="muted">Also: {c.setups_alt.map((setup, i) => <span key={i}>{i > 0 && " · "}<AlgText alg={isCube ? formatAlg(setup) : setup} /></span>)}</p>}
          {c.notes && <p className="muted">{c.notes}</p>}
        </section>
        <section className="card">
          <h2>Algorithms</h2>
          <ol className="alg-list">
            {c.algorithms.map((a, i) => <li key={i} className="alg-row"><AlgText alg={displayAlg(a)} /><AlgorithmBadges algorithm={a} primary={i === 0} /></li>)}
          </ol>
        </section>
        <section className="card">
          <h2>Statistics</h2>
          {summary && summary.count > 0 ? <>
            <div className="kpi-row">
              <Kpi label="Solves" value={String(summary.count)} />
              <Kpi label="Best" value={fmtTime(summary.best)} />
              <Kpi label="Mean" value={fmtTime(summary.mean)} />
              <Kpi label="Ao5" value={fmtTime(summary.ao5)} />
              <Kpi label="Ao12" value={fmtTime(summary.ao12)} />
              <Kpi label="Best Ao5" value={fmtTime(summary.bestAo5)} />
            </div>
            {history && <TimesChart history={history.history} ao5={history.ao5} />}
          </> : <div className="empty">No solves yet.</div>}
        </section>
      </div>
    </div>
  );
}
