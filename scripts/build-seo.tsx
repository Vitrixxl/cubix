import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicContent } from '../src/frontend/seo/PublicContent';
import { SEO_PAGES, PUBLIC_PAGES, isGuide, structuredData, type SeoPage } from '../src/frontend/seo/pages';
import { pageMeta } from '../src/frontend/seo/metadata';

export function publicOrigin(value = '') {
  if (!value.trim()) return '';
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('CUBIX_PUBLIC_URL must be a public origin, e.g. https://cubix.example (no path, credentials, query or fragment).');
  return url.origin;
}
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function seoHead(page: SeoPage, origin: string) {
  const data = structuredData(page, origin);
  return `<title>${escape(SEO_PAGES[page].title)}</title>\n<meta name="cubix-public-url" content="${escape(origin)}">\n` +
    Object.entries(pageMeta(page, origin)).map(([key, value]) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escape(value)}">`).join('\n') +
    (origin ? `\n<link rel="canonical" href="${escape(origin + SEO_PAGES[page].path)}">` : '') +
    (data ? `\n<script id="cubix-structured-data" type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>` : '');
}
export function renderGuide(page: SeoPage, origin = "") {
  const content = renderToStaticMarkup(<PublicContent page={page} primary />);
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${seoHead(page, origin)}<link rel="icon" href="/pwa/icon-192.png"><link rel="stylesheet" href="/seo.css"></head><body class="public-guide"><header><a href="/" aria-label="Cubix home"><strong>CUBIX</strong></a><a href="/">Open cube timer</a></header><main>${content}</main></body></html>`;
}
export async function buildSeo(outdir = 'dist/view', configuredOrigin = process.env.CUBIX_PUBLIC_URL ?? '') {
  const origin = publicOrigin(configuredOrigin);
  const shell = await readFile(`${outdir}/index.html`, 'utf8');
  for (const page of Object.keys(SEO_PAGES) as SeoPage[]) {
    const info = SEO_PAGES[page];
    const content = renderToStaticMarkup(<PublicContent page={page} primary />);
    const boot = `<div class="public-boot"><p>Opening Cubix…</p><noscript><p>Enable JavaScript to use the interactive timer and algorithm tools.</p><p>You can still read the practice guides below.</p></noscript></div>`;
    let html: string;
    if (isGuide(page)) html = renderGuide(page, origin);
    else {
      // Bundled asset paths must remain root-relative on every public URL.
      html = shell.replace(/<meta name="description"[^>]*>/, '')
        .replace(/<title>[\s\S]*?<\/title>/, seoHead(page, origin))
        .replace('<div id="root"></div>', `<div id="root">${boot}${content}</div>`)
        .replace(/(src|href)="\.\/([^"#]+)"/g, '$1="/$2"');
    }
    const directory = info.path === '/' ? outdir : outdir + info.path.slice(0, -1);
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/index.html`, html);
  }
  await writeFile(`${outdir}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /api/\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`);
  await writeFile(`${outdir}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? PUBLIC_PAGES.map(page => `\n  <url><loc>${escape(origin + SEO_PAGES[page].path)}</loc></url>`).join('') : ''}\n</urlset>\n`);
  if (!origin) console.warn('SEO: set CUBIX_PUBLIC_URL for production canonical URLs, social images and sitemap entries.');
}
if (import.meta.main) await buildSeo();
