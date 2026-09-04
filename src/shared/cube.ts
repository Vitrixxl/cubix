/**
 * Minimal 3x3x3 facelet model.
 *
 * - 54 sticker slots, 9 per face in the order U, D, F, B, R, L.
 * - A state is a Uint8Array where state[slot] = origin slot of the sticker now sitting there.
 *   The solved state is the identity; the colour of a sticker is the face of its origin slot.
 * - Every slot has a 3D geometry (cubie position p ∈ {-1,0,1}³ and outward normal n),
 *   which is used both to apply moves (rotate p and n, look up the target slot) and to
 *   render the cube with CSS 3D transforms.
 *
 * Math coordinates: x → right, y → up, z → towards the viewer (right-handed).
 */

export type Face = "U" | "D" | "F" | "B" | "R" | "L";
export const FACES: readonly Face[] = ["U", "D", "F", "B", "R", "L"];

export type Vec3 = readonly [number, number, number];
export interface SlotGeometry {
  /** cubie position */
  p: Vec3;
  /** outward normal (unit axis vector) */
  n: Vec3;
  face: Face;
}

const FACE_NORMAL: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

/** Slot geometry, row-major as seen from outside each face (standard net orientation). */
export const SLOTS: readonly SlotGeometry[] = (() => {
  const out: SlotGeometry[] = [];
  for (const face of FACES) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        let p: Vec3;
        switch (face) {
          case "U": p = [c - 1, 1, r - 1]; break; // row 0 = back, row 2 = front
          case "D": p = [c - 1, -1, 1 - r]; break; // row 0 = front
          case "F": p = [c - 1, 1 - r, 1]; break;
          case "B": p = [1 - c, 1 - r, -1]; break; // seen from behind, left = +x
          case "R": p = [1, 1 - r, 1 - c]; break; // seen from the right, left = front (+z)
          case "L": p = [-1, 1 - r, c - 1]; break; // seen from the left, left = back (-z)
        }
        out.push({ p, n: FACE_NORMAL[face], face });
      }
    }
  }
  return out;
})();

const slotKey = (p: Vec3, n: Vec3) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
const SLOT_BY_KEY = new Map<string, number>(SLOTS.map((s, i) => [slotKey(s.p, s.n), i]));

export type CubeState = Uint8Array;
export const solved = (): CubeState => Uint8Array.from({ length: 54 }, (_, i) => i);
export const faceOfSlot = (slot: number): Face => FACES[Math.floor(slot / 9)];
export const colorOf = (state: CubeState, slot: number): Face => faceOfSlot(state[slot]);

// ---------------------------------------------------------------------------
// Rotations
// ---------------------------------------------------------------------------
export type Axis = 0 | 1 | 2; // x, y, z

/** Rotate v by q quarter turns (right-handed) about the positive axis. */
function rotate(v: Vec3, axis: Axis, q: number): Vec3 {
  let [x, y, z] = v;
  const turns = ((q % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    // +90° right-handed about axis: (a × v) + a(a·v)
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

export interface Move {
  axis: Axis;
  /** coordinate values (along the axis) of the layers that turn */
  layers: readonly number[];
  /** quarter turns, right-handed about the positive axis (normalised to 1, 2 or 3) */
  q: number;
  /** original token, e.g. "R'", "u2" */
  token: string;
}

interface MoveDef { axis: Axis; layers: readonly number[]; q: number }
// Clockwise as seen from outside: positive faces turn -90° (q = 3), negative faces +90° (q = 1).
const BASE: Record<string, MoveDef> = {
  R: { axis: 0, layers: [1], q: 3 },
  L: { axis: 0, layers: [-1], q: 1 },
  U: { axis: 1, layers: [1], q: 3 },
  D: { axis: 1, layers: [-1], q: 1 },
  F: { axis: 2, layers: [1], q: 3 },
  B: { axis: 2, layers: [-1], q: 1 },
  M: { axis: 0, layers: [0], q: 1 }, // follows L
  E: { axis: 1, layers: [0], q: 1 }, // follows D
  S: { axis: 2, layers: [0], q: 3 }, // follows F
  r: { axis: 0, layers: [1, 0], q: 3 },
  l: { axis: 0, layers: [-1, 0], q: 1 },
  u: { axis: 1, layers: [1, 0], q: 3 },
  d: { axis: 1, layers: [-1, 0], q: 1 },
  f: { axis: 2, layers: [1, 0], q: 3 },
  b: { axis: 2, layers: [-1, 0], q: 1 },
  x: { axis: 0, layers: [1, 0, -1], q: 3 },
  y: { axis: 1, layers: [1, 0, -1], q: 3 },
  z: { axis: 2, layers: [1, 0, -1], q: 3 },
};

const TOKEN_RE = /^([UDFBRLudfbrlMESxyz])(w)?([123])?(')?([123])?$/;

/** Parse one token such as R, R', R2, R2', R3, Rw, u2. Returns null when not a move. */
export function parseMove(raw: string): Move | null {
  const m = TOKEN_RE.exec(raw);
  if (!m) return null;
  let letter = m[1];
  if (m[2] === "w") letter = letter.toLowerCase(); // Rw → r
  const def = BASE[letter];
  if (!def) return null;
  let amount = Number(m[3] ?? m[5] ?? 1);
  if (m[4]) amount = -amount;
  const q = (((def.q * amount) % 4) + 4) % 4;
  return { axis: def.axis, layers: def.layers, q, token: raw };
}

const GROUP_RE = /\(([^()]*)\)([0-9]*)('?)/;

/**
 * Expand repeated / inverted groups: "(R U R' U')2" → "R U R' U' R U R' U'", "(R U)'" → "U' R'".
 * Plain parentheses are removed. Square brackets are treated as plain grouping.
 */
export function expandAlg(alg: string): string {
  let s = alg.replace(/\[/g, "(").replace(/\]/g, ")");
  for (let guard = 0; guard < 100 && GROUP_RE.test(s); guard++) {
    s = s.replace(GROUP_RE, (_m, inner: string, count: string, prime: string) => {
      const body = prime ? invertAlg(inner) : inner.trim();
      const n = count ? Number(count) : 1;
      return ` ${Array.from({ length: n }, () => body).join(" ")} `;
    });
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Parse a full algorithm string. Groups are expanded; unknown tokens throw. */
export function parseAlg(alg: string): Move[] {
  const out: Move[] = [];
  for (const tok of expandAlg(alg).split(/\s+/)) {
    if (!tok) continue;
    const mv = parseMove(tok);
    if (!mv) throw new Error(`Unknown move token: "${tok}" in "${alg}"`);
    if (mv.q !== 0) out.push(mv);
  }
  return out;
}

/** Inverse of a move token (R → R', R2 → R2, R' → R). */
export function invertToken(tok: string): string {
  const m = TOKEN_RE.exec(tok);
  if (!m) return tok;
  const base = m[1] + (m[2] ?? "");
  const n = Number(m[3] ?? m[5] ?? 1) % 4;
  if (n === 2) return base + "2";
  const prime = !!m[4] !== (n === 3); // R3 ≡ R'
  return prime ? base : base + "'";
}

export function invertAlg(alg: string): string {
  return (alg.includes("(") || alg.includes("[") ? expandAlg(alg) : alg)
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map(invertToken)
    .join(" ");
}

const Y2_MOVE_MAP: Record<string, string> = {
  R: "L", L: "R", F: "B", B: "F", U: "U", D: "D",
  r: "l", l: "r", f: "b", b: "f", u: "u", d: "d",
  M: "M", E: "E", S: "S", x: "x", y: "y", z: "z",
};
const Y2_REVERSES_DIRECTION = new Set(["M", "S", "x", "z"]);

/**
 * Express an algorithm from the opposite viewing angle (a y2 camera rotation).
 * R/L and F/B swap; x/z and their matching slice moves reverse direction.
 */
export function reorientAlgY2(alg: string): string {
  return expandAlg(alg)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const match = TOKEN_RE.exec(token);
      if (!match) throw new Error(`Unknown move token: "${token}" in "${alg}"`);
      const letter = match[1];
      const mapped = `${Y2_MOVE_MAP[letter]}${match[2] ?? ""}${match[3] ?? ""}${match[4] ?? ""}${match[5] ?? ""}`;
      return Y2_REVERSES_DIRECTION.has(letter) ? invertToken(mapped) : mapped;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Applying moves
// ---------------------------------------------------------------------------
const PERM_CACHE = new Map<string, Uint8Array>();

/** Permutation for a move: perm[slot] = target slot after the move. */
export function movePermutation(mv: Move): Uint8Array {
  const key = `${mv.axis}|${mv.layers.join(",")}|${mv.q}`;
  let perm = PERM_CACHE.get(key);
  if (perm) return perm;
  perm = new Uint8Array(54);
  for (let s = 0; s < 54; s++) {
    const g = SLOTS[s];
    if (mv.layers.includes(g.p[mv.axis])) {
      const t = SLOT_BY_KEY.get(slotKey(rotate(g.p, mv.axis, mv.q), rotate(g.n, mv.axis, mv.q)));
      if (t === undefined) throw new Error("geometry error");
      perm[s] = t;
    } else perm[s] = s;
  }
  PERM_CACHE.set(key, perm);
  return perm;
}

export function applyMove(state: CubeState, mv: Move): CubeState {
  const perm = movePermutation(mv);
  const next = new Uint8Array(54);
  for (let s = 0; s < 54; s++) next[perm[s]] = state[s];
  return next;
}

export function applyAlg(state: CubeState, alg: string | Move[]): CubeState {
  const moves = typeof alg === "string" ? parseAlg(alg) : alg;
  let cur = state;
  for (const mv of moves) cur = applyMove(cur, mv);
  return cur;
}

/** Slots that move for a given move (used to animate a layer). */
export function movingSlots(mv: Move): number[] {
  const out: number[] = [];
  for (let s = 0; s < 54; s++) if (mv.layers.includes(SLOTS[s].p[mv.axis])) out.push(s);
  return out;
}

/** Signed angle in degrees, right-handed about the positive axis, for a full move. */
export const moveAngleDeg = (mv: Move): number => (mv.q === 3 ? -90 : mv.q === 1 ? 90 : 180);

// ---------------------------------------------------------------------------
// Helpers for training
// ---------------------------------------------------------------------------
export const AUFS = ["", "U", "U2", "U'"] as const;
export const randomAuf = (): string => AUFS[Math.floor(Math.random() * 4)];

/** Append an AUF to a setup, merging it with a trailing U move ("... U" + "U2" → "... U'"). */
export function combineAuf(setup: string, auf: string): string {
  const tokens = expandAlg(setup).split(/\s+/).filter(Boolean);
  const aufMove = auf ? parseMove(auf) : null;
  if (!aufMove) return tokens.join(" ");
  const last = tokens.at(-1);
  const lastMove = last ? parseMove(last) : null;
  if (lastMove && lastMove.axis === 1 && lastMove.layers.length === 1 && lastMove.layers[0] === 1) {
    const q = (lastMove.q + aufMove.q) % 4; // both are U-layer moves about the y axis
    tokens.pop();
    if (q === 0) return tokens.join(" ");
    const suffix = q === 3 ? "" : q === 2 ? "2" : "'"; // U = q3, U2 = q2, U' = q1
    tokens.push("U" + suffix);
    return tokens.join(" ");
  }
  return [...tokens, auf].join(" ");
}

/**
 * Adapt an algorithm to a case after a random AUF was appended to its setup.
 *
 * If the shown state is `setup + auf`, the solution must start with
 * `inverse(auf)`. Consecutive leading U turns are merged so the answer stays
 * natural to read (`U' + U R U' R'` becomes `R U' R'`).
 */
export function compensateAuf(alg: string, auf: string): string {
  const cleanAlg = formatAlg(alg);
  if (!auf) return cleanAlg;

  const compensation = invertAlg(auf);
  const compensationMove = parseMove(compensation);
  if (!compensationMove) return `${compensation} ${cleanAlg}`.trim();

  let quarterTurns = compensationMove.q;
  let rest = cleanAlg;
  while (rest) {
    const tokenMatch = /^(\S+)(?:\s+|$)/.exec(rest);
    if (!tokenMatch) break;
    const move = parseMove(tokenMatch[1]);
    const isOuterU = move?.axis === 1 && move.layers.length === 1 && move.layers[0] === 1;
    if (!isOuterU) break;
    quarterTurns = (quarterTurns + move.q) % 4;
    rest = rest.slice(tokenMatch[0].length).trimStart();
  }

  const leadingU = quarterTurns === 3 ? "U" : quarterTurns === 2 ? "U2" : quarterTurns === 1 ? "U'" : "";
  return [leadingU, rest].filter(Boolean).join(" ");
}

const SCRAMBLE_FACES = ["U", "D", "F", "B", "R", "L"];
const SCRAMBLE_AXIS: Record<string, number> = { U: 1, D: 1, F: 2, B: 2, R: 0, L: 0 };
const SUFFIX = ["", "'", "2"];

/** Random-move scramble (no two consecutive moves on the same axis). */
export function randomScramble(length = 22): string {
  const out: string[] = [];
  let lastAxis = -1;
  while (out.length < length) {
    const f = SCRAMBLE_FACES[Math.floor(Math.random() * 6)];
    if (SCRAMBLE_AXIS[f] === lastAxis) continue;
    lastAxis = SCRAMBLE_AXIS[f];
    out.push(f + SUFFIX[Math.floor(Math.random() * 3)]);
  }
  return out.join(" ");
}

/** Pretty print an algorithm: normalised spacing, parentheses preserved. */
export function formatAlg(alg: string): string {
  return alg.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
}

/** Is the sticker currently in `slot` part of a last-layer (U) piece by origin? */
export const originInULayer = (state: CubeState, slot: number): boolean => SLOTS[state[slot]].p[1] === 1;
/** Is `slot` physically in the U layer? */
export const slotInULayer = (slot: number): boolean => SLOTS[slot].p[1] === 1;
