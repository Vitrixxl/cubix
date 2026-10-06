/**
 * The landing page's HTML document and the files written beside it for search engines and language models, all from
 * the same content (content.ts): meta and social tags, structured data (schema.org), robots.txt, sitemap.xml,
 * llms.txt and llms-full.txt (https://llmstxt.org).
 */
import { DESCRIPTION, FAQ, FEATURES, IMPORTS, NAME, PUZZLES, SITE, SOURCE, TAGLINE, TITLE } from "./content";
import { LEGAL_DOCUMENTS } from "../legal/paths";

export const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON inside <script>: nothing in it may close the element. */
const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** schema.org data: the application (free, its platforms and features), its questions, the site. */
export function structuredData() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: NAME,
      url: SITE + "/",
      description: DESCRIPTION,
      applicationCategory: "GameApplication",
      applicationSubCategory: "Speedcubing timer and algorithm trainer",
      operatingSystem: "Web, Windows, Linux, macOS, Android",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      featureList: FEATURES.flatMap((feature) => feature.points),
      image: SITE + "/og.png",
      downloadUrl: SITE + "/#download",
      isAccessibleForFree: true,
      sameAs: [SOURCE],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
    },
    { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: SITE + "/", description: TAGLINE },
  ];
}

/**
 * The whole page: `body` is the rendered landing page, `theme` the default theme's CSS variables, set on `html.landing`
 * so they stand over the stylesheet's own (`.dark`).
 */
export function landingDocument({ body, theme, styles, scripts }: { body: string; theme: Record<string, string>; styles: string[]; scripts: string[] }) {
  const tokens = Object.entries(theme)
    .map(([key, value]) => `--${key}:${value}`)
    .join(";");
  return `<!doctype html>
<html lang="en" class="dark landing" style="color-scheme:dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
    />
    <title>${escape(TITLE)}</title>
    <meta name="description" content="${escape(DESCRIPTION)}" />
    <meta name="keywords" content="speedcubing, cube timer, rubik's cube timer, speedcube timer, csTimer alternative, OLL, PLL, F2L, ZBLL, algorithm trainer, WCA, 3x3, Square-1, Pyraminx, Skewb, Megaminx" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${SITE}/" />
    <meta name="theme-color" content="${escape(theme.background ?? "#0b0b0e")}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${NAME}" />
    <meta property="og:title" content="${escape(TITLE)}" />
    <meta property="og:description" content="${escape(DESCRIPTION)}" />
    <meta property="og:url" content="${SITE}/" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escape(`${NAME}: ${TAGLINE}`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(TITLE)}" />
    <meta name="twitter:description" content="${escape(DESCRIPTION)}" />
    <meta name="twitter:image" content="${SITE}/og.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-192.png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="alternate" type="text/markdown" href="/llms.txt" title="${NAME} for language models" />
    <style>html.landing{${tokens}}</style>
    ${styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    ")}
    ${structuredData()
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

export const sitemap = (date: string) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${date}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${LEGAL_DOCUMENTS.map(({ path }) => `  <url><loc>${SITE}${path}</loc><lastmod>${date}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>\n`).join("")}  <url><loc>${SITE}/llms.txt</loc><lastmod>${date}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>
</urlset>
`;

/** https://llmstxt.org: what the site is, in a few lines, and where to read more. */
export const llms = () => `# ${NAME}

> ${DESCRIPTION}

${NAME} is free on every platform, without ads, premium tier or subscription. It is an independent, open-source project, not affiliated with Rubik's or the World Cube Association.

## Use it

- [Open ${NAME} in the browser](${SITE}/timer): the web app, installable and usable offline
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
- Android (64-bit ARM): download ${SITE}/api/mobile/apk and open it. The app updates itself.
- iPhone and iPad: no app yet; use ${NAME} in Safari and add it to the Home Screen.

## Questions

${FAQ.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}
`;
