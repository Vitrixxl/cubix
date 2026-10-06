/**
 * Texts written outside the interface (the data engine, the libraries the mobile app shares) in English, marked for
 * translation: `msg("{0} algorithms", { 0: n })` gives "100 algorithms", and the extraction (scripts/i18n-extract.ts)
 * records "{0} algorithms" as a text to translate. The interface translates such a text when it shows it: `t` knows
 * it again from its pattern (src/client/i18n).
 */
export function msg(text: string, values?: Record<string, string | number | null | undefined>): string {
  return values ? fill(text, values) : text;
}
/** `text` with each `{name}` replaced by its value; names without one stay. */
export const fill = (text: string, values: Record<string, string | number | null | undefined>) =>
  text.replace(/\{(\w+)\}/g, (all, name) => (name in values ? String(values[name] ?? "") : all));
