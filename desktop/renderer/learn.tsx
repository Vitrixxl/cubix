/**
 * Learn: the methods of the puzzle, the chosen one large beside the list; then the chosen one as a course: its steps as
 * a track across the top, and the step in three columns: what it teaches to pick from, a workbench with one case at a
 * time (its algorithm hidden until asked for in Review, then how the try went), and the step's sheet.
 * Phones get the course with its steps in a sheet and its actions under the thumb.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { orderedGroups } from "../../src/client/lib/dailyLearning";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Dumbbell, Eye, EyeOff, Flag, GraduationCap, Info, Lightbulb, Lock, Route, Timer, type LucideIcon } from "lucide-react";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../src/shared/methods";
import { applyAlg, solved } from "../../src/shared/cube";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { Link } from "react-router";
import { pageUrl } from "./navigation";
import { viewForMask, type CubeMask } from "../../src/shared/cubeDiagram";
import { PlayerAlg, PlayerControls, PlayerCube, useAlgPlayer } from "./AlgPlayer";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, stepRead, stepReadKey, toggled, firstOpenSet, methodFacts, methodLearned, methodProgress, methodShare, recommendedMethod, setGroups, stepDone, stepId, stepLearned, stepMastered, stepPicture, stepSets,
  type CourseEntry,
} from "../../src/client/lib/course";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { store as s, type PlayItem } from "./store";
import { PhoneSheet } from "./phone";
import { ActionCard, ActionToggle, Alg, Back, Bar, Button, Choice, DOT, Diagram, Empty, FOCUS, Icon, LearnToggle, Modal, NUMERIC, PAGE, PageHead, ROW, SectionHead, Segmented, ProgressRing, StatCard, StatusMark, Surface, TILE, Tip, plural, run, usePhone } from "./ui";
import { FootBar, PlayDiagram } from "./algorithms";
import { VirtualList, inRows, useColumns } from "./virtual";
import { caseTitle, casePlayItem, moveCount, shortId } from "../../src/client/lib/caseState";
import { assisted as solvable } from "../../src/client/lib/methodSolver";
import { Kbd } from "@/components/ui/kbd";
import { isPolyPuzzle } from "../../src/shared/puzzleScene";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button as UiButton, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    share: methodShare(method, cases, s.learned, progress, puzzle),
    recommended: method.id === recommended,
  }));
}
type MethodRow = ReturnType<typeof methodRows>[number];

const methodDetail = (row: MethodRow) => `${tr(LEVEL_LABEL[row.method.level])} · ${plural(row.facts.steps, "step")}`;
/** The share of a method's algorithms known, from 0 to 1. */
const knownShare = (row: MethodRow) => (row.facts.algorithms ? row.learned / row.facts.algorithms : 0);

/** The course to carry on: the method opened last if under way, else one under way, else the recommended one. */
function heroRow(puzzle: PuzzleId, rows: MethodRow[]) {
  const last = s.course.methods[puzzle];
  return (
    rows.find((r) => r.method.id === last && r.progress.started && !r.progress.learned) ??
    rows.find((r) => r.progress.started && !r.progress.learned) ??
    rows.find((r) => r.recommended) ??
    rows[0]
  );
}

/**
 * The methods of the puzzle: the chosen one large on the left (at first the course to carry on), its steps as a row of
 * bars and its one obvious action; every method beside it as a row to choose, with the share of its algorithms known.
 * Arrows move through the list, Enter starts the chosen course. Phones open a method's panel in a sheet.
 */
function Methods() {
  const phone = usePhone(),
    puzzle = s.puzzle as PuzzleId,
    rows = methodRows(puzzle),
    hero = heroRow(puzzle, rows),
    [picked, setPicked] = useState<string | null>(null),
    [sheet, setSheet] = useState(false),
    chosen = rows.find((r) => r.method.id === picked) ?? hero;
  const key = (e: React.KeyboardEvent<HTMLElement>) => {
    const i = rows.findIndex((r) => r === chosen),
      next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : -1;
    if (e.key === "Enter" && chosen) return void (e.preventDefault(), run("learnMethod:" + chosen.method.id)(e));
    if (!rows[next]) return;
    e.preventDefault();
    setPicked(rows[next].method.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-method="${rows[next].method.id}"]`)?.focus();
  };
  return (
    <div className={PAGE}>
      {/* A desktop has the section's head above the page (shell.tsx). */}
      {phone && <PageHead title={tr("Learn")} puzzle />}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-5">
        {(phone ? hero : chosen) && <HeroCourse puzzle={puzzle} row={(phone ? hero : chosen)!} />}
        <div
          role={phone ? "navigation" : "radiogroup"}
          aria-label={tr("Methods")}
          data-tour="learn"
          onKeyDown={phone ? undefined : key}
          className="-m-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 md:gap-3"
        >
            {rows.map((row) => (
              <MethodTile
                key={row.method.id}
                row={row}
                checked={!phone && row === chosen}
                onPick={() => {
                  setPicked(row.method.id);
                  if (phone) setSheet(true);
                }}
              />
            ))}
        </div>
      </div>
      {phone && chosen && (
        <PhoneSheet open={sheet} onOpenChange={setSheet} title={said(chosen.method.name)} hideTitle>
          <HeroCourse puzzle={puzzle} row={chosen} detailed className="bg-transparent px-5 pt-1" />
        </PhoneSheet>
      )}
    </div>
  );
}

/**
 * A course as a panel: where it stands, its steps (a list on a desktop, bars on a phone), then Continue (or Start) under
 * the thumb. `detailed` shows its line and figures on phones too (in its sheet).
 */
function HeroCourse({ puzzle, row, detailed = false, className }: { puzzle: PuzzleId; row: MethodRow; detailed?: boolean; className?: string }) {
  const phone = usePhone(),
    brief = phone && !detailed,
    { method, progress } = row,
    cases = s.cases(puzzle),
    entry = courseEntry(s.course, puzzle, method.id),
    step = method.steps[progress.step] ?? method.steps[0]!,
    action = "learnMethod:" + method.id;
  return (
    <Surface className={cn("shrink-0 gap-5 p-5 md:h-full md:justify-between md:gap-8 md:p-8", className)}>
      <div className="flex flex-col gap-2 md:gap-3">
        <span className={cn("flex items-center gap-2 text-sm font-semibold", progress.started || row.recommended ? "text-primary" : "text-muted-foreground")}>
          <LevelBars level={method.level} />
          {row.recommended && !progress.started ? tr("Start here") : tr(LEVEL_LABEL[method.level])}
        </span>
        <h2 className="text-[34px] leading-none font-extrabold tracking-[-0.04em] md:text-[56px]">{said(method.name)}</h2>
        {!brief && <p className="max-w-md text-base leading-relaxed text-muted-foreground">{said(method.summary)}</p>}
      </div>
      {/* A desktop: every step as a row, how far its algorithms are learned, the step to carry on tinted. */}
      {!phone && (
        <ol className="-mx-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label={tr("Steps")}>
          {method.steps.map((st, i) => {
            const learned = stepLearned(st, cases, s.learned, entry),
              done = stepDone(st, cases, s.learned, entry, learned),
              here = i === progress.step;
            return (
              <li key={st.title} aria-current={here ? "step" : undefined} className={cn("flex shrink-0 items-center gap-3 rounded-xl px-3 py-2", here && "bg-muted")}>
                <span className={cn(NUMERIC, "w-4 shrink-0 text-center text-sm font-bold", here ? "text-primary" : "text-faint")}>{i + 1}</span>
                <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", !here && !done && "text-muted-foreground")}>{said(st.title)}</span>
                {learned.total > 0 && <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{learned.learned} / {learned.total}</span>}
                <span aria-label={said(done ? "Done" : here ? "Current step" : !learned.total ? "Intuitive" : "To do")} role="img">
                  <ProgressRing done={done} share={learned.total ? learned.learned / learned.total : 0} current={here} neutral={!learned.total} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-col gap-4">
        {!brief && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard size="sm" className="bg-muted" label={tr("Steps")} value={`${progress.done} / ${progress.total}`} dot={DOT.good} />
          <StatCard size="sm" className="bg-muted" label={tr("Algorithms")} value={`${row.learned} / ${row.facts.algorithms}`} dot={DOT.accent} />
          <StatCard size="sm" className="bg-muted" label={tr("Known")} value={`${Math.round(knownShare(row) * 100)}%`} dot={DOT.lilac} />
        </div>
        )}
        {/* A phone: every step as a bar, filled as far as its algorithms are learned; the step to carry on named on the button. */}
        {phone && (
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${method.steps.length}, minmax(0, 1fr))` }} aria-label={tr("Steps")}>
          {method.steps.map((st, i) => {
            const learned = stepLearned(st, cases, s.learned, entry),
              done = stepDone(st, cases, s.learned, entry);
            return (
              <li key={st.title} aria-current={i === progress.step ? "step" : undefined}>
                <Bar ratio={done ? 1 : learned.total ? learned.learned / learned.total : 0} fill={done ? "bg-success" : undefined} label={said(st.title)} className="h-2 min-w-0" />
              </li>
            );
          })}
        </ol>
        )}
        <Link
          to={pageUrl("learn", { puzzle, learnMethod: method.id })}
          data-action={action}
          onClick={(e) => (e.preventDefault(), run(action)(e))}
          className={cn(buttonVariants(), "justify-between")}
        >
          {progress.started ? tr("Continue · {0}", { 0: said(step.title) }) : tr("Start · {0}", { 0: said(step.title) })}
          <ChevronRight />
        </Link>
      </div>
    </Surface>
  );
}

/**
 * A method as a row to choose: its level, name and line, then how much of it is known, large, over its bar. The chosen
 * one is checked and the only one in the tab order (arrows move between them).
 */
function MethodTile({ row, checked, onPick }: { row: MethodRow; checked: boolean; onPick: () => void }) {
  const phone = usePhone(),
    share = Math.round(knownShare(row) * 100),
    learned = row.share === 1,
    badge = learned ? null : row.progress.started ? "In progress" : row.recommended ? "Recommended" : null;
  return (
    <button
      type="button"
      role={phone ? undefined : "radio"}
      aria-checked={phone ? undefined : checked}
      tabIndex={phone || checked ? 0 : -1}
      data-method={row.method.id}
      onClick={onPick}
      className={cn(TILE, "group/card flex shrink-0 flex-col gap-3 p-4 md:p-5")}
    >
      <span className="flex items-center gap-3 md:gap-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted text-muted-foreground transition-colors group-hover/card:bg-accent", (row.recommended || row.progress.started) && "text-primary")}>
          <LevelBars level={row.method.level} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-lg font-extrabold tracking-[-0.02em] md:text-xl">{said(row.method.name)}</span>
            {badge && <Badge variant="accent">{tr(badge)}</Badge>}
            {learned && (
              <Badge variant="success">
                <Check strokeWidth={3} />
                {tr("Learned")}
              </Badge>
            )}
          </span>
          <span className="truncate text-sm text-muted-foreground">{methodDetail(row)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn(NUMERIC, "text-2xl leading-none font-extrabold tracking-[-0.03em] md:text-[32px]", learned ? "text-success" : share ? "text-foreground" : "text-faint")}>{share}%</span>
          <span className={cn(NUMERIC, "mt-1 text-xs text-muted-foreground max-md:hidden")}>
            {tr("{0} / {1} algorithms", { 0: row.learned, 1: row.facts.algorithms })}
          </span>
        </span>
      </span>
      <Bar ratio={row.share} fill={learned ? "bg-success" : undefined} label={tr("{0} / {1} algorithms known · {2}%", { 0: row.learned, 1: row.facts.algorithms, 2: share })} />
    </button>
  );
}

/**
 * One thing to practise on a step's workbench: a catalogue case or one of the step's own algorithms. `algs` are its
 * algorithms, the one used first (`mine` those used, `use` marks one so); `action` toggles its learned mark; `caseId`
 * opens a catalogue case's full detail (every algorithm, its times) in a dialog.
 */
type Piece = {
  key: string;
  name: string;
  /** A case's number in its set (37, Aa), large on its tile. */
  short?: string;
  sub?: string;
  note?: string;
  algs: string[];
  mine: string[];
  use?: (alg: string) => string;
  learned: boolean;
  action: string;
  diagram: (size: number) => React.ReactNode;
  play?: PlayItem;
  caseId?: string;
};

/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their icon. */
function InlineDiagram({ puzzle, step, a, size }: { puzzle: PuzzleId; step: MethodStep; a: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize,
    mask = step.mask ?? "full",
    state = useMemo(() => (cube ? applyAlg(solved(cube), algSetup(a)) : undefined), [cube, a]);
  if (!state) return <span className="flex shrink-0 items-center justify-center text-muted-foreground/60" style={{ width: size, height: size }}><Icon name={"Puzzle" + puzzle} size={size * 0.55} /></span>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} className="shrink-0" />;
}

function inlinePiece(puzzle: PuzzleId, step: MethodStep, a: MethodAlgorithm, entry: CourseEntry): Piece {
  const id = algId(step, a),
    size = puzzleInfo(puzzle).cubeSize,
    algs = [a.alg, ...(a.alternatives ?? [])];
  return {
    key: id,
    name: a.name,
    sub: a.detail,
    algs,
    mine: [],
    note: a.note,
    learned: entry.learned.includes(id),
    action: "courseAlg:" + id,
    diagram: (px) => <InlineDiagram puzzle={puzzle} step={step} a={a} size={px} />,
    play: size || isPolyPuzzle(puzzle) ? { key: id, name: a.name, detail: a.detail, context: step.title, algs, note: a.note, size: size ?? 0, mask: step.mask ?? "full", setup: a.setup, puzzle: isPolyPuzzle(puzzle) ? puzzle : undefined } : undefined,
  };
}

/** A catalogue case as a piece: its other names, the algorithms it was learned with first. */
function casePiece(c: any, group: string): Piece {
  const mine: string[] = s.learned.has(c.id) ? (s.learnedAlgs[c.id] ?? []) : [],
    all: string[] = (c.algorithms ?? []).map((a: any) => a.alg),
    algs = [...all.filter((a) => mine.includes(a)), ...all.filter((a) => !mine.includes(a))].slice(0, Math.max(3, mine.length));
  return {
    key: c.id,
    name: caseTitle(c) === c.id ? c.id : said(c.name),
    short: shortId(c),
    sub: [c.name !== caseTitle(c) && said(c.name), c.subgroup && c.subgroup !== group && said(c.subgroup)].filter(Boolean).join(" · ") || undefined,
    algs,
    mine,
    use: (alg) => `learnAlg:${c.id}:${all.indexOf(alg)}`,
    learned: s.learned.has(c.id),
    action: "learn:" + c.id,
    diagram: (px) => <Diagram c={c} size={px} />,
    play: (casePlayItem(c) as PlayItem | null) ?? undefined,
    caseId: c.id,
  };
}

/** Whether a case or an algorithm is shown under the filter of learned ones (the algorithms page's, shared). */
const shownByFilter = (learned: boolean) => (s.learningFilter === "learned" ? learned : s.learningFilter === "not-learned" ? !learned : true);

/**
 * What a step teaches: its own algorithms, then the cases of the set shown, group by group in the saved order. `all`
 * is everything the filter of learned ones leaves, in that order: what the workbench goes through.
 */
function stepPieces(puzzle: PuzzleId, method: SolvingMethod, entry: CourseEntry) {
  const step = method.steps[entry.step]!,
    cases = s.cases(),
    sets = stepSets(step, s.allSets(), puzzle) as any[],
    chosen = shownSet(puzzle, method, entry, sets),
    byGroup = new Map(chosen ? setGroups(cases, chosen.id) : []),
    own = step.algs ?? [],
    inline = own.map((a) => inlinePiece(puzzle, step, a, entry)),
    groups = chosen
      ? orderedGroups(cases.filter((c: any) => c.set === chosen.id), s.groupOrder(chosen.id)).map((group): [string, Piece[]] => [group, byGroup.get(group)!.map((c: any) => casePiece(c, group))])
      : [],
    count = stepLearned(step, cases, s.learned, entry),
    all = [...inline, ...groups.flatMap(([, pieces]) => pieces)].filter((p) => shownByFilter(p.learned));
  return { step, sets, chosen, inline, groups, count, all };
}
type StepPieces = ReturnType<typeof stepPieces>;

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

/** The cube before or after a step (see `stepPicture`), showing the pieces of its mask; other puzzles their icon. */
/** A step's picture (`stepPicture`), the cube before it or after it. */
function StepCube({ puzzle, picture, side, size }: { puzzle: PuzzleId; picture: ReturnType<typeof stepPicture>; side: "before" | "after"; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize,
    { mask, held } = picture,
    setup = picture[side],
    state = useMemo(() => (cube ? applyAlg(solved(cube), setup) : undefined), [cube, setup]);
  if (!state) return <span className="flex shrink-0 items-center justify-center text-muted-foreground" style={{ width: size, height: size }}><Icon name={"Puzzle" + puzzle} size={size * 0.7} /></span>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} held={held} className="shrink-0" />;
}

/**
 * The workbench's state: the piece on it, the algorithm shown of its own (the one used first) and whether that
 * algorithm shows. A piece to learn shows it; a learned one comes with it hidden, to revise, Space showing or hiding it;
 * the up and down arrows change the piece.
 */
function useBench(pieces: StepPieces) {
  const { all } = pieces,
    [pick, setPick] = useState<string>(),
    [shown, setShown] = useState(false),
    [choice, setChoice] = useState(0),
    piece = all.find((p) => p.key === pick) ?? all.find((p) => !p.learned) ?? all[0],
    index = piece ? all.indexOf(piece) : -1,
    alg = piece ? (piece.algs[choice] ?? piece.algs[0] ?? "") : "",
    learning = !!piece && !piece.learned;
  const select = (key: string | undefined) => (setPick(key), setShown(false), setChoice(0));
  // The first case has nothing before it, the last nothing after it: two cases never lead to the same one both ways.
  const go = (step: number) => { const to = all[index + step]; if (to) select(to.key); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!piece || e.altKey || e.ctrlKey || e.metaKey || s.overlay || s.caseDialog || s.assisted || (e.target as HTMLElement).closest?.("input,textarea,[role=dialog]")) return;
      if (e.code === "Space" && !learning) setShown(!shown);
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") go(e.key === "ArrowDown" ? 1 : -1);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return {
    piece,
    open: learning || shown,
    learning,
    alg,
    choice,
    previous: index > 0 ? all[index - 1] : undefined,
    next: index >= 0 ? all[index + 1] : undefined,
    show: () => setShown(!shown),
    choose: (i: number) => setChoice(i),
    pick: (key: string) => select(key),
    go,
  };
}
type Bench = ReturnType<typeof useBench>;

/** The step's way on: Previous quietly, then Next (the next one's name in its tip), or Finish on the last; `wide` fills the row with Next as the main action. */
function StepNav({ method, entry, touch: wide = false }: { method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const next = method.steps[entry.step + 1];
  return (
    <span className={cn("flex min-w-0 items-center gap-2", wide ? "flex-1" : "ml-auto shrink-0")}>
      <Button action="previous" icon={ChevronLeft} variant="secondary" tip={tr("Previous step")} disabled={entry.step === 0} />
      {next ? (
        <Button action={"learnStep:" + (entry.step + 1)} variant={wide ? "default" : "secondary"} tip={`${tr("Next step")} · ${said(next.title)}`} className={cn("min-w-0 justify-between", wide && "ml-auto flex-1")}>
          {tr("Next")}
          <ChevronRight />
        </Button>
      ) : (
        <Button action="learnFinish" icon={Flag} variant="default" className={cn(wide && "ml-auto flex-1")}>
          {tr("Finish")}
        </Button>
      )}
    </span>
  );
}

/**
 * The piece's diagram, large: a click opens a catalogue case whole (every algorithm, its times) in the shared dialog,
 * or plays one of the step's own algorithms in 3D.
 */
function PieceDiagram({ piece, size }: { piece: Piece; size: number }) {
  const diagram = piece.diagram(size);
  if (piece.caseId) {
    const action = "caseDialog:" + piece.caseId;
    return (
      <Tip content={tr("Open the case")}>
        <button type="button" data-action={action} aria-label={`${tr("Open the case")} · ${said(piece.name)}`} onClick={run(action)} className={cn("shrink-0 cursor-pointer rounded-[24px] p-2 transition-colors hover:bg-muted", FOCUS)}>
          {diagram}
        </button>
      </Tip>
    );
  }
  return piece.play ? (
    <PlayDiagram id={piece.key} name={piece.name} onPlay={() => s.openAlg([piece.play!], 0)}>
      {diagram}
    </PlayDiagram>
  ) : (
    <span className="shrink-0">{diagram}</span>
  );
}

/** The piece's diagram as large as the room left for it allows, up to 320 pixels. */
function FitDiagram({ piece }: { piece: Piece }) {
  const ref = useRef<HTMLDivElement>(null),
    [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([e]) => setSize(Math.floor(Math.min(320, e!.contentRect.width, e!.contentRect.height) - 16)));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center">
      {size >= 64 && <PieceDiagram piece={piece} size={size} />}
    </div>
  );
}

/** The algorithm hidden: one muted block a move, as long as the algorithm. */
function HiddenAlg({ alg }: { alg: string }) {
  const n = moveCount(alg);
  return (
    <span className="flex flex-wrap gap-1.5" role="img" aria-label={tr("{0} moves", { 0: n })}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className="h-5 w-6 rounded-[5px] bg-foreground/10" />
      ))}
    </span>
  );
}

/** The piece's algorithms to choose the one shown, by length, the ones used marked; and whether the shown one is used. */
function AlgChoice({ piece, bench, touch = false }: { piece: Piece; bench: Bench; touch?: boolean }) {
  if (piece.algs.length < 2 && !piece.use && touch) return null;
  return (
    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
      {piece.algs.length > 1 && (
        <Segmented
          label={tr("Algorithms")}
          action="benchAlg:"
          value={String(bench.choice)}
          onChange={(i) => bench.choose(Number(i))}
          options={piece.algs.map((a, i) => ({
            id: String(i),
            label: (
              <>
                {piece.mine.includes(a) && <Check strokeWidth={3} className="text-success" aria-label={tr("I use it")} />}
                {tr("{0} moves", { 0: moveCount(a) })}
              </>
            ),
          }))}
        />
      )}
      {piece.use && (
        <ActionToggle action={piece.use(bench.alg)} pressed={piece.mine.includes(bench.alg)} icon={Check} variant="outline" className="text-muted-foreground aria-pressed:bg-success/15 aria-pressed:text-success">
          {tr("I use it")}
        </ActionToggle>
      )}
    </div>
  );
}

/** The algorithm: shown while the piece is to learn, then hidden until asked for (Space); on touch screens the cases either side after it. */
function AlgBand({ bench, touch = false }: { bench: Bench; touch?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center rounded-[20px] bg-background", touch ? "gap-2 p-3" : "min-h-20 gap-4 p-4")}>
      <div className="min-w-0 flex-1">
        {bench.open ? (
          <Alg text={bench.alg} size={touch ? 19 : 24} />
        ) : touch ? (
          <span className="text-sm font-semibold text-muted-foreground">{tr("{0} moves", { 0: moveCount(bench.alg) })}</span>
        ) : (
          <HiddenAlg alg={bench.alg} />
        )}
      </div>
      {!bench.learning && (
        <UiButton variant="secondary" data-action="benchShow" aria-pressed={bench.open} aria-label={tr(bench.open ? "Hide the algorithm" : "Show the algorithm")} onClick={bench.show}>
          {bench.open ? <EyeOff /> : <Eye />}
          {tr(bench.open ? "Hide" : "Show")}
          {!touch && <Kbd>{tr("Space")}</Kbd>}
        </UiButton>
      )}
      {touch && (bench.previous || bench.next) && (
        <>
          <UiButton variant="ghost" size="icon" data-action="benchStep:previous" disabled={!bench.previous} onClick={() => bench.go(-1)} aria-label={bench.previous ? `${tr("Previous case")} · ${said(bench.previous.name)}` : tr("Previous case")}>
            <ChevronLeft />
          </UiButton>
          <UiButton variant="secondary" size="icon" data-action="benchStep:next" disabled={!bench.next} onClick={() => bench.go(1)} aria-label={bench.next ? `${tr("Next case")} · ${said(bench.next.name)}` : tr("Next case")}>
            <ChevronRight />
          </UiButton>
        </>
      )}
    </div>
  );
}

/** The piece's name on top: its name large, its other names; on desktops its learned toggle beside it. */
function PieceHead({ piece, touch = false }: { piece: Piece; touch?: boolean }) {
  return (
    <div className="relative flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
      {!touch && <LearnToggle action={piece.action} learned={piece.learned} className="absolute top-0 right-0" />}
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className={cn("truncate leading-none font-extrabold tracking-[-0.04em]", touch ? "text-[32px]" : "text-[52px]")}>{said(piece.name)}</h2>
        {piece.sub && <span className={cn("text-sm font-semibold text-muted-foreground md:text-base", !touch && "truncate")}>{piece.sub}</span>}
      </div>
    </div>
  );
}

/**
 * Desktop: the workbench in the middle of a step, one piece at a time: its name and figures on top, its diagram large in
 * the middle (a click opens it), then its algorithm, hidden until asked for; under it the pieces either side.
 */
function Workbench({ bench }: { bench: Bench }) {
  const piece = bench.piece;
  return (
    <Surface className="min-w-0 gap-4 px-6 pt-5 pb-4" aria-label={tr("Workbench")}>
      {piece ? (
        <>
          <PieceHead piece={piece} />
          {piece.note && <p className="line-clamp-2 max-w-2xl shrink-0 text-[15px] leading-relaxed text-muted-foreground">{said(piece.note)}</p>}
          <FitDiagram piece={piece} />
          <AlgChoice piece={piece} bench={bench} />
          <AlgBand bench={bench} />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <Empty icon={Check}>{s.learningFilter === "learned" ? tr("Nothing learned yet") : tr("All learned")}</Empty>
        </div>
      )}
      <div className="flex shrink-0 items-center justify-end gap-2">
        {bench.previous && (
          <UiButton variant="ghost" data-action="benchStep:previous" onClick={() => bench.go(-1)} aria-label={`${tr("Previous case")} · ${said(bench.previous.name)}`}>
            <ChevronLeft />
            {said(bench.previous.name)}
          </UiButton>
        )}
        {bench.next && (
          <UiButton variant="secondary" data-action="benchStep:next" onClick={() => bench.go(1)} aria-label={`${tr("Next case")} · ${said(bench.next.name)}`}>
            {said(bench.next.name)}
            <ChevronRight />
          </UiButton>
        )}
      </div>
    </Surface>
  );
}

/**
 * An intuitive step's workbench, or one whose algorithms are to come. The step is read before it is done: its title,
 * its explanation and its tips, each ticked once read; Mastered (first: a step is learned here) and Train the cross
 * stay locked until every tip is ticked. A step read once, or mastered, opens unlocked (`cubix.learn.read`, this device).
 */
function IntuitiveBench({ puzzle, method, entry, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const step = method.steps[entry.step]!,
    train = step.train && puzzle === "333",
    mastered = stepMastered(step, entry),
    tips = step.tips ?? [],
    key = stepReadKey(puzzle, method.id, step),
    [ticked, setTicked] = useState<Record<string, number[]>>({}),
    [help, setHelp] = useState(false),
    mine = ticked[key] ?? [],
    read = stepRead(step, entry, !!s.prefs["cubix.learn.read"]?.[key]);
  const tick = (i: number) => {
    const next = toggled(mine, i);
    setTicked({ ...ticked, [key]: next });
    if (next.length === tips.length) s.pref("cubix.learn.read", { ...s.prefs["cubix.learn.read"], [key]: true });
  };
  const card = (action: string, icon: LucideIcon, title: string, primary = false, pressed?: boolean) => (
    <ActionCard key={action} primary={primary} pressed={pressed} icon={icon} title={tr(title)} action={action} onClick={run(action)} className={cn(touch ? "w-full" : "flex-1", pressed && "text-success")} />
  );
  const picture = stepPicture(method, entry.step);
  const body = step.missing ? (
    <Empty icon={Info} title={tr("Algorithms to come")}>
      {said(step.missing)}
    </Empty>
  ) : (
    <div className="flex w-full flex-col gap-5">
      {!touch && <h2 className="text-[40px] leading-none font-extrabold tracking-[-0.04em]">{said(step.title)}</h2>}
      {touch && puzzleInfo(puzzle).cubeSize && (
        <figure className="flex items-center justify-center gap-2 rounded-2xl bg-muted p-3" aria-label={tr("Before and after this step")}>
          <StepCube puzzle={puzzle} picture={picture} side="before" size={64} />
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          <StepCube puzzle={puzzle} picture={picture} side="after" size={64} />
        </figure>
      )}
      <p className={cn("leading-relaxed", touch ? "text-base" : "text-xl")}>{said(step.text)}</p>
      {step.help && (
        <UiButton variant="secondary" data-action="stepHelp" onClick={() => setHelp(true)} className="self-start">
          <Lightbulb />
          {tr("Useful moves")}
        </UiButton>
      )}
      {step.help && help && <StepHelp step={step} puzzle={puzzle} mask={stepPicture(method, entry.step).mask} onClose={() => setHelp(false)} />}
      {tips.length > 0 && (
        <ol className="flex flex-col gap-2.5" aria-label={tr("Tips")}>
          {tips.map((tip, i) => {
            const on = read || mine.includes(i);
            return (
              <li key={tip} className={cn("flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors", on ? "bg-success/10" : "bg-muted")}>
                <span className={cn(NUMERIC, "flex size-7 shrink-0 items-center justify-center rounded-full bg-card text-sm font-bold text-primary")}>{i + 1}</span>
                <span className={cn("min-w-0 flex-1 leading-relaxed", touch ? "text-[15px]" : "text-base")}>{said(tip)}</span>
                {!read && (
                  <UiButton variant={on ? "success" : "secondary"} aria-pressed={on} data-action={"learnTip:" + i} onClick={() => tick(i)} className="shrink-0">
                    <Check />
                    {on ? tr("Got it") : tr("I got it")}
                  </UiButton>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {read ? (
        <div className={cn("mt-auto flex gap-3 pt-2", touch && "flex-col")}>
          {/* Mastered first: the course is where a step is learned; training leaves it. */}
          {card("courseAlg:" + stepId(step), Check, "Mastered", !mastered, mastered)}
          {train && card("trainingSetup:" + step.train, Dumbbell, "Train the cross")}
        </div>
      ) : (
        <p className="mt-auto flex items-center gap-3 rounded-2xl bg-muted px-4 py-3.5 text-sm font-semibold text-muted-foreground" data-slot="learn-locked">
          <Lock className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{tr("Read each tip, then tick it")}</span>
          <span className={NUMERIC}>{mine.length} / {tips.length}</span>
        </p>
      )}
    </div>
  );
  if (touch) return body;
  return (
    <Surface className="min-w-0 gap-3 px-7 pt-7 pb-4" aria-label={tr("Workbench")}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
      <div className="flex shrink-0 items-center gap-3 pt-1">
        <StepNav method={method} entry={entry} />
      </div>
    </Surface>
  );
}

/** An intuitive step's useful moves (`help`), each played on the case it solves: help, never an algorithm to learn. */
function StepHelp({ step, puzzle, mask, onClose }: { step: MethodStep; puzzle: PuzzleId; mask: CubeMask; onClose: () => void }) {
  const moves = step.help!,
    [i, setI] = useState(0),
    move = moves[i]!,
    player = useAlgPlayer(move.alg, puzzleInfo(puzzle).cubeSize, mask, { setup: move.setup });
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={tr("Useful moves")} description={said(step.title)} className="sm:max-w-3xl">
      <div className="grid gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={tr("Useful moves")} className="flex flex-col gap-0.5">
          {moves.map((m, k) => (
            <button key={m.name} type="button" data-action={"stepHelp:" + k} aria-current={k === i ? "page" : undefined} onClick={() => setI(k)} className={cn(ROW, "flex min-h-10 items-center px-3 py-2 text-sm font-semibold")}>
              {said(m.name)}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col items-center gap-3">
          {player && <PlayerCube key={i} player={player} size={220} />}
          {player && <PlayerAlg player={player} text={move.alg} size={22} />}
          {player && <PlayerControls player={player} inline />}
          {move.note && <p className="text-center text-sm leading-relaxed text-muted-foreground">{said(move.note)}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Beside an intuitive step's lesson: the cube before it and after it, large. */
function StepPictureCard({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const picture = stepPicture(method, entry.step);
  if (!puzzleInfo(puzzle).cubeSize) return <StepSheet puzzle={puzzle} method={method} entry={entry} />;
  return (
    <Surface className="min-w-0 items-center justify-center gap-4 p-6" aria-label={tr("Before and after this step")}>
      <StepCube puzzle={puzzle} picture={picture} side="before" size={150} />
      <ChevronDown className="size-6 text-muted-foreground" aria-hidden="true" />
      <StepCube puzzle={puzzle} picture={picture} side="after" size={220} />
    </Surface>
  );
}

type RailRow = { key: string } & ({ kind: "piece"; p: Piece } | { kind: "group"; group: string; learned: number; total: number } | { kind: "tiles"; pieces: Piece[] });

/**
 * What a step teaches, as a list to pick the workbench's piece from: its own algorithms as rows, the set's cases as a
 * grid of numbered tiles under their group (the time on it, or New while to learn, faded); the set and the filter of
 * learned ones above.
 */
function Rail({ pieces, bench, touch = false, onPick }: { pieces: StepPieces; bench: Bench; touch?: boolean; onPick?: () => void }) {
  const { sets, chosen, inline, groups, count } = pieces,
    pick = (p: Piece) => (bench.pick(p.key), onPick?.()),
    list = useRef<HTMLElement>(null),
    columns = useColumns(list, 72, 6);
  // The step's own algorithms, then each group's name and its cases, a row of the grid at a time: drawn as they show.
  const rows: RailRow[] = inline.filter((p) => shownByFilter(p.learned)).map((p) => ({ kind: "piece", key: p.key, p }));
  for (const [group, members] of groups) {
    const shown = members.filter((p) => shownByFilter(p.learned));
    if (!shown.length) continue;
    rows.push({ kind: "group", key: "group:" + group, group, learned: members.filter((p) => p.learned).length, total: members.length });
    inRows(shown, columns).forEach((pieces, i) => rows.push({ kind: "tiles", key: group + ":" + i, pieces }));
  }
  return (
    <>
      <div className="flex shrink-0 flex-col gap-2.5 px-2">
        <SectionHead title={chosen ? tr("Cases") : tr("Algorithms")} meta={tr("{0} / {1} learned", { 0: count.learned, 1: count.total })} className="min-h-0" />
        {sets.length > 1 && <Choice prefix="learnSet:" label={tr("Set")} value={chosen.id} options={sets.map((set) => ({ id: set.id, label: set.label, count: set.count }))} className="w-fit" />}
        {chosen && (
          <Choice
            prefix="learningFilter:"
            label={tr("Filter")}
            value={s.learningFilter}
            options={[
              { id: "all", label: "All", count: count.total },
              { id: "learned", label: "Learned", count: count.learned },
              { id: "not-learned", label: "To learn", count: count.total - count.learned },
            ]}
            className="w-fit"
          />
        )}
      </div>
      <nav ref={list} aria-label={chosen ? tr("Cases") : tr("Algorithms")} className="-m-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
        <VirtualList
          items={rows}
          scroller={list}
          estimate={(i) => (rows[i]!.kind === "tiles" ? 112 : rows[i]!.kind === "group" ? 30 : 66)}
          rowKey={(v) => v.key}
          row={(v, _, measure) =>
            v.kind === "piece" ? (
              <button
                ref={measure}
                type="button"
                data-pick={v.p.key}
                aria-current={v.p === bench.piece ? "true" : undefined}
                onClick={() => pick(v.p)}
                className={cn(ROW, "flex shrink-0 items-center gap-3 px-2 py-1.5 aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground", touch && "min-h-14")}
              >
                <span className={cn(!v.p.learned && v.p !== bench.piece && "opacity-45 saturate-50")}>{v.p.diagram(52)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{said(v.p.name)}</span>
                  <span className={cn("truncate text-xs", v.p === bench.piece ? "text-primary-foreground/75" : v.p.learned ? "text-muted-foreground" : "text-warning")}>{v.p.learned ? tr("Learned") : tr("To learn")}</span>
                </span>
              </button>
            ) : v.kind === "group" ? (
              <h3 ref={measure} className="flex shrink-0 justify-between px-1.5 pt-2.5 text-[13px] font-extrabold text-muted-foreground">
                {tr(v.group)}
                <span className={cn(NUMERIC, "font-bold text-faint", v.learned === v.total && "text-success")}>
                  {v.learned} / {v.total}
                </span>
              </h3>
            ) : (
              // A row of the group's grid: 4.5rem tiles at least, as its auto-fill grid would hold them.
              <div ref={measure} className="grid shrink-0 gap-1.5 pt-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {v.pieces.map((p) => {
                  const here = p === bench.piece;
                  return (
                    <Tip key={p.key} content={p.sub ? `${p.name} · ${p.sub}` : p.name}>
                      <button
                        type="button"
                        data-pick={p.key}
                        aria-current={here ? "true" : undefined}
                        aria-label={`${p.name} · ${p.learned ? tr("Learned") : tr("To learn")}`}
                        onClick={() => pick(p)}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 pt-2 pb-1.5 transition-colors hover:bg-muted aria-[current=true]:bg-muted",
                          FOCUS,
                        )}
                      >
                        <span className={cn(!p.learned && !here && "opacity-45 saturate-50")}>{p.diagram(60)}</span>
                        <span className={cn(NUMERIC, "max-w-full truncate text-[17px] leading-none font-extrabold tracking-[-0.02em]")}>{p.short ?? p.name}</span>
                        <span className={cn("text-[11px] font-bold", p.learned ? "text-success" : "text-warning")}>
                          {p.learned ? tr("Learned") : tr("New")}
                        </span>
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )
          }
        />
      </nav>
    </>
  );
}

/**
 * The step's sheet: its title, what it changes on the cube (before and after), its explanation and tips, then
 * training it.
 */
function StepSheet({ puzzle, method, entry, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const step = method.steps[entry.step]!,
    picture = stepPicture(method, entry.step),
    count = stepLearned(step, s.cases(), s.learned, entry),
    train = trainAction(puzzle, method, entry),
    learnedInSet = train ? s.setCases(train.slice("train:".length)).filter((c: any) => s.learned.has(c.id)).length : 0;
  const content = (
    <>
      {!touch && <h2 className="text-[30px] leading-none font-extrabold tracking-[-0.04em]">{said(step.title)}</h2>}
      {puzzleInfo(puzzle).cubeSize && (
        <figure className="flex items-center justify-center gap-2 rounded-2xl bg-muted p-3" aria-label={tr("Before and after this step")}>
          <StepCube puzzle={puzzle} picture={picture} side="before" size={touch ? 56 : 66} />
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          <StepCube puzzle={puzzle} picture={picture} side="after" size={touch ? 56 : 66} />
        </figure>
      )}
      <p className="text-[15px] leading-relaxed text-muted-foreground">{said(step.text)}</p>
      {!!step.tips?.length && (
        <ol className="flex flex-col gap-2.5" aria-label={tr("Tips")}>
          {step.tips.map((tip, i) => (
            <li key={tip} className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground">
              <span className={cn(NUMERIC, "flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-warning")}>{i + 1}</span>
              {said(tip)}
            </li>
          ))}
        </ol>
      )}
      {step.missing && count.total > 0 && (
        <Alert variant="info" role="note">
          <Info />
          <AlertDescription>{said(step.missing)}</AlertDescription>
        </Alert>
      )}
    </>
  );
  if (touch) return <div className="flex flex-col gap-4">{content}</div>;
  return (
    <Surface className="min-w-0 gap-4 p-5" aria-label={tr("About this step")}>
      <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">{content}</div>
      {count.total > 0 && (
        <div className="flex shrink-0 flex-col gap-2">
          {train && (
            <Button action={train} icon={Dumbbell} variant="secondary" disabled={!learnedInSet}>
              {tr("Train")}
            </Button>
          )}
          {/* No timer here: its scrambles are a whole solve's, not this step's; Train is the step's practice. */}
          <StepNav method={method} entry={entry} touch />
        </div>
      )}
    </Surface>
  );
}

/**
 * The course's steps as a track across the whole width: each step a button with a ring filled as far as its algorithms
 * are learned (full and green once done; an intuitive step's full once mastered), the one shown on the accent, joined by
 * lines that stretch between them, green once the step they lead to is done. Each is a link to its step; on a narrow
 * window the steps wrap to another row rather than cut their names.
 */
function StepTrack({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const cases = s.cases();
  return (
    <nav aria-label={tr("Steps")} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {method.steps.map((st, i) => {
        const learned = stepLearned(st, cases, s.learned, entry),
          done = s.learnFinished || stepDone(st, cases, s.learned, entry, learned),
          here = i === entry.step && !s.learnFinished;
        return (
          <Fragment key={st.title}>
            {i > 0 && <span className={cn("h-px min-w-3 flex-1", done ? "bg-success" : "bg-border")} aria-hidden="true" />}
            <Tip content={`${i + 1}. ${said(st.title)}`}>
              <Link
                to={pageUrl("learn", { puzzle, learnMethod: method.id, ...(i ? { learnStep: i } : {}) })}
                data-action={"learnStep:" + i}
                aria-current={here ? "step" : undefined}
                aria-label={`${i + 1}. ${said(st.title)} · ${tr(done ? "Done" : "To do")}`}
                onClick={(e) => (e.preventDefault(), run("learnStep:" + i)(e))}
                className={cn(buttonVariants({ variant: here ? "default" : "secondary" }), "shrink-0")}
              >
                <ProgressRing done={false} share={done ? 1 : learned.total ? learned.learned / learned.total : 0} className={here ? "text-current" : done ? "text-success" : undefined} />
                <span>{said(st.title)}</span>
              </Link>
            </Tip>
          </Fragment>
        );
      })}
    </nav>
  );
}

/**
 * The steps of a course as rows (the phone's sheet): how far each is learned, its number, title and algorithms; a click
 * shows the step. A link to the step's address, which search engines follow; the action opens it.
 */
function StepRows({ method, entry, touch = false, onPick }: { method: SolvingMethod; entry: CourseEntry; touch?: boolean; onPick?: () => void }) {
  const cases = s.cases();
  return method.steps.map((st, i) => {
    const learned = stepLearned(st, cases, s.learned, entry),
      done = stepDone(st, cases, s.learned, entry, learned),
      here = i === entry.step && !s.learnFinished;
    return (
      <Link
        key={st.title}
        to={pageUrl("learn", { puzzle: s.puzzle as PuzzleId, learnMethod: method.id, ...(i ? { learnStep: i } : {}) })}
        data-action={"learnStep:" + i}
        aria-current={here ? "step" : undefined}
        onClick={(e) => {
          e.preventDefault();
          onPick?.();
          run("learnStep:" + i)(e);
        }}
        className={cn(STEP, "flex shrink-0 items-center gap-3", touch ? "min-h-14 px-3 active:bg-muted/50" : "min-h-12 px-3 py-2")}
      >
        <span className={cn(NUMERIC, "w-4 shrink-0 text-center text-sm font-bold", here ? "text-primary" : "text-faint")}>{i + 1}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-semibold", touch ? "text-base" : "text-sm", !here && "text-muted-foreground")}>{said(st.title)}</span>
          <span className={cn(NUMERIC, "truncate text-xs text-muted-foreground")}>
            {learned.total ? tr("{0} / {1} learned", { 0: learned.learned, 1: plural(learned.total, "alg") }) : st.missing ? tr("Algorithms to come") : stepMastered(st, entry) ? tr("Mastered") : tr("Intuitive")}
          </span>
        </span>
        <span aria-label={said(done ? "Done" : here ? "Current step" : !learned.total ? "Intuitive" : "To do")} role="img">
          <ProgressRing done={done} share={learned.total ? learned.learned / learned.total : 0} current={here} neutral={!learned.total} />
        </span>
      </Link>
    );
  });
}

/**
 * A course completed: what was done, large, with where to go from here; beside it every step and what it taught.
 */
function Finished({ puzzle, method, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; touch?: boolean }) {
  const cases = s.cases(),
    entry = courseEntry(s.course, puzzle, method.id);
  const actions = (
    <div className={cn("flex gap-2", touch ? "flex-col" : "flex-wrap")}>
      <Button action="nav:playground" icon={Timer} variant="default" tip={tr("Practise with the timer")}>
        {tr("Timer")}
      </Button>
      <Button action="learnMethods" icon={GraduationCap} variant="secondary" tip={tr("Learn another method")}>
        {tr("Methods")}
      </Button>
      {assisted(puzzle, method) && (
        <Button action="assisted" icon={Route} variant="ghost" tip={tr("Again with my cube")}>
          {tr("My cube")}
        </Button>
      )}
    </div>
  );
  const hero = (
    <div className={cn("flex flex-col justify-center gap-5", touch ? "px-5 py-6" : "")} data-finished>
      <h2 className={cn("leading-[0.95] font-extrabold tracking-[-0.05em]", touch ? "text-[36px]" : "text-[60px]")}>{tr("{0} done.", { 0: said(method.name) })}</h2>
      {actions}
    </div>
  );
  const steps = (
    <section className="flex min-h-0 flex-col gap-2" aria-label={tr("Steps")}>
      <SectionHead title={tr("Steps")} className="min-h-0 px-1" />
      <ol className="-m-1 flex min-h-0 flex-col gap-1.5 overflow-y-auto p-1">
        {method.steps.map((st, i) => {
          const learned = stepLearned(st, cases, s.learned, entry),
            picture = stepPicture(method, i);
          return (
            <li key={st.title} className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-2.5">
              <StepCube puzzle={puzzle} picture={picture} side="after" size={34} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{said(st.title)}</span>
              <span className={cn(NUMERIC, "shrink-0 text-[13px] font-semibold text-muted-foreground")}>
                {learned.total ? tr("{0} / {1} learned", { 0: learned.learned, 1: plural(learned.total, "alg") }) : stepMastered(st, entry) ? tr("Mastered") : tr("Intuitive")}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
  if (touch)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
        {hero}
        <div className="px-4">{steps}</div>
      </div>
    );
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_26rem] gap-4">
      <Surface className="justify-center px-11 py-10">{hero}</Surface>
      <Surface className="p-5">{steps}</Surface>
    </div>
  );
}

/** A course: the phone's or the desktop's, the case dialog and the assisted solve over it. */
function Course({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const phone = usePhone();
  return (
    <>
      {phone ? <PhoneCourse key={entry.step} puzzle={puzzle} method={method} entry={entry} /> : <DesktopCourse key={entry.step} puzzle={puzzle} method={method} entry={entry} />}
      {assisted(puzzle, method) && <AssistedSolve method={method.id} />}
    </>
  );
}

/** A 3×3 course can solve the player's own cube with them (AssistedSolve). */
const assisted = (puzzle: PuzzleId, method: SolvingMethod) => solvable(puzzle, method.id);
function AssistedButton({ puzzle, method, phone = false }: { puzzle: PuzzleId; method: SolvingMethod; phone?: boolean }) {
  if (!assisted(puzzle, method)) return null;
  return (
    <Button action="assisted" icon={Route} variant="secondary" tip={tr("With my cube")}>
      {!phone && tr("My cube")}
    </Button>
  );
}

/**
 * Desktop: the course's track across the top, then the step in three columns: what it teaches to pick from, the
 * workbench with one piece at a time, and the step's sheet.
 */
function DesktopCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const pieces = stepPieces(puzzle, method, entry),
    bench = useBench(pieces),
    hasPieces = pieces.count.total > 0;
  return (
    <div className={PAGE}>
      <header className="flex min-h-12 shrink-0 items-center gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <Back action="learnMethods" label="Every method" />
          <h1 className="text-xl leading-tight font-extrabold tracking-[-0.03em]">{said(method.name)}</h1>
        </div>
        <StepTrack puzzle={puzzle} method={method} entry={entry} />
        <AssistedButton puzzle={puzzle} method={method} />
      </header>
      {s.learnFinished ? (
        <Finished puzzle={puzzle} method={method} />
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-4", hasPieces ? "grid-cols-[21rem_minmax(0,1fr)_17.5rem] min-[1400px]:grid-cols-[24rem_minmax(0,1fr)_19rem]" : "grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]")}>
          {hasPieces && (
            <Surface className="min-w-0 gap-3 p-3 pt-4">
              <Rail pieces={pieces} bench={bench} />
            </Surface>
          )}
          {hasPieces ? <Workbench bench={bench} /> : <IntuitiveBench puzzle={puzzle} method={method} entry={entry} />}
          {/* An intuitive step reads its lesson in the workbench: its cube before and after beside it. */}
          {hasPieces || method.steps[entry.step]!.missing ? <StepSheet puzzle={puzzle} method={method} entry={entry} /> : <StepPictureCard puzzle={puzzle} method={method} entry={entry} />}
        </div>
      )}
    </div>
  );
}

/**
 * Phones: the course as a page of its own, back to the methods in the header. The step chooser opens the steps in a
 * sheet; the workbench comes first, the step's explanation under it, and Previous and Next step stay at the bottom,
 * under the thumb. Every piece of the step is a sheet away.
 */
function PhoneCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const [steps, setSteps] = useState(false),
    [list, setList] = useState(false),
    step = method.steps[entry.step]!,
    done = stepDone(step, s.cases(), s.learned, entry),
    pieces = stepPieces(puzzle, method, entry),
    bench = useBench(pieces),
    hasPieces = pieces.count.total > 0;
  return (
    <div className={PAGE}>
      <PageHead lead={<Back action="learnMethods" label="Every method" />} title={said(method.name)}>
        <AssistedButton puzzle={puzzle} method={method} phone />
      </PageHead>
      <Surface className="flex-1">
        <button
          type="button"
          data-action="learnSteps"
          aria-haspopup="dialog"
          onClick={() => setSteps(true)}
          className={cn(ROW, "flex min-h-14 shrink-0 items-center gap-3 rounded-none bg-muted/60 px-4 active:bg-muted")}
        >
          <StepMark done={s.learnFinished || done} current={!s.learnFinished && !done} />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-lg font-extrabold tracking-[-0.02em]">{s.learnFinished ? tr("{0} done", { 0: said(method.name) }) : said(step.title)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{s.learnFinished ? method.steps.length : entry.step + 1} / {method.steps.length}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
        {s.learnFinished ? (
          <Finished puzzle={puzzle} method={method} touch />
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-6 *:shrink-0">
              {hasPieces ? (
                <>
                  <div className="flex items-center gap-2">
                    <UiButton variant="secondary" data-action="learnPieces" aria-haspopup="dialog" onClick={() => setList(true)} className="min-w-0 flex-1 justify-between">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate">{pieces.chosen ? tr("Cases") : tr("Algorithms")}</span>
                        <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{pieces.count.learned} / {pieces.count.total}</span>
                      </span>
                      <ChevronsUpDown />
                    </UiButton>
                    {bench.piece && <LearnToggle action={bench.piece.action} learned={bench.piece.learned} />}
                  </div>
                  {bench.piece ? (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <PieceHead piece={bench.piece} touch />
                        </div>
                        <PieceDiagram piece={bench.piece} size={136} />
                      </div>
                      {bench.piece.note && <p className="text-[15px] leading-relaxed text-muted-foreground">{said(bench.piece.note)}</p>}
                      <AlgChoice piece={bench.piece} bench={bench} touch />
                    </>
                  ) : (
                    <Empty icon={Check}>{s.learningFilter === "learned" ? tr("Nothing learned yet") : tr("All learned")}</Empty>
                  )}
                </>
              ) : (
                <IntuitiveBench puzzle={puzzle} method={method} entry={entry} touch />
              )}
              {(hasPieces || step.missing) && <StepSheet puzzle={puzzle} method={method} entry={entry} touch />}
            </div>
            {hasPieces && bench.piece && (
              <div className="shrink-0 px-2 pt-2">
                <AlgBand bench={bench} touch />
              </div>
            )}
            <FootBar>
              {hasPieces && trainAction(puzzle, method, entry) && <Button action={trainAction(puzzle, method, entry)} icon={Dumbbell} variant="secondary" tip={tr("Train")} />}
              <StepNav method={method} entry={entry} touch />
            </FootBar>
          </>
        )}
      </Surface>
      <PhoneSheet open={steps} onOpenChange={setSteps} title={tr("Steps")} className="gap-0 px-2">
        <StepRows method={method} entry={entry} touch onPick={() => setSteps(false)} />
      </PhoneSheet>
      {hasPieces && (
        <PhoneSheet open={list} onOpenChange={setList} title={pieces.chosen ? tr("Cases") : tr("Algorithms")} hideTitle className="flex max-h-[80svh] flex-col gap-3 px-3 pb-4">
          <Rail pieces={pieces} bench={bench} touch onPick={() => setList(false)} />
        </PhoneSheet>
      )}
    </div>
  );
}
