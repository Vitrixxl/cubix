import { CUBE_BODY, cubeOrientation, type CubeOrientation, type CubeShape } from './cubeScene';
import { FACE_HEX } from './cubeAppearance';

/**
 * The pyraminx, the megaminx, the skewb and the square-1 of the timer, drawn like the 3D cube (`cubeScene`): a dark
 * body under rounded stickers, turned by the same drag. Each sticker is a polygon of the solved puzzle; a move turns
 * the stickers lying beyond a plane, so a scramble only composes rotations and the stickers keep their colours.
 */
export type PolyPuzzle = 'pyram' | 'minx' | 'skewb' | 'sq1';
export const isPolyPuzzle = (puzzle: unknown): puzzle is PolyPuzzle => typeof puzzle === 'string' && Object.hasOwn(BUILD, puzzle);

type V = readonly number[];
/** A rotation, 3×3 row-major. */
type M = readonly number[];
interface Sticker { points: V[]; cell: V[]; center: V; normal: V; color: number; piece?: number }
interface Turn { axis: V; angle: number; moving: Set<number> }
interface Geometry {
  stickers: Sticker[];
  /** A move by its letter: the axis, the depth beyond which stickers turn, and the angle of one turn. */
  move: (name: string) => { axis: V; depth: number; step: number } | undefined;
  radius: number;
  /**
   * The corners of each piece, for a puzzle that changes shape (the square-1): no longer convex, it is painted piece by
   * piece, each convex, rather than as one body.
   */
  pieces?: V[][];
  /** The quarter of a whole-puzzle rotation by axis (x, y, z), where the notation has one. */
  spin?: Partial<Record<'x' | 'y' | 'z', number>>;
}
export interface PolyScene {
  puzzle: PolyPuzzle;
  stickers: Sticker[];
  /** Rotation of each sticker before each turn; the last entry is the final state. */
  states: M[][];
  turns: Turn[];
  radius: number;
  pieces?: V[][];
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
    spin: { y: (Math.PI * 2) / 5 },
  };
}

/**
 * Cube with its faces one unit from the centre, white on top and green in front. A skewb turn turns the half beyond the
 * plane through the centre across one corner's diagonal: each face a centre square and four corners.
 */
function skewb(): Geometry {
  const faces: [V, V, V, number][] = [
    [[0, 1, 0], [1, 0, 0], [0, 0, 1], FACE_HEX.D],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1], FACE_HEX.U],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0], FACE_HEX.B],
    [[0, 0, -1], [1, 0, 0], [0, 1, 0], FACE_HEX.F],
    [[1, 0, 0], [0, 1, 0], [0, 0, 1], FACE_HEX.R],
    [[-1, 0, 0], [0, 1, 0], [0, 0, 1], FACE_HEX.L],
  ];
  const stickers = faces.flatMap(([n, u, v, color]) => {
    const face = plane(n, n, add(n, u)),
      at = (a: number, b: number) => face.flat(add(n, add(scale(u, a), scale(v, b)))),
      cells = [[at(1, 0), at(0, 1), at(-1, 0), at(0, -1)], ...[[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => [at(a!, b!), at(a!, 0), at(0, b!)])];
    return cells.map((cell) => makeSticker(face, cell, n, color, 0.035, 0.08));
  });
  // WCA notation: R, U, L and B turn the corners DRB, ULB, DLF and DLB, clockwise seen from the corner.
  const corners: Record<string, V> = { R: unit([1, -1, -1]), U: unit([-1, 1, -1]), L: unit([-1, -1, 1]), B: unit([-1, -1, -1]) };
  return { stickers, move: (name) => corners[name] && { axis: corners[name]!, depth: 0, step: (Math.PI * 2) / 3 }, radius: 1.9, spin: { x: Math.PI / 2, y: Math.PI / 2, z: Math.PI / 2 } };
}

/**
 * The square-1 in its cube shape, white on top and green in front, its three layers a third of its height each. Seen
 * from above, each outer layer alternates edges of 30° (one at the front) and corners of 60°; the slice cuts the
 * front between the edge and the left corner, through the centre, and `/` turns the right half over: the front edge,
 * the right corners and edge, as WCA scrambles expect.
 */
const SQ1_CUT = (-15 * Math.PI) / 180,
  /** The slice's axis, square to the cut, toward the half it turns. */
  SQ1_SLICE: V = [Math.cos(SQ1_CUT), 0, -Math.sin(SQ1_CUT)];
function square1(): Geometry {
  const ray = (deg: number) => {
      const a = (deg * Math.PI) / 180,
        d = [Math.sin(a), Math.cos(a)];
      return scale(d, 1 / Math.max(Math.abs(d[0]!), Math.abs(d[1]!)));
    },
    sides: [number, number, number][] = [
      [0, 1, FACE_HEX.B],
      [1, 0, FACE_HEX.R],
      [0, -1, FACE_HEX.F],
      [-1, 0, FACE_HEX.L],
    ];
  const stickers: Sticker[] = [],
    pieces: V[][] = [];
  // A piece: a convex polygon seen from above (x, z), from height `low` to `high`, a sticker on each outer face.
  const piece = (outline: V[], low: number, high: number) => {
    const index = pieces.length,
      at = (p: V, y: number) => [p[0]!, y, p[1]!],
      push = (n: V, corners: V[], color: number) => {
        const face = plane(mean(corners), n, corners[0]!);
        stickers.push({ ...makeSticker(face, corners.map(face.flat), n, color, 0.03, 0.06), piece: index });
      };
    pieces.push([...outline.map((p) => at(p, low)), ...outline.map((p) => at(p, high))]);
    if (high === 1) push([0, 1, 0], outline.map((p) => at(p, 1)), FACE_HEX.D);
    if (low === -1) push([0, -1, 0], outline.map((p) => at(p, -1)), FACE_HEX.U);
    outline.forEach((p, i) => {
      const q = outline[(i + 1) % outline.length]!,
        side = sides.find(([x, z]) => (x ? p[0]! * x > 0.999 && q[0]! * x > 0.999 : p[1]! * z > 0.999 && q[1]! * z > 0.999));
      if (side) push([side[0], 0, side[1]], [at(p, low), at(q, low), at(q, high), at(p, high)], side[2]);
    });
  };
  for (const [low, high] of [[1 / 3, 1], [-1, -1 / 3]] as const)
    for (let k = 0; k < 4; k++) {
      const a = k * 90;
      piece([[0, 0], ray(a - 15), ray(a + 15)], low, high);
      piece([[0, 0], ray(a + 15), ray(a + 45), ray(a + 75)], low, high);
    }
  // The middle layer: the square cut in two along the slice.
  const square: V[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]],
    across = [SQ1_SLICE[0]!, SQ1_SLICE[2]!];
  for (const sign of [1, -1]) piece(clip(square, (p) => sign * dot(p, across)), -1 / 3, 1 / 3);
  return {
    stickers,
    pieces,
    // U and D stand for the outer layers, turned a twelfth at a time; the slice is read by `parse`.
    move: (name) => (name === 'U' ? { axis: [0, 1, 0], depth: 0.2, step: Math.PI / 6 } : name === 'D' ? { axis: [0, -1, 0], depth: 0.2, step: Math.PI / 6 } : undefined),
    radius: 1.95,
  };
}

const GEOMETRY: Partial<Record<PolyPuzzle, Geometry>> = {},
  BUILD: Record<PolyPuzzle, () => Geometry> = { pyram: pyraminx, minx: megaminx, skewb, sq1: square1 };
const geometry = (puzzle: PolyPuzzle) => (GEOMETRY[puzzle] ??= BUILD[puzzle]());

/**
 * A WCA scramble as turns. Pyraminx: U L R B turn a corner's layer, u l r b its tip, clockwise seen from that corner.
 * Megaminx: R++ and D++ turn all but the layer opposite R or D two fifths clockwise seen from R or D, U a fifth.
 * Skewb: R U L B (see `skewb`). Square-1: (x, y) turns the top x twelfths and the bottom y, each clockwise seen from
 * that face; / turns the right half over.
 */
export type PolyTurn = { axis: V; depth: number; angle: number };
const AXES: Record<string, V> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
export function polyTurns(puzzle: PolyPuzzle, scramble: string): PolyTurn[] {
  const { move, spin } = geometry(puzzle);
  if (puzzle === 'sq1')
    return [...scramble.matchAll(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)|\//g)].flatMap(([token, top, bottom]) => {
      if (token === '/') return [{ axis: SQ1_SLICE, depth: 0, angle: Math.PI }];
      return (
        [
          ['U', Number(top)],
          ['D', Number(bottom)],
        ] as const
      ).flatMap(([name, turns]) => {
        const m = move(name)!;
        return turns ? [{ axis: m.axis, depth: m.depth, angle: -turns * m.step }] : [];
      });
    });
  return scramble.split(/\s+/).flatMap((token) => {
    const [, name, suffix = ''] = /^([A-Za-z]+)(\+\+|--|'|2'?)?$/.exec(token) ?? [];
    // x, y and z turn the whole puzzle, clockwise seen from R, U and F.
    const quarter = name && spin?.[name as 'x'],
      m = quarter ? { axis: AXES[name]!, depth: -Infinity, step: quarter } : name && move(name);
    if (!m) return [];
    const turns = suffix === '++' ? 2 : suffix === '--' ? -2 : suffix === "'" ? -1 : suffix === '2' ? 2 : suffix === "2'" ? -2 : 1;
    // A double turn of the megaminx keeps the opposite layer and turns all the rest.
    return [{ axis: m.axis, depth: suffix === '++' || suffix === '--' ? -m.depth : m.depth, angle: -turns * m.step }];
  });
}

/** The scene of a scramble or of turns; `undo` starts where they lead from, undone from the solved puzzle, and plays them. */
export function polyScene(puzzle: PolyPuzzle, scramble: string | PolyTurn[], animated = true, undo = false): PolyScene {
  const { stickers, radius, pieces } = geometry(puzzle);
  let state: M[] = stickers.map(() => IDENTITY);
  const list = typeof scramble === 'string' ? polyTurns(puzzle, scramble) : scramble;
  // A turn's layer is the same set of stickers before and after it, so a turn is undone turning its layer back.
  if (undo)
    for (const { axis, depth, angle } of [...list].reverse()) {
      const turn = rotation(axis, -angle);
      state = state.map((m, i) => (dot(apply(m, stickers[i]!.center), axis) > depth ? compose(turn, m) : m));
    }
  const states = [state],
    turns: Turn[] = [];
  for (const { axis, depth, angle } of list) {
    const moving = new Set(stickers.flatMap((s, i) => (dot(apply(state[i]!, s.center), axis) > depth ? [i] : []))),
      turn = rotation(axis, angle);
    state = state.map((m, i) => (moving.has(i) ? compose(turn, m) : m));
    if (animated) {
      states.push(state);
      turns.push({ axis, angle, moving });
    }
  }
  return { puzzle, stickers, states: animated ? states : [state], turns, radius, pieces };
}
/** Seconds a scene takes to play its scramble: a tenth of a second a turn, so the megaminx's 77 can be followed. */
export const polySceneDuration = (scene: PolyScene) => Math.max(3, scene.turns.length * 0.1);
/** The resting view: the front face toward the viewer, turned a little to show a side and seen from above. */
export const polyOrientation = (puzzle: PolyPuzzle): CubeOrientation =>
  puzzle === 'pyram' ? cubeOrientation(0.75, 0.35) : puzzle === 'minx' ? cubeOrientation(0.3, 0.6) : cubeOrientation();

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
  if (scene.pieces) {
    for (const moving of groups) paintPieces(scene, shapes, state, moving ? partial : IDENTITY, (i) => (turn?.moving.has(i) ?? false) === moving, camera);
    return shapes;
  }
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

/**
 * The square-1's pieces of one half, back to front: its layers from the one away from the viewer, and in each layer
 * the pieces by depth. Each piece is convex: its body, then its stickers facing the viewer.
 */
function paintPieces(scene: PolyScene, shapes: CubeShape[], state: M[], partial: M, member: (sticker: number) => boolean, camera: (v: V) => V) {
  const pieces = scene.pieces!,
    owned = pieces.map(() => [] as number[]);
  scene.stickers.forEach((s, i) => member(i) && owned[s.piece!]!.push(i));
  const up = camera(apply(partial, [0, 1, 0]))[2]! >= 0 ? 1 : -1,
    placed = owned.flatMap((stickers, p) => {
      if (!stickers.length) return [];
      const m = state[stickers[0]!]!,
        middle = apply(m, mean(pieces[p]!));
      return [{ p, stickers, m, layer: Math.round(middle[1]! * 1.5) * up, depth: camera(apply(partial, middle))[2]! }];
    });
  placed.sort((a, b) => a.layer - b.layer || a.depth - b.depth);
  for (const { p, stickers, m } of placed) {
    const place = (v: V) => camera(apply(partial, apply(m, v)));
    shapes.push({ points: hull(pieces[p]!.map(place)).map((v) => v.slice(0, 2)), color: CUBE_BODY, line: false });
    for (const i of stickers) {
      const s = scene.stickers[i]!;
      if (place(s.normal)[2]! <= 1e-4) continue;
      shapes.push({ points: s.points.map((v) => place(v).slice(0, 2)), color: s.color, line: false });
    }
  }
}
