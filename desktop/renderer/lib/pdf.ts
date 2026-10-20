/**
 * A PDF whose pages are each one JPEG image filling it, written in the browser: `width`×`height` in points (1/72 in).
 * ponytail: the pages are pictures (text not selectable); fonts embedded as vectors would need a font subsetter.
 */
export function jpegPdf(pages: { jpeg: Uint8Array; w: number; h: number }[], width: number, height: number): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    offsets: number[] = [];
  let length = 0;
  const put = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, ...body: (string | Uint8Array)[]) => {
    offsets[n] = length;
    put(`${n} 0 obj\n`);
    body.forEach(put);
    put("\nendobj\n");
  };
  put("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach(({ jpeg, w, h }, i) => {
    const n = 3 + 3 * i,
      draw = `q ${width} 0 0 ${height} 0 0 cm /I0 Do Q`;
    object(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /I0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    object(n + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    object(n + 2, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream");
  });
  const xref = length,
    size = offsets.length;
  put(`xref\n0 ${size}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  put(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const part of parts) pdf.set(part, at), (at += part.length);
  return pdf;
}
