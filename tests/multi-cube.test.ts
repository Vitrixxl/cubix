import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlgText } from "../src/frontend/components/AlgorithmList";
import { expect, test } from "bun:test";
import { applyAlg, colorOf, combineAuf, compensateAuf, invertAlg, parseAlg, parseMove, reorientAlgY2, slotsFor, solved } from "../src/shared/cube";
import { CUBE_SIZES, puzzleOf, puzzleId } from "../src/shared/puzzles";
import { randomCubeScramble, SCRAMBLE_LENGTHS } from "../src/shared/scramble";
import { cases, sets } from "../src/frontend/local/catalog";
import extra from "../data/multi-cube.json";

test("every cube has a distinct catalogue and playable random-move scrambles", () => {
  expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
  for (const size of CUBE_SIZES) {
    const catalog = cases.filter(c => puzzleOf(c) === puzzleId(size));
    expect(catalog.length).toBeGreaterThan(0);
    for (const set of sets.filter(s => puzzleOf(s) === puzzleId(size))) expect(catalog.filter(c => c.set === set.id)).toHaveLength(set.count);
    for (let attempt = 0; attempt < 12; attempt++) {
      const alg = randomCubeScramble(size), moves = parseAlg(alg, size);
      expect(moves).toHaveLength(SCRAMBLE_LENGTHS[size]);
      expect(moves.every((m, i) => !i || m.axis !== moves[i - 1].axis)).toBe(true);
      const state = applyAlg(solved(size), alg);
      expect(new Set(state).size).toBe(6 * size * size);
      expect(applyAlg(state, invertAlg(alg))).toEqual(solved(size));
    }
  }
});

test("inner and wide turns have the right depth, including 7×7 sticker indices above 255", () => {
  expect(solved(7)[293]).toBe(293);
  expect(parseMove("8Rw", 7)).toBeNull();
  for (const size of CUBE_SIZES) {
    for (let depth = 2; depth <= size; depth++) {
      expect(applyAlg(solved(size), `${depth}Rw`)).toEqual(applyAlg(solved(size), `R ${Array.from({ length: depth - 1 }, (_, i) => `${i + 2}R`).join(" ")}`));
    }
    expect(applyAlg(solved(size), `${size}Rw`)).toEqual(applyAlg(solved(size), "x"));
    const alg = size > 3 ? "3Rw U2 2L' F 2U x'" : "R U2 L' F x'";
    expect(applyAlg(solved(size), reorientAlgY2(alg))).toEqual(applyAlg(solved(size), `y2 ${alg} y2`));
  }
});

test("all new drills solve their displayed setup, including random AUF", () => {
  for (const c of extra.cases) {
    const size = c.cube_size;
    for (const auf of ["", "U", "U2", "U'"]) {
      const start = applyAlg(solved(size), combineAuf(c.setup, auf));
      const end = applyAlg(start, compensateAuf(c.algorithms[0].alg, auf));
      expect(end, c.id).toEqual(solved(size));
    }
    if (c.stage === "Centers") {
      const state = applyAlg(solved(size), c.setup);
      const changed = slotsFor(size).flatMap((g, i) => colorOf(state, i) !== g.face ? [g] : []);
      expect(changed, c.id).toHaveLength(3);
      expect(changed.every(g => g.p.filter(v => Math.abs(v) === (size - 1) / 2).length === 1)).toBe(true);
    }
    if (c.name.startsWith("Wing parity")) {
      const state = applyAlg(solved(size), c.setup);
      const changed = slotsFor(size).flatMap((g, i) => colorOf(state, i) !== g.face ? [g] : []);
      expect(changed, c.id).toHaveLength(4);
      expect(changed.every(g => g.p.filter(v => Math.abs(v) === (size - 1) / 2).length === 2)).toBe(true);
    }
  }
});

test("reduced CFOP setups and every solution behave exactly like their verified 3×3 originals", () => {
  const base = new Map(cases.filter(c => puzzleOf(c) === "333").map(c => [c.id, c]));
  for (const size of [4, 5, 6, 7] as const) {
    for (const c of cases.filter(c => puzzleOf(c) === puzzleId(size) && base.has(c.id.slice(4)))) {
      const original = base.get(c.id.slice(4))!;
      const check = (alg: string, originalAlg: string) => {
        const large = applyAlg(solved(size), alg), small = applyAlg(solved(), originalAlg);
        const axis = (i: number) => i === 0 ? 0 : i === size - 1 ? 2 : 1;
        const matches = large.every((_, i) => {
          const face = Math.floor(i / (size * size)), cell = i % (size * size);
          return colorOf(large, i) === colorOf(small, face * 9 + axis(Math.floor(cell / size)) * 3 + axis(cell % size));
        });
        expect(matches, `${c.id}: ${alg}`).toBe(true);
      };
      check(c.setup, original.setup);
      c.algorithms.forEach((a, i) => check(`${c.setup} ${a.pre_auf ?? ""} ${a.alg}`, `${original.setup} ${original.algorithms[i].pre_auf ?? ""} ${original.algorithms[i].alg}`));
    }
  }
});

test("numbered inner and wide moves stay together when notation wraps", () => {
  const markup = renderToStaticMarkup(createElement(AlgText, { alg: "3Rw2 2R' (6Rw U2)2" }));
  for (const token of ["3Rw2", "2R'", "6Rw", "U2"]) {
    const encoded = token.replaceAll("'", "&#x27;");
    expect(markup).toContain(`<span class="alg-move">${encoded}</span>`);
  }
});
