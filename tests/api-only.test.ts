import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRustApi, openDb } from './backend';

test('API remains available but obsolete web assets and routes are never served', async () => {
  const assets = mkdtempSync(join(tmpdir(), 'cubix-retired-web-'));
  const db = openDb();
  try {
    mkdirSync(join(assets, 'admin'));
    for (const path of ['index.html', 'admin/index.html', 'sw.js', 'icon-192.png']) {
      writeFileSync(join(assets, path), 'obsolete web application');
    }
    const api = createRustApi(db.path, { CUBIX_ASSETS: assets, CUBIX_PWA: assets });
    const get = (path: string) => api.handle(new Request('http://localhost' + path));
    expect((await get('/api/health')).status).toBe(200);
    expect((await get('/api/cases')).status).toBe(200);
    for (const path of ['/', '/index.html', '/algorithms/', '/training/', '/aaaaadmin', '/aaaaadmin/', '/admin/index.html', '/sw.js', '/pwa/icon-192.png', '/guides/about-cubix/', '/sitemap.xml', '/robots.txt']) {
      const response = await get(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('content-type') ?? '', path).not.toContain('text/html');
    }
  } finally {
    db.db.close();
    rmSync(assets, { recursive: true, force: true });
  }
});
