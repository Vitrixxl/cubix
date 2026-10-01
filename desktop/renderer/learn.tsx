/**
 * Learn: a whole solving method, step by step. First the methods of the puzzle, then the chosen one as a course: its
 * steps in a box on the left, the current step on the page with its explanation, its tips and every algorithm it
 * teaches. Phones get the list as large rows, then the course with its steps in a sheet and its actions under the thumb.
 */
import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Circle, Info, Play, Timer } from "lucide-react";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../src/shared/methods";
import { applyAlg, solved } from "../../src/shared/cube";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { viewForMask } from "../../src/shared/cubeDiagram";
import { displayAlg, shortId } from "../../src/client/lib/caseState";
import {
  LEVEL_LABEL, algId, algSetup, firstOpenSet, methodFacts, methodProgress, recommendedMethod, setGroups, stepId, stepLearned, stepSets,
  type CourseEntry,
} from "../../src/client/lib/course";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { store as s } from "./store";
import { PhoneSheet, TouchAction, TouchBar } from "./phone";
import { ActionToggle, Alg, Bar, Button, Choice, Diagram, Figure, Icon, LABEL, LearnedMark, MONO, PAGE, PageHead, PuzzleButton, Surface, plural, run, usePhone } from "./ui";
import { cn } from "@/lib/utils";

export function Learn() {
  const course = s.learning;
  return course ? <Course method={course.method} entry={course.entry} puzzle={course.puzzle} /> : <Methods />;
}

/** A step's state as a round mark: a green disc with a check once done, a quiet dashed circle before. */
function StatusMark({ done, className }: { done: boolean; className?: string }) {
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center", done ? "text-success" : "text-muted-foreground/50", className)} aria-label={done ? "Done" : "Not done"} role="img">
      {done ? (
        <span className="flex size-3.5 items-center justify-center rounded-full bg-current">
          <Check className="size-2.5 text-background" strokeWidth={3.5} />
        </span>
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
    <span className="flex h-3.5 items-end gap-[3px]" role="img" aria-label={LEVEL_LABEL[level]}>
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
    progress: methodProgress(progress, puzzle, method),
    recommended: method.id === recommended,
  }));
}
type MethodRow = ReturnType<typeof methodRows>[number];

const methodDetail = (row: MethodRow) =>
  `${LEVEL_LABEL[row.method.level]} · ${plural(row.facts.steps, "step")}` + (row.progress.started ? ` · ${row.progress.done} / ${row.progress.total} done` : "");

/** The methods of the puzzle: a box on the left, the one highlighted beside it with its steps and its start. */
function Methods() {
  const puzzle = s.puzzle as PuzzleId,
    rows = methodRows(puzzle),
    label = puzzleInfo(puzzle).label;
  if (usePhone()) return <PhoneMethods rows={rows} label={label} />;
  const current = rows.find((r) => r.method.id === s.learnPick) ?? rows.find((r) => r.method.id === s.course.methods[puzzle] && r.progress.started) ?? rows.find((r) => r.recommended) ?? rows[0]!;
  return (
    <div className={PAGE}>
      <PageHead title="Learn" sub="Choose a method, then follow it step by step">
        <PuzzleButton />
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <nav aria-label="Methods" className="flex w-72 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-xl border bg-card p-2">
          {rows.map((row) => {
            return (
            <button
              key={row.method.id}
              type="button"
              data-action={"learnPick:" + row.method.id}
              aria-current={row === current ? "true" : undefined}
              onClick={run("learnPick:" + row.method.id)}
              onDoubleClick={run("learnMethod:" + row.method.id)}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                row === current && "bg-muted hover:bg-muted",
              )}
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground", row === current && "bg-primary/15 text-primary")}>
                <LevelBars level={row.method.level} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{row.method.name}</span>
                <span className="truncate text-xs text-muted-foreground">{methodDetail(row)}</span>
              </span>
            </button>
            );
          })}
        </nav>
        {/* The methods are the box; the one highlighted sits on the page. */}
        <MethodDetail key={current.method.id} row={current} label={label} />
      </div>
    </div>
  );
}

function MethodDetail({ row, label }: { row: MethodRow; label: string }) {
  const { method, facts, progress } = row;
  const action = "learnMethod:" + method.id;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1 pt-1 pb-6">
        <header className="flex max-w-2xl flex-col gap-1.5">
          <span className={LABEL}>
            {label} · {LEVEL_LABEL[method.level]}
            {row.recommended && <span className="text-primary"> · Recommended to start</span>}
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">{method.name}</h2>
          <p className="text-sm text-muted-foreground">{method.summary}</p>
        </header>
        <div className="flex gap-10 md:gap-12">
          <Figure label="Steps" value={facts.steps} size="2xl" />
          <Figure label="Algorithms" value={facts.algorithms} size="2xl" />
          <Figure label="Done" value={progress.started ? `${progress.done} / ${progress.total}` : "–"} size="2xl" />
        </div>
        <section className="flex max-w-2xl flex-col gap-1" aria-label="Steps">
          <h3 className={cn(LABEL, "pb-1")}>Steps</h3>
          {method.steps.map((step, i) => {
            const count = stepCount(step),
              done = progress.started && s.course.courses[`${s.puzzle}:${method.id}`]?.done.includes(stepId(step));
            return (
              <div key={step.title} className="flex items-start gap-3 py-1.5">
                <span className={cn(MONO, "w-5 shrink-0 pt-px text-sm text-muted-foreground")}>{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{step.title}</span>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
                <span className={cn(MONO, "shrink-0 pt-px text-xs text-muted-foreground")}>{count ? plural(count, "alg") : "Intuitive"}</span>
                <StatusMark done={!!done} />
              </div>
            );
          })}
        </section>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t px-1 pt-3">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {progress.started ? `Step ${progress.step + 1} of ${progress.total}: ${method.steps[progress.step]!.title}` : `${plural(facts.algorithms, "algorithm")} over ${plural(facts.steps, "step")}`}
        </span>
        <Button action={action} variant="default" size="lg" icon={Play} className="px-4">
          {progress.started ? "Continue" : "Start"}
        </Button>
      </footer>
    </div>
  );
}

/** How many algorithms a step teaches on the current puzzle. */
const stepCount = (step: MethodStep) => (step.algs?.length ?? 0) + stepSets(step, s.allSets(), s.puzzle as PuzzleId).reduce((sum, set: any) => sum + set.count, 0);

/** Phones: the methods as large rows; a row opens its course. */
function PhoneMethods({ rows, label }: { rows: MethodRow[]; label: string }) {
  return (
    <div className={PAGE}>
      <PageHead title="Learn" puzzle />
      <p className="-mt-1 text-sm text-muted-foreground">Choose a {label} method, then follow it step by step.</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Surface className="shrink-0">
          <nav aria-label="Methods" className="flex flex-col">
            {rows.map((row, i) => {
              return (
              <button
                key={row.method.id}
                type="button"
                data-action={"learnMethod:" + row.method.id}
                onClick={run("learnMethod:" + row.method.id)}
                className={cn("flex min-h-16 items-start gap-3 px-4 py-3.5 text-left outline-none active:bg-muted/50", i > 0 && "border-t")}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", (row.recommended || row.progress.started) && "bg-primary/15 text-primary")}>
                  <LevelBars level={row.method.level} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-medium">{row.method.name}</span>
                    <span className={cn("shrink-0 text-xs", row.recommended ? "text-primary" : "text-muted-foreground")}>{row.recommended ? "Recommended" : LEVEL_LABEL[row.method.level]}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {plural(row.facts.steps, "step")} · {plural(row.facts.algorithms, "alg")}
                    {row.progress.started && ` · ${row.progress.done} / ${row.progress.total} done`}
                  </span>
                  <span className="line-clamp-2 font-sans text-[13px] leading-snug text-muted-foreground">{row.method.summary}</span>
                  {row.progress.started && <Bar ratio={row.progress.done / row.progress.total} className="mt-1 max-w-48" />}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 self-center text-sm font-medium text-primary">
                  {row.progress.started ? "Continue" : "Start"}
                  <ChevronRight className="size-4" />
                </span>
              </button>
              );
            })}
          </nav>
        </Surface>
      </div>
    </div>
  );
}

/** One algorithm of a step, from the catalogue or the step's own. */
type Item = { key: string; name: string; detail?: string; alg: string; alternatives: string[]; note?: string; learned: boolean; action: string; diagram: React.ReactNode };

function catalogItem(c: any): Item {
  // The 3×3 cases go by their number (OLL 21 → 21, its name beside); the other puzzles' by their name.
  const name = c.puzzle_id || c.cube_size ? c.name : shortId(c);
  return {
    key: c.id,
    name,
    detail: c.name !== c.id && c.name !== name ? c.name : undefined,
    alg: displayAlg(c.algorithms[0]),
    alternatives: c.algorithms.slice(1).map(displayAlg),
    note: c.notes,
    learned: s.learned.has(c.id),
    action: "learn:" + c.id,
    diagram: <Diagram c={c} size={64} />,
  };
}

/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their icon. */
function InlineDiagram({ puzzle, step, a, size }: { puzzle: PuzzleId; step: MethodStep; a: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize,
    mask = step.mask ?? "full";
  if (!cube) return <span className="flex shrink-0 items-center justify-center text-muted-foreground/60" style={{ width: size, height: size }}><Icon name={"Puzzle" + puzzle} size={size * 0.55} /></span>;
  return <StaticCubeSvg state={applyAlg(solved(cube), algSetup(a))} size={size} mask={mask} view={viewForMask(mask)} className="shrink-0" />;
}

function inlineItem(puzzle: PuzzleId, step: MethodStep, a: MethodAlgorithm, entry: CourseEntry): Item {
  const id = algId(step, a);
  return {
    key: id,
    name: a.name,
    alg: a.alg,
    alternatives: a.alternatives ?? [],
    note: a.note,
    learned: entry.learned.includes(id),
    action: "learnAlg:" + id,
    diagram: <InlineDiagram puzzle={puzzle} step={step} a={a} size={64} />,
  };
}

function AlgRow({ item, touch = false }: { item: Item; touch?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("group/row -mx-2 flex items-start gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40", touch && "gap-3 pr-0 hover:bg-transparent")}>
      {item.diagram}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-mono text-sm font-medium">{item.name}</span>
          {item.detail && <span className="truncate text-xs text-muted-foreground">{item.detail}</span>}
        </div>
        <Alg text={item.alg} size={touch ? 16 : 17} />
        {item.note && <p className="text-xs leading-relaxed text-muted-foreground">{item.note}</p>}
        {item.alternatives.length > 0 && (
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
            {open && item.alternatives.map((alt, i) => <Alg key={i} text={alt} size={14} className="text-muted-foreground" />)}
          </div>
        )}
      </div>
      <LearnedMark id={item.key} learned={item.learned} action={item.action} touch={touch} />
    </div>
  );
}

/** The step's content: its explanation and tips, its sets, then every algorithm it teaches. */
function StepBody({ puzzle, method, entry, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const step = method.steps[entry.step]!,
    cases = s.cases(),
    sets = stepSets(step, s.allSets(), puzzle) as any[];
  const chosen = sets.find((set) => set.id === s.learnSets[`${puzzle}:${method.id}:${entry.step}`]) ?? firstOpenSet(sets, cases, s.learned),
    groups = chosen ? setGroups(cases, chosen.id) : [],
    inline = (step.algs ?? []).map((a) => inlineItem(puzzle, step, a, entry)),
    count = stepLearned(step, cases, s.learned, entry);
  return (
    <>
      <div className="flex max-w-2xl flex-col gap-4">
        <p className="text-[15px] leading-relaxed text-foreground/85">{step.text}</p>
        {!!step.tips?.length && (
          <section className="flex flex-col gap-1.5" aria-label="Tips">
            <h3 className={LABEL}>Tips</h3>
            <ul className="flex flex-col gap-1.5">
              {step.tips.map((tip) => (
                <li key={tip} className="flex gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        )}
        {step.missing && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            {step.missing}
          </p>
        )}
      </div>
      {count.total > 0 && (
        <section className="flex max-w-4xl flex-col" aria-label="Algorithms">
          <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2 pb-1">
            <h3 className={LABEL}>
              Algorithms <span className="font-normal">{count.learned} / {count.total} learned</span>
            </h3>
            {sets.length > 1 && (
              <Choice
                prefix="learnSet:"
                label="Set"
                value={chosen.id}
                options={sets.map((set) => ({ id: set.id, label: set.label, count: set.count }))}
                className="flex-wrap"
              />
            )}
          </div>
          {inline.map((item) => <AlgRow key={item.key} item={item} touch={touch} />)}
          {groups.map(([group, members]) => (
            <div key={group} className="flex flex-col pt-2">
              {(groups.length > 1 || sets.length === 1) && <h4 className={cn(LABEL, "py-1")}>{groups.length > 1 ? group : chosen.label}</h4>}
              {members.map((c: any) => <AlgRow key={c.id} item={catalogItem(c)} touch={touch} />)}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** The set Train this step starts on: the one shown. */
function trainAction(puzzle: PuzzleId, method: SolvingMethod, entry: CourseEntry) {
  const sets = stepSets(method.steps[entry.step]!, s.allSets(), puzzle) as any[];
  const chosen = sets.find((set) => set.id === s.learnSets[`${puzzle}:${method.id}:${entry.step}`]) ?? firstOpenSet(sets, s.cases(), s.learned);
  return chosen ? "train:" + chosen.id : "";
}

/** A course: its steps in a box, the current one on the page. */
function Course({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const phone = usePhone();
  if (phone) return <PhoneCourse puzzle={puzzle} method={method} entry={entry} />;
  const progress = methodProgress(s.course, puzzle, method),
    step = method.steps[entry.step]!,
    done = entry.done.includes(stepId(step)),
    train = trainAction(puzzle, method, entry),
    cases = s.cases(),
    next = method.steps[entry.step + 1];
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Button action="learnMethods" icon={ChevronLeft} tip="Every method" className="-ml-2 size-10" />}
        title={method.name}
        sub={`${puzzleInfo(puzzle).label} · ${LEVEL_LABEL[method.level]} · ${progress.done} of ${progress.total} steps done`}
      />
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <nav aria-label="Steps" className="flex w-72 shrink-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-2 pt-3">
          <div className="flex flex-col gap-2 px-2.5">
            <div className="flex items-baseline justify-between">
              <span className={LABEL}>Steps</span>
              <span className={cn(MONO, "text-xs text-muted-foreground")}>
                {progress.done} / {progress.total}
              </span>
            </div>
            <Bar ratio={progress.done / progress.total} />
          </div>
          <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
            {method.steps.map((st, i) => {
              const learned = stepLearned(st, cases, s.learned, entry),
                here = i === entry.step;
              return (
                <button
                  key={st.title}
                  type="button"
                  data-action={"learnStep:" + i}
                  aria-current={here ? "step" : undefined}
                  onClick={run("learnStep:" + i)}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                    here && "bg-muted hover:bg-muted",
                  )}
                >
                  <StatusMark done={entry.done.includes(stepId(st))} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      <span className="text-muted-foreground">{i + 1}</span> {st.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {learned.total ? `${learned.learned} / ${plural(learned.total, "alg")} learned` : st.missing ? "Algorithms to come" : "Intuitive"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
        {/* The steps are the box; the current one sits on the page. */}
        {/* Its algorithm rows reach 8px past their text (-mx-2): the column's padding holds them, so nothing scrolls sideways. */}
        <div key={entry.step} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-2 pt-1 pb-6">
          <header className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={LABEL}>
                  Step {entry.step + 1} of {method.steps.length}
                </span>
                <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button action="previous" icon={ChevronLeft} size="icon-sm" disabled={entry.step === 0} tip="Previous step (←)" />
                <span className={cn(MONO, "min-w-12 text-center text-xs text-muted-foreground")}>
                  {entry.step + 1} / {method.steps.length}
                </span>
                <Button action="next" icon={ChevronRight} size="icon-sm" disabled={!next} tip="Next step (→)" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {train && (
                <Button action={train} icon={Timer} variant="default">
                  Train this step
                </Button>
              )}
              <ActionToggle action="learnDone" pressed={done} icon={Check} className="aria-pressed:bg-success/15 aria-pressed:text-success">
                {done ? "Step done" : "Mark step done"}
              </ActionToggle>
            </div>
          </header>
          <StepBody puzzle={puzzle} method={method} entry={entry} />
          {next && (
            <div className="flex">
              <Button action="next" variant="outline" className="gap-2">
                <span className="text-muted-foreground">Next</span> {next.title}
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Phones: the course as a page of its own, back to the methods in the header. The step chooser opens the steps in a
 * sheet; Previous, Train, Done and Next stay at the bottom, under the thumb.
 */
function PhoneCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const [steps, setSteps] = useState(false),
    progress = methodProgress(s.course, puzzle, method),
    step = method.steps[entry.step]!,
    done = entry.done.includes(stepId(step)),
    train = trainAction(puzzle, method, entry),
    cases = s.cases();
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Button action="learnMethods" icon={ChevronLeft} tip="Every method" className="-ml-2 size-10" />}
        title={method.name}
        sub={`${puzzleInfo(puzzle).label} · ${progress.done} of ${progress.total} steps done`}
      />
      <Surface className="flex-1">
        <button
          type="button"
          data-action="learnSteps"
          aria-haspopup="dialog"
          onClick={() => setSteps(true)}
          className="flex min-h-14 shrink-0 items-center gap-3 border-b px-4 text-left outline-none active:bg-muted/50"
        >
          <StatusMark done={done} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-medium">{step.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              Step {entry.step + 1} of {method.steps.length}
            </span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
        <div key={entry.step} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-6">
          <StepBody puzzle={puzzle} method={method} entry={entry} touch />
        </div>
        <TouchBar className="shrink-0 border-t bg-muted/30 px-2 py-2">
          <TouchAction action="previous" icon={ChevronLeft} label="Previous" disabled={entry.step === 0} />
          {train && <TouchAction action={train} icon={Timer} label="Train" primary />}
          <TouchAction action="learnDone" icon={Check} label={done ? "Done" : "Mark done"} pressed={done} tone="good" />
          <TouchAction action="next" icon={ChevronRight} label="Next" disabled={entry.step === method.steps.length - 1} />
        </TouchBar>
      </Surface>
      <PhoneSheet open={steps} onOpenChange={setSteps} title="Steps" description={`${progress.done} of ${progress.total} done`} className="gap-0 px-2">
        {method.steps.map((st, i) => {
          const learned = stepLearned(st, cases, s.learned, entry);
          return (
            <button
              key={st.title}
              type="button"
              data-action={"learnStep:" + i}
              aria-current={i === entry.step ? "step" : undefined}
              onClick={(e) => {
                setSteps(false);
                run("learnStep:" + i)(e);
              }}
              className={cn("flex min-h-14 shrink-0 items-center gap-3 rounded-lg px-3 text-left outline-none active:bg-muted/50", i === entry.step && "bg-muted")}
            >
              <StatusMark done={entry.done.includes(stepId(st))} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">
                  <span className="text-muted-foreground">{i + 1}</span> {st.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {learned.total ? `${learned.learned} / ${plural(learned.total, "alg")} learned` : st.missing ? "Algorithms to come" : "Intuitive"}
                </span>
              </span>
            </button>
          );
        })}
      </PhoneSheet>
    </div>
  );
}
