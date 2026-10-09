import type { CubeShape } from "../../src/shared/cubeScene";
import type { CubeView } from "../../src/client/lib/cubeView";
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

/** The glow of `showFront` (AlgPlayer, CubeView) on the painted cube: the front face lit, two waves spreading from its centre. */
export function paintPulse(ctx: CanvasRenderingContext2D, pulse: ReturnType<CubeView["pulse"]>, size: number, radius: number) {
  if (!pulse) return;
  const unit = size / 2 / radius,
    at = (v: number[]) => [size / 2 + v[0]! * unit, size / 2 - v[1]! * unit] as const,
    [cx, cy] = at(pulse.centre),
    corners = pulse.corners.map(at),
    reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy))),
    fade = 1 - pulse.t;
  ctx.save();
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.shadowColor = `rgba(255,255,255,${fade})`;
  ctx.shadowBlur = size / 14;
  ctx.strokeStyle = `rgba(255,255,255,${0.8 * fade})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.clip();
  ctx.fillStyle = `rgba(255,255,255,${0.22 * fade})`;
  ctx.fill();
  for (const delay of [0, 0.3]) {
    const t = (pulse.t - delay) / (1 - delay);
    if (t <= 0) continue;
    const r = t * reach,
      band = reach * 0.18,
      wave = ctx.createRadialGradient(cx, cy, Math.max(0, r - band), cx, cy, r + band);
    wave.addColorStop(0, "rgba(255,255,255,0)");
    wave.addColorStop(0.5, `rgba(255,255,255,${0.55 * (1 - t)})`);
    wave.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wave;
    ctx.fill();
  }
  ctx.restore();
}
