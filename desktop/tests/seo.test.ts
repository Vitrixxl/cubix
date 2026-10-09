import { expect, test } from "bun:test";
import { canonicalCase, pageFile, pageSeo, prerenderedPages, seoOf } from "../renderer/seo";
import { pageDocument } from "../renderer/pageDocument";
import { localePath, readRoute } from "../../src/client/lib/route";
import { setLanguage } from "../../src/client/i18n";

test("each public page has its title, description and address; an account's page has none", () => {
  const oll = seoOf("/algorithms/OLL%2021", "?puzzle=333")!;
  expect(oll.path).toBe("/algorithms/OLL%2021");
  expect(oll.title).toContain("OLL 21");
  expect(oll.description).toContain("R U R' U R U' R' U R U2 R'");
  expect(oll.description.length).toBeLessThanOrEqual(160);
  expect(oll.trail.at(-1)).toEqual(["OLL 21", "/algorithms/OLL%2021"]);
  expect(seoOf("/timer", "")!.path).toBe("/timer?puzzle=333");
  expect(seoOf("/timer", "?puzzle=pyram")!.title).toContain("Pyraminx");
  expect(seoOf("/learn/cfop", "?puzzle=333&step=2")!.path).toBe("/learn/cfop?puzzle=333&step=2");
  for (const path of ["/community", "/profile", "/login", "/duel", "/training/practice", "/onboarding"]) expect(seoOf(path, "")).toBeNull();
});

test("a big cube's copy of a 3×3 case stands for the 3×3 case", () => {
  expect(canonicalCase("4x4 OLL 21")).toBe("OLL 21");
  expect(canonicalCase("OLL 21")).toBe("OLL 21");
  expect(pageSeo(readRoute("/algorithms/7x7%20PLL%20Ua", ""))!.path).toBe("/algorithms/PLL%20Ua");
});

test("every page built ahead of time is found by the address the API is given", () => {
  const pages = prerenderedPages();
  const urls = pages.map((p) => p.url);
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls).toContain("/algorithms/OLL%2021");
  expect(urls).not.toContain("/algorithms/4x4%20OLL%2021");
  expect(pages.find((p) => p.url === "/timer?puzzle=333")!.files).toEqual(["timer@333.html", "timer.html"]);
  expect(pageFile("/learn/cfop?puzzle=333&step=2")).toBe("learn/cfop@333~2.html");
  expect(pageFile("/algorithms/OLL%2021")).toBe("algorithms/OLL 21.html");
  // Each one is a page for search engines, its address the one it is built for.
  for (const { url } of pages) {
    const { pathname, search } = new URL(url, "https://x");
    expect(seoOf(pathname, search)?.path, url).toBe(url);
  }
});

test("a page's document says what it is in its language, and names the others", async () => {
  await setLanguage("fr", false);
  const seo = seoOf("/algorithms/OLL%2021", "")!;
  const html = pageDocument('<html lang="en"><head><title>Qbix</title>\n    <!-- shell -->\n    <meta name="robots" content="noindex" /></head><body><div id="root"></div></body></html>', { language: "fr", seo, body: "<main>$& body</main>", theme: { background: "#000" }, localePath });
  await setLanguage("en", false);
  expect(html).toContain('<html lang="fr" class="dark"');
  expect(html).toContain('<link rel="canonical" href="https://cubix.vitrixxl.fr/fr/algorithms/OLL%2021" />');
  expect(html).toContain('hreflang="de" href="https://cubix.vitrixxl.fr/de/algorithms/OLL%2021"');
  expect(html).toContain('hreflang="x-default" href="https://cubix.vitrixxl.fr/algorithms/OLL%2021"');
  expect(html).not.toContain("noindex");
  expect(html).toContain('<div id="prerendered"><main>$& body</main></div><div id="root"></div>');
  expect(html).toContain('"@type":"BreadcrumbList"');
});
