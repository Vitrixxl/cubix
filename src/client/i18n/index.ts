/**
 * The languages of the app and the landing page: English, French, Spanish, Italian and German. Texts are written in
 * English in the code and translated through `t`: the English text is the key of each language's dictionary
 * (`<code>.json` beside this file), and stays as it is where a translation is missing. `{name}` in a text is replaced
 * by the value of that name.
 *
 * The language is the one chosen in the settings (or on the landing page), kept on the device; until one is chosen,
 * the browser's own. The Android app gives its own storage and languages (`setDevice`, mobile/src/i18n.ts).
 */
import { fill } from "./msg";

export type Language = "en" | "fr" | "es" | "it" | "de";
export const LANGUAGES: { id: Language; name: string; locale: string }[] = [
  { id: "en", name: "English", locale: "en-GB" },
  { id: "fr", name: "Français", locale: "fr-FR" },
  { id: "es", name: "Español", locale: "es-ES" },
  { id: "it", name: "Italiano", locale: "it-IT" },
  { id: "de", name: "Deutsch", locale: "de-DE" },
];
/** Where the language chosen is kept, for the app and the landing page alike. */
export const LANGUAGE_KEY = "cubix.language";

export const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.id === value);
/** Where the choice is kept and which languages the device prefers: the browser's, unless another device is given. */
export interface Device {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  languages(): readonly string[];
}
let device: Device = {
  storage: { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  languages: () => (typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language])),
};
export const setDevice = (next: Device) => void (device = next);
/** The first of the device's languages the app speaks, English otherwise. */
export function detect(preferred: readonly string[] = device.languages()): Language {
  for (const tag of preferred) {
    const id = tag.toLowerCase().split("-")[0];
    if (isLanguage(id)) return id;
  }
  return "en";
}
/** The language chosen on this device, or the device's own. */
export function preferred(): Language {
  try {
    const stored = device.storage.getItem(LANGUAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {}
  return detect();
}

type Dictionary = Record<string, string>;
const dictionaries: Partial<Record<Language, Dictionary>> = { en: {} };
let current: Language = "en";
const listeners = new Set<() => void>();

/** Each language's dictionary, loaded on demand: only the one in use is downloaded. */
const loaders: Record<Exclude<Language, "en">, () => Promise<{ default: Dictionary }>> = {
  fr: () => import("./fr.json"),
  es: () => import("./es.json"),
  it: () => import("./it.json"),
  de: () => import("./de.json"),
};
export async function load(language: Language) {
  if (!dictionaries[language] && language !== "en") dictionaries[language] = (await loaders[language]()).default;
}
/** Switches the language: its dictionary is loaded first; `remember` keeps the choice on this device. */
export async function setLanguage(language: Language, remember = true) {
  await load(language);
  current = language;
  if (remember)
    try {
      device.storage.setItem(LANGUAGE_KEY, language);
    } catch {}
  if (typeof document !== "undefined") document.documentElement.lang = language;
  for (const listener of listeners) listener();
}
/** Starts in the language of the device, its dictionary loaded. */
export const start = () => setLanguage(preferred(), false);
export const language = () => current;
/** The locale dates and numbers are written in. */
export const locale = () => LANGUAGES.find((l) => l.id === current)!.locale;
export function onLanguage(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
/** For tests: a dictionary given directly. */
export function provide(language: Language, dictionary: Dictionary) {
  dictionaries[language] = dictionary;
}


/**
 * The texts with values of the current language as patterns, the most specific first: a text built elsewhere in
 * English ("100 algorithms", from `msg("{0} algorithms")`) is known again from them. Built once per language.
 */
let patterns: { language: Language; list: { re: RegExp; names: string[]; key: string; fragment: string }[] } | undefined;
const found = new Map<string, string>();
function patternsOf(dictionary: Dictionary) {
  if (patterns?.language !== current) {
    found.clear();
    const list = Object.keys(dictionary)
      .filter((key) => /\{\w+\}/.test(key) && /[A-Za-z]{2}/.test(key.replace(/\{\w+\}/g, "")))
      .sort((a, b) => b.replace(/\{\w+\}/g, "").length - a.replace(/\{\w+\}/g, "").length)
      .map((key) => {
        const names: string[] = [];
        const source = key.split(/(\{\w+\})/).map((part) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          if (!name) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          names.push(name);
          return "(.+?)";
        });
        // Its longest piece of text: a text without it cannot match, and no regex needs to run.
        const fragment = key.split(/\{\w+\}/).reduce((a, b) => (b.length > a.length ? b : a), "");
        return { re: new RegExp("^" + source.join("") + "$", "s"), names, key, fragment };
      });
    patterns = { language: current, list };
  }
  return patterns.list;
}
/** A text built in English from one of the patterns, translated with its values (each translated in turn). */
function recognise(text: string, dictionary: Dictionary): string | undefined {
  // The patterns first: a change of language empties what was found in the previous one.
  const list = patternsOf(dictionary);
  if (found.has(text)) return found.get(text);
  let out: string | undefined;
  for (const { re, names, key, fragment } of list) {
    if (!text.includes(fragment)) continue;
    const m = re.exec(text);
    if (!m) continue;
    const values = Object.fromEntries(names.map((name, i) => [name, dictionary[m[i + 1]!] ?? m[i + 1]!]));
    out = fill(dictionary[key]!, values);
    break;
  }
  if (found.size > 5000) found.clear();
  found.set(text, out ?? text);
  return out;
}

/** `text` in the current language, its `{name}`s replaced by `values`. */
export function t(text: string, values?: Record<string, string | number | null | undefined>): string {
  const dictionary = dictionaries[current];
  let translated = dictionary?.[text];
  // A text built in English elsewhere, values in it (see `msg`).
  if (translated === undefined && dictionary && current !== "en" && !values && /\d|[A-Za-z]{2}/.test(text)) translated = recognise(text, dictionary);
  translated ||= text;
  return values ? fill(translated, values) : translated;
}
/**
 * A count with its noun: `one` for one (the `{n}` in it is the count), `other` otherwise ("{n} solves" by default,
 * from "{n} solve"), each translated, the language's own rule choosing the form (French says "0 résolution").
 */
/** The English plural of a text's last word: "{n} solve" gives "{n} solves" ("match", "matches"; "reply", "replies"; "day", "days"). */
export const pluralOf = (one: string) => one.replace(/(\w+)$/, (word) => (/(s|x|ch|sh)$/.test(word) ? word + "es" : word.replace(/([^aeiou])y$/, "$1ie") + "s"));
/** One value built per language and kept: formatters cost far more to build than to use. */
export function perLanguage<T>(build: (locale: string) => T): () => T {
  const built = new Map<string, T>();
  return () => {
    let value = built.get(locale());
    if (value === undefined) built.set(locale(), (value = build(locale())));
    return value;
  };
}
/**
 * The plural form of a count. Where the engine has no `Intl.PluralRules` (Hermes, on Android), the rule of the app's
 * languages: French says "0 résolution" and "1 résolution", the others only "1 solve" in the singular.
 */
const plurals = perLanguage((l) =>
  typeof Intl.PluralRules === "function" ? new Intl.PluralRules(l) : { select: (n: number) => ((l.startsWith("fr") ? n < 2 : n === 1) ? "one" : "other") },
);
const numbers = perLanguage((l) => new Intl.NumberFormat(l));
export function tn(count: number, one: string, other = pluralOf(one)) {
  const form = plurals().select(count) === "one" ? one : other;
  return t(form, { n: numbers().format(count) });
}
/** `t` under a name no component uses for its own variables (`t` is often a tournament or a time). */
export const tr = t;
/** A prop that may be a text (translated) or anything else (left as it is). */
export const said = <T,>(x: T): T => (typeof x === "string" ? (t(x) as T) : x);
/**
 * A date formatter in the current language: `options` as for `Intl.DateTimeFormat`, a formatter built once per
 * language, so module-level formatters follow a change of language.
 */
export function localFormat(options: Intl.DateTimeFormatOptions) {
  const formatter = perLanguage((l) => new Intl.DateTimeFormat(l, options));
  return { format: (date?: Date | number) => formatter().format(date), formatToParts: (date?: Date | number) => formatter().formatToParts(date) };
}
