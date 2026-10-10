/**
 * Learn: the methods of the puzzle, the chosen one large beside the list; then the chosen one as a course: its steps as
 * a track across the top, and the step in three columns: what it teaches to pick from, a workbench with one case at a
 * time (its algorithm hidden until asked for in Review, then how the try went), and the step's sheet.
 * Phones get the course with its steps in a sheet and its actions under the thumb.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { orderedGroups } from "../../src/client/lib/dailyLearning";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Dumbbell, Eye, EyeOff, Flag, GraduationCap, Info, Route, Timer, type LucideIcon } from "lucide-react";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../src/shared/methods";
import { applyAlg, solved } from "../../src/shared/cube";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { Link } from "react-router";
import { pageUrl } from "./navigation";
import { viewForMask } from "../../src/shared/cubeDiagram";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, firstOpenSet, methodFacts, methodLearned, methodProgress, methodShare, recommendedMethod, setGroups, stepDone, stepId, stepLearned, stepMastered, stepSets,
  type CourseEntry,
} from "../../src/client/lib/course";
import { StaticCubeSvg, type CubeMask } from "../../src/client/diagrams/StaticCubeSvg";
import { store as s, type PlayItem } from "./store";
import { PhoneSheet } from "./phone";
import { ActionCard, ActionToggle, Alg, Back, Bar, Button, Choice, DOT, Diagram, Empty, FOCUS, Figure, Icon, LearnToggle, NUMERIC, PAGE, PageHead, ROW, SectionHead, Segmented, ProgressRing, StatCard, StatusMark, Surface, TILE, Tip, plural, run, usePhone } from "./ui";
import { FootBar, PlayDiagram } from "./algorithms";
import { casePlayItem, moveCount, shortId } from "../../src/client/lib/caseState";
import { fmtTime } from "../../src/client/lib/format";
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

const methodDetail = (row: MethodRow) =>
  `${tr(LEVEL_LABEL[row.method.level])} · ${plural(row.facts.steps, "step")}` +
  (row.progress.started ? ` · ${tr("{0} of {1} steps learned", { 0: row.progress.done, 1: row.progress.total })}` : "");
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
    chosen = rows.find((r) => r.method.id === picked) ?? hero,
    label = puzzleInfo(puzzle).label;
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
      <PageHead title={tr("Learn")} sub={tr("Choose a {0} method, then follow it step by step", { 0: said(label) })} puzzle />
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
 * A course as a panel: where it stands, its steps as bars, then Continue (or Start) under the thumb. `detailed` shows its
 * line and figures on phones too (in its sheet).
 */
function HeroCourse({ puzzle, row, detailed = false, className }: { puzzle: PuzzleId; row: MethodRow; detailed?: boolean; className?: string }) {
  const brief = usePhone() && !detailed,
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
          {progress.started ? tr("Continue") : row.recommended ? tr("Start here") : tr(LEVEL_LABEL[method.level])}
        </span>
        <h2 className="text-[34px] leading-none font-extrabold tracking-[-0.04em] md:text-[56px]">{said(method.name)}</h2>
        {!brief && <p className="max-w-md text-base leading-relaxed text-muted-foreground">{said(method.summary)}</p>}
      </div>
      <div className="flex flex-col gap-4">
        {!brief && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard size="sm" className="bg-muted" label={tr("Steps")} value={`${progress.done} / ${progress.total}`} dot={DOT.good} />
          <StatCard size="sm" className="bg-muted" label={tr("Algorithms")} value={`${row.learned} / ${row.facts.algorithms}`} dot={DOT.accent} />
          <StatCard size="sm" className="bg-muted" label={tr("Known")} value={`${Math.round(knownShare(row) * 100)}%`} dot={DOT.lilac} />
        </div>
        )}
        {/* Every step as a bar, filled as far as its algorithms are learned; the step to carry on named under them. */}
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
        <p className="text-sm text-muted-foreground">
          {tr("Step {0} of {1}", { 0: progress.step + 1, 1: method.steps.length })} · <span className="font-semibold text-foreground">{said(step.title)}</span>
        </p>
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
      className={cn(TILE, "group/card flex shrink-0 flex-col gap-3 p-4 md:flex-1 md:justify-center md:p-5")}
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
          <span className={cn("text-sm text-muted-foreground", phone ? "truncate" : "line-clamp-2")}>
            {phone ? methodDetail(row) : said(row.method.summary)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn(NUMERIC, "text-2xl leading-none font-extrabold tracking-[-0.03em] md:text-[32px]", learned ? "text-success" : share ? "text-foreground" : "text-faint")}>{share}%</span>
          <span className={cn(NUMERIC, "mt-1 text-xs text-muted-foreground max-md:hidden")}>
            {tr("{0} / {1} algorithms", { 0: row.learned, 1: row.facts.algorithms })}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-3">
        {!phone && <span className="shrink-0 text-xs text-muted-foreground">{methodDetail(row)}</span>}
        <Bar ratio={row.share} fill={learned ? "bg-success" : undefined} className="flex-1" label={tr("{0} / {1} algorithms known · {2}%", { 0: row.learned, 1: row.facts.algorithms, 2: share })} />
      </span>
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
  /** Where it sits: its group and place in it. */
  context?: string;
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
    mask = step.mask ?? "full";
  if (!cube) return <span className="flex shrink-0 items-center justify-center text-muted-foreground/60" style={{ width: size, height: size }}><Icon name={"Puzzle" + puzzle} size={size * 0.55} /></span>;
  return <StaticCubeSvg state={applyAlg(solved(cube), algSetup(a))} size={size} mask={mask} view={viewForMask(mask)} className="shrink-0" />;
}

function inlinePiece(puzzle: PuzzleId, step: MethodStep, a: MethodAlgorithm, entry: CourseEntry, index: number, count: number): Piece {
  const id = algId(step, a),
    size = puzzleInfo(puzzle).cubeSize,
    algs = [a.alg, ...(a.alternatives ?? [])];
  return {
    key: id,
    name: a.name,
    context: tr("Algorithm {0} of {1}", { 0: index + 1, 1: count }),
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

/** A catalogue case as a piece: its place in its group, its other names, the algorithms it was learned with first. */
function casePiece(c: any, group: string, index: number, count: number): Piece {
  const mine: string[] = s.learned.has(c.id) ? (s.learnedAlgs[c.id] ?? []) : [],
    all: string[] = (c.algorithms ?? []).map((a: any) => a.alg),
    algs = [...all.filter((a) => mine.includes(a)), ...all.filter((a) => !mine.includes(a))].slice(0, Math.max(3, mine.length));
  return {
    key: c.id,
    name: c.id,
    short: shortId(c),
    context: `${tr(group)} · ${tr("{0} of {1}", { 0: index + 1, 1: count })}`,
    sub: [c.name !== c.id && said(c.name), c.subgroup && c.subgroup !== group && said(c.subgroup)].filter(Boolean).join(" · ") || undefined,
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
    inline = own.map((a, i) => inlinePiece(puzzle, step, a, entry, i, own.length)),
    groups = chosen
      ? orderedGroups(cases.filter((c: any) => c.set === chosen.id), s.groupOrder(chosen.id)).map((group): [string, Piece[]] => [group, byGroup.get(group)!.map((c: any, i: number, all: any[]) => casePiece(c, group, i, all.length))])
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

/** The pieces a step solves, as a cube mask: its own, else the one its sets teach (F2L, OLL, PLL…); the whole cube otherwise. */
function goalMask(step: MethodStep): CubeMask {
  if (step.mask) return step.mask;
  const sets = step.sets?.join(" ") ?? "";
  return /cmll/.test(sets) ? "CMLL" : /oll/.test(sets) ? "OLL" : /pll/.test(sets) ? "PLL" : /f2l/.test(sets) ? "F2L" : "full";
}
/** A step pictured by what it solves: a solved cube showing only the pieces of its mask; other puzzles their icon. */
function StepCube({ puzzle, step, size, faded = false }: { puzzle: PuzzleId; step: MethodStep | undefined; size: number; faded?: boolean }) {
  const cube = puzzleInfo(puzzle).cubeSize;
  if (!cube || !step) return <span className={cn("flex shrink-0 items-center justify-center text-muted-foreground", faded && "opacity-40")} style={{ width: size, height: size }}><Icon name={"Puzzle" + puzzle} size={size * 0.7} /></span>;
  return <StaticCubeSvg state={solved(cube)} size={size} mask={goalMask(step)} view="iso" className={cn("shrink-0", faded && "opacity-35 grayscale")} />;
}

/** How a try on the workbench went: missed, hesitated or got it. */
type Verdict = "no" | "meh" | "yes";
const VERDICTS: { id: Verdict; label: string; key: string; variant: "secondary" | "success"; className?: string }[] = [
  { id: "no", label: "Missed", key: "1", variant: "secondary", className: "text-destructive" },
  { id: "meh", label: "Hesitated", key: "2", variant: "secondary", className: "text-warning" },
  { id: "yes", label: "Got it", key: "3", variant: "success" },
];
const VERDICT_FILL: Record<Verdict, string> = { no: "bg-destructive", meh: "bg-warning", yes: "bg-success" };
/** A try of this visit: the piece and how it went. */
type Try = { key: string; verdict: Verdict };

/**
 * The workbench's state: the piece on it, the algorithm shown of its own (the one used first), whether that algorithm
 * shows, and the tries of this visit. Each piece comes with its algorithm hidden; Space shows or hides it, 1, 2 and 3
 * tell how a try went (Got it marks the piece learned, with the algorithm shown), the up and down arrows change the piece.
 */
function useBench(pieces: StepPieces) {
  const { all } = pieces,
    [pick, setPick] = useState<string>(),
    [shown, setShown] = useState(false),
    [choice, setChoice] = useState(0),
    [trail, setTrail] = useState<Try[]>([]),
    piece = all.find((p) => p.key === pick) ?? all.find((p) => !p.learned) ?? all[0],
    index = piece ? all.indexOf(piece) : -1,
    alg = piece ? (piece.algs[choice] ?? piece.algs[0] ?? "") : "";
  const select = (key: string | undefined) => (setPick(key), setShown(false), setChoice(0));
  const go = (step: number) => select(all[(index + step + all.length) % all.length]?.key);
  const tell = (verdict: Verdict) => {
    if (!piece) return;
    if (verdict === "yes" && !piece.learned) void s.action(piece.use?.(alg) ?? piece.action);
    setTrail((t) => [...t.slice(-23), { key: piece.key, verdict }]);
    go(1);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!piece || e.altKey || e.ctrlKey || e.metaKey || s.overlay || s.caseDialog || s.assisted || (e.target as HTMLElement).closest?.("input,textarea,[role=dialog]")) return;
      const verdict = VERDICTS.find((v) => v.key === e.key);
      if (e.code === "Space") setShown(!shown);
      else if (verdict) tell(verdict.id);
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") go(e.key === "ArrowDown" ? 1 : -1);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return {
    piece,
    open: shown,
    alg,
    choice,
    trail,
    previous: all.length > 1 ? all[(index - 1 + all.length) % all.length] : undefined,
    next: all.length > 1 ? all[(index + 1) % all.length] : undefined,
    show: () => setShown(!shown),
    choose: (i: number) => setChoice(i),
    pick: (key: string) => select(key),
    go,
    tell,
  };
}
type Bench = ReturnType<typeof useBench>;

/** The tries of this visit, oldest first, each a square in its colour; named for screen readers. */
function Trail({ trail }: { trail: Try[] }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-muted-foreground">
      <span className="shrink-0">{plural(trail.length, "try")}</span>
      <span className="flex min-w-0 gap-1 overflow-hidden" role="img" aria-label={trail.map((t) => tr(VERDICTS.find((x) => x.id === t.verdict)!.label)).join(", ")}>
        {trail.map((t, i) => (
          <i key={i} className={cn("size-3 shrink-0 rounded-[4px]", VERDICT_FILL[t.verdict])} />
        ))}
      </span>
    </span>
  );
}

/** The step's way on: Previous quietly, then Next step with the next one's name, or Finish on the last; `wide` fills the row with Next step as the main action. */
function StepNav({ method, entry, touch: wide = false }: { method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const next = method.steps[entry.step + 1];
  return (
    <span className={cn("flex min-w-0 items-center gap-2", wide ? "flex-1" : "ml-auto shrink-0")}>
      <Button action="previous" icon={ChevronLeft} variant="secondary" tip={tr("Previous step")} disabled={entry.step === 0} />
      {next ? (
        <Button action={"learnStep:" + (entry.step + 1)} variant={wide ? "default" : "secondary"} className={cn("min-w-0 justify-between", wide && "ml-auto flex-1")}>
          <span className="truncate">
            {tr("Next step")} · {said(next.title)}
          </span>
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

/** The piece's figures: a case's times on it (average, best, attempts), then how its tries of this visit went. */
function PieceFigures({ piece, bench, touch = false }: { piece: Piece; bench: Bench; touch?: boolean }) {
  const st = piece.caseId ? s.stats.find((v) => v.caseId === piece.caseId) : undefined,
    tries = bench.trail.filter((t) => t.key === piece.key),
    size = touch ? "lg" : "2xl";
  return (
    <div className={cn("flex shrink-0 flex-wrap gap-y-2", touch ? "gap-x-5" : "gap-x-7")}>
      {piece.caseId && (
        <>
          <Figure size={size} label={tr("Average")} value={st?.mean != null ? fmtTime(st.mean) : "–"} />
          <Figure size={size} label={tr("Best")} value={st?.best != null ? fmtTime(st.best) : "–"} tone="good" />
          <Figure size={size} label={tr("Attempts")} value={st?.count ? String(st.count) : "–"} />
        </>
      )}
      <Figure size={size} label={`${tr("Got it")} · ${tr("This session")}`} value={tries.length ? `${tries.filter((t) => t.verdict === "yes").length} / ${tries.length}` : "–"} />
    </div>
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

/** The algorithm, hidden until asked for (Space), then how the try went: three buttons, 1, 2 and 3 on the keyboard. */
function AlgBand({ piece, bench, touch = false }: { piece: Piece; bench: Bench; touch?: boolean }) {
  return (
    <div className={cn("flex shrink-0 flex-col rounded-[20px] bg-background", touch ? "gap-3 p-3" : "gap-4 p-4")}>
      <div className={cn("flex items-center gap-4", !touch && "min-h-12")}>
        <div className="min-w-0 flex-1">
          {bench.open ? (
            <Alg text={bench.alg} size={touch ? 19 : 24} />
          ) : touch ? (
            <span className="text-sm font-semibold text-muted-foreground">{tr("{0} moves", { 0: moveCount(bench.alg) })}</span>
          ) : (
            <HiddenAlg alg={bench.alg} />
          )}
        </div>
        <UiButton variant="secondary" data-action="benchShow" aria-pressed={bench.open} aria-label={tr(bench.open ? "Hide the algorithm" : "Show the algorithm")} onClick={bench.show}>
          {bench.open ? <EyeOff /> : <Eye />}
          {tr(bench.open ? "Hide" : "Show")}
          {!touch && <Kbd>{tr("Space")}</Kbd>}
        </UiButton>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={tr("Do it on your cube, from memory.")}>
          {VERDICTS.map((v) => (
            <UiButton key={v.id} variant={v.variant} data-action={"benchVerdict:" + v.id} onClick={() => bench.tell(v.id)} className={v.className}>
              {v.id === "yes" && <Check strokeWidth={3} />}
              {tr(v.label)}
              {!touch && <Kbd>{v.key}</Kbd>}
            </UiButton>
          ))}
      </div>
    </div>
  );
}

/** The piece's name on top: where it sits, its name large, its other names; on desktops its figures beside it. */
function PieceHead({ piece, bench, touch = false }: { piece: Piece; bench: Bench; touch?: boolean }) {
  return (
    <div className="relative flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
      {!touch && <LearnToggle action={piece.action} learned={piece.learned} className="absolute top-0 right-0" />}
      <div className="flex min-w-0 flex-col gap-1">
        {piece.context && <span className={cn("text-[13px] font-semibold text-muted-foreground", !touch && "truncate")}>{piece.context}</span>}
        <h2 className={cn("truncate leading-none font-extrabold tracking-[-0.04em]", touch ? "text-[32px]" : "text-[52px]")}>{said(piece.name)}</h2>
        {piece.sub && <span className={cn("text-sm font-semibold text-muted-foreground md:text-base", !touch && "truncate")}>{piece.sub}</span>}
      </div>
      {!touch && <PieceFigures piece={piece} bench={bench} />}
    </div>
  );
}

/**
 * Desktop: the workbench in the middle of a step, one piece at a time: its name and figures on top, its diagram large in
 * the middle (a click opens it), then its algorithm, hidden until asked for, and how the try went; under it the tries of
 * this visit and the pieces either side.
 */
function Workbench({ bench }: { bench: Bench }) {
  const piece = bench.piece;
  return (
    <Surface className="min-w-0 gap-4 px-6 pt-5 pb-4" aria-label={tr("Workbench")}>
      {piece ? (
        <>
          <PieceHead piece={piece} bench={bench} />
          {piece.note && <p className="line-clamp-2 max-w-2xl shrink-0 text-[15px] leading-relaxed text-muted-foreground">{said(piece.note)}</p>}
          <FitDiagram piece={piece} />
          <AlgChoice piece={piece} bench={bench} />
          <AlgBand piece={piece} bench={bench} />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <Empty icon={Check}>{s.learningFilter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <span className="mr-auto min-w-0">
          <Trail trail={bench.trail} />
        </span>
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

/** An intuitive step's workbench, or one whose algorithms are to come: what there is to do, as separate cards. */
function IntuitiveBench({ puzzle, method, entry, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const step = method.steps[entry.step]!,
    train = step.train && puzzle === "333",
    mastered = stepMastered(step, entry);
  const card = (action: string, icon: LucideIcon, title: string, line: string, primary = false, pressed?: boolean) => (
    <ActionCard key={action} primary={primary} pressed={pressed} icon={icon} title={tr(title)} text={tr(line)} action={action} onClick={run(action)} className={cn(touch ? "w-full" : "flex-1", pressed && "text-success")} />
  );
  const body = step.missing ? (
    <Empty icon={Info} title={tr("Algorithms to come")}>
      {said(step.missing)}
    </Empty>
  ) : (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <h2 className={cn("leading-none font-extrabold tracking-[-0.04em]", touch ? "text-[26px]" : "text-[40px]")}>{tr("An intuitive step")}</h2>
        <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground">{tr("Nothing to memorise here: understand the idea, then practise it in your solves.")}</p>
      </div>
      <div className={cn("flex w-full justify-center gap-3", touch && "flex-col")}>
        {train && card("trainingSetup:" + step.train, Dumbbell, "Train the cross", "Plan it in inspection, then count its moves", true)}
        {card("courseAlg:" + stepId(step), Check, mastered ? "Mastered" : "Mark as mastered", mastered ? "Undo if it still takes thought" : "When you do it without thinking", !train, mastered)}
      </div>
    </div>
  );
  if (touch) return body;
  return (
    <Surface className="min-w-0 gap-3 px-6 pt-5 pb-4" aria-label={tr("Workbench")}>
      <span className="shrink-0 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{tr("Workbench")}</span>
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-2">{body}</div>
      <div className="flex shrink-0 items-center gap-3 pt-1">
        <StepNav method={method} entry={entry} />
      </div>
    </Surface>
  );
}

/**
 * What a step teaches, as a list to pick the workbench's piece from: its own algorithms as rows, the set's cases as a
 * grid of numbered tiles under their group (the time on it, or New while to learn, faded); the set and the filter of
 * learned ones above.
 */
function Rail({ pieces, bench, touch = false, onPick }: { pieces: StepPieces; bench: Bench; touch?: boolean; onPick?: () => void }) {
  const { sets, chosen, inline, groups, count } = pieces,
    pick = (p: Piece) => (bench.pick(p.key), onPick?.());
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
      <nav aria-label={chosen ? tr("Cases") : tr("Algorithms")} className="-m-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
        {inline.filter((p) => shownByFilter(p.learned)).map((p) => (
          <button
            key={p.key}
            type="button"
            data-pick={p.key}
            aria-current={p === bench.piece ? "true" : undefined}
            onClick={() => pick(p)}
            className={cn(ROW, "flex shrink-0 items-center gap-3 px-2 py-1.5 aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground", touch && "min-h-14")}
          >
            <span className={cn(!p.learned && p !== bench.piece && "opacity-45 saturate-50")}>{p.diagram(52)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{said(p.name)}</span>
              <span className={cn("truncate text-xs", p === bench.piece ? "text-primary-foreground/75" : p.learned ? "text-muted-foreground" : "text-warning")}>{p.learned ? tr("Learned") : tr("To learn")}</span>
            </span>
          </button>
        ))}
        {groups.map(([group, members]) => {
          const shown = members.filter((p) => shownByFilter(p.learned)),
            learned = members.filter((p) => p.learned).length;
          if (!shown.length) return null;
          return (
            <section key={group} aria-label={tr(group)} className="flex shrink-0 flex-col gap-1.5 pt-2.5">
              <h3 className="flex justify-between px-1.5 text-[13px] font-extrabold text-muted-foreground">
                {tr(group)}
                <span className={cn(NUMERIC, "font-bold text-faint", learned === members.length && "text-success")}>
                  {learned} / {members.length}
                </span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                {shown.map((p) => {
                  const here = p === bench.piece,
                    st = s.stats.find((v) => v.caseId === p.caseId);
                  return (
                    <Tip key={p.key} content={p.sub ? `${p.name} · ${p.sub}` : p.name}>
                      <button
                        type="button"
                        data-pick={p.key}
                        aria-current={here ? "true" : undefined}
                        aria-label={`${p.name} · ${p.learned ? tr("Learned") : tr("To learn")}`}
                        onClick={() => pick(p)}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 pt-2 pb-1.5 transition-colors aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground",
                          p.learned ? "bg-muted hover:bg-accent" : "hover:bg-muted",
                          FOCUS,
                        )}
                      >
                        <span className={cn(!p.learned && !here && "opacity-45 saturate-50")}>{p.diagram(60)}</span>
                        <span className={cn(NUMERIC, "max-w-full truncate text-[17px] leading-none font-extrabold tracking-[-0.02em]")}>{p.short ?? p.name}</span>
                        <span className={cn(NUMERIC, "text-[11px] font-bold", here ? "text-primary-foreground/75" : p.learned ? "text-muted-foreground" : "text-warning")}>
                          {p.learned ? (st?.mean != null ? fmtTime(st.mean) : "–") : tr("New")}
                        </span>
                      </button>
                    </Tip>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </>
  );
}

/**
 * The step's sheet: where it stands, what it changes on the cube (before and after), its explanation and tips, then
 * training it and the timer.
 */
function StepSheet({ puzzle, method, entry, touch = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; touch?: boolean }) {
  const step = method.steps[entry.step]!,
    previous = method.steps[entry.step - 1],
    count = stepLearned(step, s.cases(), s.learned, entry),
    train = trainAction(puzzle, method, entry),
    learnedInSet = train ? s.cases().filter((c: any) => c.set === train.slice("train:".length) && s.learned.has(c.id)).length : 0;
  const content = (
    <>
      {!touch && (
        <div className="flex flex-col gap-2">
          <span className={cn(NUMERIC, "text-[13px] font-bold text-primary")}>{tr("Step {0} of {1}", { 0: entry.step + 1, 1: method.steps.length })}</span>
          <h2 className="text-[30px] leading-none font-extrabold tracking-[-0.04em]">{said(step.title)}</h2>
        </div>
      )}
      {puzzleInfo(puzzle).cubeSize && (
        <figure className="flex items-center justify-center gap-2 rounded-2xl bg-muted p-3" aria-label={tr("Before and after this step")}>
          {previous && (
            <>
              <StepCube puzzle={puzzle} step={previous} size={touch ? 56 : 66} />
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </>
          )}
          <StepCube puzzle={puzzle} step={step} size={touch ? 56 : 66} />
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
              {learnedInSet ? tr("Train the {0} learned", { 0: learnedInSet }) : tr("Learn a case to train it")}
            </Button>
          )}
          <Button action="nav:playground" icon={Timer} variant="secondary">
            {tr("Practise with the timer")}
          </Button>
          <StepNav method={method} entry={entry} touch />
        </div>
      )}
    </Surface>
  );
}

/**
 * The course's steps as a track across the whole width: each step a button with a ring filled as far as its algorithms
 * are learned (full and green once done; an intuitive step's full once mastered), the one shown on the accent, joined by
 * lines that stretch between them, green once the step they lead to is done. Each is a link to its step.
 */
function StepTrack({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const cases = s.cases();
  return (
    <nav aria-label={tr("Steps")} className="flex min-w-0 flex-1 items-center gap-2">
      {method.steps.map((st, i) => {
        const learned = stepLearned(st, cases, s.learned, entry),
          done = s.learnFinished || stepDone(st, cases, s.learned, entry),
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
                className={cn(buttonVariants({ variant: here ? "default" : "secondary" }), "min-w-0 shrink", here && "shrink-0")}
              >
                <ProgressRing done={false} share={done ? 1 : learned.total ? learned.learned / learned.total : 0} className={here ? "text-current" : done ? "text-success" : undefined} />
                <span className="truncate">{said(st.title)}</span>
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
      done = stepDone(st, cases, s.learned, entry),
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
      <Button action="nav:playground" icon={Timer} variant="default">
        {tr("Practise with the timer")}
      </Button>
      <Button action="learnMethods" icon={GraduationCap} variant="secondary">
        {tr("Learn another method")}
      </Button>
      {assisted(puzzle, method) && (
        <Button action="assisted" icon={Route} variant="ghost">
          {tr("Again with my cube")}
        </Button>
      )}
    </div>
  );
  const hero = (
    <div className={cn("flex flex-col justify-center gap-5", touch ? "px-5 py-6" : "")} data-finished>
      <span className="text-[13px] font-bold text-primary">{tr("Course finished · {0}", { 0: said(method.name) })}</span>
      <h2 className={cn("leading-[0.95] font-extrabold tracking-[-0.05em]", touch ? "text-[36px]" : "text-[60px]")}>
        {tr("{0} done.", { 0: said(method.name) })}
        <br />
        <span className="text-muted-foreground">{tr("Keep it in your hands.")}</span>
      </h2>
      <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
        {tr("You have been through every step of")} {said(method.name)}
        {tr(". Solve with it on the timer until it flows, then try a faster method.")}
      </p>
      {actions}
    </div>
  );
  const steps = (
    <section className="flex min-h-0 flex-col gap-2" aria-label={tr("Steps")}>
      <SectionHead title={tr("What you learned")} meta={tr("{0} of {1} steps learned", { 0: method.steps.length, 1: method.steps.length })} className="min-h-0 px-1" />
      <ol className="-m-1 flex min-h-0 flex-col gap-1.5 overflow-y-auto p-1">
        {method.steps.map((st) => {
          const learned = stepLearned(st, cases, s.learned, entry);
          return (
            <li key={st.title} className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-2.5">
              <StepCube puzzle={puzzle} step={st} size={34} />
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
      {assisted(puzzle, method) && <AssistedSolve />}
    </>
  );
}

/** The beginner 3×3 course can solve the player's own cube with them (AssistedSolve). */
const assisted = (puzzle: PuzzleId, method: SolvingMethod) => puzzle === "333" && method.id === "beginner";
function AssistedButton({ puzzle, method, phone = false }: { puzzle: PuzzleId; method: SolvingMethod; phone?: boolean }) {
  if (!assisted(puzzle, method)) return null;
  return phone ? (
    <Button action="assisted" icon={Route} variant="secondary" tip={tr("With my cube")} />
  ) : (
    <Button action="assisted" icon={Route} variant="secondary">
      {tr("With my cube")}
    </Button>
  );
}

/**
 * Desktop: the course's track across the top, then the step in three columns: what it teaches to pick from, the
 * workbench with one piece at a time, and the step's sheet.
 */
function DesktopCourse({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const progress = methodProgress(s.course, puzzle, method, s.cases(), s.learned),
    pieces = stepPieces(puzzle, method, entry),
    bench = useBench(pieces),
    hasPieces = pieces.count.total > 0;
  return (
    <div className={PAGE}>
      <header className="flex min-h-12 shrink-0 items-center gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <Back action="learnMethods" label="Every method" />
          <div className="flex flex-col">
            <h1 className="text-xl leading-tight font-extrabold tracking-[-0.03em]">{said(method.name)}</h1>
            <span className={cn(NUMERIC, "text-xs font-semibold text-muted-foreground")}>{tr("{0} of {1} steps learned", { 0: progress.done, 1: progress.total })}</span>
          </div>
        </div>
        <StepTrack puzzle={puzzle} method={method} entry={entry} />
        <AssistedButton puzzle={puzzle} method={method} />
      </header>
      {s.learnFinished ? (
        <Finished puzzle={puzzle} method={method} />
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-4", hasPieces ? "grid-cols-[21rem_minmax(0,1fr)_17.5rem] min-[1400px]:grid-cols-[24rem_minmax(0,1fr)_19rem]" : "grid-cols-[minmax(0,1fr)_19.5rem]")}>
          {hasPieces && (
            <Surface className="min-w-0 gap-3 p-3 pt-4">
              <Rail pieces={pieces} bench={bench} />
            </Surface>
          )}
          {hasPieces ? <Workbench bench={bench} /> : <IntuitiveBench puzzle={puzzle} method={method} entry={entry} />}
          <StepSheet puzzle={puzzle} method={method} entry={entry} />
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
    progress = methodProgress(s.course, puzzle, method, s.cases(), s.learned),
    step = method.steps[entry.step]!,
    done = stepDone(step, s.cases(), s.learned, entry),
    pieces = stepPieces(puzzle, method, entry),
    bench = useBench(pieces),
    hasPieces = pieces.count.total > 0;
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
                          <PieceHead piece={bench.piece} bench={bench} touch />
                        </div>
                        <PieceDiagram piece={bench.piece} size={136} />
                      </div>
                      <PieceFigures piece={bench.piece} bench={bench} touch />
                      {bench.piece.note && <p className="text-[15px] leading-relaxed text-muted-foreground">{said(bench.piece.note)}</p>}
                      <AlgChoice piece={bench.piece} bench={bench} touch />
                    </>
                  ) : (
                    <Empty icon={Check}>{s.learningFilter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>
                  )}
                </>
              ) : (
                <IntuitiveBench puzzle={puzzle} method={method} entry={entry} touch />
              )}
              <StepSheet puzzle={puzzle} method={method} entry={entry} touch />
            </div>
            {hasPieces && bench.piece && (
              <div className="flex shrink-0 flex-col gap-2 px-2 pt-2">
                {bench.trail.length > 0 && (
                  <span className="px-2">
                    <Trail trail={bench.trail} />
                  </span>
                )}
                <AlgBand piece={bench.piece} bench={bench} touch />
              </div>
            )}
            <FootBar>
              {hasPieces && trainAction(puzzle, method, entry) && <Button action={trainAction(puzzle, method, entry)} icon={Dumbbell} variant="secondary" tip={tr("Train")} />}
              <StepNav method={method} entry={entry} touch />
            </FootBar>
          </>
        )}
      </Surface>
      <PhoneSheet open={steps} onOpenChange={setSteps} title={tr("Steps")} description={tr("{0} of {1} steps learned", { 0: progress.done, 1: progress.total })} className="gap-0 px-2">
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
