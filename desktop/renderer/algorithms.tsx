/** The algorithms page: the case list and the case detail. */
import { catalogSections } from "../../src/client/lib/practiceCatalog";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import { useLayoutEffect, useRef } from "react";
import { store as s } from "./store";
import { Cube } from "./Cube";
import { fmtTime } from "../../src/client/lib/format";
import { Alg, Button, Diagram, Empty, Icon, MOBILE, PageHead, useViewport } from "./ui";
import { TimerStats } from "./stats";
function useScrollPosition(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTop = s.scrollPositions.get(key) ?? 0;
    const save = () => s.scrollPositions.set(key, element.scrollTop);
    element.addEventListener("scroll", save);
    return () => element.removeEventListener("scroll", save);
  }, [key]);
  return ref;
}

/** Algorithms: the case list on the left and the chosen case on the right; phones open the case as a page. */
export function Algorithms() {
  const mobile = useViewport().w <= MOBILE;
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all");
  const learned = sections.reduce((sum, section) => sum + section.learnedCount, 0);
  const total = sections.reduce((sum, section) => sum + section.all.length, 0);
  if (mobile && s.caseId) return <Detail />;
  return (
    <div className="page algorithms-page">
      <PageHead title="Algorithms" puzzle sub={`${learned} of ${total} learned`}>
        <Button action="search" className="control search-trigger" title="Search cases (Ctrl+K)">
          <Icon name="IconSearch" size={14} />
          <span className="control-label">Search cases</span>
          <kbd>Ctrl K</kbd>
        </Button>
        <Button action="methods" icon="IconBook" className="control collapsible" title="Solving methods">
          <span className="control-label">Methods</span>
        </Button>
      </PageHead>
      <div className="master-detail">
        <CaseList />
        {!mobile && (
          <div className="panel md-detail">{s.caseId && s.find(s.caseId) ? <CaseDetail key={s.caseId} /> : <SetSummary />}</div>
        )}
      </div>
    </div>
  );
}

function currentSection() {
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, s.learningFilter),
    stages: string[] = sections.map((section) => section.stage),
    stage = stages.includes(s.catalogStage) ? s.catalogStage : stages[0];
  return {
    stages,
    stage,
    section: sections.find((section) => section.stage === stage),
    /** The stage's set with every case, whatever the learned filter. */
    all: catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all").find((x) => x.stage === stage),
  };
}

function CaseList() {
  const diagram = useViewport().w <= MOBILE ? 48 : 52;
  const scroll = useScrollPosition(`catalog:${s.puzzle}:${s.catalogStage}`);
  const { stages, stage, section, all } = currentSection();
  const setLearned = all ? all.learnedCount : 0,
    setTotal = all ? all.all.length : 0;
  return (
    <div className="panel md-list">
      <div className="md-list-head">
        <div className="tabs" role="tablist" aria-label="Stage">
          {stages.map((st) => (
            <Button key={st} action={"stage:" + st} className={"tab " + (st === stage ? "selected" : "")}>
              {st}
            </Button>
          ))}
        </div>
        {section && section.variants.length > 1 && (
          <div className="segmented" role="group" aria-label="Set">
            {section.variants.map((v: any) => (
              <Button key={v.id} action={"set:" + v.id} active={v.id === section.active.id}>
                {v.label.startsWith(stage + " ") ? v.label.slice(stage.length + 1) : v.label}
                <span className="mono muted">{v.count}</span>
              </Button>
            ))}
          </div>
        )}
        <div className="md-filter">
          <div className="segmented" role="group" aria-label="Filter">
            {[
              ["all", "All", setTotal],
              ["learned", "Learned", setLearned],
              ["not-learned", "To learn", setTotal - setLearned],
            ].map(([id, label, count]) => (
              <Button key={id as string} action={"learningFilter:" + id} active={s.learningFilter === id}>
                {label}
                <span className="mono muted">{count}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div ref={scroll} className="scroll md-list-scroll">
        {section && !section.groups.length && (
          <Empty>
            {s.learningFilter === "learned" ? "No learned cases in this set yet." : "Every case of this set is learned."}
          </Empty>
        )}
        {section?.groups.map(([group, members]: [string, any[]]) => {
          const key = section.active.id + ":" + group,
            closed = s.collapsed.has(key);
          return (
            <section key={group} className="list-group">
              <div className="list-group-head">
                <Button action={"collapse:" + key} className="list-group-title">
                  <Icon name={closed ? "IconChevronRight" : "IconChevronDown"} size={12} />
                  <span>{group}</span>
                  <span className="mono muted">{members.length}</span>
                </Button>
                <Button action={"train:" + key} icon="IconTimer" className="list-group-train" title={`Train ${group}`}>
                  Train
                </Button>
              </div>
              {!closed && members.map((c: any) => <CaseRow key={c.id} c={c} size={diagram} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CaseRow({ c, size }: { c: any; size: number }) {
  const st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id);
  return (
    <div className={"case-row" + (s.caseId === c.id ? " selected" : "")}>
      <Button action={"case:" + c.id} className="case-row-open" title={c.id}>
        <span className="case-row-diagram">
          <Diagram c={c} size={size} />
        </span>
        <span className="case-row-name">
          <strong>{shortId(c)}</strong>
          {c.name !== c.id && <span>{c.name}</span>}
        </span>
        <span className="mono case-row-time">{st ? fmtTime(st.best) : "—"}</span>
      </Button>
      <Button
        action={"learn:" + c.id}
        className={"case-check " + (learned ? "yes" : "")}
        title={learned ? "Learned" : "Mark learned"}
      >
        <Icon name="IconCheck" size={14} />
      </Button>
    </div>
  );
}

/** Right pane before a case is chosen: where the chosen set stands, group by group, each ready to train. */
function SetSummary() {
  const { stage, all } = currentSection();
  if (!all) return <Empty>No cases for this puzzle.</Empty>;
  const trained = all.all.filter((c: any) => s.stats.some((v) => v.caseId === c.id)).length;
  const figures: [string, number][] = [
    ["Cases", all.all.length],
    ["Learned", all.learnedCount],
    ["To learn", all.all.length - all.learnedCount],
    ["Trained", trained],
  ];
  return (
    <div className="set-summary">
      <header className="set-summary-head">
        <span className="label">{stage}</span>
        <h2>{all.active.label}</h2>
        {all.active.description && <p className="muted">{all.active.description}</p>}
      </header>
      <div className="set-summary-figures">
        {figures.map(([label, value]) => (
          <div key={label} className="metric">
            <span className="label">{label}</span>
            <span className="metric-value mono">{value}</span>
          </div>
        ))}
      </div>
      <div className="set-summary-groups-head">
        <span className="label">Groups</span>
        <Button action={"train:" + all.active.id} icon="IconTimer" className="set-summary-train" title={`Train ${all.active.label}`}>
          Train all
        </Button>
      </div>
      <div className="scroll set-summary-groups">
        {all.groups.map(([group, members]: [string, any[]]) => {
          const learned = members.filter((c: any) => s.learned.has(c.id)).length;
          return (
            <div key={group} className="set-summary-group">
              <Button action={"case:" + members[0].id} className="set-summary-group-open" title={`Open ${group}`}>
                <span className="set-summary-group-name">
                  <strong>{group}</strong>
                  <span className="mono muted">
                    {learned} / {members.length}
                  </span>
                </span>
              </Button>
              <Button action={"train:" + all.active.id + ":" + group} icon="IconTimer" className="set-summary-train" title={`Train ${group}`}>
                Train
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SOURCES: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };

/** One case in full: diagram, setup, algorithms and its statistics. */
function CaseDetail() {
  const c = s.find(s.caseId),
    mobile = useViewport().w <= MOBILE;
  const ids = s
      .cases()
      .filter((v: any) => v.set === c.set)
      .map((v: any) => v.id),
    index = ids.indexOf(c.id),
    st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id);
  return (
    <div className="detail">
      <div className="scroll detail-scroll">
        <div className="detail-hero">
          <div className="detail-visual">
            {c.cube ? (
              <Cube setup={c.setup} cubeSize={c.cube_size ?? 3} mask={maskForStage(c.stage)} size={mobile ? 140 : 184} replay={s.replay} />
            ) : (
              <Diagram c={c} size={mobile ? 128 : 168} />
            )}
          </div>
          <div className="detail-meta">
            <div className="detail-heading">
              <span className="label">
                {c.setLabel} · {c.group}
              </span>
              <h2 className="detail-title">{c.id}</h2>
              {c.name !== c.id && <p className="detail-name">{c.name}</p>}
            </div>
            <div className="detail-figures">
              <div className="metric">
                <span className="label">Best</span>
                <span className="metric-value mono">{st ? fmtTime(st.best) : "—"}</span>
              </div>
              <div className="metric">
                <span className="label">Mean</span>
                <span className="metric-value mono">{st ? fmtTime(st.mean) : "—"}</span>
              </div>
              <div className="metric">
                <span className="label">Attempts</span>
                <span className="metric-value mono">{st?.count ?? 0}</span>
              </div>
            </div>
            <div className="row detail-buttons">
              <Button action="train" icon="IconTimer" className="primary">
                Train
              </Button>
              <Button action={"learn:" + c.id} className={"control " + (learned ? "is-learned" : "")} icon={learned ? "IconCheck" : undefined}>
                {learned ? "Learned" : "Mark learned"}
              </Button>
              {c.cube && (
                <Button action="replayCube" className="control" title="Replay the setup on the cube">
                  <Icon name="IconUndo" size={14} />
                  Replay
                </Button>
              )}
            </div>
          </div>
        </div>
        <section className="detail-section detail-setup">
          <h3 className="label">Setup</h3>
          <div className="detail-setup-body">
            <Alg text={c.setup} size={17} />
            {c.notes && <p className="muted">{c.notes}</p>}
          </div>
        </section>
        <section className="detail-section detail-algorithms">
          <h3 className="label">Algorithms</h3>
          <div className="algorithm-list">
            {c.algorithms.map((a: any, i: number) => (
              <div key={i} className="algorithm-row">
                <span className="mono muted algorithm-index">{i + 1}</span>
                <Alg text={a.alg} size={16} />
                <span className="algorithm-meta">
                  {i === 0 && <span className="tag">Primary</span>}
                  {a.stm != null && <span className="muted">{a.stm} STM</span>}
                  <span className="muted">{SOURCES[a.source] ?? a.source}</span>
                  {a.youtube && (
                    <Button action={"url:" + a.youtube} className="control small">
                      Video
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="detail-section detail-stats">
          <h3 className="label">Statistics</h3>
          <div className="detail-stats-body">
            <TimerStats compact data={s.caseHistory} empty="No attempts on this case yet." />
          </div>
        </section>
      </div>
      <div className="detail-foot">
        <Button action="caseStep:previous" icon="IconBack" className="control icon-only" disabled={index === 0} title="Previous case (←)" />
        <span className="mono muted">
          {index + 1} / {ids.length}
        </span>
        <Button
          action="caseStep:next"
          icon="IconChevronRight"
          className="control icon-only"
          disabled={index === ids.length - 1}
          title="Next case (→)"
        />
      </div>
    </div>
  );
}

/** Phones: the case opened as a page of its own. */
function Detail() {
  const c = s.find(s.caseId);
  if (!c) return <Empty>Case unavailable.</Empty>;
  return (
    <div className="page detail-page">
      <PageHead
        lead={<Button action="back" icon="IconBack" className="control icon-only" title="Back (Alt+B)" />}
        title={c.id}
        sub={c.setLabel}
      />
      <CaseDetail />
    </div>
  );
}
