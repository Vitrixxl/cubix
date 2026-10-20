import {expect, test} from 'bun:test';
import {jpegPdf} from '../renderer/lib/pdf';

test('a PDF of JPEG pages: every page listed, each object where the cross-reference table says', () => {
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, n, 0x80, 0xff, 0xd9]),
    pdf = jpegPdf([{jpeg: jpeg(1), w: 4, h: 6}, {jpeg: jpeg(2), w: 4, h: 6}], 595.28, 841.89),
    text = new TextDecoder('latin1').decode(pdf);
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);
  expect(text).toContain('/Count 2');
  const xref = Number(text.match(/startxref\n(\d+)/)![1]);
  expect(text.slice(xref, xref + 5)).toBe('xref\n');
  const offsets = [...text.slice(xref).matchAll(/(\d{10}) 00000 n \n/g)].map(m => Number(m[1]));
  expect(offsets.length).toBe(8);
  offsets.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
  // The images go in byte for byte.
  expect(pdf.indexOf(0x80)).toBeGreaterThan(0);
  expect(text).toContain('/Width 4 /Height 6');
});
