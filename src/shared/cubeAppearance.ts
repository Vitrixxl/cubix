import { colorOf, cubeSize, FACES, slotsFor, type CubeState, type Face } from './cube';

/**
 * What a case shows: the whole cube, a last-layer stage (`EO` the top edges alone: the yellow cross), the first two
 * layers, or the first layer alone (`F1L`, with the side centres). `CMLL` shows the top corners alone, the M slice left grey.
 */
export type CubeMask = 'full' | 'OLL' | 'EO' | 'PLL' | 'CMLL' | 'F2L' | 'F1L';
// Fixed viewing references: blue front, red right, yellow top.
// Softened to sit with the app's warm palette, same hue for each face.
export const FACE_HEX: Record<Face, number> = {
  U: 0xf5dc72, D: 0xefe9e1, F: 0x6f9be6, B: 0x5cc98a, R: 0xe3666b, L: 0xf8a258,
};
/** The megaminx's twelve faces (WCA scheme, opposite faces paired light and dark), softened like `FACE_HEX`. */
export const MINX_HEX = {
  U: FACE_HEX.D, F: 0x3f9f6c, R: FACE_HEX.R, BR: 0x557bd0, BL: FACE_HEX.U, L: 0x9d7ae0,
  D: 0x9a9aa3, DR: 0xf3e6a6, DBR: 0xeea3cf, B: 0x9ed87e, DBL: FACE_HEX.L, DL: 0x8fcdee,
};
/** The colours of a real cube's stickers, what a camera sees (cubeScan), held as `HELD_HEX`: not the softened ones. */
export const REAL_HELD_HEX: Record<Face, number> = {
  U: 0xffe62a, D: 0xece8e2, F: 0x1abe57, B: 0x3d7ce0, R: 0xff801f, L: 0xeb4242,
};
/** A scramble is applied white on top, green in front, then the cube is turned over (z2): yellow on top, green in front, orange right. */
export const HELD_HEX: Record<Face, number> = {
  U: FACE_HEX.U, D: FACE_HEX.D, F: FACE_HEX.B, B: FACE_HEX.F, R: FACE_HEX.L, L: FACE_HEX.R,
};
export const FACE_COLORS = Object.fromEntries(FACES.map(f => [f, `#${FACE_HEX[f].toString(16).padStart(6, '0')}`])) as Record<Face, string>;
// Neutral stickers remain readable against both light and dark app backgrounds.
export const GREY = 0x6e6e78;
const DIM = 0x4c4c56;

/** A held cube's colours by sticker (Cubix's order, as in a solved `CubeScene`), `null` for a sticker not known: grey. */
export const heldColors = (stickers: readonly (Face | null)[]) => stickers.map(f => (f ? HELD_HEX[f] : GREY));

/** Assign colours to physical stickers once, using the final centre orientation.
 * The same colours follow those stickers throughout the animation. A `held` scramble (see `parseScramble`)
 * keeps the colours where the scramble put them, in the held palette.
 */
export function stickerColors(final: CubeState, mask: CubeMask, held = false): number[] {
  const size = cubeSize(final), area = size * size, slots = slotsFor(size), palette = held ? HELD_HEX : FACE_HEX;
  const faces = Object.fromEntries(FACES.map(f => [f, f])) as Record<Face, Face>;
  if (size >= 3 && !held) {
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
  const height = (origin: number) => slots[origin].p.reduce((v, p, i) => v + p * upNormal[i], 0);
  const originOnTop = (origin: number) => height(origin) === (size - 1) / 2;
  const center = (origin: number) => slots[origin].p.filter(v => Math.abs(v) === (size - 1) / 2).length === 1;
  const corner = (origin: number) => slots[origin].p.every(v => Math.abs(v) === (size - 1) / 2);
  const colors = new Array<number>(final.length);
  for (let slot = 0; slot < final.length; slot++) {
    const origin = final[slot], face = faces[colorOf(final, slot)];
    const top = slots[slot].p[1] === (size - 1) / 2;
    colors[origin] = mask === 'OLL' ? (face === 'U' ? palette.U : top ? GREY : DIM)
      : mask === 'EO' ? (face === 'U' && !corner(origin) ? palette.U : top ? GREY : DIM)
      : mask === 'PLL' ? (top ? palette[face] : DIM)
      : mask === 'CMLL' ? (top && (corner(origin) || center(origin)) ? palette[face] : top ? GREY : DIM)
      : mask === 'F2L' && originOnTop(origin) ? GREY
      : mask === 'F1L' && height(origin) !== -(size - 1) / 2 && !(center(origin) && !originOnTop(origin)) ? GREY
      : palette[face];
  }
  return colors;
}
