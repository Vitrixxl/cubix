import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { faceOfSlot, type Move } from "../../src/shared/cube";
import { HELD_HEX } from "../../src/shared/cubeAppearance";
import { CUBE_PITCH, CUBE_YAW, cubeOrientation, cubeSceneDuration, cubeShapes, cubeViewRadius, type CubeOrientation, type CubeScene } from "../../src/shared/cubeScene";
import { rotate, type Quaternion, type SmartCube } from "../../src/client/lib/smartCube";
import { CubeView } from "../../src/client/lib/cubeView";
import { paintPulse, paintShapes } from "./paint";
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
 * The turn to make, drawn over the cube: an arrow around the layer that turns, across the sides of it the eye sees best,
 * the way it turns. `move` in the cube's own axes (see `heldTurn`).
 */
function paintArrow(ctx: CanvasRenderingContext2D, move: Move, orientation: CubeOrientation, size: number, radius: number) {
  const k = move.axis as number,
    a = (k + 1) % 3,
    b = (k + 2) % 3,
    eye = 15,
    unit = size / 2 / radius,
    screen = (v: number[]) => {
      const [x, y, z] = [0, 1, 2].map((i) => orientation[0]![i]! * v[0]! + orientation[1]![i]! * v[1]! + orientation[2]![i]! * v[2]!),
        f = eye / (eye - z!);
      return [size / 2 + x! * f * unit, size / 2 - y! * f * unit] as const;
    },
    toward = (t: number) => orientation[a]![2]! * Math.cos(t) + orientation[b]![2]! * Math.sin(t),
    // A rounded square just off the faces around the layer.
    at = (t: number) => {
      const v = [0, 0, 0],
        c = Math.cos(t),
        s = Math.sin(t);
      v[k] = move.layers[0]!;
      v[a] = 1.58 * Math.sign(c) * Math.abs(c) ** 0.3;
      v[b] = 1.58 * Math.sign(s) * Math.abs(s) ** 0.3;
      return screen(v);
    };
  let best = 0;
  for (let t = 0; t < Math.PI * 2; t += Math.PI / 36) if (toward(t) > toward(best)) best = t;
  const span = move.q === 2 ? 1.25 * Math.PI : 0.85 * Math.PI,
    sign = move.q === 3 ? -1 : 1,
    points = Array.from({ length: 41 }, (_, i) => at(best + sign * (i / 40 - 0.5) * span)),
    [ex, ey] = points.at(-1)!,
    [px, py] = points.at(-4)!,
    angle = Math.atan2(ey - py, ex - px),
    head = size * 0.055,
    width = size * 0.022;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [colour, extra] of [["#1c1317", width * 0.9], ["#f8ebe4", 0]] as const) {
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = width + extra;
    ctx.beginPath();
    points.slice(0, -2).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const grow = extra * 0.9;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(angle) * (head * 0.35 + grow), ey + Math.sin(angle) * (head * 0.35 + grow));
    ctx.lineTo(ex + Math.cos(angle + 2.4) * (head + grow), ey + Math.sin(angle + 2.4) * (head + grow));
    ctx.lineTo(ex + Math.cos(angle - 2.4) * (head + grow), ey + Math.sin(angle - 2.4) * (head + grow));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A smart cube as it stands, each turn played as it comes. A cube with a gyroscope is shown as it is held: a drag
 * goes to `onDrag` (the virtual cube turns itself); without one, a drag turns the view. `view`: the view shared with
 * the view buttons (see `ViewButtons`). `arrow`: the turn to make next, drawn over the cube once it stands still.
 */
export function LiveCube({ cube, size, onDrag, turnMs = TURN_MS, view: shared, arrow }: { cube: SmartCube; size: number; onDrag?: (across: number, down: number) => void; turnMs?: number; view?: CubeView; arrow?: Move | null }) {
  const snapshot = useSyncExternalStore(cube.subscribe, () => cube.snapshot, () => cube.snapshot),
    canvas = useRef<HTMLCanvasElement>(null),
    own = useMemo(() => (shared ? null : new CubeView()), [shared]),
    view = shared ?? own!,
    drag = useRef<number[] | null>(null),
    // The turn on screen and when it started; one frame pending at most, however many samples come in.
    shown = useRef<{ scene: CubeScene; start: number }>({ scene: { size: 3, colors: COLORS, states: [Array.from(cube.snapshot.state)], moves: [] }, start: 0 }),
    frame = useRef(0),
    pointed = useRef(arrow);
  pointed.current = arrow;
  const draw = () => {
    frame.current = 0;
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d")!,
      ratio = devicePixelRatio,
      { scene, start } = shown.current,
      progress = Math.min(1, (performance.now() - start) / turnMs);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintShapes(ctx, cubeShapes(scene, progress * cubeSceneDuration(scene), undefined, undefined, view.orientation), size, cubeViewRadius(scene));
    paintPulse(ctx, view.pulse(), size, cubeViewRadius(scene));
    if (progress < 1) redraw();
    else if (pointed.current) paintArrow(ctx, pointed.current, view.orientation, size, cubeViewRadius(scene));
  };
  const redraw = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => redraw(), [arrow]);
  useEffect(() => () => own?.dispose(), [own]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => view.subscribe(redraw), [view]);
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
    view.hold(held(snapshot.orientation));
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
        view.rotate(across, down);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
