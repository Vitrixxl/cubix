import { PUZZLES } from "../../src/shared/puzzles";
import { tr } from "../../src/client/i18n";

/** A sticker: a rounded square (x, y, width, height, radius) or a path. */
type Part = { rect: number[]; accent: boolean } | { d: string; accent: boolean };
interface Mark {
  /** Side of the square view box. */
  box: number;
  /** The WCA icons are drawn y up. */
  flip: boolean;
  parts: Part[];
}

/**
 * The stickers of the WCA icons (desktop/assets/icons) that are not plain cubes, and which take the accent: one-handed
 * and blindfolded keep their hand or blindfold beside the stickers, the top right quarter of these in the accent.
 */
const SHAPES: Record<string, [accents: number[], paths: string[]]> = {
  "333oh": [[3], [
    "M179 100Q179 100 179 100V105H118Q114 105 110.5 108.0Q107 111 106.0 115.5Q105 120 107.0 124.0Q109 128 112.5 129.5Q116 131 120 131H194Q200 131 207 124L259 74Q264 70 264 63V21L248 37L223 57Q216 63 205 63L112 62Q102 62 93 70L40 123Q34 128 37.0 136.0Q40 144 48 145Q54 145 58 141L101 101Q102 100 104 100Z",
    "M79 274H112V240H79Z",
    "M126 274H159V240H126Z",
    "M173 274H206V240H173Z",
    "M79 227H112V193H79Z",
    "M126 227H159V193H126Z",
    "M173 227H206V193H173Z",
    "M79 180H113V147H79Z",
    "M126 180H160V147H126Z",
    "M173 180H207V147H173Z",
  ]],
  "333bf": [[0], [
    "M39 269H99V209H39Z",
    "M39 185H99V125H39Z",
    "M39 101H99V41H39Z",
    "M244 155Q245 166 251.0 191.5Q257 217 257 228Q258 248 248 257Q237 269 209 269Q177 269 160 252Q146 238 141 210Q137 190 137.0 156.0Q137 122 140 103Q145 75 157 60Q173 42 201 41Q232 40 245 51Q256 60 256 79Q256 91 250.5 117.0Q245 143 244 155Z",
  ]],
  "444bf": [[3, 0], [
    "M44 204H89V159H44Z",
    "M44 141H89V96H44Z",
    "M44 78H89V33H44Z",
    "M44 267H89V222H44Z",
    "M249 150Q250 161 256.0 186.5Q262 212 262 223Q263 243 253 253Q242 264 214 264Q182 264 166 247Q151 233 146 205Q142 185 142.0 151.0Q142 117 145 98Q150 70 162 55Q178 37 206 36Q237 35 250 46Q261 55 261 74Q261 86 255.5 112.0Q250 138 249 150Z",
  ]],
  "555bf": [[4, 3], [
    "M45 168H82V131H45Z",
    "M45 117H82V80H45Z",
    "M45 65H82V29H45Z",
    "M45 220H82V183H45Z",
    "M45 271H82V234H45Z",
    "M248 150Q249 161 255.0 186.5Q261 212 261 223Q262 243 252 253Q241 264 213 264Q182 264 165 247Q150 233 145 205Q142 185 142.0 151.0Q142 117 144 98Q149 70 162 55Q177 37 205 36Q236 35 249 46Q260 55 260 74Q260 86 254.5 112.0Q249 138 248 150Z",
  ]],
  pyram: [[0], [
    "M150 257Q158 244 174 216L187 194H113Z",
    "M59 100Q65 90 76 71L96 37H23Z",
    "M241 100Q247 89 260 67L277 37H204Z",
    "M114 37Q118 45 127 60L150 100L186 37Z",
    "M114 184H186L150 121Z",
    "M159 116Q181 154 195 179L232 116Z",
    "M195 42Q189 53 176 75L159 105H232Z",
    "M141 116Q105 116 68 116L105 179Z",
    "M68 105H141L105 42Z",
  ]],
  minx: [[4], [
    "M151 93Q148 93 143 93H123Q120 93 119 95L101 149Q101 152 103 153L149 187Q151 188 153 187L199 153Q201 152 200 150L183 95Q182 93 180 93Z",
    "M49 84H52H110Q113 84 114 81L132 23L71 22Q68 22 68 24Z",
    "M253 83Q252 81 250 75L234 25Q233 22 231 22L169 23L188 81Q189 84 191 84Z",
    "M37 118Q37 120 35 125L18 176Q18 179 19 180L70 216L89 156Z",
    "M202 238Q200 236 196 233L153 202Q151 200 149 201L99 237L149 274Q151 275 152 274Z",
    "M232 216Q234 214 240 211L282 180Q283 179 283 177L264 118L214 154Q212 155 213 157Z",
    "M224 222Q219 209 211 183L204 161L159 194L210 232Z",
    "M123 83H179L160 25Q159 22 156 22H145Q143 23 142 24L125 77Z",
    "M92 146Q99 127 110 93H48Q45 93 44 96L41 106Q41 108 42 109Z",
    "M142 194Q135 189 121 178L98 162L79 220Q78 222 80 224L91 232Z",
    "M192 93Q196 107 205 133L209 146L259 110Q261 108 260 106L256 95Q256 93 254 93Z",
  ]],
  skewb: [[4], [
    "M150 267 267 150 150 33 33 150Z",
    "M26 274H138L26 161Z",
    "M26 26V139L138 26Z",
    "M274 26H162L274 139Z",
    "M274 274V161L162 274Z",
  ]],
  sq1: [[2], [
    "M30 270V192L137 163L108 270Z",
    "M123 270 150 169 177 270Z",
    "M192 270 163 163 270 192V270Z",
    "M30 177V123L131 150Z",
    "M270 177 169 150 270 123Z",
    "M137 137 30 108V30H108Z",
    "M163 137 192 30H270V108Z",
    "M150 131 123 30H177Z",
  ]],
};

/**
 * The app's mark drawn as a puzzle: a cube is a grid of rounded stickers, its top right quarter turned to the accent;
 * the others are their WCA icon, one sticker (top right where the shape allows) in the accent. The 2×2 is Qbix's own mark.
 */
export function puzzleMark(puzzle = "222"): Mark {
  // An event (one-handed, blindfolded) has its own icon; otherwise the puzzle's.
  const shape = SHAPES[puzzle];
  if (shape) return { box: 300, flip: true, parts: shape[1].map((d, i) => ({ d, accent: shape[0].includes(i) })) };
  const n = PUZZLES.find((p) => p.id === puzzle)?.cubeSize ?? 2,
    gap = n === 2 ? 1.5 : Math.max(0.7, 3 / n),
    cell = (18 - gap * (n - 1)) / n,
    // The top right quarter takes the accent, as the 2×2's one sticker: a 3×3 block on the 7×7.
    corner = Math.floor(n / 2);
  return {
    box: 18,
    flip: false,
    parts: Array.from({ length: n * n }, (_, i) => {
      const row = Math.floor(i / n),
        col = i % n;
      return { rect: [col * (cell + gap), row * (cell + gap), cell, cell, cell * 0.27], accent: row < corner && col >= n - corner };
    }),
  };
}

/** The app's mark: the event being practised (see `puzzleMark`), some of its stickers turned to the accent. */
export function Logo({ size = 18, puzzle }: { size?: number; puzzle?: string }) {
  const mark = puzzleMark(puzzle);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${mark.box} ${mark.box}`} aria-hidden="true" className="shrink-0">
      <g transform={mark.flip ? `translate(0 ${mark.box}) scale(1 -1)` : undefined}>
        {mark.parts.map((part, i) => {
          const className = part.accent ? "fill-primary" : "fill-foreground/85";
          if ("d" in part) return <path key={i} d={part.d} className={className} />;
          const [x, y, width, height, rx] = part.rect;
          return <rect key={i} x={x} y={y} width={width} height={height} rx={rx} className={className} />;
        })}
      </g>
    </svg>
  );
}

/**
 * The mark as a standalone SVG, for the tab's icon: the accent sticker in `accent`, the others following the
 * browser's own light or dark look (the tab strip's, not the app's) so they always stand out.
 */
export function markSvg(puzzle: string, accent: string) {
  const mark = puzzleMark(puzzle),
    fill = (accented: boolean) => (accented ? ` fill="${accent}"` : ' class="s"'),
    parts = mark.parts
      .map((part) => {
        if ("d" in part) return `<path d="${part.d}"${fill(part.accent)}/>`;
        const [x, y, width, height, rx] = part.rect.map((v) => +v.toFixed(3));
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}"${fill(part.accent)}/>`;
      })
      .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mark.box} ${mark.box}"><style>.s{fill:#262626}@media (prefers-color-scheme:dark){.s{fill:#e5e5e5}}</style>` +
    `<g${mark.flip ? ` transform="translate(0 ${mark.box}) scale(1 -1)"` : ""}>${parts}</g></svg>`
  );
}

/** The app's name: Qbix, its Q bold. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={"tracking-tight " + (className ?? "")} aria-label={tr("Qbix")}>
      <span className="font-extrabold">Q</span>
      <span className="font-medium">bix</span>
    </span>
  );
}
