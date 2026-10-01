/** The timer page and a running training: prompt, timer, session figures and the times list. */
import { isReviewMode, learningTrackOf } from "../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES, heldMoves } from "../../src/shared/crossPlusOne";
import { heldScramble } from "../../src/shared/puzzles";
import { practiceSummary, sessionExtremes, solveTone, trainingSessionRows, type Metric } from "../../src/client/lib/practiceSummary";
import { PracticeTimer, timerHint, type TimerPhase, type TimerSnapshot } from "../../src/client/lib/practiceTimer";
import { TONE_TEXT } from "../../src/client/lib/tone";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Ban,
  Box,
  Check,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutList,
  ListOrdered,
  MessageSquare,
  PlayCircle,
  Plus,
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
  FADE,
  Figure,
  LABEL,
  NUMERIC,
  PAGE,
  MenuAction,
  MenuChoice,
  PageHead,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneSheet, TouchAction, TouchBar } from "./phone";

/** Keys typed into a field, a menu or a dialog never reach the timer. */
const typingInto = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement).closest?.("input,textarea,select,[role=menu],[role=dialog],[role=listbox]");

/**
 * The timer page's timer: Space (or a touch on phones) holds, releases and stops. It re-renders the page only when
 * its phase changes; the running time is drawn by `LiveDigits`.
 */
function useTimer(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [timer] = useState(() => new PracticeTimer({
    canStart: () => enabledRef.current,
    onStop: ms => { void s.save(ms); },
    onChange: snapshot => {
      setSnapshot(snapshot);
      s.running = snapshot.phase === "running";
      s.learningFrozen = ["holding", "ready", "running"].includes(snapshot.phase);
      s.emit();
    },
  }));
  const { press, release } = timer;
  const stop = () => { if (timer.snapshot.phase === "running") timer.press(); };
  useEffect(() => { timer.reset(); }, [s.timerEpoch, timer]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (timer.snapshot.phase === "running") {
        e.preventDefault();
        stop();
        return;
      }
      if (typingInto(e) || s.overlay || (s.entry === "typing" && s.page === "playground")) return;
      if (e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // The button focused last must not be clicked by the release.
        (document.activeElement as HTMLElement | null)?.blur?.();
        press();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    const blur = timer.cancelArming;
    const pointer = () => {
      if (timer.snapshot.phase === "running") stop();
    };
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
  return { phase, elapsed: snapshot.elapsed, startedAt: snapshot.startedAt, press, release };
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
 * The running digits: tinted with the accent, the milliseconds smaller in a muted version of it; red while holding,
 * green once ready.
 */
export function Digits({ text, phase, className, digitsRef, "data-tour": tour }: { text: string; phase: string; className?: string; digitsRef?: React.Ref<HTMLDivElement>; "data-tour"?: string }) {
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
      {text.split("").map((ch, i) => (
        <span key={i} className={text.includes(".") && i > text.indexOf(".") ? cn("text-[0.62em] tracking-[-0.03em]", !armed && "text-[color:color-mix(in_oklch,var(--muted-foreground)_78%,var(--primary))]") : undefined}>
          {ch}
        </span>
      ))}
    </div>
  );
}

/**
 * The digits of a timer: `text` at rest, the time since `startedAt` while `phase` is running. Only this component
 * re-renders on animation frames, never the page around it.
 */
export const LiveDigits = memo(function LiveDigits({ startedAt, text, ...digits }: { startedAt: number } & React.ComponentProps<typeof Digits>) {
  const running = digits.phase === "running",
    [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [running, startedAt]);
  return <Digits {...digits} text={running ? fmtTime(now - startedAt) : text} />;
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
  const enabled =
      !s.saving &&
      !s.generating &&
      !s.error &&
      (!training || (!!s.practiceSelected.size && s.practiceSelected.has(s.training?.id))),
    timer = useTimer(enabled),
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
    hasCube = training ? !!c && !c.flat && !c.diagram : !!cubeSize,
    text = (training ? s.training?.setup : s.scramble) ?? "",
    promptFont = mobile
      ? text.length > 90 ? 15 : 18
      : text.length > 220 ? 15 : text.length > 120 ? (compact ? 17 : 19) : compact ? 21 : 26,
    cubePane = ready && (hasCube || training),
    cubeShown = cubePane && s.showCube,
    previewSize = mobile ? (h < 760 ? 0 : 84) : Math.round(Math.max(116, Math.min(196, h * 0.19)));
  const hint = timerHint(timer.phase, {
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
  const showCube = !mobile && cubePane && !cubeShown && (
    <Button action="cube" icon={Box} size="icon-sm" tip="Show the cube" className="text-muted-foreground" />
  );
  const solutionToggle = (
    <Button action="solution" icon={s.revealed ? EyeOff : Eye} size="sm" tip="Alt+H" className="-ml-2.5 text-muted-foreground">
      {s.revealed ? "Hide solution" : "Show solution"}
    </Button>
  );
  const learnedToggle = training && c && (
    <ActionToggle action={"learn:" + c.id} pressed={s.learned.has(c.id)} size="sm" icon={s.learned.has(c.id) ? Check : undefined} className="aria-pressed:bg-success/15 aria-pressed:text-success">
      {s.learned.has(c.id) ? "Learned" : "Mark learned"}
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
                  className="text-lg font-semibold tracking-tight outline-none hover:text-primary focus-visible:text-primary"
                >
                  {c.name}
                </button>
                <span className="text-sm text-muted-foreground">
                  {learning ? s.dailyStatus : c.setLabel + (c.group && c.group !== c.setLabel ? " · " + c.group : "")}
                </span>
                {!mobile && (
                  <span className="ml-auto flex items-center gap-1" data-no-timer>
                    {learnedToggle}
                    {showCube}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>Setup</span>
                <Alg text={s.training.setup} size={promptFont} />
              </div>
              {s.revealed && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>Algorithm</span>
                  <Alg text={s.training.algorithm} size={Math.max(15, promptFont - 5)} className="text-foreground/85" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1" data-no-timer>
                {solutionToggle}
                {c.algorithms[0]?.youtube && (
                  <Button action={"url:" + c.algorithms[0].youtube} icon={PlayCircle} size="sm" className="text-muted-foreground">
                    {mobile ? "Video" : "Watch video"}
                  </Button>
                )}
                {mobile && learnedToggle}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-2 py-4" data-no-timer>
              <strong className="text-lg font-semibold tracking-tight">{reviewing ? "No learned cases yet" : learning ? "Track complete" : "Choose your cases"}</strong>
              <span className="text-sm text-muted-foreground">{learning ? s.dailyStatus : "Select the cases you want to practise."}</span>
              <div className="mt-2 flex gap-2">
                {!learning && <Button action="trainingSetup" variant="default">Choose cases</Button>}
                {track && !reviewing && s.trackLearnedCount > 0 && (
                  <Button action={"learningMode:review:" + track} variant="default">Train learned</Button>
                )}
              </div>
            </div>
          )
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="scramble max-h-[30vh] min-w-0 flex-1 overflow-y-auto" data-tour="scramble">
                {s.generating && !s.scramble ? (
                  <span className="flex flex-col gap-2" aria-label="Generating a scramble">
                    <Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} />
                    <Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} />
                  </span>
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
      {cubeShown && previewSize > 0 && (
        <div className="group/cube relative shrink-0" style={{ width: previewSize, height: previewSize }}>
          {visual}
          {!mobile && (
            <Button action="cube" icon={X} size="icon-xs" tip="Hide the cube" className="absolute -top-1 -right-1 text-muted-foreground opacity-0 transition-opacity group-hover/cube:opacity-100 focus-visible:opacity-100" />
          )}
        </div>
      )}
    </section>
  );
  const timesToggle = !timesAlways && !mobile && (
    <ActionToggle action="times" pressed={s.showTimes} icon={ListOrdered} tip="Alt+T">
      {training ? "Session" : "Times"}
    </ActionToggle>
  );
  const replay = hasCube && ready && !mobile && <Button action="replayCube" icon={RotateCcw} tip="Replay the scramble on the cube" />;
  // The Ao5 has its own line under the digits and the solve count heads the times list: the strip keeps the rest.
  const metrics = s.metrics().filter(([label]) =>
    mobile
      ? ["Best", "Worst", "Ao5", "Ao12", "Mean"].includes(label)
      : !(label === "Ao5" && s.practicePage() === "playground") && !(label === "Solves" && timesColumn),
  );
  const statistics = (
    // Desktop: each figure on one line, label left and value right; two rows of three when the band is narrow, one row
    // when there is room. Lines split the figures of a row.
    <div className="@container shrink-0" data-tour="session">
    <Strip
      label="Statistics"
      className={cn(mobile ? "grid-cols-4 px-3" : "grid-cols-3 gap-x-0 gap-y-2.5 px-0 py-2.5 @5xl:grid-flow-col @5xl:grid-cols-none @5xl:auto-cols-fr")}
    >
      {/* On the desktop every figure takes an equal share of the band. */}
      {metrics.slice(0, mobile ? 4 : undefined).map(([label, value, tone], i) => (
        <Figure
          key={label}
          label={label}
          value={value}
          tone={tone}
          size={mobile ? "sm" : "lg"}
          inline={!mobile}
          className={cn(mobile ? "items-center text-center" : cn("px-4", i % 3 !== 0 && "border-l", i > 0 && i % 3 === 0 && "@5xl:border-l"))}
        />
      ))}
    </Strip>
    </div>
  );
  const head = (
    cross ? (
        <PageHead
          title="Cross + 1"
          puzzle={!mobile}
          lead={<ChangeTraining />}
          sub={mobile ? `${s.crossMoves}-move first block` : "Training"}
          more={
            mobile && (
              <MenuChoice label="First block" action="crossMoves" value={String(s.crossMoves)} options={CROSS_PLUS_ONE_MOVES.map((n) => ({ id: String(n), label: `${n} moves` }))} />
            )
          }
        >
          {!mobile && (
            <Choice
              prefix="crossMoves:"
              label="Moves"
              value={String(s.crossMoves)}
              options={CROSS_PLUS_ONE_MOVES.map((n) => ({ id: String(n), label: `${n} moves` }))}
            />
          )}
          {replay}
          {timesToggle}
        </PageHead>
      ) : training ? (
        <PageHead
          title={track ? `Learn ${track}` : reviewing ? "Review" : "Free practice"}
          lead={<ChangeTraining />}
          sub={track ? "Training · one new case a day" : reviewing ? "Training · every learned case" : "Training · " + plural(s.practiceSelected.size, "case")}
          more={
            mobile && (
              <>
                {learning && !reviewing && <MenuAction action="menu:learningGroups" icon={LayoutList}>Group order</MenuAction>}
                {track && (
                  <MenuAction action={"learningMode:" + (reviewing ? track : "review:" + track)} icon={Check} disabled={!reviewing && !s.trackLearnedCount}>
                    {reviewing ? `Learn ${track}` : "Train learned"}
                  </MenuAction>
                )}
                <MenuAction action="auf" icon={Shuffle}>
                  Random AUF {s.randomAuf ? "· on" : "· off"}
                </MenuAction>
              </>
            )
          }
        >
          {!mobile && learning && !reviewing && (
            <Button action="menu:learningGroups" icon={LayoutList}>
              Groups
            </Button>
          )}
          {!mobile && track && (
            <ActionToggle
              action={"learningMode:" + (reviewing ? track : "review:" + track)}
              pressed={reviewing}
              disabled={!reviewing && !s.trackLearnedCount}
              tip={`Train every learned ${track} case`}
            >
              Train learned
            </ActionToggle>
          )}
          {!mobile && (
            <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip="Random AUF · Alt+A">
              {!compact && "Random AUF"}
            </ActionToggle>
          )}
          {replay}
          <Button action="previous" icon={ChevronLeft} disabled={!s.training?.canPrevious} tip="Previous case · Alt+P" />
          {!mobile && (!learning || reviewing) && <Button action="next" icon={ChevronRight} tip="Next case · Alt+N" />}
          {timesToggle}
        </PageHead>
      ) : (
        <PageHead title="Timer" puzzle="scramble">
          {!mobile && (
            <>
              <SelectMenu action="scrambleType" caption={compact ? undefined : "Scramble"} value={s.scrambleType} options={s.scrambleOptions()} />
              <SelectMenu action="entry" caption={compact ? undefined : "Entry"} value={s.entry} options={TIME_ENTRIES} />
            </>
          )}
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
          {/* On the desktop the header heads the stage's column, so the times card beside it reaches the top. */}
          {!mobile && head}
          {/* Phones keep the stage as a card (the whole card is the tap target); the desktop sets the scramble, the cube
              and the digits straight on the page. */}
          <Stage
            className={cn("stage flex-1", mobile ? "touch-manipulation select-none" : "flex min-h-0 flex-col pt-1 pb-1")}
            onPointerDown={(e) => {
              if (e.target instanceof HTMLInputElement || (e.target as HTMLElement).closest("button, a, [data-no-timer]")) return;
              if (mobile || running) timer.press();
            }}
            onPointerUp={timer.release}
          >
            <div className={cn("contents", mobile && "flex min-h-0 flex-1 flex-col px-4 pt-4")}>
              {prompt}
              <section
                className="timer relative flex min-h-0 flex-1 touch-manipulation flex-col items-center justify-center select-none [container-type:size]"
                data-phase={timer.phase[0]!.toUpperCase() + timer.phase.slice(1)}
              >
                {typing ? (
                  <input
                    ref={typedRef}
                    className={cn(NUMERIC, "w-[min(100%,9ch)] border-b-2 border-border bg-transparent pb-2 text-center text-[clamp(48px,20cqh,120px)] leading-none font-medium tracking-tight outline-none placeholder:text-muted-foreground/40 focus:border-primary")}
                    aria-label="Time"
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
                    className={mobile ? "text-[clamp(64px,min(calc(160cqw/var(--chars)),42cqh),128px)]" : "text-[clamp(56px,min(calc(150cqw/var(--chars)),34cqh),232px)]"}
                  />
                )}
                <div data-tour="timer" className={cn("timer-hint mt-3 flex min-h-5 items-center gap-1.5 text-center text-sm text-muted-foreground md:mt-4", s.notice && "font-medium text-success", FADE)}>
                  {s.notice ? (
                    <>
                      {training ? <Check className="size-4" /> : <Trophy className="size-4" />}
                      {s.notice}
                    </>
                  ) : typing
                    ? typed
                      ? parseTypedTime(typed)
                        ? `${fmtTime(parseTypedTime(typed))} · Enter to save`
                        : "Not a time"
                      : "Type your time, then Enter: 1234 is 12.34"
                    : hint}
                </div>
                {s.practicePage() === "playground" && <AverageWindow mobile={mobile} />}
                {/* The last solve's actions, there before the first solve too (disabled) so the timer never moves. */}
                {!mobile && (
                  <div className={cn("mt-3 flex shrink-0 flex-wrap items-center justify-center gap-1.5", FADE)} aria-label="Last solve" data-no-timer>
                    <ActionToggle action={"penalty:" + last?.id + ":+2"} pressed={last?.penalty === "+2"} disabled={!last || s.saving} size="sm" variant="outline" className="aria-pressed:text-warning">
                      +2
                    </ActionToggle>
                    <ActionToggle action={"penalty:" + last?.id + ":dnf"} pressed={last?.penalty === "dnf"} disabled={!last || s.saving} size="sm" variant="outline" className="aria-pressed:text-destructive">
                      DNF
                    </ActionToggle>
                    <Button action={"comment:" + last?.id} icon={MessageSquare} disabled={!last || s.saving} size="sm" variant="outline" className={cn("text-muted-foreground", last?.comment && "text-primary")}>
                      Comment
                    </Button>
                    <Button action={"delete:" + last?.id} icon={Trash2} disabled={!last || s.saving} size="sm" variant="outline" className="text-muted-foreground hover:text-destructive">
                      Delete
                    </Button>
                  </div>
                )}
              </section>
            </div>
            {/* Phones: the last solve's actions and the next scramble as large targets at the thumb, under the stage. */}
            {mobile && (
              <TouchBar className={cn("shrink-0 border-t px-2 py-1.5", FADE)}>
                <TouchAction action={"penalty:" + last?.id + ":+2"} label="+2" icon={Plus} pressed={last?.penalty === "+2"} disabled={!last || s.saving} tone="warning" />
                <TouchAction action={"penalty:" + last?.id + ":dnf"} label="DNF" icon={Ban} pressed={last?.penalty === "dnf"} disabled={!last || s.saving} tone="bad" />
                <TouchAction action={"comment:" + last?.id} label="Comment" icon={MessageSquare} disabled={!last || s.saving} />
                <TouchAction action={"delete:" + last?.id} label="Delete" icon={Trash2} disabled={!last || s.saving} />
                {training ? (
                  (!learning || reviewing) && <TouchAction action="next" label="Next case" icon={ChevronRight} />
                ) : (
                  <TouchAction action="next" label="Scramble" icon={Shuffle} />
                )}
              </TouchBar>
            )}
          </Stage>
          {mobile ? <SessionPeek training={training} /> : statistics}
        </div>
        {timesColumn && (
          <aside aria-label="Session times" data-tour="session" className={cn("flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border bg-card xl:w-68", FADE)}>
            <Times closable={!timesAlways} />
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
            <>
              {training ? "Session" : "Times"} <span className={cn(NUMERIC, "font-normal text-muted-foreground")}>{s.solves.length}</span>
            </>
          }
          description="Tap a time for its details · hold it for +2, DNF or delete"
          snapPoints={[0.5, 1]}
          className="gap-3"
        >
          <div className="grid shrink-0 grid-cols-4 gap-x-4 gap-y-3 rounded-xl bg-muted/45 px-3 py-3">
            {s.metrics().map(([label, value, tone]) => (
              <Figure key={label} label={label} value={value} tone={tone} size="sm" />
            ))}
          </div>
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
      className={cn("flex h-14 shrink-0 items-center gap-4 rounded-xl bg-muted/45 px-4 text-left outline-none active:bg-muted/70", FADE)}
      aria-label="Session times"
      data-tour="session"
    >
      {figures.map(([label, value, tone]) => (
        <Figure key={label} label={label} value={value} tone={tone} caption="small" size="base" className="flex-1" />
      ))}
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <span className={NUMERIC}>{plural(s.solves.length, training ? "attempt" : "solve")}</span>
        <ChevronUp className="size-4" />
      </span>
    </button>
  );
}

/** Optimal back-block solutions under the scramble, held with white on the bottom and green in front (z2). */
function CrossSolution({ font, toggle }: { font: number; toggle: React.ReactNode }) {
  const solutions = s.revealed && s.crossSolutions?.scramble === s.scramble ? s.crossSolutions.list : undefined;
  return (
    <>
      {s.revealed && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Solution · z2, white on the bottom</span>
          {solutions ? (
            <div className="flex flex-col gap-1.5">
              {solutions.map((v) => (
                <div key={v.moves + v.slot} className="flex items-baseline gap-4">
                  <Alg text={heldMoves(v.moves)} size={font} />
                  <span className="text-xs text-muted-foreground">{v.slot} block</span>
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
  return <Button action="trainingSetup" icon={ChevronLeft} tip="Change what to train" className="size-8 max-md:size-10" />;
}

/** An empty session: in the middle of the column, what will appear here (how to start is under the timer). */
function NoTimes() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <ListOrdered className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">No times yet</span>
        <span className="text-xs text-muted-foreground">Every solve of this session lands here.</span>
      </div>
    </div>
  );
}

/** The session's times, newest first, as plain rows; right-click a row for its menu. */
function Times({ closable = true, bare = false, touch = false }: { closable?: boolean; bare?: boolean; touch?: boolean }) {
  const training = s.practicePage() === "training",
    extremes = sessionExtremes(s.solves);
  return (
    <>
      {/* The column's heading: its name and count, its actions on the right, a line under it across the panel. */}
      {!bare && (
        <header className="flex h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
          <h2 className="text-sm font-medium">{training ? "Session" : "Times"}</h2>
          <Badge variant="secondary" className={cn(NUMERIC, "min-w-5 px-1.5 text-muted-foreground")}>
            {s.solves.length}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            {training && !!s.solves.length && (
              <Button action="undo" icon={Undo2} size="xs" className="text-muted-foreground">
                Undo
              </Button>
            )}
            {closable && <Button action="times" icon={X} size="icon-xs" tip="Close" />}
          </div>
        </header>
      )}
      {training ? (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto", bare ? "-mx-2 mt-1" : "p-2")}>
          {trainingSessionRows<any, any>(
            s.cases().filter((c: any) => s.practiceSelected.has(c.id) || s.solves.some((v) => v.case_id === c.id)),
            s.solves,
          ).map(({ c, solves, best: fastest, mean: average, validCount }) => (
            <div key={c.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
              <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                <Diagram c={c} size={36} />
                <span className="max-w-full truncate text-[11px] text-muted-foreground">{shortId(c)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                {!solves.length ? (
                  <span className="text-sm text-muted-foreground/60">No attempt yet</span>
                ) : (
                  <>
                    {validCount > 1 && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>mean {fmtTime(average)}</span>}
                    <div className="flex flex-wrap gap-1">
                      {[...solves].reverse().map((v) => (
                        <SolveMenu key={v.id} solve={v}>
                          <button
                            type="button"
                            data-action={"solve:" + v.id}
                            onClick={run("solve:" + v.id)}
                            className={cn(
                              NUMERIC,
                              "flex h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-xs outline-none select-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50",
                              touch && "h-9 px-2.5 text-sm",
                              v.penalty === "dnf" ? "text-destructive" : effective(v.time_ms, v.penalty) === fastest ? "text-success" : v.penalty === "+2" ? "text-warning" : "",
                            )}
                          >
                            {fmtSolve(v.time_ms, v.penalty)}
                            {v.comment && <MessageSquare className="size-3 text-muted-foreground" />}
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
            <SolveMenu key={v.id} solve={v}>
              <div className={cn("group/row flex h-8 shrink-0 items-center gap-2 rounded-md px-2 select-none hover:bg-muted/50", touch && "h-11 active:bg-muted/50")}>
                <button
                  type="button"
                  data-action={"solve:" + v.id}
                  onClick={run("solve:" + v.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left outline-none"
                >
                  <span className={cn(NUMERIC, "w-7 shrink-0 text-right text-xs text-muted-foreground")}>{s.solves.length - i}</span>
                  <span className={cn(NUMERIC, touch ? "text-base" : "text-sm", TONE_TEXT[solveTone(v, extremes)])}>{fmtSolve(v.time_ms, v.penalty)}</span>
                  {v.comment && <MessageSquare className="size-3 text-muted-foreground" />}
                </button>
                <SolveActions solve={v} className={cn(touch && "hidden")} />
              </div>
            </SolveMenu>
          ))}
        </div>
      )}
    </>
  );
}

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
  const chip = cn("flex h-7 items-center justify-center rounded-md", mobile ? "min-w-0 flex-1 px-1 text-xs" : "min-w-18 px-2");
  return (
    <div className={cn(NUMERIC, "average-window mt-6 flex w-full shrink-0 items-center justify-center gap-1.5 text-sm md:mt-8", mobile && "gap-1", FADE)} aria-label="Current average of 5" data-no-timer>
      {!mobile && <span className={cn(LABEL, "mr-1.5")}>Ao5</span>}
      {Array.from({ length: 5 }, (_, i) => {
        const v = last[i - (5 - last.length)];
        if (!v)
          return (
            <span key={i} className={cn(chip, "border border-dashed bg-muted/30 text-muted-foreground/50")}>
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
                chip,
                "border bg-muted/60 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                dropped && "text-muted-foreground",
                !dropped && v.penalty === "+2" && "text-warning",
                v.penalty === "dnf" && "text-destructive",
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
