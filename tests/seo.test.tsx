import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSeo, publicOrigin } from '../scripts/build-seo';
import { PUBLIC_PAGES, SEO_PAGES, isGuide, structuredData } from '../src/frontend/seo/pages';
import { averageOf } from '../src/frontend/lib/format';
const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });

test('public origin rejects unsafe or ambiguous URLs', () => {
  expect(publicOrigin('https://cubix.test/')).toBe('https://cubix.test');
  expect(publicOrigin('')).toBe('');
  for (const invalid of ['javascript:alert(1)', 'https://user:pass@cubix.test/', 'https://cubix.test/app', 'https://cubix.test/?q=1', 'https://cubix.test/#timer']) expect(() => publicOrigin(invalid)).toThrow();
});
test('each public route ships readable content, links and unique metadata before JavaScript', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cubix-seo-')); directories.push(directory);
  await writeFile(join(directory, 'index.html'), '<html lang="en"><head><title>Cubix</title><meta name="description" content="old"></head><body><div id="root"></div><script src="./app.js"></script></body></html>');
  await buildSeo(directory, 'https://cubix.test');
  for (const page of PUBLIC_PAGES) {
    const info = SEO_PAGES[page], html = await readFile(join(directory, info.path, 'index.html'), 'utf8');
    expect(html).toContain('<h1>');
    expect(html).toContain(`href="https://cubix.test${info.path}"`);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain(info.description);
    expect(html).toContain('href="/guides/about-cubix/"');
    if (isGuide(page)) {
      expect(html).toContain('class="public-content"');
      expect(html).not.toContain('src="/app.js"');
    } else {
      expect(html).not.toContain('class="public-content"');
      expect(html).toContain('src="/app.js"');
    }
    expect(html).toContain('application/ld+json');
    expect(html).not.toContain('src="./');
    expect(html).not.toContain('noindex');
  }
  const sitemap = await readFile(join(directory, 'sitemap.xml'), 'utf8');
  expect(sitemap.match(/<loc>/g)).toHaveLength(PUBLIC_PAGES.length);
  for (const path of ['/messages/', '/account/', '/community/']) {
    expect(sitemap).not.toContain(path);
    expect(await readFile(join(directory, path, 'index.html'), 'utf8')).toContain('noindex, nofollow');
  }
  expect(await readFile(join(directory, 'robots.txt'), 'utf8')).toContain('Sitemap: https://cubix.test/sitemap.xml');
  expect(await readFile(join(directory, 'guides/ao5-ao12/index.html'), 'utf8')).not.toContain('src="/app.js"');
});
test('application schema describes real features without fabricated reviews', () => {
  const data = structuredData('playground', 'https://cubix.test');
  expect(JSON.stringify(data)).toContain('WebApplication');
  expect(JSON.stringify(data)).not.toContain('aggregateRating');
  expect(structuredData('messages', 'https://cubix.test')).toBeNull();
  expect(structuredData('playground', '')).toBeNull();
});
test('published average examples match the timer implementation', () => {
  expect(averageOf([10000,12000,13000,14000,20000])).toBe(13000);
  expect(averageOf([10000,12000,13000,14000,null])).toBe(13000);
  expect(averageOf([10000,12000,13000,null,null])).toBeNull();
  expect(averageOf(Array.from({length:12}, (_,i) => (i+10)*1000))).toBe(15500);
});
