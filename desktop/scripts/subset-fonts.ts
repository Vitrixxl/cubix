/**
 * The web app's Geist, cut to the characters it writes and packed as WOFF2: `bun desktop/scripts/subset-fonts.ts`
 * writes desktop/assets/fonts/Geist-*.woff2 from the TTFs beside them. Run again only when the app writes a character
 * outside these ranges; a missing one falls back to the system's sans-serif.
 *
 * Subset by HarfBuzz (libharfbuzz-subset, through bun:ffi), every layout feature kept (tabular figures…). WOFF2 with
 * its tables untransformed: brotli over the whole font, which every browser reads.
 */
import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { brotliCompressSync, constants } from "node:zlib";

const DIR = "desktop/assets/fonts";
const WEIGHTS = ["Regular", "Medium", "SemiBold", "Bold"];
/** Latin-1, Latin Extended-A, general punctuation, then the symbols the app's texts use (€ ← ↑ → ↓ − ≡). */
const RANGES = [[0x20, 0x7e], [0xa0, 0x17f], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2190, 0x2193], [0x2212, 0x2212], [0x2261, 0x2261]];

const { p, u32, i32 } = { p: FFIType.ptr, u32: FFIType.u32, i32: FFIType.i32 };
const hb = dlopen("libharfbuzz.so.0", {
  hb_blob_create: { args: [p, u32, i32, p, p], returns: p },
  hb_face_create: { args: [p, u32], returns: p },
  hb_face_reference_blob: { args: [p], returns: p },
  hb_blob_get_data: { args: [p, p], returns: p },
  hb_set_add_range: { args: [p, u32, u32], returns: FFIType.void },
  hb_set_clear: { args: [p], returns: FFIType.void },
  hb_set_invert: { args: [p], returns: FFIType.void },
}).symbols;
const hbSubset = dlopen("libharfbuzz-subset.so.0", {
  hb_subset_input_create_or_fail: { args: [], returns: p },
  hb_subset_input_unicode_set: { args: [p], returns: p },
  hb_subset_input_set: { args: [p, i32], returns: p },
  hb_subset_or_fail: { args: [p, p], returns: p },
}).symbols;
const LAYOUT_FEATURES = 6;

function subset(font: Uint8Array): Uint8Array {
  const face = hb.hb_face_create(hb.hb_blob_create(ptr(font), font.length, 0, null, null), 0);
  const input = hbSubset.hb_subset_input_create_or_fail();
  const unicodes = hbSubset.hb_subset_input_unicode_set(input);
  for (const [first, last] of RANGES) hb.hb_set_add_range(unicodes, first, last);
  const features = hbSubset.hb_subset_input_set(input, LAYOUT_FEATURES);
  hb.hb_set_clear(features);
  hb.hb_set_invert(features);
  const result = hbSubset.hb_subset_or_fail(face, input);
  if (!result) throw new Error("HarfBuzz could not subset the font");
  const length = new Uint32Array(1);
  const data = hb.hb_blob_get_data(hb.hb_face_reference_blob(result), ptr(length));
  return new Uint8Array(toArrayBuffer(data!, 0, length[0])).slice();
}

/** The table tags WOFF2 knows by their index (its specification, 5.1). */
const KNOWN = "cmap head hhea hmtx maxp name OS/2 post cvt fpgm glyf loca prep CFF VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill".split(" ").map((tag) => tag.padEnd(4));
const base128 = (n: number) => {
  const bytes = [n & 0x7f];
  while ((n >>>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
};

function woff2(sfnt: Uint8Array): Uint8Array {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const count = view.getUint16(4);
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 12 + 16 * i;
    return { tag: String.fromCharCode(...sfnt.subarray(at, at + 4)), offset: view.getUint32(at + 8), length: view.getUint32(at + 12) };
  });
  const directory: number[] = [];
  for (const { tag, length } of tables) {
    const known = KNOWN.indexOf(tag);
    // glyf and loca untransformed are version 3; every other table untransformed is version 0.
    directory.push((known < 0 ? 63 : known) | (tag === "glyf" || tag === "loca" ? 0xc0 : 0));
    if (known < 0) directory.push(...[...tag].map((c) => c.charCodeAt(0)));
    directory.push(...base128(length));
  }
  const data = Buffer.concat(tables.map(({ offset, length }) => sfnt.subarray(offset, offset + length)));
  const compressed = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  const length = 48 + directory.length + compressed.length, padded = (length + 3) & ~3;
  const out = new Uint8Array(padded), header = new DataView(out.buffer);
  header.setUint32(0, 0x774f4632); // wOF2
  header.setUint32(4, view.getUint32(0));
  header.setUint32(8, padded);
  header.setUint16(12, count);
  header.setUint32(16, 12 + 16 * count + tables.reduce((sum, t) => sum + ((t.length + 3) & ~3), 0));
  header.setUint32(20, compressed.length);
  header.setUint16(24, 1);
  out.set(directory, 48);
  out.set(compressed, 48 + directory.length);
  return out;
}

for (const weight of WEIGHTS) {
  const ttf = new Uint8Array(await Bun.file(`${DIR}/Geist-${weight}.ttf`).arrayBuffer());
  const out = woff2(subset(ttf));
  await Bun.write(`${DIR}/Geist-${weight}.woff2`, out);
  console.log(`Geist-${weight}.woff2: ${out.length} bytes (TTF ${ttf.length})`);
}
