/**
 * A page of the app written ahead of time (desktop/prerender.tsx): the app's own index.html, its head telling search
 * engines and link previews what the page is (title, description, address in each language, breadcrumb trail), the
 * page drawn in its body beside the empty root the app starts in.
 */
import { LANGUAGES, type Language } from "../../src/client/i18n";
import { escape } from "./landing/document";
import { NAME, SITE } from "./landing/content";
import { pageTitle, type PageSeo } from "./seo";
import { PHONE_MAX_WIDTH } from "../../src/client/lib/viewport";

const ogLocale = (language: Language) => LANGUAGES.find((l) => l.id === language)!.locale.replace("-", "_");
const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** `theme`, the default theme's CSS variables, set on the page as the app sets them (theme.ts `applyTheme`). */
export function pageDocument(template: string, { language, seo, body, theme, localePath }: { language: Language; seo: PageSeo; body: string; theme: Record<string, string>; localePath: (language: string, path: string) => string }) {
  const tokens = Object.entries(theme).map(([key, value]) => `--${key}:${value}`).join(";");
  const url = SITE + localePath(language, seo.path);
  const title = escape(pageTitle(seo)), description = escape(seo.description);
  const trail = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: seo.trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + (path === "/" ? (language === "en" ? "/" : `/${language}/`) : localePath(language, path)) })),
  };
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${url}" />`,
    ...LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l.id}" href="${SITE}${localePath(l.id, seo.path)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}${seo.path}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${NAME}" />`,
    `<meta property="og:locale" content="${ogLocale(language)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE}/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${json(trail)}</script>`,
    // The app starts out of sight, over the page, until it draws the page itself (app.tsx `reveal`); an account's device
    // and a phone (the layout's widest, viewport.ts) never show the page, a guest's on a wide window (boot.ts).
    `<style>html:not([data-account]) #prerendered~#root{position:fixed;inset:0;visibility:hidden;pointer-events:none}[data-account] #prerendered{display:none}` +
      `@media (max-width:${PHONE_MAX_WIDTH}px){html[data-js] #prerendered{display:none}html[data-js] #prerendered~#root{position:static;visibility:visible;pointer-events:auto}}</style>`,
  ].join("\n    ");
  const html = template
    .replace(/<html lang="[^"]*"/, () => `<html lang="${language}" class="dark" style="color-scheme:dark;${escape(tokens)}"`)
    .replace(/<meta name="theme-color" content="[^"]*"/, () => `<meta name="theme-color" content="${escape(theme.background ?? "#0b0b0e")}"`)
    .replace(/<title>[^<]*<\/title>/, () => head)
    .replace(/\s*<!--[^>]*-->\s*<meta name="robots" content="noindex" \/>/, "")
    .replace('<div id="root"></div>', () => `<div id="prerendered">${body}</div><div id="root"></div>`);
  if (!html.includes('id="prerendered"') || html.includes('content="noindex"')) throw new Error("index.html no longer has the places a page is written into");
  return html;
}
