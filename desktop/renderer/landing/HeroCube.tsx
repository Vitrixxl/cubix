/**
 * The landing page's cube, drawn as the app draws its cubes (`cubeShapes` on a canvas): it plays the 3×3 world record
 * (solve.ts) under the timer, step by step at a quarter of its speed, then is scrambled again and solved again. It leans toward the pointer, turns under a drag and as
 * the page scrolls; it rests out of sight, and waits for a click when the reader asked for less motion.
 *
 * Without scripts, the page's HTML shows it scrambled, as a picture (`CubeStill`).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { Pause, Play } from "lucide-react";
import { CUBE_PITCH, CUBE_YAW, cubeOrientation, cubeSceneDuration, cubeShapes, cubeViewRadius, type CubeOrientation, type CubeScene } from "../../../src/shared/cubeScene";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paintShapes } from "../paint";
import { stepColour } from "../stepColour";
import { Digits, said } from "../base";
import { INSPECTION, RECORD, SCRAMBLE, SOLUTION, STEP_TURNS, TURN_BACK, TURNS, loopScene, solveScene } from "./solve";
import { tr } from "../../../src/client/i18n";

/** The solve alone (from the scrambled cube), for the cubes that only solve it (the duel's). */
export const SCENE = solveScene();
const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

/** Whether the reader asked for less motion; false until the page runs. */
export function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)"),
      read = () => setCalm(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return calm;
}
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether the element is in the window: what is out of sight does not move. */
export function useInView(ref: RefObject<Element | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const watched = new IntersectionObserver(([entry]) => setSeen(entry!.isIntersecting), { rootMargin: "-10% 0px" });
    watched.observe(ref.current!);
    return () => watched.disconnect();
  }, [ref]);
  return seen;
}

/** Paints `scene` `moves` into it on a square canvas, as sharp as the screen, `scale` times its usual size. */
export function paintScene(canvas: HTMLCanvasElement, scene: CubeScene, moves: number, orientation: CubeOrientation = cubeOrientation(), scale = 1) {
  const side = canvas.clientWidth,
    ratio = Math.min(devicePixelRatio || 1, 2),
    pixels = Math.round(side * ratio);
  if (!side) return;
  if (canvas.width !== pixels) canvas.width = canvas.height = pixels;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixels, pixels);
  ctx.setTransform(ratio * scale, 0, 0, ratio * scale, (pixels * (1 - scale)) / 2, (pixels * (1 - scale)) / 2);
  const seconds = scene.moves.length ? (moves / scene.moves.length) * cubeSceneDuration(scene) : 0;
  paintShapes(ctx, cubeShapes(scene, seconds, undefined, undefined, orientation), side, cubeViewRadius(scene));
}

/** The cube as the page's HTML draws it, scrambled or `solved`: for a reader without scripts, and before the canvas. */
export function CubeStill({ solved = false, className }: { solved?: boolean; className?: string }) {
  const radius = cubeViewRadius(SCENE);
  return (
    <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`} className={className} aria-hidden="true" data-still>
      {cubeShapes(SCENE, solved ? cubeSceneDuration(SCENE) : 0).map(({ points, color, line }, i) => (
        <polygon
          key={i}
          points={points.map((v) => `${v[0]!.toFixed(2)},${(-v[1]!).toFixed(2)}`).join(" ")}
          fill={line ? "none" : hex(color)}
          stroke={line ? hex(color) : undefined}
          strokeWidth={line ? 1 : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/**
 * The loop the cube plays (`loopScene`): turned back as the WCA holds it, scrambled, inspected, solved. It starts on the
 * scrambled cube (what the page's HTML shows), solves it, rests, scrambles it again.
 */
const LOOP = loopScene(),
  BACK = TURN_BACK.split(" ").length,
  SCRAMBLE_MOVES = BACK + SCRAMBLE.split(" ").length,
  SOLVE_FROM = SCRAMBLE_MOVES + INSPECTION.split(" ").length,
  COUNTS = STEP_TURNS.map((turns) => turns.length),
  STARTS = COUNTS.map((_, i) => COUNTS.slice(0, i).reduce((sum, count) => sum + count, 0));
/** How much slower than the record the solve plays: every turn alike, the record's time spread evenly over its turns. */
const SLOWER = 4;
/** Milliseconds a solving move takes, a scrambling move, and the rests. */
const TURN = (RECORD.ms / TURNS) * SLOWER, SCRAMBLING = 105, INSPECT = 1600, REST = 2600;
type Phase = "inspect" | "solve" | "solved" | "scramble";
interface Part { phase: Phase; step: number; ms: number; from: number; to: number }
const PARTS: Part[] = [
  { phase: "inspect", step: -1, ms: INSPECT, from: SCRAMBLE_MOVES, to: SOLVE_FROM },
  ...COUNTS.map((count, step) => ({ phase: "solve" as const, step, ms: count * TURN, from: SOLVE_FROM + STARTS[step]!, to: SOLVE_FROM + STARTS[step]! + count })),
  { phase: "solved", step: COUNTS.length, ms: REST, from: LOOP.moves.length, to: LOOP.moves.length },
  // Scrambled again: turned back, then the scramble's moves, played from where the solve left it (the start of the scene).
  { phase: "scramble", step: -1, ms: SCRAMBLE_MOVES * SCRAMBLING, from: 0, to: SCRAMBLE_MOVES },
];
const LENGTH = PARTS.reduce((sum, part) => sum + part.ms, 0),
  SOLVE_START = INSPECT,
  SOLVE_MS = TURNS * TURN;
/** Where the loop is `ms` into it: its part, the move it is at (fractions while a layer turns), the record's clock. */
function at(ms: number) {
  let t = ((ms % LENGTH) + LENGTH) % LENGTH;
  for (const part of PARTS) {
    if (t < part.ms || part === PARTS.at(-1)) {
      const moves = part.from + (part.to - part.from) * Math.min(1, t / Math.max(part.ms, 1));
      const clock = part.phase === "solve" ? ((moves - SOLVE_FROM) / TURNS) * RECORD.ms : part.phase === "solved" ? RECORD.ms : 0;
      return { part, moves, clock };
    }
    t -= part.ms;
  }
  throw new Error("unreachable");
}
/** A time as the WCA writes it, to the hundredth. */
const seconds = (ms: number) => (ms / 1000).toFixed(2);

/** The hero's cube and, under it, the timer, the step and its moves, the steps' bar, and a button to pause it all. */
export function HeroCube({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    clock = useRef(0),
    // When the page began to draw it, and how long it has swayed: its turning in and its sway go on from there.
    born = useRef(0),
    swayed = useRef(0),
    fills = useRef<(HTMLSpanElement | null)[]>([]),
    seen = useInView(box),
    calm = useCalm(),
    // Whether it plays: on its own unless asked for less motion; the button takes over from there.
    [chosen, choose] = useState<boolean>(),
    playing = chosen ?? !calm,
    [live, setLive] = useState(false),
    [shown, setShown] = useState({ phase: "inspect" as Phase, step: -1, move: SCRAMBLE_MOVES, ms: 0 });

  useEffect(() => {
    const target = canvas.current!;
    // The pointer from the window's middle (-1 to 1), what a drag turned it, and how far the page has scrolled.
    const lean = { x: 0, y: 0, toX: 0, toY: 0 }, drag = { yaw: 0, pitch: 0, from: null as null | [number, number] };
    let frame = 0, last = performance.now();
    born.current ||= last;
    const still = reduced();
    const draw = (now: number) => {
      const step = Math.min(now - last, 64);
      last = now;
      if (playing && seen) {
        clock.current += step;
        swayed.current += step;
      }
      const { part, moves, clock: ms } = at(clock.current);
      const k = 1 - Math.exp(-step / 240);
      lean.x += (lean.toX - lean.x) * k;
      lean.y += (lean.toY - lean.y) * k;
      const sway = still ? 0 : swayed.current / 1000,
        scrolled = Math.min(scrollY / innerHeight, 1.5),
        // As the page opens it turns in, growing.
        grown = still ? 1 : 1 - 2 ** (-10 * Math.min(1, (now - born.current) / 1200)),
        yaw = CUBE_YAW + Math.sin(sway * 0.45) * 0.12 + lean.x * 0.35 + drag.yaw + scrolled * 1.4 - (1 - grown) * 1.6,
        pitch = Math.max(-0.2, Math.min(1.2, CUBE_PITCH + Math.sin(sway * 0.33) * 0.05 + lean.y * 0.2 + drag.pitch + scrolled * 0.25));
      // Solved, it breathes out once.
      const since = part.phase === "solved" ? clock.current % LENGTH - SOLVE_START - SOLVE_MS : 1e9,
        breath = since < 600 && !still ? Math.sin((Math.PI * since) / 600) * 0.05 : 0;
      paintScene(target, LOOP, moves, cubeOrientation(yaw, pitch), (0.82 + 0.18 * grown) * (0.92 + breath));
      const move = Math.floor(moves + 1e-4);
      for (const [i, fill] of fills.current.entries()) if (fill) fill.style.transform = `scaleX(${part.phase === "scramble" || part.phase === "inspect" ? 0 : Math.max(0, Math.min(1, (moves - SOLVE_FROM - STARTS[i]!) / COUNTS[i]!)).toFixed(3)})`;
      setShown((before) => (before.phase === part.phase && before.step === part.step && before.move === move && before.ms === Math.floor(ms / 10) * 10 ? before : { phase: part.phase, step: part.step, move, ms: Math.floor(ms / 10) * 10 }));
      const moving = (playing && seen) || Math.abs(lean.toX - lean.x) + Math.abs(lean.toY - lean.y) > 1e-3 || (!still && now - born.current < 1300);
      frame = moving ? requestAnimationFrame(draw) : 0;
    };
    const wake = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };
    const point = (e: PointerEvent) => {
      if (drag.from) {
        drag.yaw += (e.clientX - drag.from[0]) * 0.01;
        drag.pitch = Math.max(-0.7, Math.min(0.7, drag.pitch + (e.clientY - drag.from[1]) * 0.006));
        drag.from = [e.clientX, e.clientY];
      } else if (e.pointerType === "mouse" && !still) {
        lean.toX = (e.clientX / innerWidth) * 2 - 1;
        lean.toY = (e.clientY / innerHeight) * 2 - 1;
      }
      wake();
    };
    const grab = (e: PointerEvent) => {
      drag.from = [e.clientX, e.clientY];
      target.setPointerCapture(e.pointerId);
    };
    const drop = () => (drag.from = null);
    target.addEventListener("pointerdown", grab);
    target.addEventListener("pointerup", drop);
    target.addEventListener("pointercancel", drop);
    addEventListener("pointermove", point, { passive: true });
    addEventListener("scroll", wake, { passive: true });
    const sized = new ResizeObserver(wake);
    sized.observe(target);
    setLive(true);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      target.removeEventListener("pointerdown", grab);
      target.removeEventListener("pointerup", drop);
      target.removeEventListener("pointercancel", drop);
      removeEventListener("pointermove", point);
      removeEventListener("scroll", wake);
    };
  }, [playing, seen]);

  const { phase, step, move } = shown,
    turns = phase === "solve" ? STEP_TURNS[step]! : phase === "inspect" ? INSPECTION.split(" ") : SCRAMBLE.split(" "),
    // The move being played, in the step's (or the scramble's, or the inspection's) own written moves.
    lit = phase === "solve" ? move - SOLVE_FROM - STARTS[step]! : phase === "scramble" ? move - BACK : phase === "inspect" ? move - SCRAMBLE_MOVES : -1,
    label = phase === "solve" ? SOLUTION[step]!.label : phase === "solved" ? "Solved" : phase === "scramble" ? "Scrambling" : "Inspection";
  return (
    <div ref={box} className={cn("flex flex-col items-center", className)}>
      <div className="relative aspect-square w-full max-w-[min(34rem,58svh)]">
        {/* Until the page runs, the scrambled cube as a picture. */}
        {!live && <CubeStill className="absolute inset-[4%] size-[92%]" />}
        <canvas ref={canvas} role="img" aria-label={tr("A cube solved step by step")} className="absolute inset-0 size-full cursor-grab touch-pan-y active:cursor-grabbing" />
      </div>
      <div className="grid w-full max-w-[34rem] grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-4 gap-y-3">
        <Digits text={seconds(shown.ms)} phase={phase === "inspect" ? "ready" : phase === "solve" ? "running" : "idle"} className="text-5xl" />
        <div className="flex min-w-0 flex-col gap-1 pb-1">
          <span className="text-sm font-semibold">{said(label)}</span>
          <p aria-hidden="true" className="flex h-5 gap-x-1.5 overflow-hidden font-mono text-[0.8125rem] whitespace-nowrap text-muted-foreground">
            {phase === "solved"
              ? null
              : turns.map((turn, i) => (
                  <span key={i} className={cn(i < lit && "text-foreground", i === lit && "text-primary")}>
                    {turn}
                  </span>
                ))}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={playing ? tr("Pause the cube") : tr("Play the cube")} onClick={() => choose(!playing)} className="mb-1 text-muted-foreground">
          {playing ? <Pause /> : <Play />}
        </Button>
        <div aria-hidden="true" className="col-span-3 flex h-1.5 w-full gap-1">
          {SOLUTION.map((part, i) => (
            <span key={part.id} className="relative overflow-hidden rounded-full bg-muted" style={{ flexGrow: COUNTS[i], flexBasis: 0 }}>
              <span
                ref={(fill) => {
                  fills.current[i] = fill;
                }}
                className="absolute inset-0 origin-left rounded-full"
                style={{ background: stepColour(part.id), transform: "scaleX(0)" }}
              />
            </span>
          ))}
        </div>
        <p className="col-span-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{tr("Current world record — scramble and solution")}</span>
          <br />
          <a href={RECORD.results} target="_blank" rel="noopener" className="underline-offset-4 hover:text-foreground hover:underline">
            {RECORD.holder}, {seconds(RECORD.ms)} · {RECORD.competition} (WCA)
          </a>
          {" · "}
          <a href={RECORD.reconstruction} target="_blank" rel="noopener" className="underline-offset-4 hover:text-foreground hover:underline">
            {tr("Reconstruction")}
          </a>
          {" · "}
          {tr("Played at a quarter of its speed")}
        </p>
      </div>
    </div>
  );
}
