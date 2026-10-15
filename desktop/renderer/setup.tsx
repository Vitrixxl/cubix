/**
 * The training's page, before the timer: the ways of training as a list on the left (arrows move, Enter starts), the
 * one chosen large on the right: the cross, a recognition run through a set, the learned cases (the recommended ones,
 * the slowest against the player's usual, and those picked by hand), whole sets, or free practice on any case. Phones
 * open the chosen one in a sheet. Learning new cases is the courses' work: a set with none learned leads to its course.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { METHODS } from "../../src/shared/methods";
import { CROSS_MOVES, CROSS_TARGET_LABELS, CROSS_TARGETS } from "../../src/shared/crossTraining";
import { recommendedWhy, trainingPool, type Recommendation } from "../../src/client/lib/trainingPicks";
import { groupBySet } from "../../src/client/lib/practiceCatalog";
import { smartCube } from "../../src/client/lib/smartCube";
import { caseDetail, hintsForStage, maskForStage } from "../../src/client/lib/caseState";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Dices, Eye, GraduationCap, Layers, Pause, Play, RotateCcw, Rotate3d, Shuffle, SkipForward, Target, Timer, X, type LucideIcon } from "lucide-react";
import { PlayerAlg, PlayerControls, PlayerCube, useAlgPlayer } from "./AlgPlayer";
import { algScene } from "../../src/client/lib/algPlayer";
import { Button as UiButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { store as s, matches, type TrainingMode } from "./store";
import { PhoneSheet } from "./phone";
import { Practice } from "./practice";
import { Cube } from "./Cube";
import { ActionToggle, Alg, Bar, Button, Choice, Diagram, Empty, FOCUS, MenuAction, Modal, NUMERIC, PAGE, PageHead, ProgressRing, ROW, SearchField, SectionHead, Segmented, Surface, TILE, plural, run, usePhone, useViewport } from "./ui";
import { CaseTile, TILES } from "./algorithms";
import { VirtualList, inRows, useColumns } from "./virtual";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** A case's time in seconds, to the hundredth. */
const sec = (ms: number) => (ms / 1000).toFixed(2);
/** Each stage's colour, as the catalogue draws it. */
const STAGE_FILL: Record<string, string> = { F2L: "bg-success", OLL: "bg-primary", PLL: "bg-lilac", ZBLL: "bg-warning" };
/** The seconds a case may be shown in a recognition run without a connected cube. */
const RECOGNITION_SECONDS = [1, 2, 3, 5, 8];
/** The course that teaches a set, if one does. */
function courseAction(setId: string) {
  const method = METHODS[s.puzzle as PuzzleId]?.find((m) => m.steps.some((step) => step.sets?.includes(setId)));
  return method ? `learnFrom:${s.puzzle}:${method.id}` : "nav:learn";
}

/** The sets of the puzzle with their cases and how many are learned: those with learned cases first. */
function useSets() {
  const cases = s.cases();
  return useMemo(() => {
    const bySet = groupBySet(cases);
    const sets: { set: any; all: any[]; learned: number }[] = s.allSets().flatMap((set: any) => {
      const all = bySet.get(set.id) ?? [];
      return all.length ? [{ set, all, learned: all.filter((c: any) => s.learned.has(c.id)).length }] : [];
    });
    return [...sets.filter((x) => x.learned), ...sets.filter((x) => !x.learned)];
  }, [cases, s.learned, s.learned.size]);
}
type Sets = ReturnType<typeof useSets>;

/** A connected cube times the recognition itself (on the 3×3, beside the desktop's timer). */
function useCubeRecognition() {
  const link = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status);
  return link === "on" && !usePhone() && s.puzzle === "333";
}

/** The set a recognition run goes through (`recognitionSet`: the one chosen, else the first with learned cases). */
const recognitionSet = (sets: Sets) => sets.find((x) => x.set.id === s.recognitionSet);

/** A way of training as the list shows it: its icon and name, then its number, large, with what it counts. */
type ModeRow = { id: TrainingMode; icon: LucideIcon; title: string; count: number; unit: string; share?: number; start: string; ready: boolean };

function modeRows(sets: Sets): ModeRow[] {
  const cases = s.cases(),
    pool = s.casesPool,
    learned = trainingPool(cases, s.learned, { picks: s.trainPicks, hand: [...s.selected] }).length,
    whole = trainingPool(cases, s.learned, { sets: s.trainSets }).length,
    known = sets.reduce((n, x) => n + x.learned, 0),
    total = sets.reduce((n, x) => n + x.all.length, 0),
    chosen = recognitionSet(sets),
    free = s.freePicks.filter((id) => s.find(id)).length;
  const rows: ModeRow[] = [
    { id: "cross", icon: Target, title: "Cross", count: s.crossMoves, unit: tr("moves"), start: "trainingStart:cross", ready: true },
    {
      id: "recognition", icon: Eye, title: "Recognition",
      count: chosen?.learned ?? 0, unit: chosen ? tr(chosen.set.label) : tr("cases"), share: chosen ? chosen.learned / chosen.all.length : 0,
      start: "trainingStart:recognition", ready: !!chosen?.learned,
    },
    { id: "learned", icon: GraduationCap, title: "Learned", count: learned, unit: tr(learned === 1 ? "case" : "cases"), start: "trainingStart:cases:practice", ready: !!pool.size },
    { id: "sets", icon: Layers, title: "Whole sets", count: whole, unit: tr(whole === 1 ? "case" : "cases"), share: total ? known / total : 0, start: "trainingStart:cases:practice", ready: !!pool.size },
    { id: "free", icon: Dices, title: "Free practice", count: free, unit: tr(free === 1 ? "case" : "cases"), start: "trainingStart:free", ready: !!free },
  ];
  return rows.filter((r) => r.id !== "cross" || s.puzzle === "333");
}

export function TrainingSetup() {
  const phone = usePhone(),
    sets = useSets(),
    rows = modeRows(sets),
    chosen = rows.find((r) => r.id === s.trainingMode) ?? rows.find((r) => r.id === "learned")!,
    [sheet, setSheet] = useState(false);
  const key = (e: React.KeyboardEvent<HTMLElement>) => {
    const i = rows.indexOf(chosen),
      next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : -1;
    if (e.key === "Enter" && chosen.ready) return void (e.preventDefault(), run(chosen.start)(e));
    if (!rows[next]) return;
    e.preventDefault();
    void s.action("trainingMode:" + rows[next].id);
    e.currentTarget.querySelector<HTMLElement>(`[data-action="trainingMode:${rows[next].id}"]`)?.focus();
  };
  return (
    <div className={PAGE} data-tour="training">
      {/* A desktop has the section's head above the page (shell.tsx). */}
      {phone && <PageHead title={tr("Training")} puzzle more={<MenuAction action="auf" icon={Shuffle}>{tr("Random AUF")}{" "}{s.randomAuf ? tr("· on") : tr("· off")}</MenuAction>} />}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-5">
        <div
          role={phone ? "navigation" : "radiogroup"}
          aria-label={tr("Ways of training")}
          onKeyDown={phone ? undefined : key}
          className="-m-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 md:gap-3"
        >
          {rows.map((row) => (
            <ModeTile key={row.id} row={row} checked={!phone && row === chosen} onPick={() => phone && setSheet(true)} />
          ))}
        </div>
        {!phone && <ModeHero mode={chosen} sets={sets} />}
      </div>
      {phone && (
        <PhoneSheet open={sheet} onOpenChange={setSheet} title={tr(chosen.title)} hideTitle className="flex max-h-[85svh] flex-col gap-3 overflow-y-auto px-3 pb-4">
          <ModeHero mode={chosen} sets={sets} phone />
        </PhoneSheet>
      )}
      <Modal
        id="pickCases"
        title={tr("Pick cases")}
        tall
        className="flex h-[min(86vh,760px)] flex-col sm:max-w-4xl"
      >
        <CasesPicker free={chosen.id === "free"} />
      </Modal>
    </div>
  );
}

/**
 * A way of training as a row to choose, like Learn's methods: its icon and name, its number large on the right,
 * over a bar where a share says something. The chosen one is checked and the only one in the tab order.
 */
function ModeTile({ row, checked, onPick }: { row: ModeRow; checked: boolean; onPick: () => void }) {
  const phone = usePhone(),
    Icon = row.icon;
  return (
    <button
      type="button"
      role={phone ? undefined : "radio"}
      aria-checked={phone ? undefined : checked}
      tabIndex={phone || checked ? 0 : -1}
      data-action={"trainingMode:" + row.id}
      onClick={(e) => {
        run("trainingMode:" + row.id)(e);
        onPick();
      }}
      className={cn(TILE, "group/card flex shrink-0 flex-col gap-3 p-4 md:flex-1 md:justify-center md:p-5")}
    >
      <span className="flex items-center gap-3 md:gap-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted text-muted-foreground transition-colors group-hover/card:bg-accent", checked && "text-primary")}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-[-0.02em] md:text-xl">{tr(row.title)}</span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn(NUMERIC, "text-2xl leading-none font-extrabold tracking-[-0.03em] md:text-[32px]", row.count ? "text-foreground" : "text-faint")}>{row.count}</span>
          <span className="mt-1 max-w-28 truncate text-xs text-muted-foreground">{row.unit}</span>
        </span>
      </span>
      {row.share !== undefined && <Bar ratio={row.share} className="w-full" label={tr("Learned")} />}
    </button>
  );
}

/** The way of training chosen, large: what it needs chosen, then its start. */
function ModeHero({ mode, sets, phone = false }: { mode: ModeRow; sets: Sets; phone?: boolean }) {
  const learned = sets.reduce((n, x) => n + x.learned, 0);
  return (
    <div className={cn("flex min-h-0 flex-col gap-4", !phone && "h-full")}>
      {mode.id === "cross" ? (
        <CrossCard />
      ) : mode.id === "recognition" ? (
        <RecognitionCard sets={sets} phone={phone} />
      ) : mode.id === "learned" ? (
        <>
          <Recommended learned={learned} phone={phone} />
          <HandCard learned={learned} />
          <CasesBar />
        </>
      ) : mode.id === "sets" ? (
        <>
          <SetsCard sets={sets} phone={phone} />
          <CasesBar />
        </>
      ) : (
        <FreeCard />
      )}
    </div>
  );
}

/** What the cases' training drills, summed up (the recommended, the whole sets, those by hand), and its start. */
function CasesBar() {
  const pool = s.casesPool,
    parts = s.trainingParts("cases");
  return (
    <Surface className="shrink-0 gap-3 rounded-[22px] bg-muted px-5 py-3.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <strong className={cn(NUMERIC, "text-3xl font-extrabold tracking-[-0.04em]")}>{pool.size}</strong>
        <span className="text-sm font-semibold text-faint">{tr(pool.size === 1 ? "case" : "cases")}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted-foreground">{said(parts.join(" · "))}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip={tr("Random AUF · Alt+A")}>
          {tr("Random AUF")}
        </ActionToggle>
        <Button action="trainingStart:cases:practice" variant="default" icon={Play} disabled={!pool.size}>
          {tr("Train")}
        </Button>
      </div>
    </Surface>
  );
}

/** Free practice: cases picked by hand among every case of the puzzle, learned or not, a few of them shown; its start. */
function FreeCard() {
  const picks = new Set(s.freePicks),
    picked = s.cases().filter((c: any) => picks.has(c.id)),
    shown = picked.slice(0, 18);
  return (
    <Card title={tr("Free practice")} className="min-h-0 flex-1">
      {picked.length ? (
        <div className="flex min-h-0 flex-wrap content-start items-center gap-1.5 overflow-hidden">
          {shown.map((c: any) => (
            <Diagram key={c.id} c={c} size={44} />
          ))}
          {picked.length > shown.length && <span className={cn(NUMERIC, "px-1 text-sm font-semibold text-faint")}>+{picked.length - shown.length}</span>}
        </div>
      ) : (
        <Empty icon={Dices} title={tr("No case picked")} className="py-6" />
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm text-muted-foreground">{picked.length ? plural(picked.length, "case") : tr("None picked by hand")}</span>
        <Button action="menu:pickCases" variant="outline">{tr("Pick…")}</Button>
        <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip={tr("Random AUF · Alt+A")}>
          {tr("Random AUF")}
        </ActionToggle>
        <Button action="trainingStart:free" variant="default" icon={Play} disabled={!picked.length}>
          {tr("Train")}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Recognition: one set to go through, each with how many of its cases are learned (a set with none leads to its
 * course); without a connected cube, the seconds each case is shown. Its start.
 */
function RecognitionCard({ sets, phone }: { sets: Sets; phone: boolean }) {
  const chosen = recognitionSet(sets),
    cube = useCubeRecognition();
  return (
    <Card title={tr("Recognition")} className={cn(!phone && "min-h-0 flex-1")}>
      <div className={cn("-mx-1 flex flex-col gap-1.5 px-1", !phone && "min-h-0 overflow-y-auto")} role="radiogroup" aria-label={tr("Set")}>
        {sets.map(({ set, all, learned }) =>
          learned ? (
            <button
              key={set.id}
              type="button"
              role="radio"
              aria-checked={set.id === chosen?.set.id}
              data-action={"recognitionSet:" + set.id}
              onClick={run("recognitionSet:" + set.id)}
              className={cn("grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl bg-muted px-3.5 py-2.5 text-left transition-colors hover:bg-accent aria-checked:bg-accent", FOCUS)}
            >
              <b className="flex items-center gap-2 text-[15px] font-bold">
                {tr(set.label)}
                {set.id === chosen?.set.id && <Check className="size-4 text-primary" aria-hidden="true" />}
              </b>
              <span className={cn(NUMERIC, "text-[13px] font-semibold text-faint")}>{tr("{0} learned of {1}", { 0: learned, 1: all.length })}</span>
              <Pips learned={learned} total={all.length} fill={STAGE_FILL[set.stage] ?? "bg-primary"} />
            </button>
          ) : (
            <CourseRow key={set.id} set={set} />
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip={tr("Random AUF · Alt+A")}>
          {tr("Random AUF")}
        </ActionToggle>
        {chosen && hintsForStage(chosen.set.stage) && (
          <ActionToggle action="recognitionBack" pressed={s.recognitionBack} icon={Rotate3d} tip={tr("Show the stickers hidden at the back")}>
            {tr("Back stickers")}
          </ActionToggle>
        )}
        {cube ? (
          <span className="flex-1" />
        ) : (
          <span className="flex min-w-max grow items-center gap-2">
            <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
            <Choice prefix="recognitionSeconds:" label={tr("Seconds per case")} value={String(s.recognitionSeconds)} options={RECOGNITION_SECONDS.map((n) => ({ id: String(n), label: tr("{0} s", { 0: n }) }))} />
          </span>
        )}
        <Button action="trainingStart:recognition" variant="default" icon={Play} disabled={!chosen?.learned}>
          {tr("Start")}
        </Button>
      </div>
    </Card>
  );
}

/** A set with nothing learned: the way to its course. */
function CourseRow({ set }: { set: any }) {
  return (
    <button
      type="button"
      data-action={courseAction(set.id)}
      onClick={run(courseAction(set.id))}
      className={cn("flex shrink-0 items-center justify-between gap-3 rounded-2xl px-3.5 py-2 text-left text-faint transition-colors hover:bg-muted hover:text-muted-foreground", FOCUS)}
    >
      <b className="text-sm font-bold">{tr(set.label)}</b>
      <span className="flex items-center gap-1 text-[13px] font-semibold">
        {tr("none learned · see Courses")}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}

/** The runs whose countdown is over: a new run (Again) counts down again, one left and come back to goes on. */
const counted = new WeakSet<object>();
/**
 * A running recognition: three seconds counted down, then cases drawn at random from the set until it is closed, timed
 * on a connected cube like any training, else each shown for a set time; once closed, how many cases were seen.
 */
export function RecognitionPractice() {
  const runOf = s.recognition,
    cube = useCubeRecognition(),
    [, setStarted] = useState<object | null>(null);
  if (!runOf || runOf.closed || !runOf.ids.length) return <RecognitionDone />;
  if (!counted.has(runOf)) return <Countdown onDone={() => (counted.add(runOf), setStarted(runOf))} />;
  return cube ? <Practice /> : <TimedRecognition />;
}

/** The recognition's page around what it shows: its head, the set and the cases seen so far. */
function RecognitionPage({ children }: { children: React.ReactNode }) {
  return (
    <div className={PAGE}>
      <PageHead title={tr("Recognition")} lead={<Button action="trainingSetup" icon={ChevronLeft} tip={tr("Change what to train")} />} sub={said(s.trainingParts("recognition").join(" · "))} />
      {children}
    </div>
  );
}

/** Three, two, one, large, before the first case. */
function Countdown({ onDone }: { onDone: () => void }) {
  const [left, setLeft] = useState(3);
  useEffect(() => {
    const timeout = setTimeout(() => (left > 1 ? setLeft(left - 1) : onDone()), 1000);
    return () => clearTimeout(timeout);
  }, [left]);
  return (
    <RecognitionPage>
      <div className="flex min-h-0 flex-1 items-center justify-center" aria-live="polite">
        <b key={left} className={cn(NUMERIC, "text-[clamp(6rem,22vh,12rem)] leading-none font-extrabold tracking-[-0.05em] text-primary motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75")}>{left}</b>
      </div>
    </RecognitionPage>
  );
}

/** A closed run: how many cases were seen, then the way to go again or to change the set. */
function RecognitionDone() {
  const done = s.recognition?.done ?? 0;
  return (
    <RecognitionPage>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <b className={cn(NUMERIC, "text-[clamp(4.5rem,16vh,8rem)] leading-none font-extrabold tracking-[-0.05em]")}>{done}</b>
          <span className="text-lg font-semibold text-muted-foreground">{tr(done === 1 ? "case seen" : "cases seen")}</span>
        </div>
        <div className="flex gap-2">
          <Button action="trainingStart:recognition" variant="default" icon={RotateCcw}>{tr("Again")}</Button>
          <Button action="trainingSetup">{tr("Change")}</Button>
        </div>
      </div>
    </RecognitionPage>
  );
}

/** The way out of a run, at the foot of the page on the right: its count shows next. */
const RecognitionClose = () => (
  <Button action="recognitionClose" icon={X}>
    {tr("Close")}
  </Button>
);

/** A recognition run without a cube: each case large for the seconds chosen, a bar running out under it, then the next. */
function TimedRecognition() {
  const runOf = s.recognition!,
    c = runOf.current && s.training?.id === runOf.current ? s.find(runOf.current) : null;
  return (
    <RecognitionPage>
      {c ? <RecognitionCase key={runOf.done} c={c} /> : <div className="flex-1" />}
      <div className="flex shrink-0 justify-end">
        <RecognitionClose />
      </div>
    </RecognitionPage>
  );
}

/**
 * A case alone, never named, the bar running out under it. Space or a click pauses it: the bar stops, the cube can be
 * turned and its algorithm shows, played only when asked (RecognitionSolution); a second press moves on. Nothing is recorded.
 */
function RecognitionCase({ c }: { c: any }) {
  const { w, h } = useViewport(),
    bar = useRef<HTMLDivElement>(null),
    animation = useRef<Animation | undefined>(undefined),
    // The seconds the case was seen before the pause; null while the bar runs.
    [paused, setPaused] = useState<number | null>(null),
    size = Math.round(Math.max(160, Math.min(h * 0.55, w * 0.8, 480))),
    next = () => void s.action("next"),
    // Every cube's case in 3D, its hidden stickers shown unless turned off; other puzzles their diagram.
    cubeSize = c.cube_size ?? puzzleInfo(s.puzzle as PuzzleId).cubeSize,
    // The case held as drawn for it (`recognitionTurn`): other side colours, the same pattern.
    scene = useMemo(() => (cubeSize ? algScene("", cubeSize, maskForStage(c.stage), s.training.setup, s.recognition!.turn) ?? undefined : undefined), [cubeSize, s.training.setup, s.recognition!.turn]);
  useEffect(() => {
    const running = bar.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: s.recognitionSeconds * 1000, fill: "forwards" });
    animation.current = running;
    running?.finished.then(next, () => {});
    return () => running?.cancel();
  }, []);
  const press = () => {
    if (paused !== null) return next();
    animation.current?.pause();
    setPaused(Number(animation.current?.currentTime ?? 0) / 1000);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || s.overlay) return;
      e.preventDefault();
      e.stopPropagation();
      press();
    };
    // Before the player's buttons, which Space would press.
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [paused]);
  const timeBar = (
    <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
      <div ref={bar} className="h-full origin-left rounded-full bg-primary" />
    </div>
  );
  if (paused !== null)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className={cn(NUMERIC, "flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground")}>
            <Pause className="size-3" />
            {tr("{0} s", { 0: paused.toFixed(1) })}
          </span>
          <b className="text-xl font-extrabold tracking-[-0.02em]">{c.id}</b>
          <span className="text-muted-foreground">{tr(caseDetail(c) ?? c.group)}</span>
        </div>
        {cubeSize && s.training?.algorithm ? (
          <RecognitionSolution c={c} cubeSize={cubeSize} size={Math.round(size * 0.85)} />
        ) : (
          <Alg text={s.training?.algorithm ?? ""} size={28} />
        )}
        <UiButton onClick={next} data-action="recognition:next">
          <SkipForward />
          {tr("Next")}
          <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground">{tr("Space")}</Kbd>
        </UiButton>
      </div>
    );
  return (
    <button type="button" onClick={press} className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-[26px]", FOCUS)} aria-label={tr("Show the algorithm")}>
      {cubeSize ? (
        <Cube scene={scene} setup={s.training.setup} cubeSize={cubeSize} mask={maskForStage(c.stage)} size={size} animated={false} hints={s.recognitionBack && hintsForStage(c.stage)} />
      ) : s.training?.svg ? (
        <div style={{ width: size, height: size }} className="[&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: s.training.svg }} />
      ) : (
        <Diagram c={c} size={size} />
      )}
      {timeBar}
    </button>
  );
}

/** The paused case on a cube to turn, its algorithm under it, played or stepped (the arrows) only when asked. */
function RecognitionSolution({ c, cubeSize, size }: { c: any; cubeSize: number; size: number }) {
  const player = useAlgPlayer(s.training.algorithm, cubeSize, maskForStage(c.stage), { setup: s.training.setup, turn: s.recognition!.turn, hints: s.recognitionBack && hintsForStage(c.stage) });
  useEffect(() => {
    if (!player) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") player.stepBack();
      else if (e.key === "ArrowRight") player.stepForward();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [player]);
  if (!player) return <Alg text={s.training.algorithm} size={28} />;
  return (
    <>
      <PlayerCube player={player} size={size} />
      <PlayerAlg player={player} text={s.training.algorithm} size={28} />
      <PlayerControls player={player} inline />
    </>
  );
}

/** A card of the page: its head, then its body. */
function Card({ title, head, className, children }: { title: React.ReactNode; head?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Surface className={cn("gap-3.5 px-5 py-4 md:px-6 md:py-5", className)}>
      <SectionHead title={title}>{head}</SectionHead>
      {children}
    </Surface>
  );
}

/** The learned cases slower than usual, each picked or not, with why; from training, from the solves or both. */
function Recommended({ learned, phone = false }: { learned: number; phone?: boolean }) {
  const all = s.recommended(),
    [source, setSource] = useState<"all" | Recommendation["source"]>("all"),
    both = all.some((r) => r.source === "solves") && all.some((r) => r.source === "training"),
    shown = both && source !== "all" ? all.filter((r) => r.source === source) : all,
    scale = Math.max(1, ...shown.map((r) => Math.max(r.time, r.usual) * 1.12)),
    picks = new Set(s.trainPicks);
  return (
    <Card
      title={<span className="text-xl font-extrabold tracking-[-0.03em] md:text-2xl">{tr("Recommended")}</span>}
      className={cn(!phone && "min-h-0")}
      head={
        both && (
          <Segmented
            label={tr("Where they are slow")}
            value={source}
            onChange={(id) => setSource(id as typeof source)}
            options={[
              { id: "all", label: tr("All") },
              { id: "training", label: tr("In training") },
              { id: "solves", label: tr("In your solves") },
            ]}
          />
        )
      }
    >
      {!learned ? (
        <Empty icon={GraduationCap} title={tr("Nothing learned yet")} className="my-auto py-8">
          <Button action="nav:learn" variant="default" tip={tr("Open the courses")}>{tr("Courses")}</Button>
        </Empty>
      ) : !shown.length ? (
        <Empty icon={Timer} title={tr("No recommendation yet")} className="my-auto py-8" />
      ) : (
        <ul className={cn("flex flex-col gap-2", !phone && "min-h-0 overflow-y-auto")}>
          {shown.map((r) => (
            <RecommendedRow key={r.id} r={r} scale={scale} picked={picks.has(r.id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A recommended case, in its own tile: picked or not, its diagram, name and why, then its time against its set's usual. */
function RecommendedRow({ r, scale, picked }: { r: Recommendation; scale: number; picked: boolean }) {
  const c = s.find(r.id);
  if (!c) return null;
  const Source = r.source === "solves" ? Rotate3d : Timer,
    why = recommendedWhy(r);
  return (
    <li>
      <label className="grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-2xl bg-muted px-3.5 py-2.5 transition-colors hover:bg-accent md:grid-cols-[auto_auto_minmax(0,1fr)_12.5rem]">
        <Checkbox checked={picked} onCheckedChange={() => void s.action("trainPick:" + r.id)} data-action={"trainPick:" + r.id} />
        <Diagram c={c} size={52} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <b className="truncate text-base font-extrabold">{tr(c.name)}</b>
            <span className="truncate text-[13px] font-semibold text-faint">{tr(c.setLabel)} · {tr(c.group)}</span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-faint">
              <Source className="size-3.5" aria-hidden="true" />
              {r.source === "solves" ? tr("seen in {0} of your solves", { 0: r.count }) : tr("{0} in training", { 0: plural(r.count, "attempt") })}
            </span>
            {why}
          </span>
        </span>
        <span className="col-start-3 flex flex-col gap-1.5 md:col-start-4">
          <span className="relative h-2 rounded-full bg-card" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-destructive" style={{ width: (r.time / scale) * 100 + "%" }} />
            <span className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ left: (r.usual / scale) * 100 + "%" }} />
          </span>
          <span className="flex items-baseline justify-between text-xs font-semibold text-faint">
            <span>{tr("usual {0} {1}", { 0: tr(c.setLabel), 1: sec(r.usual) })}</span>
            <strong className={cn(NUMERIC, "text-sm text-destructive")}>{tr("{0} s", { 0: sec(r.time) })}</strong>
          </span>
        </span>
      </label>
    </li>
  );
}

/** A set's learned share as dashes, up to forty of them. */
function Pips({ learned, total, fill }: { learned: number; total: number; fill: string }) {
  const n = Math.min(total, 40),
    lit = Math.round((learned / total) * n);
  return (
    <span className="col-span-2 flex h-1.5 gap-0.5" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={cn("flex-1 rounded-[2px]", i < lit ? fill : "bg-accent")} />
      ))}
    </span>
  );
}

/** Whole sets, their learned cases only; a set with none learned leads to its course. */
function SetsCard({ sets, phone }: { sets: ReturnType<typeof useSets>; phone: boolean }) {
  return (
    <Card title={tr("Whole sets")} className={cn(!phone && "min-h-0 shrink")}>
      <div className={cn("-mx-1 flex flex-col gap-1.5 px-1", !phone && "min-h-0 overflow-y-auto")}>
        {sets.map(({ set, all, learned }) => {
          const on = !!learned && s.trainSets.includes(set.id);
          return learned ? (
            <button
              key={set.id}
              type="button"
              aria-pressed={on}
              data-action={"trainSet:" + set.id}
              onClick={run("trainSet:" + set.id)}
              className={cn("grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl bg-muted px-3.5 py-2.5 text-left transition-colors hover:bg-accent aria-pressed:bg-accent", FOCUS)}
            >
              <b className="text-[15px] font-bold">{tr(set.label)}</b>
              <span className={cn(NUMERIC, "text-[13px] font-semibold text-faint")}>{tr("{0} learned of {1}", { 0: learned, 1: all.length })}</span>
              <Pips learned={learned} total={all.length} fill={STAGE_FILL[set.stage] ?? "bg-primary"} />
            </button>
          ) : (
            <button
              key={set.id}
              type="button"
              data-action={courseAction(set.id)}
              onClick={run(courseAction(set.id))}
              className={cn("flex shrink-0 items-center justify-between gap-3 rounded-2xl px-3.5 py-2 text-left text-faint transition-colors hover:bg-muted hover:text-muted-foreground", FOCUS)}
            >
              <b className="text-sm font-bold">{tr(set.label)}</b>
              <span className="flex items-center gap-1 text-[13px] font-semibold">
                {tr("none learned · see Courses")}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** The cases picked by hand, a few of them shown, and the way to pick them. */
function HandCard({ learned }: { learned: number }) {
  const picked = s.cases().filter((c: any) => s.selected.has(c.id) && s.learned.has(c.id)),
    shown = picked.slice(0, 7);
  return (
    <Card title={tr("Case by case")} className="shrink-0">
      {!!picked.length && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((c: any) => (
            <Diagram key={c.id} c={c} size={40} />
          ))}
          {picked.length > shown.length && <span className={cn(NUMERIC, "px-1 text-sm font-semibold text-faint")}>+{picked.length - shown.length}</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-muted-foreground">{picked.length ? tr("{0} picked by hand", { 0: plural(picked.length, "case") }) : tr("None picked by hand")}</span>
        <Button action="menu:pickCases" variant="outline" disabled={!learned}>{tr("Pick…")}</Button>
      </div>
    </Card>
  );
}

/** The cross: what to build by its number of moves, picked in one grid, and its start. */
function CrossCard() {
  const moves = [...new Set(CROSS_TARGETS.flatMap((t) => CROSS_MOVES[t]))].sort();
  return (
    <Card title={tr("Cross")} className="shrink-0">
      <div className="grid grid-cols-[4.5rem_repeat(var(--n),minmax(0,1fr))] items-center gap-1" style={{ "--n": moves.length } as React.CSSProperties} role="radiogroup" aria-label={tr("Cross")}>
        <span />
        {moves.map((n) => (
          <span key={n} className={cn(NUMERIC, "text-center text-xs font-bold text-faint")}>{n}</span>
        ))}
        {CROSS_TARGETS.map((t) => [
          <span key={t} className="text-xs font-bold text-faint">{tr(CROSS_TARGET_LABELS[t])}</span>,
          ...moves.map((n) =>
            CROSS_MOVES[t].includes(n) ? (
              <button
                key={t + n}
                type="button"
                role="radio"
                aria-checked={s.crossTarget === t && s.crossMoves === n}
                aria-label={tr("{0} in {1} moves", { 0: tr(CROSS_TARGET_LABELS[t]), 1: n })}
                data-action={"crossTarget:" + t}
                onClick={run("crossTarget:" + t, "crossMoves:" + n)}
                className={cn("h-6 rounded-lg bg-muted transition-colors hover:bg-accent aria-checked:bg-primary", FOCUS)}
              />
            ) : (
              <span key={t + n} />
            ),
          ),
        ])}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-muted-foreground">{tr("{0} in {1} moves", { 0: tr(CROSS_TARGET_LABELS[s.crossTarget]), 1: s.crossMoves })}</span>
        <Button action="trainingStart:cross" variant="outline" icon={Play} tip={tr("Start the cross")}>{tr("Start")}</Button>
      </div>
    </Card>
  );
}

type PickerRow = { key: string; end?: boolean; last?: boolean } & (
  | { kind: "set"; set: any; chosen: any[]; count: number; open: boolean }
  | { kind: "group"; set: any; group: string; members: any[]; top: boolean }
  | { kind: "tiles"; cases: any[]; top: boolean }
);

/** The cases to pick by hand, set by set (the learned ones, every one for free practice); the count picked, the search and Clear above them. */
function CasesPicker({ free = false }: { free?: boolean }) {
  const cases = free ? s.cases() : s.cases().filter((c: any) => s.learned.has(c.id)),
    picks = free ? new Set(s.freePicks) : s.selected,
    phone = usePhone(),
    list = useRef<HTMLDivElement>(null),
    // As many columns as TILES' auto-fill grid holds (5.25rem, 6px apart), so the rows drawn one by one line up.
    columns = useColumns(list, 84, 6);
  // Every set's row, then its groups opened: a group's name, its cases a row at a time. `end` closes a group, `last` a set.
  const rows: PickerRow[] = [];
  for (const set of s.allSets()) {
    const all = s.setCases(set.id).filter((c: any) => free || s.learned.has(c.id)),
      chosen = all.filter((c: any) => matches(c, s.query)),
      count = chosen.filter((c: any) => picks.has(c.id)).length,
      open = s.selectorOpen[set.id] ?? (count > 0 || !!s.query);
    if (!chosen.length) continue;
    rows.push({ kind: "set", key: set.id, set, chosen, count, open });
    if (!open) continue;
    const groups = [...new Set(chosen.map((c: any) => c.group))] as string[];
    for (const group of groups) {
      const members = chosen.filter((c: any) => c.group === group),
        key = set.id + ":" + group;
      if (groups.length > 1) rows.push({ kind: "group", key, set, group, members, top: true });
      inRows(members, columns).forEach((row, i) => rows.push({ kind: "tiles", key: key + ":" + i, cases: row, top: groups.length === 1 && !i }));
      rows[rows.length - 1]!.end = true;
    }
    rows[rows.length - 1]!.last = true;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className={cn(NUMERIC, "text-[28px] leading-none font-extrabold tracking-[-0.03em]")}>{cases.filter((c: any) => picks.has(c.id)).length}</span>
          <span className="text-sm text-muted-foreground">{tr("picked")}</span>
        </span>
        <div className="flex items-center gap-2 max-md:w-full">
          <SearchField
            value={s.query}
            onChange={(query) => {
              s.query = query;
              s.emit();
            }}
            placeholder="Search cases…"
            label="Search cases"
            className="w-56 max-md:w-full"
          />
          <Button action="clear" disabled={!picks.size}>{tr("Clear")}</Button>
        </div>
      </header>
      {/* The set and group rows reach 8px past their text (-mx-2): the list's padding holds them, so nothing scrolls sideways. */}
      <div ref={list} className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
        <VirtualList
          items={rows}
          scroller={list}
          estimate={(i) => (rows[i]!.kind === "tiles" ? 112 : rows[i]!.kind === "set" ? 40 : 30)}
          rowKey={(v) => v.key}
          row={(v, _, measure) => {
            if (v.kind === "set") {
              const { set, chosen, count, open } = v;
              return (
                <div ref={measure} className={cn(v.last && "pb-2")}>
                  <div className={cn(ROW, "-mx-2 flex items-center gap-2 pr-1")}>
                    <button
                      type="button"
                      data-action={"selectorToggle:" + set.id}
                      onClick={run("selectorToggle:" + set.id)}
                      className={cn("flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left", FOCUS)}
                    >
                      {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      <ProgressRing done={count === chosen.length} share={count / chosen.length} />
                      <span className="truncate text-[15px] font-bold">{tr(set.label)}</span>
                      <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                        {count} / {chosen.length}
                      </span>
                    </button>
                    <Button action={"selectSet:" + set.id} className="text-muted-foreground">
                      {count === chosen.length ? tr("Unselect all") : tr("Select all")}
                    </Button>
                  </div>
                </div>
              );
            }
            // A group's rows: its name (when the set has several) then its cases, a row of the grid at a time.
            const pad = cn(v.top ? "pt-2" : "pt-1", v.end && (v.last ? "pb-5" : "pb-3"));
            if (v.kind === "group")
              return (
                <div ref={measure} className={pad}>
                  <button
                    type="button"
                    data-action={"selectGroup:" + v.set.id + ":" + v.group}
                    onClick={run("selectGroup:" + v.set.id + ":" + v.group)}
                    className={cn("flex w-fit items-center gap-2 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground", FOCUS)}
                  >
                    {tr(v.group)}
                    <span className={NUMERIC}>
                      {v.members.filter((c: any) => picks.has(c.id)).length} / {v.members.length}
                    </span>
                  </button>
                </div>
              );
            return (
              <div ref={measure} className={cn(TILES, pad)} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {v.cases.map((c: any) => (
                  <CaseTile key={c.id} c={c} touch={phone} action={"select:" + c.id} pressed={picks.has(c.id)} />
                ))}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
