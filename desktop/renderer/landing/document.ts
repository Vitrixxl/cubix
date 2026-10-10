/**
 * The landing page's HTML document and the files written beside it for search engines and language models, all from
 * the same content (content.ts): meta and social tags, structured data (schema.org), robots.txt, sitemap.xml,
 * llms.txt and llms-full.txt (https://llmstxt.org).
 */
import { DESCRIPTION, FAQ, FEATURES, IMPORTS, NAME, PUZZLES, SITE, SOURCE, TAGLINE, TITLE } from "./content";
import { LEGAL_DOCUMENTS } from "../legal/paths";
import { LANGUAGES, t, type Language } from "../../../src/client/i18n";

/** Each language's landing page: English at the root, the others under their code (`/fr/`). */
export const landingPath = (language: Language) => (language === "en" ? "/" : `/${language}/`);

export const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON inside <script>: nothing in it may close the element. */
const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** schema.org data: the application (free, its platforms and features), its questions, the site, in the current language. */
export function structuredData(language: Language = "en") {
  const url = SITE + landingPath(language);
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: NAME,
      url,
      description: t(DESCRIPTION),
      applicationCategory: "GameApplication",
      applicationSubCategory: "Speedcubing timer and algorithm trainer",
      operatingSystem: "Web, Windows, Linux, macOS, Android",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      featureList: FEATURES.flatMap((feature) => feature.points.map((point) => t(point))),
      image: SITE + "/og.png",
      screenshot: SITE + "/assets/landing/timer.webp",
      inLanguage: LANGUAGES.map((l) => l.id),
      downloadUrl: SITE + "/#download",
      isAccessibleForFree: true,
      sameAs: [SOURCE],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: language,
      mainEntity: FAQ.map((item) => ({ "@type": "Question", name: t(item.question), acceptedAnswer: { "@type": "Answer", text: t(item.answer) } })),
    },
    { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url, inLanguage: language, description: t(TAGLINE) },
  ];
}

/**
 * The whole page in `language`, the current one (see desktop/web.ts): `body` is the rendered landing page, `theme` the
 * default theme's CSS variables, set on `html.landing` so they stand over the stylesheet's own (`.dark`). Each language's
 * page names the others for search engines (hreflang), the English one at the root by default.
 */
export function landingDocument({ language = "en", body, theme, styles, scripts, app = [] }: { language?: Language; body: string; theme: Record<string, string>; styles: string[]; scripts: string[]; /** The app's first files, fetched ahead when a link to it is pointed at (landing/main.tsx). */ app?: string[] }) {
  const title = escape(t(TITLE)), description = escape(t(DESCRIPTION)), url = SITE + landingPath(language);
  const ogLocale = (id: Language) => LANGUAGES.find((l) => l.id === id)!.locale.replace("-", "_");
  const tokens = Object.entries(theme)
    .map(([key, value]) => `--${key}:${value}`)
    .join(";");
  return `<!doctype html>
<html lang="${language}" class="dark landing" style="color-scheme:dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
    />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    ${LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l.id}" href="${SITE}${landingPath(l.id)}" />`).join("\n    ")}
    <link rel="alternate" hreflang="x-default" href="${SITE}/" />
    <meta name="theme-color" content="${escape(theme.background ?? "#0b0b0e")}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${ogLocale(language)}" />
    ${LANGUAGES.filter((l) => l.id !== language).map((l) => `<meta property="og:locale:alternate" content="${ogLocale(l.id)}" />`).join("\n    ")}
    <meta property="og:site_name" content="${NAME}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escape(`${NAME}: ${t(TAGLINE)}`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE}/og.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-192.png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="alternate" type="text/markdown" href="/llms.txt" title="${NAME} for language models" />
    <meta name="cubix-app" content="${escape(app.join(" "))}" />
    <style>html.landing{${tokens}}</style>
    ${styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    ")}
    ${structuredData(language)
      .map((data) => `<script type="application/ld+json">${json(data)}</script>`)
      .join("\n    ")}
  </head>
  <body>
    <div id="root">${body}</div>
    ${scripts.map((src) => `<script type="module" src="${src}"></script>`).join("\n    ")}
  </body>
</html>
`;
}

export const robots = () => `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

Sitemap: ${SITE}/sitemap.xml
`;

/** The app's public pages (desktop/prerender.tsx) in every language, each naming the others (hreflang). */
const appPages = (date: string, pages: string[]) =>
  pages
    .flatMap((path) => {
      const at = (language: Language) => SITE + (language === "en" ? path : `/${language}${path}`).replace(/&/g, "&amp;");
      const alternates = LANGUAGES.map(({ id }) => `<xhtml:link rel="alternate" hreflang="${id}" href="${at(id)}"/>`).join("");
      return LANGUAGES.map(({ id }) => `  <url><loc>${at(id)}</loc><lastmod>${date}</lastmod>${alternates}</url>\n`);
    })
    .join("");

export const sitemap = (date: string, pages: string[] = []) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGUAGES.map(({ id }) => `  <url><loc>${SITE}${landingPath(id)}</loc><lastmod>${date}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`).join("")}${LEGAL_DOCUMENTS.map(({ path }) => `  <url><loc>${SITE}${path}</loc><lastmod>${date}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>\n`).join("")}${appPages(date, pages)}</urlset>
`;

/** https://llmstxt.org: what the site is, in a few lines, and where to read more. */
export const llms = () => `# ${NAME}

> ${DESCRIPTION}

${NAME} is free on every platform, without ads, premium tier or subscription. It is an independent, open-source project, not affiliated with Rubik's or the World Cube Association.

## Use it

- [Open ${NAME} in the browser](${SITE}/timer): the web app, installable and usable offline
- [Algorithms](${SITE}/algorithms?puzzle=333): every case of every puzzle (F2L, OLL, PLL, ZBLL and more), with its algorithms
- [Learn](${SITE}/learn?puzzle=333): step-by-step courses for each puzzle's methods
- [Download for your platform](${SITE}/#download): Windows (\`irm ${SITE}/install.ps1 | iex\`), Linux (\`curl -fsSL ${SITE}/install.sh | sh\`), macOS (built from source), Android (APK)
- [Android APK](${SITE}/api/mobile/apk): direct download

## Features

${FEATURES.map((feature) => `- [${feature.title}](${SITE}/#${feature.id}): ${feature.summary}`).join("\n")}

## Details

- [Everything ${NAME} does, in full](${SITE}/llms-full.txt)
- [Source code](${SOURCE})

## Optional

- [Frequently asked questions](${SITE}/#faq)
`;

/** Every feature and answer in full, for a language model to read at once. */
export const llmsFull = () => `# ${NAME}: the free speedcubing timer and algorithm trainer

> ${DESCRIPTION}

Website: ${SITE}/ · Web app: ${SITE}/timer · Source code: ${SOURCE}

${NAME} is free on every platform, without ads, premium tier or subscription. It is an independent, open-source project, not affiliated with Rubik's or the World Cube Association.

## Puzzles

${PUZZLES.join(", ")}.

${FEATURES.map((feature) => `## ${feature.title}

${feature.summary}

${feature.points.map((point) => `- ${point}`).join("\n")}`).join("\n\n")}

## Importing from another timer

${NAME} reads the exports of ${IMPORTS.join(", ")}, on the device, with each solve's date, penalty, scramble and session. Importing a file twice adds nothing twice.

## Install

- Web: open ${SITE}/timer in any recent browser; Chrome, Edge and Safari can install it as an app. It works offline.
- Windows 10 and 11 (64-bit): in PowerShell, \`irm ${SITE}/install.ps1 | iex\`. Installs for the current user with a Start menu shortcut, no administrator rights.
- Linux (x64): \`curl -fsSL ${SITE}/install.sh | sh\`. Installs for the current user, with a menu entry and the \`cubix\` command, no sudo.
- macOS: built from source with Bun: \`git clone ${SOURCE}.git && cd cubix && bun install --frozen-lockfile && bun run build:desktop\`, then copy Cubix.app to /Applications.
- Lighter desktop app (Tauri): the same app drawn by the system's webview (WebView2, WebKitGTK 4.1, WebKit) instead of its own Chromium. Windows: \`$env:CUBIX_SHELL='tauri'; irm ${SITE}/install.ps1 | iex\`. Linux: \`curl -fsSL ${SITE}/install.sh | sh -s -- --tauri\`. macOS: built from source with Rust: \`cd cubix/desktop/tauri && cargo install tauri-cli --version "^2" --locked && cargo tauri build --bundles app\`. Each desktop app replaces the other.
- Android (64-bit ARM): download ${SITE}/api/mobile/apk and open it. The app updates itself.
- iPhone and iPad: no app yet; use ${NAME} in Safari and add it to the Home Screen.

## Questions

${FAQ.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}
`;
