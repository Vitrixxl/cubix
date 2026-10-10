/** The timer page and a running training: prompt, timer, session figures and the times list. */
import { CROSS_MOVES, CROSS_TARGET_LABELS, CROSS_TARGETS, heldMoves } from "../../src/shared/crossTraining";
import { heldScramble } from "../../src/shared/puzzles";
import { isPolyPuzzle } from "../../src/shared/puzzleScene";
import { practiceSummary, sessionExtremes, solveTone, trainingSessionRows, type Metric } from "../../src/client/lib/practiceSummary";
import { INSPECTION_DNF_MS, INSPECTION_MS, PracticeTimer, timerHint, worsePenalty, type TimerPhase, type TimerSnapshot } from "../../src/client/lib/practiceTimer";
import { stackmat } from "../../src/client/lib/stackmat";
import { dailyDay, isDailyEvent } from "../../src/client/lib/daily";
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
import { SeenDiagram } from "./algorithms";
import { recommendedWhy } from "../../src/client/lib/trainingPicks";
import { balancedColumns, FiguresBand, useWidth } from "./FiguresEditor";
import {
  Ban,
  Bluetooth,
  BluetoothConnected,
  BluetoothSearching,
  Box,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Eye,
  EyeOff,
  History,
  LayoutList,
  ListChecks,
  ListOrdered,
  PanelRight,
  MessageSquare,
  PlayCircle,
  Plus,
  Rotate3d,
  RotateCcw,
  Shuffle,
  Trash2,
  Trophy,
  Undo2,
  Timer as TimerIcon,
  X,
} from "lucide-react";
import { store as s, timesAlwaysShown } from "./store";
import { sessionName } from "../../src/client/lib/sessions";
import { Button as UiButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Cube } from "./Cube";
import { fmtTime, fmtSolve, parseTypedTime, effective, INSPECTIONS, TIME_ENTRIES } from "../../src/client/lib/format";
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
  InHead,
  NUMERIC,
  StatCard,
  dots,
  PAGE,
  MenuAction,
  MenuChoice,
  PageHead,
  PenaltyToggles,
  ROW,
  SectionHead,
  Segmented,
  StateMark,
  SelectMenu,
  SolveActions,
  SolveMenu,
  Strip,
  Surface,
  Tip,
  isPhone,
  plural,
  run,
  useViewport,
} from "./ui";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneSheet, TouchAction, TouchBar } from "./phone";
import { language, locale, tr } from "../../src/client/i18n";
import { msg } from "../../src/client/i18n/msg";
import { Digits, fractionClass, isMinxScramble, keyed, said } from "./base";
export { Digits };

/** Keys typed into a field, a menu or a dialog never reach the timer. */
const typingInto = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement).closest?.("input,textarea,select,[role=menu],[role=dialog],[role=listbox]");

/**
 * The timer page's timer: Space (or a touch on phones) holds, releases and stops. It re-renders the page only when
 * its phase changes; the running time is drawn by `LiveDigits`. `manual` false: something else starts it (a connected
 * cube's first turn once scrambled), keys only stop it.
 */
function useTimer(enabled: boolean, manual = true, { inspection = false, memo = false } = {}) {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const enabledRef = useRef(enabled),
    manualRef = useRef(manual),
    modesRef = useRef({ inspection, memo }),
    /** What a smart cube knows of a solve stopped now: its turns, and its penalty when the cube is not solved yet. */
    smartRef = useRef<() => { penalty?: "none" | "+2" | "dnf"; solution: string | null } | undefined>(() => undefined);
  enabledRef.current = enabled;
  manualRef.current = manual;
  modesRef.current = { inspection, memo };
  const [timer] = useState(() => new PracticeTimer({
    canStart: () => enabledRef.current,
    inspection: () => modesRef.current.inspection,
    memo: () => modesRef.current.memo,
    onStop: (ms, penalty, memo) => {
      const smart = smartRef.current();
      // An inspection's penalty and a smart cube's add up as the worse of the two.
      void s.save(ms, worsePenalty(smart?.penalty, penalty), smart?.solution, memo);
    },
    // Only this page draws the phase; the fade of the rest follows `s.running` (see the store), without drawing the app.
    onChange: snapshot => {
      setSnapshot(snapshot);
      s.running = snapshot.phase === "running";
      s.learningFrozen = ["inspecting", "holding", "ready", "running"].includes(snapshot.phase);
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
      if (typingInto(e) || s.overlay || s.caseDialog || !manualRef.current || (s.entry === "typing" && s.page === "playground")) return;
      // Escape gives up an inspection.
      if (e.key === "Escape" && timer.snapshot.inspectedAt !== undefined) return timer.reset();
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
  // A Stackmat drives the timer as its pads are touched: both hands down hold, lifted they start, its stop stops with
  // its own time; resetting it during a solve cancels the solve.
  useEffect(() => {
    let last: string | undefined;
    return stackmat.subscribe(() => {
      const packet = stackmat.snapshot.packet,
        before = last;
      last = packet?.status;
      if (!packet || packet.status === before || !manualRef.current) return;
      const phase = timer.snapshot.phase;
      if (packet.status === " ") {
        if (phase === "ready") timer.release();
        else if (phase !== "running") timer.begin();
      } else if (phase === "running") {
        if (packet.status === "S") timer.finish(packet.ms);
        else if (packet.status === "I") timer.reset();
      } else if (packet.status === "C" || packet.status === "A") timer.arm();
      else timer.cancelArming();
    });
  }, [timer]);
  // A stopped timer rests like an idle one.
  const phase: Exclude<TimerPhase, "stopped"> = snapshot.phase === "stopped" ? "idle" : snapshot.phase;
  return { phase, elapsed: snapshot.elapsed, startedAt: snapshot.startedAt, inspectedAt: snapshot.inspectedAt, memo: snapshot.memo, press, release, begin: timer.begin, finish: timer.finish, smart: smartRef };
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

/**
 * The inspection's sound. Speech alone stayed silent where the system has no voice (Linux without speech-dispatcher,
 * so Electron and Chromium there): the calls are beeps made on the device, the words added where a voice speaks the
 * app's language.
 */
let audio: AudioContext | undefined, spoken: SpeechSynthesisUtterance | undefined;
/** The context the beeps play in, made and resumed as the inspection starts (a key or a touch away from it). */
function inspectionAudio() {
  if (typeof AudioContext === "undefined") return undefined;
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}
/** The judge's call at `n` seconds: one beep at 8, two higher ones at 12, and the words when a voice can say them. */
function inspectionCall(n: number) {
  const context = inspectionAudio();
  if (context) {
    for (let i = 0; i < (n >= 12 ? 2 : 1); i++) {
      const at = context.currentTime + i * 0.22,
        tone = context.createOscillator(),
        gain = context.createGain();
      tone.frequency.value = n >= 12 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      tone.connect(gain).connect(context.destination);
      tone.start(at);
      tone.stop(at + 0.17);
    }
  }
  if (typeof speechSynthesis === "undefined") return;
  const lang = language();
  if (!speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))) return;
  // Held until it is said: Chromium drops an utterance nothing refers to.
  spoken = new SpeechSynthesisUtterance(tr("{0} seconds", { 0: n }));
  spoken.lang = lang;
  speechSynthesis.speak(spoken);
}

/**
 * A WCA inspection begun at `since`: in the digits, when `show`, the seconds left from 15, then +2, then DNF (the penalty
 * the start would get); when `speak`, the judge's calls at 8 and 12 seconds.
 */
function InspectionDigits({ since, show, speak, ...digits }: { since: number; show: boolean; speak: boolean } & Omit<React.ComponentProps<typeof Digits>, "text">) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!speak) return;
    inspectionAudio();
    const calls = [8, 12].flatMap((n) => {
      const wait = since + n * 1000 - performance.now();
      return wait > 0 ? [setTimeout(() => inspectionCall(n), wait)] : [];
    });
    return () => {
      calls.forEach(clearTimeout);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, [since, speak]);
  const elapsed = now - since,
    text = !show ? "0.000" : elapsed < INSPECTION_MS ? String(Math.ceil((INSPECTION_MS - elapsed) / 1000)) : elapsed < INSPECTION_DNF_MS ? "+2" : tr("DNF");
  return <Digits {...digits} text={text} />;
}

export function Practice() {
  useEffect(() => {
    const tick = () => { void s.refreshLearning().catch(s.fail); };
    tick();
    const interval = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(interval); window.removeEventListener("focus", tick); };
  }, []);
  const { w, h } = useViewport(),
    mobile = isPhone(w),
    // First-block training runs like the timer, on its own scrambles.
    cross = s.crossTraining,
    training = s.page === "training" && !cross,
    // Wide windows keep the times beside the stage; narrower ones open them on demand.
    timesAlways = timesAlwaysShown(w, training),
    timesColumn = !mobile && (timesAlways ? !s.timesHidden : s.showTimes),
    compact = w <= 900 || h <= 760,
    // A short window: a training's case sets its tools under it and leaves the row of attempts to the session's times.
    short = h <= 700;
  const Stage = mobile ? Surface : "div";
  const cubeLink = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status),
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
    typing = s.page === "playground" && s.entry === "typing",
    // Blindfolded solves have no inspection (it is part of the time) but split the memorisation from the execution.
    blind = !training && s.solveMode === "blindfolded",
    timer = useTimer(enabled, !(live && (!training || liveCase)), { inspection: !training && !blind && !typing && s.inspection !== "off", memo: blind }),
    stackmatLink = useSyncExternalStore(stackmat.subscribe, () => stackmat.snapshot.link, () => stackmat.snapshot.link),
    inspecting = timer.inspectedAt !== undefined && timer.phase !== "running";
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
    // The timer page never shows the cube: only a training's case does.
    cubePane = training && ready,
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
      : blind && timer.phase === "running"
      ? timer.memo === undefined
        ? mobile ? tr("Tap when memorised") : tr("Any key when memorised")
        : tr("Memo {0} · {1}", { 0: fmtTime(timer.memo), 1: mobile ? tr("Tap to stop") : tr("Any key to stop") })
      : blind && timer.phase === "idle" && timer.memo !== undefined && timer.elapsed > 0
      ? tr("Memo {0} · execution {1}", { 0: fmtTime(timer.memo), 1: fmtTime(timer.elapsed - timer.memo) })
      : stackmatLink === "on" && timer.phase === "idle" && enabled
      ? tr("Both hands on the Stackmat, lift them to start")
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
    <Button action="cube" icon={Box} size="icon" tip={tr("Show the cube")} className="text-muted-foreground" />
  );
  const solutionToggle = (
    <Button action="solution" icon={cross && s.revealed ? EyeOff : Eye} tip={cross && s.revealed ? tr("Hide solution · Alt+H") : tr("Show solution · Alt+H")} className="-ml-2.5 text-muted-foreground">
      {cross && s.revealed ? tr("Hide solution") : tr("Show solution")}
    </Button>
  );
  const learnedToggle = training && c && (
    <ActionToggle action={"learn:" + c.id} pressed={s.learned.has(c.id)} icon={s.learned.has(c.id) ? Check : undefined} className="aria-pressed:bg-success/15 aria-pressed:text-success">
      {s.learned.has(c.id) ? tr("Learned") : tr("Mark learned")}
    </ActionToggle>
  );
  // A case's setup: on a connected cube, the turns to make on it, coloured as they are made from a solved cube; all
  // done once the case is there, however it was set up.
  const caseSetup = training && ready && (
    setup && progress && (trainedCase.set || !progress.lost) ? (
      <SmartScramble
        text={said(setup.held)}
        progress={trainedCase.set ? { ...progress, lost: false, turns: progress.turns.map(() => "done") } : progress}
        size={promptFont}
      />
    ) : (
      <Alg text={setup?.held ?? s.training.setup} size={promptFont} />
    )
  );
  const video = training && ready && c.algorithms[0]?.youtube && (
    <Button action={"url:" + c.algorithms[0].youtube} icon={PlayCircle} className="text-muted-foreground">
      {mobile ? tr("Video") : tr("Watch video")}
    </Button>
  );
  // Only learned cases are trained: none in the cases chosen, the way back to choose, or to the courses to learn them.
  const unlearned = [...s.selected].some((id) => s.find(id) && !s.learned.has(id));
  const noCases = (
    <div data-no-timer>
      <Empty icon={LayoutList} title={tr("No learned case to train")} className="py-8">
        <p>{unlearned && !s.trainSets.length && !s.trainPicks.length ? tr("These cases are not learned yet: learn them in the courses, then train them here.") : tr("Pick recommended cases, whole sets or learned cases one by one.")}</p>
        <div className="flex gap-2">
          <Button action="trainingSetup" variant="default">{tr("Choose cases")}</Button>
          {unlearned && <Button action="nav:learn">{tr("Open the courses")}</Button>}
        </div>
      </Empty>
    </div>
  );
  // The daily scramble on the timer, one ranked attempt a day: once made, the button shows its standing.
  const dailyDone = !!s.dailyDone[`${dailyDay()}:${s.event().id}`];
  const dailyButton = isDailyEvent(s.event().id) && (
    <ActionToggle
      action="daily"
      pressed={!!s.dailyEvent()}
      icon={dailyDone ? CalendarCheck : CalendarDays}
      variant="outline"
      tip={dailyDone ? tr("Daily scramble · done today, see your standing") : s.dailyEvent() ? tr("Daily scramble · back to random scrambles") : tr("Daily scramble · one ranked attempt a day")}
      className={cn("aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/85", dailyDone && "text-success")}
    >
      {s.dailyEvent() && tr("Daily")}
    </ActionToggle>
  );
  // On the daily scramble, the timer says so over the scramble, with the way back to random ones.
  const dailyShown = s.dailyEvent() && (
    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold" data-no-timer data-slot="daily-label">
      <CalendarDays className="size-4 shrink-0 text-primary" />
      <span className="truncate">
        <span className="text-primary">{tr("Daily scramble")}</span>
        <span className="text-muted-foreground">
          {" · "}
          {new Date(dailyDay() + "T12:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", timeZone: "UTC" })}
          {" · "}
          {dailyDone ? tr("already done, not ranked") : tr("your ranked attempt")}
        </span>
      </span>
      <Button action="daily:off" icon={X} size="icon" variant="ghost" tip={tr("Back to random scrambles")} />
    </div>
  );
  const prompt = (
    // A short phone scrolls the prompt inside the stage rather than squeezing the timer under it.
    <section className={cn("flex items-start gap-6", mobile ? "min-h-14 shrink overflow-y-auto" : "shrink-0", FADE)}>
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
                  {tr(c.setLabel) + (c.group && c.group !== c.setLabel ? " · " + tr(c.group) : "")}
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
                {caseSetup}
              </div>
              <div className="flex flex-wrap items-center gap-1" data-no-timer>
                {solutionToggle}
                {video}
                {mobile && learnedToggle}
              </div>
            </>
          ) : (
            noCases
          )
        ) : (
          <>
            {dailyShown}
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
      <Button action="cube" icon={X} size="icon" tip={tr("Hide the cube")} className="absolute -top-1 -right-1 text-muted-foreground opacity-0 transition-opacity group-hover/cube:opacity-100 focus-visible:opacity-100" />
    </div>
  );
  const timesToggle = !mobile && (
    <ActionToggle action="times" pressed={timesColumn} icon={PanelRight} variant="outline" tip={tr("Session times · Alt+T")} className="aria-pressed:text-foreground" />
  );
  const replay = cubePane && hasCube && !mobile && !live && <Button action="replayCube" icon={RotateCcw} tip={tr("Replay the scramble on the cube")} />;
  const connect = connectable && (
    <Button
      action="smartCube"
      icon={cubeLink === "on" ? BluetoothConnected : cubeLink === "connecting" ? BluetoothSearching : Bluetooth}
      tip={cubeLink === "on" ? tr("{0} connected · disconnect", { 0: smartCube.snapshot.name }) : cubeLink === "connecting" ? tr("Connecting… · cancel") : tr("Connect the virtual cube (development)")}
      className={cn(cubeLink === "on" && "text-primary")}
    />
  );
  // The Stackmat, experimental as the connected cube is and offered where it is; shown whenever it listens.
  const stackmatButton = (connectable || stackmatLink !== "off") && (
    <Button
      action="stackmat"
      icon={TimerIcon}
      tip={stackmatLink === "on" ? tr("Stackmat connected · disconnect") : stackmatLink === "connecting" ? tr("Waiting for the Stackmat signal… · stop") : tr("Connect a Stackmat (experimental)")}
      className={cn(stackmatLink === "on" && "text-primary", stackmatLink === "connecting" && "animate-pulse text-primary")}
    />
  );
  // Phones keep four fixed figures; the desktop's timer shows the figures the player chose (FiguresEditor), a training
  // its own few.
  const [band, setBand] = useState<HTMLElement | null>(null),
    bandWidth = useWidth(band);
  const chosen = !mobile && s.practicePage() === "playground",
    metrics = mobile
      ? s.metrics().filter(([label]) => ["Best", "Worst", "Ao5", "Ao12", "Mean"].includes(label))
      : chosen
        ? s.figuresShown()
        : s.metrics().filter(([label]) => !(label === "Solves" && timesColumn));
  const columns = balancedColumns(metrics.length, bandWidth),
    rows = Math.ceil(metrics.length / columns);
  // The last solve's actions, there before the first solve too (disabled) so nothing moves.
  const lastSolve = (
    <div className="flex min-w-0 flex-1 gap-2" role="group" aria-label={tr("Last solve")}>
                <PenaltyToggles penalty={last?.penalty} prefix={"penalty:" + last?.id + ":"} disabled={!last || s.saving} className={LAST_SOLVE} />
                <Button action={"comment:" + last?.id} disabled={!last || s.saving} variant="outline" label={last?.comment ? tr("Edit comment") : tr("Add comment")} className={cn(LAST_SOLVE, last?.comment && "text-primary")}>
                  {tr("Note")}</Button>
                <Button action={"delete:" + last?.id} disabled={!last || s.saving} variant="outline" label={tr("Delete solve")} className={cn(LAST_SOLVE, "hover:text-destructive")}>
                  {tr("Delete")}</Button>
                  </div>
  );
  const statistics = chosen ? (
    <FiguresBand />
  ) : (
    // The training's few figures as tiles, as many to a row as fit.
    <section ref={setBand} aria-label={tr("Statistics")} data-tour="session" className={cn("grid shrink-0 grid-cols-[repeat(var(--columns),minmax(0,1fr))] gap-3", FADE)} style={{ "--columns": Math.min(columns, 4) } as React.CSSProperties}>
      {metrics.map(([label, value, tone], i) => (
        <StatCard key={label} label={label} value={value} dot={dots(metrics.map((m) => m[2]))[i]} size="sm" />
      ))}
    </section>
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
          {!mobile && (w <= 1100 ? (
            // Narrower windows keep the two choices as pills, their options in a menu.
            <>
              <SelectMenu action="crossTarget" caption="Build" value={s.crossTarget} options={crossTargetOptions} />
              <SelectMenu action="crossMoves" caption="Moves" value={String(s.crossMoves)} options={crossMoveOptions()} />
            </>
          ) : (
            <>
              <Choice prefix="crossTarget:" label={tr("What to build")} value={s.crossTarget} options={crossTargetOptions} />
              <Choice prefix="crossMoves:" label={tr("Moves")} value={String(s.crossMoves)} options={crossMoveOptions()} />
            </>
          ))}
          {replay}
          {timesToggle}
        </PageHead>
      ) : training ? (
        <PageHead
          title={tr("Session")}
          lead={<ChangeTraining />}
          sub={said([plural(s.practiceSelected.size, "case"), s.trainingParts().join(", ")].filter(Boolean).join(" · "))}
          more={
            mobile && (
              <>
                <MenuAction action="trainingSetup" icon={ListChecks}>
                  {tr("Choose cases")}
                </MenuAction>
                <MenuAction action="auf" icon={Shuffle}>
                  {tr("Random AUF")}{" "}{s.randomAuf ? tr("· on") : tr("· off")}
                </MenuAction>
              </>
            )
          }
        >
          {!mobile && (
            <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip={tr("Random AUF · Alt+A")}>
              {!compact && tr("Random AUF")}
            </ActionToggle>
          )}
          {connect}
          {replay}
          {mobile && <Button action="previous" icon={ChevronLeft} disabled={!s.training?.canPrevious} tip={tr("Previous case · Alt+P")} />}
          {timesToggle}
        </PageHead>
      ) : (
        mobile ? (
          <PageHead title={tr("Timer")} puzzle="scramble">{dailyButton}</PageHead>
        ) : (
          // The desktop's timer has no title: its controls stand at the top right, beside the scramble.
          <InHead.Provider value={true}>
            <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-1.5", FADE)} data-no-timer>
              <SelectMenu action="scrambleType" caption="Scramble" value={s.scrambleChoice()} options={s.scrambleOptions()} />
              <SelectMenu action="entry" caption="Entry" value={s.entry} options={TIME_ENTRIES} />
              {!blind && !typing && <SelectMenu action="inspection" caption={msg("Inspection")} value={s.inspection} options={INSPECTIONS} />}
              <Button action="next" icon={Shuffle} tip={tr("New scramble · Alt+N")} />
              {dailyButton}
              {connect}
              {stackmatButton}
              {timesToggle}
            </div>
          </InHead.Provider>
        )
      )
  );
  // The desktop's session: the case large (its diagram or cube, name, setup and tools), the timer under it, the last
  // attempt's actions and the attempts of the session in a row at the bottom; the session by case on the right.
  const recommendation = training && ready ? s.recommended().find((r) => r.id === c.id) : undefined;
  const caseTools = training && !mobile && ready && (
    <div className={cn("flex flex-wrap items-center gap-1.5", short ? "basis-full" : "mt-1.5")} data-no-timer>
      <Button action="solution" variant="outline" icon={Eye} tip={tr("Show solution · Alt+H")}>
        {tr("Show solution")}
      </Button>
      {c.algorithms[0]?.youtube && <Button action={"url:" + c.algorithms[0].youtube} variant="outline" icon={PlayCircle}>{tr("Video")}</Button>}
      {hasCube && !live && <ActionToggle action="cube" variant="outline" pressed={s.showCube} icon={Box} tip={tr(s.showCube ? "Show the diagram" : "Show the cube")}>{tr("3D cube")}</ActionToggle>}
      <ActionToggle action={"learn:" + c.id} variant="outline" pressed={s.learned.has(c.id)} icon={s.learned.has(c.id) ? Check : undefined} className="aria-pressed:bg-success/15 aria-pressed:text-success">
        {s.learned.has(c.id) ? tr("Learned") : tr("Mark learned")}
      </ActionToggle>
    </div>
  );
  const caseBlock = training && !mobile && (
    <div className={cn("flex shrink-0 flex-col", short ? "gap-3" : "gap-5", FADE)}>
      {head}
      {ready ? (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-label={tr(c.name)}>
          {previewSize > 0 && (
            <div className="relative shrink-0" style={{ width: previewSize, height: previewSize }}>
              {cubeShown && !live ? visual : s.training?.svg ? <div className="size-full [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: s.training.svg }} /> : <Diagram c={c} size={previewSize} />}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <button type="button" data-action={"case:" + c.id} onClick={run("case:" + c.id)} className={cn("rounded-md text-[28px] leading-none font-extrabold tracking-[-0.03em] transition-colors hover:text-primary", FOCUS)}>
                {tr(c.name)}
              </button>
              <span className="text-sm font-semibold text-faint">{tr(c.setLabel) + (c.group && c.group !== c.setLabel ? " · " + tr(c.group) : "")}</span>
              {recommendation && <StateMark tone="accent" className="self-center">{tr("Recommended")} · {recommendedWhy(recommendation)}</StateMark>}
            </div>
            {caseSetup}
            {!short && caseTools}
          </div>
          {short && caseTools}
        </section>
      ) : (
        noCases
      )}
    </div>
  );
  const sessionFoot = training && !mobile && (
    <div className={cn("flex shrink-0 flex-col gap-4", FADE)} data-no-timer>
      {/* The timer's row of the last solve's actions, then the previous and the next case side by side. */}
      <div className="flex items-center gap-2">
        {lastSolve}
        <div className="ml-2 flex shrink-0 gap-2">
          <CaseStep action="previous" disabled={!s.training?.canPrevious} label={tr("Previous case")} keys="Alt+P" short={short || compact} />
          <CaseStep action="next" disabled={!ready} label={tr("Next case")} keys="Alt+N" short={short || compact} />
        </div>
      </div>
      {!short && <CaseQueue current={ready ? c : null} />}
    </div>
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
                caseBlock || (cross ? (
                  <div className="flex shrink-0 items-start gap-6">
                    <div className="flex min-w-0 flex-1 flex-col gap-6">
                      {head}
                      {prompt}
                    </div>
                    {desktopCube}
                  </div>
                ) : (
                  // The scramble large on the left; the controls on the right, the cube under them.
                  <div className="flex shrink-0 items-start gap-6">
                    <div className="min-w-0 flex-1 pt-1">{prompt}</div>
                    {head}
                  </div>
                ))
              )}
              <section
                className={cn("timer relative flex flex-1 touch-manipulation flex-col items-center justify-center select-none [container-type:size]", mobile ? (training ? "min-h-24" : "min-h-32") : "min-h-0")}
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
                ) : inspecting ? (
                  <InspectionDigits
                    data-tour="timer"
                    digitsRef={digitsRef}
                    since={timer.inspectedAt!}
                    show={s.inspection === "display" || s.inspection === "both"}
                    speak={s.inspection === "voice" || s.inspection === "both"}
                    phase={timer.phase}
                    className={mobile ? "text-[clamp(64px,min(calc(160cqw/var(--chars)),42cqh),128px)]" : "text-[clamp(56px,min(calc(150cqw/var(--chars)),34cqh),232px)]"}
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
                <div data-tour="timer" className={cn("timer-hint mt-3 flex min-h-5 items-center gap-1.5 text-center text-sm text-muted-foreground md:mt-5 md:text-[15px]", s.notice && "font-medium text-success", mobile && h < 560 && !s.notice && "hidden", !(blind && running) && FADE)}>
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
                    : keyed(said(hint))}
                </div>
                {s.practicePage() === "playground" && <AverageWindow mobile={mobile} />}
                {training && !mobile && last && <Verdict solve={last} />}
              </section>
            </div>
            {/* Phones: the last solve's actions and the next scramble as large targets at the thumb, under the stage. */}
            {mobile && (
              <TouchBar className={cn("shrink-0 px-2 pt-1 pb-2", FADE)}>
                <TouchAction action={"penalty:" + last?.id + ":+2"} label="+2" icon={Plus} pressed={last?.penalty === "+2"} disabled={!last || s.saving} tone="warning" />
                <TouchAction action={"penalty:" + last?.id + ":dnf"} label={tr("DNF")} icon={Ban} pressed={last?.penalty === "dnf"} disabled={!last || s.saving} tone="bad" />
                <TouchAction action={"comment:" + last?.id} label={tr("Comment")} icon={MessageSquare} disabled={!last || s.saving} />
                <TouchAction action={"delete:" + last?.id} label={tr("Delete")} icon={Trash2} disabled={!last || s.saving} />
                {training ? (
                  <TouchAction action="next" label={tr("Next case")} icon={ChevronRight} />
                ) : (
                  <TouchAction action="next" label={tr("Scramble")} icon={Shuffle} />
                )}
              </TouchBar>
            )}
          </Stage>
          {!mobile && live && !training && analysis && !running && <SolveStrip analysis={analysis} />}
          {mobile ? <SessionPeek training={training} /> : chosen ? <FiguresBand actions={lastSolve} /> : training ? sessionFoot : (
            <div className="flex shrink-0 flex-col gap-3">
              <div className={cn("flex gap-2", FADE)} data-no-timer>{lastSolve}</div>
              {statistics}
            </div>
          )}
        </div>
        {timesColumn && (
          <aside aria-label={tr("Session times")} data-tour="session" className={cn("flex w-64 shrink-0 flex-col overflow-hidden rounded-[26px] bg-card xl:w-68", training && "w-72 xl:w-80", FADE)}>
            {training ? <SessionBoard /> : <Times closable />}
          </aside>
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
          {s.page === "playground" && (
            <div className="flex items-center gap-2 px-1">
              <SessionName />
              <SessionMenu />
            </div>
          )}
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
      className={cn("flex h-16 shrink-0 items-center gap-4 rounded-[20px] bg-card px-5 text-left transition-colors active:bg-muted", FOCUS, FADE)}
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

/** The last attempt against its case's figures: how far from its mean, then its best and mean over its attempts. */
function Verdict({ solve }: { solve: any }) {
  const st = s.stats.find((v: any) => v.caseId === solve.case_id),
    c = s.find(solve.case_id),
    time = effective(solve.time_ms, solve.penalty);
  if (!st || !c || st.mean == null) return null;
  const delta = time == null ? null : time - st.mean;
  return (
    <p className={cn("mt-4 flex items-center gap-2.5 text-[15px] font-semibold text-muted-foreground", FADE)}>
      {delta != null && (
        <Tip content={tr("Against your mean on this case")}>
          <span className={cn(NUMERIC, "rounded-lg px-2 py-0.5 text-[13px]", delta <= 0 ? "bg-success/15 text-success" : "bg-destructive/12 text-destructive")}>
            {(delta <= 0 ? "−" : "+") + (Math.abs(delta) / 1000).toFixed(2)} s
          </span>
        </Tip>
      )}
      {tr("{0}: best {1} · mean {2} over {3}", { 0: tr(c.name), 1: fmtTime(st.best), 2: fmtTime(st.mean), 3: plural(st.count, "attempt") })}
    </p>
  );
}

/** The previous or the next case of a training: one button, its name and its key (the key left out when short). */
function CaseStep({ action, label, keys, disabled, short }: { action: string; label: string; keys: string; disabled: boolean; short: boolean }) {
  return (
    <Button action={action} variant="default" disabled={disabled} tip={label + " · " + keys}>
      {label}
      {!short && <kbd className="rounded-md bg-black/10 px-1.5 text-xs">{keys}</kbd>}
    </Button>
  );
}

/** The session's latest attempts in a row, each case with its time (a click opens it), then the case now: as many as fit. */
function CaseQueue({ current }: { current: any }) {
  const [row, setRow] = useState<HTMLElement | null>(null),
    fit = Math.max(1, Math.floor((useWidth(row) + 6) / (QUEUE_ITEM + 6)) - (current ? 1 : 0)),
    recent = s.solves.slice(-fit),
    extremes = sessionExtremes(s.solves),
    cases = new Set(s.solves.map((v) => v.case_id)).size;
  return (
    <nav aria-label={tr("Attempts of the session")} className="flex items-center gap-3 rounded-[20px] bg-card px-3.5 py-2">
      <span className="text-xs font-bold text-faint">{tr("Attempts")}</span>
      <div ref={setRow} className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
        {recent.map((v) => (
          <SolveMenu key={v.id} solve={v}>
            <button type="button" data-action={"solve:" + v.id} onClick={run("solve:" + v.id)} style={{ width: QUEUE_ITEM }} className={cn("flex shrink-0 flex-col items-center gap-1 rounded-xl py-1 transition-colors hover:bg-muted", FOCUS)}>
              <Diagram c={s.find(v.case_id)} size={QUEUE_CUBE} />
              <span className={cn(NUMERIC, "text-xs font-bold", TONE_TEXT[solveTone(v, extremes)] || "text-faint")}>{fmtSolve(v.time_ms, v.penalty)}</span>
            </button>
          </SolveMenu>
        ))}
        {current && (
          <span aria-current="step" style={{ width: QUEUE_ITEM }} className="flex shrink-0 flex-col items-center gap-1 rounded-xl bg-accent py-1">
            <Diagram c={current} size={QUEUE_CUBE} />
            <span className="text-xs font-bold">{tr("now")}</span>
          </span>
        )}
      </div>
      <span className="pl-3 text-right text-[13px] font-semibold whitespace-nowrap text-faint">
        <b className={cn(NUMERIC, "block text-base text-foreground")}>{plural(s.solves.length, "attempt")}</b>
        {tr("on {0}", { 0: plural(cases, "case") })}
      </span>
    </nav>
  );
}
/** A cube of the row of attempts, and the width it takes with its time. */
const QUEUE_CUBE = 56,
  QUEUE_ITEM = 72;

/** The session on the right of a training: its figures, then its cases from the slowest to the fastest, or its times. */
function SessionBoard() {
  const [tab, setTab] = useState<"cases" | "times">("cases"),
    tried = new Set(s.solves.map((v) => v.case_id)),
    metrics = s.metrics(),
    extremes = sessionExtremes(s.solves),
    rows = trainingSessionRows<any, any>(s.cases().filter((c: any) => tried.has(c.id)), s.solves).sort((a, b) => (b.mean ?? Infinity) - (a.mean ?? Infinity)),
    lang = language();
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
        <h2 className="flex-1 truncate text-lg font-extrabold">
          {tr("Session")} <span className={cn(NUMERIC, "text-sm font-semibold text-faint")}>{s.solves.length}</span>
        </h2>
        <Segmented
          label={tr("Session")}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          options={[
            { id: "cases", label: tr("By case") },
            { id: "times", label: tr("Times") },
          ]}
        />
        <DropdownMenu>
          <Tip content={tr("Session")}>
            <DropdownMenuTrigger render={<UiButton variant="ghost" size="icon" data-action="menu:session" aria-label={tr("Session")} className="text-faint hover:text-foreground" />}>
              <EllipsisVertical />
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end" className="w-60">
            <MenuAction action="undo" icon={Undo2} disabled={!s.solves.length}>
              {tr("Delete the last solve")}
            </MenuAction>
            <MenuAction action="times" icon={X}>
              {tr("Hide the session · Alt+T")}
            </MenuAction>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid shrink-0 grid-cols-4 gap-1.5 px-4 pt-3.5">
        {metrics.map(([label, value, tone]) => (
          <div key={label} className="min-w-0 rounded-xl bg-muted px-2.5 py-2">
            <Figure label={said(label)} value={value} tone={tone === "good" ? "good" : ""} size="base" caption="small" />
          </div>
        ))}
      </div>
      <SessionCases />
      {tab === "cases" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-3 pb-3">
          {rows.length ? (
            <>
              <span className="px-2 pb-1 text-xs font-semibold text-faint">{tr("Slowest to fastest · {0}", { 0: plural(s.solves.length, "attempt") })}</span>
              {rows.map(({ c, count, mean, validCount }, i) => (
                <div key={c.id} aria-current={c.id === s.training?.id ? "step" : undefined} className="grid shrink-0 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 aria-[current=step]:bg-accent">
                  <Diagram c={c} size={34} />
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{tr(c.name)}</b>
                    <small className="block truncate text-xs font-semibold text-faint">
                      {plural(count, "attempt")}
                      {count > validCount ? " · " + tr("{0} DNF", { 0: count - validCount }) : ""}
                      {" · "}
                      {c.id === s.training?.id ? tr("now") : tr(c.setLabel)}
                    </small>
                  </span>
                  <span className={cn(NUMERIC, "text-[15px] font-bold", rows.length > 1 && (i === 0 ? "text-destructive" : i === rows.length - 1 ? "text-success" : ""))}>{fmtTime(mean)}</span>
                </div>
              ))}
            </>
          ) : (
            <NoTimes />
          )}
        </div>
      ) : (
        <div className="times-list flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-3 pb-3">
          {!s.solves.length && <NoTimes />}
          {[...s.solves].reverse().map((v, i) => (
            <TimeRow key={v.id} solve={v} number={s.solves.length - i} tone={solveTone(v, extremes)} touch={false} lang={lang} caption={tr(s.find(v.case_id)?.name ?? "")} />
          ))}
        </div>
      )}
    </>
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

/**
 * The cases the training drills, under the set they come from, the case now on the accent; and the way back to the
 * training's setup, where the choice stays as it is to change.
 */
function SessionCases() {
  const pool = s.practiceSelected,
    sets = new Map<string, any[]>();
  for (const c of s.cases()) if (pool.has(c.id)) sets.set(c.setLabel, [...(sets.get(c.setLabel) ?? []), c]);
  return (
    <section aria-label={tr("Cases")} className="flex shrink-0 flex-col gap-2 px-4 pt-4" data-no-timer>
      <div className="flex items-center gap-2">
        <h3 className="flex-1 truncate text-sm font-extrabold">
          {tr("Cases")} <span className={cn(NUMERIC, "font-semibold text-faint")}>{pool.size}</span>
        </h3>
        <Button action="trainingSetup" variant="outline" icon={ListChecks} tip={tr("Change what to train")}>
          {tr("Choose cases")}
        </Button>
      </div>
      <div className="flex max-h-[32vh] flex-col gap-2 overflow-y-auto">
        {[...sets].map(([set, cases]) => (
          <div key={set} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">
              {tr(set)} · <span className={NUMERIC}>{cases.length}</span>
            </span>
            <ul className="flex flex-wrap gap-0.5">
              {cases.map((c) => (
                <li key={c.id} title={tr(c.name)} aria-label={tr(c.name)} aria-current={c.id === s.training?.id ? "step" : undefined} className="rounded-lg p-0.5 aria-[current=step]:bg-accent">
                  <SeenDiagram c={c} size={36} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Back to the training setup, from the header of a running training. */
function ChangeTraining() {
  return <Button action="trainingSetup" icon={ChevronLeft} tip={tr("Change what to train")} />;
}

/** An empty session: in the middle of the column, what will appear here (how to start is under the timer). */
function NoTimes() {
  return (
    <Empty icon={ListOrdered} title={tr("No times yet")} className="px-4 py-8">
      <p className="text-xs">{tr("Every solve of this session lands here.")}</p>
    </Empty>
  );
}


/**
 * The timer session's name, edited in place: its own, or its day and event in the placeholder. Enter or leaving the
 * field keeps it, Escape gives up; emptied, the session shows its day and event again.
 */
function SessionName() {
  const current = s.currentSession(),
    [text, setText] = useState<string | null>(null),
    shown = text ?? current?.name ?? "";
  const commit = () => {
    if (text === null) return;
    setText(null);
    void s.renameSession(text).catch(s.fail);
  };
  return (
    <input
      aria-label={tr("Session name")}
      value={shown}
      placeholder={sessionName({ at: current?.at }, s.event().label)}
      maxLength={60}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          e.stopPropagation();
          setText(null);
          requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur?.());
        }
      }}
      className={cn("-mx-1.5 h-8 min-w-12 truncate rounded-lg [field-sizing:content] bg-transparent px-1.5 text-lg font-extrabold placeholder:text-foreground hover:bg-muted focus:bg-muted", FOCUS)}
    />
  );
}

/** The timer's sessions: a new one, or back to an earlier one of this event (the latest fifty). */
function SessionMenu() {
  const current = s.currentSession(),
    event = s.event().label,
    earlier = s.sessionList.filter((x) => x.id != null && (x.count || x.id === current?.id)).slice(0, 50);
  return (
    <DropdownMenu>
      <Tip content={tr("Sessions")}>
        <DropdownMenuTrigger render={<UiButton variant="ghost" size="icon" data-action="menu:session" aria-label={tr("Sessions")} className="text-faint hover:text-foreground" />}>
          <History />
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-72">
        <MenuAction action="session:new" icon={Plus}>
          {tr("New session")}
        </MenuAction>
        {!!earlier.length && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tr("Sessions")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(current?.id ?? "")} onValueChange={(v: string) => void s.action("session:" + v)}>
                {earlier.map((x) => (
                  <DropdownMenuRadioItem key={x.id} value={String(x.id)} closeOnClick data-action={"session:" + x.id}>
                    <span className="min-w-0 flex-1 truncate">{sessionName(x, event)}</span>
                    <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                      {new Date(x.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {x.count}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A solve as a small chip (a training's case, the average of five): tinted as the times list tints it. */
const CHIP = cn(NUMERIC, "flex items-center gap-1 rounded-[10px] bg-muted select-none transition-colors hover:bg-accent", FOCUS);

/** The last solve's four actions under the timer: quiet buttons sharing the row. */
const LAST_SOLVE = "flex-1 bg-card text-muted-foreground hover:bg-muted hover:text-foreground";

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
        <>
          <div className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
            {s.page === "playground" ? <SessionName /> : <h2 className="text-lg font-extrabold">{tr("Session")}</h2>}
            <span className={cn(NUMERIC, "text-sm font-semibold text-faint")}>{s.solves.length}</span>
            <span className="ml-auto flex items-center gap-1">
              {training && !!s.solves.length && (
                <Button action="undo" icon={Undo2} className="text-muted-foreground">
                  {tr("Undo")}</Button>
              )}
              {s.page === "playground" && <SessionMenu />}
              {closable && <Button action="times" icon={X} size="icon" tip={tr("Close")} className="text-faint hover:text-foreground" />}
            </span>
          </div>

        </>
      )}
      {training ? (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto", bare ? "-mx-2 mt-1" : "px-3 pb-3")}>
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
        <div className={cn("times-list flex min-h-0 flex-1 flex-col overflow-y-auto", bare ? "-mx-2 mt-1" : "px-3 pb-3")}>
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
  function TimeRow({ solve: v, number, tone, touch, caption }: { solve: any; number: number; tone: ReturnType<typeof solveTone>; touch: boolean; lang: string; caption?: string }) {
    return (
      <SolveMenu solve={v}>
        <div className={cn(ROW, "group/row flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-2 select-none has-[[data-row]:focus-visible]:ring-3 has-[[data-row]:focus-visible]:ring-ring/50 has-[[data-row]:focus-visible]:ring-inset", touch && "h-11 active:bg-muted/50")}>
          <button
            type="button"
            data-action={"solve:" + v.id}
            data-row
            onClick={run("solve:" + v.id)}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left outline-none"
          >
            <span className={cn(NUMERIC, "w-7 shrink-0 text-right text-sm text-faint")}>{number}</span>
            <span className={cn(NUMERIC, "font-semibold", touch ? "text-base" : "text-[15px]", TONE_TEXT[tone])}>{fmtSolve(v.time_ms, v.penalty)}</span>
            {v.comment && <MessageSquare className="size-3 text-muted-foreground" />}
            {v.solution && <Rotate3d className="size-3 text-muted-foreground" aria-label={tr("Turned on a connected cube")} />}
            {caption && <span className="ml-auto truncate text-xs font-semibold text-faint">{caption}</span>}
          </button>
          <SolveActions solve={v} className={cn(touch && "hidden")} />
        </div>
      </SolveMenu>
    );
  },
  (a, b) =>
    a.number === b.number && a.tone === b.tone && a.touch === b.touch && a.lang === b.lang && a.caption === b.caption &&
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
  const chip = cn("justify-center font-semibold", mobile ? "h-7 min-w-0 flex-1 px-1 text-xs" : "h-9 min-w-20 px-3 text-[15px]");
  return (
    <div className={cn(NUMERIC, "average-window flex shrink-0 items-center justify-center", mobile ? "mt-6 w-full gap-1" : "mt-7 gap-1.5 [@media(max-height:700px)]:mt-3 [@container(max-height:13rem)]:hidden", FADE)} aria-label={tr("Current average of 5")} data-no-timer>
      {Array.from({ length: 5 }, (_, i) => {
        const v = last[i - (5 - last.length)];
        if (!v)
          return (
            <span key={i} className={cn(chip, "flex items-center rounded-[10px] bg-muted/50 text-faint")}>
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
                index === last.length - 1 && "ring-1 ring-foreground/30",
              )}
            >
              {dropped ? `(${time})` : time}
            </button>
          </SolveMenu>
        );
      })}
      {!mobile && <span className={cn("ml-2 min-w-24 text-[15px] font-bold", full ? "text-lilac" : "text-faint")}>{tr("Ao5")} {fmtTime(ao5)}</span>}
    </div>
  );
}
