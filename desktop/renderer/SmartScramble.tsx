/** The timer's scramble while a smart cube is connected: each turn coloured as the cube goes through it. */
import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NUMERIC } from "./ui";
import { smartCube } from "../../src/client/lib/smartCube";
import { ScrambleTracker, trackable, type ScrambleProgress, type TurnProgress } from "../../src/client/lib/scrambleTracker";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** Where the connected cube stands in `scramble`, turn by turn; null when it cannot be followed. */
export function useScrambleProgress(scramble: string, active: boolean): ScrambleProgress | null {
  const [progress, setProgress] = useState<ScrambleProgress | null>(null);
  useEffect(() => {
    if (!active || !trackable(scramble)) return void setProgress(null);
    const tracker = new ScrambleTracker(scramble, smartCube.snapshot.state);
    let count = smartCube.snapshot.count;
    setProgress(tracker.progress);
    return smartCube.subscribe(() => {
      const { turn, state, count: now } = smartCube.snapshot;
      if (now === count) return;
      count = now;
      const reported = smartCube.moves.at(-1);
      if (turn && reported) tracker.turn(reported.move, state);
      else tracker.sync(state);
      setProgress(tracker.progress);
    });
  }, [scramble, active]);
  return progress;
}

const TONE: Record<TurnProgress, string> = {
  done: "text-success/70",
  partial: "text-warning",
  next: "text-primary underline decoration-2 underline-offset-[0.25em]",
  todo: "",
};

export function SmartScramble({ text, progress, size }: { text: string; progress: ScrambleProgress; size: number }) {
  const turns = text.trim().split(/\s+/);
  return (
    <div className="alg flex min-w-0 flex-wrap gap-x-[0.5em] gap-y-[0.3em] font-sans leading-snug font-medium tracking-tight" style={{ fontSize: size }}>
      {turns.map((turn, i) => (
        <span key={i} className={cn("transition-colors duration-150", progress.lost ? "text-muted-foreground" : TONE[progress.turns[i] ?? "todo"])}>
          {said(turn)}
        </span>
      ))}
    </div>
  );
}

/** Where the cube stands before a solve, under the timer: to solve first, scrambling, a turn to undo, or ready. */
export function ScrambleStatus({ progress }: { progress: ScrambleProgress }) {
  const done = progress.turns.filter((turn) => turn === "done").length;
  if (progress.lost)
    return (
      <>
        <Badge variant="outline">{tr("Not solved")}</Badge>
        {tr("Solve the cube to start the scramble")}</>
    );
  if (progress.undo.length)
    return (
      <Badge variant="destructive" className="h-6 px-2.5 text-sm">
        <Undo2 data-icon="inline-start" />
        {tr("Undo")}{" "}{progress.undo.join(" ")}
      </Badge>
    );
  if (progress.scrambled)
    return (
      <>
        <Badge className="bg-success/15 text-success">
          <span className="size-1.5 rounded-full bg-success" />
          {tr("Ready")}</Badge>
        {tr("Your first turn starts the timer")}</>
    );
  return (
    <>
      <Badge variant="secondary" className={NUMERIC}>
        {tr("Scrambling")}{" "}{done}/{progress.turns.length}
      </Badge>
      {tr("The timer starts once the cube is scrambled")}</>
  );
}

/**
 * Where the cube stands before a case of a training: set up and ready, on its way through the setup (`progress`,
 * from a solved cube), a turn to undo, or not set up yet.
 */
export function CaseStatus({ set, progress }: { set: boolean; progress: ScrambleProgress | null }) {
  if (set)
    return (
      <>
        <Badge className="bg-success/15 text-success">
          <span className="size-1.5 rounded-full bg-success" />
          {tr("Ready")}</Badge>
        {tr("Your first turn starts the timer")}</>
    );
  if (progress && !progress.lost && progress.undo.length)
    return (
      <Badge variant="destructive" className="h-6 px-2.5 text-sm">
        <Undo2 data-icon="inline-start" />
        {tr("Undo")}{" "}{progress.undo.join(" ")}
      </Badge>
    );
  if (progress && !progress.lost)
    return (
      <>
        <Badge variant="secondary" className={NUMERIC}>
          {tr("Setting up")}{" "}{progress.turns.filter((turn) => turn === "done").length}/{progress.turns.length}
        </Badge>
        {tr("The timer starts once the case is set up")}</>
    );
  return (
    <>
      <Badge variant="outline">{tr("Not set up")}</Badge>
      {tr("Turn the setup on the cube")}</>
  );
}
