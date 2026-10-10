/**
 * What the app does, shown rather than told: small live copies of its screens, each built from the app's own parts
 * (the timer's digits, the 3D algorithm player, the avatars). They play by themselves while in sight, stop when the
 * reader takes over, and wait for a click when the reader asked for less motion.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Eye, Pause, Play, SkipForward } from "lucide-react";
import { fmtTime } from "../../../src/client/lib/format";
import type { CubeMask } from "../../../src/shared/cubeAppearance";
import { cubeOrientation } from "../../../src/shared/cubeScene";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { PlayerAlg, PlayerControls, PlayerCube, useAlgPlayer, usePlayback } from "../AlgPlayer";
import { Avatar, Digits, keyed, said } from "../base";
import { SCENE, paintScene, reduced, useCalm, useInView } from "./HeroCube";
import { SCRAMBLE } from "./solve";
import { tr } from "../../../src/client/i18n";

/**
 * The player's controls, once the page runs: their scrubber writes an inline script into the page's HTML, which the
 * site's content policy refuses, and they do nothing before the page runs anyway.
 */
function Controls({ player }: { player: Parameters<typeof PlayerControls>[0]["player"] }) {
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  return live ? <PlayerControls player={player} compact className="w-full max-w-72" /> : <div className="h-[4.5rem]" />;
}

/** The frame of a demo: one calm card, as the app's panels. */
const CARD = "flex flex-col rounded-3xl bg-card p-5 md:p-7";

// ---------------------------------------------------------------------------
// The timer: hold, release, solve, stop, as the app's own; the reader can take it over.
// ---------------------------------------------------------------------------
const SCRAMBLES = [SCRAMBLE, "F2 D' L2 U' B2 R2 D F2 U2 R' B' U' F' L D2 R U' B D' L'", "U2 L' B2 D2 R2 F2 U' F2 L2 D' R B' L' D R' F' U L2 F U2"];
const RUNS = [9840, 11270, 8930];
type TimerPhase = "idle" | "holding" | "ready" | "running" | "stopped";
/** Where the timer goes by itself from each phase, and after how long. */
const NEXT: Record<TimerPhase, TimerPhase> = { idle: "holding", holding: "ready", ready: "running", running: "stopped", stopped: "idle" };

export function TimerDemo() {
  const box = useRef<HTMLDivElement>(null),
    seen = useInView(box),
    calm = useCalm(),
    [phase, setPhase] = useState<TimerPhase>("idle"),
    [round, setRound] = useState(0),
    [ms, setMs] = useState(0),
    started = useRef(0),
    hold = useRef<ReturnType<typeof setTimeout>>(undefined),
    // The reader took it over: it no longer plays by itself until it leaves the window.
    [taken, take] = useState(false);
  useEffect(() => {
    if (!seen) take(false);
  }, [seen]);
  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0;
    const tick = () => {
      setMs(performance.now() - started.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);
  const go = (to: TimerPhase, at = 0) => {
    if (to === "running") started.current = performance.now();
    if (to === "stopped") setMs(at || performance.now() - started.current);
    if (to === "holding") setMs(0);
    setPhase(to);
  };
  useEffect(() => {
    if (!seen || calm || taken || reduced()) return;
    const run = RUNS[round % RUNS.length]!,
      wait = { idle: 1500, holding: 450, ready: 450, running: run, stopped: 2600 }[phase],
      timer = setTimeout(() => {
        if (phase === "stopped") setRound((r) => r + 1);
        go(NEXT[phase], run);
      }, wait);
    return () => clearTimeout(timer);
  }, [phase, seen, calm, taken, round]);

  const press = () => {
    take(true);
    if (phase === "running") return go("stopped");
    if (phase === "stopped") setRound((r) => r + 1);
    go("holding");
    clearTimeout(hold.current);
    hold.current = setTimeout(() => setPhase("ready"), 300);
  };
  const release = () => {
    clearTimeout(hold.current);
    if (phase === "ready") go("running");
    else if (phase === "holding") setPhase("idle");
  };
  // A finger on a phone, the space bar elsewhere, as the app says it.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(matchMedia("(pointer: coarse)").matches), []);
  const hint = phase === "running" ? tr("Tap to stop") : phase === "stopped" ? tr("Solved") : touch ? tr("Hold, then release to start") : tr("Hold Space, release to start");
  return (
    <div
      ref={box}
      role="button"
      tabIndex={0}
      aria-label={tr("Try the timer")}
      data-demo="timer"
      className={cn(CARD, "cursor-pointer touch-manipulation gap-6 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50")}
      onPointerDown={(e) => {
        if (e.button === 0) press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(e) => {
        if (e.key !== " " || e.repeat) return;
        e.preventDefault();
        press();
      }}
      onKeyUp={(e) => {
        if (e.key !== " ") return;
        e.preventDefault();
        release();
      }}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-[10px] bg-muted px-2.5 py-1 text-[0.8125rem] font-semibold">3×3</span>
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-lg leading-snug font-bold tracking-tight md:text-xl">
          {SCRAMBLES[round % SCRAMBLES.length]!.split(" ").map((turn, i) => (
            <span key={i}>{turn}</span>
          ))}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 py-4 md:py-10">
        <Digits text={fmtTime(ms)} phase={phase} className="text-[clamp(4rem,16vw,7.5rem)]" />
        <p className="flex min-h-6 items-center text-sm text-muted-foreground">{keyed(hint)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The first solve: the beginner course's steps, each shown on the 3D player.
// ---------------------------------------------------------------------------
/** The 3×3 beginner method's steps (src/shared/methods.ts), each with a move or an algorithm it teaches. */
const LESSON: { title: string; alg: string; mask: CubeMask }[] = [
  { title: "White cross", alg: "U' F2", mask: "full" },
  { title: "First-layer corners", alg: "U R U' R'", mask: "F1L" },
  { title: "Second-layer edges", alg: "U R U' R' U' F' U F", mask: "F2L" },
  { title: "Yellow cross", alg: "F R U R' U' F'", mask: "EO" },
  { title: "Yellow face", alg: "R U R' U R U2 R'", mask: "OLL" },
  { title: "Last layer permutation", alg: "R U' R U R U R U' R' U' R2", mask: "PLL" },
];

/** A player that plays while it is in sight (unless asked for less motion), and calls `ended` once it has played. */
function usePlaying(alg: string, mask: CubeMask, seen: boolean, auto: boolean, ended?: () => void) {
  const player = useAlgPlayer(alg, 3, mask)!,
    { position, playing } = usePlayback(player);
  useEffect(() => {
    if (!seen || !auto || reduced()) return void player.pause();
    const timer = setTimeout(player.play, 500);
    return () => clearTimeout(timer);
  }, [player, seen, auto]);
  const done = position >= player.total && !playing;
  useEffect(() => {
    if (!done || !seen || !auto || !ended) return;
    const timer = setTimeout(ended, 1400);
    return () => clearTimeout(timer);
  }, [done, seen, auto]);
  return player;
}

export function LessonDemo() {
  const box = useRef<HTMLDivElement>(null),
    seen = useInView(box),
    calm = useCalm(),
    [at, setAt] = useState(0),
    [taken, take] = useState(false),
    step = LESSON[at]!,
    player = usePlaying(step.alg, step.mask, seen, !calm && !taken, () => setAt((at + 1) % LESSON.length));
  return (
    <div ref={box} data-demo="learn" className={cn(CARD, "gap-5 md:flex-row md:gap-7")} onPointerDown={() => take(true)}>
      <div className="flex flex-col gap-1 md:w-60 md:shrink-0">
        <span className="px-3 pb-2 text-sm font-semibold text-muted-foreground">
          {tr("3×3")} · {tr("Beginner")}
        </span>
        <ol className="flex flex-col gap-0.5">
          {LESSON.map((s, i) => (
            <li key={s.title}>
              <Button variant={i === at ? "secondary" : "ghost"} className={cn("w-full justify-start", i !== at && "text-muted-foreground")} aria-current={i === at ? "step" : undefined} onClick={() => setAt(i)}>
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold", i < at ? "bg-success text-background" : i === at ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {i < at ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="truncate">{said(s.title)}</span>
              </Button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-4">
        <PlayerCube player={player} size={220} />
        <PlayerAlg player={player} text={step.alg} size={20} className="justify-center" />
        <Controls player={player} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The algorithms: cases of the catalogue on the 3D player, one after the other.
// ---------------------------------------------------------------------------
const CASES: { name: string; set: string; alg: string; mask: CubeMask }[] = [
  { name: "T Perm", set: "PLL", alg: "R U R' U' R' F R2 U' R' U' R U R' F'", mask: "PLL" },
  { name: "Sune", set: "OLL", alg: "R U R' U R U2 R'", mask: "OLL" },
  { name: "Y Perm", set: "PLL", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'", mask: "PLL" },
  { name: "Ua Perm", set: "PLL", alg: "R U' R U R U R U' R' U' R2", mask: "PLL" },
];

export function AlgDemo() {
  const box = useRef<HTMLDivElement>(null),
    seen = useInView(box),
    calm = useCalm(),
    [at, setAt] = useState(0),
    [taken, take] = useState(false),
    c = CASES[at]!,
    player = usePlaying(c.alg, c.mask, seen, !calm && !taken, () => setAt((at + 1) % CASES.length));
  return (
    <div ref={box} data-demo="algorithms" className={cn(CARD, "items-center gap-5")} onPointerDown={() => take(true)}>
      <ToggleGroup aria-label={tr("Cases")} spacing={1} value={[String(at)]} onValueChange={(next: string[]) => next[0] && setAt(Number(next[0]))} className="flex-wrap justify-center">
        {CASES.map((k, i) => (
          <ToggleGroupItem key={k.name} value={String(i)} className="text-muted-foreground">
            {said(k.name)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <PlayerCube player={player} size={240} />
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs font-semibold text-muted-foreground">
          {c.set} · {said(c.name)}
        </span>
        <PlayerAlg player={player} text={c.alg} size={20} className="justify-center" />
      </div>
      <Controls player={player} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The training: a learned case, timed, then how it went against the usual and its solution played.
// ---------------------------------------------------------------------------
const DRILL = [
  { ...CASES[0]!, ms: 1840, faster: true },
  { ...CASES[1]!, ms: 2630, faster: false },
  { ...CASES[3]!, ms: 2110, faster: true },
];

export function TrainDemo() {
  const box = useRef<HTMLDivElement>(null),
    seen = useInView(box),
    calm = useCalm(),
    [at, setAt] = useState(0),
    [taken, take] = useState(false),
    // Timing the case, then its result and its solution.
    [shown, show] = useState(false),
    [ms, setMs] = useState(0),
    c = DRILL[at]!,
    auto = !calm && !taken,
    player = usePlaying(c.alg, c.mask, seen && shown, auto, () => next());
  const next = () => {
    setAt((at + 1) % DRILL.length);
    show(false);
    setMs(0);
  };
  // The attempt, timed as the app's training does, then shown.
  useEffect(() => {
    if (shown || !seen || !auto || reduced()) return;
    let frame = 0;
    const start = performance.now() + 700,
      tick = (now: number) => {
        const t = Math.max(0, now - start);
        setMs(Math.min(t, c.ms));
        if (t >= c.ms) show(true);
        else frame = requestAnimationFrame(tick);
      };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [at, shown, seen, auto]);
  const running = !shown && ms > 0;
  return (
    <div ref={box} data-demo="training" className={cn(CARD, "gap-5")} onPointerDown={() => take(true)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground">{tr("Your learned cases, slowest first")}</span>
        <span className="flex gap-1" aria-hidden="true">
          {DRILL.map((_, i) => (
            <span key={i} className={cn("h-1.5 w-5 rounded-full", i === at ? "bg-primary" : "bg-muted")} />
          ))}
        </span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
        <PlayerCube player={player} size={200} />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3 sm:items-start">
          <span className="text-xl font-bold tracking-tight">
            {c.set} · {said(c.name)}
          </span>
          <Digits text={fmtTime(ms)} phase={running ? "running" : "idle"} className="text-6xl" />
          <div className="flex min-h-14 flex-col items-center gap-2 sm:items-start">
            {shown ? (
              <>
                <span className={cn("text-sm font-semibold", c.faster ? "text-success" : "text-warning")}>{c.faster ? tr("Faster than usual") : tr("Slower than usual: it comes back sooner")}</span>
                <PlayerAlg player={player} text={c.alg} size={17} className="justify-center sm:justify-start" />
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{tr("Solve it, then stop the timer")}</span>
            )}
          </div>
          <div className="flex gap-2">
            {!shown && (
              <Button variant="secondary" onClick={() => show(true)}>
                <Eye data-icon="inline-start" />
                {tr("Show solution")}
              </Button>
            )}
            <Button variant="ghost" onClick={next}>
              {tr("Next case")}
              <SkipForward data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The duel: two cubers on the same scramble, live, round after round.
// ---------------------------------------------------------------------------
const PLAYERS = ["You", "alex_cubes"] as const;
/** Each round's two times; the first to three rounds wins. */
const ROUNDS = [
  [9840, 10610],
  [11020, 10350],
  [9310, 9980],
  [10120, 11480],
];
type DuelPhase = "ready" | "racing" | "result";

/** A player's side: who, their cube solving as their time runs, and how their round went. */
function Lane({ name, ms, total, won, phase, canvas }: { name: string; ms: number; total: number; won: number; phase: DuelPhase; canvas: React.Ref<HTMLCanvasElement> }) {
  const done = ms >= total;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 rounded-2xl bg-muted/50 p-3 sm:p-4">
      <div className="flex w-full min-w-0 items-center gap-2">
        <Avatar name={name === "You" ? tr("You") : name} size={26} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{said(name)}</span>
      </div>
      <canvas ref={canvas} aria-hidden="true" className="aspect-square w-full max-w-40" />
      <Digits text={fmtTime(Math.min(ms, total))} phase={phase === "ready" ? "ready" : done ? "idle" : "running"} className="text-[clamp(1.75rem,8vw,2.25rem)]" />
      <div className="flex w-full items-center justify-between gap-2">
        <span className={cn("text-xs font-semibold", done && phase !== "ready" ? "text-success" : "text-muted-foreground")}>{phase === "ready" ? tr("Ready") : done ? tr("Solved") : tr("Solving")}</span>
        <span className="flex gap-1" role="img" aria-label={tr("Rounds won: {0}", { 0: won })}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("size-2 rounded-full", i < won ? "bg-primary" : "bg-muted")} />
          ))}
        </span>
      </div>
    </div>
  );
}

export function DuelDemo() {
  const box = useRef<HTMLDivElement>(null),
    seen = useInView(box),
    calm = useCalm(),
    [chosen, choose] = useState<boolean>(),
    playing = (chosen ?? !calm) && seen,
    [round, setRound] = useState(0),
    [phase, setPhase] = useState<DuelPhase>("ready"),
    [ms, setMs] = useState(0),
    canvases = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)],
    times = ROUNDS[round]!,
    wins = [0, 1].map((p) => ROUNDS.slice(0, phase === "result" ? round + 1 : round).filter((r) => r[p]! < r[1 - p]!).length),
    winner = times[0]! < times[1]! ? 0 : 1;
  // Each cube where its player's time has it in the solve.
  useEffect(() => {
    canvases.forEach((canvas, p) => canvas.current && paintScene(canvas.current, SCENE, phase === "ready" ? 0 : Math.min(1, ms / times[p]!) * SCENE.moves.length, cubeOrientation()));
  });
  useEffect(() => {
    if (!playing || reduced() && chosen === undefined) return;
    if (phase === "racing") {
      let frame = 0;
      const start = performance.now() - ms,
        tick = (now: number) => {
          const t = now - start;
          setMs(t);
          if (t >= Math.max(...times)) setPhase("result");
          else frame = requestAnimationFrame(tick);
        };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    const over = phase === "result" && Math.max(...wins) >= 3;
    const timer = setTimeout(
      () => {
        if (phase === "ready") return setPhase("racing");
        setRound(over ? 0 : round + 1);
        setMs(0);
        setPhase("ready");
      },
      phase === "ready" ? 1300 : over ? 4200 : 2400,
    );
    return () => clearTimeout(timer);
  }, [playing, phase, round]);
  const over = phase === "result" && Math.max(...wins) >= 3;
  return (
    <div ref={box} data-demo="duel" className={cn(CARD, "gap-4")}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">{tr("Round {0}", { 0: round + 1 })}</span>
        <span className="text-sm text-muted-foreground">{tr("First to 3")}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" aria-label={playing ? tr("Pause the race") : tr("Play the race")} onClick={() => choose(!playing)} className="text-muted-foreground">
          {playing ? <Pause /> : <Play />}
        </Button>
      </div>
      <div className="flex gap-3">
        {PLAYERS.map((name, p) => (
          <Lane key={name} name={name} ms={phase === "ready" ? 0 : ms} total={times[p]!} won={wins[p]!} phase={phase} canvas={canvases[p]!} />
        ))}
      </div>
      <p aria-live="polite" className={cn("h-5 text-center text-sm font-semibold transition-opacity", phase === "result" ? "opacity-100" : "opacity-0")}>
        {over ? (winner === 0 || wins[0]! >= 3 ? tr("You win the match") : tr("{0} wins", { 0: PLAYERS[1] })) : winner === 0 ? tr("You take the round") : tr("{0} takes the round", { 0: PLAYERS[1] })}
      </p>
    </div>
  );
}
