/**
 * The 3D algorithm player of the web app: the case on the canvas cube, then the algorithm played move by move, its
 * current move lit in the written algorithm, and the controls under it (restart, step, play, speed, scrubber). The
 * logic is `src/client/lib/algPlayer` (shared with Android); this file only draws it and wires the pointer.
 */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronFirst, Focus, Pause, Play, Rotate3d, RotateCcw, StepBack, StepForward } from "lucide-react";
import { AlgPlayer, PLAYER_SPEEDS, algScene, readAlg, speedLabel, type PlayerOptions } from "../../src/client/lib/algPlayer";
import { cubeViewRadius } from "../../src/shared/cubeScene";
import type { CubeMask } from "../../src/shared/cubeAppearance";
import { paintShapes } from "./Cube";
import { NUMERIC, Tip } from "./base";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** A player for `alg` on a cube of `size`, or null where it cannot be played (other puzzles, unknown moves). */
export function useAlgPlayer(alg: string, size: number | null | undefined, mask: CubeMask = "full", options: PlayerOptions & { setup?: string } = {}) {
  const { setup, autoplay, loop, speed, view } = options;
  const player = useMemo(() => {
    const scene = size ? algScene(alg, size, mask, setup) : null;
    return scene ? new AlgPlayer(scene, { autoplay, loop, speed, view }) : null;
    // The view and speed are read once: a new algorithm starts a new player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alg, size, mask, setup, autoplay, loop]);
  useEffect(() => () => player?.dispose(), [player]);
  return player;
}

/** The playback, re-rendering on each frame of it. */
export const usePlayback = (player: AlgPlayer) => useSyncExternalStore(player.subscribe, player.getSnapshot);

/** The glow of `AlgPlayer.showFront` on the painted cube: the front face lit, two waves spreading from its centre. */
function paintPulse(ctx: CanvasRenderingContext2D, player: AlgPlayer, size: number) {
  const pulse = player.pulse();
  if (!pulse) return;
  const unit = size / 2 / cubeViewRadius(player.scene),
    at = (v: number[]) => [size / 2 + v[0]! * unit, size / 2 - v[1]! * unit] as const,
    [cx, cy] = at(pulse.centre),
    corners = pulse.corners.map(at),
    reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy))),
    fade = 1 - pulse.t;
  ctx.save();
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.shadowColor = `rgba(255,255,255,${fade})`;
  ctx.shadowBlur = size / 14;
  ctx.strokeStyle = `rgba(255,255,255,${0.8 * fade})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.clip();
  ctx.fillStyle = `rgba(255,255,255,${0.22 * fade})`;
  ctx.fill();
  for (const delay of [0, 0.3]) {
    const t = (pulse.t - delay) / (1 - delay);
    if (t <= 0) continue;
    const r = t * reach,
      band = reach * 0.18,
      wave = ctx.createRadialGradient(cx, cy, Math.max(0, r - band), cx, cy, r + band);
    wave.addColorStop(0, "rgba(255,255,255,0)");
    wave.addColorStop(0.5, `rgba(255,255,255,${0.55 * (1 - t)})`);
    wave.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wave;
    ctx.fill();
  }
  ctx.restore();
}

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
      paintShapes(ctx, player.shapes(), size, cubeViewRadius(player.scene));
      paintPulse(ctx, player, size);
    };
    draw();
    return player.subscribe(draw);
  }, [player, size]);
  return (
    <Tip content="Drag to turn · double-click to reset" side="top">
      <canvas
        ref={canvas}
        role="img"
        aria-label="3D cube"
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
 * Under the cube: show the face to hold in front (it glows), and put the cube back as it started once it has been
 * turned.
 */
export function ViewButtons({ player, className }: { player: AlgPlayer; className?: string }) {
  const turned = useSyncExternalStore(player.subscribe, player.turned);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button variant="secondary" size="lg" onClick={player.showFront} className="gap-2 shadow-md">
        <Focus />
        Show front
      </Button>
      {turned && (
        <Button variant="secondary" size="lg" onClick={player.resetView} className="gap-2 shadow-md">
          <Rotate3d />
          Reset view
        </Button>
      )}
    </div>
  );
}

/**
 * The written algorithm, its brackets muted as everywhere, the move being played lit; a click on a move turns it.
 * Without a player it is the plain algorithm.
 */
export function PlayerAlg({ player, text, size = 18, className }: { player?: AlgPlayer | null; text: string; size?: number; className?: string }) {
  const words = useMemo(() => readAlg(text).words, [text]);
  return (
    <div className={cn("alg flex min-w-0 flex-wrap gap-x-[0.5em] gap-y-[0.3em] font-sans leading-snug font-medium tracking-tight", className)} style={{ fontSize: size }}>
      {player ? <LitWords player={player} words={words} /> : words.map((word, i) => <span key={i}>{word.map((part, j) => <span key={j} className={cn(part.move === undefined && "text-muted-foreground")}>{part.text}</span>)}</span>)}
    </div>
  );
}
function LitWords({ player, words }: { player: AlgPlayer; words: ReturnType<typeof readAlg>["words"] }) {
  usePlayback(player);
  const current = player.current();
  return words.map((word, i) => (
    <span key={i} className="flex">
      {word.map((part, j) =>
        part.move === undefined ? (
          <span key={j} className="text-muted-foreground">
            {part.text}
          </span>
        ) : (
          <button
            key={j}
            type="button"
            data-move={part.move}
            aria-current={part.move === current ? "step" : undefined}
            onClick={() => player.playSource(part.move!)}
            className="-mx-[0.12em] rounded-[0.2em] px-[0.12em] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=step]:bg-primary/15 aria-[current=step]:text-primary"
          >
            {part.text}
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
 * under it. `compact` cycles the speed on one button; `touch` makes every target 44 px.
 */
export function PlayerControls({ player, compact = false, touch = false, className }: { player: AlgPlayer; compact?: boolean; touch?: boolean; className?: string }) {
  const p = usePlayback(player),
    total = player.total,
    // While the thumb is held the scrubber shows the pointer; let go, the cube settles on the nearest move.
    [held, setHeld] = useState(false),
    icon = touch ? "icon-lg" : compact ? "icon-sm" : "icon";
  const button = (tip: string, I: React.ElementType, onClick: () => void, disabled = false, primary = false) => (
    <Tip content={tip}>
      <Button
        variant={primary ? "default" : "ghost"}
        size={icon}
        aria-label={tip}
        disabled={disabled}
        onClick={onClick}
        className={cn(!primary && "text-muted-foreground hover:text-foreground", touch && "size-11")}
      >
        <I />
      </Button>
    </Tip>
  );
  const done = Math.round(p.position * 10) / 10;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)} data-player-controls>
      <div className={cn("flex items-center gap-1", touch && "justify-between")}>
        {button("Restart", ChevronFirst, player.restart, p.position === 0 && !p.playing)}
        {button("Previous move (←)", StepBack, player.stepBack, p.target === 0)}
        {button(p.playing ? "Pause (Space)" : p.position >= total ? "Play again (Space)" : "Play (Space)", p.playing ? Pause : p.position >= total ? RotateCcw : Play, player.toggle, false, true)}
        {button("Next move (→)", StepForward, player.stepForward, p.target >= total)}
        {compact || touch ? (
          <Tip content="Speed">
            <Button variant="ghost" size={touch ? "lg" : "sm"} onClick={player.cycleSpeed} aria-label={`Speed ${speedLabel(p.speed)}`} className={cn(NUMERIC, "min-w-11 text-muted-foreground hover:text-foreground", touch && "h-11")}>
              {speedLabel(p.speed)}
            </Button>
          </Tip>
        ) : (
          <ToggleGroup aria-label="Speed" size="sm" spacing={1} value={[String(p.speed)]} onValueChange={(next: string[]) => next[0] && player.setSpeed(Number(next[0]))} className="ml-auto">
            {PLAYER_SPEEDS.map((speed) => (
              <ToggleGroupItem key={speed} value={String(speed)} className={cn(NUMERIC, "px-2 text-xs text-muted-foreground aria-pressed:text-foreground")}>
                {speedLabel(speed)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Slider
          aria-label="Moves played"
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
        <span className={cn(NUMERIC, "w-14 shrink-0 text-right text-xs text-muted-foreground")} aria-live={held ? "off" : "polite"}>
          {Math.floor(done)} / {total}
        </span>
      </div>
    </div>
  );
}
