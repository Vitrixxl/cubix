import type { Alg } from 'cubing/alg';
import { Move } from 'cubing/alg';
import type { KPattern, KPuzzle, KTransformation } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { FACE_HEX, MINX_HEX } from '../src/shared/cubeAppearance';
import { applyAlg, colorOf, slotsFor, solved, type SlotGeometry } from '../src/shared/cube';

/** cubing.js's sticker colours, mapped onto the app's softened palette (`FACE_HEX`, `MINX_HEX`). */
const SOFT: Record<string, number> = {
  white: FACE_HEX.D, '#ffffff': FACE_HEX.D, yellow: FACE_HEX.U, '#f4f400': FACE_HEX.U, red: FACE_HEX.R, '#ff0000': FACE_HEX.R,
  orange: FACE_HEX.L, '#ff8000': FACE_HEX.L, limegreen: FACE_HEX.B, '#44ee00': FACE_HEX.B, '#26f': FACE_HEX.F, '#2266ff': FACE_HEX.F,
  '#008800': MINX_HEX.F, '#8800dd': MINX_HEX.L, '#0000ff': MINX_HEX.BR, '#ff66cc': MINX_HEX.DBR, '#99ff00': MINX_HEX.B,
  '#3399ff': MINX_HEX.DL, '#e8d0a0': MINX_HEX.DR, '#888888': MINX_HEX.D,
};
const soft = (fill: string) => fill.toLowerCase() in SOFT ? `#${SOFT[fill.toLowerCase()]!.toString(16).padStart(6, '0')}` : fill;

/** Each sticker's colour at a puzzle pattern, by the sticker ids of cubing.js's SVG template. */
const templateColors = new Map<string, Map<string,string>>();
export function stickerColors(template: string, pattern: KPattern): Map<string,string> {
  let colors = templateColors.get(template);
  if (!colors) {
    templateColors.set(template, colors = new Map());
    for (const match of template.matchAll(/<[^>]+\bid="([\w]+-l\d+-o\d+)"[^>]*>/g)) {
      colors.set(match[1], soft(/\bstyle="[^"]*fill:\s*([^;"\s]+)/.exec(match[0])?.[1] ?? 'none'));
    }
  }
  const targetColors = new Map<string,string>();
  for (const orbit of pattern.kpuzzle.definition.orbits) {
    const data = pattern.patternData[orbit.orbitName];
    for (let i=0;i<orbit.numPieces;i++) for(let o=0;o<orbit.numOrientations;o++) {
      const from = `${orbit.orbitName}-l${data.pieces[i]}-o${(o-data.orientation[i]+orbit.numOrientations)%orbit.numOrientations}`;
      if (colors.has(from)) targetColors.set(`${orbit.orbitName}-l${i}-o${o}`,colors.get(from)!);
    }
  }
  return targetColors;
}

/** Render cubing.js's sticker-addressed SVG template at an exact puzzle pattern. */
export function renderPatternSvg(template: string, pattern: KPattern): string {
  const targetColors = stickerColors(template, pattern);
  return template.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/g,'').replace(/<[^>]+\b(?:id|data-copy-id)="([\w]+-l\d+-o\d+)"[^>]*>/g,(tag,id) => {
    const fill=`fill:${targetColors.get(id) ?? 'none'}`;
    return /\bstyle="/.test(tag) ? tag.replace(/\bstyle="[^"]*"/,`style="${fill}"`) : tag.replace(/\s*\/?\s*>$/, (end:string)=>` style="${fill}"${end}`);
  });
}

/** KPuzzle alone allows cuts through corners; enforce Square-1's bandaging too. */
export function assertLegalSquare1(start: KPattern, alg: Alg): void {
  const cornerPairs = [[0,1],[3,4],[6,7],[9,10],[13,14],[16,17],[19,20],[22,23]];
  let pattern=start;
  for (const node of alg.experimentalExpand()) {
    if (!(node instanceof Move)) continue;
    if (node.family === '_SLASH_') {
      const pieces=pattern.patternData.WEDGES.pieces;
      for(const [a,b] of [[5,6],[11,0],[17,18],[23,12]]) {
        if(cornerPairs.some(pair=>pair.includes(pieces[a])&&pair.includes(pieces[b])))throw Error(`Square-1 cuts a corner before ${node} in ${alg}`);
      }
    }
    pattern=pattern.applyMove(node);
  }
}

/** The 24 ways to hold a cube-shaped puzzle, as rotations: no rotation first. */
export const HOLDS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap(a => ['', 'y', 'y2', "y'"].map(b => `${a} ${b}`.trim()));

/** A cubing.js puzzle, with what its stickers look like at a pattern: centres and wings of one colour look alike. */
export interface Kit { kp: KPuzzle; solved: KPattern; svg: string; look(pattern: KPattern): string }
const kits = new Map<string, Promise<Kit>>();
export function kit(twisty: string): Promise<Kit> {
  let k = kits.get(twisty);
  if (!k) kits.set(twisty, k = (async () => {
    const kp = await puzzles[twisty]!.kpuzzle(), svg = await puzzles[twisty]!.svg();
    return { kp, svg, solved: kp.defaultPattern(), look: (pattern: KPattern) => [...stickerColors(svg, pattern).values()].join() };
  })());
  return k;
}

/** `n` turns of a face, a full turn being `mod` of them: R2' on the megaminx, R' on the pyraminx and skewb. */
export function turn(face: string, n: number, mod: number): string {
  n = ((n % mod) + mod) % mod;
  if (!n) return '';
  if (mod === 3) return n === 1 ? face : `${face}'`;
  if (mod === 4) return [face, `${face}2`, `${face}'`][n - 1]!;
  return [face, `${face}2`, `${face}2'`, `${face}'`][n - 1]!;
}
/** An algorithm followed by a turn of a face, merged into its last turn when that one turns the same face. */
export function thenTurn(alg: string, face: string, n: number, mod: number): string {
  const tokens = alg.trim().split(/\s+/), last = /^([A-Za-z]+)(\d*)('?)$/.exec(tokens.at(-1) ?? '');
  if (last?.[1] === face) {
    tokens.pop();
    n += Number(last[2] || 1) * (last[3] ? -1 : 1);
  }
  return [...tokens, turn(face, n, mod)].filter(Boolean).join(' ');
}

/** A Square-1 algorithm in cubing.js's notation, `1,0 / -1,0` as `(1,0) / (-1,0)`: adjacent turns merged, each in -5…6. */
export function square1Alg(alg: string): string {
  const out: (string | [number, number])[] = [];
  for (const [token, a, b] of alg.matchAll(/\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?|\//g)) {
    const last = out.at(-1);
    if (token === '/') out.push('/');
    else if (Array.isArray(last)) out[out.length - 1] = [last[0] + Number(a), last[1] + Number(b)];
    else out.push([Number(a), Number(b)]);
  }
  const wrap = (n: number) => ((((n + 5) % 12) + 12) % 12) - 5;
  return out.map(t => typeof t === 'string' ? t : [wrap(t[0]), wrap(t[1])] as [number, number]).filter(t => typeof t === 'string' || t[0] || t[1]).map(t => typeof t === 'string' ? t : `(${t[0]},${t[1]})`).join(' ');
}

/**
 * A skewb algorithm turning any of the eight corners (cubing.js's R L U B F D UR UL) rewritten with the WCA turns the
 * app plays, R U L B, and as few rotations as can be: the puzzle is rotated before a turn of another corner, so that
 * corner sits where a WCA one does. The rotations written in the source are only followed, never needed.
 */
export function skewbWca(kp: KPuzzle, alg: string): string {
  const T = (a: string) => kp.algToTransformation(a), wca = ['R', "R'", 'U', "U'", 'L', "L'", 'B', "B'"].map(w => [w, T(w)] as const);
  const holds = HOLDS.map(h => [h, T(h)] as const).sort((a, b) => a[0].length - b[0].length);
  const same = (a: KTransformation, b: KTransformation) => ['CORNERS', 'CENTERS'].every(o => a.transformationData[o]!.permutation.every((v, i) => v === b.transformationData[o]!.permutation[i]
    && (o === 'CENTERS' || a.transformationData[o]!.orientationDelta[i] === b.transformationData[o]!.orientationDelta[i])));
  const frameOf = (t: KTransformation) => holds.findIndex(([, r]) => same(r, t));
  // Each way the puzzle may be held now (an index of `holds`): the fewest rotations written to get there, and the turns.
  let ways = new Map<number, { cost: number; out: string[] }>([[0, { cost: 0, out: [] }]]);
  for (const token of alg.trim().split(/\s+/)) {
    const move = T(token), next = new Map<number, { cost: number; out: string[] }>();
    const keep = (frame: number, way: { cost: number; out: string[] }) => { if (!(next.get(frame)!?.cost <= way.cost)) next.set(frame, way); };
    for (const [frame, way] of ways) {
      const held = holds[frame]![1];
      if (/^[xyz]/.test(token)) { keep(frameOf(move.invert().applyTransformation(held)), way); continue; }
      for (const [h, r] of holds) {
        const turned = held.applyTransformation(r), seen = turned.invert().applyTransformation(move).applyTransformation(turned);
        const w = wca.find(([, t]) => same(t, seen));
        if (w) keep(frameOf(turned), { cost: way.cost + (h ? 1 : 0), out: [...way.out, h, w[0]] });
      }
    }
    if (!next.size) throw Error(`No WCA turn for ${token} in ${alg}`);
    ways = next;
  }
  const best = [...ways.values()].sort((a, b) => a.cost - b.cost)[0]!;
  // Rotations in a row, written as the shortest one.
  const merged = best.out.filter(Boolean).reduce((a, t) => /^[xyz]/.test(t) ? `${a} ${t}` : thenTurn(a, t[0]!, t.endsWith("'") ? -1 : 1, 3), '');
  return merged.replace(/[xyz]['2]?(?: [xyz]['2]?)*/g, run => holds.find(([, r]) => r.isIdentical(T(run)))![0]).replace(/\s+/g, ' ').trim();
}

/**
 * What a big-cube case leaves undone, on the app's own cube model: the edges not paired (an edge's stickers of more than
 * one colour on a face), the faces whose centres are mixed, and whether, held the way that leaves the fewest stickers
 * wrong, every wrong sticker lies on the sides of the top layer (a PLL case).
 */
export function unsolved(size: number, setup: string) {
  const slots = slotsFor(size), h = (size - 1) / 2, start = applyAlg(solved(size), setup);
  const outer = (s: SlotGeometry) => s.p.filter(v => Math.abs(v) === h).length;
  const colours = new Map<string, Set<string>>();
  slots.forEach((s, i) => {
    if (outer(s) === 3) return;
    const key = outer(s) === 1 ? `centre ${s.face}` : `edge ${s.p.map(v => Math.abs(v) === h ? v : 0).join()}`;
    const face = `${key} ${s.face}`;
    if (!colours.has(face)) colours.set(face, new Set());
    colours.get(face)!.add(colorOf(start, i));
  });
  const mixed = [...colours].filter(([, c]) => c.size > 1).map(([k]) => k.split(' ').slice(0, 2).join(' '));
  let wrong: SlotGeometry[] = [];
  for (const hold of HOLDS) {
    const state = applyAlg(start, hold), list = slots.filter((s, i) => colorOf(state, i) !== s.face);
    if (!hold || list.length < wrong.length) wrong = list;
  }
  return {
    stickers: wrong.length,
    edges: new Set(mixed.filter(k => k.startsWith('edge'))).size,
    centres: new Set(mixed.filter(k => k.startsWith('centre'))).size,
    pll: wrong.every(s => s.p[1] === h && s.face !== 'U'),
  };
}
