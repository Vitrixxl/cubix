import { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { cubeOrientation, cubeScene, cubeSceneDuration, cubeShapes, cubeViewRadius, turnCube, type CubeOrientation, type CubeShape } from "../../../src/shared/cubeScene";
import { isPolyPuzzle, polyOrientation, polyScene, polySceneDuration, polyShapes } from "../../../src/shared/puzzleScene";
import type { PuzzleId } from "../../../src/shared/puzzles";
import { useReducedMotion } from "../hooks/useReducedMotion";

/** A drag shorter than this (dp) is a tap: it plays the scramble again. */
const TAP_SLOP = 6;

/** The scramble as a scene of the desktop timer's 3D model: a cube, or the pyraminx and the megaminx. */
function sceneOf(puzzle: PuzzleId, cubeSize: number | null, scramble: string, held: boolean) {
  if (!scramble) return null;
  try {
    if (isPolyPuzzle(puzzle)) {
      const scene = polyScene(puzzle, scramble);
      return { radius: scene.radius, duration: polySceneDuration(scene), orientation: polyOrientation(puzzle),
        shapes: (seconds: number, orientation: CubeOrientation) => polyShapes(scene, seconds, orientation) };
    }
    if (!cubeSize) return null;
    const scene = cubeScene(scramble, cubeSize, "full", true, held);
    return { radius: cubeViewRadius(scene), duration: cubeSceneDuration(scene), orientation: cubeOrientation(),
      shapes: (seconds: number, orientation: CubeOrientation) => cubeShapes(scene, seconds, undefined, undefined, orientation) };
  } catch { return null; }
}

/** One path per run of shapes sharing a colour and a kind, in painting order: far fewer native views than shapes. */
function pathsOf(shapes: CubeShape[]) {
  const paths: { d: string; color: string; line: boolean }[] = [];
  for (const { points, color, line } of shapes) {
    // An invalid number in `d` is a native crash (react-native-svg's PathParser), never just a missing shape.
    if (points.length < 2 || !points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) continue;
    const hex = "#" + color.toString(16).padStart(6, "0");
    const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(3)} ${(-y!).toFixed(3)}`).join("") + (line ? "" : "Z");
    const last = paths.at(-1);
    if (last && last.color === hex && last.line === line) last.d += d;
    else paths.push({ d, color: hex, line });
  }
  return paths;
}

/**
 * The scramble played on the 3D cube of the desktop timer, from the solved puzzle, each turn rotating its layer. Every
 * new scramble plays again; a tap replays it and a drag turns the puzzle around. `still` shows the scrambled puzzle
 * without animating (while a solve is armed or timed, so the JS thread stays free for the timer).
 */
export const ScrambleCube = memo(function ScrambleCube({ puzzle, cubeSize, scramble, held, size, still = false }: {
  puzzle: PuzzleId; cubeSize: number | null; scramble: string; held: boolean; size: number; still?: boolean;
}) {
  const scene = useMemo(() => sceneOf(puzzle, cubeSize, scramble, held), [puzzle, cubeSize, scramble, held]);
  const reduced = useReducedMotion();
  const [shapes, setShapes] = useState<CubeShape[]>([]);
  const [replay, setReplay] = useState(0);
  const orientation = useRef<CubeOrientation>(cubeOrientation());
  const seconds = useRef(0);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const staticRef = useRef(still || reduced);
  staticRef.current = still || reduced;
  // A new scramble faces the default view again; a replay keeps the one dragged to.
  useEffect(() => { if (scene) orientation.current = scene.orientation; }, [scene]);
  useEffect(() => {
    if (!scene) { setShapes([]); return; }
    const start = performance.now();
    let frame = 0;
    const draw = () => {
      seconds.current = staticRef.current ? scene.duration : (performance.now() - start) / 1000;
      setShapes(scene.shapes(seconds.current, orientation.current));
      if (seconds.current < scene.duration) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [scene, replay]);
  // Arming the timer ends the replay where it would have stopped.
  useEffect(() => {
    if (still && scene && seconds.current < scene.duration) setReplay(r => r + 1);
  }, [still]);
  const radius = scene?.radius ?? 1;
  const paths = useMemo(() => pathsOf(shapes), [shapes]);
  if (!scene) return null;
  return <View accessible accessibilityRole="button" accessibilityLabel="The scramble on the cube: tap to play it again, drag to turn it"
    style={{ width: size, height: size }}
    onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
    onResponderGrant={event => { drag.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, moved: 0 }; }}
    onResponderMove={event => {
      const from = drag.current;
      if (!from) return;
      const dx = event.nativeEvent.pageX - from.x, dy = event.nativeEvent.pageY - from.y;
      drag.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, moved: from.moved + Math.hypot(dx, dy) };
      orientation.current = turnCube(orientation.current, dx * 0.02, dy * 0.02);
      if (seconds.current >= scene.duration) setShapes(scene.shapes(seconds.current, orientation.current));
    }}
    onResponderRelease={() => {
      const moved = drag.current?.moved ?? 0;
      drag.current = null;
      if (moved < TAP_SLOP && !still) setReplay(r => r + 1);
    }}
    onResponderTerminate={() => { drag.current = null; }}>
    <Svg width={size} height={size} viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
      {paths.map((p, i) => p.line
        ? <Path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={(radius * 2) / size} />
        : <Path key={i} d={p.d} fill={p.color} />)}
    </Svg>
  </View>;
});
