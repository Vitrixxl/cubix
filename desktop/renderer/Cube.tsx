import { useEffect, useRef, useState } from "react";
import { call } from "./bridge";
type V = number[];
type Scene = {
  size: number;
  colors: number[];
  states: number[][];
  moves: { axis: number; layers: number[]; q: number }[];
};
const add = (a: V, b: V) => a.map((v, i) => v + b[i]),
  scale = (a: V, f: number) => a.map((v) => v * f);
function rotate(v: V, axis: number, angle: number) {
  const w = [...v],
    a = (axis + 1) % 3,
    b = (axis + 2) % 3,
    s = Math.sin(angle),
    c = Math.cos(angle);
  w[a] = c * v[a] - s * v[b];
  w[b] = s * v[a] + c * v[b];
  return w;
}
function geometry(n: number, f: number, r: number, c: number) {
  const h = (n - 1) / 2;
  return [
    [
      [c - h, h, r - h],
      [0, 1, 0],
    ],
    [
      [c - h, -h, h - r],
      [0, -1, 0],
    ],
    [
      [c - h, h - r, h],
      [0, 0, 1],
    ],
    [
      [h - c, h - r, -h],
      [0, 0, -1],
    ],
    [
      [h, h - r, h - c],
      [1, 0, 0],
    ],
    [
      [-h, h - r, c - h],
      [-1, 0, 0],
    ],
  ][f];
}
function tipCurve(v: V, k: number) {
  const sign = v.map(Math.sign),
    start = [...v],
    control = [...v];
  start[k] -= sign[k] * 0.12;
  control[k] -= sign[k] * 3 * 0.024;
  const tip = add(v, scale(sign, -0.024));
  return Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return add(
      add(scale(start, (1 - t) ** 2), scale(control, 2 * t * (1 - t))),
      scale(tip, t * t),
    );
  });
}
function hull(points: V[]) {
  const sorted = points
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  const cross = (o: V, a: V, b: V) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (arr: V[]) => {
    const out: V[] = [];
    for (const p of arr) {
      while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}
export function paintCube(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  seconds: number,
  size: number,
  yaw = Math.PI / 4,
  pitch = 0.55,
) {
  const progress =
      Math.min(1, Math.max(0, seconds / Math.max(scene.size, 3))) *
      scene.moves.length,
    index = Math.min(Math.floor(progress), scene.moves.length),
    f = progress % 1,
    fraction = f * f * (3 - 2 * f),
    state = scene.states[index],
    h = (scene.size - 1) / 2;
  const move = fraction > 0 ? scene.moves[index] : undefined,
    axis = move?.axis ?? 0,
    moving = (l: number) => move?.layers.includes(l - h) ?? false,
    angle = move
      ? ((fraction * Math.PI) / 2) * (move.q === 3 ? -1 : move.q)
      : 0;
  const camera = (v: V) => rotate(rotate(v, 1, -yaw), 0, pitch),
    pose = (v: V, turn: boolean) => camera(turn ? rotate(v, axis, angle) : v);
  const slabs: { start: number; end: number; turn: boolean }[] = [];
  for (let l = 0; l < scene.size; l++) {
    const last = slabs.at(-1);
    if (last && last.turn === moving(l)) last.end = l;
    else slabs.push({ start: l, end: l, turn: moving(l) });
  }
  const direction = [0, 0, 0];
  direction[axis] = 1;
  const facing = camera(direction)[2];
  slabs.sort((a, b) => (a.start - b.start) * facing);
  ctx.clearRect(0, 0, size, size);
  const unit = size / (scene.size * 1.95);
  const paint = (points: V[], color: number, line = false) => {
    if (!points.length) return;
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = size / 2 + v[0] * unit,
        y = size / 2 - v[1] * unit;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    const hex = "#" + color.toString(16).padStart(6, "0");
    if (line) {
      ctx.strokeStyle = hex;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.closePath();
      ctx.fillStyle = hex;
      ctx.fill();
    }
  };
  for (const { start, end, turn } of slabs) {
    const lo = [-h - 0.5, -h - 0.5, -h - 0.5],
      hi = [h + 0.5, h + 0.5, h + 0.5];
    lo[axis] = start - h - 0.5;
    hi[axis] = end - h + 0.5;
    const corners = Array.from({ length: 8 }, (_, i) =>
      [0, 1, 2].map((k) => ((i >> k) & 1 ? hi[k] : lo[k])),
    )
      .flatMap((v) =>
        v.every((c) => Math.abs(c) >= h + 0.5 - 0.0001)
          ? [0, 1, 2].flatMap((k) => tipCurve(v, k))
          : [v],
      )
      .map((v) => pose(v, turn).slice(0, 2));
    paint(hull(corners), 0x121216);
    const edges: V[][] = [];
    state.forEach((origin, slot) => {
      const area = scene.size ** 2,
        [p, n] = geometry(
          scene.size,
          Math.floor(slot / area),
          Math.floor((slot % area) / scene.size),
          slot % scene.size,
        ),
        layer = Math.round(p[axis] + h);
      if (layer < start || layer > end || pose(n, turn)[2] <= 0.0001) return;
      const normal = n.findIndex((v) => v !== 0),
        center = add(p, scale(n, 0.5)),
        outside = (k: number, sign: number) =>
          Math.abs(p[k] + sign * 0.5) >= h + 0.5 - 0.0001,
        extent = (k: number, sign: number) => {
          const v = [0, 0, 0];
          v[k] = sign * (outside(k, sign) ? 0.5 : 0.45);
          return v;
        },
        a = (normal + 1) % 3,
        b = (normal + 2) % 3,
        isCorner =
          [
            [a, -1],
            [a, 1],
            [b, -1],
            [b, 1],
          ].filter(([k, s]) => outside(k, s)).length >= 2;
      const points: V[] = [];
      for (const [sa, sb] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const tip = add(extent(a, sa), extent(b, sb));
        if (outside(a, sa) && outside(b, sb)) {
          const [first, last] = sa * sb > 0 ? [b, a] : [a, b],
            vertex = add(center, tip);
          points.push(
            ...[
              ...tipCurve(vertex, first),
              ...tipCurve(vertex, last).reverse().slice(1),
            ].map((v) => pose(v, turn)),
          );
          continue;
        }
        if (outside(a, sa) || outside(b, sb)) {
          points.push(pose(add(center, tip), turn));
          continue;
        }
        const radius = isCorner ? 0.12 : 0.26,
          arc = [...tip];
        arc[a] -= sa * radius;
        arc[b] -= sb * radius;
        const from = Math.atan2(sb, sa) - Math.PI / 4;
        for (let step = 0; step <= 6; step++) {
          const v = [...arc],
            angle = from + ((Math.PI / 2) * step) / 6;
          v[a] += Math.cos(angle) * radius;
          v[b] += Math.sin(angle) * radius;
          points.push(pose(add(center, v), turn));
        }
      }
      paint(points, scene.colors[origin]);
      for (const [k, along] of [
        [a, b],
        [b, a],
      ])
        for (const sign of [-1, 1]) {
          const neighbor = [0, 0, 0];
          neighbor[k] = sign;
          if (
            k < normal ||
            !outside(k, sign) ||
            pose(neighbor, turn)[2] <= 0.0001
          )
            continue;
          const end = (side: number) => {
            const v = add(center, add(extent(k, sign), extent(along, side)));
            return outside(along, side) ? tipCurve(v, along) : [v];
          };
          edges.push(
            [...end(-1).reverse(), ...end(1)].map((v) => pose(v, turn)),
          );
        }
    });
    for (const edge of edges) paint(edge, 0x121216, true);
  }
}
export function Cube({
  scene,
  setup = "",
  cubeSize = 3,
  mask = "full",
  size = 156,
  replay = 0,
  animated = true,
}: {
  scene?: Scene;
  setup?: string;
  cubeSize?: number;
  mask?: string;
  size?: number;
  replay?: number;
  animated?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [loaded, setLoaded] = useState<Scene | undefined>(scene),
    rotation = useRef([Math.PI / 4, 0.55]),
    drag = useRef<number[] | null>(null),
    start = useRef(0),
    redraw = useRef<() => void>(() => {});
  useEffect(() => {
    let cancelled = false;
    if (scene) setLoaded(scene);
    else
      call("cubePreview", setup, cubeSize, mask)
        .then((v) => {
          if (!cancelled) setLoaded(v);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scene, setup, cubeSize, mask]);
  useEffect(() => {
    start.current = performance.now();
    rotation.current = [Math.PI / 4, 0.55];
    let frame = 0;
    const draw = () => {
      if (!canvas.current || !loaded) return;
      const ratio = devicePixelRatio;
      canvas.current.width = Math.round(size * ratio);
      canvas.current.height = Math.round(size * ratio);
      const ctx = canvas.current.getContext("2d")!;
      ctx.scale(ratio, ratio);
      paintCube(
        ctx,
        loaded,
        animated ? (performance.now() - start.current) / 1000 : 99,
        size,
        ...(rotation.current as [number, number]),
      );
      if (
        animated &&
        (performance.now() - start.current) / 1000 < Math.max(loaded.size, 3)
      )
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
  }, [loaded, size, replay, animated]);
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
        rotation.current = [
          rotation.current[0] - (e.clientX - drag.current[0]) * 0.012,
          Math.max(
            -1.4,
            Math.min(
              1.4,
              rotation.current[1] + (e.clientY - drag.current[1]) * 0.012,
            ),
          ),
        ];
        drag.current = [e.clientX, e.clientY];
        redraw.current();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
