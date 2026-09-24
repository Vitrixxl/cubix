import { colorOf, cubeSize, FACES, slotsFor, type CubeState, type Face } from './cube';

export type CubeMask = 'full' | 'OLL' | 'PLL' | 'F2L';
// Fixed viewing references: blue front, red right, yellow top.
export const FACE_HEX: Record<Face, number> = {
  U: 0xffe62a, D: 0xece8e2, F: 0x3d7ce0, B: 0x1abe57, R: 0xeb4242, L: 0xff801f,
};
export const FACE_COLORS = Object.fromEntries(FACES.map(f => [f, `#${FACE_HEX[f].toString(16).padStart(6, '0')}`])) as Record<Face, string>;
// Neutral stickers remain readable against both light and dark app backgrounds.
const GREY = 0x6e6e78;
const DIM = 0x4c4c56;

/** Assign colours to physical stickers once, using the final centre orientation.
 * The same colours follow those stickers throughout the animation.
 */
export function stickerColors(final: CubeState, mask: CubeMask): number[] {
  const size = cubeSize(final), area = size * size, slots = slotsFor(size);
  const faces = Object.fromEntries(FACES.map(f => [f, f])) as Record<Face, Face>;
  if (size >= 3) {
    const middle = Math.floor(size / 2) * size + Math.floor(size / 2);
    const centers = FACES.map((_, i) => colorOf(final, i * area + middle));
    // Even cubes have centre blocks rather than a single fixed centre. A
    // reduced case has six uniform blocks; a general scramble may not.
    const uniform = size % 2 === 1 || FACES.every((_, face) =>
      Array.from({ length: (size - 2) ** 2 }, (_, i) => {
        const row = 1 + Math.floor(i / (size - 2)), col = 1 + i % (size - 2);
        return colorOf(final, face * area + row * size + col) === centers[face];
      }).every(Boolean));
    if (uniform && new Set(centers).size === 6) {
      for (const [i, face] of FACES.entries()) faces[centers[i]] = face;
    }
  }
  const up = FACES.find(f => faces[f] === 'U')!;
  const upNormal = slots[FACES.indexOf(up) * area].n;
  const originOnTop = (origin: number) => slots[origin].p.reduce((v, p, i) => v + p * upNormal[i], 0) === (size - 1) / 2;
  const colors = new Array<number>(final.length);
  for (let slot = 0; slot < final.length; slot++) {
    const origin = final[slot], face = faces[colorOf(final, slot)];
    const top = slots[slot].p[1] === (size - 1) / 2;
    colors[origin] = mask === 'OLL' ? (face === 'U' ? FACE_HEX.U : top ? GREY : DIM)
      : mask === 'PLL' ? (top ? FACE_HEX[face] : DIM)
      : mask === 'F2L' && originOnTop(origin) ? GREY : FACE_HEX[face];
  }
  return colors;
}
