/** Cube manufacturers whose mark is printed on the white centre of the 3D cube. */
export interface CubeBrand {
  id: CubeBrandId;
  label: string;
  /** Paint the mark into a square canvas; the background stays transparent. */
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}
export type CubeBrandId = "none" | "gan" | "moyu" | "qiyi" | "dayan" | "yj" | "xman" | "ferocore" | "shengshou" | "diansheng" | "yuxin" | "cubicle";

const FONT = '"Geist", system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
/** Draw a word centred at (x,y), shrunk if needed to fit the given width. */
function word(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, weight = 800, style = "normal", size = 100, spacing = 0) {
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${style} ${weight} ${size}px ${FONT}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  const scale = Math.min(1, maxWidth / Math.max(1, ctx.measureText(text).width));
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.closePath();
}

export const CUBE_BRANDS: readonly CubeBrand[] = [
  { id: "none", label: "No logo", draw: () => {} },
  { id: "gan", label: "GAN", draw: (ctx, s) => {
    ctx.fillStyle = "#111";
    word(ctx, "GAN", s / 2, s / 2, s * .82, 900, "italic", s * .4, s * .01);
  } },
  { id: "moyu", label: "MoYu", draw: (ctx, s) => {
    ctx.fillStyle = "#d1202a";
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s * .42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    word(ctx, "MoYu", s / 2, s / 2, s * .66, 800, "normal", s * .28);
  } },
  { id: "qiyi", label: "QiYi", draw: (ctx, s) => {
    ctx.fillStyle = "#111";
    word(ctx, "QiYi", s / 2, s * .47, s * .8, 900, "normal", s * .36);
    ctx.fillStyle = "#e03131";
    roundedRect(ctx, s * .2, s * .7, s * .6, s * .06, s * .03); ctx.fill();
  } },
  { id: "dayan", label: "DaYan", draw: (ctx, s) => {
    ctx.strokeStyle = "#5b21b6"; ctx.lineWidth = s * .05;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 6; const x = s / 2 + Math.cos(a) * s * .44, y = s / 2 + Math.sin(a) * s * .44; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = "#111";
    word(ctx, "DaYan", s / 2, s / 2, s * .6, 800, "normal", s * .22);
  } },
  { id: "yj", label: "YJ", draw: (ctx, s) => {
    ctx.fillStyle = "#1c5fd6";
    roundedRect(ctx, s * .12, s * .12, s * .76, s * .76, s * .16); ctx.fill();
    ctx.fillStyle = "#fff";
    word(ctx, "YJ", s / 2, s * .52, s * .6, 900, "italic", s * .42);
  } },
  { id: "xman", label: "X-Man Design", draw: (ctx, s) => {
    ctx.fillStyle = "#111";
    word(ctx, "X", s / 2, s * .4, s * .5, 900, "italic", s * .5);
    ctx.fillStyle = "#e03131";
    word(ctx, "X-MAN", s / 2, s * .76, s * .7, 800, "normal", s * .16, s * .02);
  } },
  { id: "ferocore", label: "Ferocore V2", draw: (ctx, s) => {
    const gradient = ctx.createLinearGradient(0, 0, s, s);
    gradient.addColorStop(0, "#f97316"); gradient.addColorStop(1, "#dc2626");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(s * .5, s * .06); ctx.lineTo(s * .72, s * .3); ctx.lineTo(s * .5, s * .5); ctx.lineTo(s * .28, s * .3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#111";
    word(ctx, "FEROCORE", s / 2, s * .68, s * .84, 900, "normal", s * .17, s * .015);
    ctx.fillStyle = "#dc2626";
    word(ctx, "V2", s / 2, s * .86, s * .3, 800, "italic", s * .13);
  } },
  { id: "shengshou", label: "ShengShou", draw: (ctx, s) => {
    ctx.fillStyle = "#111";
    word(ctx, "Sheng", s / 2, s * .4, s * .72, 800, "normal", s * .24);
    ctx.fillStyle = "#c92a2a";
    word(ctx, "Shou", s / 2, s * .64, s * .72, 800, "normal", s * .24);
  } },
  { id: "diansheng", label: "DianSheng", draw: (ctx, s) => {
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s * .42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    word(ctx, "DS", s / 2, s * .52, s * .6, 900, "normal", s * .4);
  } },
  { id: "yuxin", label: "YuXin", draw: (ctx, s) => {
    ctx.fillStyle = "#b91c1c";
    word(ctx, "YuXin", s / 2, s * .48, s * .82, 800, "italic", s * .3);
    ctx.fillStyle = "#111";
    roundedRect(ctx, s * .25, s * .68, s * .5, s * .05, s * .025); ctx.fill();
  } },
  { id: "cubicle", label: "TheCubicle", draw: (ctx, s) => {
    ctx.fillStyle = "#111";
    word(ctx, "cubicle", s / 2, s / 2, s * .84, 700, "normal", s * .26, -s * .005);
  } },
];
export const isCubeBrand = (value: unknown): value is CubeBrandId => CUBE_BRANDS.some(brand => brand.id === value);

const canvases = new Map<CubeBrandId, HTMLCanvasElement>();
/** A square bitmap of the mark, rendered once per brand. Returns null for "none" or without a DOM. */
export function brandLogoCanvas(id: CubeBrandId): HTMLCanvasElement | null {
  const brand = CUBE_BRANDS.find(b => b.id === id);
  if (!brand || brand.id === "none" || typeof document === "undefined") return null;
  let canvas = canvases.get(id);
  if (!canvas) {
    canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    brand.draw(ctx, 256);
    // Before the web font arrives the fallback face is drawn; redraw on the next request.
    if (document.fonts?.check(`800 24px Geist`) !== false) canvases.set(id, canvas);
  }
  return canvas;
}
