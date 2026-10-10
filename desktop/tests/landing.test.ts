import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { detectPlatform, Landing } from "../renderer/landing/Landing";
import { FAQ, FEATURES, SITE } from "../renderer/landing/content";
import { landingDocument, llms, llmsFull, robots, sitemap, structuredData } from "../renderer/landing/document";
import { desktopVersion } from "../package-release";
import { applyAlg, colorOf, solved, type CubeState } from "../../src/shared/cube";
import { INSPECTION, SCRAMBLE, SOLUTION, TURN_BACK, TURNS, loopScene, solveScene } from "../renderer/landing/solve";
import { setLanguage } from "../../src/client/i18n";

describe("the landing page", () => {
  test("knows the visitor's platform from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0")).toBe("linux");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130.0 Mobile")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    // An iPad asks for the desktop site: a Mac with touch.
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe("ios");
    expect(detectPlatform("SomeBot/1.0")).toBe("web");
  });

  test("renders whole without JavaScript: every feature, the downloads, the questions", () => {
    const html = renderToString(createElement(Landing));
    expect(html).toContain("<h1");
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    expect(text).toContain("The free speedcubing app");
    // Each feature: shown live with its words, or in a card of its own.
    for (const id of ["timer", "learn", "algorithms", "training", "duel"]) expect(text).toContain(FEATURES.find((f) => f.id === id)!.hook);
    for (const id of ["coaching", "everywhere"]) expect(html).toContain(`id="${id}"`);
    // No figures on the page: it shows what the app does.
    expect(text).not.toMatch(/6,500|1,737/);
    for (const item of FAQ) expect(html).toContain(item.question.replace(/'/g, "&#x27;"));
    expect(html).toContain("buymeacoffee.com");
    expect(html).toContain('href="/timer"');
    expect(html).toContain("install.ps1");
    expect(html).toContain("Tauri");
    expect(html).toContain("/api/mobile/apk");
    expect(html).not.toContain("smartCube");
  });

  test("tells search engines and language models what the site is", () => {
    const page = landingDocument({ body: "<main></main>", theme: { background: "#000" }, styles: ["/build/a.css"], scripts: ["/build/main-a.js"] });
    for (const tag of [`<link rel="canonical" href="${SITE}/" />`, 'property="og:image"', 'name="twitter:card"', 'name="description"', 'href="/llms.txt"']) expect(page).toContain(tag);
    const data = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    expect(data.map((d) => d["@type"])).toEqual(["SoftwareApplication", "FAQPage", "WebSite"]);
    expect(data[0]!.offers.price).toBe("0");
    expect(data[1]!.mainEntity).toHaveLength(FAQ.length);
    expect((structuredData()[0] as { featureList: string[] }).featureList.length).toBeGreaterThan(20);
    expect(robots()).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots()).toContain("Disallow: /api/");
    expect(sitemap("2026-10-06")).toContain(`<loc>${SITE}/</loc><lastmod>2026-10-06</lastmod>`);
    expect(llms()).toMatch(/^# Qbix\n\n> /);
    expect(llms()).toContain(`(${SITE}/llms-full.txt)`);
    for (const feature of FEATURES) expect(llmsFull()).toContain(`## ${feature.title}`);
  });

  test("has a page of its own in each language, each naming the others", async () => {
    await setLanguage("fr", false);
    try {
      const page = landingDocument({ language: "fr", body: "", theme: {}, styles: [], scripts: [] });
      expect(page).toContain('<html lang="fr"');
      expect(page).toContain(`<link rel="canonical" href="${SITE}/fr/" />`);
      expect(page).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE}/" />`);
      expect(page).toContain("<title>Qbix : le chrono de speedcubing");
      expect(sitemap("2026-10-06")).toContain(`<loc>${SITE}/de/</loc>`);
    } finally {
      await setLanguage("en", false);
    }
  });

  test("the cube at the top replays the world record: its official scramble, solved by its reconstruction", () => {
    // Every face of one colour, whichever way the cube is held.
    const uniform = (state: CubeState) => [0, 1, 2, 3, 4, 5].every((face) => [...Array(9).keys()].every((i) => colorOf(state, face * 9 + i) === colorOf(state, face * 9 + 4)));
    // Scrambled as the WCA does, white on top and green in front, then inspected and solved.
    const scrambled = applyAlg(solved(3), SCRAMBLE);
    expect(uniform(scrambled)).toBe(false);
    expect(uniform(applyAlg(scrambled, [INSPECTION, ...SOLUTION.map((step) => step.alg)].join(" ")))).toBe(true);
    expect(TURNS).toBe(32);
    const scene = solveScene(), loop = loopScene();
    expect(scene.states[0]).toEqual(Array.from(scrambled));
    expect(uniform(Uint16Array.from(scene.states.at(-1)!))).toBe(true);
    // The loop turns the solved cube back, scrambles it to the same cube, and ends where it began.
    expect(loop.states[TURN_BACK.split(" ").length + SCRAMBLE.split(" ").length]).toEqual(scene.states[0]!);
    expect(loop.states.at(-1)).toEqual(loop.states[0]!);
  });

  test("the scrambled cube is drawn in the page before any script runs", () => {
    const html = renderToString(createElement(Landing));
    expect(html).toContain("data-still");
    expect(html.match(/<polygon/g)!.length).toBeGreaterThan(27);
    for (const demo of ["timer", "learn", "algorithms", "training", "duel"]) expect(html).toContain(`data-demo="${demo}"`);
  });

  test("the desktop version digests the shell: the same sources, the same version", async () => {
    const version = await desktopVersion();
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect(await desktopVersion()).toBe(version);
  });
});
