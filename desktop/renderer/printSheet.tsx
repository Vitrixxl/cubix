import { useEffect, useState } from "react";
import { Download, Moon, Sun } from "lucide-react";
import { store as s, download } from "./store";
import { caseState, caseTitle, displayAlg, leftHandAlgs, maskForStage } from "../../src/client/lib/caseState";
import { EDGE_STROKE, SEAM_FILL, TILE_STROKE, diagramPaths, viewForStage } from "../../src/shared/cubeDiagram";
import { THEMES, themeTokens, type ThemeId } from "../../src/client/lib/theme";
import { AccentSwatches, LABEL, Modal, NUMERIC, Segmented, plural } from "./ui";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { puzzleMark } from "./logo";
import { SITE } from "./landing/content";
import { jpegPdf } from "./lib/pdf";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** A4 in millimetres and in points; the sheet is laid out in millimetres. */
const W = 210, H = 297, POINTS = [595.28, 841.89] as const;
const MARGIN = 14, GAP = 4, PAD = 3;
/** The cases a row the sheet offers. */
const PER_ROW = [3, 4, 5, 6];
const TOP = MARGIN + 24, BOTTOM = H - 16;
const FONT = '"Bricolage Grotesque", system-ui, sans-serif';
/** Pixels a millimetre: the preview's, the PDF's (about 200 dpi). */
const PREVIEW = 4, PRINT = 8;

type Look = { theme: ThemeId; light: boolean; cols: number };
type Entry = { c: any; title: string; alg: string };

/** The algorithm the sheet gives a case: the one the player uses, else the first (for the left hand when that is chosen). */
function entries(cases: any[]): Entry[] {
  return cases.map((c) => {
    const mirrored = s.leftHand ? leftHandAlgs(c, cases)?.[0] : undefined;
    return { c, title: said(caseTitle(c)), alg: s.learnedAlgs[c.id]?.[0] ?? (mirrored ? displayAlg(mirrored) : c.algorithms?.[0] ? displayAlg(c.algorithms[0]) : "") };
  });
}

const font = (ctx: CanvasRenderingContext2D, weight: number, size: number) => (ctx.font = `${weight} ${size}px ${FONT}`);

/** The moves of an algorithm in lines no wider than `width`. */
function wrap(ctx: CanvasRenderingContext2D, alg: string, width: number) {
  const lines: string[] = [];
  for (const move of alg.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last != null && ctx.measureText(last + " " + move).width <= width) lines[lines.length - 1] = last + " " + move;
    else lines.push(move);
  }
  return lines.length ? lines : ["—"];
}

/** The puzzles' own diagrams are pictures: each loaded once. */
const pictures = new Map<string, Promise<HTMLImageElement>>();
function picture(src: string) {
  if (!pictures.has(src)) {
    const img = new Image();
    img.src = src;
    pictures.set(src, img.decode().then(() => img));
  }
  return pictures.get(src)!;
}

/** A case's diagram at (x, y), `size` wide, as the catalogue draws it (`StaticCubeSvg`, its rim by day). */
async function drawDiagram(ctx: CanvasRenderingContext2D, c: any, x: number, y: number, size: number, rim: string, light: boolean) {
  if (c.diagram) {
    const img = await picture("/assets/" + c.asset);
    ctx.save();
    if (light) ctx.filter = `drop-shadow(0 0 0.15px ${rim}) drop-shadow(0 0 0.15px ${rim})`;
    ctx.drawImage(img, x, y, size, size);
    return ctx.restore();
  }
  const view = viewForStage(c.stage),
    top = view !== "iso",
    { hull, tiles, edges } = diagramPaths(caseState(c), maskForStage(c.stage), view);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 120, size / 120);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (hull) (ctx.fillStyle = SEAM_FILL), ctx.fill(new Path2D(hull));
  for (const { fill, d } of tiles) {
    const path = new Path2D(d);
    ctx.fillStyle = fill;
    ctx.fill(path);
    if (top) (ctx.strokeStyle = light ? rim : fill), (ctx.lineWidth = light ? 1.2 : TILE_STROKE.strokeWidth), ctx.stroke(path);
  }
  // The hairline of a 96-pixel diagram.
  if (edges) (ctx.strokeStyle = EDGE_STROKE.stroke), (ctx.lineWidth = 1.25), ctx.stroke(new Path2D(edges));
  ctx.restore();
}

/** The app's badge (the 3×3 mark, its top right sticker in the accent) at (x, y), `size` wide. */
function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ink: string, accent: string) {
  const mark = puzzleMark("333"),
    k = size / mark.box;
  for (const part of mark.parts) {
    if (!("rect" in part)) continue;
    const [px, py, pw, ph, r] = part.rect.map((v) => v * k) as [number, number, number, number, number];
    ctx.fillStyle = part.accent ? accent : ink;
    ctx.beginPath();
    ctx.roundRect(x + px, y + py, pw, ph, r);
    ctx.fill();
  }
}

/** The sheet's pages, each a canvas of A4 at `scale` pixels a millimetre, in the look chosen. */
async function drawSheet(set: any, list: Entry[], { theme, light, cols }: Look, scale: number) {
  // The cards share the width; the diagram takes most of a card, 22 mm at most.
  const CELL = (W - 2 * MARGIN - GAP * (cols - 1)) / cols,
    DIAGRAM = Math.min(22, CELL - 4 * PAD);
  const t = themeTokens(theme, light ? "light" : "dark"),
    // Laid out once on a scratch canvas: the cards' heights decide the pages.
    measure = document.createElement("canvas").getContext("2d")!;
  await document.fonts.load(`800 10px ${FONT}`);
  font(measure, 600, 3);
  const cards = list.map((e) => ({ ...e, lines: wrap(measure, e.alg, CELL - 2 * PAD) })),
    rows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));
  const height = (row: typeof cards) => PAD + DIAGRAM + 7 + Math.max(...row.map((card) => card.lines.length)) * 3.8 + PAD;
  const pages: (typeof rows)[] = [[]];
  let y = TOP;
  for (const row of rows) {
    if (y + height(row) > BOTTOM && pages.at(-1)!.length) pages.push([]), (y = TOP);
    pages.at(-1)!.push(row);
    y += height(row) + GAP;
  }
  return Promise.all(
    pages.map(async (page, p) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(W * scale), height: Math.round(H * scale) }),
        ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = t.background!;
      ctx.fillRect(0, 0, W, H);
      // The brand on the left, the set on the right over an accent underline, a rule under them.
      drawBadge(ctx, MARGIN, MARGIN, 9, t.foreground!, t.primary!);
      ctx.fillStyle = t.foreground!;
      ctx.textBaseline = "middle";
      ctx.letterSpacing = "-0.28px";
      font(ctx, 800, 7.5);
      ctx.fillText("Qbix", MARGIN + 12, MARGIN + 4.8);
      ctx.textAlign = "right";
      font(ctx, 800, 6.5);
      ctx.fillText(said(set.label), W - MARGIN, MARGIN + 3);
      ctx.letterSpacing = "0px";
      font(ctx, 600, 3.2);
      ctx.fillStyle = t["muted-foreground"]!;
      ctx.fillText(`${s.event().label} · ${plural(list.length, "case")}`, W - MARGIN, MARGIN + 9.5);
      ctx.fillStyle = t.border!;
      ctx.fillRect(MARGIN, MARGIN + 15, W - 2 * MARGIN, 0.25);
      ctx.fillStyle = t.primary!;
      ctx.beginPath();
      ctx.roundRect(MARGIN, MARGIN + 14.4, 16, 0.9, 0.45);
      ctx.fill();
      // The cases, four a row, each on its card: the diagram, the name, the algorithm.
      let y = TOP;
      for (const row of page) {
        const h = height(row);
        await Promise.all(
          row.map(async (card, i) => {
            const x = MARGIN + i * (CELL + GAP);
            ctx.fillStyle = t.card!;
            ctx.beginPath();
            ctx.roundRect(x, y, CELL, h, 3);
            ctx.fill();
            await drawDiagram(ctx, card.c, x + (CELL - DIAGRAM) / 2, y + PAD, DIAGRAM, t.rim!, light);
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = t.foreground!;
            font(ctx, 800, 3.6);
            ctx.fillText(card.title, x + CELL / 2, y + PAD + DIAGRAM + 5, CELL - 2 * PAD);
            font(ctx, 600, 3);
            ctx.fillStyle = card.alg ? t.foreground! : t.faint!;
            card.lines.forEach((line, l) => ctx.fillText(line, x + CELL / 2, y + PAD + DIAGRAM + 9.6 + l * 3.8));
          }),
        );
        y += h + GAP;
      }
      ctx.textBaseline = "middle";
      font(ctx, 600, 2.8);
      ctx.fillStyle = t.faint!;
      ctx.textAlign = "left";
      ctx.fillText(SITE.replace(/^https:\/\//, ""), MARGIN, H - 9);
      ctx.textAlign = "right";
      ctx.fillText(`${p + 1} / ${pages.length}`, W - MARGIN, H - 9);
      return canvas;
    }),
  );
}

/**
 * The print dialog of a set's algorithms: the sheet in the app's look, its accent, dark or light and the cases a row chosen here, the
 * pages previewed as they come out, then downloaded as a PDF made on this device.
 */
export function PrintDialog({ set, onClose }: { set: any; onClose: () => void }) {
  const [look, setLook] = useState<Look>({ theme: (THEMES.some((x) => x.id === s.themeName) ? s.themeName : "peach") as ThemeId, light: s.light, cols: 5 }),
    [pages, setPages] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    list = entries(s.setCases(set.id));
  useEffect(() => {
    let live = true;
    void drawSheet(set, list, look, PREVIEW).then((canvases) => live && setPages(canvases.map((c) => c.toDataURL("image/jpeg", 0.9))));
    return () => void (live = false);
  }, [look.theme, look.light, look.cols]);
  async function save() {
    setBusy(true);
    try {
      const canvases = await drawSheet(set, list, look, PRINT),
        jpegs = await Promise.all(canvases.map((c) => new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/jpeg", 0.92)).then(async (b) => ({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }))));
      download(jpegPdf(jpegs, ...POINTS), "application/pdf", `qbix-${String(set.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={tr("Print")} description={`${said(set.label)} · ${plural(list.length, "case")}`} className="flex h-[min(88vh,860px)] flex-col sm:max-w-4xl">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-5">
        <div className="min-h-0 overflow-y-auto rounded-[18px] bg-muted p-5" data-slot="print-preview" aria-busy={!pages}>
          <div className="mx-auto flex max-w-md flex-col gap-4">
            {pages
              ? pages.map((src, i) => <img key={i} src={src} alt={tr("Page {0} of {1}", { 0: i + 1, 1: pages.length })} className="aspect-[210/297] w-full rounded-[4px] shadow-lg" />)
              : <Skeleton className="aspect-[210/297] w-full" />}
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className={LABEL}>{tr("Theme")}</p>
            <Segmented
              label="Theme"
              action="print:mode:"
              value={look.light ? "light" : "dark"}
              onChange={(v) => setLook({ ...look, light: v === "light" })}
              options={[
                { id: "dark", label: <><Moon />{tr("Dark")}</> },
                { id: "light", label: <><Sun />{tr("Light")}</> },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className={LABEL}>{tr("Cases per row")}</p>
            <Segmented
              label="Cases per row"
              action="print:cols:"
              value={String(look.cols)}
              onChange={(v) => setLook({ ...look, cols: Number(v) })}
              options={PER_ROW.map((n) => ({ id: String(n), label: String(n) }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className={LABEL}>{tr("Accent")}</p>
            <div className="flex flex-wrap gap-2.5 p-0.5">
              <AccentSwatches value={look.theme} action="print:theme:" onPick={(id) => setLook({ ...look, theme: id as ThemeId })} />
            </div>
          </div>
          <p className={cn(NUMERIC, "text-[13px] text-muted-foreground")}>{pages ? plural(pages.length, "page") : " "}</p>
          <UiButton className="mt-auto" data-action="print:pdf" disabled={!pages || busy} onClick={() => void save()}>
            <Download />
            {tr("Download the PDF")}
          </UiButton>
        </div>
      </div>
    </Modal>
  );
}
