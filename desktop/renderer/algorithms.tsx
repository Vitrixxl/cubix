/** The algorithms page: the case list and the case detail. */
import { catalogSections } from "../../src/client/lib/practiceCatalog";
import { displayAlg, shortId, maskForStage } from "../../src/client/lib/caseState";
import { useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, PlayCircle, Search, Timer, X } from "lucide-react";
import { store as s, matches } from "./store";
import { TouchAction, TouchBar } from "./phone";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { fmtTime } from "../../src/client/lib/format";
import { ActionToggle, Alg, Bar, Button, Choice, Diagram, Empty, Figure, LABEL, NUMERIC, MenuAction, PAGE, PageHead, PlayBadge, LearnedMark, SectionHead, Surface, isPhone, run, usePhone, useViewport } from "./ui";
import { Badge } from "@/components/ui/badge";
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
    mobile = isPhone(w);
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all");
  const learned = sections.reduce((sum, section) => sum + section.learnedCount, 0);
  const total = sections.reduce((sum, section) => sum + section.all.length, 0);
  if (mobile && s.caseId) return <Detail />;
  return (
    <div className={PAGE}>
      <PageHead title="Algorithms" puzzle sub={`${learned} of ${total} learned`} more={mobile && <MenuAction action="methods" icon={BookOpen}>Solving methods</MenuAction>}>
        {!mobile && (
          <>
            <Button action="search" variant="outline" className="w-56 justify-start gap-2 text-muted-foreground max-lg:w-auto">
              <Search />
              <span className="max-lg:hidden">Search cases</span>
              <Kbd className="ml-auto max-lg:hidden">Ctrl K</Kbd>
            </Button>
            <Button action="methods" icon={BookOpen}>
              {w > 1000 && "Methods"}
            </Button>
          </>
        )}
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <CaseList wide={mobile} />
        {!mobile && (
          // The list is the box; the set or the case beside it sits on the page.
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
  // Phones search in place: the list gives way to the matching cases of every set.
  const [query, setQuery] = useState(""),
    found = wide && query.trim() ? s.cases().filter((c: any) => matches(c, query)).slice(0, 80) : null;
  return (
    <div data-tour="algorithms" className={cn("flex min-h-0 shrink-0 flex-col gap-3", wide ? "flex-1" : "w-[min(22rem,36%)] overflow-hidden rounded-xl border bg-card px-3 pt-3")}>
      {wide && (
        <InputGroup className="h-10 shrink-0">
          <InputGroupInput placeholder="Search cases: oll 21, pll t…" aria-label="Search cases" value={query} onChange={(e) => setQuery(e.target.value)} />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear the search" onClick={() => setQuery("")}>
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      )}
      {found ? (
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
          {!found.length && <Empty>No case matches.</Empty>}
          <div className={TILES}>
            {found.map((c: any) => <CaseTile key={c.id} c={c} touch detail={`${c.setLabel} · ${c.group}`} />)}
          </div>
        </div>
      ) : (
      <>
      {stages.length > 1 && (
        <Tabs value={stage} onValueChange={(v: string) => void s.action("stage:" + v)}>
          <TabsList variant="line" className="h-8 gap-4 px-0">
            {stages.map((st) => (
              <TabsTrigger key={st} value={st} data-action={"stage:" + st} className="flex-none px-0 text-sm">
                {st}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
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
      <div ref={scroll} className="-mx-2 -mt-2 min-h-0 flex-1 overflow-y-auto px-2 pt-1">
        {section && !section.groups.length && (
          <Empty>{s.learningFilter === "learned" ? "No learned cases in this set yet." : "Every case of this set is learned."}</Empty>
        )}
        {section?.groups.map(([group, members]: [string, any[]]) => {
          const key = section.active.id + ":" + group,
            closed = s.collapsed.has(key);
          return (
            <section key={group} className="flex flex-col gap-1.5 pb-3">
              {/* The group's name folds it; the button hugs its words, its edges on the tiles' edges. */}
              <div className="group/head flex items-center justify-between gap-1">
                <button
                  type="button"
                  data-action={"collapse:" + key}
                  onClick={run("collapse:" + key)}
                  className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {closed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  <span className="truncate">{group}</span>
                  <span className={cn(NUMERIC, "text-xs font-normal text-muted-foreground")}>{members.length}</span>
                </button>
                <Button action={"train:" + key} icon={Timer} size="xs" className={cn("text-muted-foreground", !wide && "opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100")}>
                  Train
                </Button>
              </div>
              {!closed && (
                <div className={TILES}>
                  {members.map((c: any) => <CaseTile key={c.id} c={c} touch={wide} />)}
                </div>
              )}
            </section>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

/** The cases of a group as a grid of square tiles, as many per line as the list's width holds. */
export const TILES = "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5";

/**
 * A case as a square tile: its diagram, then its name and best time on one line, the learned mark in the top right
 * corner. A click opens the case (`action`): on the algorithms page by default, in a dialog elsewhere.
 */
export function CaseTile({ c, touch = false, detail, action = "case:" + c.id, selected = s.caseId === c.id }: { c: any; touch?: boolean; detail?: string; action?: string; selected?: boolean }) {
  const st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id);
  return (
    <div
      className={cn(
        // Hover only where there is a pointer: on touch screens it would stick to the last tile tapped.
        "group/row relative aspect-square min-w-0 rounded-lg bg-muted/45 transition-colors [@media(hover:hover)]:hover:bg-muted/80",
        selected && !touch && "bg-muted ring-1 ring-primary/70 [@media(hover:hover)]:hover:bg-muted",
        touch && "active:bg-muted/80",
      )}
      title={detail ?? (c.name !== c.id ? c.name : undefined)}
    >
      <button
        type="button"
        data-action={action}
        onClick={run(action)}
        className="case-row-open flex size-full flex-col rounded-lg px-2 pt-2 pb-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex min-h-0 flex-1 items-center justify-center">
          <Diagram c={c} size={70} />
        </span>
        {/* One line under the diagram: the name on the left, the best time on the right. */}
        <span className="flex items-baseline justify-between gap-1.5">
          <span className="min-w-0 truncate text-xs font-medium">{shortId(c)}</span>
          <span className={cn(NUMERIC, "shrink-0 text-[11px]", st ? "text-muted-foreground" : "text-muted-foreground/60")}>{st ? fmtTime(st.best) : "–"}</span>
        </span>
      </button>
      <span className="absolute top-0.5 right-0.5">
        <LearnedMark id={c.id} learned={learned} />
      </span>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-6 px-1 pt-1 pb-5">
        <div className="flex max-w-xl flex-col gap-1.5">
          <span className={LABEL}>{stage}</span>
          <h2 className="text-2xl font-semibold tracking-tight">{all.active.label}</h2>
          {all.active.description && <p className="text-sm text-muted-foreground">{all.active.description}</p>}
        </div>
        <Button action={"train:" + all.active.id} icon={Timer} variant="default">
          Train all
        </Button>
      </header>
      <div className="grid shrink-0 grid-cols-4 gap-6 rounded-xl bg-muted/45 px-5 py-4">
        {figures.map(([label, value]) => (
          <Figure key={label} label={label} value={value} size="2xl" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-1 pt-5">
        <SectionHead title="Groups" meta={all.groups.length} />
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {all.groups.map(([group, members]: [string, any[]]) => {
            const learned = members.filter((c: any) => s.learned.has(c.id)).length;
            return (
              <div key={group} className="group/row flex items-center gap-4 rounded-lg px-2 hover:bg-muted/50">
                <button
                  type="button"
                  data-action={"case:" + members[0].id}
                  onClick={run("case:" + members[0].id)}
                  className="flex h-10 min-w-0 flex-1 items-center gap-4 text-left outline-none"
                >
                  <span className="w-40 truncate text-sm font-medium">{group}</span>
                  <Bar ratio={learned / members.length} className="max-w-48 flex-1" />
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
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

/** Previous and next case of the set, with where this one stands. */
function CaseStepper({ index, count, touch = false }: { index: number; count: number; touch?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button action="caseStep:previous" icon={ChevronLeft} size="icon-sm" disabled={index === 0} tip="Previous case (←)" className={touch ? "size-10" : undefined} />
      <span className={cn(NUMERIC, "text-center text-xs text-muted-foreground", touch ? "min-w-10" : "min-w-12")}>
        {index + 1} / {count}
      </span>
      <Button action="caseStep:next" icon={ChevronRight} size="icon-sm" disabled={index === count - 1} tip="Next case (→)" className={touch ? "size-10" : undefined} />
    </div>
  );
}

const caseSteps = (c: any) => {
  const ids = s
    .cases()
    .filter((v: any) => v.set === c.set)
    .map((v: any) => v.id);
  return { index: ids.indexOf(c.id), count: ids.length };
};

/**
 * One case in full, as the page's surface: the diagram, the name, its figures and actions on top, then setup,
 * algorithms and statistics, each under its label. In a dialog (`dialog`) it keeps its title and actions on phones too.
 */
export function CaseDetail({ id = s.caseId, dialog = false }: { id?: string; dialog?: boolean }) {
  const c = s.find(id),
    phone = usePhone(),
    mobile = phone && !dialog;
  const { index, count } = caseSteps(c),
    st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id);
  const openPlayer = () => s.openAlg([{
    key: c.id, name: c.id, detail: c.name !== c.id ? c.name : undefined,
    context: `${c.setLabel} · ${c.group}`, algs: c.algorithms.map(displayAlg),
    note: c.notes, size: c.cube_size ?? 3, mask: maskForStage(c.stage),
  }], 0);
  const block = "flex flex-col gap-2 px-4 py-4 md:px-1 md:py-5";
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="flex items-center gap-6 px-4 pt-4 pb-4 md:items-start md:gap-8 md:px-1 md:pt-1 md:pb-5">
        <div className="shrink-0 self-center">
          {c.cube ? <button type="button" data-play={c.id} aria-label={`Play ${c.id} in 3D`} onClick={openPlayer}
            className="group/play relative rounded-md outline-none hover:ring-2 focus-visible:ring-2 ring-ring/50">
            <Diagram c={c} size={phone ? 104 : 152} />
            <PlayBadge />
          </button> : <Diagram c={c} size={phone ? 104 : 152} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-5">
          {!mobile && (
            // In a dialog, clear of its close button.
            <div className={cn("flex items-center gap-4", dialog && "pr-8")}>
              <div className="flex min-w-0 flex-1 items-baseline gap-3">
                <h2 className="min-w-0 shrink-0 truncate text-2xl font-semibold tracking-tight">{c.id}</h2>
                <p className="min-w-0 truncate text-sm text-muted-foreground">{c.name !== c.id ? c.name : `${c.setLabel} · ${c.group}`}</p>
              </div>
              <CaseStepper index={index} count={count} />
            </div>
          )}
          <div className="flex gap-6 md:gap-10">
            <Figure label="Best" value={st ? fmtTime(st.best) : "–"} tone="good" />
            <Figure label="Mean" value={st ? fmtTime(st.mean) : "–"} />
            <Figure label="Attempts" value={st?.count ?? 0} />
          </div>
          {/* Phones have these at the bottom, under the thumb (Detail). */}
          <div className={cn("flex flex-wrap items-center gap-1.5", mobile && "hidden")}>
            <Button action="train" icon={Timer} variant="default">
              Train
            </Button>
            <ActionToggle action={"learn:" + c.id} pressed={learned} icon={Check} className="aria-pressed:bg-success/15 aria-pressed:text-success">
              {learned ? "Learned" : "Mark learned"}
            </ActionToggle>
          </div>
        </div>
      </div>
      <section className={block}>
        <h3 className={LABEL}>Setup</h3>
        <Alg text={c.setup} size={17} />
        {c.notes && <p className="text-sm text-muted-foreground">{c.notes}</p>}
      </section>
      <section className={cn(block, "gap-1")}>
        <h3 className={cn(LABEL, "pb-1")}>Algorithms</h3>
        {c.algorithms.map((a: any, i: number) => (
          <div key={i} className="-mx-1 flex min-w-0 items-center gap-4 rounded-lg px-1 py-2 hover:bg-muted/40 max-md:flex-wrap max-md:gap-y-1">
            <span className={cn(NUMERIC, "w-4 shrink-0 text-xs text-muted-foreground")}>{i + 1}</span>
            <Alg text={displayAlg(a)} size={16} className="min-w-0 flex-1" />
            <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground max-md:w-full max-md:pl-8">
              {i === 0 && <Badge variant="secondary" className="rounded-md text-primary">Primary</Badge>}
              {a.stm != null && <span className={NUMERIC}>{a.stm} STM</span>}
              <span>{SOURCES[a.source] ?? a.source}</span>
              {a.youtube && <Button action={"url:" + a.youtube} icon={PlayCircle} size="icon-xs" tip="Watch the video" />}
            </span>
          </div>
        ))}
      </section>
      <section className={cn(block, !!s.caseHistory?.summary?.count && "min-h-[26rem]")}>
        <h3 className={LABEL}>Statistics</h3>
        <TimerStats compact data={s.caseHistory} empty="No attempts on this case yet." />
      </section>
    </div>
  );
}

/**
 * Phones: the case pushed as a page of its own, back to the list in the header. A swipe sideways steps through the
 * set; Train and Learned stay at the bottom, under the thumb.
 */
function Detail() {
  const c = s.find(s.caseId),
    swipe = useRef<{ x: number; y: number } | null>(null);
  if (!c) return <Empty>Case unavailable.</Empty>;
  const { index, count } = caseSteps(c),
    learned = s.learned.has(c.id);
  return (
    <div className={PAGE}>
      <PageHead lead={<Button action="back" icon={ChevronLeft} tip="Back · Alt+B" className="size-8 max-md:size-10" />} title={c.id} sub={`${c.setLabel} · ${c.group}`}>
        <CaseStepper index={index} count={count} touch />
      </PageHead>
      <Surface
        className="flex-1"
        onTouchStart={(e) => (swipe.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
        onTouchEnd={(e) => {
          const start = swipe.current,
            end = e.changedTouches[0]!;
          swipe.current = null;
          if (!start) return;
          const dx = end.clientX - start.x,
            dy = end.clientY - start.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) void s.action("caseStep:" + (dx < 0 ? "next" : "previous"));
        }}
      >
        <CaseDetail />
        <TouchBar className="shrink-0 border-t bg-muted/30 px-2 py-2">
          <TouchAction action="train" icon={Timer} label="Train" primary />
          <TouchAction action={"learn:" + c.id} icon={Check} label={learned ? "Learned" : "Mark learned"} pressed={learned} tone="good" />
        </TouchBar>
      </Surface>
    </div>
  );
}
