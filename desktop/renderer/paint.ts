import type { CubeShape } from "../../src/shared/cubeScene";
import type { CubeView } from "../../src/client/lib/cubeView";
import { tr } from "../../src/client/i18n";
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

/**
 * What `showFront` (AlgPlayer, CubeView) marks on the painted cube for a moment: the other faces dimmed, and an accent
 * tag reading "Front" under the front face, pointing at it. No glow: the stickers stay as they are. Fades in and out,
 * or simply appears and goes where motion is reduced.
 */
export function paintPulse(ctx: CanvasRenderingContext2D, pulse: ReturnType<CubeView["pulse"]>, size: number, radius: number) {
  if (!pulse) return;
  const unit = size / 2 / radius,
    at = (v: number[]) => [size / 2 + v[0]! * unit, size / 2 - v[1]! * unit] as const,
    corners = pulse.corners.map(at),
    still = matchMedia("(prefers-reduced-motion: reduce)").matches,
    alpha = still ? 1 : Math.max(0, Math.min(1, pulse.t / 0.12, (1 - pulse.t) / 0.25)),
    root = getComputedStyle(document.documentElement);
  ctx.save();
  // The other faces dimmed: only over what is painted (source-atop), everywhere but the front face (even-odd).
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(0,0,0,${0.5 * alpha})`;
  ctx.fill("evenodd");
  ctx.globalCompositeOperation = "source-over";
  // The tag, the app's badge (12px, accent), under the face's lowest point and kept on the canvas.
  ctx.globalAlpha = alpha;
  ctx.font = `600 12px ${root.getPropertyValue("--font-sans").trim() || getComputedStyle(ctx.canvas).fontFamily}`;
  const label = tr("Front"),
    w = ctx.measureText(label).width + 16,
    h = 20,
    tip = 5,
    cx = Math.min(size - w / 2 - 2, Math.max(w / 2 + 2, at(pulse.centre)[0])),
    top = Math.min(size - h - 2, Math.max(...corners.map(([, y]) => y)) + tip + 4);
  ctx.fillStyle = root.getPropertyValue("--primary").trim() || "#f4a77f";
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, top, w, h, 6);
  ctx.moveTo(cx - tip, top);
  ctx.lineTo(cx, top - tip);
  ctx.lineTo(cx + tip, top);
  ctx.fill();
  ctx.fillStyle = root.getPropertyValue("--primary-foreground").trim() || "#1c1317";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, top + h / 2 + 0.5);
  ctx.restore();
}
