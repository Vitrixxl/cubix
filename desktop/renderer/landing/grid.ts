/**
 * The ground of the landing page's cube: square tiles, like a cube's faces laid flat, that show only when lit. The
 * pointer lights the ones it passes over, which go out behind it; what happens to the cube (a step done, the solve)
 * sends a ring of lit tiles across them.
 */
type Colour = [number, number, number];
const paint = ([r, g, b]: Colour, alpha: number) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${alpha.toFixed(3)})`;
/** Milliseconds for a lit tile to lose two thirds of its light, and how fast a ring grows (pixels a millisecond). */
const FADE = 420, SPREAD = 1.15;

/** Tiles lit in `tile` (red, green and blue from 0 to 1). */
export function tileGrid(tile: Colour) {
  let side = 64, columns = 0, rows = 0, left = 0, top = 0, width = 0, height = 0;
  let light = new Float32Array(0), from: [number, number] | null = null, before = 0;
  let rings: { x: number; y: number; start: number; reach: number; strength: number }[] = [];
  const touch = (column: number, row: number, amount: number) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return;
    const i = row * columns + column;
    light[i] = Math.max(light[i]!, amount);
  };
  return {
    /** The canvas is `w` by `h`, its tiles `tiles` wide: whole tiles in the middle, the cut ones at the edges. */
    size(w: number, h: number, tiles: number) {
      [width, height, side] = [w, h, tiles];
      columns = Math.ceil(w / side) + 1;
      rows = Math.ceil(h / side) + 1;
      left = ((w % side) - side) / 2;
      top = ((h % side) - side) / 2;
      light = new Float32Array(columns * rows);
    },
    /** A ring of lit tiles leaves (`x`, `y`) at `now`, as strong as `strength` (0 to 1) and gone `reach` pixels away. */
    ring(x: number, y: number, now: number, strength: number, reach: number) {
      rings.push({ x, y, start: now, reach, strength });
    },
    /** The tiles at `now`: `pointer` where the pointer is, if there is one; `shown` from 0 to 1 as the page opens. */
    draw(ctx: CanvasRenderingContext2D, now: number, pointer: [number, number] | null, shown: number) {
      const fade = Math.exp(-Math.min(now - before, 100) / FADE);
      before = now;
      for (let i = 0; i < light.length; i++) light[i]! *= fade;
      // The pointer lights every tile between where it was and where it is, and their neighbours a little.
      if (pointer) {
        const [fx, fy] = from ?? pointer, steps = Math.max(1, Math.ceil(Math.hypot(pointer[0] - fx, pointer[1] - fy) / (side / 2)));
        for (let step = 1; step <= steps; step++) {
          const column = Math.floor((fx + ((pointer[0] - fx) * step) / steps - left) / side), row = Math.floor((fy + ((pointer[1] - fy) * step) / steps - top) / side);
          touch(column, row, 1);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) touch(column + dx!, row + dy!, 0.28);
        }
      }
      from = pointer;
      rings = rings.filter((ring) => (now - ring.start) * SPREAD < ring.reach + side * 2);

      // The lit tiles, each a sticker in its square: whole ones only, none cut by the edge of the canvas.
      const gap = Math.max(3, side * 0.07), corner = side * 0.14;
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) {
          const x = left + column * side, y = top + row * side;
          if (x < 0 || y < 0 || x + side > width || y + side > height) continue;
          let lit = light[row * columns + column]!;
          for (const ring of rings) {
            const radius = (now - ring.start) * SPREAD, away = Math.hypot(x + side / 2 - ring.x, y + side / 2 - ring.y);
            lit += ring.strength * Math.max(0, 1 - Math.abs(away - radius) / (side * 1.3)) * Math.max(0, 1 - radius / ring.reach);
          }
          lit = Math.min(1, lit) * shown;
          if (lit < 0.02) continue;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(Math.round(x) + gap, Math.round(y) + gap, side - gap * 2, side - gap * 2, corner);
          else ctx.rect(Math.round(x) + gap, Math.round(y) + gap, side - gap * 2, side - gap * 2);
          ctx.fillStyle = paint(tile, lit * 0.42);
          ctx.fill();
        }
    },
  };
}
