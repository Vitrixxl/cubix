import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { createRustApi, openDb } from './backend';

test('the API serves the built web app next to /api, with immutable bundles', async () => {
  const web = mkdtempSync(join(tmpdir(), 'cubix-web-'));
  const db = openDb();
  try {
    mkdirSync(join(web, 'build'));
    writeFileSync(join(web, 'index.html'), '<div id="root"></div>');
    writeFileSync(join(web, 'sw.js'), 'self');
    writeFileSync(join(web, 'build/main-abc.js'), 'console.log(1)');
    writeFileSync(join(web, 'build/main-abc.js.gz'), gzipSync('console.log(1)'));
    const api = createRustApi(db.path, { CUBIX_WEB_DIR: web });
    const get = (path: string, headers: Record<string, string> = {}) => api.handle(new Request('http://localhost' + path, { headers }));
    expect((await get('/api/health')).status).toBe(200);
    expect((await get('/api/health')).headers.get('cache-control')).toBe('no-store');
    expect((await get('/api/unknown')).headers.get('content-type')).toContain('application/json');
    const page = await get('/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(await page.text()).toContain('id="root"');
    expect((await get('/sw.js')).headers.get('cache-control')).toBe('no-cache');
    const bundle = await get('/build/main-abc.js', { 'accept-encoding': 'gzip' });
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get('cache-control')).toContain('immutable');
    expect(bundle.headers.get('content-encoding')).toBe('gzip');
    for (const path of ['/algorithms/', '/aaaaadmin', '/build/missing.js']) {
      const response = await get(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get('content-type') ?? '', path).not.toContain('text/html');
    }
  } finally {
    db.db.close();
    rmSync(web, { recursive: true, force: true });
  }
});

test('without a web build the server answers the API only', async () => {
  const db = openDb();
  try {
    const api = createRustApi(db.path, { CUBIX_WEB_DIR: join(tmpdir(), 'cubix-no-web-build') });
    expect((await api.handle(new Request('http://localhost/api/health'))).status).toBe(200);
    expect((await api.handle(new Request('http://localhost/'))).status).toBe(404);
  } finally {
    db.db.close();
  }
});
