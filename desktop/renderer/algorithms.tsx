/** The algorithms page: every set of the puzzle beside the chosen one's cases; a case in its dialog, opened from anywhere. */
import { caseContext, catalogSections } from "../../src/client/lib/practiceCatalog";
import { caseDetail, casePlayItem, displayAlg, leftHandAlgs, moveCount, shortId } from "../../src/client/lib/caseState";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "./AlgPlayer";
import { call } from "./bridge";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Filter, FlipHorizontal2, Grid3x3, LayoutGrid, PlayCircle, Printer, Route, Search, SquareCheck, Timer, Video, X } from "lucide-react";
import { methodSets, store as s } from "./store";
import { METHODS, type SolvingMethod } from "../../src/shared/methods";
import { stepSets } from "../../src/client/lib/course";
import { fmtTime } from "../../src/client/lib/format";
import { ActionToggle, Alg, Bar, Button, Choice, Diagram, Empty, FOCUS, LABEL, LearnToggle, NUMERIC, MenuAction, Modal, PAGE, PageHead, PlayBadge, LearnedMark, ProgressRing, ROW, Segmented, SelectMenu, Surface, Tip, isPhone, run, usePhone, useQuiet, useViewport, type Props } from "./ui";
import { Button as UiButton } from "@/components/ui/button";
import { TimerStats } from "./stats";
import { useWidth } from "./FiguresEditor";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { VirtualList, inRows } from "./virtual";
import type { Virtualizer } from "@tanstack/react-virtual";
import { tr } from "../../src/client/i18n";
import { ActionCard, said } from "./base";
import { Link } from "react-router";
import { PrintDialog } from "./printSheet";
import { pageUrl } from "./navigation";
import { AssistedSolve } from "./AssistedSolve";
import { assisted as solvable } from "../../src/client/lib/methodSolver";
import type { PuzzleId } from "../../src/shared/puzzles";

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

/** Algorithms: the catalogue, with the dialog of the case its address names over it. */
export function Algorithms() {
  const { w } = useViewport();
  // A case's address opens the catalogue with the case's dialog over it (CaseDialog, mounted once in app.tsx).
  return (
    <>
      <Catalog mobile={isPhone(w)} />
      {typeof document === "undefined" && s.caseId && s.find(s.caseId) && <PrerenderedCase />}
    </>
  );
}

/** The chosen set (its step's preferred one) with every case, and its cases the filter keeps, by group. */
function currentSet() {
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, s.learningFilter),
    stage = sections.some((section) => section.stage === s.catalogStage) ? s.catalogStage : sections[0]?.stage;
  return { sections, section: sections.find((section) => section.stage === stage) };
}

/** The puzzle's methods that teach sets of the catalogue, and the one the page shows (its first one until one is chosen;
 * none for a puzzle without any: every set by its stage). */
function catalogMethods() {
  const puzzle = s.puzzle as PuzzleId,
    methods = (METHODS[puzzle] ?? []).filter((m) => methodSets(puzzle, m.id).length);
  return { methods, chosen: methods.find((m) => m.id === s.algsMethod) ?? methods[0] };
}

/** The tree's sections for a method: each of its steps with the sets it teaches, under the step's name. */
const methodSections = (method: SolvingMethod) =>
  method.steps.flatMap((step) => {
    const variants = stepSets(step, s.allSets(), s.puzzle as PuzzleId);
    return variants.length ? [{ stage: step.title, variants }] : [];
  });

/** The algorithm a case is shown with: the one it was learned with, else its first (the phone's list, the case dialog). */
const mainAlg = (c: any) => s.learnedAlgs[c.id]?.[0] ?? (c.algorithms?.[0] ? displayAlg(c.algorithms[0]) : "");
const learnedOf = (cases: any[]) => cases.filter((c: any) => s.learned.has(c.id)).length;
const groupId = (set: string, group: string) => `group-${set}-${group}`.replace(/\W+/g, "-");

/**
 * The catalogue: every set of the puzzle by step on the left, each with how far it is learned; the chosen set on the
 * right, its groups as shelves of cases. A selection picks any cases to train or mark learned at once.
 */
function Catalog({ mobile }: { mobile: boolean }) {
  const [printing, setPrinting] = useState(false);
  const { sections, section } = currentSet();
  const learned = sections.reduce((sum, v) => sum + v.variants.reduce((n: number, set: any) => n + s.learnedIn(set.id), 0), 0);
  const total = s.cases().length;
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [small, setSmall] = useState(() => s.prefs["cubix.algs.tileSize"] === "small");
  useEffect(() => {
    if (!picked) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPicked(null);
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [!picked]);
  if (!section) return <div className={PAGE}><Empty>{tr("No cases for this puzzle.")}</Empty></div>;
  const set = section.active,
    count = section.all.length,
    // A right click picks a case too, starting the selection when none is under way.
    toggle = (id: string) => setPicked((p) => new Set(p?.has(id) ? [...p].filter((v) => v !== id) : [...(p ?? []), id])),
    pick = picked && toggle,
    grid = <Shelves set={set} section={section} wide={!mobile} small={small} picked={picked} pick={pick} select={toggle} />;
  if (mobile)
    return (
      <div className={PAGE}>
        <PageHead title={tr("Algorithms")} puzzle more={<MenuAction action="methods" icon={BookOpen}>{tr("Solving methods")}</MenuAction>}>
          <Button action="search" icon={Search} tip={tr("Search cases")} />
        </PageHead>
        <div className="flex shrink-0 flex-col items-start gap-2">
          <SelectMenu
            action="set"
            caption="Set"
            variant="secondary"
            align="start"
            value={set.id}
            options={sections.flatMap((v) => v.variants.map((x: any) => ({ id: x.id, label: `${said(x.label)} · ${s.learnedIn(x.id)} / ${x.count}` })))}
          />
          <FilterChoice section={section} />
        </div>
        {grid}
      </div>
    );
  const byMethod = catalogMethods();
  return (
    <div className={PAGE}>
      {/* The sets by method first: the chosen method's steps and their sets on the left. */}
      {byMethod.methods.length > 0 && (
        <Choice
          prefix="algsMethod:"
          label={tr("Method")}
          value={byMethod.chosen!.id}
          className="shrink-0 self-start"
          options={byMethod.methods.map((m) => ({ id: m.id, label: said(m.name) }))}
        />
      )}
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <div className="flex w-[min(19rem,32%)] shrink-0 flex-col gap-3">
          {/* The chosen method explained, and learned on the player's own cube (AssistedSolve). */}
          <div className="flex shrink-0 flex-col gap-2">
            <Button action={"methods:" + (byMethod.chosen?.id ?? "")} icon={BookOpen} variant="secondary" className="justify-start">
              {byMethod.chosen ? tr("Explain the method") : tr("Solving methods")}</Button>
            {byMethod.chosen && solvable(s.puzzle as PuzzleId, byMethod.chosen.id) && (
              <ActionCard icon={Route} title={tr("Learn with my cube")} text={tr("Connected or painted")} onClick={run("assisted")} action="assisted" className="py-2.5" />
            )}
          </div>
          <Surface data-tour="algorithms" className="min-h-0 flex-1 gap-3 p-3 pt-4">
            <Button action="search" variant="secondary" className="shrink-0 justify-start text-muted-foreground">
              <Search />
              <span className="truncate">{tr("Find")}</span>
              <Kbd className="ml-auto max-lg:hidden">{tr("Ctrl K")}</Kbd>
            </Button>
            <div className="flex shrink-0 items-baseline justify-between px-2.5">
              <span className="text-[15px] font-bold">{s.event().label}</span>
              <span className={cn(NUMERIC, "text-[13px] text-muted-foreground")}>{tr("{0} of {1} learned", { 0: learned, 1: total.toLocaleString() })}</span>
            </div>
            <SetTree sections={byMethod.chosen ? methodSections(byMethod.chosen) : sections} active={set.id} />
          </Surface>
        </div>
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <SetHead set={set} section={section} />
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <FilterChoice section={section} />
            <Segmented
              label="Tile size"
              value={small ? "small" : "large"}
              onChange={(v) => {
                setSmall(v === "small");
                s.pref("cubix.algs.tileSize", v);
              }}
              options={[
                { id: "large", label: <><LayoutGrid /><span className="sr-only">{tr("Large tiles")}</span></>, tip: "Large tiles" },
                { id: "small", label: <><Grid3x3 /><span className="sr-only">{tr("Compact tiles")}</span></>, tip: "Compact tiles" },
              ]}
            />
            <UiButton variant="ghost" aria-pressed={!!picked} data-action="pick" onClick={() => setPicked(picked ? null : new Set())} className="text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground">
              <SquareCheck />
              {tr("Select")}</UiButton>
            {!mobile && (
              <UiButton variant="ghost" onClick={() => setPrinting(true)} className="text-muted-foreground">
                <Printer />
                {tr("Print")}</UiButton>
            )}
            {printing && <PrintDialog set={set} onClose={() => setPrinting(false)} />}
            <Button action={"train:" + set.id} icon={Timer} variant="default" className="ml-auto">
              {tr("Train all")} · {count}</Button>
          </div>
          {grid}
          {picked && <PickBar picked={picked} clear={() => setPicked(null)} />}
        </section>
        {byMethod.chosen && <AssistedSolve method={byMethod.chosen.id} />}
      </div>
    </div>
  );
}

/** Every set of the puzzle under its step, each with its ring of cases learned; the chosen one lists its groups, folded
 * and unfolded by a click on it again. */
function SetTree({ sections, active }: { sections: { stage: string; variants: any[] }[]; active: string }) {
  const list = useRef<HTMLDivElement>(null);
  // The set whose groups are folded; another set chosen opens unfolded.
  const [folded, setFolded] = useState("");
  useEffect(() => {
    list.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <nav ref={list} aria-label={tr("Sets")} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      {sections.map((section) => (
        <div key={section.stage} className="flex flex-col gap-0.5 pb-2">
          <p className={cn(LABEL, "px-2.5 pt-2 pb-1 font-semibold tracking-wider uppercase")}>{said(section.stage)}</p>
          {section.variants.map((set: any) => {
            const cases = s.setCases(set.id),
              learned = s.learnedIn(set.id),
              on = set.id === active,
              groups = on ? [...new Set(cases.map((c: any) => c.group))] : [],
              foldable = groups.length > 1,
              open = foldable && folded !== set.id;
            return (
              <div key={set.id} className="flex flex-col gap-0.5">
                <button type="button" data-action={"set:" + set.id} aria-current={on ? "page" : undefined} aria-expanded={foldable ? open : undefined}
                  onClick={foldable ? () => setFolded(open ? set.id : "") : run("set:" + set.id)} className={cn(ROW, "flex h-10 w-full items-center gap-2.5 px-2.5")}>
                  <ProgressRing done={learned === cases.length && cases.length > 0} share={cases.length ? learned / cases.length : 0} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{said(set.label)}</span>
                  <span className={cn(NUMERIC, "text-xs font-semibold", learned === cases.length ? "text-success" : "text-muted-foreground")}>
                    {learned} / {cases.length}
                  </span>
                  {foldable && <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />}
                </button>
                {open && (
                  <div className="ml-[19px] flex flex-col gap-0.5 border-l border-border py-0.5 pl-2">
                    {groups.map((group) => {
                      const of = cases.filter((c: any) => c.group === group), done = learnedOf(of);
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => jumpTo?.(groupId(set.id, group))}
                          className={cn(ROW, "flex h-8 w-full items-center justify-between gap-2 px-2.5 text-sm text-muted-foreground hover:text-foreground")}
                        >
                          <span className="truncate">{tr(group)}</span>
                          <span className={cn(NUMERIC, "text-xs", done === of.length && "text-success")}>{done} / {of.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** The chosen set's name; how far it is learned on the right. */
function SetHead({ set, section }: { set: any; section: any }) {
  const all: any[] = section.all,
    learned = section.learnedCount,
    trained = all.filter((c) => !s.learned.has(c.id) && s.stat(c.id)).length,
    legend: [number, string, string][] = [
      [learned, tr("learned"), "bg-success"],
      [trained, tr("in progress"), "bg-primary/45"],
      [all.length - learned - trained, tr("never trained"), "bg-muted"],
    ];
  return (
    <header className="flex shrink-0 items-end gap-6">
      <h1 className="min-w-0 flex-1 truncate text-[30px] leading-tight font-extrabold tracking-[-0.04em]">{said(set.label)}</h1>
      <div className="flex w-[min(26rem,42%)] shrink-0 flex-col gap-2.5 pb-1 max-lg:hidden">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-muted-foreground">
          {legend.map(([n, label, dot]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-[2px]", dot)} />
              <b className={cn(NUMERIC, "text-foreground")}>{n}</b>
              {label}
            </span>
          ))}
        </div>
        <Bar ratio={all.length ? learned / all.length : 0} behind={all.length ? (learned + trained) / all.length : 0} fill="bg-success" className="h-2" label={tr("{0} of {1} learned", { 0: learned, 1: all.length })} />
      </div>
    </header>
  );
}

/** Which cases the shelves show, as a menu: all, the learned ones or those to learn, each with its count. */
function FilterChoice({ section }: { section: any }) {
  const total = section.all.length,
    learned = section.learnedCount;
  return (
    <SelectMenu
      action="learningFilter"
      label="Filter"
      icon={<Filter className="text-muted-foreground" />}
      align="start"
      value={s.learningFilter}
      options={[
        { id: "all", label: `${tr("All")} · ${total}` },
        { id: "learned", label: `${tr("Learned")} · ${learned}` },
        { id: "not-learned", label: `${tr("To learn")} · ${total - learned}` },
      ]}
    />
  );
}

/** Brings a group of the shelves into view, drawn or not: set by the shelves showing, used by the set tree. */
let jumpTo: ((id: string) => void) | null = null;

/** The set's groups as shelves: the group's name, how far it is learned and its Train on the left, its cases beside. */
function Shelves({ set, section, wide, small, picked, pick, select }: { set: any; section: any; wide: boolean; small: boolean; picked: Set<string> | null; pick: ((id: string) => void) | null; select: (id: string) => void }) {
  const scroll = useScrollPosition(`catalog:${s.puzzle}:${set.id}`),
    list = useRef<Virtualizer<HTMLElement, Element> | null>(null);
  const members = (group: string) => section.all.filter((c: any) => c.group === group);
  // Large tiles fill the width: as many columns as hold a tile of at least FLUID_MIN, each diagram as wide as its column.
  // The compact ones as many as their auto-fill grid would hold, so the rows drawn one by one line up as one grid.
  const [first, setFirst] = useState<HTMLElement | null>(null),
    width = useWidth(first),
    fluid = !small && width > 0,
    [least, gap] = fluid ? [wide ? FLUID_MIN : FLUID_MIN_PHONE, FLUID_GAP] : small ? [56, 2] : [84, 6],
    columns = Math.max(1, Math.floor((width + gap) / (least + gap))),
    side = Math.min(FLUID_MAX, Math.floor((width - FLUID_GAP * (columns - 1)) / columns) - 12),
    tiles = small ? TILES_SMALL : fluid ? "grid gap-x-1.5 gap-y-2" : TILES,
    // Between two rows of a group, its grid's own gap.
    between = small ? "pt-0.5" : fluid ? "pt-2" : "pt-1",
    // Beside the group's name, enough rows to be as tall as it.
    headRows = wide ? (small ? 3 : 2) : 1;
  // Drawn as they come into view: each group's heading with its first rows, then its other rows one by one.
  const shelves = section.groups.flatMap(([group, shown]: [string, any[]], index: number) => {
    const all = members(group),
      rows = inRows(shown, columns),
      chunks = [rows.slice(0, headRows).flat(), ...rows.slice(headRows)];
    return chunks.map((cases, n) => ({ group, all, index, n, cases, last: n === chunks.length - 1 }));
  });
  useEffect(() => {
    jumpTo = (id) => {
      const i = shelves.findIndex((v: any) => !v.n && groupId(set.id, v.group) === id);
      if (i >= 0) list.current?.scrollToIndex(i, { align: "start", behavior: "smooth" });
    };
    return () => void (jumpTo = null);
  });
  const grid = (cases: any[], className?: string) => (
    <div className={cn(tiles, className)} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cases.map((c: any) => (
        <CaseTile key={c.id} c={c} touch={!wide} small={small} size={fluid ? side : undefined} alg={wide && fluid ? mainAlg(c) : undefined} pressed={picked ? picked.has(c.id) : undefined} onPress={pick ? () => pick(c.id) : undefined} onPick={() => select(c.id)} />
      ))}
    </div>
  );
  return (
    <div ref={scroll} className={cn("min-h-0 flex-1 overflow-y-auto", wide ? "-mr-3 pr-3 pb-16" : "-mx-4 px-4")}>
      {/* The width of the cases' column, for the columns of every row. */}
      <div aria-hidden="true" className={cn("h-0", wide && "grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-4")}>
        <div ref={setFirst} className={wide ? "col-start-2" : undefined} />
      </div>
      {!section.groups.length && (
        <Empty icon={Check}>{s.learningFilter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>
      )}
      <VirtualList
        items={shelves}
        scroller={scroll}
        handle={list}
        estimate={(i) => {
          const v = shelves[i],
            row = small ? 66 : fluid ? side + (wide ? 72 : 56) : 108;
          return v.n ? row + 8 : (wide ? Math.max(150, headRows * row) : 40 + row) + 24;
        }}
        rowKey={(v: any) => v.group + ":" + v.n}
        row={(v: any, _, measure) => {
          const learned = learnedOf(v.all),
            key = set.id + ":" + v.group;
          if (v.n)
            return (
              <div ref={measure} className={cn(wide && "grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-4", between, v.last && "pb-3")}>
                {grid(v.cases, wide ? "col-start-2" : undefined)}
              </div>
            );
          return (
            <section
              ref={measure}
              id={groupId(set.id, v.group)}
              aria-label={tr(v.group)}
              className={cn(v.index && "border-t border-border/60", wide ? "grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-4 pt-3" : "flex flex-col gap-2 pt-3", v.last && "pb-3")}
            >
              <div className={cn("flex", wide ? "flex-col items-start gap-1.5 pt-2" : "items-center gap-2")}>
                <h3 className="max-w-full text-base leading-tight font-extrabold tracking-[-0.01em] text-balance">{tr(v.group)}</h3>
                <span className={cn(NUMERIC, "text-[13px] font-semibold", learned === v.all.length ? "text-success" : "text-muted-foreground")}>
                  {tr("{0} of {1} learned", { 0: learned, 1: v.all.length })}
                </span>
                {wide && (
                  <span className="flex max-w-32 flex-wrap gap-[3px]" aria-hidden="true">
                    {v.all.map((c: any) => (
                      <i key={c.id} className={cn("size-[7px] rounded-[2px]", s.learned.has(c.id) ? "bg-success" : "bg-muted")} />
                    ))}
                  </span>
                )}
                <Button action={"train:" + key} icon={Timer} variant="secondary" className={cn(wide ? "mt-1" : "ml-auto")}>
                  {tr("Train")}</Button>
              </div>
              {grid(v.cases)}
            </section>
          );
        }}
      />
    </div>
  );
}

/** The selection's actions, floating over the foot of the cases. */
function PickBar({ picked, clear }: { picked: Set<string>; clear: () => void }) {
  const ids = [...picked];
  return (
    <div role="toolbar" aria-label={tr("Selection")} className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-[20px] bg-popover py-2 pr-2 pl-4 ring-1 ring-foreground/10">
      <b className={cn(NUMERIC, "mr-2 text-sm whitespace-nowrap")}>{tr("{0} selected", { 0: ids.length })}</b>
      <UiButton
        variant="secondary"
        disabled={!ids.some((id) => !s.learned.has(id))}
        onClick={async () => {
          for (const id of ids) if (!s.learned.has(id)) await s.action("learn:" + id);
          clear();
        }}
      >
        <Check />
        {tr("Learned")}</UiButton>
      <UiButton disabled={!ids.length} data-action="trainPicked" onClick={() => void s.action("trainCases:" + ids.join(","))}>
        <Timer />
        {tr("Train")}</UiButton>
      <Tip content={tr("Cancel")}>
        <UiButton variant="ghost" size="icon" aria-label={tr("Cancel")} onClick={clear}>
          <X />
        </UiButton>
      </Tip>
    </div>
  );
}

/** The cases of a group as a grid, as many per line as the width holds; compact, smaller and closer. */
export const TILES = "grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-x-1.5 gap-y-1";
/** The large tiles of the catalog: their narrowest (desktop, phone) and widest diagram, and the gap between them, in pixels. */
const FLUID_MIN = 136,
  FLUID_MIN_PHONE = 104,
  FLUID_MAX = 168,
  FLUID_GAP = 6;
const TILES_SMALL = "grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-0.5";

/**
 * A case: its diagram, faded until it is learned, then its name after the learned mark (a click toggles it) and its best
 * time. A click elsewhere opens the case (`action`): on the algorithms page by default, in a dialog elsewhere. With
 * `pressed` it is one of several cases to pick (`onPress`, or the action): a check takes the mark's place once picked.
 * `small` keeps the diagram and the name only.
 */
export function CaseTile({
  c,
  touch = false,
  detail,
  action = "case:" + c.id,
  selected = s.caseId === c.id,
  pressed,
  plain = false,
  small = false,
  size = small ? 40 : 62,
  onPress,
  onPick,
  alg,
}: {
  c: any;
  touch?: boolean;
  detail?: string;
  action?: string;
  selected?: boolean;
  pressed?: boolean;
  /** Drawn only, in a list that opens the case itself (the search): no control of its own, its diagram once in view. */
  plain?: boolean;
  small?: boolean;
  /** The diagram's side, in pixels: the shelves size it to fill the column. */
  size?: number;
  onPress?: () => void;
  /** A right click: the case picked among several. */
  onPick?: () => void;
  /** Its algorithm, on a line of its own under its time. */
  alg?: string;
}) {
  const st = s.stat(c.id),
    learned = s.learned.has(c.id),
    on = pressed ?? (selected && !touch),
    name = detail ?? caseDetail(c),
    play = casePlayItem(c),
    marks = pressed === undefined && !plain,
    label = name ? `${c.id} · ${said(name)}` : said(c.id);
  // The whole tile opens the case; the mark and the play button sit over it.
  const cover = cn("case-row-open absolute inset-0 rounded-2xl", FOCUS);
  const open = plain ? null : onPress ? (
    <button type="button" data-action={action} aria-pressed={pressed} aria-label={label} onClick={onPress} className={cover} />
  ) : action === "case:" + c.id && pressed === undefined ? (
    <Link to={pageUrl("algorithms", { caseId: c.id, puzzle: s.puzzle as PuzzleId })} data-action={action} aria-label={label} className={cover} />
  ) : (
    <button type="button" data-action={action} aria-pressed={pressed} aria-label={label} onClick={run(action)} className={cover} />
  );
  return (
    <div
      className={cn(
        // Hover only where there is a pointer: on touch screens it would stick to the last tile tapped.
        // One background, the tile's: the accent once chosen, the muted on hover.
        "group/row relative flex min-w-0 flex-col items-center rounded-2xl transition-colors",
        on ? "bg-accent" : "[@media(hover:hover)]:hover:bg-muted",
        small ? "gap-0.5 px-0.5 py-1" : "gap-1 px-1 pt-2 pb-1.5",
        touch && !on && "active:bg-muted",
      )}
      onContextMenu={onPick && ((e) => (e.preventDefault(), onPick()))}
    >
      {open && (name && !small ? <Tip content={said(name)}>{open}</Tip> : open)}
      <span
        className={cn(
          "pointer-events-none transition-[opacity,filter]",
          marks && !learned && "opacity-50 saturate-50 group-hover/row:opacity-85 group-hover/row:saturate-100",
        )}
      >
        {plain ? <SeenDiagram c={c} size={size} /> : <Diagram c={c} size={size} />}
      </span>
      <span className="flex max-w-full items-center">
        {marks && !small && (
          <span className="relative z-10 -my-1.5 -ml-1">
            <LearnedMark id={c.id} learned={learned} touch={false} />
          </span>
        )}
        {/* The search's results show the whole id, on two lines if need be: "CMLL Sune Left". */}
        <span className={cn("min-w-0 font-bold", plain ? "line-clamp-2 text-center leading-tight break-words" : "truncate", small ? "text-[11px]" : "text-[13px]")}>{plain ? c.id : said(shortId(c))}</span>
      </span>
      {!small && <span className={cn(NUMERIC, "text-[11.5px] leading-none font-semibold", st ? "text-success" : "text-faint")}>{st ? fmtTime(st.best) : "–"}</span>}
      {alg && !small && <span className="max-w-full truncate px-1 text-[11.5px] leading-none text-muted-foreground">{alg}</span>}
      {marks && play && !small && (
        <Tip content={tr("Play in 3D")}>
          <UiButton
            variant="ghost"
            size="icon"
            data-play={c.id}
            aria-label={tr("Play {0} in 3D", { 0: said(c.id) })}
            onClick={() => s.openAlg([play], 0)}
            className="absolute top-1 right-1 z-10 text-muted-foreground hover:text-foreground [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          >
            <PlayCircle />
          </UiButton>
        </Tip>
      )}
      {pressed && (
        <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/**
 * A case's diagram, drawn once it comes into view: most cases are drawn as a 3D cube, and a long list of them at once
 * (the search's results) made opening and typing slow.
 */
export function SeenDiagram({ c, size }: { c: any; size: number }) {
  const ref = useRef<HTMLSpanElement>(null),
    [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setSeen(true), { rootMargin: "120px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);
  return seen ? <Diagram c={c} size={size} /> : <span ref={ref} className="block shrink-0" style={{ width: size, height: size }} />;
}

/** The title of the pane beside the list (a set, a case, an algorithm in 3D): its name, a muted line, its controls. */
export function PaneHead({ title, sub, children, className }: { title: React.ReactNode; sub?: React.ReactNode } & Props) {
  return (
    <header className={cn("flex shrink-0 items-center gap-4", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="truncate text-xl font-extrabold tracking-[-0.03em] md:text-2xl">{said(title)}</h2>
        {sub && <p className="line-clamp-2 max-w-3xl text-sm text-muted-foreground">{said(sub)}</p>}
      </div>
      {children}
    </header>
  );
}

/** A case's diagram that plays it in 3D on a click, the play mark showing over it (PlayBadge). */
export function PlayDiagram({ id, name, onPlay, compact = false, children }: { id: string; name: string; onPlay: () => void; compact?: boolean } & Props) {
  return (
    <Tip content={tr("Play in 3D")}>
      <button
        type="button"
        data-play={id}
        aria-label={tr("Play {0} in 3D", { 0: said(name) })}
        onClick={onPlay}
        className={cn("group/play relative shrink-0 cursor-pointer self-center rounded-lg transition-shadow hover:ring-2 hover:ring-ring/50", FOCUS)}
      >
        {children}
        <PlayBadge compact={compact} />
      </button>
    </Tip>
  );
}

/** Phones: a page's actions in a band at its foot, under the thumb. */
export function FootBar({ children, className }: Props) {
  return (
    <footer className={cn("flex shrink-0 items-center gap-2 px-2 py-2", className)} data-no-timer>
      {children}
    </footer>
  );
}

/** Previous and next of a list (`action:previous`, `action:next`), with where this one stands. */
export function Stepper({ action, index, count, tips, to }: { action: string; index: number; count: number; tips: [string, string]; to?: [string | undefined, string | undefined] }) {
  // With addresses (a case on the algorithms page), the arrows are links: a crawler follows them from one case to the next.
  const variant = useQuiet();
  const step = (side: 0 | 1, I: typeof ChevronLeft) => {
    const id = action + (side ? ":next" : ":previous"),
      href = to?.[side];
    return (
      <Tip content={tips[side]}>
        <UiButton
          data-action={id}
          variant={variant}
          size="icon"
          aria-label={tips[side]}
          {...(href
            ? { nativeButton: false, render: <Link to={href} onClick={(e) => (e.preventDefault(), run(id)(e))} /> }
            : { disabled: side ? index === count - 1 : index === 0, onClick: run(id) })}
        >
          <I />
        </UiButton>
      </Tip>
    );
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      {step(0, ChevronLeft)}
      {/* Written as the buttons beside it are. */}
      <span className={cn(NUMERIC, "min-w-14 text-center text-sm font-semibold")}>
        {index + 1} / {count}
      </span>
      {step(1, ChevronRight)}
    </div>
  );
}

const SOURCES: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };
/** Where an algorithm comes from: a known site by its name, a page by its site. */
const sourceName = (source: string) => SOURCES[source] ?? (/^https?:\/\//.test(source) ? new URL(source).hostname.replace(/^www\./, "") : source);
/** The faces an algorithm turns (R U, R U F…) and whether it rotates the cube. */
function turns(alg: string) {
  const moves = alg.replace(/[()[\]]/g, " ").split(/\s+/).filter(Boolean);
  return { faces: [...new Set(moves.filter((m) => !/^[xyz]/.test(m)).map((m) => m[0]!.toUpperCase()))], rotation: moves.some((m) => /^[xyz]/.test(m)) };
}

/** The tips of the case stepper (Stepper). */
const caseTips = (): [string, string] => [tr("Previous case (←)"), tr("Next case (→)")];

/** Where a case stands in its set, and its neighbours' addresses on the algorithms page. */
const caseSteps = (c: any) => {
  const cases = s.setCases(c.set),
    index = cases.findIndex((v: any) => v.id === c.id),
    near = [cases[index - 1], cases[index + 1]],
    to = (v?: any) => v && pageUrl("algorithms", { caseId: v.id, puzzle: s.puzzle as PuzzleId });
  return { index, count: cases.length, to: near.map(to) as [string | undefined, string | undefined] };
};

type Choices = { total: number; algs: Record<string, number> } | null;
/** How many players learned the case with each of its algorithms; nothing for a guest or offline. */
function useChoices(id: string, chosen: string[]): Choices {
  const [choices, setChoices] = useState<Choices>(null);
  useEffect(() => {
    let live = true;
    setChoices(null);
    void call("algorithmChoices", [id]).then((v: any) => live && setChoices(v?.[id] ?? null), () => {});
    return () => {
      live = false;
    };
  }, [id, chosen.join("\n")]);
  return choices?.total ? choices : null;
}

/** The case shown in the dialog: one opened over any page, else the one the algorithms page's address names. */
const dialogCase = () => s.caseDialog || (s.page === "algorithms" ? s.caseId : "");

/**
 * A case, from anywhere in the app (the catalogue, a course, the training, the search, the analysis, the profile…):
 * one dialog over the page, mounted once (app.tsx), a full-screen sheet on phones. The arrows step through its set,
 * Escape closes it.
 */
export function CaseDialog() {
  const id = dialogCase(),
    open = !!id && !!s.find(id);
  // The arrows wait while the 3D player opened from the dialog is over it, and in a field.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || s.overlay || (e.target as HTMLElement).closest?.("input,textarea,.chart-plot,[role=slider]")) return;
      e.preventDefault();
      e.stopPropagation();
      void s.action("caseStep:" + (e.key === "ArrowLeft" ? "previous" : "next"));
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [open]);
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && void s.action("caseDialog:")}
      title={said(id)}
      hideHeader
      tall="full"
      className={DIALOG}
      sheetClassName="gap-0 px-0 pt-0 pb-0"
      // The dialog itself, rather than its first control and that one's tooltip.
      initialFocus={() => document.querySelector<HTMLElement>("[data-case-card]")}
    >
      {open && <CaseCard key={id} id={id} />}
    </Modal>
  );
}
const DIALOG = "flex h-[min(50rem,calc(100svh-3rem))] flex-col gap-0 overflow-hidden rounded-[28px] p-0 sm:max-w-[78rem]";

/**
 * Written ahead of time (desktop/prerender.tsx), a case's address shows the dialog's content over the catalogue as the
 * app would: search engines read the case and its algorithms whole, without running anything.
 */
function PrerenderedCase() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div role="dialog" aria-label={said(s.caseId)} className={cn(DIALOG, "w-full bg-popover")}>
        <CaseCard id={s.caseId} />
      </div>
    </div>
  );
}

/**
 * One case whole. On top its diagram (played in 3D on a click), place, name and setup, its neighbours in the set,
 * Train and Learned. Then its algorithms, those used first, the one picked played large beside the list with what
 * tells it apart; or the player's times on it, figures and a chart. Phones stack it all in one column.
 */
function CaseCard({ id }: { id: string }) {
  const found = s.find(id),
    // A last layer case's left-hand algorithms: the mirror of its stage's, played and listed in place of its own.
    mirrored = useMemo(() => leftHandAlgs(found, s.cases("333").filter((v: any) => v.stage === found.stage)), [found]),
    left = !!mirrored?.length && s.leftHand,
    c = left ? { ...found, algorithms: mirrored } : found,
    phone = usePhone(),
    { h } = useViewport(),
    [tab, setTab] = useState(s.caseView),
    { index, count, to } = caseSteps(c),
    st = s.stat(c.id),
    learned = s.learned.has(c.id),
    chosen: string[] = learned && !left ? (s.learnedAlgs[c.id] ?? []) : [],
    choices = useChoices(c.id, chosen),
    algs: any[] = c.algorithms,
    order = algs.map((_, i) => i).sort((a, b) => +chosen.includes(algs[b].alg) - +chosen.includes(algs[a].alg) || a - b),
    // The algorithm played: the one used, else the first.
    [chosenIndex, pick] = useState(order[0] ?? 0),
    picked = Math.min(chosenIndex, algs.length - 1),
    play = casePlayItem(c),
    name = caseDetail(c);
  // On the algorithms page the arrows are links: a crawler follows them from one case to the next.
  const stepper = <Stepper action="caseStep" index={index} count={count} tips={caseTips()} to={s.caseDialog ? undefined : to} />;
  const size = phone ? 80 : 96,
    diagram = play ? (
      <PlayDiagram id={c.id} name={c.id} onPlay={() => (s.openAlg([play], 0), void s.action("algChoice:" + picked))}>
        <Diagram c={c} size={size} />
      </PlayDiagram>
    ) : (
      <Diagram c={c} size={size} />
    );
  const who = (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="truncate text-[13px] font-semibold text-muted-foreground">{caseContext(c)}</p>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.04em]">{said(c.id)}</h2>
        {name && <span className="truncate text-lg font-semibold text-muted-foreground">{said(name)}</span>}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
        <span>{tr("Setup")}</span>
        <Alg text={c.setup} size={14} className="text-foreground/80" />
      </div>
    </div>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button action="train" icon={Timer} variant="default" className={cn(phone && "flex-1")}>
        {tr("Train")}
      </Button>
      <LearnToggle action={"learn:" + c.id} learned={learned} className={cn(phone && "flex-1")} />
    </div>
  );
  const tabs = (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <Segmented
        label={tr("Case")}
        action="caseView:"
        value={tab}
        onChange={(v) => setTab((s.caseView = v as typeof tab))}
        options={[
          { id: "algorithms", label: "Algorithms", count: algs.length },
          { id: "statistics", label: "My times", count: st?.count ?? 0 },
        ]}
      />
      {tab === "algorithms" && !!mirrored?.length && (
        <ActionToggle action="leftHand" pressed={left} icon={FlipHorizontal2} variant="outline" tip={tr("The mirror of the other cases' algorithms that solve this one")}>
          {tr("Left hand")}
        </ActionToggle>
      )}
    </div>
  );
  // Phones play it above the list: back up to it.
  const list = <AlgList c={c} order={order} chosen={chosen} picked={picked} pick={(i) => (pick(i), phone && document.querySelector("[data-alg-stage]")?.scrollIntoView({ block: "start", behavior: "smooth" }))} />,
    stage = <AlgStage c={c} i={picked} mine={chosen.includes(algs[picked]?.alg)} own={!left} choices={left ? null : choices} cube={phone ? 200 : Math.max(120, Math.min(300, Math.min(800, h - 48) - 440))} phone={phone} />,
    times = s.caseHistory && (
      <TimerStats
        data={s.caseHistory}
        tools={<SourceChoice />}
        empty={s.caseSource === "solves" ? tr("Not met in a smart cube solve yet.") : tr("No attempts on this case yet.")}
      />
    );
  if (phone)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1 px-2 py-1">
          {stepper}
          <span className="flex-1" />
          <Button action="caseDialog:" icon={X} size="icon" variant="ghost" tip={tr("Close")} />
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="flex items-center gap-4">
            {diagram}
            {who}
          </div>
          {actions}
          {tabs}
          {tab === "algorithms" ? (
            <>
              {stage}
              {list}
            </>
          ) : (
            <div className="flex min-h-[30rem] flex-col">{times}</div>
          )}
        </div>
      </div>
    );
  return (
    <div data-case-card tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
      {/* Clear of the dialog's close button. */}
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 pt-5 pr-18 pb-4 pl-6">
        {diagram}
        {who}
        <div className="flex flex-col items-end gap-2.5">
          {stepper}
          {actions}
        </div>
      </header>
      <div className="px-6 pb-3.5">{tabs}</div>
      {tab === "algorithms" ? (
        <div className="grid min-h-0 flex-1 grid-cols-[27rem_minmax(0,1fr)] gap-4 px-5 pb-5">
          {/* Room for the rows' focus ring, which the scrolling would clip. */}
          <div className="-m-1 min-h-0 overflow-y-auto p-1 pr-2">{list}</div>
          {stage}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-1 pb-6">{times}</div>
      )}
    </div>
  );
}

/** A 3×3 case is also timed when a smart cube solve goes through it: all its times, those, or the training's. */
function SourceChoice() {
  if (s.puzzle !== "333") return null;
  return (
    <Choice
      prefix="caseSource:"
      label={tr("Times")}
      value={s.caseSource}
      options={[
        { id: "all", label: "All", tip: "Training and smart cube solves" },
        { id: "solves", label: "In solves", tip: "Done during solves on a connected cube" },
        { id: "training", label: "Training", tip: "Trained on its own" },
      ]}
    />
  );
}

/** Moves are counted on cubes; the other puzzles write theirs otherwise. */
const onCube = (c: any) => !!casePlayItem(c) && !casePlayItem(c)!.puzzle;

/**
 * What tells an algorithm apart, in plain text: its length, the faces it turns, its SpeedCubeDB votes, whether it has a
 * video. `full` (the algorithm picked) adds how many players chose it (when the server knows), its source, who
 * recommends it, and links.
 */
function AlgFacts({ a, cube, choices, full = false }: { a: any; cube: boolean; choices?: Choices; full?: boolean }) {
  const { faces, rotation } = turns(a.alg),
    n = choices?.algs[a.alg] ?? 0,
    link = cn("inline-flex items-center gap-1 rounded hover:text-foreground hover:underline underline-offset-2", FOCUS);
  return (
    <p className={cn("flex flex-wrap items-center text-muted-foreground [&_b]:font-bold [&_b]:text-foreground", full ? "gap-x-3.5 gap-y-1 text-[13px]" : "gap-x-2 gap-y-0.5 text-[12.5px] font-semibold")}>
      {cube && (
        <Tip content={tr("Slice turn metric: every turn counts one, rotations none")}>
          <span>
            <b className={NUMERIC}>{moveCount(a.alg)}</b> STM
          </span>
        </Tip>
      )}
      {cube && (
        <span>
          {faces.join(" ")}
          {rotation && ` + ${tr("rotation")}`}
        </span>
      )}
      {full && choices && (
        <Tip content={tr("{0} of {1} players learned this case with it", { 0: n, 1: choices.total })}>
          <span className={NUMERIC}>{tr("{0}% of players", { 0: Math.round((n / choices.total) * 100) })}</span>
        </Tip>
      )}
      {a.votes != null && <span className={NUMERIC}>{tr("{0} SpeedCubeDB votes", { 0: a.votes })}</span>}
      {full &&
        (/^https?:\/\//.test(a.source) ? (
          <button type="button" data-action={"url:" + a.source} onClick={run("url:" + a.source)} className={link}>
            {sourceName(a.source)}
          </button>
        ) : (
          a.source !== "speedcubedb" && <span>{sourceName(a.source)}</span>
        ))}
      {full && a.recommended_by?.length > 0 && <span>{tr("recommended by {0}", { 0: a.recommended_by.map(sourceName).join(", ") })}</span>}
      {a.youtube &&
        (full ? (
          <button type="button" data-action={"url:" + a.youtube} onClick={run("url:" + a.youtube)} className={link}>
            <Video className="size-3.5" />
            {tr("Video")}
          </button>
        ) : (
          <span>{tr("Video")}</span>
        ))}
    </p>
  );
}

/**
 * A case's algorithms, those the player uses first under their own heading, each numbered as the catalogue orders
 * them: its moves, a check when used, what tells it apart. A click plays it; the one played is tinted.
 */
function AlgList({ c, order, chosen, picked, pick }: { c: any; order: number[]; chosen: string[]; picked: number; pick: (i: number) => void }) {
  const algs: any[] = c.algorithms,
    cube = onCube(c),
    used = order.filter((i) => chosen.includes(algs[i].alg)).length,
    head = (text: string) => <li className={cn(LABEL, "px-3 pt-3 pb-1 font-bold tracking-wide uppercase")}>{tr(text)}</li>;
  return (
    <ol aria-label={tr("Algorithms")} className="flex flex-col gap-0.5">
      {order.map((i, k) => {
        const a = algs[i],
          mine = k < used;
        return (
          <Fragment key={i}>
            {used > 0 && k === 0 && head("You use")}
            {used > 0 && k === used && head("Other algorithms of the case")}
            <li>
              <button
                type="button"
                data-alg={i}
                aria-pressed={i === picked}
                onClick={() => pick(i)}
                className={cn(ROW, "grid w-full grid-cols-[1.5rem_minmax(0,1fr)_1rem] items-start gap-x-2.5 gap-y-1 px-3 py-2.5 aria-pressed:text-accent-foreground")}
              >
                <span className={cn(NUMERIC, "pt-0.5 text-right text-[13px] font-extrabold", mine ? "text-success" : "text-muted-foreground")}>{i + 1}</span>
                <Alg text={displayAlg(a)} size={16} className="font-semibold" />
                <span className="pt-1 text-success">{mine && <Check className="size-4" strokeWidth={3} aria-label={tr("I use it")} />}</span>
                <span className="col-start-2">
                  <AlgFacts a={a} cube={cube} />
                </span>
              </button>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/**
 * The algorithm picked, played large (the 3D player, its moves lit, the controls), then what tells it apart and
 * whether the player uses it. Other puzzles' algorithms that cannot be played are written large instead.
 */
function AlgStage({ c, i, mine, own = true, choices, cube, phone }: { c: any; i: number; mine: boolean; own?: boolean; choices: Choices; cube: number; phone: boolean }) {
  const a = c.algorithms[i],
    item = casePlayItem(c),
    text = a ? displayAlg(a) : "",
    // Nothing is played on a page written ahead of time.
    ssr = typeof document === "undefined",
    player = useAlgPlayer(ssr ? "" : text, ssr ? null : item?.size, item?.mask, { puzzle: ssr ? undefined : item?.puzzle, hints: item?.hints });
  if (!a) return null;
  return (
    <section data-alg-stage aria-label={tr("Algorithm {0} of {1}", { 0: i + 1, 1: c.algorithms.length })} className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-[22px] bg-background inset-ring-1 inset-ring-border", phone && "shrink-0")}>
      {/* The view over the cube's corner rather than a row of its own. */}
      {player && <ViewButtons player={player} className="absolute top-3 right-3 z-10" />}
      <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pt-4 pb-4", phone && "px-3")}>
        {player && <PlayerCube key={"cube" + text} player={player} size={cube} />}
        <PlayerAlg key={"alg" + text} player={player} text={text} size={phone ? 17 : 20} className="justify-center text-center font-semibold" />
        {player && <PlayerControls player={player} touch={phone} inline={!phone} className="w-full max-w-lg rounded-[16px] bg-card p-1.5" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn(LABEL, "font-bold tracking-wide uppercase")}>{tr("Algorithm {0} of {1}", { 0: i + 1, 1: c.algorithms.length })}</p>
          <AlgFacts a={a} cube={onCube(c)} choices={choices} full />
        </div>
        {own && <ActionToggle
          action={`learnAlg:${c.id}:${i}`}
          pressed={mine}
          icon={Check}
          variant="outline"
          className={cn("text-muted-foreground aria-pressed:bg-success/15 aria-pressed:text-success", phone && "flex-1")}
        >
          {tr("I use it")}
        </ActionToggle>}
      </div>
    </section>
  );
}
