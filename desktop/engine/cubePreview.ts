import { applyMove, parseAlg, solved } from '../../src/shared/cube';
import { stickerColors, type CubeMask } from '../../src/shared/cubeAppearance';

/** GPUI consumes the exact shared permutations; no second move parser in Rust. */
export function cubePreview(setup: string, size: number, mask: CubeMask, animated = true) {
  if (!Number.isInteger(size) || size < 2 || size > 7) throw new Error('Unsupported cube size');
  const moves = parseAlg(setup, size);
  let state = solved(size);
  const states = [Array.from(state)];
  for (const move of moves) {
    state = applyMove(state, move);
    if (animated) states.push(Array.from(state));
  }
  return { size, colors: stickerColors(state, mask), states: animated ? states : [Array.from(state)], moves: animated ? moves : [] };
}
