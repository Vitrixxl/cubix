import { test, expect } from 'bun:test';
import { openDb } from './backend';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

test('HTTP serves canonical pages, real 404s, compressed files and private noindex headers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cubix-seo-http-'));
  const content = '/* verified build asset */'.repeat(100);
  try {
    mkdirSync(join(directory, 'algorithms'));
    writeFileSync(join(directory, 'index.html'), '<h1>Cube timer</h1>');
    writeFileSync(join(directory, 'algorithms/index.html'), '<h1>Cube algorithms</h1>');
    mkdirSync(join(directory, 'guides/algorithm-training'), { recursive: true });
    writeFileSync(join(directory, 'guides/algorithm-training/index.html'), '<h1>Training guide</h1>');
    writeFileSync(join(directory, 'index-1234abcd.js'), content);
    writeFileSync(join(directory, 'index-1234abcd.js.gz'), gzipSync(content));
    const modelHash = 'a'.repeat(64);
    mkdirSync(join(directory, 'cube-library/models/test'), { recursive: true });
    writeFileSync(join(directory, `cube-library/models/test/${modelHash}.glb`), 'static geometry');
    writeFileSync(join(directory, 'cube-library/models/test/mutable.glb'), 'unversioned geometry');
    const { createRustApi } = await import('./backend');
    const app = createRustApi(openDb().path, { CUBIX_ASSETS: directory });
    const origin = `http://127.0.0.1:${app.server.port}`;
    for (const [path, target] of [['/index.html','/'], ['/timer/','/'], ['/algorithms','/algorithms/'], ['/algorithms/index.html','/algorithms/'], ['/guides/algorithm-training','/guides/algorithm-training/'], ['/guides/algorithm-training/index.html','/guides/algorithm-training/']]) {
      const response = await fetch(origin + path, { redirect: 'manual' });
      expect(response.status).toBe(308);
      expect(response.headers.get('location')).toBe(target);
    }
    expect((await fetch(origin + '/does-not-exist')).status).toBe(404);
    expect(await (await fetch(origin + '/algorithms/')).text()).toContain('Cube algorithms');
    expect(await (await fetch(origin + '/guides/algorithm-training/')).text()).toContain('Training guide');
    const asset = await fetch(origin + '/index-1234abcd.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(asset.headers.get('content-encoding')).toBe('gzip');
    expect(asset.headers.get('vary')).toContain('Accept-Encoding');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(await asset.text()).toBe(content);
    const model = await fetch(origin + `/cube-library/models/test/${modelHash}.glb`);
    expect(model.status).toBe(200);
    expect(model.headers.get('cache-control')).toContain('max-age=31536000, immutable');
    expect(await model.text()).toBe('static geometry');
    expect((await fetch(origin + '/cube-library/models/test/mutable.glb')).headers.get('cache-control')).not.toContain('immutable');
    expect((await fetch(origin + `/cube-library/models/test/${'b'.repeat(64)}.glb`)).status).toBe(404);
    expect((await fetch(origin + '/api/health')).headers.get('x-robots-tag')).toContain('noindex');
    expect((await fetch(origin + '/aaaaadmin')).headers.get('x-robots-tag')).toContain('noindex');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
