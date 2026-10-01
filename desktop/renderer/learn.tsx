/**
 * Learn: a whole solving method, step by step. First the methods of the puzzle, then the chosen one as a course: its
 * steps in a box on the left, the current step on the page with its explanation, its tips and every algorithm it
 * teaches. Phones get the list as large rows, then the course with its steps in a sheet and its actions under the thumb.
 */
import { useState } from "react";
import { BookA, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Circle, Flag, GraduationCap, Info, Play, Timer } from "lucide-react";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../src/shared/methods";
import { applyAlg, solved } from "../../src/shared/cube";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { viewForMask } from "../../src/shared/cubeDiagram";
import { displayAlg, maskForStage, shortId } from "../../src/client/lib/caseState";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, firstOpenSet, methodFacts, methodProgress, recommendedMethod, setGroups, stepId, stepLearned, stepSets,
  type CourseEntry,
} from "../../src/client/lib/course";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { store as s, type PlayItem } from "./store";
import { PhoneSheet } from "./phone";
import { ActionToggle, Alg, Bar, Button, Choice, Diagram, Figure, Icon, LABEL, NUMERIC, PAGE, PageHead, PuzzleButton, Surface, Tip, plural, run, usePhone } from "./ui";
import { cn } from "@/lib/utils";

export function Learn() {
  const course = s.learning;
  return course ? <Course method={course.method} entry={course.entry} puzzle={course.puzzle} /> : <Methods />;
}

/**
 * Where a step stands, as a passive mark: a green disc with a check once done, a ring around a dot for the step
 * shown, a quiet dashed circle before.
 */
function StepMark({ done, current = false, className }: { done: boolean; current?: boolean; className?: string }) {
  const label = done ? "Done" : current ? "Current step" : "To do";
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center", done ? "text-success" : current ? "text-primary" : "text-muted-foreground/50", className)} aria-label={label} role="img">
      {done ? (
        <span className="flex size-3.5 items-center justify-center rounded-full bg-current">
          <Check className="size-2.5 text-background" strokeWidth={3.5} />
        </span>
      ) : current ? (
        <span className="flex size-3.5 items-center justify-center rounded-full border-[1.5px] border-current">
          <span className="size-1.5 rounded-full bg-current" />
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
                <span className={cn(NUMERIC, "w-5 shrink-0 pt-px text-sm text-muted-foreground")}>{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{step.title}</span>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
                <span className={cn(NUMERIC, "shrink-0 pt-px text-xs text-muted-foreground")}>{count ? plural(count, "alg") : "Intuitive"}</span>
                <StepMark done={!!done} />
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
      <PageHead title="Learn" sub={`Choose a ${label} method`} puzzle />
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

/** One algorithm of a step, from the catalogue or the step's own; `play` when the 3D player can show it. */
type Item = { key: string; name: string; detail?: string; alg: string; alternatives: string[]; note?: string; learned: boolean; action: string; diagram: React.ReactNode; play?: PlayItem };

function catalogItem(c: any, context: string): Item {
  // The 3×3 cases go by their number (OLL 21 → 21, its name beside); the other puzzles' by their name.
  const name = c.puzzle_id || c.cube_size ? c.name : shortId(c),
    algs = c.algorithms.map(displayAlg),
    size = c.diagram ? null : (c.cube_size ?? puzzleInfo(s.puzzle as PuzzleId).cubeSize);
  const detail = c.name !== c.id && c.name !== name ? c.name : undefined;
  return {
    key: c.id,
    name,
    detail,
    alg: algs[0],
    alternatives: algs.slice(1),
    note: c.notes,
    learned: s.learned.has(c.id),
    action: "learn:" + c.id,
    diagram: <Diagram c={c} size={64} />,
    play: size ? { key: c.id, name, detail, context, algs, note: c.notes, size, mask: maskForStage(c.stage) } : undefined,
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
      {learned ? "Learned" : "Mark learned"}
    </ActionToggle>
  );
}

/**
 * One algorithm: its case (a click plays it in 3D), its name, the algorithm, how to hold the cube, its alternatives,
 * then its learned toggle.
 */
function AlgRow({ item, items, touch = false }: { item: Item; items: Item[]; touch?: boolean }) {
  const [open, setOpen] = useState(false);
  const playable = items.filter((i) => i.play),
    play = item.play ? () => s.openAlg(playable.map((i) => i.play!), playable.indexOf(item)) : undefined;
  const toggle = (
    <div className={cn("flex shrink-0 items-center", touch && "justify-end pt-1")}>
      <LearnToggle action={item.action} learned={item.learned} touch={touch} />
    </div>
  );
  return (
    <div className={cn("group/row -mx-2 flex items-start gap-5 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40", touch && "gap-4 pr-0 hover:bg-transparent")}>
      {play ? (
        <Tip content="Play in 3D">
          <button
            type="button"
            data-play={item.key}
            aria-label={`Play ${item.name} in 3D`}
            onClick={play}
            className="relative shrink-0 cursor-pointer self-center rounded-md outline-none ring-ring/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-2 focus-visible:ring-2"
          >
            {item.diagram}
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground" aria-hidden="true">
              <Play className="size-2.5 fill-current" />
            </span>
          </button>
        </Tip>
      ) : (
        <span className="shrink-0 self-center">{item.diagram}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-sans text-sm font-medium">{item.name}</span>
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
        {touch && toggle}
      </div>
      {!touch && <div className="self-center">{toggle}</div>}
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
  const catalogue = groups.map(([group, members]) => [group, members.map((c: any) => catalogItem(c, [chosen?.label, groups.length > 1 && group].filter(Boolean).join(" · ")))] as const),
    items = [...inline, ...catalogue.flatMap(([, list]) => list)];
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
            <button
              type="button"
              data-action="notation"
              onClick={run("notation")}
              className={cn("-mx-1 flex items-center gap-1 rounded-md px-1 text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50", touch && "min-h-9")}
            >
              <BookA className="size-3.5" />
              Notation
            </button>
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
          {inline.map((item) => <AlgRow key={item.key} item={item} items={items} touch={touch} />)}
          {catalogue.map(([group, list]) => (
            <div key={group} className="flex flex-col pt-2">
              {(groups.length > 1 || sets.length === 1) && <h4 className={cn(LABEL, "py-1")}>{groups.length > 1 ? group : chosen.label}</h4>}
              {list.map((item) => <AlgRow key={item.key} item={item} items={items} touch={touch} />)}
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

/** The steps of a course as rows: their mark, number, title and algorithms; a click shows the step. */
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
        <StepMark done={entry.done.includes(stepId(st))} current={here} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-medium", touch ? "text-[15px]" : "text-sm")}>
            <span className="text-muted-foreground">{i + 1}</span> {st.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {learned.total ? `${learned.learned} / ${plural(learned.total, "alg")} learned` : st.missing ? "Algorithms to come" : "Intuitive"}
          </span>
        </span>
      </button>
    );
  });
}

/**
 * Where a step leaves you: Previous quietly on the left; Next step on the right, which marks this step done and
 * shows the next; Finish on the last step, which completes the method.
 */
function StepFooter({ method, entry, train, touch = false }: { method: SolvingMethod; entry: CourseEntry; train?: string; touch?: boolean }) {
  const last = entry.step === method.steps.length - 1,
    next = method.steps[entry.step + 1];
  return (
    <footer className={cn("flex shrink-0 items-center gap-2", touch ? "border-t bg-muted/30 px-2 py-2" : "border-t px-1 pt-3")} data-no-timer>
      <Button action="previous" icon={ChevronLeft} variant="ghost" size={touch ? "lg" : "default"} disabled={entry.step === 0} className={cn("text-muted-foreground", touch && "h-11")}>
        Previous
      </Button>
      {touch && train && <Button action={train} icon={Timer} variant="ghost" size="lg" className="h-11 text-muted-foreground">Train</Button>}
      {last ? (
        <Button action="learnFinish" icon={Flag} variant="default" size="lg" className={cn("ml-auto px-4", touch && "h-12 flex-1")}>
          Finish
        </Button>
      ) : touch ? (
        <Button action="learnNext" variant="default" size="lg" className="ml-auto h-12 min-w-0 flex-1 justify-between gap-2 px-3 text-left">
          <span className="truncate">Next · {next!.title}</span>
          <ChevronRight />
        </Button>
      ) : (
        <Button action="learnNext" variant="default" size="lg" className="ml-auto max-w-[min(100%,28rem)] min-w-0 px-4">
          <span className="opacity-75">Next ·</span>
          <span className="truncate">{next!.title}</span>
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
          {puzzleInfo(puzzle).label} · {LEVEL_LABEL[method.level]}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">{method.name} done</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          You have been through every step of {method.name}. Solve with it on the timer until it flows, then try a faster method.
        </p>
      </div>
      <div className="flex gap-10">
        <Figure label="Steps" value={`${method.steps.length} / ${method.steps.length}`} size="2xl" tone="good" />
        {total > 0 && <Figure label="Algorithms learned" value={`${learned} / ${total}`} size="2xl" />}
      </div>
      <div className={cn("flex gap-2", touch ? "flex-col" : "flex-wrap")}>
        <Button action="nav:playground" icon={Timer} variant="default" size="lg" className={cn("px-4", touch && "h-11")}>
          Practise with the timer
        </Button>
        <Button action="learnMethods" icon={GraduationCap} variant="outline" size="lg" className={cn("px-4", touch && "h-11")}>
          Learn another method
        </Button>
      </div>
    </div>
  );
}

/** A course: its steps in a box, the current one on the page, Previous and Next step under it. */
function Course({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const phone = usePhone();
  if (phone) return <PhoneCourse puzzle={puzzle} method={method} entry={entry} />;
  const progress = methodProgress(s.course, puzzle, method),
    step = method.steps[entry.step]!,
    train = trainAction(puzzle, method, entry);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Button action="learnMethods" icon={ChevronLeft} tip="Every method" className="size-8 max-md:size-10" />}
        title={method.name}
        sub={`${puzzleInfo(puzzle).label} · ${LEVEL_LABEL[method.level]} · ${progress.done} of ${progress.total} steps done`}
      />
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <nav aria-label="Steps" className="flex w-72 shrink-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-2 pt-3">
          <div className="flex flex-col gap-2 px-2.5">
            <div className="flex items-baseline justify-between">
              <span className={LABEL}>Steps</span>
              <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                {progress.done} / {progress.total}
              </span>
            </div>
            <Bar ratio={progress.done / progress.total} />
          </div>
          <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
            <StepRows method={method} entry={entry} />
          </div>
        </nav>
        {/* The steps are the box; the current one sits on the page. */}
        {s.learnFinished ? (
          <Finished puzzle={puzzle} method={method} />
        ) : (
          <div key={entry.step} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Its algorithm rows reach 8px past their text (-mx-2): the column's padding holds them, so nothing scrolls sideways. */}
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 pt-1 pb-6">
              <header className="flex items-center gap-4">
                <div className="flex min-w-0 flex-1 items-baseline gap-3">
                  <h2 className="min-w-0 truncate font-sans text-xl font-semibold tracking-tight">{step.title}</h2>
                  <span className={cn(LABEL, "shrink-0")}>
                    {entry.step + 1} / {method.steps.length}
                  </span>
                </div>
                {train && (
                  <Button action={train} icon={Timer} variant="outline">
                    Train this step
                  </Button>
                )}
              </header>
              <StepBody puzzle={puzzle} method={method} entry={entry} />
            </div>
            <StepFooter method={method} entry={entry} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Phones: the course as a page of its own, back to the methods in the header. The step chooser opens the steps in a
 * sheet; Previous, Train and Next step stay at the bottom, under the thumb.
 */
function PhoneCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const [steps, setSteps] = useState(false),
    progress = methodProgress(s.course, puzzle, method),
    step = method.steps[entry.step]!,
    done = entry.done.includes(stepId(step)),
    train = trainAction(puzzle, method, entry);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Button action="learnMethods" icon={ChevronLeft} tip="Every method" className="size-8 max-md:size-10" />}
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
          <StepMark done={s.learnFinished || done} current={!s.learnFinished && !done} />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-[15px] font-medium">{s.learnFinished ? `${method.name} done` : step.title}</span>
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
      <PhoneSheet open={steps} onOpenChange={setSteps} title="Steps" description={`${progress.done} of ${progress.total} done`} className="gap-0 px-2">
        <StepRows method={method} entry={entry} touch onPick={() => setSteps(false)} />
      </PhoneSheet>
    </div>
  );
}
