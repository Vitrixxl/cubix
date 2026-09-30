/** The algorithms page: the case list and the case detail. */
import { catalogSections } from "../../src/client/lib/practiceCatalog";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import { useLayoutEffect, useRef } from "react";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, PlayCircle, RotateCcw, Search, Timer } from "lucide-react";
import { store as s } from "./store";
import { Cube } from "./Cube";
import { fmtTime } from "../../src/client/lib/format";
import { ActionToggle, Alg, Button, Choice, Diagram, Empty, Figure, LABEL, MOBILE, MONO, PAGE, PageHead, useViewport } from "./ui";
import { TimerStats } from "./stats";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const { w } = useViewport(),
    mobile = w <= MOBILE;
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all");
  const learned = sections.reduce((sum, section) => sum + section.learnedCount, 0);
  const total = sections.reduce((sum, section) => sum + section.all.length, 0);
  if (mobile && s.caseId) return <Detail />;
  return (
    <div className={PAGE}>
      <PageHead title="Algorithms" puzzle sub={`${learned} of ${total} learned`}>
        <Button action="search" variant="outline" className="w-56 justify-start gap-2 text-muted-foreground max-lg:w-auto">
          <Search />
          <span className="max-lg:hidden">Search cases</span>
          <Kbd className="ml-auto max-lg:hidden">Ctrl K</Kbd>
        </Button>
        <Button action="methods" icon={BookOpen}>
          {w > 1000 && "Methods"}
        </Button>
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-12">
        <CaseList wide={mobile} />
        {!mobile && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {s.caseId && s.find(s.caseId) ? <CaseDetail key={s.caseId} /> : <SetSummary />}
          </div>
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

function CaseList({ wide }: { wide: boolean }) {
  const scroll = useScrollPosition(`catalog:${s.puzzle}:${s.catalogStage}`);
  const { stages, stage, section, all } = currentSection();
  const setLearned = all ? all.learnedCount : 0,
    setTotal = all ? all.all.length : 0;
  return (
    <div className={cn("flex min-h-0 shrink-0 flex-col gap-3", wide ? "flex-1" : "w-[min(24rem,38%)]")}>
      {stages.length > 1 && (
        <Tabs value={stage} onValueChange={(v: string) => void s.action("stage:" + v)}>
          <TabsList variant="line" className="h-9 gap-4 px-0">
            {stages.map((st) => (
              <TabsTrigger key={st} value={st} data-action={"stage:" + st} className="flex-none px-0 text-sm">
                {st}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {section && section.variants.length > 1 && (
          <Choice
            prefix="set:"
            label="Set"
            value={section.active.id}
            options={section.variants.map((v: any) => ({
              id: v.id,
              label: v.label.startsWith(stage + " ") ? v.label.slice(stage.length + 1) : v.label,
              count: v.count,
            }))}
          />
        )}
        <Choice
          prefix="learningFilter:"
          label="Filter"
          value={s.learningFilter}
          options={[
            { id: "all", label: "All", count: setTotal },
            { id: "learned", label: "Learned", count: setLearned },
            { id: "not-learned", label: "To learn", count: setTotal - setLearned },
          ]}
        />
      </div>
      <div ref={scroll} className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {section && !section.groups.length && (
          <Empty>{s.learningFilter === "learned" ? "No learned cases in this set yet." : "Every case of this set is learned."}</Empty>
        )}
        {section?.groups.map(([group, members]: [string, any[]]) => {
          const key = section.active.id + ":" + group,
            closed = s.collapsed.has(key);
          return (
            <section key={group} className="flex flex-col pb-2">
              <div className="group/head -mx-2 flex items-center gap-1 rounded-lg pr-1 hover:bg-muted/40">
                <button
                  type="button"
                  data-action={"collapse:" + key}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void s.action("collapse:" + key);
                  }}
                  className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm font-medium outline-none"
                >
                  {closed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  <span className="truncate">{group}</span>
                  <span className={cn(MONO, "text-xs font-normal text-muted-foreground")}>{members.length}</span>
                </button>
                <Button action={"train:" + key} icon={Timer} size="xs" className="text-muted-foreground opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100">
                  Train
                </Button>
              </div>
              {!closed && members.map((c: any) => <CaseRow key={c.id} c={c} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CaseRow({ c }: { c: any }) {
  const st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id),
    selected = s.caseId === c.id;
  return (
    <div className={cn("group/row -mx-2 flex items-center gap-1 rounded-lg pr-2 transition-colors hover:bg-muted/50", selected && "bg-muted hover:bg-muted")}>
      <button
        type="button"
        data-action={"case:" + c.id}
        onClick={(e) => {
          e.currentTarget.blur();
          void s.action("case:" + c.id);
        }}
        className="case-row-open flex min-w-0 flex-1 items-center gap-3 py-1.5 pl-2 text-left outline-none"
      >
        <Diagram c={c} size={48} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{shortId(c)}</span>
          {c.name !== c.id && <span className="truncate text-xs text-muted-foreground">{c.name}</span>}
        </span>
        <span className={cn(MONO, "text-sm", st ? "text-foreground/80" : "text-muted-foreground/50")}>{st ? fmtTime(st.best) : "–"}</span>
      </button>
      <ActionToggle
        action={"learn:" + c.id}
        pressed={learned}
        icon={Check}
        tip={learned ? "Learned" : "Mark learned"}
        size="sm"
        className="text-muted-foreground/50 aria-pressed:bg-success/15 aria-pressed:text-success"
      />
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
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex max-w-xl flex-col gap-1.5">
          <span className={LABEL}>{stage}</span>
          <h2 className="text-2xl font-semibold tracking-tight">{all.active.label}</h2>
          {all.active.description && <p className="text-sm text-muted-foreground">{all.active.description}</p>}
        </div>
        <Button action={"train:" + all.active.id} icon={Timer} variant="default">
          Train all
        </Button>
      </header>
      <div className="flex gap-12">
        {figures.map(([label, value]) => (
          <Figure key={label} label={label} value={value} size="lg" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <span className={LABEL}>Groups</span>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {all.groups.map(([group, members]: [string, any[]]) => {
            const learned = members.filter((c: any) => s.learned.has(c.id)).length;
            return (
              <div key={group} className="group/row flex items-center gap-4 rounded-lg px-2 hover:bg-muted/50">
                <button
                  type="button"
                  data-action={"case:" + members[0].id}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void s.action("case:" + members[0].id);
                  }}
                  className="flex h-10 min-w-0 flex-1 items-center gap-4 text-left outline-none"
                >
                  <span className="w-40 truncate text-sm font-medium">{group}</span>
                  <span className="h-1 max-w-48 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: (learned / members.length) * 100 + "%" }} />
                  </span>
                  <span className={cn(MONO, "text-xs text-muted-foreground")}>
                    {learned} / {members.length}
                  </span>
                </button>
                <Button action={"train:" + all.active.id + ":" + group} icon={Timer} size="xs" className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100">
                  Train
                </Button>
              </div>
            );
          })}
        </div>
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pr-2">
        <div className="flex items-center gap-8 max-md:flex-col max-md:items-start">
          <div className="shrink-0">
            {c.cube ? (
              <Cube setup={c.setup} cubeSize={c.cube_size ?? 3} mask={maskForStage(c.stage)} size={mobile ? 140 : 176} replay={s.replay} />
            ) : (
              <Diagram c={c} size={mobile ? 128 : 160} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className={LABEL}>
                {c.setLabel} · {c.group}
              </span>
              <h2 className="text-3xl font-semibold tracking-tight">{c.id}</h2>
              {c.name !== c.id && <p className="text-sm text-muted-foreground">{c.name}</p>}
            </div>
            <div className="flex gap-10">
              <Figure label="Best" value={st ? fmtTime(st.best) : "–"} tone="good" />
              <Figure label="Mean" value={st ? fmtTime(st.mean) : "–"} />
              <Figure label="Attempts" value={st?.count ?? 0} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button action="train" icon={Timer} variant="default">
                Train
              </Button>
              <ActionToggle action={"learn:" + c.id} pressed={learned} icon={Check} className="aria-pressed:bg-success/15 aria-pressed:text-success">
                {learned ? "Learned" : "Mark learned"}
              </ActionToggle>
              {c.cube && (
                <Button action="replayCube" icon={RotateCcw} tip="Replay the setup on the cube">
                  Replay
                </Button>
              )}
            </div>
          </div>
        </div>
        <section className="flex flex-col gap-2">
          <h3 className={LABEL}>Setup</h3>
          <Alg text={c.setup} size={17} />
          {c.notes && <p className="text-sm text-muted-foreground">{c.notes}</p>}
        </section>
        <section className="flex flex-col gap-1">
          <h3 className={cn(LABEL, "pb-1")}>Algorithms</h3>
          {c.algorithms.map((a: any, i: number) => (
            <div key={i} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-2 hover:bg-muted/40">
              <span className={cn(MONO, "w-4 shrink-0 text-xs text-muted-foreground")}>{i + 1}</span>
              <Alg text={a.alg} size={16} className="flex-1" />
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {i === 0 && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-medium text-primary">Primary</span>}
                {a.stm != null && <span className={MONO}>{a.stm} STM</span>}
                <span>{SOURCES[a.source] ?? a.source}</span>
                {a.youtube && <Button action={"url:" + a.youtube} icon={PlayCircle} size="icon-xs" tip="Watch the video" />}
              </span>
            </div>
          ))}
        </section>
        <section className={cn("flex flex-col gap-2", !!s.caseHistory?.summary?.count && "min-h-[26rem]")}>
          <h3 className={LABEL}>Statistics</h3>
          <TimerStats compact data={s.caseHistory} empty="No attempts on this case yet." />
        </section>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3">
        <Button action="caseStep:previous" icon={ChevronLeft} size="icon-sm" disabled={index === 0} tip="Previous case (←)" />
        <span className={cn(MONO, "text-xs text-muted-foreground")}>
          {index + 1} / {ids.length}
        </span>
        <Button action="caseStep:next" icon={ChevronRight} size="icon-sm" disabled={index === ids.length - 1} tip="Next case (→)" />
      </div>
    </div>
  );
}

/** Phones: the case opened as a page of its own. */
function Detail() {
  const c = s.find(s.caseId);
  if (!c) return <Empty>Case unavailable.</Empty>;
  return (
    <div className={PAGE}>
      <PageHead lead={<Button action="back" icon={ChevronLeft} tip="Back · Alt+B" className="-ml-2" />} title={c.id} sub={c.setLabel} />
      <CaseDetail />
    </div>
  );
}
