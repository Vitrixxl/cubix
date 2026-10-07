/**
 * Learn: the methods of the puzzle as large cards in the middle of the page, each with the share of its algorithms
 * known; then the chosen one as a course: its steps in a band across the top with Train, Previous and Next, the
 * current step under it with its explanation, its tips and every algorithm it teaches.
 * Phones get the course with its steps in a sheet and its actions under the thumb.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Toggle } from "@/components/ui/toggle";
import { orderedGroups } from "../../src/client/lib/dailyLearning";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Circle, EyeOff, Flag, GraduationCap, Info, Timer } from "lucide-react";
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
import { ActionToggle, Alg, Bar, Button, Choice, Figure, Icon, LABEL, PlayBadge, NUMERIC, PAGE, PageHead, PuzzleButton, Surface, Tip, plural, run, usePhone } from "./ui";
import { Picker, PickerCard } from "./picker";
import { CaseDetail, CaseTile, TILES } from "./algorithms";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** Whether a step's learned algorithms are hidden, the same on every step. */
const HIDE_LEARNED = "cubix.learn.hideLearned";

export function Learn() {
  const course = s.learning;
  if (course) return <Course method={course.method} entry={course.entry} puzzle={course.puzzle} />;
  return <Methods />;
}

/**
 * Where a step stands, as a passive mark: a green disc with a check once all its algorithms are learned, a ring around
 * a dot for the step shown, a small dot for a step without algorithms, a quiet dashed circle otherwise.
 */
function StepMark({ done, current = false, neutral = false, className }: { done: boolean; current?: boolean; neutral?: boolean; className?: string }) {
  const label = done ? "Done" : current ? "Current step" : neutral ? "Intuitive" : "To do";
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center", done ? "text-success" : current ? "text-primary" : "text-muted-foreground/50", className)} aria-label={said(label)} role="img">
      {done ? (
        <span className="flex size-3.5 items-center justify-center rounded-full bg-current">
          <Check className="size-2.5 text-background" strokeWidth={3.5} />
        </span>
      ) : current ? (
        <span className="flex size-3.5 items-center justify-center rounded-full border-[1.5px] border-current">
          <span className="size-1.5 rounded-full bg-current" />
        </span>
      ) : neutral ? (
        <span className="size-1.5 rounded-full bg-current" />
      ) : (
        <Circle className="size-4" strokeDasharray="3.5 3" />
      )}
    </span>
  );
}

/** A method's level as three rising bars: one lit for a first method, all three for a top-level one. */
function LevelBars({ level }: { level: MethodLevel }) {
  const lit = { beginner: 1, intermediate: 2, advanced: 3 }[level];
  return (
    <span className="flex h-3.5 items-end gap-[3px]" role="img" aria-label={said(LEVEL_LABEL[level])}>
      {["h-1.5", "h-2.5", "h-3.5"].map((height, i) => (
        <span key={height} className={cn("w-[3px] rounded-[1px] bg-current", height, i >= lit && "opacity-25")} />
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
  `${LEVEL_LABEL[row.method.level]} · ${plural(row.facts.steps, "step")}` + (row.progress.started ? ` · ${row.progress.done} / ${row.progress.total} learned` : "");
/** The share of a method's algorithms known, from 0 to 1. */
const knownShare = (row: MethodRow) => (row.facts.algorithms ? row.learned / row.facts.algorithms : 0);

/** The methods of the puzzle as large cards; a card opens its course where it was left. */
function Methods() {
  const puzzle = s.puzzle as PuzzleId,
    rows = methodRows(puzzle),
    label = puzzleInfo(puzzle).label;
  return (
    <div className={PAGE}>
      <PageHead
        title={tr("Learn")}
        sub={tr("Choose a {0} method, then follow it step by step", { 0: label })}
        puzzle
      />
      <Picker label={tr("Methods")} tour="learn">
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
      </Picker>
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

/** Whether an algorithm is learned, as a labelled toggle: "Mark learned", then "Learned" in green. */
export function LearnToggle({ action, learned, touch = false }: { action: string; learned: boolean; touch?: boolean }) {
  return (
    <ActionToggle
      action={action}
      pressed={learned}
      icon={Check}
      size="default"
      variant="outline"
      className={cn("text-muted-foreground aria-pressed:border-success/40 aria-pressed:bg-success/15 aria-pressed:text-success", touch && "h-11 px-3")}
    >
      {learned ? tr("Learned") : tr("Mark learned")}
    </ActionToggle>
  );
}

/** An algorithm's case; a click plays it, and the algorithms around it, in 3D. */
function PlayDiagram({ item, items }: { item: Item; items: Item[] }) {
  const playable = items.filter((i) => i.play);
  if (!item.play) return <span className="shrink-0 self-center">{item.diagram}</span>;
  return (
    <Tip content="Play in 3D">
      <button
        type="button"
        data-play={item.key}
        aria-label={tr("Play {0} in 3D", { 0: item.name })}
        onClick={() => s.openAlg(playable.map((i) => i.play!), playable.indexOf(item))}
        className="group/play relative shrink-0 cursor-pointer self-center rounded-md outline-none ring-ring/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-2 focus-visible:ring-2"
      >
        {item.diagram}
        <PlayBadge compact />
      </button>
    </Tip>
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
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn("-ml-1 flex w-fit items-center gap-1 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50", touch && "min-h-9")}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {plural(item.alternatives.length, "alternative")}
      </button>
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
    <div className={cn("group/row -mx-2 flex items-start gap-5 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40", touch && "gap-4 pr-0 hover:bg-transparent")}>
      <PlayDiagram item={item} items={items} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <AlgName item={item} />
        <Alg text={item.alg} size={touch ? 16 : 17} />
        {item.note && <p className="text-xs leading-relaxed text-muted-foreground">{item.note}</p>}
        <Alternatives item={item} touch={touch} />
        {touch && toggle}
      </div>
      {!touch && <div className="self-center">{toggle}</div>}
    </div>
  );
}

/**
 * The step's content: its explanation and tips, its sets, then every algorithm it teaches. On the desktop it fills the
 * page's height and only the algorithms scroll; on a phone the whole step scrolls.
 */
function StepBody({ puzzle, method, entry, touch = false, tools }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean; tools?: HTMLDivElement | null }) {
  const step = method.steps[entry.step]!,
    cases = s.cases(),
    sets = stepSets(step, s.allSets(), puzzle) as any[];
  const chosen = shownSet(puzzle, method, entry, sets),
    byGroup = new Map(chosen ? setGroups(cases, chosen.id) : []),
    groups = chosen ? orderedGroups(cases.filter((c: any) => c.set === chosen.id), s.groupOrder(chosen.id)).map((group): [string, any[]] => [group, byGroup.get(group)!]) : [],
    inline = (step.algs ?? []).map((a) => inlineItem(puzzle, step, a, entry)),
    count = stepLearned(step, cases, s.learned, entry),
    [hide, setHide] = useState(() => !!s.prefs[HIDE_LEARNED]);
  const fill = !touch;
  const toolbar = (
    <>
            <h3 className={LABEL}>
              {tr("Algorithms")}{" "}<span className="font-normal">{count.learned} / {count.total} {" "}{tr("learned")}</span>
            </h3>
            {count.learned > 0 && (
              <Toggle
                size="sm"
                pressed={hide}
                onPressedChange={(next) => {
                  setHide(next);
                  s.pref(HIDE_LEARNED, next);
                }}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground aria-pressed:text-foreground"
              >
                <EyeOff className="size-3.5" />
                {tr("Hide learned")}
              </Toggle>
            )}
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
  return (
    <>
      {/* Without algorithms, the explanation alone may need the scroll. */}
      <div className={cn("flex max-w-2xl flex-col gap-4", fill && (count.total > 0 ? "shrink-0" : "min-h-0 overflow-y-auto pb-6"))}>
        <p className="text-[15px] leading-relaxed text-foreground/85">{said(step.text)}</p>
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
        {step.missing && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            {said(step.missing)}
          </p>
        )}
      </div>
      {count.total > 0 && (
        <section className={cn("flex flex-col", fill && "min-h-0 flex-1")} aria-label={tr("Algorithms")}>
          {tools ? createPortal(toolbar, tools) : <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 pb-1">{toolbar}</div>}
          {/* The rows reach 8px past their text (-mx-2): the list's padding holds them, so nothing scrolls sideways. */}
          <motion.div layoutScroll className={cn("flex flex-col", fill && "-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-6")}>
            {inline.filter((item) => !hide || !item.learned).map((item) => <AlgRow key={item.key} item={item} items={inline} touch={touch} />)}
            {chosen && groups.length > 0 && <GroupBoxes key={chosen.id} label={chosen.label} groups={groups} hide={hide} touch={touch} />}
          </motion.div>
        </section>
      )}
    </>
  );
}

/**
 * The catalogue's cases of a set, group by group, each group a box of tiles like the algorithms page (a tile opens its
 * case in a dialog), the boxes side by side as wide as their tiles, in the saved order of the groups. With the learned
 * cases hidden, a group all learned goes too.
 */
function GroupBoxes({ label, groups, hide, touch }: { label: string; groups: [string, any[]][]; hide: boolean; touch: boolean }) {
  const shown = groups.flatMap(([group, members]): [string, any[], any[]][] => {
    const left = hide ? members.filter((c) => !s.learned.has(c.id)) : members;
    return left.length ? [[group, left, members]] : [];
  });
  if (!shown.length) return <p className="pt-2 text-sm text-muted-foreground">{tr("Every case of this set is learned.")}</p>;
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
    <section className="relative flex max-w-full min-w-72 flex-col gap-3 rounded-xl border bg-card p-3" aria-label={said(name)}>
      <header className="flex min-h-7 items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{said(name)}</h4>
        <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground", learned === total.length && "text-success")}>
          {learned} / {total.length}
        </span>
      </header>
      {/* As wide as its tiles, up to the page's width, where they wrap. */}
      <div className="flex flex-wrap gap-1.5">
        {members.map((c) => (
          <div key={c.id} className="w-28">
            <CaseTile c={c} touch={touch} action={"caseDialog:" + c.id} selected={s.caseDialog === c.id} />
          </div>
        ))}
      </div>
    </section>
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
  if (neutral)
    return (
      <span className={cn("flex size-4 shrink-0 items-center justify-center", current ? "text-primary" : "text-muted-foreground/50")} aria-hidden="true">
        <span className="size-1.5 rounded-full bg-current" />
      </span>
    );
  if (done)
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary">
        <Check className="size-2.5 text-primary-foreground" strokeWidth={3.5} />
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
    <div className="flex shrink-0 flex-col rounded-xl border bg-card">
    <nav aria-label={tr("Steps")} className="flex h-14 items-center gap-2 px-2">
      <Button action="previous" icon={ChevronLeft} variant="ghost" tip={tr("Previous step")} disabled={entry.step === 0 || s.learnFinished} className="text-muted-foreground" />
      <h2 className="w-36 min-w-0 truncate text-center text-lg font-semibold tracking-tight">{s.learnFinished ? tr("Finished") : said(step.title)}</h2>
      <Button action={"learnStep:" + (entry.step + 1)} icon={ChevronRight} variant="ghost" tip={tr("Next step")} disabled={last || s.learnFinished} className="text-muted-foreground" />
      <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {method.steps.map((st, i) => {
          const learned = stepLearned(st, cases, s.learned, entry),
            done = learned.total > 0 && learned.learned === learned.total,
            share = learned.total ? learned.learned / learned.total : 0,
            here = i === entry.step && !s.learnFinished;
          return (
            <button
              key={st.title}
              type="button"
              data-action={"learnStep:" + i}
              aria-current={here ? "step" : undefined}
              title={learned.total ? tr("{0} / {1} learned", { 0: learned.learned, 1: plural(learned.total, "alg") }) : undefined}
              onClick={run("learnStep:" + i)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                here && "bg-primary/12 text-foreground hover:bg-primary/15",
              )}
            >
              <StepRing done={done} share={share} current={here} neutral={!learned.total} />
              {said(st.title)}
            </button>
          );
        })}
      </div>
      {!s.learnFinished && (
        <div className="flex shrink-0 items-center gap-2">
          {train && (
            <Button action={train} icon={Timer} variant="outline">
              {tr("Train")}
            </Button>
          )}
          {last ? (
            <Button action="learnFinish" icon={Flag} variant="default" className="px-4">
              {tr("Finish")}
            </Button>
          ) : (
            <Button action={"learnStep:" + (entry.step + 1)} variant="default" className="px-4">
              {tr("Next step")}
              <ChevronRight />
            </Button>
          )}
        </div>
      )}
    </nav>
    {/* The step's algorithms: how many are learned, the notation, hiding the learned ones and the set (StepBody). */}
    <div ref={tools} className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-1.5 empty:hidden" />
    </div>
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
        className={cn(
          "flex shrink-0 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
          touch ? "min-h-14 px-3 active:bg-muted/50" : "px-2.5 py-2",
          here && "bg-muted hover:bg-muted",
        )}
      >
        <StepMark done={learned.total > 0 && learned.learned === learned.total} current={here} neutral={!learned.total} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-medium", touch ? "text-[15px]" : "text-sm")}>
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
function StepFooter({ method, entry, train, touch = true }: { method: SolvingMethod; entry: CourseEntry; train?: string; touch?: boolean }) {
  const last = entry.step === method.steps.length - 1,
    next = method.steps[entry.step + 1];
  return (
    <footer className={cn("flex shrink-0 items-center gap-2", touch ? "border-t bg-muted/30 px-2 py-2" : "border-t px-1 pt-3")} data-no-timer>
      <Button action="previous" icon={ChevronLeft} variant="ghost" size={touch ? "lg" : "default"} disabled={entry.step === 0} className={cn("text-muted-foreground", touch && "h-11")}>
        {tr("Previous")}</Button>
      {touch && train && <Button action={train} icon={Timer} variant="ghost" size="lg" className="h-11 text-muted-foreground">{tr("Train")}</Button>}
      {last ? (
        <Button action="learnFinish" icon={Flag} variant="default" size="lg" className={cn("ml-auto px-4", touch && "h-12 flex-1")}>
          {tr("Finish")}</Button>
      ) : touch ? (
        <Button action={"learnStep:" + (entry.step + 1)} variant="default" size="lg" className="ml-auto h-12 min-w-0 flex-1 justify-between gap-2 px-3 text-left">
          <span className="truncate">{tr("Next ·")}{" "}{said(next!.title)}</span>
          <ChevronRight />
        </Button>
      ) : (
        <Button action={"learnStep:" + (entry.step + 1)} variant="default" size="lg" className="ml-auto max-w-[min(100%,28rem)] min-w-0 px-4">
          <span className="opacity-75">{tr("Next ·")}</span>
          <span className="truncate">{said(next!.title)}</span>
          <ChevronRight />
        </Button>
      )}
    </footer>
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
        <span className={LABEL}>
          {said(puzzleInfo(puzzle).label)} · {said(LEVEL_LABEL[method.level])}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">{said(method.name)} {" "}{tr("done")}</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {tr("You have been through every step of")}{" "}{said(method.name)}{tr(". Solve with it on the timer until it flows, then try a faster method.")}</p>
      </div>
      <div className="flex gap-10">
        <Figure label={tr("Steps")} value={`${method.steps.length} / ${method.steps.length}`} size="2xl" tone="good" />
        {total > 0 && <Figure label={tr("Algorithms learned")} value={`${learned} / ${total}`} size="2xl" />}
      </div>
      <div className={cn("flex gap-2", touch ? "flex-col" : "flex-wrap")}>
        <Button action="nav:playground" icon={Timer} variant="default" size="lg" className={cn("px-4", touch && "h-11")}>
          {tr("Practise with the timer")}</Button>
        <Button action="learnMethods" icon={GraduationCap} variant="outline" size="lg" className={cn("px-4", touch && "h-11")}>
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
    </>
  );
}

/** A case of the step opened over the course: the algorithms page's detail, in a dialog. */
export function CaseDialog() {
  const open = !!s.caseDialog && !!s.find(s.caseDialog);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && void s.action("caseDialog:")}>
      <DialogContent
        className="flex max-h-[min(52rem,calc(100svh-4rem))] flex-col gap-0 overflow-hidden p-5 sm:max-w-4xl"
        // The arrows step through the case's set, like the algorithms page; the course's own arrows wait behind.
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          e.stopPropagation();
          void s.action("caseStep:" + (e.key === "ArrowLeft" ? "previous" : "next"));
        }}
      >
        <DialogTitle className="sr-only">{said(s.caseDialog)}</DialogTitle>
        {open && <CaseDetail key={s.caseDialog} id={s.caseDialog} dialog />}
      </DialogContent>
    </Dialog>
  );
}

function DesktopCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  // The step's tools go in the box of the steps, under them (see StepBody).
  const [tools, setTools] = useState<HTMLDivElement | null>(null);
  const progress = methodProgress(s.course, puzzle, method, s.cases(), s.learned);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Button action="learnMethods" icon={ChevronLeft} tip={tr("Every method")} className="size-8 max-md:size-10" />}
        title={said(method.name)}
        sub={tr("{0} · {1} · {2} of {3} steps learned", { 0: puzzleInfo(puzzle).label, 1: LEVEL_LABEL[method.level], 2: progress.done, 3: progress.total })}
      />
      <StepBar puzzle={puzzle} method={method} entry={entry} tools={setTools} />
      {s.learnFinished ? (
        <Finished puzzle={puzzle} method={method} />
      ) : (
        // The step holds the page's height: its title and explanation stay, its algorithms scroll (StepBody).
        <div key={entry.step} className="flex min-h-0 flex-1 flex-col gap-5 pt-1">
          <StepBody puzzle={puzzle} method={method} entry={entry} tools={tools} />
        </div>
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
        lead={<Button action="learnMethods" icon={ChevronLeft} tip={tr("Every method")} className="size-8 max-md:size-10" />}
        title={said(method.name)}
        sub={tr("{0} · {1} of {2} steps learned", { 0: puzzleInfo(puzzle).label, 1: progress.done, 2: progress.total })}
      />
      <Surface className="flex-1">
        <button
          type="button"
          data-action="learnSteps"
          aria-haspopup="dialog"
          onClick={() => setSteps(true)}
          className="flex min-h-14 shrink-0 items-center gap-3 border-b px-4 text-left outline-none active:bg-muted/50"
        >
          <StepMark done={s.learnFinished || done} current={!s.learnFinished && !done} />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-[15px] font-medium">{s.learnFinished ? tr("{0} done", { 0: method.name }) : step.title}</span>
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
            <StepFooter method={method} entry={entry} train={train} touch />
          </>
        )}
      </Surface>
      <PhoneSheet open={steps} onOpenChange={setSteps} title={tr("Steps")} description={tr("{0} of {1} steps learned", { 0: progress.done, 1: progress.total })} className="gap-0 px-2">
        <StepRows method={method} entry={entry} touch onPick={() => setSteps(false)} />
      </PhoneSheet>
    </div>
  );
}
