/**
 * A smart cube solve, step by step: a bar under the timer with a colour per step, as long as the step took; a click
 * on a step opens the analysis on it, with the step replayed as it was turned (and held, with a gyroscope).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { SmartCube, stateToFacelets } from "../../src/client/lib/smartCube";
import { COLOUR_NAMES, type Phase, type PhaseId, type Segment, type SolveAnalysis } from "../../src/client/lib/solveAnalysis";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LiveCube } from "./LiveCube";
import { Alg, Diagram, NUMERIC, useViewport } from "./ui";
import { catalog, store as s } from "./store";
import { CaseDialog } from "./learn";

/**
 * The steps' colours: from the theme's neutral grey for the cross toward its primary colour, whole for the PLL, so the
 * bar fills toward the solved cube in the accent the player chose, in the light theme as in the dark one.
 */
const STEPS: PhaseId[] = ["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"];
const RAMP = [12, 28, 42, 56, 70, 85, 100];
export const stepColour = (id: PhaseId) => `color-mix(in oklch, var(--primary) ${RAMP[STEPS.indexOf(id)]}%, var(--muted-foreground))`;
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const tps = (phase: Phase) => (phase.execution > 0 ? (phase.turns.length / (phase.execution / 1000)).toFixed(1) : "–");
const capitalised = (text: string) => text[0]!.toUpperCase() + text.slice(1);

/**
 * The steps side by side, each as wide as it took, in colours only; skipped steps take no room. The selected step
 * stands out and shows its time; the others give theirs on hover.
 */
export function SolveBar({ analysis, selected, onSelect, large = false, className }: { analysis: SolveAnalysis; selected?: PhaseId; onSelect: (id: PhaseId) => void; large?: boolean; className?: string }) {
  const shown = analysis.phases.filter((phase) => !phase.skip),
    chosen = shown.find((phase) => phase.id === selected);
  return (
    <div className={cn("flex w-full flex-col", large ? "gap-2" : "gap-1.5", className)}>
      {/* As tall as a selected step, so growing moves nothing around it. */}
      <div className={cn("flex w-full items-center gap-1", large ? "h-6" : "h-5")} role="group" aria-label="Solve steps">
        {shown.map((phase) => (
          <button
            key={phase.id}
            type="button"
            data-step={phase.id}
            aria-label={`${phase.label}, ${seconds(phase.end - phase.start)} s`}
            aria-pressed={selected === phase.id}
            title={`${phase.label} · ${seconds(phase.end - phase.start)} s`}
            onClick={() => onSelect(phase.id)}
            style={{ flexGrow: Math.max(phase.end - phase.start, 1), flexBasis: 0, background: stepColour(phase.id) }}
            className={cn(
              "relative min-w-2 rounded-full outline-none transition-[height] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
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
        ))}
      </div>
      {/* The legend: each step's colour and name; the selected one with its time. */}
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground", large ? "text-sm" : "text-xs")}>
        {shown.map((phase) => (
          <button
            key={phase.id}
            type="button"
            onClick={() => onSelect(phase.id)}
            className={cn("flex items-center gap-1.5 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", chosen === phase && "font-medium text-foreground")}
          >
            <span className="size-2 rounded-full" style={{ background: stepColour(phase.id) }} />
            {phase.label}
            {chosen === phase && <span className={NUMERIC}>{seconds(phase.end - phase.start)} s</span>}
          </button>
        ))}
      </div>
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
    <div className="flex shrink-0 items-start gap-4" data-no-timer aria-label="Last solve steps">
      <SolveBar analysis={analysis} onSelect={setOpen} className="min-w-0 flex-1 pt-1.5" />
      <span className={cn(NUMERIC, "shrink-0 text-sm text-muted-foreground")}>
        {analysis.turns} turns · {analysis.tps.toFixed(2)} TPS{skips.length ? ` · ${skips.join(", ")} skip` : ""}
      </span>
      <Button variant="outline" size="sm" onClick={() => setOpen("cross")}>
        Analysis
      </Button>
      <SolveDialog analysis={analysis} phase={open} onPhase={setOpen} />
      {/* A case of the analysis opened as on Learn: the algorithms page's detail, over the analysis. */}
      <CaseDialog />
    </div>
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
    <Dialog open={!!id} onOpenChange={(open) => !open && onPhase(null)}>
      <DialogContent className="flex h-[calc(100svh-3rem)] w-[calc(100vw-3rem)] max-w-[1400px] flex-col gap-6 p-8 sm:max-w-[1400px]">
        <DialogHeader className="flex-row items-baseline gap-6">
          <DialogTitle className="text-2xl font-semibold tracking-tight">Solve analysis</DialogTitle>
          <DialogDescription className={cn(NUMERIC, "flex items-baseline gap-6 text-base")}>
            <span className="text-3xl font-semibold text-foreground">{seconds(analysis.time)} s</span>
            <span>{analysis.turns} turns</span>
            <span>{analysis.tps.toFixed(2)} TPS</span>
            <span>{capitalised(COLOUR_NAMES[analysis.cross])} cross</span>
          </DialogDescription>
        </DialogHeader>
        <SolveBar analysis={analysis} selected={id ?? undefined} onSelect={onPhase} large />
        {id && <PhaseView key={id} analysis={analysis} phase={analysis.phases.find((p) => p.id === id)!} />}
      </DialogContent>
    </Dialog>
  );
}

/** Opens a case's page of the algorithms, over the analysis. */
const openCase = (id: string) => void s.action("caseDialog:" + id);

/** A case of the catalogue, large, which opens its page. */
function CaseButton({ id, name, size }: { id: string; name: string; size: number }) {
  const known = catalog.cases.find((c: any) => c.id === id);
  return (
    <button type="button" onClick={() => openCase(id)} className="group flex items-center gap-4 rounded-xl p-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
      {known && <Diagram c={known} size={size} />}
      <span className="flex flex-col gap-1">
        <span className="text-xl font-semibold tracking-tight">{name}</span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
          Open the algorithms <ChevronRight className="size-4" />
        </span>
      </span>
    </button>
  );
}

/** One look of a step done in two: its case, its times, its turns and the catalogue's algorithm. */
function Look({ look }: { look: Segment }) {
  const best = look.suggestions[0];
  return (
    <div className="flex items-start gap-4 rounded-xl bg-muted/40 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">{look.label}</span>
          <span className={cn(NUMERIC, "ml-auto text-lg font-semibold")}>{seconds(look.end - look.start)} s</span>
        </div>
        <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>
          Recognition {seconds(look.recognition)} s · Execution {seconds(look.execution)} s · {look.turns.length} turns
        </span>
        <Alg text={look.turns.join(" ")} size={20} />
        {best && (
          <button type="button" onClick={() => openCase(look.case!.id)} className="flex items-baseline gap-3 rounded-md text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            Catalogue <Alg text={best.alg} size={18} className="text-foreground" />
          </button>
        )}
      </div>
      {look.case ? <CaseButton id={look.case.id} name={look.case.name} size={84} /> : <span className="text-sm text-muted-foreground">Not in the catalogue</span>}
    </div>
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-lg" aria-label={replay.playing ? "Pause" : "Play"} onClick={replay.toggle} disabled={phase.skip}>
            {replay.playing ? <Pause /> : <Play />}
          </Button>
          <Button variant="outline" size="icon-lg" aria-label="Replay the step" onClick={() => replay.seek(phase.from)}>
            <RotateCcw />
          </Button>
          <input
            type="range"
            aria-label="Turn"
            className="w-56"
            min={phase.from}
            max={phase.to}
            value={replay.index}
            disabled={phase.skip}
            onChange={(e) => replay.seek(Number(e.target.value))}
          />
          <Button variant="ghost" size="lg" className={NUMERIC} onClick={() => replay.setSpeed(replay.speed === 1 ? 0.5 : replay.speed === 0.5 ? 0.25 : 1)}>
            {replay.speed}×
          </Button>
        </div>
        <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{phase.skip ? "Nothing to turn" : `Turn ${done} of ${total}`}</span>
      </section>
      <section className="flex min-w-0 flex-1 flex-col gap-7 overflow-y-auto pr-2">
        <div className="flex items-baseline gap-4">
          <span className="size-4 shrink-0 self-center rounded-full" style={{ background: stepColour(phase.id) }} />
          <h3 className="text-3xl font-semibold tracking-tight">
            {phase.label}
            {phase.pair && <span className="ml-3 text-lg font-normal text-muted-foreground">{capitalised(COLOUR_NAMES[phase.pair[0]])}–{COLOUR_NAMES[phase.pair[1]]} pair</span>}
          </h3>
          <span className={cn(NUMERIC, "ml-auto text-5xl font-semibold tracking-tight")}>{phase.skip ? "Skip" : `${seconds(phase.end - phase.start)} s`}</span>
        </div>
        {phase.skip ? (
          <p className="text-lg text-muted-foreground">Already solved by the step before: nothing to do.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-6">
              {[
                ["Recognition", `${seconds(phase.recognition)} s`],
                ["Execution", `${seconds(phase.execution)} s`],
                ["Turns", String(phase.turns.length)],
                ["TPS", tps(phase)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  <span className={cn(NUMERIC, "text-2xl font-semibold")}>{value}</span>
                </div>
              ))}
            </div>
            {phase.id !== "cross" && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">{phase.looks ? "Case in one look" : "Case"}</span>
                {phase.case ? <CaseButton id={phase.case.id} name={phase.case.name} size={120} /> : <span className="text-lg">Not in the catalogue</span>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">Your turns</span>
              <Alg text={phase.turns.join(" ")} size={24} />
            </div>
            {phase.looks && (
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-muted-foreground">Two looks</span>
                {phase.looks.map((look) => (
                  <Look key={look.label} look={look} />
                ))}
              </div>
            )}
            {phase.suggestions.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">
                  {phase.id === "cross" ? "Optimal cross" : phase.looks ? `In one look · ${phase.case?.name}` : "Algorithms for this case"}
                </span>
                {phase.suggestions.map((suggestion) => {
                  const saved = phase.turns.length - suggestion.turns,
                    row = (
                      <>
                        <Alg text={suggestion.alg} size={22} className="min-w-0 flex-1" />
                        <span className={cn(NUMERIC, "shrink-0 text-sm", saved > 0 ? "text-success" : "text-muted-foreground")}>
                          {suggestion.turns} turns{saved > 0 ? ` · ${saved} fewer` : ""}
                        </span>
                      </>
                    );
                  return phase.case ? (
                    <button
                      key={suggestion.alg}
                      type="button"
                      onClick={() => openCase(phase.case!.id)}
                      className="-mx-3 flex items-baseline gap-4 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row}
                    </button>
                  ) : (
                    <div key={suggestion.alg} className="flex items-baseline gap-4 py-2">
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
