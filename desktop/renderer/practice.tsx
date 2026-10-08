/** The timer page and a running training: prompt, timer, session figures and the times list. */
import { isReviewMode, learningTrackOf } from "../../src/client/lib/dailyLearning";
import { CROSS_MOVES, CROSS_TARGET_LABELS, CROSS_TARGETS, heldMoves } from "../../src/shared/crossTraining";
import { heldScramble } from "../../src/shared/puzzles";
import { isPolyPuzzle } from "../../src/shared/puzzleScene";
import { practiceSummary, sessionExtremes, solveTone, trainingSessionRows, type Metric } from "../../src/client/lib/practiceSummary";
import { PracticeTimer, timerHint, type TimerPhase, type TimerSnapshot } from "../../src/client/lib/practiceTimer";
import { TONE_TEXT } from "../../src/client/lib/tone";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { smartCube } from "../../src/client/lib/smartCube";
import "./dev/devTools";
import { LiveCube } from "./LiveCube";
import { CaseStatus, ScrambleStatus, SmartScramble, useScrambleProgress } from "./SmartScramble";
import { useLatestAnalysis, useSmartCase, useSmartSolve } from "./smartSolve";
import { caseGoal, caseMatcher, goalReached, setupTurns } from "../../src/client/lib/smartTraining";
import { SolveStrip } from "./SolveAnalysis";
import { balancedColumns, cellLines, FiguresBand, useWidth } from "./FiguresEditor";
import {
  Ban,
  Bluetooth,
  BluetoothConnected,
  BluetoothSearching,
  Box,
  Check,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GraduationCap,
  LayoutList,
  ListOrdered,
  MessageSquare,
  PlayCircle,
  Plus,
  Rotate3d,
  RotateCcw,
  Shuffle,
  Trash2,
  Trophy,
  Undo2,
  X,
} from "lucide-react";
import { store as s, timesAlwaysShown } from "./store";
import { Cube } from "./Cube";
import { fmtTime, fmtSolve, parseTypedTime, effective, TIME_ENTRIES } from "../../src/client/lib/format";
import {
  ActionToggle,
  Alg,
  Button,
  Choice,
  Diagram,
  Empty,
  FADE,
  FOCUS,
  Figure,
  LABEL,
  NUMERIC,
  PAGE,
  MenuAction,
  MenuChoice,
  PageHead,
  PenaltyToggles,
  ROW,
  SectionHead,
  SelectMenu,
  SolveActions,
  SolveMenu,
  Strip,
  Surface,
  isPhone,
  plural,
  run,
  useViewport,
} from "./ui";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneSheet, TouchAction, TouchBar } from "./phone";
import { language, tr } from "../../src/client/i18n";
import { isMinxScramble, said } from "./base";

/** Keys typed into a field, a menu or a dialog never reach the timer. */
const typingInto = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement).closest?.("input,textarea,select,[role=menu],[role=dialog],[role=listbox]");

/**
 * The timer page's timer: Space (or a touch on phones) holds, releases and stops. It re-renders the page only when
 * its phase changes; the running time is drawn by `LiveDigits`. `manual` false: something else starts it (a connected
 * cube's first turn once scrambled), keys only stop it.
 */
function useTimer(enabled: boolean, manual = true) {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const enabledRef = useRef(enabled),
    manualRef = useRef(manual),
    /** What a smart cube knows of a solve stopped now: its turns, and its penalty when the cube is not solved yet. */
    smartRef = useRef<() => { penalty?: "none" | "+2" | "dnf"; solution: string | null } | undefined>(() => undefined);
  enabledRef.current = enabled;
  manualRef.current = manual;
  const [timer] = useState(() => new PracticeTimer({
    canStart: () => enabledRef.current,
    onStop: ms => {
      const smart = smartRef.current();
      void s.save(ms, smart?.penalty, smart?.solution);
    },
    // Only this page draws the phase; the fade of the rest follows `s.running` (see the store), without drawing the app.
    onChange: snapshot => {
      setSnapshot(snapshot);
      s.running = snapshot.phase === "running";
      s.learningFrozen = ["holding", "ready", "running"].includes(snapshot.phase);
    },
  }));
  const { press, release } = timer;
  // Inputs are timed by their events' own time stamps (see `PracticeTimer`).
  const stop = (timeStamp?: number) => { if (timer.snapshot.phase === "running") timer.press(timeStamp); };
  useEffect(() => { timer.reset(); }, [s.timerEpoch, timer]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (timer.snapshot.phase === "running") {
        e.preventDefault();
        stop(e.timeStamp);
        return;
      }
      if (typingInto(e) || s.overlay || !manualRef.current || (s.entry === "typing" && s.page === "playground")) return;
      if (e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // The button focused last must not be clicked by the release.
        (document.activeElement as HTMLElement | null)?.blur?.();
        press();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") release(e.timeStamp);
    };
    const blur = timer.cancelArming;
    const pointer = (e: PointerEvent) => stop(e.timeStamp);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    addEventListener("pointerdown", pointer);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
      removeEventListener("pointerdown", pointer);
      timer.dispose();
      s.running = false;
      s.learningFrozen = false;
    };
  }, []);
  // A stopped timer rests like an idle one.
  const phase: Exclude<TimerPhase, "stopped"> = snapshot.phase === "stopped" ? "idle" : snapshot.phase;
  return { phase, elapsed: snapshot.elapsed, startedAt: snapshot.startedAt, press, release, begin: timer.begin, finish: timer.finish, smart: smartRef };
}

/** The side of the largest square inside an element's padding box, kept up to date as it resizes. */
export function useSquare(element: HTMLElement | null) {
  const [side, setSide] = useState(0);
  useLayoutEffect(() => {
    if (!element) return void setSide(0);
    const measure = () => {
      const style = getComputedStyle(element),
        width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setSide(Math.max(0, Math.floor(Math.min(width, height))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return side;
}

/** The class of a timer's milliseconds: smaller, and muted unless armed. */
const fractionClass = (armed: boolean) => cn("text-[0.62em] tracking-[-0.03em]", !armed && "text-[color:color-mix(in_oklch,var(--muted-foreground)_78%,var(--primary))]");

/**
 * The running digits: tinted with the accent, the milliseconds smaller in a muted version of it; red while holding,
 * green once ready. `live`: the characters are written by the caller into this (a box without a box of its own).
 */
export function Digits({ text, phase, className, digitsRef, live, "data-tour": tour }: { text: string; phase: string; className?: string; digitsRef?: React.Ref<HTMLDivElement>; live?: React.Ref<HTMLSpanElement>; "data-tour"?: string }) {
  const armed = phase === "holding" || phase === "ready";
  return (
    <div
      ref={digitsRef}
      data-tour={tour}
      className={cn(
        "flex items-baseline font-sans leading-none font-semibold tracking-[-0.04em] tabular-nums whitespace-nowrap transition-[transform,color] duration-[380ms,80ms] ease-[cubic-bezier(0.2,0,0,1)] will-change-transform",
        armed ? (phase === "holding" ? "text-destructive" : "text-success") : "text-[color:color-mix(in_oklch,var(--foreground)_85%,var(--primary))]",
        className,
      )}
      style={{ "--chars": Math.max(6, text.length) } as React.CSSProperties}
    >
      {live ? (
        <span ref={live} className="contents" />
      ) : (
        text.split("").map((ch, i) => (
          <span key={i} className={text.includes(".") && i > text.indexOf(".") ? fractionClass(armed) : undefined}>
            {said(ch)}
          </span>
        ))
      )}
    </div>
  );
}

/**
 * The digits of a timer: `text` at rest, the time since `startedAt` while `phase` is running. While it runs, each frame
 * writes the time into the digits itself, a span per character as React draws them: nothing is drawn again by React.
 */
export const LiveDigits = memo(function LiveDigits({ startedAt, text, digitsRef, ...digits }: { startedAt: number } & React.ComponentProps<typeof Digits>) {
  const running = digits.phase === "running",
    box = useRef<HTMLDivElement | null>(null),
    live = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!running) return;
    const chars = live.current!,
      fraction = fractionClass(false);
    let frame = 0;
    const tick = () => {
      const time = fmtTime(performance.now() - startedAt),
        point = time.indexOf(".");
      if (chars.childElementCount !== time.length) {
        while (chars.childElementCount > time.length) chars.lastElementChild!.remove();
        while (chars.childElementCount < time.length) chars.append(document.createElement("span"));
        box.current?.style.setProperty("--chars", String(Math.max(6, time.length)));
      }
      for (let i = 0; i < time.length; i++) {
        const span = chars.children[i]!,
          small = point >= 0 && i > point;
        if (span.textContent !== time[i]) span.textContent = time[i]!;
        if (small !== span.hasAttribute("class")) small ? (span.className = fraction) : span.removeAttribute("class");
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [running, startedAt]);
  return (
    <Digits
      {...digits}
      text={running ? fmtTime(performance.now() - startedAt) : text}
      live={running ? live : undefined}
      digitsRef={(element) => {
        box.current = element;
        if (typeof digitsRef === "function") digitsRef(element);
        else if (digitsRef) digitsRef.current = element;
      }}
    />
  );
});

export function Practice() {
  useEffect(() => {
    const tick = () => { void s.refreshLearning().catch(s.fail); };
    tick();
    const interval = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(interval); window.removeEventListener("focus", tick); };
  }, []);
  const learning = s.learningMode !== "practice";
  const reviewing = isReviewMode(s.learningMode);
  const track = learningTrackOf(s.learningMode);
  const { w, h } = useViewport(),
    mobile = isPhone(w),
    // First-block training runs like the timer, on its own scrambles.
    cross = s.crossTraining,
    training = s.page === "training" && !cross,
    // Wide windows keep the times beside the stage; narrower ones open them on demand.
    timesAlways = timesAlwaysShown(w, training),
    timesColumn = !mobile && (timesAlways || s.showTimes),
    compact = w <= 900 || h <= 760;
  const Stage = mobile ? Surface : "div";
  const cubeLink = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status),
    connectable = typeof CUBIX_DEV !== "undefined" && CUBIX_DEV && !mobile && s.puzzle === "333",
    // A connected cube stands in the middle of the 3×3 timer, as it is in hand; the scramble follows it turn by turn,
    // and its preview stays at the top as the state to reach. The cube starts the timer itself, once scrambled.
    live = connectable && cubeLink === "on",
    // A training follows the cube on the cases it can see set up and solved (F2L, OLL, PLL, ZBLL).
    trainee = training ? s.find(s.training?.id) : null,
    goal = trainee ? caseGoal(trainee) : null,
    liveCase = live && training && !!goal;
  const enabled =
      !s.saving &&
      !s.generating &&
      !s.error &&
      (!training || (!!s.practiceSelected.size && s.practiceSelected.has(s.training?.id))),
    timer = useTimer(enabled, !(live && (!training || liveCase))),
    typing = s.page === "playground" && s.entry === "typing";
  const [typed, setTyped] = useState("");
  const typedRef = useRef<HTMLInputElement>(null);
  // While a solve runs everything else fades out and the digits glide to the middle of the screen, then back.
  const digitsRef = useRef<HTMLDivElement>(null),
    running = timer.phase === "running";
  useLayoutEffect(() => {
    const digits = digitsRef.current;
    if (!digits) return;
    if (!running) return void (digits.style.transform = "");
    const r = digits.getBoundingClientRect();
    digits.style.transform = `translate(${innerWidth / 2 - (r.left + r.width / 2)}px, ${innerHeight / 2 - (r.top + r.height / 2)}px)`;
  }, [running]);
  useEffect(() => {
    setTyped("");
    if (typing && !s.overlay) typedRef.current?.focus();
  }, [typing, s.overlay, s.timerEpoch]);
  const c = training ? s.find(s.training?.id) : null,
    ready = training ? !!c && s.practiceSelected.has(c.id) : true,
    cubeSize = training ? 0 : s.info()?.cubeSize,
    // The pyraminx and the megaminx get their own 3D model; the other puzzles without a cube size show none.
    poly = !training && isPolyPuzzle(s.puzzle),
    hasCube = training ? !!c && !c.flat && !c.diagram : !!cubeSize || poly,
    text = (training ? s.training?.setup : s.scramble) ?? "",
    promptFont = isMinxScramble(text)
      ? mobile ? 12 : compact ? 18 : 22
      : mobile
      ? text.length > 90 ? 15 : 18
      : text.length > 220 ? 15 : text.length > 120 ? (compact ? 17 : 19) : compact ? 21 : 26,
    cubePane = ready && (hasCube || training),
    cubeShown = cubePane && s.showCube,
    previewSize = mobile ? (h < 760 ? 0 : 84) : Math.round(Math.max(116, Math.min(196, h * 0.19))),
    // A case's setup as the cube can follow it: face turns only, its rotations folded in.
    setup = useMemo(() => (liveCase && s.training?.setup ? setupTurns(s.training.setup) : null), [liveCase, s.training?.setup]),
    progress = useScrambleProgress(training ? (setup?.canonical ?? "") : s.scramble, training ? !!setup : live && !s.generating),
    caseChecks = useMemo(
      () => (liveCase && goal && s.training?.setup ? { matches: caseMatcher(s.training.setup, goal), solved: (state: Parameters<typeof goalReached>[0]) => goalReached(state, goal) } : null),
      [liveCase, goal, s.training?.setup],
    ),
    [liveBox, setLiveBox] = useState<HTMLDivElement | null>(null),
    liveSide = useSquare(live ? liveBox : null),
    analysis = useLatestAnalysis();
  // The cube times its own solves: its first turn once scrambled starts the timer, the solved cube stops it.
  // A solve stopped by a key before the cube is solved is saved with its penalty (+2 or DNF). Its turns are saved
  // with it either way.
  const solveStop = useSmartSolve({ active: live && !training, scrambled: !!progress?.scrambled, begin: timer.begin, finish: timer.finish }),
    trainedCase = useSmartCase({ active: liveCase, matches: caseChecks?.matches ?? null, solved: caseChecks?.solved ?? null, begin: timer.begin, finish: timer.finish });
  timer.smart.current = training ? trainedCase.stop : solveStop;
  const hint =
    liveCase && timer.phase === "idle" && !s.notice && enabled
      ? <CaseStatus set={trainedCase.set} progress={progress} />
      : live && !training && timer.phase === "idle" && progress && !s.notice
      ? <ScrambleStatus progress={progress} />
      : timerHint(timer.phase, {
          disabled: !enabled && (training ? "Select cases to begin" : "One moment…"),
          unsaved: s.page === "playground" && s.entry === "casual",
          keyboard: !mobile,
        });
  const last = s.solves.find((v) => v.id === s.lastSolve);
  const visual = previewSize > 0 && ready && (
    hasCube ? (
      <Cube
        setup={training ? s.training.setup : s.scramble}
        cubeSize={training ? c.cube_size ?? 3 : cubeSize}
        mask={training ? maskForStage(c.stage) : undefined}
        size={previewSize}
        replay={s.replay}
        held={!training && heldScramble(s.context().scrambleType)}
        puzzle={poly ? s.puzzle : undefined}
      />
    ) : training && s.training?.svg ? (
      <div
        style={{ width: previewSize, height: previewSize }}
        className="[&_svg]:block [&_svg]:size-full"
        dangerouslySetInnerHTML={{ __html: s.training.svg }}
      />
    ) : training ? (
      <Diagram c={c} size={previewSize} />
    ) : null
  );
  const showCube = !mobile && !live && cubePane && !cubeShown && (
    <Button action="cube" icon={Box} size="icon-sm" tip={tr("Show the cube")} className="text-muted-foreground" />
  );
  const solutionToggle = (
    <Button action="solution" icon={s.revealed ? EyeOff : Eye} size="sm" tip={s.revealed ? tr("Hide solution · Alt+H") : tr("Show solution · Alt+H")} className="-ml-2.5 text-muted-foreground">
      {s.revealed ? tr("Hide solution") : tr("Show solution")}
    </Button>
  );
  const learnedToggle = training && c && (
    <ActionToggle action={"learn:" + c.id} pressed={s.learned.has(c.id)} size="sm" icon={s.learned.has(c.id) ? Check : undefined} className="aria-pressed:bg-success/15 aria-pressed:text-success">
      {s.learned.has(c.id) ? tr("Learned") : tr("Mark learned")}
    </ActionToggle>
  );
  const prompt = (
    <section className={cn("flex shrink-0 items-start gap-6", FADE)}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {training ? (
          ready ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  data-action={"case:" + c.id}
                  onClick={run("case:" + c.id)}
                  className={cn("rounded-md text-lg font-semibold tracking-tight transition-colors hover:text-primary", FOCUS)}
                >
                  {tr(c.name)}
                </button>
                <span className="text-sm text-muted-foreground">
                  {learning ? s.dailyStatus : tr(c.setLabel) + (c.group && c.group !== c.setLabel ? " · " + tr(c.group) : "")}
                </span>
                {!mobile && (
                  <span className="ml-auto flex items-center gap-1" data-no-timer>
                    {learnedToggle}
                    {showCube}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>{tr("Setup")}</span>
                {/* On a connected cube, the turns to make on it, coloured as they are made from a solved cube; all done
                    once the case is there, however it was set up. */}
                {setup && progress && (trainedCase.set || !progress.lost) ? (
                  <SmartScramble
                    text={said(setup.held)}
                    progress={trainedCase.set ? { ...progress, lost: false, turns: progress.turns.map(() => "done") } : progress}
                    size={promptFont}
                  />
                ) : (
                  <Alg text={setup?.held ?? s.training.setup} size={promptFont} />
                )}
              </div>
              {s.revealed && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>{tr("Algorithm")}</span>
                  <Alg text={s.training.algorithm} size={Math.max(15, promptFont - 5)} className="text-foreground/85" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1" data-no-timer>
                {solutionToggle}
                {c.algorithms[0]?.youtube && (
                  <Button action={"url:" + c.algorithms[0].youtube} icon={PlayCircle} size="sm" className="text-muted-foreground">
                    {mobile ? tr("Video") : tr("Watch video")}
                  </Button>
                )}
                {mobile && learnedToggle}
              </div>
            </>
          ) : (
            <div data-no-timer>
              <Empty
                icon={reviewing ? GraduationCap : learning ? Trophy : LayoutList}
                title={reviewing ? tr("No learned cases yet") : learning ? tr("Track complete") : tr("Choose your cases")}
                className="py-8"
              >
                <p>{learning ? s.dailyStatus : tr("Select the cases you want to practise.")}</p>
                {(!learning || (track && !reviewing && s.trackLearnedCount > 0)) && (
                  <div className="flex gap-2">
                    {!learning && <Button action="trainingSetup" variant="default">{tr("Choose cases")}</Button>}
                    {track && !reviewing && s.trackLearnedCount > 0 && (
                      <Button action={"learningMode:review:" + track} variant="default">{tr("Train learned")}</Button>
                    )}
                  </div>
                )}
              </Empty>
            </div>
          )
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="scramble max-h-[30vh] min-w-0 flex-1 overflow-y-auto" data-tour="scramble">
                {s.generating && !s.scramble ? (
                  <span className="flex flex-col gap-2" aria-label={tr("Generating a scramble")}>
                    <Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} />
                    <Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} />
                  </span>
                ) : progress ? (
                  <SmartScramble text={s.scramble} progress={progress} size={promptFont} />
                ) : (
                  <Alg text={s.scramble} size={promptFont} />
                )}
              </div>
              {showCube && <span data-no-timer>{showCube}</span>}
            </div>
            {cross && <CrossSolution font={Math.max(15, promptFont - 5)} toggle={solutionToggle} />}
          </>
        )}
      </div>
      {mobile && cubeShown && previewSize > 0 && (
        <div className="relative shrink-0" style={{ width: previewSize, height: previewSize }}>
          {visual}
        </div>
      )}
    </section>
  );
  // The desktop sets the cube at the top right of the page, level with the header, rather than under it.
  // A connected cube stands in the middle: no preview of the scramble beside the header.
  const desktopCube = !mobile && !live && cubeShown && previewSize > 0 && (
    <div className={cn("group/cube relative shrink-0", FADE)} style={{ width: previewSize, height: previewSize }}>
      {visual}
      <Button action="cube" icon={X} size="icon-xs" tip={tr("Hide the cube")} className="absolute -top-1 -right-1 text-muted-foreground opacity-0 transition-opacity group-hover/cube:opacity-100 focus-visible:opacity-100" />
    </div>
  );
  const timesToggle = !timesAlways && !mobile && (
    <ActionToggle action="times" pressed={s.showTimes} icon={ListOrdered} tip={tr("Session times · Alt+T")}>
      {training ? tr("Session") : tr("Times")}
    </ActionToggle>
  );
  const replay = hasCube && ready && !mobile && !live && <Button action="replayCube" icon={RotateCcw} tip={tr("Replay the scramble on the cube")} />;
  const connect = connectable && (
    <Button
      action="smartCube"
      icon={cubeLink === "on" ? BluetoothConnected : cubeLink === "connecting" ? BluetoothSearching : Bluetooth}
      tip={cubeLink === "on" ? tr("{0} connected · disconnect", { 0: smartCube.snapshot.name }) : cubeLink === "connecting" ? tr("Connecting… · cancel") : tr("Connect the virtual cube (development)")}
      className={cn(cubeLink === "on" && "text-primary")}
    />
  );
  // Phones keep four fixed figures; the desktop's timer shows the figures the player chose (FiguresEditor), a training
  // its own few.
  const [band, setBand] = useState<HTMLDivElement | null>(null),
    bandWidth = useWidth(band);
  const chosen = !mobile && s.practicePage() === "playground",
    metrics = mobile
      ? s.metrics().filter(([label]) => ["Best", "Worst", "Ao5", "Ao12", "Mean"].includes(label))
      : chosen
        ? s.figuresShown()
        : s.metrics().filter(([label]) => !(label === "Solves" && timesColumn));
  const columns = balancedColumns(metrics.length, bandWidth),
    rows = Math.ceil(metrics.length / columns);
  const statistics = chosen ? (
    <FiguresBand />
  ) : (
    // Each figure on one line on the desktop, label left and value right, in as few rows as fit, shared evenly.
    <div ref={setBand} className="shrink-0" data-tour="session" style={{ "--columns": columns } as React.CSSProperties}>
      <Strip
        label={tr("Statistics")}
        className={cn(mobile ? "grid-cols-4 px-3" : "grid-cols-[repeat(var(--columns),minmax(0,1fr))] gap-0 px-0 py-2.5")}
      >
        {metrics.slice(0, mobile ? 4 : undefined).map(([label, value, tone], i) => (
          <Figure
            key={label}
            label={said(label)}
            value={value}
            tone={tone}
            size={mobile ? "sm" : "lg"}
            inline={!mobile}
            className={mobile ? "items-center text-center" : cellLines(i, columns, rows)}
          />
        ))}
      </Strip>
    </div>
  );
  const head = (
    cross ? (
        <PageHead
          title={mobile ? tr(CROSS_TARGET_LABELS[s.crossTarget]) : tr("Cross")}
          puzzle={!mobile}
          lead={<ChangeTraining />}
          sub={mobile ? tr("{0} moves", { 0: s.crossMoves }) : tr("Training")}
          more={
            mobile && (
              <>
                <MenuChoice label={tr("What to build")} action="crossTarget" value={s.crossTarget} options={crossTargetOptions} />
                <MenuChoice label={tr("Moves")} action="crossMoves" value={String(s.crossMoves)} options={crossMoveOptions()} />
              </>
            )
          }
        >
          {!mobile && (
            <>
              <Choice prefix="crossTarget:" label={tr("What to build")} value={s.crossTarget} options={crossTargetOptions} />
              <Choice prefix="crossMoves:" label={tr("Moves")} value={String(s.crossMoves)} options={crossMoveOptions()} />
            </>
          )}
          {replay}
          {timesToggle}
        </PageHead>
      ) : training ? (
        <PageHead
          title={track ? tr("Learn {0}", { 0: track }) : reviewing ? tr("Review") : tr("Free practice")}
          lead={<ChangeTraining />}
          sub={track ? tr("Training · one new case a day") : reviewing ? tr("Training · every learned case") : tr("Training · {0}", { 0: plural(s.practiceSelected.size, "case") })}
          more={
            mobile && (
              <>
                {learning && !reviewing && <MenuAction action="menu:learningGroups" icon={LayoutList}>{tr("Group order")}</MenuAction>}
                {track && (
                  <MenuAction action={"learningMode:" + (reviewing ? track : "review:" + track)} icon={Check} disabled={!reviewing && !s.trackLearnedCount}>
                    {reviewing ? tr("Learn {0}", { 0: track }) : tr("Train learned")}
                  </MenuAction>
                )}
                <MenuAction action="auf" icon={Shuffle}>
                  {tr("Random AUF")}{" "}{s.randomAuf ? tr("· on") : tr("· off")}
                </MenuAction>
              </>
            )
          }
        >
          {!mobile && learning && !reviewing && (
            <Button action="menu:learningGroups" icon={LayoutList}>
              {tr("Groups")}</Button>
          )}
          {!mobile && track && (
            <ActionToggle
              action={"learningMode:" + (reviewing ? track : "review:" + track)}
              pressed={reviewing}
              disabled={!reviewing && !s.trackLearnedCount}
              tip={tr("Train every learned {0} case", { 0: track })}
            >
              {tr("Train learned")}</ActionToggle>
          )}
          {!mobile && (
            <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip={tr("Random AUF · Alt+A")}>
              {!compact && tr("Random AUF")}
            </ActionToggle>
          )}
          {connect}
          {replay}
          <Button action="previous" icon={ChevronLeft} disabled={!s.training?.canPrevious} tip={tr("Previous case · Alt+P")} />
          {!mobile && (!learning || reviewing) && <Button action="next" icon={ChevronRight} tip={tr("Next case · Alt+N")} />}
          {timesToggle}
        </PageHead>
      ) : (
        <PageHead title={tr("Timer")} puzzle="scramble">
          {!mobile && (
            <>
              <SelectMenu action="scrambleType" caption={compact ? undefined : "Scramble"} value={s.scrambleType} options={s.scrambleOptions()} />
              <SelectMenu action="entry" caption={compact ? undefined : "Entry"} value={s.entry} options={TIME_ENTRIES} />
            </>
          )}
          {connect}
          {replay}
          {timesToggle}
        </PageHead>
      )
  );
  return (
    <div className={cn(PAGE, "practice")}>
      {mobile && head}
      <div className="flex min-h-0 flex-1 gap-6 xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:gap-5">
          {/* Phones keep the stage as a card (the whole card is the tap target); the desktop sets the scramble, the cube
              and the digits straight on the page. */}
          <Stage
            className={cn("stage flex-1", mobile ? "touch-manipulation select-none" : "flex min-h-0 flex-col pb-1")}
            onPointerDown={(e) => {
              if (e.target instanceof HTMLInputElement || (e.target as HTMLElement).closest("button, a, [data-no-timer]")) return;
              if (mobile || running) timer.press(e.timeStamp);
            }}
            onPointerUp={(e) => timer.release(e.timeStamp)}
          >
            <div className={cn("contents", mobile && "flex min-h-0 flex-1 flex-col px-4 pt-4")}>
              {mobile ? (
                prompt
              ) : (
                // On the desktop the header heads the stage's column, so the times card beside it reaches the top, and
                // the cube stands beside the header and the scramble.
                <div className="flex shrink-0 items-start gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-6">
                    {head}
                    {prompt}
                  </div>
                  {desktopCube}
                </div>
              )}
              <section
                className="timer relative flex min-h-0 flex-1 touch-manipulation flex-col items-center justify-center select-none [container-type:size]"
                data-phase={timer.phase[0]!.toUpperCase() + timer.phase.slice(1)}
              >
                {live && (
                  <div ref={setLiveBox} className={cn("flex min-h-0 w-full flex-1 items-center justify-center", FADE)} data-no-timer>
                    {liveSide > 0 && <LiveCube cube={smartCube} size={Math.min(liveSide, 520)} />}
                  </div>
                )}
                {typing ? (
                  <input
                    ref={typedRef}
                    className={cn(NUMERIC, "w-[min(100%,9ch)] border-b-2 border-border bg-transparent pb-2 text-center text-[clamp(48px,20cqh,120px)] leading-none font-medium tracking-tight outline-none placeholder:text-muted-foreground/40 focus:border-primary")}
                    aria-label={tr("Time")}
                    data-tour="timer"
                    placeholder="0.000"
                    inputMode="decimal"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value.replace(/[^\d.,:]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const ms = parseTypedTime(typed);
                        if (ms && enabled) {
                          setTyped("");
                          void s.save(ms);
                        }
                      }
                    }}
                  />
                ) : (
                  <LiveDigits
                    data-tour="timer"
                    digitsRef={digitsRef}
                    startedAt={timer.startedAt}
                    text={timer.phase === "holding" || timer.phase === "ready" ? "0.000" : fmtTime(timer.elapsed)}
                    phase={timer.phase}
                    className={mobile ? "text-[clamp(64px,min(calc(160cqw/var(--chars)),42cqh),128px)]" : live ? "text-[clamp(40px,min(calc(90cqw/var(--chars)),13cqh),104px)]" : "text-[clamp(56px,min(calc(150cqw/var(--chars)),34cqh),232px)]"}
                  />
                )}
                <div data-tour="timer" className={cn("timer-hint mt-3 flex min-h-5 items-center gap-1.5 text-center text-sm text-muted-foreground md:mt-4", s.notice && "font-medium text-success", FADE)}>
                  {s.notice ? (
                    <>
                      {training ? <Check className="size-4" /> : <Trophy className="size-4" />}
                      {said(s.notice)}
                    </>
                  ) : typing
                    ? typed
                      ? parseTypedTime(typed)
                        ? tr("{0} · Enter to save", { 0: fmtTime(parseTypedTime(typed)) })
                        : tr("Not a time")
                      : tr("Type your time, then Enter: 1234 is 12.34")
                    : said(hint)}
                </div>
                {s.practicePage() === "playground" && <AverageWindow mobile={mobile} />}
                {/* The last solve's actions, there before the first solve too (disabled) so the timer never moves. */}
                {!mobile && (
                  <div className={cn("mt-3 flex shrink-0 flex-wrap items-center justify-center gap-1.5", FADE)} aria-label={tr("Last solve")} data-no-timer>
                    <PenaltyToggles penalty={last?.penalty} prefix={"penalty:" + last?.id + ":"} disabled={!last || s.saving} />
                    <Button action={"comment:" + last?.id} icon={MessageSquare} disabled={!last || s.saving} size="sm" variant="outline" className={cn("text-muted-foreground", last?.comment && "text-primary")}>
                      {tr("Comment")}</Button>
                    <Button action={"delete:" + last?.id} icon={Trash2} disabled={!last || s.saving} size="sm" variant="outline" className="text-muted-foreground hover:text-destructive">
                      {tr("Delete")}</Button>
                  </div>
                )}
              </section>
            </div>
            {/* Phones: the last solve's actions and the next scramble as large targets at the thumb, under the stage. */}
            {mobile && (
              <TouchBar className={cn("shrink-0 border-t px-2 py-1.5", FADE)}>
                <TouchAction action={"penalty:" + last?.id + ":+2"} label="+2" icon={Plus} pressed={last?.penalty === "+2"} disabled={!last || s.saving} tone="warning" />
                <TouchAction action={"penalty:" + last?.id + ":dnf"} label={tr("DNF")} icon={Ban} pressed={last?.penalty === "dnf"} disabled={!last || s.saving} tone="bad" />
                <TouchAction action={"comment:" + last?.id} label={tr("Comment")} icon={MessageSquare} disabled={!last || s.saving} />
                <TouchAction action={"delete:" + last?.id} label={tr("Delete")} icon={Trash2} disabled={!last || s.saving} />
                {training ? (
                  (!learning || reviewing) && <TouchAction action="next" label={tr("Next case")} icon={ChevronRight} />
                ) : (
                  <TouchAction action="next" label={tr("Scramble")} icon={Shuffle} />
                )}
              </TouchBar>
            )}
          </Stage>
          {!mobile && live && !training && analysis && !running && <SolveStrip analysis={analysis} />}
          {mobile ? <SessionPeek training={training} /> : statistics}
        </div>
        {timesColumn && (
          <Surface role="complementary" aria-label={tr("Session times")} data-tour="session" className={cn("w-60 shrink-0 overflow-hidden xl:w-68", FADE)}>
            <Times closable={!timesAlways} />
          </Surface>
        )}
      </div>
      {mobile && (
        <PhoneSheet
          open={s.showTimes}
          onOpenChange={(open) => {
            if (open === s.showTimes) return;
            s.showTimes = open;
            s.emit();
          }}
          title={
            <span className="flex items-baseline gap-2">
              {training ? tr("Session") : tr("Times")}
              <span className={cn(NUMERIC, "text-sm font-normal text-muted-foreground")}>{s.solves.length}</span>
            </span>
          }
          description={tr("Tap a time for its details · hold it for +2, DNF or delete")}
          snapPoints={[0.5, 1]}
          className="gap-3"
        >
          <Strip label={tr("Statistics")} className="grid-cols-4 gap-x-4 px-3">
            {s.metrics().map(([label, value, tone]) => (
              <Figure key={label} label={said(label)} value={value} tone={tone} size="sm" />
            ))}
          </Strip>
          <Times closable={false} bare touch />
        </PhoneSheet>
      )}
    </div>
  );
}

/** Phones: the session under the stage, one tap (or a swipe of the sheet) from its times. */
function SessionPeek({ training }: { training: boolean }) {
  const summary = practiceSummary(s.solves),
    figures: Metric[] = training
      ? [["Best", fmtTime(summary.best), "good"], ["Mean", fmtTime(summary.mean), ""]]
      : [["Ao5", fmtTime(summary.ao5), "accent"], ["Ao12", fmtTime(summary.ao12), "accent"], ["Best", fmtTime(summary.best), "good"]];
  return (
    <button
      type="button"
      data-action="times"
      onClick={run("times")}
      className={cn("flex h-14 shrink-0 items-center gap-4 rounded-xl border bg-muted/45 px-4 text-left transition-colors active:bg-muted/70", FOCUS, FADE)}
      aria-label={tr("Session times")}
      data-tour="session"
    >
      {figures.map(([label, value, tone]) => (
        <Figure key={label} label={said(label)} value={value} tone={tone} caption="small" size="base" className="flex-1" />
      ))}
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <span className={NUMERIC}>{plural(s.solves.length, training ? "attempt" : "solve")}</span>
        <ChevronUp className="size-4" />
      </span>
    </button>
  );
}

const crossTargetOptions = CROSS_TARGETS.map((t) => ({ id: t, label: CROSS_TARGET_LABELS[t] }));
const crossMoveOptions = () => CROSS_MOVES[s.crossTarget].map((n) => ({ id: String(n), label: tr("{0} moves", { 0: n }) }));

/** Optimal cross solutions under the scramble, held with white on the bottom and green in front (z2). */
function CrossSolution({ font, toggle }: { font: number; toggle: React.ReactNode }) {
  const solutions = s.revealed && s.crossSolutions?.scramble === s.scramble ? s.crossSolutions.list : undefined;
  return (
    <>
      {s.revealed && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{tr("Solution · z2, white on the bottom")}</span>
          {solutions ? (
            <div className="flex flex-col gap-1.5">
              {solutions.map((v) => (
                <div key={v.moves + v.slot} className="flex items-baseline gap-4">
                  <Alg text={heldMoves(v.moves)} size={font} />
                  {v.slot && <span className="text-xs text-muted-foreground">{v.slot}</span>}
                </div>
              ))}
            </div>
          ) : (
            <Skeleton style={{ height: font * 1.4, width: font * 9 }} />
          )}
        </div>
      )}
      <div className="flex">{toggle}</div>
    </>
  );
}

/** Back to the training setup, from the header of a running training. */
function ChangeTraining() {
  return <Button action="trainingSetup" icon={ChevronLeft} tip={tr("Change what to train")} className="size-8 max-md:size-10" />;
}

/** An empty session: in the middle of the column, what will appear here (how to start is under the timer). */
function NoTimes() {
  return (
    <Empty icon={ListOrdered} title={tr("No times yet")} className="px-4 py-8">
      <p className="text-xs">{tr("Every solve of this session lands here.")}</p>
    </Empty>
  );
}

/** A solve as a small chip (a training's case, the average of five): tinted as the times list tints it. */
const CHIP = cn(NUMERIC, "flex items-center gap-1 rounded-md border border-transparent bg-muted/60 select-none transition-colors hover:bg-muted", FOCUS);

/** The session's times, newest first, as plain rows; right-click a row for its menu. */
function Times({ closable = true, bare = false, touch = false }: { closable?: boolean; bare?: boolean; touch?: boolean }) {
  const training = s.practicePage() === "training",
    extremes = sessionExtremes(s.solves),
    selected = s.practiceSelected,
    tried = new Set(s.solves.map((v) => v.case_id)),
    lang = language();
  return (
    <>
      {/* The column's heading: its name and count, its actions on the right, a line under it across the panel. */}
      {!bare && (
        <SectionHead title={training ? tr("Session") : tr("Times")} meta={s.solves.length} rule className="h-11 pr-2 pl-4 pb-0">
          {training && !!s.solves.length && (
            <Button action="undo" icon={Undo2} size="xs" className="text-muted-foreground">
              {tr("Undo")}</Button>
          )}
          {closable && <Button action="times" icon={X} size="icon-xs" tip={tr("Close")} />}
        </SectionHead>
      )}
      {training ? (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto", bare ? "-mx-2 mt-1" : "p-2")}>
          {trainingSessionRows<any, any>(
            s.cases().filter((c: any) => selected.has(c.id) || tried.has(c.id)),
            s.solves,
          ).map(({ c, solves, best: fastest, mean: average, validCount }) => (
            <div key={c.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
              <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                <Diagram c={c} size={36} />
                <span className="max-w-full truncate text-xs text-muted-foreground">{shortId(c)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                {!solves.length ? (
                  <span className="text-sm text-muted-foreground/60">{tr("No attempt yet")}</span>
                ) : (
                  <>
                    {validCount > 1 && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{tr("mean")}{" "}{fmtTime(average)}</span>}
                    <div className="flex flex-wrap gap-1">
                      {[...solves].reverse().map((v) => (
                        <SolveMenu key={v.id} solve={v}>
                          <button
                            type="button"
                            data-action={"solve:" + v.id}
                            onClick={run("solve:" + v.id)}
                            className={cn(CHIP, "h-6 px-1.5 text-xs", touch && "h-9 px-2.5 text-sm", TONE_TEXT[solveTone(v, { best: effective(v.time_ms, v.penalty) === fastest ? v.id : undefined })])}
                          >
                            {fmtSolve(v.time_ms, v.penalty)}
                            {v.comment && <MessageSquare className="size-3 text-muted-foreground" />}
                            {v.solution && <Rotate3d className="size-3 text-muted-foreground" aria-label={tr("Turned on a connected cube")} />}
                          </button>
                        </SolveMenu>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn("times-list flex min-h-0 flex-1 flex-col overflow-y-auto", bare ? "-mx-2 mt-1" : "p-2")}>
          {!s.solves.length && <NoTimes />}
          {[...s.solves].reverse().map((v, i) => (
            <TimeRow key={v.id} solve={v} number={s.solves.length - i} tone={solveTone(v, extremes)} touch={touch} lang={lang} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * A time of the session's list, drawn again only when what it shows changes: each snapshot brings every solve as a new
 * object, the same times in them.
 */
const TimeRow = memo(
  function TimeRow({ solve: v, number, tone, touch }: { solve: any; number: number; tone: ReturnType<typeof solveTone>; touch: boolean; lang: string }) {
    return (
      <SolveMenu solve={v}>
        <div className={cn(ROW, "group/row flex h-8 shrink-0 items-center gap-2 px-2 select-none has-[[data-row]:focus-visible]:ring-3 has-[[data-row]:focus-visible]:ring-ring/50 has-[[data-row]:focus-visible]:ring-inset", touch && "h-11 active:bg-muted/50")}>
          <button
            type="button"
            data-action={"solve:" + v.id}
            data-row
            onClick={run("solve:" + v.id)}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left outline-none"
          >
            <span className={cn(NUMERIC, "w-7 shrink-0 text-right text-xs text-muted-foreground")}>{number}</span>
            <span className={cn(NUMERIC, touch ? "text-base" : "text-sm", TONE_TEXT[tone])}>{fmtSolve(v.time_ms, v.penalty)}</span>
            {v.comment && <MessageSquare className="size-3 text-muted-foreground" />}
            {v.solution && <Rotate3d className="size-3 text-muted-foreground" aria-label={tr("Turned on a connected cube")} />}
          </button>
          <SolveActions solve={v} className={cn(touch && "hidden")} />
        </div>
      </SolveMenu>
    );
  },
  (a, b) =>
    a.number === b.number && a.tone === b.tone && a.touch === b.touch && a.lang === b.lang &&
    (["id", "time_ms", "penalty", "comment", "solution", "scramble"] as const).every((k) => a.solve[k] === b.solve[k]),
);

/**
 * The current average of five as it is counted: the last five solves as small chips, the fastest and the slowest of
 * them dropped (in brackets), the newest outlined, then the average. Empty slots until there are five.
 */
function AverageWindow({ mobile }: { mobile: boolean }) {
  const last = s.solves.slice(-5),
    times = last.map((v) => effective(v.time_ms, v.penalty) ?? Infinity),
    full = last.length === 5,
    fastest = full ? times.indexOf(Math.min(...times)) : -1,
    slowest = full ? times.lastIndexOf(Math.max(...times)) : -1,
    ao5 = practiceSummary(s.solves).ao5;
  const chip = cn("h-7 justify-center", mobile ? "min-w-0 flex-1 px-1 text-xs" : "min-w-18 px-2");
  return (
    <div className={cn(NUMERIC, "average-window mt-6 flex w-full shrink-0 items-center justify-center gap-1.5 text-sm md:mt-8", mobile && "gap-1", FADE)} aria-label={tr("Current average of 5")} data-no-timer>
      {!mobile && <span className={cn(LABEL, "mr-1.5")}>{tr("Ao5")}</span>}
      {Array.from({ length: 5 }, (_, i) => {
        const v = last[i - (5 - last.length)];
        if (!v)
          return (
            <span key={i} className={cn(chip, "flex items-center rounded-md border border-dashed bg-muted/30 text-muted-foreground/50")}>
              –
            </span>
          );
        const index = i - (5 - last.length),
          dropped = index === fastest || index === slowest,
          time = fmtSolve(v.time_ms, v.penalty);
        return (
          <SolveMenu key={v.id} solve={v}>
            <button
              type="button"
              data-action={"solve:" + v.id}
              onClick={run("solve:" + v.id)}
              className={cn(
                CHIP,
                chip,
                "border border-transparent",
                dropped && v.penalty !== "dnf" ? "text-muted-foreground" : TONE_TEXT[solveTone(v, {})],
                index === last.length - 1 && "border-foreground/40",
              )}
            >
              {dropped ? `(${time})` : time}
            </button>
          </SolveMenu>
        );
      })}
      {!mobile && <span className={cn("ml-2 min-w-16", full ? "text-primary" : "text-muted-foreground/50")}>= {fmtTime(ao5)}</span>}
    </div>
  );
}
