import type { CubeShape } from "../../src/shared/cubeScene";
/** Paints cube shapes (see `cubeShapes`) centred on a square canvas of `size` CSS pixels, `radius` cube units across half of it. */
export function paintShapes(ctx: CanvasRenderingContext2D, shapes: CubeShape[], size: number, radius: number) {
  ctx.clearRect(0, 0, size, size);
  const unit = size / 2 / radius;
  for (const { points, color, line } of shapes) {
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = size / 2 + v[0]! * unit,
        y = size / 2 - v[1]! * unit;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    const hex = "#" + color.toString(16).padStart(6, "0");
    if (line) {
      ctx.strokeStyle = hex;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.closePath();
      ctx.fillStyle = hex;
      ctx.fill();
    }
  }
}
