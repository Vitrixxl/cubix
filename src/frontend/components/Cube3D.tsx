import { useAtomValue } from "jotai";
import { animationsEnabledAtom } from "../state";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { applyMove, colorOf, moveAngleDeg, movingSlots, originInULayer, parseAlg, SLOTS, slotInULayer, type CubeState, type Face, type Move } from "../../shared/cube";

/** Yellow on top, green in front (orange right, red left) — the usual CFOP colour scheme. */
export const FACE_COLORS: Record<Face, string> = {
  U: "rgb(255, 230, 42)",
  D: "rgb(236, 232, 226)",
  F: "rgb(26, 190, 87)",
  B: "rgb(61, 124, 224)",
  R: "rgb(255, 128, 31)",
  L: "rgb(235, 66, 66)",
};
const GREY = "rgb(58, 58, 66)";
const DIM = "rgb(36, 36, 42)";

export type CubeMask = "full" | "OLL" | "PLL" | "F2L";

export interface LayerAnimation {
  move: Move;
  /** degrees, right-handed about the positive axis (math convention) */
  angle: number;
}

export interface Cube3DProps {
  state: CubeState;
  size?: number;
  mask?: CubeMask;
  /** camera rotation in degrees */
  rotation?: { x: number; y: number };
  animation?: LayerAnimation | null;
  /** allow drag to rotate */
  interactive?: boolean;
  onRotationChange?: (r: { x: number; y: number }) => void;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_ROTATION = { x: -30, y: -40 };

function stickerColor(state: CubeState, slot: number, mask: CubeMask): string {
  const face = colorOf(state, slot);
  switch (mask) {
    case "OLL":
      if (face === "U") return FACE_COLORS.U;
      return slotInULayer(slot) ? GREY : DIM;
    case "PLL":
      return slotInULayer(slot) ? FACE_COLORS[face] : DIM;
    case "F2L":
      return originInULayer(state, slot) ? GREY : FACE_COLORS[face];
    default:
      return FACE_COLORS[face];
  }
}

/** CSS rotation that turns a sticker (facing +z) towards its normal. */
function facing(n: readonly number[]): string {
  if (n[1] === 1) return "rotateX(90deg)";
  if (n[1] === -1) return "rotateX(-90deg)";
  if (n[0] === 1) return "rotateY(90deg)";
  if (n[0] === -1) return "rotateY(-90deg)";
  if (n[2] === -1) return "rotateY(180deg)";
  return "";
}

/** Math (right-handed, y up) → CSS (y down) rotation about an axis. */
function cssLayerRotation(axis: number, angleDeg: number): string {
  const a = axis === 1 ? angleDeg : -angleDeg;
  return `rotate${axis === 0 ? "X" : axis === 1 ? "Y" : "Z"}(${a}deg)`;
}

export const Cube3D = memo(function Cube3D({ state, size = 160, mask = "full", rotation, animation, interactive, onRotationChange, className, style }: Cube3DProps) {
  const [localRot, setLocalRot] = useState(rotation ?? DEFAULT_ROTATION);
  useEffect(() => {
    if (rotation) setLocalRot(rotation);
  }, [rotation?.x, rotation?.y]);
  const rot = rotation && !interactive ? rotation : localRot;

  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      drag.current = { x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y };
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [interactive, rot.x, rot.y],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const next = {
        x: Math.max(-90, Math.min(90, drag.current.rx - (e.clientY - drag.current.y) * 0.5)),
        y: drag.current.ry + (e.clientX - drag.current.x) * 0.5,
      };
      setLocalRot(next);
      onRotationChange?.(next);
    },
    [onRotationChange],
  );
  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const unit = size / 3; // 53.33px for a 160px cube
  const sticker = size * (46 / 160);
  const half = size / 2;
  const moving = animation ? new Set(movingSlots(animation.move)) : null;
  const layerRot = animation ? cssLayerRotation(animation.move.axis, animation.angle) : "";

  // A rotated cube projects beyond its nominal square. Keeping the scene at
  // ~72% makes the *visible* cube fit the requested width/height.
  const sceneScale = 0.72;

  return (
    <div
      className={className}
      data-timer-ignore={interactive || undefined}
      style={{ width: size, height: size, perspective: size * 6, position: "relative", cursor: interactive ? "grab" : undefined, touchAction: "none", contain: "layout", ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div style={{ width: size, height: size, transformStyle: "preserve-3d", transform: `scale(${sceneScale}) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, transformOrigin: "50% 50%", position: "relative" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transformStyle: "preserve-3d" }}>
          {SLOTS.map((g, slot) => {
            const [x, y, z] = g.p;
            const tx = g.n[0] !== 0 ? g.n[0] * half : x * unit;
            const ty = g.n[1] !== 0 ? -g.n[1] * half : -y * unit;
            const tz = g.n[2] !== 0 ? g.n[2] * half : z * unit;
            const prefix = moving?.has(slot) ? layerRot + " " : "";
            return (
              <div
                key={slot}
                style={{
                  position: "absolute",
                  width: sticker,
                  height: sticker,
                  marginLeft: -sticker / 2,
                  marginTop: -sticker / 2,
                  backgroundColor: stickerColor(state, slot, mask),
                  borderRadius: Math.max(2, size / 40),
                  transform: `${prefix}translate3d(${tx}px, ${ty}px, ${tz}px) ${facing(g.n)}`,
                  backfaceVisibility: "hidden",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Algorithm player: animates each move of an algorithm on a cube state.
// ---------------------------------------------------------------------------
export interface AlgPlayer {
  state: CubeState;
  animation: LayerAnimation | null;
  playing: boolean;
  /** index of the next move to play */
  index: number;
  total: number;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  reset: () => void;
  /** jump to the end without animating */
  finish: () => void;
}

const QUARTER_MS = 320;

interface AlgPlayerOptions {
  /** Target duration for the complete sequence, including the gaps between moves. */
  totalDurationMs?: number;
  moveGapMs?: number;
}

export function useAlgPlayer(initial: CubeState, alg: string, options: AlgPlayerOptions = {}): AlgPlayer {
  const animationsEnabled = useAtomValue(animationsEnabledAtom);
  const totalDurationMs = options.totalDurationMs;
  const moveGapMs = options.moveGapMs ?? 40;
  const parsedMoves = useMemo(() => {
    try { return parseAlg(alg); } catch { return []; }
  }, [alg]);
  const moves = useRef<Move[]>(parsedMoves);
  moves.current = parsedMoves;
  const [state, setState] = useState<CubeState>(initial);
  const [index, setIndex] = useState(0);
  const [animation, setAnimation] = useState<LayerAnimation | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const nextMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const stateRef = useRef(initial);
  const indexRef = useRef(0);

  const cancel = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    if (nextMoveTimer.current !== null) clearTimeout(nextMoveTimer.current);
    raf.current = null;
    nextMoveTimer.current = null;
  };

  // reset whenever the initial state or algorithm changes
  useEffect(() => {
    cancel();
    playingRef.current = false;
    setPlaying(false);
    stateRef.current = initial;
    indexRef.current = 0;
    setState(initial);
    setIndex(0);
    setAnimation(null);
    return cancel;
  }, [initial, alg]);

  const animateMove = useCallback((mv: Move, then: () => void) => {
    const target = moveAngleDeg(mv);
    const moveWeight = Math.abs(target) > 90 ? 1.5 : 1;
    const totalWeight = moves.current.reduce((sum, move) => sum + (Math.abs(moveAngleDeg(move)) > 90 ? 1.5 : 1), 0);
    const animationBudget = totalDurationMs === undefined ? undefined : Math.max(1, totalDurationMs - moveGapMs * Math.max(0, moves.current.length - 1));
    const duration = animationBudget === undefined || totalWeight === 0 ? QUARTER_MS * moveWeight : (animationBudget * moveWeight) / totalWeight;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimation({ move: mv, angle: target * eased });
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else {
        raf.current = null;
        const next = applyMove(stateRef.current, mv);
        stateRef.current = next;
        indexRef.current += 1;
        setState(next);
        setIndex(indexRef.current);
        setAnimation(null);
        then();
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, [moveGapMs, totalDurationMs]);

  const playNext = useCallback(() => {
    if (!playingRef.current) return;
    const mv = moves.current[indexRef.current];
    if (!mv) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    animateMove(mv, () => {
      nextMoveTimer.current = setTimeout(() => {
        nextMoveTimer.current = null;
        playNext();
      }, moveGapMs);
    });
  }, [animateMove, moveGapMs]);

  const finish = useCallback(() => {
    cancel();
    playingRef.current = false;
    setPlaying(false);
    let s = initial;
    for (const mv of moves.current) s = applyMove(s, mv);
    stateRef.current = s;
    indexRef.current = moves.current.length;
    setState(s);
    setIndex(moves.current.length);
    setAnimation(null);
  }, [initial]);

  useEffect(() => { if (!animationsEnabled && playingRef.current) finish(); }, [animationsEnabled, finish]);

  const play = useCallback(() => {
    if (!animationsEnabled) { finish(); return; }
    if (playingRef.current || raf.current !== null) return;
    if (indexRef.current >= moves.current.length) {
      // restart from the beginning
      stateRef.current = initial;
      indexRef.current = 0;
      setState(initial);
      setIndex(0);
    }
    playingRef.current = true;
    setPlaying(true);
    playNext();
  }, [initial, playNext, animationsEnabled, finish]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const stepForward = useCallback(() => {
    if (raf.current !== null) return;
    const mv = moves.current[indexRef.current];
    if (!mv) return;
    if (!animationsEnabled) {
      stateRef.current = applyMove(stateRef.current, mv);
      indexRef.current += 1;
      setState(stateRef.current);
      setIndex(indexRef.current);
      return;
    }
    animateMove(mv, () => {});
  }, [animateMove, animationsEnabled]);

  const reset = useCallback(() => {
    cancel();
    playingRef.current = false;
    setPlaying(false);
    stateRef.current = initial;
    indexRef.current = 0;
    setState(initial);
    setIndex(0);
    setAnimation(null);
  }, [initial]);



  return { state, animation, playing, index, total: moves.current.length, play, pause, stepForward, reset, finish };
}
