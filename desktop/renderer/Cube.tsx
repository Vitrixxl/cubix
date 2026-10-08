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
  type CubeShape,
} from "../../src/shared/cubeScene";
import { isPolyPuzzle, polyOrientation, polyScene, polySceneDuration, polyShapes } from "../../src/shared/puzzleScene";
import { paintShapes } from "./paint";
import { tr } from "../../src/client/i18n";
import { store } from "./store";
export { paintShapes };
/**
 * Still cubes already worked out, by their stickers: the catalogue's cubes come back on every visit of a page, and are
 * only painted again. The oldest go past a few hundred.
 */
const stills = new Map<string, CubeShape[]>();
function stillShapes(scene: Scene) {
  const key = scene.size + ":" + scene.states.at(-1)!.map((origin) => scene.colors[origin]).join();
  let shapes = stills.get(key);
  if (!shapes) {
    shapes = cubeShapes(scene, 99, undefined, undefined, cubeOrientation());
    if (stills.size >= 300) stills.delete(stills.keys().next().value!);
    stills.set(key, shapes);
  }
  return shapes;
}
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
  orientation,
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
  /** How the cube is turned to the eye (see `cubeOrientation`), the usual three-quarter view by default. */
  orientation?: CubeOrientation;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [loaded, setLoaded] = useState<Scene | undefined>(scene),
    rotation = useRef(orientation ?? cubeOrientation()),
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
    rotation.current = poly ? polyOrientation(poly.puzzle) : (orientation ?? cubeOrientation());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, poly, replay]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const element = canvas.current;
      if (!element || (!loaded && !poly)) return;
      // The canvas is sized again only when it changes; each frame clears it whole.
      const ratio = devicePixelRatio,
        side = Math.round(size * ratio);
      if (element.width !== side || element.height !== side) {
        element.width = side;
        element.height = side;
      }
      const ctx = element.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, side, side);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // A solve starting ends the replay of the scramble at once: the cube is faded out until it stops.
      const seconds = animated && !store.running ? (performance.now() - start.current) / 1000 : 99;
      if (poly) paintShapes(ctx, polyShapes(poly, seconds, rotation.current), size, poly.radius);
      else if (!animated) paintShapes(ctx, stillShapes(loaded!), size, cubeViewRadius(loaded!));
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
      aria-label={tr("Cube preview")}
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
