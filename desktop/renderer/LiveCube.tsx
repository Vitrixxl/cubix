import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { faceOfSlot } from "../../src/shared/cube";
import { HELD_HEX } from "../../src/shared/cubeAppearance";
import { CUBE_PITCH, CUBE_YAW, cubeOrientation, cubeSceneDuration, cubeShapes, cubeViewRadius, turnCube, type CubeOrientation, type CubeScene } from "../../src/shared/cubeScene";
import { rotate, type Quaternion, type SmartCube } from "../../src/client/lib/smartCube";
import { paintShapes } from "./paint";
import { tr } from "../../src/client/i18n";

/** How long a turn takes on screen: quick enough to keep up with a fast solve. */
const TURN_MS = 90;
/** Each sticker keeps the colour of the face it started on, in the held palette (yellow on top). */
const COLORS = Array.from({ length: 54 }, (_, origin) => HELD_HEX[faceOfSlot(origin)]);

/**
 * A cube held as `q`, seen as the app's previews show a cube: from a little above and an eighth to the side, so a
 * cube held square in front of the player shows its front, right and top faces.
 */
const held = (q: Quaternion): CubeOrientation => {
  const eye = cubeOrientation(CUBE_YAW, CUBE_PITCH);
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => {
    const v = rotate(q, axis);
    return [0, 1, 2].map((k) => eye[0]![k]! * v[0]! + eye[1]![k]! * v[1]! + eye[2]![k]! * v[2]!);
  });
};

/**
 * A smart cube as it stands, each turn played as it comes. A cube with a gyroscope is shown as it is held: a drag
 * goes to `onDrag` (the virtual cube turns itself); without one, a drag turns the view.
 */
export function LiveCube({ cube, size, onDrag, turnMs = TURN_MS }: { cube: SmartCube; size: number; onDrag?: (across: number, down: number) => void; turnMs?: number }) {
  const snapshot = useSyncExternalStore(cube.subscribe, () => cube.snapshot),
    canvas = useRef<HTMLCanvasElement>(null),
    rotation = useRef(cubeOrientation()),
    drag = useRef<number[] | null>(null),
    // The turn on screen and when it started; one frame pending at most, however many samples come in.
    shown = useRef<{ scene: CubeScene; start: number }>({ scene: { size: 3, colors: COLORS, states: [Array.from(cube.snapshot.state)], moves: [] }, start: 0 }),
    frame = useRef(0);
  const draw = () => {
    frame.current = 0;
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d")!,
      ratio = devicePixelRatio,
      { scene, start } = shown.current,
      progress = Math.min(1, (performance.now() - start) / turnMs);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintShapes(ctx, cubeShapes(scene, progress * cubeSceneDuration(scene), undefined, undefined, rotation.current), size, cubeViewRadius(scene));
    if (progress < 1) redraw();
  };
  const redraw = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // Sizing the canvas clears it: only when the size changes, drawn again at once.
  useLayoutEffect(() => {
    if (!canvas.current) return;
    canvas.current.width = Math.round(size * devicePixelRatio);
    canvas.current.height = Math.round(size * devicePixelRatio);
    cancelAnimationFrame(frame.current);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
  useEffect(() => {
    if (!snapshot.orientation) return;
    rotation.current = held(snapshot.orientation);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.orientation]);
  useEffect(() => {
    const { state, turn } = snapshot;
    shown.current = {
      scene: turn
        ? { size: 3, colors: COLORS, states: [Array.from(turn.before), Array.from(state)], moves: [turn.move] }
        : { size: 3, colors: COLORS, states: [Array.from(state)], moves: [] },
      start: performance.now(),
    };
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.count]);
  return (
    <canvas
      ref={canvas}
      aria-label={tr("Connected cube")}
      style={{ width: size, height: size, flexShrink: 0, touchAction: "none" }}
      onPointerDown={(e) => {
        drag.current = [e.clientX, e.clientY];
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const across = (e.clientX - drag.current[0]!) * 0.012,
          down = (e.clientY - drag.current[1]!) * 0.012;
        drag.current = [e.clientX, e.clientY];
        if (onDrag) return onDrag(across, down);
        if (cube.snapshot.orientation) return;
        rotation.current = turnCube(rotation.current, across, down);
        redraw();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
