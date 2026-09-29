import { describe, expect, test } from 'bun:test';
import { cubeScene as cubePreview } from '../src/shared/cubeScene';
import { cases } from '../src/client/local/catalog';
import { applyAlg, applyMove, colorOf, solved, slotsFor } from '../src/shared/cube';
import { FACE_HEX, HELD_HEX, stickerColors } from '../src/shared/cubeAppearance';
import { maskForStage } from '../src/client/lib/caseState';

describe('native cube preview', () => {
  test('every catalogue cube uses the exact setup and valid sticker permutations', () => {
    for (const c of cases.filter(c => !c.diagram)) {
      const size = c.cube_size ?? 3;
      const scene = cubePreview(c.setup, size, maskForStage(c.stage));
      expect(scene.states.at(-1), c.id).toEqual(Array.from(applyAlg(solved(size), c.setup)));
      expect(scene.states.length).toBe(scene.moves.length + 1);
      expect(scene.colors).toHaveLength(6 * size * size);
      // The renderer must arrive continuously at the supplied next frame.
      for (let i = 0; i < scene.moves.length; i++) {
        expect(Array.from(applyMove(Uint16Array.from(scene.states[i]), scene.moves[i]))).toEqual(scene.states[i + 1]);
      }
    }
  });
  test('all 41 standard F2L cases have blue/red references, including rotated case 20', () => {
    for (const c of cases.filter(c => c.set === 'f2l')) {
      const scene = cubePreview(c.setup, 3, 'F2L');
      const state = scene.states.at(-1)!;
      expect(scene.colors[state[22]], c.id).toBe(FACE_HEX.F);
      expect(scene.colors[state[40]], c.id).toBe(FACE_HEX.R);
      const visible = [...state.slice(0, 9), ...state.slice(18, 27), ...state.slice(36, 45)];
      expect(visible.every(origin => [FACE_HEX.F, FACE_HEX.R, FACE_HEX.D, 0x6e6e78].includes(scene.colors[origin])), c.id).toBe(true);
    }
  });
  test('OLL highlights orientation only; PLL hides the lower layers', () => {
    const state = applyAlg(solved(), "R U R' U R U2 R'");
    const oll = stickerColors(state, 'OLL');
    expect(oll.filter(c => c === FACE_HEX.U)).toHaveLength(9);
    expect(oll.every(c => [FACE_HEX.U, 0x6e6e78, 0x4c4c56].includes(c))).toBe(true);
    const pll = stickerColors(state, 'PLL');
    for (const [slot, geometry] of slotsFor().entries()) {
      if (geometry.p[1] !== 1) expect(pll[state[slot]]).toBe(0x4c4c56);
    }
  });
  test('random AUF stays reflected in the displayed state', () => {
    const c = cases.find(c => c.id === 'F2L 20')!;
    for (const auf of ['', 'U', 'U2', "U'"]) {
      const setup = `${c.setup} ${auf}`;
      const scene = cubePreview(setup, 3, 'F2L');
      expect(scene.states.at(-1)).toEqual(Array.from(applyAlg(solved(), setup)));
    }
  });
  test('reduced even and odd cubes keep blue/red centre references', () => {
    for (const size of [4, 5, 6, 7]) {
      const c = cases.find(c => c.id === `${size}x${size} F2L 20`)!;
      const scene = cubePreview(c.setup, size, 'F2L');
      const state = scene.states.at(-1)!;
      const middle = Math.floor(size / 2) * size + Math.floor(size / 2);
      expect(scene.colors[state[2 * size * size + middle]]).toBe(FACE_HEX.F);
      expect(scene.colors[state[4 * size * size + middle]]).toBe(FACE_HEX.R);
    }
  });
  test('invalid notation is reported rather than displaying an unrelated cube', () => {
    expect(() => cubePreview('not a move', 3, 'full')).toThrow();
    expect(() => cubePreview('', 8, 'full')).toThrow();
  });
  test('scrambles are applied white on top, green in front, and shown turned over: yellow on top, green in front', () => {
    const shown = (scene: ReturnType<typeof cubePreview>) => scene.states.at(-1)!.map(origin => scene.colors[origin]);
    const solvedCube = shown(cubePreview('', 3, 'full', false, true)), area = 9;
    expect(solvedCube.slice(0, area).every(c => c === FACE_HEX.U)).toBe(true);
    expect(solvedCube.slice(2 * area, 3 * area).every(c => c === HELD_HEX.F && c === FACE_HEX.B)).toBe(true);
    expect(solvedCube.slice(4 * area, 5 * area).every(c => c === FACE_HEX.L)).toBe(true);
    for (const [size, scramble] of [[3, "R U' F2 D B' L2 U R2 F' D2"], [3, 'M E S x y z'], [2, "R U2 F' R2 U"], [4, "Rw U2 Fw' R2 Uw 3Rw2 D"], [5, 'Rw 3Uw2 L Bw D']] as const) {
      // Reference: the solved model (yellow on top, blue in front) rotated to white on top and green in front,
      // scrambled, then turned over with z2, coloured by where each sticker came from.
      const reference = applyAlg(solved(size), `x2 ${scramble} z2`);
      const scene = cubePreview(scramble, size, 'full', true, true);
      expect(shown(scene), scramble).toEqual(Array.from(reference, (_, slot) => FACE_HEX[colorOf(reference, slot)]));
      for (let i = 0; i < scene.moves.length; i++) {
        expect(Array.from(applyMove(Uint16Array.from(scene.states[i]), scene.moves[i]))).toEqual(scene.states[i + 1]);
      }
    }
  });
});
