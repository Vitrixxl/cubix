/**
 * A smart cube solve, step by step: a bar under the timer with a colour per step, as long as the step took; a click
 * on a step opens the analysis on it, with the step replayed as it was turned (and held, with a gyroscope).
 * A saved solve shows the solution kept with it, played in 3D, and the same analysis worked out again from it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { PLAYER_SPEEDS, speedLabel } from "../../src/client/lib/algPlayer";
import { SmartCube, stateToFacelets } from "../../src/client/lib/smartCube";
import { COLOUR_NAMES, type Phase, type PhaseId, type Segment, type SolveAnalysis } from "../../src/client/lib/solveAnalysis";
import { recordedSolve, type SolutionTurn } from "../../src/client/lib/solution";
import { call } from "./bridge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { LiveCube } from "./LiveCube";
import { Alg, DOT, Diagram, FOCUS, StatCard, LABEL, Modal, NUMERIC, ROW, Strip, Tip, usePhone, useViewport } from "./ui";
import { catalog, store as s } from "./store";
import { stepColour } from "./stepColour";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** The case of a step, opened over the analysis: Learn's dialog, loaded with Learn when first needed. */
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const tps = (phase: Phase) => (phase.execution > 0 ? (phase.turns.length / (phase.execution / 1000)).toFixed(1) : "–");
/** A text with its first letter in capitals. */
export const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A colour of the cube, and the cross of that colour, in the current language. */
export const colourLabel = (colour: string) => ({ yellow: tr("yellow"), white: tr("white"), green: tr("green"), blue: tr("blue"), orange: tr("orange"), red: tr("red") })[colour] ?? colour;
const crossName = (colour: string) =>
  ({ yellow: tr("Yellow cross"), white: tr("White cross"), green: tr("Green cross"), blue: tr("Blue cross"), orange: tr("Orange cross"), red: tr("Red cross") })[colour] ?? colour;

/**
 * The steps side by side, each as wide as it took, in colours only; skipped steps take no room. The selected step
 * stands out and shows its time; the others give theirs on hover.
 */
export function SolveBar({ analysis, selected, onSelect, large = false, legend = true, className }: { analysis: SolveAnalysis; selected?: PhaseId; onSelect: (id: PhaseId) => void; large?: boolean; legend?: boolean; className?: string }) {
  const shown = analysis.phases.filter((phase) => !phase.skip);
  return (
    <div className={cn("flex w-full flex-col", large ? "gap-2" : "gap-1.5", className)}>
      {/* As tall as a selected step, so growing moves nothing around it. */}
      <div className={cn("flex w-full items-center gap-1", large ? "h-6" : "h-5")} role="group" aria-label={tr("Solve steps")}>
        {shown.map((phase) => (
          <Tip key={phase.id} content={`${said(phase.label)} · ${seconds(phase.end - phase.start)} s`}>
            <button
              type="button"
              data-step={phase.id}
              aria-label={`${said(phase.label)}, ${seconds(phase.end - phase.start)} s`}
              aria-pressed={selected === phase.id}
              onClick={() => onSelect(phase.id)}
              style={{ flexGrow: Math.max(phase.end - phase.start, 1), flexBasis: 0, background: stepColour(phase.id) }}
              className={cn(
                "relative min-w-2 rounded-full transition-[height] duration-150",
                FOCUS,
                selected === phase.id ? (large ? "h-6" : "h-5") : large ? "h-3 hover:h-4" : "h-2.5 hover:h-3.5",
              )}
            >
              {/* A step done in two looks: a notch where the first ends. */}
              {phase.looks && (
                <span
                  className="absolute inset-y-0 w-0.5 bg-background/70"
                  style={{ left: `${((phase.looks[0]!.end - phase.start) / Math.max(phase.end - phase.start, 1)) * 100}%` }}
                />
              )}
            </button>
          </Tip>
        ))}
      </div>
      {legend && <SolveLegend analysis={analysis} selected={selected} onSelect={onSelect} large={large} />}
    </div>
  );
}

/** Each step's colour and name; the selected one with its time. */
export function SolveLegend({ analysis, selected, onSelect, large = false, className }: { analysis: SolveAnalysis; selected?: PhaseId; onSelect: (id: PhaseId) => void; large?: boolean; className?: string }) {
  const shown = analysis.phases.filter((phase) => !phase.skip);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground", large ? "text-sm" : "text-xs", className)}>
      {shown.map((phase) => (
        <button
          key={phase.id}
          type="button"
          onClick={() => onSelect(phase.id)}
          className={cn("flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground", FOCUS, selected === phase.id && "font-medium text-foreground")}
        >
          <span className="size-2 rounded-full" style={{ background: stepColour(phase.id) }} />
          {said(phase.label)}
          {selected === phase.id && <span className={NUMERIC}>{seconds(phase.end - phase.start)} s</span>}
        </button>
      ))}
    </div>
  );
}

/** The bar of the last solve under the timer, and its analysis on a click. */
export function SolveStrip({ analysis }: { analysis: SolveAnalysis }) {
  const [open, setOpen] = useState<PhaseId | null>(null);
  // Pairs made with the cross show in its name (XCross); a ZBLL solves the PLL with the rest of the last layer.
  const zbll = analysis.phases.some((p) => p.label === "ZBLL"),
    skips = analysis.phases.filter((p) => p.skip && (p.id === "oll" || (p.id === "pll" && !zbll))).map((p) => p.label);
  return (
    // The legend on the left and the solve's figures on the right, the bar under them across the whole width.
    <div className="flex shrink-0 flex-col gap-2" data-no-timer aria-label={tr("Last solve steps")}>
      <div className="flex items-center gap-4">
        <SolveLegend analysis={analysis} onSelect={setOpen} className="min-w-0 flex-1" />
        <span className={cn(NUMERIC, "shrink-0 text-sm text-muted-foreground")}>
          {analysis.turns} {" "}{tr("turns ·")}{" "}{analysis.tps.toFixed(2)} {" "}{tr("TPS")}{skips.length ? tr(" · {0} skip", { 0: skips.join(", ") }) : ""}
        </span>
        <Button variant="outline" onClick={() => setOpen(analysis.phases[0]!.id)}>
          {tr("Analysis")}</Button>
      </div>
      <SolveBar analysis={analysis} onSelect={setOpen} legend={false} />
      <SolveDialog analysis={analysis} phase={open} onPhase={setOpen} />
    </div>
  );
}

/** A recorded solution's analysis, opened in its dialog: on wide screens, for a timed 3×3 solve. */
export function SolveAnalysisButton({ solve, turns }: { solve: { scramble?: string | null }; turns: SolutionTurn[] }) {
  const phone = usePhone(),
    [analysis, setAnalysis] = useState<SolveAnalysis | null>(null),
    [open, setOpen] = useState<PhaseId | null>(null);
  useEffect(() => {
    setAnalysis(null);
    const recording = !phone && recordedSolve(solve.scramble, turns);
    if (!recording) return;
    let current = true;
    call("analyseSolve", recording)
      .then((analysis) => current && setAnalysis(analysis as SolveAnalysis | null))
      .catch(() => {});
    return () => void (current = false);
  }, [turns, solve.scramble, phone]);
  if (!analysis) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(analysis.phases[0]!.id)}>
        {tr("Analysis")}
      </Button>
      <SolveDialog analysis={analysis} phase={open} onPhase={setOpen} />
    </>
  );
}

/**
 * Replays a step on a cube of its own, as it was turned: the pause before it, then each turn at its time, `speed`
 * times as fast; the cube is held as it was when the cube has a gyroscope.
 */
function useReplay(analysis: SolveAnalysis, phase: Phase) {
  const cube = useMemo(() => new SmartCube(), []),
    { moves, orientations } = analysis.recording,
    [index, setIndex] = useState(phase.from),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    clock = useRef(0);
  /** When the replay of the step starts: at the end of the step before, or a moment before the first turn. */
  const startOf = (i: number) => (i > 0 ? moves[i - 1]!.at : moves[0]!.at - 400);
  const hold = (at: number) => {
    const sample = orientations.filter((o) => o.at <= at).at(-1) ?? orientations[0];
    if (sample && sample.quaternion !== cube.snapshot.orientation) cube.receive({ type: "orientation", quaternion: sample.quaternion });
  };
  const seek = (i: number) => {
    cube.receive({ type: "facelets", facelets: stateToFacelets(analysis.states[i]!) });
    clock.current = startOf(i);
    hold(clock.current);
    setIndex(i);
  };
  useEffect(() => {
    seek(phase.from);
    setPlaying(!phase.skip);
  }, [phase.id, analysis]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = performance.now(),
      i = index;
    if (i >= phase.to) {
      seek(phase.from);
      i = phase.from;
    }
    const tick = (now: number) => {
      clock.current += (now - last) * speed;
      last = now;
      while (i < phase.to && moves[i]!.at <= clock.current) {
        cube.receive({ type: "move", move: moves[i]!.move, at: moves[i]!.at });
        i++;
      }
      hold(clock.current);
      setIndex(i);
      if (i >= phase.to && clock.current > moves[phase.to - 1]!.at + 300) return setPlaying(false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, phase.id]);
  return { cube, index, playing, speed, setSpeed, seek, toggle: () => setPlaying((p) => !p && !phase.skip) };
}

function SolveDialog({ analysis, phase: id, onPhase }: { analysis: SolveAnalysis; phase: PhaseId | null; onPhase: (id: PhaseId | null) => void }) {
  return (
    <>
      <Modal
        open={!!id}
        onOpenChange={(open) => !open && onPhase(null)}
        title={tr("Solve analysis")}
        tall
        className="flex h-[calc(100svh-3rem)] w-[calc(100vw-3rem)] max-w-[1400px] flex-col gap-6 p-8 sm:max-w-[1400px]"
      >
        <div className="grid grid-cols-4 gap-3">
          <StatCard label={tr("Time")} value={`${seconds(analysis.time)} s`} dot={DOT.accent} size="sm" className="bg-muted" />
          <StatCard label={tr("Turns")} value={analysis.turns} size="sm" className="bg-muted" />
          <StatCard label={tr("TPS")} value={analysis.tps.toFixed(2)} dot={DOT.lilac} size="sm" className="bg-muted" />
          <StatCard label={tr("Cross")} value={crossName(COLOUR_NAMES[analysis.cross])} dot="bg-faint" size="sm" className="bg-muted" />
        </div>
        <SolveBar analysis={analysis} selected={id ?? undefined} onSelect={onPhase} large />
        {id && <PhaseView key={id} analysis={analysis} phase={analysis.phases.find((p) => p.id === id)!} />}
      </Modal>
    </>
  );
}

/** Opens a case's page of the algorithms, over the analysis. */
const openCase = (id: string) => void s.action("caseDialog:" + id);

/** A case of the catalogue, large, which opens its page. */
function CaseButton({ id, name, size }: { id: string; name: string; size: number }) {
  const known = catalog.cases.find((c: any) => c.id === id);
  return (
    <button type="button" onClick={() => openCase(id)} className={cn(ROW, "group flex items-center gap-4 p-2")}>
      {known && <Diagram c={known} size={size} />}
      <span className="flex flex-col gap-1">
        <span className="text-xl font-bold tracking-[-0.02em]">{name}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
          {tr("Open the algorithms")}{" "}<ChevronRight className="size-4" />
        </span>
      </span>
    </button>
  );
}

/** One look of a step done in two: its case, its times, its turns and the catalogue's algorithm. */
function Look({ look }: { look: Segment }) {
  const best = look.suggestions[0];
  return (
    <Strip className="flex items-start gap-4 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">{said(look.label)}</span>
          <span className={cn(NUMERIC, "ml-auto text-lg font-semibold")}>{seconds(look.end - look.start)} s</span>
        </div>
        <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>
          {tr("Recognition")}{" "}{seconds(look.recognition)} {" "}{tr("s · Execution")}{" "}{seconds(look.execution)} s · {look.turns.length} {" "}{tr("turns")}</span>
        <Alg text={look.turns.join(" ")} size={20} />
        {best && (
          <button type="button" onClick={() => openCase(look.case!.id)} className={cn("flex items-baseline gap-3 rounded-md text-left text-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS)}>
            {tr("Catalogue")}{" "}<Alg text={best.alg} size={18} className="text-foreground" />
          </button>
        )}
      </div>
      {look.case ? <CaseButton id={look.case.id} name={look.case.name} size={84} /> : <span className="text-sm text-muted-foreground">{tr("Not in the catalogue")}</span>}
    </Strip>
  );
}

function PhaseView({ analysis, phase }: { analysis: SolveAnalysis; phase: Phase }) {
  const replay = useReplay(analysis, phase),
    { w, h } = useViewport(),
    side = Math.round(Math.max(220, Math.min(h * 0.5, w * 0.3, 520))),
    done = replay.index - phase.from,
    total = phase.to - phase.from;
  return (
    <div className="flex min-h-0 flex-1 gap-12">
      <section className="flex shrink-0 flex-col items-center justify-center gap-4">
        <LiveCube cube={replay.cube} size={side} />
        {/* The transport, as the algorithm player's (AlgPlayer.tsx PlayerControls): replay, play or pause, the speed;
            the scrubber with the turn count under it. */}
        <div className="flex w-full max-w-sm flex-col gap-2">
          <div className="flex items-center gap-1">
            <Tip content={tr("Replay the step")}>
              <Button variant="ghost" size="icon" aria-label={tr("Replay the step")} onClick={() => replay.seek(phase.from)} className="text-muted-foreground hover:text-foreground">
                <RotateCcw />
              </Button>
            </Tip>
            <Tip content={replay.playing ? tr("Pause") : tr("Play")}>
              <Button size="icon" aria-label={replay.playing ? tr("Pause") : tr("Play")} onClick={replay.toggle} disabled={phase.skip}>
                {replay.playing ? <Pause /> : <Play />}
              </Button>
            </Tip>
            <ToggleGroup aria-label={tr("Speed")} spacing={1} value={[String(replay.speed)]} onValueChange={(next: string[]) => next[0] && replay.setSpeed(Number(next[0]))} className="ml-auto">
              {PLAYER_SPEEDS.map((speed) => (
                <ToggleGroupItem key={speed} value={String(speed)} className={cn(NUMERIC, "text-muted-foreground aria-pressed:text-foreground")}>
                  {speedLabel(speed)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              aria-label={tr("Turn")}
              min={phase.from}
              max={phase.to}
              value={[replay.index]}
              disabled={phase.skip}
              onValueChange={(value: number | readonly number[]) => replay.seek(Array.isArray(value) ? value[0]! : (value as number))}
              className="flex-1"
            />
            <span className={cn(NUMERIC, "w-14 shrink-0 text-right text-xs text-muted-foreground")}>{phase.skip ? "–" : `${done} / ${total}`}</span>
          </div>
        </div>
      </section>
      <section className="flex min-w-0 flex-1 flex-col gap-7 overflow-x-hidden overflow-y-auto pr-2">
        <div className="flex items-baseline gap-4">
          <span className="size-4 shrink-0 self-center rounded-full" style={{ background: stepColour(phase.id) }} />
          <h3 className="text-3xl font-extrabold tracking-[-0.03em]">
            {said(phase.label)}
            {phase.pair && <span className="ml-3 text-lg font-normal text-muted-foreground">{capitalised(tr("{0}–{1} pair", { 0: colourLabel(COLOUR_NAMES[phase.pair[0]]), 1: colourLabel(COLOUR_NAMES[phase.pair[1]]) }))}</span>}
          </h3>
          <span className={cn(NUMERIC, "ml-auto text-5xl font-extrabold tracking-[-0.04em]")}>{phase.skip ? tr("Skip") : `${seconds(phase.end - phase.start)} s`}</span>
        </div>
        {phase.skip ? (
          <p className="text-lg text-muted-foreground">{tr("Already solved by the step before: nothing to do.")}</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              {[
                ["Recognition", `${seconds(phase.recognition)} s`, DOT.warning],
                ["Execution", `${seconds(phase.execution)} s`, DOT.accent],
                ["Turns", String(phase.turns.length), "bg-faint"],
                ["TPS", tps(phase), DOT.lilac],
              ].map(([label, value, dot]) => (
                <StatCard key={label} label={said(label)} value={value} dot={dot} size="sm" className="bg-muted" />
              ))}
            </div>
            {/^(f2l|oll|pll)/.test(phase.id) && (
              <div className="flex flex-col gap-2">
                <span className={LABEL}>{phase.looks ? tr("Case in one look") : tr("Case")}</span>
                {phase.case ? <CaseButton id={phase.case.id} name={phase.case.name} size={120} /> : <span className="text-lg">{tr("Not in the catalogue")}</span>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <span className={LABEL}>{tr("Your turns")}</span>
              <Alg text={phase.turns.join(" ")} size={24} />
            </div>
            {phase.looks && (
              <div className="flex flex-col gap-3">
                <span className={LABEL}>{phase.looks.length === 2 ? tr("Two looks") : tr("In {0} parts", { 0: phase.looks.length })}</span>
                {phase.looks.map((look) => (
                  <Look key={look.label} look={look} />
                ))}
              </div>
            )}
            {phase.suggestions.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className={LABEL}>
                  {phase.id === "cross" ? tr("Optimal cross") : phase.looks ? tr("In one look · {0}", { 0: phase.case?.name }) : tr("Algorithms for this case")}
                </span>
                {phase.suggestions.map((suggestion) => {
                  const saved = phase.turns.length - suggestion.turns,
                    row = (
                      <>
                        <Alg text={suggestion.alg} size={22} className="min-w-0 flex-1" />
                        <span className={cn(NUMERIC, "shrink-0 text-sm", saved > 0 ? "text-success" : "text-muted-foreground")}>
                          {suggestion.turns} {" "}{tr("turns")}{saved > 0 ? tr(" · {0} fewer", { 0: saved }) : ""}
                        </span>
                      </>
                    );
                  return phase.case ? (
                    <button
                      key={suggestion.alg}
                      type="button"
                      onClick={() => openCase(phase.case!.id)}
                      className={cn("flex min-w-0 items-baseline gap-4 rounded-md py-2 text-left transition-colors hover:[&_.alg]:text-primary", FOCUS)}
                    >
                      {row}
                    </button>
                  ) : (
                    <div key={suggestion.alg} className="flex min-w-0 items-baseline gap-4 py-2">
                      {row}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
