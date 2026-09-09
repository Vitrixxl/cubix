import type { CubeSize } from "./puzzles";
export const SCRAMBLE_LENGTHS: Record<CubeSize, number> = { 2: 11, 3: 22, 4: 40, 5: 60, 6: 80, 7: 100 };
function randomInt(max: number) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}
/** Practice random-move scrambles, not competition random-state scrambles. */
export function randomCubeScramble(size: CubeSize): string {
  const faces = size === 2 ? ["R", "U", "F"] : ["R", "L", "U", "D", "F", "B"];
  const result: string[] = [];
  let previousAxis = -1;
  while (result.length < SCRAMBLE_LENGTHS[size]) {
    const face = faces[randomInt(faces.length)];
    const axis = "RL".includes(face) ? 0 : "UD".includes(face) ? 1 : 2;
    if (axis === previousAxis) continue;
    previousAxis = axis;
    const width = 1 + randomInt(Math.floor(size / 2));
    result.push((width === 1 ? face : `${width === 2 ? "" : width}${face}w`) + ["", "'", "2"][randomInt(3)]);
  }
  return result.join(" ");
}
