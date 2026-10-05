import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "./bridge";
import {
  cubeOrientation,
  cubeSceneDuration,
  cubeShapes,
  cubeViewRadius,
  turnCube,
  type CubeOrientation,
  type CubeScene as Scene,
} from "../../src/shared/cubeScene";
import { isPolyPuzzle, polyOrientation, polyScene, polySceneDuration, polyShapes } from "../../src/shared/puzzleScene";
import { paintShapes } from "./paint";
export { paintShapes };
function paintCube(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  seconds: number,
  size: number,
  orientation: CubeOrientation,
) {
  paintShapes(ctx, cubeShapes(scene, seconds, undefined, undefined, orientation), size, cubeViewRadius(scene));
}
export function Cube({
  scene,
  setup = "",
  cubeSize = 3,
  mask = "full",
  size = 156,
  replay = 0,
  animated = true,
  held = false,
  puzzle,
}: {
  scene?: Scene;
  setup?: string;
  cubeSize?: number;
  mask?: string;
  size?: number;
  replay?: number;
  animated?: boolean;
  /** A scramble, applied white on top and shown yellow on top, rather than a case setup. */
  held?: boolean;
  /** A pyraminx or a megaminx scramble rather than a cube's (see `polyScene`); other puzzles keep `cubeSize`. */
  puzzle?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [loaded, setLoaded] = useState<Scene | undefined>(scene),
    rotation = useRef(cubeOrientation()),
    drag = useRef<number[] | null>(null),
    start = useRef(0),
    redraw = useRef<() => void>(() => {}),
    // Built here at once: the pyraminx and the megaminx need no engine.
    poly = useMemo(() => (isPolyPuzzle(puzzle) ? polyScene(puzzle, setup, animated) : undefined), [puzzle, setup, animated]);
  useEffect(() => {
    let cancelled = false;
    if (poly) return;
    if (scene) setLoaded(scene);
    else
      call("cubePreview", setup, cubeSize, mask, held)
        .then((v) => {
          if (!cancelled) setLoaded(v);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scene, setup, cubeSize, mask, held, poly]);
  // A new scene or a replay restarts the animation; a new size only redraws it where it stands.
  useEffect(() => {
    start.current = performance.now();
    rotation.current = poly ? polyOrientation(poly.puzzle) : cubeOrientation();
  }, [loaded, poly, replay]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      if (!canvas.current || (!loaded && !poly)) return;
      const ratio = devicePixelRatio;
      canvas.current.width = Math.round(size * ratio);
      canvas.current.height = Math.round(size * ratio);
      const ctx = canvas.current.getContext("2d")!;
      ctx.scale(ratio, ratio);
      const seconds = animated ? (performance.now() - start.current) / 1000 : 99;
      if (poly) paintShapes(ctx, polyShapes(poly, seconds, rotation.current), size, poly.radius);
      else paintCube(ctx, loaded!, seconds, size, rotation.current);
      if (animated && seconds < (poly ? polySceneDuration(poly) : cubeSceneDuration(loaded!)))
        frame = requestAnimationFrame(draw);
    };
    redraw.current = () => {
      cancelAnimationFrame(frame);
      draw();
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      redraw.current = () => {};
    };
  }, [loaded, poly, size, replay, animated]);
  return (
    <canvas
      ref={canvas}
      aria-label="Cube preview"
      style={{ width: size, height: size, flexShrink: 0, touchAction: "none" }}
      onPointerDown={(e) => {
        if (!animated) return;
        drag.current = [e.clientX, e.clientY];
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        // Endless about the vertical axis; the tilt stops short of turning the cube over.
        rotation.current = turnCube(rotation.current, (e.clientX - drag.current[0]!) * 0.012, (e.clientY - drag.current[1]!) * 0.012);
        drag.current = [e.clientX, e.clientY];
        redraw.current();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
