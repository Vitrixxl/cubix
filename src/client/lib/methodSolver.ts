/**
 * Every 3×3 course of Learn (src/shared/methods.ts) played from any cube, for the assisted solve: the turns of each
 * step, part by part, with the course's algorithms where it has them. The cube stays held yellow on top, green in
 * front, from start to end: a part turns outer faces only, as a smart cube reports them, so a rotation or a slice turn
 * of a method (CFOP's y, Roux's M) becomes the faces it turns on the cube as held (M is R L', the next turns renamed).
 *
 * Beginner: beginnerSolver.ts. CFOP: cfopSolver.ts with 2-look OLL and PLL, the course teaching them first. ZZ: the
 * optimal edge orientation, then the line, the two blocks with R, U and L, then 2-look OLL's corners and PLL. Roux:
 * the two blocks, CMLL from the catalogue, and the last six edges with M and U (orientation, the left and right edges,
 * the middle slice). Blocks and edges are found piece group by piece group with short searches over a few tracked
 * pieces, each guided by small tables of the distance of up to three pieces from home.
 */
import { applyAlg, FACES, movePermutation, parseAlg, parseMove, SLOTS, type CubeState, type Face } from "../../shared/cube";
import { METHODS } from "../../shared/methods";
import { msg } from "../i18n/msg";
import { solveBeginner, type BeginnerPart } from "./beginnerSolver";
import { solveCfop } from "./cfopSolver";
import { allDone, AUF, colours, faceMap, mergeTurns, pairsDone, playable, type CatalogCase } from "./solveAnalysis";

/** A part of the plan: its step, an index into the course's steps. */
export type MethodPart = BeginnerPart;

/** The courses whose assisted solve is planned here, and how many of their steps it plays (not CFOP's going further). */
const PLAYED: Record<string, number> = { beginner: 6, cfop: 4, roux: 4, zz: 3 };
export const assisted = (puzzle: string, methodId: string) => puzzle === "333" && methodId in PLAYED;
/** A course of the assisted solve and the steps it plays. */
export function assistedCourse(methodId: string) {
  const method = METHODS["333"].find((m) => m.id === methodId && m.id in PLAYED) ?? METHODS["333"].find((m) => m.id === "beginner")!;
  return { method, steps: method.steps.slice(0, PLAYED[method.id]) };
}

/** The stickers of each piece, by its place. */
const AT = new Map<string, number[]>();
SLOTS.forEach((slot, i) => AT.set(slot.p.join(), [...(AT.get(slot.p.join()) ?? []), i]));
const NORMAL = Object.fromEntries(FACES.map((face, i) => [face, SLOTS[i * 9]!.n])) as unknown as Record<Face, readonly number[]>;
/** The place of the piece of these faces ("DFR"). */
const place = (faces: string) => [0, 1, 2].map((axis) => [...faces].reduce((sum, face) => sum + NORMAL[face as Face][axis]!, 0)).join();
/** The sticker of a piece on its first face, where it is home: it stands for the piece in searches. */
const sticker = (faces: string) => AT.get(place(faces))!.find((slot) => SLOTS[slot]!.face === faces[0])!;

/**
 * The cube with each sticker numbered by the place it belongs to, from its colours read against the centres (a cube
 * read by the camera numbers stickers by colour only); null for colours no cube has.
 */
function canonical(state: CubeState): CubeState | null {
  const c = colours(state),
    faceOf = new Map(FACES.map((face, i) => [c[i * 9 + 4], face])),
    out = new Uint16Array(54);
  for (const slots of AT.values()) {
    const faces = slots.map((slot) => faceOf.get(c[slot]!)),
      home = faces.every(Boolean) ? AT.get(place(faces.join(""))) : undefined;
    for (const [i, slot] of slots.entries()) {
      const origin = home?.find((s) => SLOTS[s]!.face === faces[i]);
      if (origin === undefined) return null;
      out[slot] = origin;
    }
  }
  return out;
}

const ALL = [..."UDFBRL"].flatMap((face) => [face, face + "'", face + "2"]);
const RU = ALL.filter((t) => "RU".includes(t[0]!)),
  RUL = ALL.filter((t) => "RUL".includes(t[0]!)),
  RUM = [...RU, "M", "M'", "M2"],
  MU = ["M", "M'", "M2", "U", "U'", "U2"],
  /** The turns that keep every edge oriented the ZZ way. */
  KEEP_EO = ALL.filter((t) => "UDRL".includes(t[0]!) || t.endsWith("2"));
const PERMS = new Map<string, Uint16Array>();
const perm = (turn: string) => PERMS.get(turn) ?? PERMS.set(turn, movePermutation(parseMove(turn)!)).get(turn)!;
/** Turns about one axis commute: they are tried in one order only, never one face twice in a row. */
const AXIS: Record<string, number> = { R: 0, M: 0, L: 0, U: 1, D: 1, F: 2, B: 2 },
  RANK: Record<string, number> = { R: 0, M: 1, L: 2, U: 0, D: 1, F: 0, B: 1 };
const follows = (last: string, turn: string) => AXIS[last[0]!] !== AXIS[turn[0]!] || RANK[last[0]!]! < RANK[turn[0]!]!;
const code = (pos: readonly number[]) => pos.reduce((sum, p) => sum * 54 + p, 0);

/** How many of `turns` bring up to three pieces (their stickers' places) home, from every place they can reach; built once. */
const TABLES = new Map<string, Uint8Array>();
function table(origins: number[], turns: string[]) {
  const id = `${origins}|${turns}`;
  let dist = TABLES.get(id);
  if (dist) return dist;
  dist = new Uint8Array(54 ** origins.length).fill(255);
  dist[code(origins)] = 0;
  const perms = turns.map(perm);
  for (let frontier = [origins], d = 1; frontier.length; d++) {
    const next: number[][] = [];
    for (const pos of frontier)
      for (const p of perms) {
        const moved = pos.map((s) => p[s]!),
          k = code(moved);
        if (dist[k] === 255) (dist[k] = d), next.push(moved);
      }
    frontier = next;
  }
  TABLES.set(id, dist);
  return dist;
}

/** The fewest of `turns` (at most `max`) taking the tracked stickers from `start` to `goal`; `h` never overestimates. */
function search(start: number[], turns: string[], goal: (pos: number[]) => boolean, h: (pos: number[]) => number, max: number): string[] | null {
  const path: string[] = [],
    perms = turns.map((t) => [t, perm(t)] as const);
  const dive = (pos: number[], left: number): boolean => {
    if (goal(pos)) return true;
    if (!left || h(pos) > left) return false;
    const last = path.at(-1);
    for (const [turn, p] of perms) {
      if (last && !follows(last, turn)) continue;
      path.push(turn);
      if (dive(pos.map((s) => p[s]!), left - 1)) return true;
      path.pop();
    }
    return false;
  };
  for (let depth = 0; depth <= max; depth++) if (dive(start, depth)) return path;
  return null;
}

/**
 * Pieces solved group after group with `turns`, those of the groups before kept: each call the shortest turns for the
 * next group (pieces by their faces, three at most), or null.
 */
function builder(turns: string[]) {
  const tracked: number[] = [],
    guides: { at: number[]; dist: Uint8Array }[] = [];
  return (state: CubeState, pieces: string[]) => {
    const origins = pieces.map(sticker);
    for (const o of origins) if (!tracked.includes(o)) tracked.push(o);
    guides.push({ at: origins.map((o) => tracked.indexOf(o)), dist: table(origins, turns) });
    const found = search(
      tracked.map((o) => state.indexOf(o)),
      turns,
      (pos) => pos.every((p, i) => p === tracked[i]),
      (pos) => guides.reduce((most, g) => Math.max(most, g.dist[code(g.at.map((i) => pos[i]!))]!), 0),
      20,
    );
    return found && found.join(" ");
  };
}

/**
 * ZZ's edge orientation: each edge's place read by its sticker that shows the top or bottom colour of an oriented edge
 * (the front or back colour in the middle layer), a table of the 2048 orientations for the shortest way, built once.
 */
const EDGE_PLACES = [...AT.values()].filter((slots) => slots.length === 2);
const GOOD = EDGE_PLACES.map((slots) => slots.find((s) => (SLOTS[s]!.p[1] ? "UD" : "FB").includes(SLOTS[s]!.face))!),
  IS_GOOD = new Set(GOOD);
let eo: { dist: Uint8Array; next: (mask: number, turn: number) => number } | undefined;
function eoSolver() {
  if (eo) return eo;
  const edgeOf = new Map(EDGE_PLACES.flatMap((slots, i) => slots.map((s) => [s, i] as const)));
  const moves = ALL.map((t) => GOOD.map((g) => ({ to: edgeOf.get(perm(t)[g]!)!, flip: IS_GOOD.has(perm(t)[g]!) ? 0 : 1 })));
  const next = (mask: number, turn: number) => moves[turn]!.reduce((out, { to, flip }, i) => out | ((((mask >> i) & 1) ^ flip) << to), 0);
  const dist = new Uint8Array(4096).fill(255);
  dist[0] = 0;
  for (let frontier = [0], d = 1; frontier.length; d++) {
    const following: number[] = [];
    for (const mask of frontier)
      for (let t = 0; t < ALL.length; t++) {
        const moved = next(mask, t);
        if (dist[moved] === 255) (dist[moved] = d), following.push(moved);
      }
    frontier = following;
  }
  return (eo = { dist, next });
}
function orientEdges(state: CubeState) {
  const { dist, next } = eoSolver(),
    out: string[] = [];
  let mask = GOOD.reduce((m, g, i) => m | ((IS_GOOD.has(state[g]!) ? 0 : 1) << i), 0);
  while (dist[mask]! > 0 && dist[mask]! < 255) {
    const t = ALL.findIndex((_, t) => dist[next(mask, t)] === dist[mask]! - 1);
    mask = next(mask, t);
    out.push(ALL[t]!);
  }
  return dist[mask] ? null : out.join(" ");
}

/** Turns of an algorithm, rotations aside. */
const length = (alg: string) => alg.split(/\s+/).filter((t) => t && !/^[xyz]/.test(t)).length;
const join = (...moves: string[]) => moves.filter(Boolean).join(" ");
const PARSED = new Map<string, ReturnType<typeof parseAlg>>();
const play = (state: CubeState, alg: string) => applyAlg(state, PARSED.get(alg) ?? PARSED.set(alg, parseAlg(alg)).get(alg)!);
const home = (state: CubeState, origins: number[]) => origins.every((o) => state[o] === o);

/** The shortest of the catalogue's algorithms of `set` (after a turn of the top) after which `ok` holds, with its case. */
function catalogue(state: CubeState, cases: CatalogCase[], set: string, ok: (after: CubeState) => string | undefined) {
  let best: { alg: string; name: string; source: string } | null = null;
  for (const auf of AUF) {
    const from = auf ? play(state, auf) : state;
    for (const known of cases)
      if (known.set === set)
        for (const { alg: source } of known.algorithms.slice(0, 4)) {
          const alg = playable(source),
            after = alg && play(from, alg),
            end = after && ok(after);
          if (end === undefined || end === null) continue;
          const full = join(auf, alg!, end);
          if (!best || length(full) < length(best.alg)) best = { alg: full, name: known.name, source };
        }
  }
  return best;
}

const ROUX_BLOCKS = ["DL", "DFL", "FL", "DBL", "BL", "DR", "DFR", "FR", "DBR", "BR"].map(sticker),
  TOP = ["UFL", "UFR", "UBL", "UBR"].map(sticker),
  /** The last six edges by their top or bottom sticker, the top centre (how far M is turned) and a top corner. */
  LSE = [...["UF", "UB", "UL", "UR", "DF", "DB"].map(sticker), 4, sticker("UFL")];
/** The last six edges oriented as Roux reads them: with the centres a quarter off, those of the M slice the other way. */
const oriented = (pos: number[]) => {
  const odd = "FB".includes(SLOTS[pos[6]!]!.face);
  return pos.slice(0, 6).every((s) => "UD".includes(SLOTS[s]!.face) !== (odd && SLOTS[s]!.p[0] === 0));
};
/** These tracked stickers home after a turn of the top, the top corner with them. */
const aligned = (pos: number[], which: number[]) => AUF.some((u) => [...which, 7].every((i) => (u ? perm(u)[pos[i]!] : pos[i]) === LSE[i]));

/** The turns of `methodId`'s course from `start`, part by part; null when the cube cannot be solved (a scan gone wrong). */
export function solveMethod(methodId: string, start: CubeState, cases: CatalogCase[]): MethodPart[] | null {
  const beginner = solveBeginner(start);
  if (methodId === "beginner" || !beginner) return beginner;
  let state = canonical(start);
  if (!state) return null;
  const parts: MethodPart[] = [],
    // Which held face each face of the cube as the method sees it is, after its rotations and slice turns.
    seen: Record<Face, Face> = { U: "U", D: "D", F: "F", B: "B", R: "R", L: "L" };
  let held = start;
  const add = (step: number, label: string, alg: string | null, piece?: string, gesture?: string) => {
    if (alg === null) throw new Error("unsolved");
    const turns: string[] = [];
    for (const token of (playable(alg) ?? "").split(" ").filter(Boolean)) {
      if (/^[xyz]/.test(token)) {
        const map = faceMap([token]);
        for (const face of FACES) seen[face] = map[seen[face]];
      } else turns.push(FACES.find((face) => seen[face] === token[0])! + token.slice(1));
    }
    state = applyAlg(state!, alg);
    const moves = mergeTurns(turns).join(" ");
    if (!moves) return;
    held = applyAlg(held, moves);
    parts.push({ step, label, alg: moves, ...(piece && { piece: [...piece] as Face[] }), ...(gesture && { gesture: { alg: gesture, times: 1 } }) });
  };
  try {
    if (methodId === "cfop") {
      for (const { label, alg, case: known } of solveCfop(state, cases, { twoLook: true }) ?? []) {
        const step = label === "Cross" ? 0 : label.startsWith("F2L") ? 1 : label.startsWith("OLL") ? 2 : 3,
          before = pairsDone(colours(held));
        add(step, step ? (known?.name ?? (step === 1 ? msg("Take a pair out") : msg("Turn the top"))) : msg("Cross"), alg, undefined, known?.alg);
        const slot = step === 1 && pairsDone(colours(held)).find((s) => !before.includes(s));
        if (slot) parts.at(-1)!.piece = ["D", ...slot] as Face[];
      }
    } else if (methodId === "zz") {
      add(0, msg("Edge orientation"), orientEdges(state));
      const line = ["DF", "DB"].map(sticker);
      add(0, msg("Line"), search(line.map((o) => state!.indexOf(o)), KEEP_EO, (pos) => pos.every((p, i) => p === line[i]), (pos) => table(line, KEEP_EO)[code(pos)]!, 12)?.join(" ") ?? null);
      // The left block with L, U and R; the right one with R and U, which leave the left one be.
      const left = builder(RUL),
        right = builder(RU);
      add(1, msg("First block"), left(state, ["DL", "DFL", "FL"]), "DFL");
      add(1, msg("First block"), left(state, ["DL", "DBL", "BL"]), "DBL");
      add(1, msg("Second block"), right(state, ["DR", "DFR", "FR"]), "DFR");
      add(1, msg("Second block"), right(state, ["DR", "DBR", "BR"]), "DBR");
      for (const { alg, case: known } of solveCfop(state, cases, { twoLook: true, twoLookPll: false }) ?? []) add(2, known?.name ?? msg("Turn the top"), alg, undefined, known?.alg);
    } else if (methodId === "roux") {
      const first = builder(ALL),
        second = builder(RUM);
      add(0, msg("First block"), first(state, ["DL", "DFL", "FL"]), "DFL");
      add(0, msg("First block"), first(state, ["DL", "DBL", "BL"]), "DBL");
      add(1, msg("Second block"), second(state, ["DR", "DFR", "FR"]), "DFR");
      add(1, msg("Second block"), second(state, ["DR", "DBR", "BR"]), "DBR");
      // CMLL: the corners solved, the top turned last so they stand in place.
      const top = (after: CubeState) => (home(after, ROUX_BLOCKS) ? AUF.find((u) => home(u ? play(after, u) : after, TOP)) : undefined);
      const done = top(state);
      if (done !== undefined) add(2, msg("Turn the top"), done);
      else {
        const cmll = catalogue(state, cases, "cmll", top);
        add(2, cmll?.name ?? "CMLL", cmll?.alg ?? null, undefined, cmll?.source);
      }
      const at = (s: CubeState) => LSE.map((o) => s.indexOf(o));
      const eo = catalogue(state, cases, "lse-eo", (after) => (home(after, ROUX_BLOCKS) && AUF.some((u) => home(u ? play(after, u) : after, TOP)) && oriented(at(after)) ? "" : undefined));
      add(3, eo?.name ?? msg("Edge orientation"), eo?.alg ?? search(at(state), MU, oriented, () => 0, 12)?.join(" ") ?? null, undefined, eo?.source);
      add(3, msg("Left and right edges"), search(at(state), MU, (pos) => oriented(pos) && aligned(pos, [2, 3]), () => 0, 14)?.join(" ") ?? null);
      add(3, msg("Middle slice"), search(at(state), MU, (pos) => pos.every((p, i) => p === LSE[i]), () => 0, 14)?.join(" ") ?? null);
    } else return null;
  } catch {
    return null;
  }
  return allDone(colours(held)) ? parts : null;
}
