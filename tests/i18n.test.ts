import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { detect, LANGUAGES, provide, setLanguage, t, tn } from "../src/client/i18n";
import { msg } from "../src/client/i18n/msg";
import { wrap } from "../scripts/i18n-wrap";

const keys: string[] = JSON.parse(readFileSync("src/client/i18n/keys.json", "utf8"));
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

describe("languages", () => {
  test("the browser's first language the app speaks, English otherwise", () => {
    expect(detect(["fr-FR", "en"])).toBe("fr");
    expect(detect(["pt-BR", "de-AT"])).toBe("de");
    expect(detect(["pt-BR"])).toBe("en");
    expect(detect([])).toBe("en");
  });

  test("texts, their values, and texts built elsewhere from a known pattern", async () => {
    provide("fr", { Ready: "Prêt", "{0} algorithms": "{0} algorithmes", "Your slowest {0}": "Tes {0} les plus lents", OLLs: "OLL", "{n} solve": "{n} résolution", "{n} solves": "{n} résolutions" });
    await setLanguage("fr", false);
    expect(t("Ready")).toBe("Prêt");
    expect(t("Unknown text")).toBe("Unknown text");
    expect(t("{0} algorithms", { 0: 12 })).toBe("12 algorithmes");
    // Built in English by the data engine, translated where it is shown.
    expect(t(msg("{0} algorithms", { 0: 100 }))).toBe("100 algorithmes");
    expect(t(msg("Your slowest {0}", { 0: "OLLs" }))).toBe("Tes OLL les plus lents");
    // French says "0 résolution"; English "0 solves".
    expect(tn(0, "{n} solve")).toBe("0 résolution");
    expect(tn(2, "{n} solve")).toBe("2 résolutions");
    await setLanguage("en", false);
    expect(tn(0, "{n} solve")).toBe("0 solves");
    expect(t("Ready")).toBe("Ready");
    // The real French back, for the tests that run after this one in the same process.
    provide("fr", JSON.parse(readFileSync("src/client/i18n/fr.json", "utf8")));
  });

  test("the wrapping of texts runs again without changing anything", () => {
    const source = `import { x } from "y";\nexport const A = () => <p title="Some title">Hello there {n ? "yes" : \`\${n} cases\`}</p>;\n`;
    const once = wrap("desktop/renderer/sample.tsx", source);
    expect(once).toContain('{tr("Hello there")}');
    expect(once).toContain('title={tr("Some title")}');
    expect(once).toContain('tr("{0} cases", { 0: n })');
    expect(wrap("desktop/renderer/sample.tsx", once)).toBe(once);
  });
});

describe("dictionaries", () => {
  for (const { id } of LANGUAGES.filter((l) => l.id !== "en"))
    test(`${id} translates every text, with the same values`, () => {
      const dictionary: Record<string, string> = JSON.parse(readFileSync(`src/client/i18n/${id}.json`, "utf8"));
      const missing = keys.filter((k) => typeof dictionary[k] !== "string" || !dictionary[k]!.trim());
      const mismatched = keys.filter((k) => dictionary[k] && placeholders(k) !== placeholders(dictionary[k]!));
      expect(missing.slice(0, 5)).toEqual([]);
      expect(mismatched.slice(0, 5)).toEqual([]);
    });
});

test("the privacy policy states the log retention the server applies", async () => {
  const { RETENTION } = await import("../desktop/renderer/legal/retention");
  const source = readFileSync("rust-api/src/activity.rs", "utf8");
  const constant = (name: string) => Number(new RegExp(`pub const ${name}: i64 = (\\d+);`).exec(source)?.[1]);
  expect({ ...RETENTION } as Record<string, number>).toEqual({ log: constant("RETENTION_DAYS"), traffic: constant("TRAFFIC_DAYS"), activity: constant("ACTIVITY_DAYS") });
});
