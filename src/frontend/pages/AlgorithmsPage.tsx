import {usePreservedScroll} from "../hooks/usePreservedScroll";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { unwrap } from "jotai/utils";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { puzzleAtom, solveModeAtom, animationsEnabledAtom, collapsedAlgorithmGroupsAtom, trainedOnlyAtom, casesAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, stageAtom, statsAtom } from "../state";
import { type CaseDto, type CaseHistoryDto, type CaseStatsDto, type SetDto, type Stage } from "../../shared/types";
import { Cube3D, useAlgPlayer } from "../components/Cube3D";
import { CaseDiagram } from "../components/CaseDiagram";
import { caseState, displayAlg, executableAlg, maskForStage } from "../lib/caseState";
import { fmtTime } from "../lib/format";
import { api } from "../api";
import { AlgorithmList, AlgText } from "../components/AlgorithmList";
import { TimesChart } from "../components/TimesChart";
import { IconBack, IconPause, IconPlay, IconReset, IconStep, IconTimer } from "../components/icons";
import { formatAlg } from "../../shared/cube";
import { PuzzleSolutionPlayer } from "../components/PuzzleSolutionPlayer";
import { puzzleInfo, puzzleOf } from "../../shared/puzzles";
import type { AlgEntry } from "../../shared/types";

import { useShortcuts } from "../hooks/useShortcuts";
import { ShortcutKey } from "../components/ShortcutKey";

const statsMapAtom = unwrap(statsAtom, (prev) => prev ?? new Map<string, CaseStatsDto>());

const itemVariants = { hidden: { opacity: 0, y: 14, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 380, damping: 28 } } };

export function AlgorithmsPage() {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const stats = useAtomValue(statsMapAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const caseId = route.page === "algorithms" ? route.caseId : undefined;
  const selected = caseId ? cases.find(c => c.id === caseId) : undefined;
  const pageScrollRef = usePreservedScroll(`algorithms-page:${puzzle}:${caseId??'catalogue'}`);
  return <div className="page algorithms-page" ref={pageScrollRef}>
    <AnimatePresence mode="wait" initial={false}>
      {selected ? <CaseDetail key={selected.id} c={selected} stats={stats.get(selected.id)} onBack={() => setRoute({page:'algorithms'})}/>
        : <AlgorithmBrowser key="grid" puzzle={puzzle} cases={cases} sets={sets} stats={stats}/>}
    </AnimatePresence>
  </div>;
}

function AlgorithmBrowser({puzzle,cases,sets,stats}:{puzzle:string;cases:CaseDto[];sets:SetDto[];stats:Map<string,CaseStatsDto>}){
  const [trainedOnly,setTrainedOnly]=useAtom(trainedOnlyAtom);
  const [collapsed,setCollapsed]=useAtom(collapsedAlgorithmGroupsAtom);
  const [stage,setStage]=useAtom(stageAtom);
  const [setByStage,setSetByStage]=useAtom(setByStageAtom);
  const setRoute=useSetAtom(routeAtom),setSelection=useSetAtom(selectedCaseIdsAtom);
  const groupId=useId(),animationsEnabled=useAtomValue(animationsEnabledAtom),reducedMotion=useReducedMotion();
  const foldTransition={duration:animationsEnabled && !reducedMotion ? .22 : 0,ease:[.22,1,.36,1] as const};
  const sections=useMemo(()=>[...new Set(sets.map(set=>set.stage))].map(stage=>{
    const variants=sets.filter(set=>set.stage===stage);
    const active=variants.find(set=>set.id===setByStage[stage])??variants[0];
    const all=cases.filter(c=>c.set===active.id),trained=all.filter(c=>(stats.get(c.id)?.count??0)>0);
    const groups=new Map<string,CaseDto[]>();
    for(const c of trainedOnly?trained:all){const list=groups.get(c.group)??[];list.push(c);groups.set(c.group,list);}
    return {stage,variants,active,all,trained,groups:[...groups]};
  }),[sets,cases,setByStage,stats,trainedOnly]);
  const listRef=useRef<HTMLDivElement|null>(null),navRef=useRef<HTMLElement|null>(null),pendingJump=useRef<Stage|null>(null);
  useEffect(()=>{
    const nav=navRef.current,active=nav?.querySelector<HTMLElement>('[aria-current="location"]');if(!nav||!active)return;
    const bounds=nav.getBoundingClientRect(),tab=active.getBoundingClientRect();
    if(tab.left<bounds.left)nav.scrollLeft+=tab.left-bounds.left;
    else if(tab.right>bounds.right)nav.scrollLeft+=tab.right-bounds.right;
  },[stage]);
  const preserveScroll=usePreservedScroll(`algorithms:${puzzle}:all-stages:${trainedOnly}`);
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
  const jumpTo=useCallback((stage:Stage,smooth=true)=>{
    const list=listRef.current;
    const target=list&&[...list.querySelectorAll<HTMLElement>('[data-catalog-stage]')].find(section=>section.dataset.catalogStage===stage);
    if(!list||!target)return;
    list.scrollTo({top:list.scrollTop+target.getBoundingClientRect().top-list.getBoundingClientRect().top,behavior:smooth&&animationsEnabled&&!reducedMotion?'smooth':'instant'});
    setStage(stage);
  },[animationsEnabled,reducedMotion,setStage]);
  useLayoutEffect(()=>{if(pendingJump.current){jumpTo(pendingJump.current,false);pendingJump.current=null;}},[setByStage,jumpTo]);
  const openCase=useCallback((id:string)=>setRoute({page:'algorithms',caseId:id}),[setRoute]);
  const trainAll=(list:CaseDto[])=>{setSelection(list.map(c=>c.id));setRoute({page:'training',autostart:true});};
  return <motion.div className="case-browser" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}}>
    <div className="page-header catalog-navigation">
      <LayoutGroup id="stage-tabs">
        <nav ref={navRef} className="tabs" aria-label="Algorithm sections">
          {sections.map(section=><motion.button type="button" key={section.stage} className={`tab ${section.stage===stage?'active':''}`} aria-current={section.stage===stage?'location':undefined} aria-controls={`${groupId}-stage-${encodeURIComponent(section.stage)}`} onClick={()=>jumpTo(section.stage)}>
            {section.stage===stage&&<motion.span className="tab-pill" layoutId="stage-pill" transition={{type:'spring',stiffness:500,damping:36}}/>}
            <span>{section.stage}</span>
          </motion.button>)}
        </nav>
      </LayoutGroup>
      <button type="button" className="catalog-trained-filter" aria-pressed={trainedOnly} onClick={()=>setTrainedOnly(value=>!value)}>
        <IconTimer/><span>Trained only</span><span className="count">{sections.reduce((sum,s)=>sum+s.trained.length,0)} / {sections.reduce((sum,s)=>sum+s.all.length,0)}</span>
      </button>
    </div>
    <div ref={scrollRef} className="case-list catalog-sections">
      {sections.map(({stage:sectionStage,variants,active,groups})=><section key={sectionStage} id={`${groupId}-stage-${encodeURIComponent(sectionStage)}`} className="catalog-stage" data-catalog-stage={sectionStage} aria-label={sectionStage}>
        <header className="catalog-stage-header">
          <h2>{sectionStage}</h2>
          {variants.length>1&&<div className="tabs small" role="group" aria-label={`${sectionStage} variants`}>
            {variants.map(variant=><button type="button" key={variant.id} className={`tab ${variant.id===active.id?'active':''}`} aria-pressed={variant.id===active.id} title={variant.description} onClick={()=>{
              if(variant.id===active.id)return;
              pendingJump.current=sectionStage;setSetByStage(previous=>({...previous,[sectionStage]:variant.id}));
            }}><span>{variant.label}</span><span className="count">{variant.count}</span></button>)}
          </div>}
        </header>
        <p className="subtle catalog-stage-description">{active.description}</p>
        {groups.map(([group,list])=>{
          const key=`${active.id}:${group}`,expanded=!collapsed[key],contentId=`${groupId}-${encodeURIComponent(key)}`;
          return <section key={key} aria-label={group}>
            <div className="group-title catalog-group-title">
              <h3><button type="button" className="catalog-group-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={()=>setCollapsed(previous=>({...previous,[key]:!previous[key]}))}>
                <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" initial={false} animate={{rotate:expanded?0:-90}} transition={foldTransition}><path d="m6 9 6 6 6-6"/></motion.svg>
                <span>{group}</span><span className="count">{list.length}</span>
              </button></h3>
              <button type="button" className="btn ghost small group-train" onClick={()=>trainAll(list)} title={`Train the ${list.length} cases of ${group}`}><IconTimer/> Train all</button>
            </div>
            <div id={contentId} inert={!expanded}>
              <AnimatePresence initial={false}>{expanded&&<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={foldTransition} style={{overflow:'hidden'}}>
                <div className="grid-cases">{list.map(c=><CaseCard key={c.id} c={c} stats={stats.get(c.id)} onOpen={openCase}/>)}</div>
              </motion.div>}</AnimatePresence>
            </div>
          </section>;
        })}
        {!groups.length&&<div className="empty"><p>No trained cases in this set yet.</p><button type="button" className="btn ghost small" onClick={()=>setTrainedOnly(false)}>Show all cases</button></div>}
      </section>)}
    </div>
  </motion.div>;
}

const CaseCard=memo(function CaseCard({ c, stats, onOpen }: { c: CaseDto; stats?: CaseStatsDto; onOpen: (id:string) => void }) {
  return (
    <motion.button className="case-card" onClick={()=>onOpen(c.id)} variants={itemVariants}>
      {stats && <span className="trained-dot" title={`${stats.count} solves`} />}
      <div className="case-cube">
        <CaseDiagram c={c} size={102} />
      </div>
      <div className="case-id">{c.id}</div>
      {c.name !== c.id && <div className="case-name">{c.name}</div>}
      <div className="case-stats">
        {stats ? (
          <>
            <span>
              best <b>{fmtTime(stats.best)}</b>
            </span>
            <span>
              avg <b>{fmtTime(stats.mean)}</b>
            </span>
          </>
        ) : (
          <span className="muted">not trained</span>
        )}
      </div>
    </motion.button>
  );
});

function CaseDetail({ c, stats, onBack }: { c: CaseDto; stats?: CaseStatsDto; onBack: () => void }) {
  const setRoute = useSetAtom(routeAtom);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const [algIndex, setAlgIndex] = useState(0);
  const [activePane, setActivePane] = useState<"algorithms" | "statistics">("algorithms");
  const paneId = useId();
  const algScrollRef=usePreservedScroll<HTMLElement>(`case:${c.id}:algorithms`);
  const statsScrollRef=usePreservedScroll<HTMLElement>(`case:${c.id}:statistics:${solveMode}`);
  const detailScrollRef=usePreservedScroll(`case:${c.id}:detail`);
  const [history, setHistory] = useState<CaseHistoryDto | null>(null);
  const active = c.algorithms[algIndex] ?? c.algorithms[0];

  useEffect(() => {
    let alive = true;
    api.caseHistory(c.id,{solveMode}).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [c.id, stats?.count]);

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
  useShortcuts([
    { key: "b", run: onBack },
    { key: "t", run: train },
  ]);
  const summary = history?.summary ?? stats;

  return (
    <motion.div ref={detailScrollRef} className="detail case-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <div className="case-detail-heading">
        <motion.button className="btn ghost small" onClick={onBack} style={{ marginLeft: -10, marginBottom: 10 }} variants={itemVariants}>
          <IconBack /> {c.setLabel} <ShortcutKey letter="B" />
        </motion.button>
        <motion.div className="detail-title" variants={itemVariants}>
          <h1>{c.id}</h1>
          {c.name !== c.id && <span className="subtle" style={{ fontSize: 17 }}>{c.name}</span>}
        </motion.div>
        <motion.div className="detail-meta" variants={itemVariants}>
          <span className="chip">{c.stage}</span>
          <span className="chip">{c.group}</span>
          {c.subgroup && c.subgroup !== c.group && <span className="chip">{c.subgroup}</span>}
          {c.probability && <span className="chip">P = {c.probability}</span>}
          <span className="chip">{c.algorithms.length} algorithms</span>
        </motion.div>

      </div>
      <div className="case-pane-tabs" aria-label="Case content">
        <button type="button" aria-pressed={activePane === "algorithms"} aria-controls={`${paneId}-algorithms`} onClick={() => setActivePane("algorithms")}>Algorithms</button>
        <button type="button" aria-pressed={activePane === "statistics"} aria-controls={`${paneId}-statistics`} onClick={() => setActivePane("statistics")}>Statistics</button>
      </div>
      <div className="case-content-panels" data-active-pane={activePane}>
        <section ref={algScrollRef} id={`${paneId}-algorithms`} className="case-scroll-pane case-algorithms-pane" aria-label="Case algorithms" tabIndex={0}>
        <motion.div className="card" variants={itemVariants}>
          <div className="setup-block">
            <div>
              <h2>Setup</h2>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>
                {puzzleInfo(puzzleOf(c)).cubeSize ? "Apply on a solved cube (yellow up, green front) to get this case." : "Apply to a solved puzzle."}
              </p>
              <AlgText alg={puzzleInfo(puzzleOf(c)).cubeSize ? formatAlg(c.setup) : c.setup} className="large" />
            </div>
            <button className="btn primary" onClick={train} aria-keyshortcuts="Alt+t">
              <IconTimer /> Train this case <ShortcutKey letter="T" />
            </button>
          </div>
          {c.notes && <p className="case-note">{c.notes}</p>}
          {c.setups_alt.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>
                {c.setups_alt.length} alternative setup{c.setups_alt.length > 1 ? "s" : ""}
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {c.setups_alt.map((s) => (
                  <AlgText key={s} alg={s} />
                ))}
              </div>
            </details>
          )}
        </motion.div>

        <motion.div className="card" variants={itemVariants}>
          <h2>Algorithms</h2>
          <AlgorithmList algorithms={c.algorithms} activeIndex={algIndex} onSelect={setAlgIndex} />
        </motion.div>

          <CaseSolutionPlayer c={c} active={active} />
        </section>
        <section ref={statsScrollRef} id={`${paneId}-statistics`} className="case-scroll-pane case-statistics-pane" aria-label="Case statistics" tabIndex={0}>
        <motion.div className="card" variants={itemVariants}>
          <h2>Statistics</h2>
          {summary && summary.count > 0 ? (
            <>
              <div className="kpi-row" style={{ marginBottom: 16 }}>
                <Kpi label="Solves" value={String(summary.count)} />
                <Kpi label="Best" value={fmtTime(summary.best)} />
                <Kpi label="Mean" value={fmtTime(summary.mean)} />
                <Kpi label="Ao5" value={fmtTime(summary.ao5)} />
                <Kpi label="Ao12" value={fmtTime(summary.ao12)} />
                <Kpi label="Best Ao5" value={fmtTime(summary.bestAo5)} />
              </div>
              {history && <TimesChart history={history.history} ao5={history.ao5} />}
            </>
          ) : (
            <div className="empty">No solves yet.</div>
          )}
        </motion.div>
        </section>
      </div>
    </motion.div>
  );
}

export const Kpi = memo(function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={value} className={`value ${small ? "small" : ""}`} initial={{ opacity: 0, y: 8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.94 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
          {value}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

function CaseSolutionPlayer({c,active}:{c:CaseDto;active:AlgEntry}) {
  return puzzleInfo(puzzleOf(c)).cubeSize ? <CubeSolutionPlayer c={c} active={active}/> : <PuzzleSolutionPlayer puzzle={puzzleOf(c)} setup={c.setup} alg={executableAlg(active)}/>;
}
function CubeSolutionPlayer({c,active}:{c:CaseDto;active:AlgEntry}) {
  const initial=useMemo(()=>caseState(c),[c.id]);
  const player=useAlgPlayer(initial,executableAlg(active));
  useShortcuts([
    {key:"p",run:player.playing?player.pause:player.play},
    {key:"r",run:player.reset},
    {key:"j",run:()=>{if(!player.playing&&player.index<player.total)player.stepForward();}},
  ]);
  return (      <motion.div className="case-player" initial={{ opacity: 0, x: 0, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
        <div className="cube-stage">
          <Cube3D state={player.state} animation={player.animation} size={260} mask={maskForStage(c.stage)} interactive />
        </div>
        <div className="progress" style={{ maxWidth: 260 }}>
          <div style={{ width: `${player.total ? (player.index / player.total) * 100 : 0}%` }} />
        </div>
        <div className="player-controls">
          <button className="btn icon" onClick={player.reset} title="Reset to the case (Alt + R)" aria-label="Reset to the case" aria-keyshortcuts="Alt+r">
            <IconReset /><ShortcutKey letter="R" />
          </button>
          <button className="btn primary" aria-keyshortcuts="Alt+p" onClick={player.playing ? player.pause : player.play}>
            {player.playing ? <IconPause /> : <IconPlay />}
            {player.playing ? "Pause" : player.index >= player.total ? "Replay" : "Play"} <ShortcutKey letter="P" />
          </button>
          <button className="btn icon" onClick={player.stepForward} disabled={player.playing || player.index >= player.total} title="Next move (Alt + J)" aria-label="Next move" aria-keyshortcuts="Alt+j">
            <IconStep /><ShortcutKey letter="J" />
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Showing
          </div>
          <AlgText alg={displayAlg(active)} />
        </div>
      </motion.div>
);
}
