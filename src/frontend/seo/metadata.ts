import { SEO_PAGES, structuredData, type SeoPage } from './pages';
export function pageMeta(page: SeoPage, origin: string) {
  const info = SEO_PAGES[page];
  return {
    description: info.description,
    robots: info.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    'og:type': 'website', 'og:site_name': 'Cubix', 'og:locale': 'en_US',
    'og:title': info.title, 'og:description': info.description,
    'twitter:card': 'summary_large_image', 'twitter:title': info.title, 'twitter:description': info.description,
    ...(origin ? { 'og:url': origin + info.path, 'og:image': origin + '/og-image.png', 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': 'Cubix: free online cube timer with scrambles, solve history and averages', 'twitter:image': origin + '/og-image.png' } : {}),
  };
}
export function updatePageMetadata(page: SeoPage) {
  const origin = document.querySelector<HTMLMetaElement>('meta[name="cubix-public-url"]')?.content ?? '';
  document.title = SEO_PAGES[page].title;
  for (const [key, content] of Object.entries(pageMeta(page, origin))) {
    const attribute = key.startsWith('og:') ? 'property' : 'name';
    let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute(attribute, key); document.head.append(meta); }
    meta.content = content;
  }
  if (origin) {
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = origin + SEO_PAGES[page].path;
  }
  const data = structuredData(page, origin);
  let script = document.getElementById('cubix-structured-data');
  if (data) {
    if (!script) { script = document.createElement('script'); script.id = 'cubix-structured-data'; script.setAttribute('type', 'application/ld+json'); document.head.append(script); }
    script.textContent = JSON.stringify(data);
  } else script?.remove();
}
