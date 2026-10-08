/**
 * Learn: the methods of the puzzle as large cards under the header, each with the share of its algorithms known; then
 * the chosen one as a course: its steps in a band across the top with Train, Previous and Next, the current step under
 * it, its explanation and tips in a card on the left, every algorithm it teaches beside them.
 * Phones get the course with its steps in a sheet and its actions under the thumb.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { orderedGroups } from "../../src/client/lib/dailyLearning";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Flag, GraduationCap, Info, Lightbulb, Route, Timer } from "lucide-react";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../src/shared/methods";
import { applyAlg, solved } from "../../src/shared/cube";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { viewForMask } from "../../src/shared/cubeDiagram";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, firstOpenSet, methodFacts, methodLearned, methodProgress, recommendedMethod, setGroups, stepDone, stepLearned, stepSets,
  type CourseEntry,
} from "../../src/client/lib/course";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { store as s, type PlayItem } from "./store";
import { PhoneSheet } from "./phone";
import { Alg, Back, Button, Choice, Empty, Figure, Icon, LABEL, LearnToggle, Modal, PAGE, PageHead, ROW, SectionHead, StatusMark, Surface, Tip, plural, run, usePhone } from "./ui";
import { PickerCard } from "./picker";
import { CaseDetail, CaseTile, FootBar, PlayDiagram } from "./algorithms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button as UiButton } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { AssistedSolve } from "./AssistedSolve";

/** A step in a list of steps (the band of chips, the phone's sheet): a row, the step shown tinted like a chosen one. */
const STEP = cn(ROW, "aria-[current=step]:bg-muted aria-[current=step]:text-foreground");

export function Learn() {
  const course = s.learning;
  if (course) return <Course method={course.method} entry={course.entry} puzzle={course.puzzle} />;
  return <Methods />;
}

/** Where a step stands (StatusMark), named for screen readers: done in green, the step shown in the accent. */
function StepMark({ done, current = false, neutral = false }: { done: boolean; current?: boolean; neutral?: boolean }) {
  const label = done ? "Done" : current ? "Current step" : neutral ? "Intuitive" : "To do";
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center", done ? "text-success" : current ? "text-primary" : "text-muted-foreground/50")} aria-label={said(label)} role="img">
      <StatusMark state={done ? "done" : current ? "current" : neutral ? "neutral" : "todo"} />
    </span>
  );
}

/** A method's level as three rising bars: one lit for a first method, all three for a top-level one. */
function LevelBars({ level }: { level: MethodLevel }) {
  const lit = { beginner: 1, intermediate: 2, advanced: 3 }[level];
  return (
    <span className="flex h-3.5 items-end gap-0.75" role="img" aria-label={said(LEVEL_LABEL[level])}>
      {["h-1.5", "h-2.5", "h-3.5"].map((height, i) => (
        <span key={height} className={cn("w-0.75 rounded-xs bg-current", height, i >= lit && "opacity-25")} />
      ))}
    </span>
  );
}

/** What a list of methods says about each: its level, steps, algorithms and where its course stands. */
function methodRows(puzzle: PuzzleId) {
  const cases = s.cases(puzzle), progress = s.course, recommended = recommendedMethod(puzzle);
  return METHODS[puzzle].map((method) => ({
    method,
    facts: methodFacts(method, cases),
    learned: methodLearned(method, cases, s.learned, courseEntry(progress, puzzle, method.id)),
    progress: methodProgress(progress, puzzle, method, cases, s.learned),
    recommended: method.id === recommended,
  }));
}
type MethodRow = ReturnType<typeof methodRows>[number];

const methodDetail = (row: MethodRow) =>
  `${tr(LEVEL_LABEL[row.method.level])} · ${plural(row.facts.steps, "step")}` +
  (row.progress.started ? ` · ${tr("{0} of {1} steps learned", { 0: row.progress.done, 1: row.progress.total })}` : "");
/** The share of a method's algorithms known, from 0 to 1. */
const knownShare = (row: MethodRow) => (row.facts.algorithms ? row.learned / row.facts.algorithms : 0);

/** The methods of the puzzle as large cards under the header, as many side by side as fit; a card opens its course where it was left. */
function Methods() {
  const puzzle = s.puzzle as PuzzleId,
    rows = methodRows(puzzle),
    label = puzzleInfo(puzzle).label;
  return (
    <div className={PAGE}>
      <PageHead
        title={tr("Learn")}
        sub={tr("Choose a {0} method, then follow it step by step", { 0: said(label) })}
        puzzle
      />
      <nav
        aria-label={tr("Methods")}
        data-tour="learn"
        className={cn("grid min-h-0 content-start gap-3 overflow-y-auto md:gap-4", rows.length === 3 ? "md:grid-cols-3" : rows.length > 3 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2")}
      >
        {rows.map((row) => (
          <PickerCard
            key={row.method.id}
            action={"learnMethod:" + row.method.id}
            icon={<LevelBars level={row.method.level} />}
            title={said(row.method.name)}
            badge={row.progress.started ? "In progress" : row.recommended ? "Recommended" : undefined}
            marked={row.recommended || row.progress.started}
            detail={said(row.method.summary)}
            meta={`${methodDetail(row)} · ${tr("{0} / {1} algorithms known · {2}%", { 0: row.learned, 1: row.facts.algorithms, 2: Math.round(knownShare(row) * 100) })}`}
            progress={knownShare(row)}
          />
        ))}
      </nav>
    </div>
  );
}

/** One algorithm of a step, from the catalogue or the step's own; `play` when the 3D player can show it. */
type Item = { key: string; name: string; detail?: string; alg: string; alternatives: string[]; note?: string; learned: boolean; action: string; diagram: React.ReactNode; play?: PlayItem };

/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their icon. */
function InlineDiagram({ puzzle, step, a, size }: { puzzle: PuzzleId; step: MethodStep; a: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize,
    mask = step.mask ?? "full";
  if (!cube) return <span className="flex shrink-0 items-center justify-center text-muted-foreground/60" style={{ width: size, height: size }}><Icon name={"Puzzle" + puzzle} size={size * 0.55} /></span>;
  return <StaticCubeSvg state={applyAlg(solved(cube), algSetup(a))} size={size} mask={mask} view={viewForMask(mask)} className="shrink-0" />;
}

function inlineItem(puzzle: PuzzleId, step: MethodStep, a: MethodAlgorithm, entry: CourseEntry): Item {
  const id = algId(step, a),
    size = puzzleInfo(puzzle).cubeSize,
    algs = [a.alg, ...(a.alternatives ?? [])];
  return {
    key: id,
    name: a.name,
    detail: a.detail,
    alg: a.alg,
    alternatives: a.alternatives ?? [],
    note: a.note,
    learned: entry.learned.includes(id),
    action: "learnAlg:" + id,
    diagram: <InlineDiagram puzzle={puzzle} step={step} a={a} size={64} />,
    play: size ? { key: id, name: a.name, detail: a.detail, context: step.title, algs, note: a.note, size, mask: step.mask ?? "full", setup: a.setup } : undefined,
  };
}

/** An algorithm's case; a click plays it, and the algorithms around it, in 3D. */
function ItemDiagram({ item, items }: { item: Item; items: Item[] }) {
  const playable = items.filter((i) => i.play);
  if (!item.play) return <span className="shrink-0 self-center">{item.diagram}</span>;
  return (
    <PlayDiagram id={item.key} name={item.name} compact onPlay={() => s.openAlg(playable.map((i) => i.play!), playable.indexOf(item))}>
      {item.diagram}
    </PlayDiagram>
  );
}

/** An algorithm's name and the case's own name beside it. */
function AlgName({ item }: { item: Item }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-sans text-sm font-medium">{said(item.name)}</span>
      {item.detail && <span className="truncate text-xs text-muted-foreground">{said(item.detail)}</span>}
    </div>
  );
}

/** The other ways to do an algorithm, folded under their count. */
function Alternatives({ item, touch = false }: { item: Item; touch?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!item.alternatives.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <UiButton variant="ghost" size="xs" aria-expanded={open} onClick={() => setOpen(!open)} className={cn("-ml-2 w-fit text-muted-foreground", touch && "h-9")}>
        <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
        {plural(item.alternatives.length, "alternative")}
      </UiButton>
      {open && item.alternatives.map((alt, i) => <Alg key={i} text={said(alt)} size={14} className="text-muted-foreground" />)}
    </div>
  );
}

/**
 * One algorithm: its case (a click plays it in 3D), its name, the algorithm, how to hold the cube, its alternatives,
 * then its learned toggle.
 */
function AlgRow({ item, items, touch = false }: { item: Item; items: Item[]; touch?: boolean }) {
  const toggle = (
    <div className={cn("flex shrink-0 items-center", touch && "justify-end pt-1")}>
      <LearnToggle action={item.action} learned={item.learned} touch={touch} />
    </div>
  );
  return (
    <div className={cn("group/row -mx-2 flex items-start gap-5 rounded-lg px-2 py-2.5", touch && "gap-4 pr-0")}>
      <ItemDiagram item={item} items={items} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <AlgName item={item} />
        <Alg text={item.alg} size={touch ? 16 : 17} />
        {item.note && <p className="text-xs leading-relaxed text-muted-foreground">{said(item.note)}</p>}
        <Alternatives item={item} touch={touch} />
        {touch && toggle}
      </div>
      {!touch && <div className="self-center">{toggle}</div>}
    </div>
  );
}

/** Whether a case or an algorithm is shown under the filter of learned ones (the algorithms page's, shared). */
const shownByFilter = (learned: boolean) => (s.learningFilter === "learned" ? learned : s.learningFilter === "not-learned" ? !learned : true);

/**
 * The step's content: its explanation and tips, its sets, then every algorithm it teaches. On the desktop the
 * explanation is a card on the left and the algorithms fill the rest, scrolling on their own; a step without any says
 * so there. On a phone the whole step scrolls.
 */
function StepBody({ puzzle, method, entry, touch = false, tools }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean; tools?: HTMLDivElement | null }) {
  const step = method.steps[entry.step]!,
    cases = s.cases(),
    sets = stepSets(step, s.allSets(), puzzle) as any[];
  const chosen = shownSet(puzzle, method, entry, sets),
    byGroup = new Map(chosen ? setGroups(cases, chosen.id) : []),
    groups = chosen ? orderedGroups(cases.filter((c: any) => c.set === chosen.id), s.groupOrder(chosen.id)).map((group): [string, any[]] => [group, byGroup.get(group)!]) : [],
    inline = (step.algs ?? []).map((a) => inlineItem(puzzle, step, a, entry)),
    count = stepLearned(step, cases, s.learned, entry);
  const toolbar = (
    <>
      <h3 className={LABEL}>
        {tr("Algorithms")} <span className="font-normal">{count.learned} / {count.total} {tr("learned")}</span>
      </h3>
      <Choice
        prefix="learningFilter:"
        label={tr("Filter")}
        value={s.learningFilter}
        options={[
          { id: "all", label: "All", count: count.total },
          { id: "learned", label: "Learned", count: count.learned },
          { id: "not-learned", label: "To learn", count: count.total - count.learned },
        ]}
      />
      {sets.length > 1 && (
        <Choice
          prefix="learnSet:"
          label={tr("Set")}
          value={chosen.id}
          options={sets.map((set) => ({ id: set.id, label: set.label, count: set.count }))}
          className="flex-wrap"
        />
      )}
    </>
  );
  // Algorithms to come said in a note, unless the step has none yet: then it is what the desktop shows beside.
  const missing = step.missing && (touch || count.total > 0) && (
    <Alert variant="info" role="note">
      <Info />
      <AlertDescription>{said(step.missing)}</AlertDescription>
    </Alert>
  );
  const intro = (
    <div className="flex flex-col gap-4">
      <p className="text-base leading-relaxed">{said(step.text)}</p>
      {!!step.tips?.length && (
        <section className="flex flex-col gap-1.5" aria-label={tr("Tips")}>
          <h3 className={LABEL}>{tr("Tips")}</h3>
          <ul className="flex flex-col gap-1.5">
            {step.tips.map((tip) => (
              <li key={tip} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                {said(tip)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {missing}
    </div>
  );
  const algorithms =
    count.total > 0 ? (
      <section className={cn("flex flex-col", !touch && "min-h-0 min-w-0 flex-1")} aria-label={tr("Algorithms")}>
        {tools ? createPortal(toolbar, tools) : <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 pb-1">{toolbar}</div>}
        {/* The rows reach 8px past their text (-mx-2): the list's padding holds them, so nothing scrolls sideways. */}
        <motion.div layoutScroll className={cn("flex flex-col", !touch && "-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-6")}>
          {inline.filter((item) => shownByFilter(item.learned)).map((item) => <AlgRow key={item.key} item={item} items={inline} touch={touch} />)}
          {chosen && groups.length > 0 && <GroupBoxes key={chosen.id} label={chosen.label} groups={groups} touch={touch} />}
        </motion.div>
      </section>
    ) : step.missing ? (
      <Empty icon={Info} title={tr("Algorithms to come")}>
        {said(step.missing)}
      </Empty>
    ) : (
      <Empty icon={Lightbulb} title={tr("An intuitive step")}>
        {tr("Nothing to memorise here: understand the idea, then practise it in your solves.")}
        <Button action="nav:playground" icon={Timer} variant="outline">
          {tr("Practise with the timer")}
        </Button>
      </Empty>
    );
  if (touch)
    return (
      <>
        {intro}
        {count.total > 0 && algorithms}
      </>
    );
  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <Surface className="w-80 shrink-0 overflow-y-auto p-5 xl:w-96">{intro}</Surface>
      {algorithms}
    </div>
  );
}

/**
 * The catalogue's cases of a set, group by group, each group a box of tiles like the algorithms page (a tile opens its
 * case in a dialog), the boxes side by side as wide as their tiles, in the saved order of the groups. A group the
 * filter of learned cases empties goes too.
 */
function GroupBoxes({ label, groups, touch }: { label: string; groups: [string, any[]][]; touch: boolean }) {
  const shown = groups.flatMap(([group, members]): [string, any[], any[]][] => {
    const left = members.filter((c) => shownByFilter(s.learned.has(c.id)));
    return left.length ? [[group, left, members]] : [];
  });
  if (!shown.length)
    return <Empty icon={Check}>{s.learningFilter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>;
  return (
    <div className="flex flex-wrap items-start gap-3 pt-2">
      {shown.map(([group, members, total]) => (
        <GroupBox key={group} name={groups.length > 1 ? group : label} members={members} total={total} touch={touch} />
      ))}
    </div>
  );
}

function GroupBox({ name, members, total, touch }: {
  name: string;
  members: any[];
  /** Every case of the group, the learned ones too. */
  total: any[];
  touch: boolean;
}) {
  const learned = total.filter((c) => s.learned.has(c.id)).length;
  return (
    <Surface role="group" className="max-w-full min-w-72 gap-3 p-3" aria-label={said(name)}>
      <SectionHead title={name} meta={<span className={cn(learned === total.length && "text-success")}>{learned} / {total.length}</span>} className="min-h-7" />
      {/* As wide as its tiles, up to the page's width, where they wrap. */}
      <div className="flex flex-wrap gap-1.5">
        {members.map((c) => (
          <div key={c.id} className="w-28">
            <CaseTile c={c} touch={touch} action={"caseDialog:" + c.id} selected={s.caseDialog === c.id} />
          </div>
        ))}
      </div>
    </Surface>
  );
}

/**
 * The set a step shows: the one picked, else the first with cases still to learn when the step is first shown, kept
 * from then on so learning its last case does not switch to another set.
 */
function shownSet(puzzle: PuzzleId, method: SolvingMethod, entry: CourseEntry, sets: any[]) {
  const key = `${puzzle}:${method.id}:${entry.step}`,
    chosen = sets.find((set) => set.id === s.learnSets[key]) ?? firstOpenSet(sets, s.cases(), s.learned);
  if (chosen) s.learnSets[key] = chosen.id;
  return chosen;
}

/** The set Train this step starts on: the one shown. */
function trainAction(puzzle: PuzzleId, method: SolvingMethod, entry: CourseEntry) {
  const sets = stepSets(method.steps[entry.step]!, s.allSets(), puzzle) as any[];
  const chosen = shownSet(puzzle, method, entry, sets);
  return chosen ? "train:" + chosen.id : "";
}

/** A step's mark: a check once all its algorithms are learned, a small dot without algorithms, else a ring filled as far as they are learned. */
function StepRing({ done, share, current, neutral }: { done: boolean; share: number; current: boolean; neutral: boolean }) {
  if (done || neutral)
    return (
      <span className={cn("flex size-4 shrink-0 items-center justify-center", done ? "text-success" : current ? "text-primary" : "text-muted-foreground/50")} aria-hidden="true">
        <StatusMark state={done ? "done" : "neutral"} />
      </span>
    );
  const r = 6.5,
    length = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 -rotate-90", current || share > 0 ? "text-primary" : "text-muted-foreground/50")} aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2.5" />
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${share * length} ${length}`} />
    </svg>
  );
}

/**
 * The course on one line: the step's title between Previous and Next, every step as a chip with its mark (a click
 * opens it), then Train and Next step. A step is done once all its algorithms are learned.
 */
function StepBar({ puzzle, method, entry, tools }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; tools: (element: HTMLDivElement | null) => void }) {
  const cases = s.cases(),
    step = method.steps[entry.step]!,
    train = trainAction(puzzle, method, entry),
    last = entry.step === method.steps.length - 1;
  return (
    <Surface>
      <nav aria-label={tr("Steps")} className="flex h-14 items-center gap-2 px-3">
        <Button action="previous" icon={ChevronLeft} variant="ghost" tip={tr("Previous step")} disabled={entry.step === 0 || s.learnFinished} className="text-muted-foreground" />
        <h2 className="w-36 min-w-0 truncate text-center text-lg font-semibold tracking-tight">{s.learnFinished ? tr("Finished") : said(step.title)}</h2>
        <Button action={"learnStep:" + (entry.step + 1)} icon={ChevronRight} variant="ghost" tip={tr("Next step")} disabled={last || s.learnFinished} className="text-muted-foreground" />
        <Separator orientation="vertical" className="mx-1 h-7 self-center" />
        {/* The chips scroll sideways when they run out of room; the padding keeps their focus ring visible. */}
        <div className="-my-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1">
          {method.steps.map((st, i) => {
            const learned = stepLearned(st, cases, s.learned, entry),
              done = learned.total > 0 && learned.learned === learned.total,
              share = learned.total ? learned.learned / learned.total : 0,
              here = i === entry.step && !s.learnFinished;
            const chip = (
              <button
                key={st.title}
                type="button"
                data-action={"learnStep:" + i}
                aria-current={here ? "step" : undefined}
                onClick={run("learnStep:" + i)}
                className={cn(STEP, "flex h-9 shrink-0 items-center gap-2 px-2.5 text-sm text-muted-foreground hover:text-foreground")}
              >
                <StepRing done={done} share={share} current={here} neutral={!learned.total} />
                {said(st.title)}
              </button>
            );
            return learned.total ? (
              <Tip key={st.title} content={tr("{0} / {1} learned", { 0: learned.learned, 1: plural(learned.total, "alg") })}>
                {chip}
              </Tip>
            ) : (
              chip
            );
          })}
        </div>
        {!s.learnFinished && (
          <div className="flex shrink-0 items-center gap-2">
            {train && (
              <Button action={train} icon={Timer} variant="outline" size="lg">
                {tr("Train")}
              </Button>
            )}
            {last ? (
              <Button action="learnFinish" icon={Flag} variant="default" size="lg">
                {tr("Finish")}
              </Button>
            ) : (
              <Button action={"learnStep:" + (entry.step + 1)} variant="default" size="lg">
                {tr("Next step")}
                <ChevronRight />
              </Button>
            )}
          </div>
        )}
      </nav>
      {/* The step's algorithms: how many are learned, which ones are shown and the set (StepBody). */}
      <div ref={tools} className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-1.5 empty:hidden" />
    </Surface>
  );
}

/** The steps of a course as rows (phones): their mark, number, title and algorithms; a click shows the step. */
function StepRows({ method, entry, touch = false, onPick }: { method: SolvingMethod; entry: CourseEntry; touch?: boolean; onPick?: () => void }) {
  const cases = s.cases();
  return method.steps.map((st, i) => {
    const learned = stepLearned(st, cases, s.learned, entry),
      here = i === entry.step && !s.learnFinished;
    return (
      <button
        key={st.title}
        type="button"
        data-action={"learnStep:" + i}
        aria-current={here ? "step" : undefined}
        onClick={(e) => {
          onPick?.();
          run("learnStep:" + i)(e);
        }}
        className={cn(STEP, "flex shrink-0 items-center gap-3", touch ? "min-h-14 px-3 active:bg-muted/50" : "px-2.5 py-2")}
      >
        <StepMark done={learned.total > 0 && learned.learned === learned.total} current={here} neutral={!learned.total} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-medium", touch ? "text-base" : "text-sm")}>
            <span className="text-muted-foreground">{i + 1}</span> {said(st.title)}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {learned.total ? tr("{0} / {1} learned", { 0: learned.learned, 1: plural(learned.total, "alg") }) : st.missing ? tr("Algorithms to come") : tr("Intuitive")}
          </span>
        </span>
      </button>
    );
  });
}


/**
 * Phones: where a step leaves you, under the thumb. Previous quietly on the left; Next step on the right, which shows the next; Finish on the last step, which completes the method.
 */
function StepFooter({ method, entry, train }: { method: SolvingMethod; entry: CourseEntry; train?: string }) {
  const last = entry.step === method.steps.length - 1,
    next = method.steps[entry.step + 1];
  return (
    <FootBar>
      <Button action="previous" icon={ChevronLeft} variant="ghost" size="lg" disabled={entry.step === 0} className="text-muted-foreground max-md:h-11">
        {tr("Previous")}
      </Button>
      {train && (
        <Button action={train} icon={Timer} variant="ghost" size="lg" className="text-muted-foreground max-md:h-11">
          {tr("Train")}
        </Button>
      )}
      {last ? (
        <Button action="learnFinish" icon={Flag} variant="default" size="lg" className="ml-auto flex-1 max-md:h-11">
          {tr("Finish")}
        </Button>
      ) : (
        <Button action={"learnStep:" + (entry.step + 1)} variant="default" size="lg" className="ml-auto min-w-0 flex-1 justify-between max-md:h-11">
          <span className="truncate">
            {tr("Next ·")} {said(next!.title)}
          </span>
          <ChevronRight />
        </Button>
      )}
    </FootBar>
  );
}

/** A course completed: what was done, then where to go from here. */
function Finished({ puzzle, method, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; touch?: boolean }) {
  const cases = s.cases(),
    entry = courseEntry(s.course, puzzle, method.id),
    learned = method.steps.reduce((sum, st) => sum + stepLearned(st, cases, s.learned, entry).learned, 0),
    total = method.steps.reduce((sum, st) => sum + stepLearned(st, cases, s.learned, entry).total, 0);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col justify-center gap-6", touch ? "px-5 py-8" : "max-w-xl px-1 pb-16")} data-finished>
      <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="size-6" strokeWidth={3} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{said(method.name)} {" "}{tr("done")}</h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          {tr("You have been through every step of")}{" "}{said(method.name)}{tr(". Solve with it on the timer until it flows, then try a faster method.")}</p>
      </div>
      <div className="flex gap-10">
        <Figure label={tr("Steps")} value={`${method.steps.length} / ${method.steps.length}`} size="2xl" tone="good" />
        {total > 0 && <Figure label={tr("Algorithms learned")} value={`${learned} / ${total}`} size="2xl" />}
      </div>
      <div className={cn("flex gap-2", touch ? "flex-col" : "flex-wrap")}>
        <Button action="nav:playground" icon={Timer} variant="default" size="lg" className="max-md:h-11">
          {tr("Practise with the timer")}</Button>
        <Button action="learnMethods" icon={GraduationCap} variant="outline" size="lg" className="max-md:h-11">
          {tr("Learn another method")}</Button>
      </div>
    </div>
  );
}

/** A course: its steps in a box, the current one on the page, Previous and Next step beside its title. */
function Course({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const phone = usePhone();
  return (
    <>
      {phone ? <PhoneCourse puzzle={puzzle} method={method} entry={entry} /> : <DesktopCourse puzzle={puzzle} method={method} entry={entry} />}
      <CaseDialog />
      {assisted(puzzle, method) && <AssistedSolve />}
    </>
  );
}

/** The beginner 3×3 course can solve the player's own cube with them (AssistedSolve). */
const assisted = (puzzle: PuzzleId, method: SolvingMethod) => puzzle === "333" && method.id === "beginner";
function AssistedButton({ puzzle, method, phone = false }: { puzzle: PuzzleId; method: SolvingMethod; phone?: boolean }) {
  if (!assisted(puzzle, method)) return null;
  return phone ? (
    <Button action="assisted" icon={Route} tip={tr("Assisted solve")} />
  ) : (
    <Button action="assisted" icon={Route} variant="outline">
      {tr("Assisted solve")}
    </Button>
  );
}

/** A case of the step opened over the course: the algorithms page's detail, in a dialog. */
export function CaseDialog() {
  const open = !!s.caseDialog && !!s.find(s.caseDialog);
  // The arrows step through the case's set, like the algorithms page; the course's own arrows wait behind, and so does
  // the dialog while the 3D player opened from it is over it.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || s.overlay || (e.target as HTMLElement).closest?.("input,textarea")) return;
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
      title={said(s.caseDialog)}
      hideHeader
      tall
      className="flex max-h-[min(52rem,calc(100svh-4rem))] flex-col gap-0 overflow-hidden p-5 sm:max-w-4xl"
    >
      {open && <CaseDetail key={s.caseDialog} id={s.caseDialog} dialog />}
    </Modal>
  );
}

function DesktopCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  // The step's tools go in the box of the steps, under them (see StepBody).
  const [tools, setTools] = useState<HTMLDivElement | null>(null);
  const progress = methodProgress(s.course, puzzle, method, s.cases(), s.learned);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Back action="learnMethods" label="Every method" />}
        title={said(method.name)}
        sub={tr("{0} · {1} · {2} of {3} steps learned", { 0: said(puzzleInfo(puzzle).label), 1: tr(LEVEL_LABEL[method.level]), 2: progress.done, 3: progress.total })}
      >
        <AssistedButton puzzle={puzzle} method={method} />
      </PageHead>
      <StepBar puzzle={puzzle} method={method} entry={entry} tools={setTools} />
      {s.learnFinished ? (
        <Finished puzzle={puzzle} method={method} />
      ) : (
        // The step holds the page's height: its explanation stays, its algorithms scroll (StepBody).
        <StepBody key={entry.step} puzzle={puzzle} method={method} entry={entry} tools={tools} />
      )}
    </div>
  );
}

/**
 * Phones: the course as a page of its own, back to the methods in the header. The step chooser opens the steps in a
 * sheet; Previous, Train and Next step stay at the bottom, under the thumb.
 */
function PhoneCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const [steps, setSteps] = useState(false),
    progress = methodProgress(s.course, puzzle, method, s.cases(), s.learned),
    step = method.steps[entry.step]!,
    done = stepDone(step, s.cases(), s.learned, entry),
    train = trainAction(puzzle, method, entry);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Back action="learnMethods" label="Every method" />}
        title={said(method.name)}
        sub={tr("{0} · {1} of {2} steps learned", { 0: said(puzzleInfo(puzzle).label), 1: progress.done, 2: progress.total })}
      >
        <AssistedButton puzzle={puzzle} method={method} phone />
      </PageHead>
      <Surface className="flex-1">
        <button
          type="button"
          data-action="learnSteps"
          aria-haspopup="dialog"
          onClick={() => setSteps(true)}
          className={cn(ROW, "flex min-h-14 shrink-0 items-center gap-3 rounded-none border-b px-4 active:bg-muted/50")}
        >
          <StepMark done={s.learnFinished || done} current={!s.learnFinished && !done} />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-base font-medium">{s.learnFinished ? tr("{0} done", { 0: said(method.name) }) : said(step.title)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{s.learnFinished ? method.steps.length : entry.step + 1} / {method.steps.length}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
        {s.learnFinished ? (
          <Finished puzzle={puzzle} method={method} touch />
        ) : (
          <>
            <div key={entry.step} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-6">
              <StepBody puzzle={puzzle} method={method} entry={entry} touch />
            </div>
            <StepFooter method={method} entry={entry} train={train} />
          </>
        )}
      </Surface>
      <PhoneSheet open={steps} onOpenChange={setSteps} title={tr("Steps")} description={tr("{0} of {1} steps learned", { 0: progress.done, 1: progress.total })} className="gap-0 px-2">
        <StepRows method={method} entry={entry} touch onPick={() => setSteps(false)} />
      </PhoneSheet>
    </div>
  );
}
