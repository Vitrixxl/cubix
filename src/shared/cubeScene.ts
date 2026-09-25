import { applyMove, parseAlg, solved, type Move } from './cube';
import { stickerColors, type CubeMask } from './cubeAppearance';

/**
 * The 3D cube of the desktop timer, as pure geometry: the canvas of the timer and the SVG of both
 * launchers draw the same shapes, so the startup cube is the very model the timer shows.
 */
export interface CubeScene {
  size: number;
  /** Colour of each physical sticker, indexed by its solved slot. */
  colors: number[];
  /** Sticker permutation before each move; the last entry is the final state. */
  states: number[][];
  moves: Move[];
}
/** A filled polygon or an open outline, in cube units (y up), in painting order. */
export interface CubeShape { points: number[][]; color: number; line: boolean }
export const CUBE_BODY = 0x121216;
export const CUBE_YAW = Math.PI / 4, CUBE_PITCH = 0.55;

/** Desktop renderers consume the exact shared permutations, without a second move parser. */
export function cubeScene(setup: string, size: number, mask: CubeMask, animated = true): CubeScene {
  if (!Number.isInteger(size) || size < 2 || size > 7) throw new Error('Unsupported cube size');
  const moves = parseAlg(setup, size);
  let state = solved(size);
  const states = [Array.from(state)];
  for (const move of moves) {
    state = applyMove(state, move);
    if (animated) states.push(Array.from(state));
  }
  return { size, colors: stickerColors(state, mask), states: animated ? states : [Array.from(state)], moves: animated ? moves : [] };
}
/** Seconds a scene takes to play all its moves. */
export const cubeSceneDuration = (scene: CubeScene) => Math.max(scene.size, 3);
/** Half-width of the view, in cube units: a canvas of `size` pixels draws `size / 2 / cubeViewRadius` pixels per unit. */
export const cubeViewRadius = (scene: CubeScene) => scene.size * 0.975;

type V = number[];
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
    [[c - h, h, r - h], [0, 1, 0]],
    [[c - h, -h, h - r], [0, -1, 0]],
    [[c - h, h - r, h], [0, 0, 1]],
    [[h - c, h - r, -h], [0, 0, -1]],
    [[h, h - r, h - c], [1, 0, 0]],
    [[-h, h - r, c - h], [-1, 0, 0]],
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
    return add(add(scale(start, (1 - t) ** 2), scale(control, 2 * t * (1 - t))), scale(tip, t * t));
  });
}
function hull(points: V[]) {
  const sorted = points
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  const cross = (o: V, a: V, b: V) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (arr: V[]) => {
    const out: V[] = [];
    for (const p of arr) {
      while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

/** Shapes of the scene `seconds` into its replay, seen from `yaw` and `pitch`. */
export function cubeShapes(scene: CubeScene, seconds: number, yaw = CUBE_YAW, pitch = CUBE_PITCH): CubeShape[] {
  const progress = Math.min(1, Math.max(0, seconds / cubeSceneDuration(scene))) * scene.moves.length,
    index = Math.min(Math.floor(progress), scene.moves.length),
    f = progress % 1,
    fraction = f * f * (3 - 2 * f),
    state = scene.states[index],
    h = (scene.size - 1) / 2;
  const move = fraction > 0 ? scene.moves[index] : undefined,
    axis = move?.axis ?? 0,
    moving = (l: number) => move?.layers.includes(l - h) ?? false,
    angle = move ? ((fraction * Math.PI) / 2) * (move.q === 3 ? -1 : move.q) : 0;
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
  const shapes: CubeShape[] = [];
  const paint = (points: V[], color: number, line = false) => {
    if (points.length) shapes.push({ points: points.map((v) => v.slice(0, 2)), color, line });
  };
  for (const { start, end, turn } of slabs) {
    const lo = [-h - 0.5, -h - 0.5, -h - 0.5],
      hi = [h + 0.5, h + 0.5, h + 0.5];
    lo[axis] = start - h - 0.5;
    hi[axis] = end - h + 0.5;
    const corners = Array.from({ length: 8 }, (_, i) => [0, 1, 2].map((k) => ((i >> k) & 1 ? hi[k] : lo[k])))
      .flatMap((v) => (v.every((c) => Math.abs(c) >= h + 0.5 - 0.0001) ? [0, 1, 2].flatMap((k) => tipCurve(v, k)) : [v]))
      .map((v) => pose(v, turn).slice(0, 2));
    paint(hull(corners), CUBE_BODY);
    const edges: V[][] = [];
    state.forEach((origin, slot) => {
      const area = scene.size ** 2,
        [p, n] = geometry(scene.size, Math.floor(slot / area), Math.floor((slot % area) / scene.size), slot % scene.size),
        layer = Math.round(p[axis] + h);
      if (layer < start || layer > end || pose(n, turn)[2] <= 0.0001) return;
      const normal = n.findIndex((v) => v !== 0),
        center = add(p, scale(n, 0.5)),
        outside = (k: number, sign: number) => Math.abs(p[k] + sign * 0.5) >= h + 0.5 - 0.0001,
        extent = (k: number, sign: number) => {
          const v = [0, 0, 0];
          v[k] = sign * (outside(k, sign) ? 0.5 : 0.45);
          return v;
        },
        a = (normal + 1) % 3,
        b = (normal + 2) % 3,
        isCorner = [[a, -1], [a, 1], [b, -1], [b, 1]].filter(([k, s]) => outside(k, s)).length >= 2;
      const points: V[] = [];
      for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const tip = add(extent(a, sa), extent(b, sb));
        if (outside(a, sa) && outside(b, sb)) {
          const [first, last] = sa * sb > 0 ? [b, a] : [a, b],
            vertex = add(center, tip);
          points.push(...[...tipCurve(vertex, first), ...tipCurve(vertex, last).reverse().slice(1)].map((v) => pose(v, turn)));
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
      for (const [k, along] of [[a, b], [b, a]])
        for (const sign of [-1, 1]) {
          const neighbor = [0, 0, 0];
          neighbor[k] = sign;
          if (k < normal || !outside(k, sign) || pose(neighbor, turn)[2] <= 0.0001) continue;
          const end = (side: number) => {
            const v = add(center, add(extent(k, sign), extent(along, side)));
            return outside(along, side) ? tipCurve(v, along) : [v];
          };
          edges.push([...end(-1).reverse(), ...end(1)].map((v) => pose(v, turn)));
        }
    });
    for (const edge of edges) paint(edge, CUBE_BODY, true);
  }
  return shapes;
}
