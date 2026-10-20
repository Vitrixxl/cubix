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
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import semibold from "../assets/fonts/BricolageGrotesque-600.ttf";
import extrabold from "../assets/fonts/BricolageGrotesque-800.ttf";

/** A4, in millimetres: the sheet is an SVG of that size, shown as it is and turned into the PDF's vectors. */
const W = 210, H = 297;
const MARGIN = 14, GAP = 4, PAD = 3, TOP = MARGIN + 24, BOTTOM = H - 16;
/** The cases a row the sheet offers. */
const PER_ROW = [3, 4, 5, 6];
const FAMILY = "Bricolage Grotesque";
/** The PDF embeds the app's font at the two weights the sheet writes (desktop/scripts/subset-fonts.ts). */
const PDF_FONTS = [[600, semibold], [800, extrabold]] as const;

type Look = { theme: ThemeId; light: boolean; cols: number };
type Entry = { c: any; title: string; alg: string };

/** The algorithm the sheet gives a case: the one the player uses, else the first (for the left hand when that is chosen). */
function entries(cases: any[]): Entry[] {
  return cases.map((c) => {
    const mirrored = s.leftHand ? leftHandAlgs(c, cases)?.[0] : undefined;
    return { c, title: said(caseTitle(c)), alg: s.learnedAlgs[c.id]?.[0] ?? (mirrored ? displayAlg(mirrored) : c.algorithms?.[0] ? displayAlg(c.algorithms[0]) : "") };
  });
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => +v.toFixed(3);
/** A colour as SVG attributes: `rgba()` split into the colour and its opacity, which the PDF draws as such. */
function paint(attr: "fill" | "stroke", color: string) {
  const rgba = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!rgba) return `${attr}="${color}"`;
  const hex = "#" + rgba.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  return `${attr}="${hex}" ${attr}-opacity="${rgba[4]}"`;
}
const text = (x: number, y: number, size: number, weight: 600 | 800, color: string, value: string, anchor = "start") =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${FAMILY}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" ${paint("fill", color)}>${escape(value)}</text>`;

/** The moves of an algorithm in lines no wider than `width` millimetres at `size`, measured in the app's font. */
function wrap(alg: string, width: number, size: number) {
  const ctx = (wrap.ctx ??= document.createElement("canvas").getContext("2d")!);
  // Measured large, then scaled: tiny canvas fonts round their widths.
  ctx.font = `600 ${size * 10}px "${FAMILY}"`;
  const lines: string[] = [];
  for (const move of alg.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last != null && ctx.measureText(last + " " + move).width / 10 <= width) lines[lines.length - 1] = last + " " + move;
    else lines.push(move);
  }
  return lines.length ? lines : ["—"];
}
wrap.ctx = null as CanvasRenderingContext2D | null;

/** The puzzles' own diagrams (SVG files): fetched once, their ids made unique to the case, their one style written on each sticker. */
const pictures = new Map<string, Promise<{ box: string; body: string }>>();
function picture(asset: string) {
  if (!pictures.has(asset))
    pictures.set(asset, fetch("/assets/" + asset).then(async (response) => {
      const svg = await response.text(),
        prefix = "p" + pictures.size + "-";
      return {
        box: svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 100 100",
        body: svg
          .replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, "")
          .replace(/<title>[\s\S]*?<\/title>|<style>[\s\S]*?<\/style>/g, "")
          .replace(/class="sticker"/g, 'stroke="#000" stroke-width="1"')
          .replace(/\bid="/g, `id="${prefix}`)
          .replace(/href="#/g, `href="#${prefix}`),
      };
    }));
  return pictures.get(asset)!;
}

/** A case's diagram at (x, y), `size` wide, as the catalogue draws it (`StaticCubeSvg`, its rim by day). */
async function diagram(c: any, x: number, y: number, size: number, rim: string, light: boolean) {
  if (c.diagram) {
    const { box, body } = await picture(c.asset);
    return `<svg x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" viewBox="${box}">${body}</svg>`;
  }
  const view = viewForStage(c.stage),
    top = view !== "iso",
    { hull, tiles, edges } = diagramPaths(caseState(c), maskForStage(c.stage), view),
    stroke = (fill: string) => (light ? `${paint("stroke", rim)} stroke-width="1.2"` : `stroke="${fill}" stroke-width="${TILE_STROKE.strokeWidth}"`);
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 120)})" stroke-linejoin="round" stroke-linecap="round">` +
    (hull ? `<path d="${hull}" fill="${SEAM_FILL}"/>` : "") +
    tiles.map(({ fill, d }) => `<path d="${d}" fill="${fill}"${top ? " " + stroke(fill) : ""}/>`).join("") +
    // The hairline of a 96-pixel diagram.
    (edges ? `<path d="${edges}" fill="none" stroke="${EDGE_STROKE.stroke}" stroke-width="1.25"/>` : "") +
    "</g>"
  );
}

/** The app's badge (the 3×3 mark, its top right sticker in the accent) at (x, y), `size` wide. */
function badge(x: number, y: number, size: number, ink: string, accent: string) {
  const mark = puzzleMark("333"),
    k = size / mark.box;
  return mark.parts
    .map((part) => {
      if (!("rect" in part)) return "";
      const [px, py, pw, ph, r] = part.rect.map((v) => n(v * k)) as number[];
      return `<rect x="${n(x + px!)}" y="${n(y + py!)}" width="${pw}" height="${ph}" rx="${r}" fill="${part.accent ? accent : ink}"/>`;
    })
    .join("");
}

/** The sheet's pages as SVG, in the look chosen: the brand and the set on top, the cases on cards, the site and page at the foot. */
async function sheetPages(set: any, list: Entry[], { theme, light, cols }: Look) {
  const t = themeTokens(theme, light ? "light" : "dark"),
    // The cards share the width; the diagram takes most of a card, 22 mm at most.
    cell = (W - 2 * MARGIN - GAP * (cols - 1)) / cols,
    size = Math.min(22, cell - 4 * PAD);
  await document.fonts.load(`600 10px "${FAMILY}"`);
  const cards = list.map((e) => ({ ...e, lines: wrap(e.alg, cell - 2 * PAD - 1, 3) })),
    rows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));
  const height = (row: typeof cards) => PAD + size + 7 + Math.max(...row.map((card) => card.lines.length)) * 3.8 + PAD;
  const pages: (typeof rows)[] = [[]];
  let y = TOP;
  for (const row of rows) {
    if (y + height(row) > BOTTOM && pages.at(-1)!.length) pages.push([]), (y = TOP);
    pages.at(-1)!.push(row);
    y += height(row) + GAP;
  }
  const head =
    `<rect width="${W}" height="${H}" fill="${t.background}"/>` +
    badge(MARGIN, MARGIN, 9, t.foreground!, t.primary!) +
    text(MARGIN + 12, MARGIN + 7.3, 7.5, 800, t.foreground!, "Qbix") +
    text(W - MARGIN, MARGIN + 5.2, 6.5, 800, t.foreground!, said(set.label), "end") +
    text(W - MARGIN, MARGIN + 10.6, 3.2, 600, t["muted-foreground"]!, `${s.event().label} · ${plural(list.length, "case")}`, "end") +
    `<rect x="${MARGIN}" y="${MARGIN + 15}" width="${W - 2 * MARGIN}" height="0.25" ${paint("fill", t.border!)}/>` +
    `<rect x="${MARGIN}" y="${MARGIN + 14.4}" width="16" height="0.9" rx="0.45" fill="${t.primary}"/>`;
  return Promise.all(
    pages.map(async (page, p) => {
      let y = TOP,
        body = "";
      for (const row of page) {
        const h = height(row);
        for (const [i, card] of row.entries()) {
          const x = MARGIN + i * (cell + GAP),
            middle = x + cell / 2;
          body +=
            `<rect x="${n(x)}" y="${n(y)}" width="${n(cell)}" height="${n(h)}" rx="3" fill="${t.card}"/>` +
            (await diagram(card.c, x + (cell - size) / 2, y + PAD, size, t.rim!, light)) +
            text(middle, y + PAD + size + 5, 3.6, 800, t.foreground!, card.title, "middle") +
            card.lines.map((line, l) => text(middle, y + PAD + size + 9.6 + l * 3.8, 3, 600, card.alg ? t.foreground! : t.faint!, line, "middle")).join("");
        }
        y += h + GAP;
      }
      const foot = text(MARGIN, H - 8, 2.8, 600, t.faint!, SITE.replace(/^https:\/\//, "")) + text(W - MARGIN, H - 8, 2.8, 600, t.faint!, `${p + 1} / ${pages.length}`, "end");
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${head}${body}${foot}</svg>`;
    }),
  );
}

/** The pages as a vector PDF: each SVG drawn by svg2pdf, the app's font embedded. Loaded when asked for, not with the page. */
async function pdfOf(pages: string[]) {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]),
    doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  for (const [weight, url] of PDF_FONTS) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    doc.addFileToVFS(`Bricolage-${weight}.ttf`, btoa(binary));
    doc.addFont(`Bricolage-${weight}.ttf`, FAMILY, "normal", weight);
  }
  // svg2pdf reads the page from the document.
  const host = Object.assign(document.createElement("div"), { hidden: true });
  document.body.append(host);
  try {
    for (const [i, page] of pages.entries()) {
      if (i) doc.addPage();
      host.innerHTML = page;
      await svg2pdf(host.firstElementChild!, doc, { x: 0, y: 0, width: W, height: H });
    }
  } finally {
    host.remove();
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * The print dialog of a set's algorithms: the sheet in the app's look, its accent, dark or light and the cases a row
 * chosen here, the pages previewed as they come out, then downloaded as a vector PDF made on this device.
 */
export function PrintDialog({ set, onClose }: { set: any; onClose: () => void }) {
  const [look, setLook] = useState<Look>({ theme: (THEMES.some((x) => x.id === s.themeName) ? s.themeName : "peach") as ThemeId, light: s.light, cols: 5 }),
    [pages, setPages] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    list = entries(s.setCases(set.id));
  useEffect(() => {
    let live = true;
    void sheetPages(set, list, look).then((svgs) => live && setPages(svgs));
    return () => void (live = false);
  }, [look.theme, look.light, look.cols]);
  async function save() {
    setBusy(true);
    try {
      download(await pdfOf(pages!), "application/pdf", `qbix-${String(set.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
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
              ? pages.map((svg, i) => (
                  <div key={i} role="img" aria-label={tr("Page {0} of {1}", { 0: i + 1, 1: pages.length })} data-page={i + 1} className="overflow-hidden rounded-[4px] shadow-lg [&>svg]:block [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                ))
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
