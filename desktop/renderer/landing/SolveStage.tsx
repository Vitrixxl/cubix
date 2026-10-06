/**
 * The landing page's solve. The cube is the app's own, drawn as the app draws it (`cubeShapes`), and stays in the
 * window while the page is read: it turns in as the page opens, then each feature that comes into view (the elements
 * marked `data-chapter`) plays a CFOP step of the solve and sends the cube to the other side of the window; the last
 * one stops the clock. Behind the cube, tiles (grid.ts) that the pointer lights as it moves, and across which each
 * step done, then the solve, send a ring; the features' own words come in with the scroll (see
 * `landing-part` in globals.css).
 *
 * Over it, the step, its moves and the bar of the steps, and a clock that is a real one: the first turn starts it,
 * the last stops it, however long the page took to read.
 *
 * Without scripts, the page's HTML shows the cube scrambled, as a picture.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { CUBE_PITCH, CUBE_YAW, cubeOrientation, cubeSceneDuration, cubeShapes, cubeViewRadius } from "../../../src/shared/cubeScene";
import { fmtTime } from "../../../src/client/lib/format";
import { cn } from "@/lib/utils";
import { paintShapes } from "../paint";
import { stepColour } from "../stepColour";
import { tileGrid } from "./grid";
import { SCRAMBLE, SOLUTION, STEP_TURNS, TURNS, solveScene } from "./solve";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

const SCENE = solveScene(),
  TOTAL = SCENE.moves.length,
  COUNTS = STEP_TURNS.map((turns) => turns.length),
  STARTS = COUNTS.map((_, i) => COUNTS.slice(0, i).reduce((sum, count) => sum + count, 0)),
  RADIUS = cubeViewRadius(SCENE);
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const ease = (t: number) => t * t * (3 - 2 * t);
const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");
/** Milliseconds for the cube to catch up with the scroll: a wheel's notches become one movement. */
const FOLLOW = 130;

/**
 * Where the cube stands at the top of the page, then for each feature in turn: across the page's column and up the
 * window (-1 to 1), its size, and how it is turned from the app's usual view (yaw, pitch, a lean to the side). In a
 * wide window it faces the words, which change sides at each feature; in a narrow one it is a small cube beside the
 * clock, and only turns.
 */
const WIDE = [
  [0.5, 0.05, 1.12, 0, 0, 0],
  [0.52, 0.06, 1.28, -0.4, 0.1, 0.05],
  [-0.5, 0.06, 1.18, 0.45, -0.04, -0.06],
  [0.48, 0.05, 1.38, -0.25, 0.16, 0.08],
  [-0.52, 0.06, 1.15, 0.35, 0.05, -0.05],
  [0.54, 0.07, 1.5, -0.55, -0.06, 0.1],
  [-0.48, 0.06, 1.22, 0.25, 0.12, -0.08],
  [0.5, 0.06, 1.3, -0.3, 0.02, 0.05],
  [-0.5, 0.07, 1.42, 0, 0, 0],
];
const NARROW = [0, -0.3, 0.3, -0.2, 0.35, -0.35, 0.2, -0.25, 0].map((yaw) => [0, 0, 1, yaw, 0, 0]);

/**
 * The cube's side for a size of 1: a part of the window's height, within a part of the page's column and a most in
 * pixels, so a tall or a wide window does not make a giant of it. The column is the page's own (`max-w-7xl`): the
 * cube keeps to it, as the words do.
 */
const SIDE = 0.42, ACROSS = 0.3, MOST = 400, COLUMN = 1280;

/** How far from the window's middle a feature's words are held back, in window heights: the notch each one makes. */
const HOLD = 0.36;
/** Seconds the page takes to scroll one window when it solves the cube by itself. */
const PACE = 1.5;

/**
 * Solves the cube for the reader: the page scrolls by itself, steadily, from where it is to the last feature, which
 * plays the whole solve (the words brake on their own, see `read`). Anything the reader does to scroll stops it.
 */
export function solveByItself() {
  const chapters = document.querySelectorAll<HTMLElement>("[data-chapter]"), last = chapters[chapters.length - 1];
  if (!last) return;
  const box = last.getBoundingClientRect(), from = scrollY, to = from + box.top + box.height / 2 - innerHeight / 2;
  if (to <= from || matchMedia("(prefers-reduced-motion: reduce)").matches) return scrollTo({ top: to, behavior: "instant" });
  const lasts = ((to - from) / innerHeight) * PACE * 1000, start = performance.now(), stops = ["wheel", "touchstart", "keydown", "pointerdown"];
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const name of stops) removeEventListener(name, stop);
  };
  const step = (now: number) => {
    // Steady, but for a gentle start and a gentle end.
    const part = clamp((now - start) / lasts), edge = 0.06, gone = part < edge ? (part * part) / (2 * edge) : part > 1 - edge ? 1 - edge - (1 - part) ** 2 / (2 * edge) : part - edge / 2;
    scrollTo({ top: from + (to - from) * (gone / (1 - edge)), behavior: "instant" });
    if (part < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  for (const name of stops) addEventListener(name, stop, { passive: true });
  frame = requestAnimationFrame(step);
}

/** A colour of the theme as the screen shows it: red, green and blue from 0 to 1. */
function themeColour(name: string): [number, number, number] {
  const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r! / 255, g! / 255, b! / 255];
}

/** The cube as the page's HTML draws it, scrambled or `solved`: for a reader without scripts, and at the page's end. */
export function CubeStill({ solved = false, className }: { solved?: boolean; className?: string }) {
  return (
    <svg viewBox={`${-RADIUS} ${-RADIUS} ${RADIUS * 2} ${RADIUS * 2}`} className={className} aria-hidden="true" data-still>
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
 * The page's top and its features (`children`), with the cube and its clock held in the window over them; `finish`
 * is what the page offers once the cube is solved, on either side of the way on.
 */
export function SolveStage({ children, finish }: { children: React.ReactNode; finish?: [React.ReactNode, React.ReactNode] }) {
  const story = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    ground = useRef<HTMLCanvasElement>(null),
    mini = useRef<HTMLCanvasElement>(null),
    clock = useRef<HTMLSpanElement>(null),
    fills = useRef<(HTMLSpanElement | null)[]>([]),
    // The move being played, -1 before the first: what the step's name and its lit moves follow.
    [at, setAt] = useState(-1),
    // The clock: waiting for the first turn, running, or stopped on the solve's time (milliseconds).
    [timed, setTimed] = useState<{ state: "ready" | "running" | "stopped"; ms: number }>({ state: "ready", ms: 0 });
  useEffect(() => {
    const target = canvas.current!,
      chapters = [...story.current!.querySelectorAll<HTMLElement>("[data-chapter]")],
      top = story.current!.querySelector<HTMLElement>("[data-top]"),
      wide = matchMedia("(min-width: 1024px)"),
      // Asked for less motion: the cube still follows the scroll, which is the reader's own, and nothing else moves.
      calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = mini.current!, ctx = target.getContext("2d")!, under = ground.current!.getContext("2d")!, tiny = small.getContext("2d")!,
      grid = tileGrid(themeColour("--primary"));

    const view = { moves: -1, chapter: 0, across: 0, down: 0 },
      // The pointer from the window's middle (-1 to 1), for the cube to lean to.
      pointer = [0, 0];
    let frame = 0, last = 0, born = 0, seen = true, moved = true, shown = NaN, mouse: [number, number] | null = null, steps = 0;
    let to = { moves: 0, chapter: 0 }, solvedAt = -1e9, solved = false;
    let state: "ready" | "running" | "stopped" = "ready", began = 0;
    const set = (element: HTMLElement, name: string, value: number) => {
      const text = value.toFixed(3);
      if (element.style.getPropertyValue(name) !== text) element.style.setProperty(name, text);
    };
    /**
     * Where the scroll puts the solve. A feature comes in from its top at the bottom of the window to where it is
     * read, its middle in the window's: its step is played on the way and the cube changes sides, its words come in,
     * brake there, and go as it leaves by the top.
     */
    const read = () => {
      const height = innerHeight;
      let moves = 0, chapter = 0;
      chapters.forEach((element, i) => {
        const box = element.getBoundingClientRect(),
          rest = height / 2 - box.height / 2,
          entered = clamp((height - box.top) / (height - rest) / 0.88);
        if (i < COUNTS.length) moves += entered * COUNTS[i]!;
        chapter += entered;
        if (calm) return;
        set(element, "--t", clamp((height * 0.85 - box.top) / (height * 0.65)));
        set(element, "--o", clamp((rest - box.top - height * 0.25) / (height * 0.35)));
        // The words are held in the window (see `landing-title`), not carried by the scroll: `away` is how far
        // from the window's middle the scroll alone would put them, and they brake as they near it, stay about
        // it, then pick up speed again. They keep the place across the page their feature gives them.
        const away = box.top - rest, slow = height * HOLD, slot = element.firstElementChild!.getBoundingClientRect();
        set(element, "--d", away ** 3 / (away * away + slow * slow));
        set(element, "--x", slot.left);
        set(element, "--w", slot.width);
      });
      if (top && !calm) set(top, "--o", clamp(scrollY / (height * 0.55)));
      return { moves, chapter };
    };
    // From here on the features' words are placed by this script rather than by the scroll: at once, each where
    // the scroll has it.
    if (!calm) {
      story.current!.dataset.live = "";
      to = read();
    }
    /**
     * The clock, as the app's timer runs: started by the first turn, stopped by the last one, and set back to zero
     * once the page is back at its top, the cube scrambled again. A cube found already solved was never timed.
     */
    const time = (now: number) => {
      const before = state;
      let ms = state === "running" ? now - began : undefined;
      if (view.moves < 0.01) {
        state = "ready";
        ms = 0;
      } else if (view.moves > TOTAL - 0.001) state = "stopped";
      else if (state === "ready") {
        state = "running";
        began = now;
        ms = 0;
      }
      if (ms !== undefined && clock.current) clock.current.textContent = fmtTime(ms);
      if (state !== before) setTimed({ state, ms: ms ?? 0 });
    };
    /**
     * The picture at `now`: the cube between two features' places, drawn as the app draws its cubes, over the grid.
     * As the page opens it turns in, growing; solved, it breathes out once.
     */
    const draw = (now: number) => {
      const large = wide.matches,
        places = large ? WIDE : NARROW,
        along = clamp(view.chapter, 0, places.length - 1),
        i = Math.min(Math.floor(along), places.length - 2),
        part = ease(along - i),
        [x, y, scale, turn, tilt, lean] = places[i]!.map((value, k) => value + (places[i + 1]![k]! - value) * part) as [number, number, number, number, number, number],
        seconds = calm ? 0 : (now - born) / 1000,
        since = now - solvedAt,
        here = calm ? 1 : 1 - 2 ** (-10 * clamp((now - born - 150) / 1400)),
        ratio = target.width / Math.max(target.clientWidth, 1), width = target.clientWidth, height = target.clientHeight,
        up = y + (calm ? 0 : Math.sin(seconds * 0.9) * 0.012),
        box = stage.current!.getBoundingClientRect(),
        // In a narrow window the cube is a small one, beside the clock.
        nook = small.getBoundingClientRect(),
        column = Math.min(width, COLUMN),
        size = (large ? Math.min(height * SIDE, column * ACROSS, MOST) * scale : nook.width) * (0.72 + 0.28 * here) * (1 + (since < 500 ? Math.sin((Math.PI * since) / 500) * 0.06 : 0)),
        // The last feature turns the solved cube once on itself; the pointer leans it a little.
        yaw = CUBE_YAW + turn + (i === places.length - 2 ? part * Math.PI * 2 : 0) + Math.sin(seconds * 0.4) * 0.1 + view.across * 0.22 - (1 - here) * 2.4,
        pitch = CUBE_PITCH + tilt + Math.sin(seconds * 0.31) * 0.04 + view.down * 0.12,
        cos = Math.cos(lean), sin = Math.sin(lean),
        held = cubeOrientation(yaw, pitch).map((axis) => [axis[0]! * cos - axis[1]! * sin, axis[0]! * sin + axis[1]! * cos, axis[2]!]);
      // The tiles under it: the pointer lights them; a ring leaves the cube at each step done, a stronger one when
      // it is solved.
      const centre: [number, number] = large ? [width / 2 + (column / 2) * x, (height / 2) * (1 - up)] : [nook.left + nook.width / 2 - box.left, nook.top + nook.height / 2 - box.top],
        over: [number, number] | null = mouse && !calm ? [mouse[0] - box.left, mouse[1] - box.top] : null,
        done = STARTS.filter((start, k) => view.moves >= start + COUNTS[k]! - 0.001).length;
      if (done > steps && !calm && now - born > 600) grid.ring(centre[0], centre[1], now, done === COUNTS.length ? 1 : 0.4, done === COUNTS.length ? Math.hypot(width, height) : Math.max(size * 1.6, 280));
      steps = done;
      under.setTransform(ratio, 0, 0, ratio, 0, 0);
      under.clearRect(0, 0, width, height);
      grid.draw(under, now, over, here);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const sharp = small.width / Math.max(nook.width, 1), cube = large ? ctx : tiny;
      tiny.setTransform(sharp, 0, 0, sharp, 0, 0);
      tiny.clearRect(0, 0, nook.width, nook.height);
      cube.globalAlpha = clamp(here * 1.6);
      if (large) cube.translate(centre[0] - size / 2, centre[1] - size / 2);
      else cube.translate((nook.width - size) / 2, (nook.height - size) / 2);
      paintShapes(cube, cubeShapes(SCENE, (view.moves / TOTAL) * cubeSceneDuration(SCENE), undefined, undefined, held), size, RADIUS);
    };
    const tick = (now: number) => {
      const step = Math.min(now - last, 64), near = 1 - Math.exp(-step / FOLLOW);
      last = now;
      if (moved) to = read();
      moved = false;
      // The first drawing, or a page restored halfway: straight where the scroll is, and nothing to celebrate.
      if (view.moves < 0) {
        Object.assign(view, to);
        born = now;
        solved = to.moves > TOTAL - 0.001;
      }
      view.moves += (to.moves - view.moves) * near;
      view.chapter += (to.chapter - view.chapter) * near;
      const settled = Math.abs(to.moves - view.moves) < 0.002 && Math.abs(to.chapter - view.chapter) < 0.002;
      if (settled) Object.assign(view, to);
      view.across += (pointer[0]! - view.across) * (1 - Math.exp(-step / 260));
      view.down += (pointer[1]! - view.down) * (1 - Math.exp(-step / 260));
      time(now);
      if (view.moves > TOTAL - 0.001 && !solved) solvedAt = now;
      solved = view.moves > TOTAL - 0.001;

      draw(now);
      if (view.moves !== shown) {
        fills.current.forEach((fill, i) => fill && (fill.style.transform = `scaleX(${clamp((view.moves - STARTS[i]!) / COUNTS[i]!).toFixed(3)})`));
        setAt(view.moves < 0.01 ? -1 : Math.floor(view.moves + 0.0001));
        shown = view.moves;
      }
      // Out of sight, nothing is drawn; asked for less motion, only what the scroll or the clock changes.
      frame = seen && (!calm || !settled || state === "running" || now - solvedAt < 2200) ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const scroll = () => {
      moved = true;
      wake();
    };
    const sized = new ResizeObserver(() => {
      // As sharp as the screen, within what a laptop's graphics draw at ease.
      const width = target.clientWidth, height = target.clientHeight;
      const ratio = Math.min(devicePixelRatio, 2, Math.sqrt(2_400_000 / Math.max(width * height, 1)));
      target.width = Math.round(width * ratio);
      target.height = Math.round(height * ratio);
      ground.current!.width = target.width;
      ground.current!.height = target.height;
      small.width = small.height = Math.round(small.clientWidth * Math.min(devicePixelRatio, 3));
      grid.size(width, height, wide.matches ? 64 : 44);
      scroll();
    });
    sized.observe(target);
    const watched = new IntersectionObserver(([entry]) => {
      seen = entry!.isIntersecting;
      if (seen) scroll();
    });
    watched.observe(stage.current!);
    const point = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || calm) return;
      pointer[0] = (e.clientX / innerWidth) * 2 - 1;
      pointer[1] = (e.clientY / innerHeight) * 2 - 1;
      mouse = [e.clientX, e.clientY];
    };
    const gone = () => (mouse = null);
    addEventListener("scroll", scroll, { passive: true });
    addEventListener("resize", scroll);
    addEventListener("pointermove", point, { passive: true });
    document.documentElement.addEventListener("pointerleave", gone);
    return () => {
      cancelAnimationFrame(frame);
      delete story.current?.dataset.live;
      sized.disconnect();
      watched.disconnect();
      document.documentElement.removeEventListener("pointerleave", gone);
      removeEventListener("scroll", scroll);
      removeEventListener("resize", scroll);
      removeEventListener("pointermove", point);
    };
  }, []);

  const solved = at >= TOTAL,
    started = at >= 0,
    step = STARTS.filter((start) => at >= start).length - 1;
  return (
    <div ref={story} className="relative">
      {/* The tiles, and in a wide window the cube, held in the window behind the words. */}
      <div ref={stage} aria-hidden="true" className="pointer-events-none sticky top-0 z-0 h-svh">
        <canvas ref={ground} className="absolute inset-0 size-full" />
        <canvas ref={canvas} className="absolute inset-0 size-full" />
        <noscript>
          <CubeStill className="absolute top-1/2 left-[75%] w-[min(38vw,54svh)] -translate-x-1/2 -translate-y-1/2 max-lg:hidden" />
        </noscript>
      </div>
      <div className="relative z-10 -mt-[100svh]">{children}</div>
      {/* The solve's clock and steps, held at the bottom of the window: the words fade behind them. */}
      <div className="pointer-events-none sticky bottom-0 z-20 bg-linear-to-t from-background from-45% to-transparent pt-14 lg:pt-28">
        {/* The cube solved: that the page goes on, with a way there, in the middle of what to do next (`finish`). */}
        <div
          inert={!solved}
          className={cn(
            "absolute top-0 left-1/2 grid w-max max-w-[calc(100vw-2.5rem)] -translate-x-1/2 grid-cols-[1fr_auto_1fr] items-center gap-2 transition-[opacity,translate] duration-500 lg:top-8",
            solved ? "pointer-events-auto opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <span className="justify-self-end">{finish?.[0]}</span>
          <a href="#tour" aria-label={tr("Keep scrolling")} className="flex h-10 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent sm:pr-4 sm:pl-3.5">
            <ArrowDown className="landing-nudge size-4 text-primary" />
            <span className="max-sm:hidden">{tr("Keep scrolling")}</span>
          </a>
          <span className="justify-self-start">{finish?.[1]}</span>
        </div>
        <div aria-hidden="true" className="mx-auto flex w-full max-w-7xl items-end gap-x-4 px-5 pb-4 md:px-8 lg:gap-x-12 lg:pb-7">
          <canvas ref={mini} className="-mb-1.5 -ml-1.5 size-[4.5rem] shrink-0 lg:hidden" />
          <div className="flex flex-col gap-1 lg:gap-1.5">
            <span className={cn("text-3xl leading-none font-semibold tracking-tight tabular-nums transition-colors duration-500 lg:text-6xl", timed.state === "stopped" && timed.ms ? "text-primary" : timed.state === "ready" ? "text-muted-foreground" : "text-foreground")}>
              <span ref={clock}>{fmtTime(0)}</span>
            </span>
            <span className="text-xs text-muted-foreground lg:text-sm">{solved ? tr("Solved") : started ? SOLUTION[step]!.label : tr("Scrambled")}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 pb-1 lg:pb-1.5">
            <p className="flex h-5 gap-x-2 overflow-hidden font-mono text-sm whitespace-nowrap max-lg:hidden">
              {solved ? (
                <span className="text-muted-foreground">
                  {TURNS} {" "}{tr("turns")}{timed.ms > 0 && tr(" · {0} turns per second", { 0: (TURNS / (timed.ms / 1000)).toFixed(1) })}
                </span>
              ) : started ? (
                STEP_TURNS[step]!.map((turn, i) => {
                  const index = STARTS[step]! + i;
                  return (
                    <span key={i} className={index < at ? "text-foreground" : index === at ? "text-primary" : "text-muted-foreground/50"}>
                      {said(turn)}
                    </span>
                  );
                })
              ) : (
                <span className="text-muted-foreground/70">{said(SCRAMBLE)}</span>
              )}
            </p>
            <div className="flex h-1.5 w-full gap-1">
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
          </div>
        </div>
      </div>
    </div>
  );
}
