import { CUBE_BODY, cubeOrientation, type CubeOrientation, type CubeShape } from './cubeScene';
import { FACE_HEX } from './cubeAppearance';

/**
 * The pyraminx and the megaminx of the timer, drawn like the 3D cube (`cubeScene`): a dark body under rounded stickers,
 * turned by the same drag. Each sticker is a polygon of the solved puzzle; a move turns the stickers lying beyond a
 * plane about its normal, so a scramble only composes rotations and the stickers keep their colours.
 */
export type PolyPuzzle = 'pyram' | 'minx';
export const isPolyPuzzle = (puzzle: unknown): puzzle is PolyPuzzle => puzzle === 'pyram' || puzzle === 'minx';

type V = readonly number[];
/** A rotation, 3×3 row-major. */
type M = readonly number[];
interface Sticker { points: V[]; cell: V[]; center: V; normal: V; color: number }
interface Turn { axis: V; angle: number; moving: Set<number> }
interface Geometry {
  stickers: Sticker[];
  /** A move by its letter: the axis, the depth beyond which stickers turn, and a quarter of a whole turn's angle. */
  move: (name: string) => { axis: V; depth: number; step: number } | undefined;
  radius: number;
}
export interface PolyScene {
  puzzle: PolyPuzzle;
  stickers: Sticker[];
  /** Rotation of each sticker before each turn; the last entry is the final state. */
  states: M[][];
  turns: Turn[];
  radius: number;
}

const add = (a: V, b: V) => a.map((v, i) => v + b[i]!),
  sub = (a: V, b: V) => a.map((v, i) => v - b[i]!),
  scale = (a: V, f: number) => a.map((v) => v * f),
  dot = (a: V, b: V) => a.reduce((sum, v, i) => sum + v * b[i]!, 0),
  cross = (a: V, b: V) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
  unit = (a: V) => scale(a, 1 / Math.hypot(...a)),
  mean = (points: V[]) => scale(points.reduce(add), 1 / points.length);
const IDENTITY: M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Rotation by `angle` about the unit `axis`, counter-clockwise seen from its tip (Rodrigues). */
function rotation(axis: V, angle: number): M {
  const [x, y, z] = axis as [number, number, number],
    c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const apply = (m: M, v: V) => [0, 1, 2].map((r) => m[r * 3]! * v[0]! + m[r * 3 + 1]! * v[1]! + m[r * 3 + 2]! * v[2]!);
const compose = (a: M, b: M) => Array.from({ length: 9 }, (_, i) => [0, 1, 2].reduce((sum, k) => sum + a[(i - (i % 3)) + k]! * b[k * 3 + (i % 3)]!, 0));

/** Keeps the part of a convex polygon where `inside` is non-negative. */
function clip(polygon: V[], inside: (p: V) => number) {
  const out: V[] = [];
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!,
      a = inside(p),
      b = inside(q);
    if (a >= 0) out.push(p);
    if (a >= 0 !== b >= 0) out.push(add(p, scale(sub(q, p), a / (a - b))));
  });
  return out.filter((p, i) => Math.hypot(...sub(p, out[(i + 1) % out.length]!)) > 1e-6);
}
/** A convex polygon (counter-clockwise, 2D) shrunk by `gap` on every side, its corners rounded over `round`. */
function sticker2d(polygon: V[], gap: number, round: number) {
  const n = polygon.length,
    lines = polygon.map((p, i) => {
      const d = unit(sub(polygon[(i + 1) % n]!, p));
      return { p: add(p, [-d[1]! * gap, d[0]! * gap]), d };
    }),
    inset = lines.map((b, i) => {
      const a = lines[(i + n - 1) % n]!,
        t = ((b.p[0]! - a.p[0]!) * b.d[1]! - (b.p[1]! - a.p[1]!) * b.d[0]!) / (a.d[0]! * b.d[1]! - a.d[1]! * b.d[0]!);
      return add(a.p, scale(a.d, t));
    });
  return inset.flatMap((q, i) => {
    const prev = inset[(i + n - 1) % n]!,
      next = inset[(i + 1) % n]!,
      t = Math.min(round, 0.45 * Math.hypot(...sub(prev, q)), 0.45 * Math.hypot(...sub(next, q))),
      a = add(q, scale(unit(sub(prev, q)), t)),
      b = add(q, scale(unit(sub(next, q)), t));
    return Array.from({ length: 5 }, (_, k) => {
      const s = k / 4;
      return add(add(scale(a, (1 - s) ** 2), scale(q, 2 * s * (1 - s))), scale(b, s * s));
    });
  });
}
/** A face's plane: its centre, and two axes along it, counter-clockwise seen from outside. */
function plane(origin: V, normal: V, toward: V) {
  const u = unit(sub(toward, origin)),
    v = cross(normal, u);
  return {
    flat: (p: V) => [dot(sub(p, origin), u), dot(sub(p, origin), v)],
    lift: (p: V) => add(origin, add(scale(u, p[0]!), scale(v, p[1]!))),
  };
}
function makeSticker(face: ReturnType<typeof plane>, cell: V[], normal: V, color: number, gap: number, round: number): Sticker {
  const area = cell.reduce((sum, p, i) => sum + p[0]! * cell[(i + 1) % cell.length]![1]! - cell[(i + 1) % cell.length]![0]! * p[1]!, 0),
    ccw = area < 0 ? [...cell].reverse() : cell;
  return { points: sticker2d(ccw, gap, round).map(face.lift), cell: ccw.map(face.lift), center: face.lift(mean(ccw)), normal, color };
}

/** Tetrahedron with its corners on the unit sphere: U on top, L and R in front, B behind; green in front, yellow under it. */
function pyraminx(): Geometry {
  const r = (2 * Math.SQRT2) / 3,
    corner = (deg: number) => [r * Math.sin((deg * Math.PI) / 180), -1 / 3, r * Math.cos((deg * Math.PI) / 180)],
    tips: Record<string, V> = { U: [0, 1, 0], L: corner(-60), R: corner(60), B: corner(180) },
    faces: [string, string, string, number][] = [
      ['U', 'L', 'R', FACE_HEX.B],
      ['U', 'B', 'L', FACE_HEX.R],
      ['U', 'R', 'B', FACE_HEX.F],
      ['L', 'B', 'R', FACE_HEX.U],
    ];
  const stickers = faces.flatMap(([a, b, c, color]) => {
    const [A, B, C] = [tips[a]!, tips[b]!, tips[c]!],
      normal = unit(mean([A, B, C])),
      face = plane(A, normal, B),
      at = (i: number, j: number) => face.flat(add(A, add(scale(sub(B, A), i / 3), scale(sub(C, A), j / 3)))),
      cells: V[][] = [];
    for (let i = 0; i < 3; i++)
      for (let j = 0; i + j < 3; j++) {
        cells.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < 2) cells.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    return cells.map((cell) => makeSticker(face, cell, normal, color, 0.028, 0.06));
  });
  // A corner's layer reaches a third of the way down, its tip alone two thirds of that.
  return {
    stickers,
    move: (name) => {
      const axis = tips[name.toUpperCase()];
      return axis && { axis, depth: name === name.toUpperCase() ? 0.1 : 0.55, step: Math.PI / 3 * 2 };
    },
    radius: 1.06,
  };
}

/**
 * Dodecahedron with its faces one unit from the centre: U on top, F in front, then R, BR, BL and L around U; D under
 * it, B behind, with DR, DBR, DBL and DL. Colours of the WCA scheme, opposite faces paired light and dark.
 */
function megaminx(): Geometry {
  const tilt = Math.atan(2),
    around = (deg: number, up: number) => [Math.sin(tilt) * Math.sin((deg * Math.PI) / 180), up * Math.cos(tilt), Math.sin(tilt) * Math.cos((deg * Math.PI) / 180)],
    faces: [string, V, number][] = [
      ['U', [0, 1, 0], 0xece8e2],
      ['F', around(0, 1), 0x0f8a4b],
      ['R', around(72, 1), FACE_HEX.R],
      ['BR', around(144, 1), 0x2b56c4],
      ['BL', around(216, 1), FACE_HEX.U],
      ['L', around(288, 1), 0x8a4ee0],
      ['D', [0, -1, 0], 0x8b8b94],
      ['DR', around(36, -1), 0xfff3a3],
      ['DBR', around(108, -1), 0xf59ad2],
      ['B', around(180, -1), 0x86dd5c],
      ['DBL', around(252, -1), FACE_HEX.L],
      ['DL', around(324, -1), 0x86d3f7],
    ],
    normals = Object.fromEntries(faces.map(([name, n]) => [name, n]));
  const neighbours = (n: V) => faces.filter(([, m]) => Math.abs(dot(n, m) - 1 / Math.sqrt(5)) < 1e-6).map(([, m]) => m);
  // Each corner is where a face meets two of its neighbours that meet each other.
  const pentagon = (n: V) => {
    const ring = neighbours(n),
      corners = ring.flatMap((a, i) =>
        ring.slice(i + 1).filter((b) => Math.abs(dot(a, b) - 1 / Math.sqrt(5)) < 1e-6).map((b) =>
          scale(add(add(cross(a, b), cross(b, n)), cross(n, a)), 1 / dot(n, cross(a, b))),
        ),
      ),
      face = plane(n, n, corners[0]!);
    return { face, corners: corners.map(face.flat).sort((p, q) => Math.atan2(p[1]!, p[0]!) - Math.atan2(q[1]!, q[0]!)) };
  };
  const { corners: sample } = pentagon(faces[0]![1]),
    inradius = Math.hypot(...mean([sample[0]!, sample[1]!])),
    // How far into a face its neighbours' layers reach: the edges keep a short side on the rim, like the real puzzle.
    cut = 0.62 * inradius;
  const stickers = faces.flatMap(([, n, color]) => {
    const { face, corners } = pentagon(n),
      edges = corners.map((p, i) => {
        const d = unit(sub(corners[(i + 1) % 5]!, p));
        // Distance inside the face from edge i, less the cut.
        return (q: V) => dot(sub(q, p), [-d[1]!, d[0]!]) - cut;
      }),
      outer = (k: number) => (q: V) => -edges[(k + 5) % 5]!(q),
      inner = (k: number) => edges[(k + 5) % 5]!,
      region = (...halves: ((q: V) => number)[]) => halves.reduce(clip, corners),
      cells = [
        region(...[0, 1, 2, 3, 4].map(inner)),
        ...[0, 1, 2, 3, 4].map((i) => region(outer(i), inner(i - 1), inner(i + 1))),
        ...[0, 1, 2, 3, 4].map((i) => region(outer(i), outer(i + 1))),
      ];
    return cells.map((cell) => makeSticker(face, cell, n, color, 0.016, 0.035));
  });
  // A face's layer: everything beyond the plane at `cut` from its rim, measured on a neighbour.
  const U = normals.U!,
    { face: front, corners: rim } = pentagon(normals.F!),
    shared = rim.map(front.lift).filter((p) => Math.abs(dot(p, U) - 1) < 1e-6),
    middle = mean(shared),
    depth = dot(add(middle, scale(unit(sub(normals.F!, middle)), cut)), U);
  return {
    stickers,
    move: (name) => {
      const axis = normals[name];
      return axis && { axis, depth, step: (Math.PI * 2) / 5 };
    },
    radius: 1.34,
  };
}

const GEOMETRY: Partial<Record<PolyPuzzle, Geometry>> = {};
const geometry = (puzzle: PolyPuzzle) => (GEOMETRY[puzzle] ??= puzzle === 'pyram' ? pyraminx() : megaminx());

/**
 * A WCA scramble as turns. Pyraminx: U L R B turn a corner's layer, u l r b its tip, clockwise seen from that corner.
 * Megaminx: R++ and D++ turn all but the layer opposite R or D two fifths clockwise seen from R or D, U a fifth.
 */
function parse(puzzle: PolyPuzzle, scramble: string) {
  const { move } = geometry(puzzle);
  return scramble.split(/\s+/).flatMap((token) => {
    const [, name, suffix = ''] = /^([A-Za-z]+)(\+\+|--|'|2'?)?$/.exec(token) ?? [];
    const m = name && move(name);
    if (!m) return [];
    const turns = suffix === '++' ? 2 : suffix === '--' ? -2 : suffix === "'" ? -1 : suffix === '2' ? 2 : suffix === "2'" ? -2 : 1;
    // A double turn of the megaminx keeps the opposite layer and turns all the rest.
    return [{ axis: m.axis, depth: suffix === '++' || suffix === '--' ? -m.depth : m.depth, angle: -turns * m.step }];
  });
}

export function polyScene(puzzle: PolyPuzzle, scramble: string, animated = true): PolyScene {
  const { stickers, radius } = geometry(puzzle);
  let state: M[] = stickers.map(() => IDENTITY);
  const states = [state],
    turns: Turn[] = [];
  for (const { axis, depth, angle } of parse(puzzle, scramble)) {
    const moving = new Set(stickers.flatMap((s, i) => (dot(apply(state[i]!, s.center), axis) > depth ? [i] : []))),
      turn = rotation(axis, angle);
    state = state.map((m, i) => (moving.has(i) ? compose(turn, m) : m));
    if (animated) {
      states.push(state);
      turns.push({ axis, angle, moving });
    }
  }
  return { puzzle, stickers, states: animated ? states : [state], turns, radius };
}
/** Seconds a scene takes to play its scramble. */
export const polySceneDuration = (scene: PolyScene) => (scene.puzzle === 'minx' ? 4 : 3);
/** The resting view: the front face toward the viewer, turned a little to show a side and seen from above. */
export const polyOrientation = (puzzle: PolyPuzzle): CubeOrientation => (puzzle === 'pyram' ? cubeOrientation(0.75, 0.35) : cubeOrientation(0.3, 0.6));

function hull(points: V[]) {
  const sorted = [...points].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
  const turn = (o: V, a: V, b: V) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const chain = (list: V[]) => {
    const out: V[] = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...chain(sorted), ...chain(sorted.reverse())];
}
/** Shapes of the scene `seconds` into its replay, seen in `orientation`, in painting order (see `paintShapes`). */
export function polyShapes(scene: PolyScene, seconds: number, orientation: CubeOrientation): CubeShape[] {
  const progress = Math.min(1, Math.max(0, seconds / polySceneDuration(scene))) * scene.turns.length,
    index = Math.min(Math.floor(progress), scene.turns.length),
    f = progress % 1,
    fraction = f * f * (3 - 2 * f),
    state = scene.states[index]!,
    turn = fraction > 0 ? scene.turns[index] : undefined,
    partial = turn ? rotation(turn.axis, turn.angle * fraction) : IDENTITY,
    camera = (v: V) => add(add(scale(orientation[0]!, v[0]!), scale(orientation[1]!, v[1]!)), scale(orientation[2]!, v[2]!));
  const groups = turn ? [false, true] : [false];
  // The half nearer the viewer is painted last: each half is convex, so its own front faces never overlap.
  if (turn && camera(turn.axis)[2]! < 0) groups.reverse();
  const shapes: CubeShape[] = [];
  for (const moving of groups) {
    const members = scene.stickers.flatMap((s, i) => ((turn?.moving.has(i) ?? false) === moving ? [i] : [])),
      pose = (i: number) => {
        const m = moving ? compose(partial, state[i]!) : state[i]!;
        return (v: V) => camera(apply(m, v));
      };
    shapes.push({ points: hull(members.flatMap((i) => scene.stickers[i]!.cell.map(pose(i)))).map((v) => v.slice(0, 2)), color: CUBE_BODY, line: false });
    for (const i of members) {
      const s = scene.stickers[i]!,
        place = pose(i);
      if (place(s.normal)[2]! <= 1e-4) continue;
      shapes.push({ points: s.points.map((v) => place(v).slice(0, 2)), color: s.color, line: false });
    }
  }
  return shapes;
}
