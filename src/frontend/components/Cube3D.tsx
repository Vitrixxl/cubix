import { useAtomValue } from "jotai";
import { animationsEnabledAtom, cubeBrandAtom } from "../state";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { applyMove, moveAngleDeg, parseAlg, cubeSize, type CubeState, type Move } from "../../shared/cube";
import {ThreeViewport,type ThreeViewportProps} from './ThreeViewport';
import {useCubeGeometry} from '../hooks/useCubeGeometry';
import {PuzzlePlaceholder} from './PuzzlePlaceholder';
import {createCubeModel} from '../lib/three/cube-model';
import {DEFAULT_ROTATION,type CubeMask,type LayerAnimation} from '../lib/cube-appearance';
export {FACE_COLORS,DEFAULT_ROTATION,type CubeMask,type LayerAnimation} from '../lib/cube-appearance';
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


export const Cube3D=memo(function Cube3D({state,size=160,mask='full',rotation=DEFAULT_ROTATION,animation,interactive,onRotationChange,className,style}:Cube3DProps){
  const dimension=cubeSize(state),brand=useAtomValue(cubeBrandAtom);
  const createModel=useCallback(()=>createCubeModel(dimension),[dimension]);
  const geometry=useCubeGeometry(dimension),view=useRef<ThreeViewportProps<ReturnType<typeof createCubeModel>>|null>(null);
  if(geometry.ready)view.current={cacheKey:`cube:${dimension}`,createModel,updateModel:model=>model.update(state,mask,animation,brand),label:`${dimension}×${dimension} cube, drag to rotate`,rotation,interactive,onRotationChange,className,style:{width:size,height:size,...style}};
  return view.current&&!geometry.error?<ThreeViewport {...view.current} loading={!geometry.ready}/>:<div style={{width:size,height:size,position:'relative',...style}}><PuzzlePlaceholder error={geometry.error} onRetry={geometry.retry}/></div>;
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
    try { return parseAlg(alg, cubeSize(initial)); } catch { return []; }
  }, [alg, initial]);
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
