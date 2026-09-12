/** Selected geometry is a static, content-addressed asset. Never call /api. */
export const MODEL_CACHE = 'cubix-physical-models-v1';
const downloads = new Map<string, Promise<ArrayBuffer>>();

export interface ModelFile { url: string; sha256: string }
export function modelCacheKey(file: ModelFile) {
  if (!/^\/cube-library\/models\/[a-z0-9-]+\/[a-f0-9]{64}\.glb$/.test(file.url) || !/^[a-f0-9]{64}$/.test(file.sha256) || !file.url.endsWith(`/${file.sha256}.glb`)) throw new Error('A model must use a local content-addressed static file.');
  return file.url;
}
export async function verifyModelBytes(bytes: ArrayBuffer, expected: string) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('The 3D model does not match its verified file.');
}

export async function cachedModelBytes(file: ModelFile): Promise<ArrayBuffer> {
  const key = modelCacheKey(file);
  const download = downloads.get(key);
  if (download) return download;
  const acquire = async () => {
    let cache: Cache | undefined;
    try { if (typeof caches !== 'undefined') cache = await caches.open(MODEL_CACHE); } catch { /* Private browsing may disable persistent storage. */ }
    const cached = await cache?.match(key);
    if (cached) {
      const bytes = await cached.arrayBuffer();
      try { await verifyModelBytes(bytes, file.sha256); return bytes; }
      catch { await cache?.delete(key); }
    }
    const response = await fetch(key, { cache: 'force-cache' });
    if (!response.ok) throw new Error('The selected 3D model could not be loaded.');
    const bytes = await response.arrayBuffer();
    await verifyModelBytes(bytes, file.sha256);
    try { await cache?.put(key, new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'public, max-age=31536000, immutable' } })); }
    catch { /* A full disk must not prevent displaying an already downloaded model. */ }
    return bytes;
  };
  const request = (async () => typeof navigator !== 'undefined' && navigator.locks ? await navigator.locks.request(`cubix-model:${file.sha256}`, acquire) : await acquire())().finally(() => downloads.delete(key));
  downloads.set(key, request);
  return request;
}
