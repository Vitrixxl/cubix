/** The HTML document of a legal page: its rendered body, the default theme, its title and description. */
import { escape } from "../landing/document";
import { SITE } from "../landing/content";

export function legalDocument({ title, body, theme, styles, scripts, path }: { title: string; body: string; theme: Record<string, string>; styles: string[]; scripts: string[]; path: string }) {
  const tokens = Object.entries(theme).map(([key, value]) => `--${key}:${value}`).join(";");
  return `<!doctype html>
<html lang="fr" class="dark landing" style="color-scheme:dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'" />
    <title>${escape(title)} · Qbix</title>
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${SITE}${path}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>html.landing{${tokens}}</style>
    ${styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    ")}
  </head>
  <body>
    <div id="root">${body}</div>
    ${scripts.map((src) => `<script type="module" src="${src}"></script>`).join("\n    ")}
  </body>
</html>
`;
}
