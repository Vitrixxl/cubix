import { afterEach, expect, test } from 'bun:test';
import { cachedModelBytes, MODEL_CACHE, modelCacheKey } from '../src/frontend/lib/cube-model-cache';

const realFetch = globalThis.fetch, realCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realCaches) Object.defineProperty(globalThis, 'caches', realCaches); else delete (globalThis as any).caches;
});
function fixture(text: string) {
  const bytes = new TextEncoder().encode(text).buffer;
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  return { bytes, file: { sha256, url: `/cube-library/models/test/${sha256}.glb` } };
}
function cacheFixture() {
  const entries = new Map<string, Response>();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async (name: string) => {
    expect(name).toBe(MODEL_CACHE);
    return { match: async (key: string) => entries.get(key)?.clone(), put: async (key: string, response: Response) => { entries.set(key, response.clone()); }, delete: async (key: string) => entries.delete(key) };
  } } });
  return entries;
}

test('one static download for concurrent views, zero requests on a later offline visit', async () => {
  cacheFixture(); const { bytes, file } = fixture('geometry A'); let requests = 0;
  globalThis.fetch = (async (url: any) => { requests++; expect(url).toBe(file.url); expect(url).not.toContain('/api/'); return new Response(bytes); }) as unknown as typeof fetch;
  const results = await Promise.all([cachedModelBytes(file), cachedModelBytes(file), cachedModelBytes(file)]);
  expect(requests).toBe(1); expect(results.map(bytes => new TextDecoder().decode(bytes))).toEqual(['geometry A', 'geometry A', 'geometry A']);
  globalThis.fetch = (async () => { throw new Error('Offline: network must not be used'); }) as unknown as typeof fetch;
  expect(new TextDecoder().decode(await cachedModelBytes(file))).toBe('geometry A');
});

test('only a changed model version triggers another download', async () => {
  cacheFixture(); const a = fixture('version one'), b = fixture('version two'); let requests = 0;
  globalThis.fetch = (async (url: any) => { requests++; return new Response(url === a.file.url ? a.bytes : b.bytes); }) as unknown as typeof fetch;
  await cachedModelBytes(a.file); await cachedModelBytes(a.file); await cachedModelBytes(b.file); await cachedModelBytes(b.file);
  expect(requests).toBe(2);
});

test('corruption is evicted and a mismatched server response never enters persistent cache', async () => {
  const cache = cacheFixture(), { file, bytes } = fixture('verified geometry');
  cache.set(file.url, new Response('broken local data'));
  globalThis.fetch = (async () => new Response(bytes)) as unknown as typeof fetch;
  expect(new TextDecoder().decode(await cachedModelBytes(file))).toBe('verified geometry');
  cache.clear(); globalThis.fetch = (async () => new Response('unexpected geometry')) as unknown as typeof fetch;
  await expect(cachedModelBytes(file)).rejects.toThrow('verified file'); expect(cache.size).toBe(0);
  globalThis.fetch = (async () => new Response(bytes)) as unknown as typeof fetch;
  expect(new TextDecoder().decode(await cachedModelBytes(file))).toBe('verified geometry');
});

test('model URLs cannot use the API, external servers or mutable filenames', () => {
  const { file } = fixture('a');
  for (const url of ['/api/model', 'https://example.test/model.glb', '/cube-library/models/test/model.glb', `/cube-library/models/test/${'a'.repeat(64)}.glb`]) expect(() => modelCacheKey({ ...file, url })).toThrow();
});
