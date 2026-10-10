/**
 * The 3D algorithm player of the web app: the case on the canvas cube, then the algorithm played move by move, its
 * current move lit in the written algorithm, and the controls under it (restart, step, play, speed, scrubber). The
 * logic is `src/client/lib/algPlayer` (shared with Android); this file only draws it and wires the pointer.
 */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronFirst, Focus, Pause, Play, Rotate3d, RotateCcw, StepBack, StepForward } from "lucide-react";
import { AlgPlayer, PLAYER_SPEEDS, algScene, polyAlgScene, readAlg, speedLabel, type PlayerOptions } from "../../src/client/lib/algPlayer";
import type { PolyPuzzle } from "../../src/shared/puzzleScene";
import type { CubeMask } from "../../src/shared/cubeAppearance";
import { paintPulse, paintShapes } from "./paint";
import { NUMERIC, Tip } from "./base";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** A player for `alg` on a cube of `size`, or null where it cannot be played (other puzzles, unknown moves). */
export function useAlgPlayer(alg: string, size: number | null | undefined, mask: CubeMask = "full", options: PlayerOptions & { setup?: string; puzzle?: PolyPuzzle } = {}) {
  const { setup, autoplay, loop, speed, view, puzzle } = options;
  const player = useMemo(() => {
    const scene = puzzle ? polyAlgScene(puzzle, alg) : size ? algScene(alg, size, mask, setup) : null;
    return scene ? new AlgPlayer(scene, { autoplay, loop, speed, view }) : null;
    // The view and speed are read once: a new algorithm starts a new player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alg, size, mask, setup, autoplay, loop, puzzle]);
  useEffect(() => () => player?.dispose(), [player]);
  return player;
}

/** The playback, re-rendering on each frame of it. */
export const usePlayback = (player: AlgPlayer) => useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
/** What a part of the player shows of the playback (a number, a string): drawn again only when that changes, not at every frame. */
const usePlayed = <T,>(player: AlgPlayer, read: (p: AlgPlayer) => T) => useSyncExternalStore(player.subscribe, () => read(player), () => read(player));

/** The cube: drag to turn it, double-click to see it from the start again. */
export function PlayerCube({ player, size, className }: { player: AlgPlayer; size: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drag = useRef<number[] | null>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = devicePixelRatio;
    element.width = Math.round(size * ratio);
    element.height = Math.round(size * ratio);
    const ctx = element.getContext("2d")!;
    ctx.scale(ratio, ratio);
    const draw = () => {
      paintShapes(ctx, player.shapes(), size, player.radius);
      paintPulse(ctx, player.pulse(), size, player.radius);
    };
    draw();
    return player.subscribe(draw);
  }, [player, size]);
  return (
    <Tip content="Drag to turn · double-click to reset" side="top">
      <canvas
        ref={canvas}
        role="img"
        aria-label={tr("3D cube")}
        data-player-cube
        className={cn("shrink-0 cursor-grab touch-none active:cursor-grabbing", className)}
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          drag.current = [e.clientX, e.clientY];
          e.currentTarget.setPointerCapture(e.pointerId);
          e.stopPropagation();
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          player.rotate((e.clientX - drag.current[0]!) * 0.012, (e.clientY - drag.current[1]!) * 0.012);
          drag.current = [e.clientX, e.clientY];
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => player.resetView()}
      />
    </Tip>
  );
}

/**
 * Under the cube: show the face to hold in front (marked for a moment), and put the cube back as it started once it has been
 * turned.
 */
export function ViewButtons({ player, className }: { player: Pick<AlgPlayer, "subscribe" | "showFront" | "resetView" | "turned">; className?: string }) {
  const turned = useSyncExternalStore(player.subscribe, player.turned, player.turned);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button variant="secondary" onClick={player.showFront}>
        <Focus />
        {tr("Show front")}</Button>
      {turned && (
        <Button variant="secondary" onClick={player.resetView}>
          <Rotate3d />
          {tr("Reset view")}</Button>
      )}
    </div>
  );
}

/**
 * The written algorithm, its brackets muted as everywhere, the move being played lit; a click on a move turns it.
 * Without a player it is the plain algorithm.
 */
export function PlayerAlg({ player, text, size = 18, className }: { player?: AlgPlayer | null; text: string; size?: number; className?: string }) {
  const words = useMemo(() => readAlg(text, player?.puzzle).words, [text, player]);
  return (
    <div className={cn("alg flex min-w-0 flex-wrap gap-x-[0.5em] gap-y-[0.3em] font-sans leading-snug font-medium tracking-tight", className)} style={{ fontSize: size }}>
      {player ? <LitWords player={player} words={words} /> : words.map((word, i) => <span key={i}>{word.map((part, j) => <span key={j} className={cn(part.move === undefined && "text-muted-foreground")}>{said(part.text)}</span>)}</span>)}
    </div>
  );
}
function LitWords({ player, words }: { player: AlgPlayer; words: ReturnType<typeof readAlg>["words"] }) {
  const current = usePlayed(player, (p) => p.current());
  return words.map((word, i) => (
    <span key={i} className="flex">
      {word.map((part, j) =>
        part.move === undefined ? (
          <span key={j} className="text-muted-foreground">
            {said(part.text)}
          </span>
        ) : (
          <button
            key={j}
            type="button"
            data-move={part.move}
            aria-current={part.move === current ? "step" : undefined}
            onClick={() => player.playSource(part.move!)}
            className="-mx-[0.15em] rounded-[0.3em] px-[0.15em] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=step]:bg-primary aria-[current=step]:text-primary-foreground"
          >
            {said(part.text)}
          </button>
        ),
      )}
    </span>
  ));
}

/**
 * Space plays or pauses, the arrows step, wherever the focus is while the player is shown: on the dialog itself, the
 * scrubber or the speed buttons too, which would otherwise take the keys. Only text fields keep them.
 */
export function usePlayerKeys(player: AlgPlayer | null) {
  useEffect(() => {
    if (!player) return;
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest?.("input:not([type=range]),textarea,[contenteditable]")) return;
      if (e.key === " ") player.toggle();
      else if (e.key === "ArrowLeft") player.stepBack();
      else if (e.key === "ArrowRight") player.stepForward();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [player]);
}

/**
 * The transport: restart, step back, play or pause, step forward, then the speed; the scrubber with the move count
 * under it. `compact` cycles the speed on one button; `touch` spreads the buttons and makes the scrubber 44 px.
 */
export function PlayerControls({ player, compact = false, touch = false, className }: { player: AlgPlayer; compact?: boolean; touch?: boolean; className?: string }) {
  const total = player.total;
  // The buttons change with these only; the scrubber alone follows every frame.
  usePlayed(player, ({ playback: p }) => [p.playing, p.position === 0, p.target === 0, p.target >= total, p.position >= total, p.speed].join());
  const p = player.playback;
  const button = (tip: string, I: React.ElementType, onClick: () => void, disabled = false, primary = false) => (
    <Tip content={tip}>
      <Button
        variant={primary ? "default" : "ghost"}
        size="icon"
        aria-label={said(tip)}
        disabled={disabled}
        onClick={onClick}
        className={cn(!primary && "text-muted-foreground hover:text-foreground")}
      >
        <I />
      </Button>
    </Tip>
  );
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)} data-player-controls>
      <div className={cn("flex items-center gap-1", touch && "justify-between")}>
        {button("Restart", ChevronFirst, player.restart, p.position === 0 && !p.playing)}
        {button("Previous move (←)", StepBack, player.stepBack, p.target === 0)}
        {button(p.playing ? "Pause (Space)" : p.position >= total ? "Play again (Space)" : "Play (Space)", p.playing ? Pause : p.position >= total ? RotateCcw : Play, player.toggle, false, true)}
        {button("Next move (→)", StepForward, player.stepForward, p.target >= total)}
        {compact || touch ? (
          <Tip content="Speed">
            <Button variant="ghost" onClick={player.cycleSpeed} aria-label={tr("Speed {0}", { 0: speedLabel(p.speed) })} className={cn(NUMERIC, "min-w-11 text-muted-foreground hover:text-foreground")}>
              {speedLabel(p.speed)}
            </Button>
          </Tip>
        ) : (
          <SpeedChoice player={player} className="ml-auto" />
        )}
      </div>
      <Scrubber player={player} touch={touch} />
    </div>
  );
}

/** The scrubber and the moves played under it: the part of the controls drawn on every frame. */
function Scrubber({ player, touch }: { player: AlgPlayer; touch: boolean }) {
  const p = usePlayback(player),
    total = player.total,
    // While the thumb is held the scrubber shows the pointer; let go, the cube settles on the nearest move.
    [held, setHeld] = useState(false),
    done = Math.round(p.position * 10) / 10;
  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label={tr("Moves played")}
        min={0}
        max={total}
        step={0.01}
        value={[p.position]}
        onValueChange={(value: number | readonly number[]) => {
          setHeld(true);
          player.seek(Array.isArray(value) ? value[0]! : (value as number));
        }}
        onValueCommitted={(value: number | readonly number[]) => {
          setHeld(false);
          player.seek(Array.isArray(value) ? value[0]! : (value as number), true);
        }}
        className={cn("flex-1", touch && "py-3")}
      />
      <span className={cn(NUMERIC, "w-14 shrink-0 text-right text-sm font-semibold text-muted-foreground")} aria-live={held ? "off" : "polite"}>
        {Math.floor(done)} / {total}
      </span>
    </div>
  );
}

/** The speeds of a player side by side, the one in use pressed. */
export function SpeedChoice({ player, className }: { player: AlgPlayer; className?: string }) {
  const speed = usePlayed(player, (p) => p.playback.speed);
  return (
    <ToggleGroup aria-label={tr("Speed")} size="segment" spacing={0.5} value={[String(speed)]} onValueChange={(next: string[]) => next[0] && player.setSpeed(Number(next[0]))} className={cn("rounded-[12px] bg-muted p-1 inset-ring-1 inset-ring-edge", className)}>
      {PLAYER_SPEEDS.map((speed) => (
        <ToggleGroupItem key={speed} value={String(speed)} className={cn(NUMERIC, "text-muted-foreground hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground")}>
          {speedLabel(speed)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
