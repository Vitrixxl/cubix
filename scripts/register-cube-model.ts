/** Register reviewed geometry, including explicitly labelled photo reconstructions. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inspectCubeGlb } from '../src/shared/physical-cube-asset';
import { slotsFor } from '../src/shared/cube';
import type { CubeModelAsset } from '../src/frontend/lib/cube-library';

export function validateModelRegistration(metadata: Omit<CubeModelAsset, 'url' | 'sha256'>, bytes: ArrayBuffer) {
  if (!/^[a-z0-9-]+$/.test(metadata.id) || !Number.isInteger(metadata.size) || metadata.size < 2 || metadata.size > 7) throw new Error('Invalid model id or cube size.');
  for (const value of [metadata.productId, metadata.variantId, metadata.name, metadata.provenance?.author, metadata.provenance?.license, metadata.verification?.checkedBy, metadata.verification?.checkedAt]) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Model identity, attribution and completed review are required.');
  }
  for (const url of [metadata.provenance?.source, metadata.verification?.reference]) {
    if (!url || new URL(url).protocol !== 'https:') throw new Error('Source and geometry review must have HTTPS evidence URLs.');
  }
  const dimensions = metadata.verification.dimensionsMm;
  if ((dimensions !== undefined && (!Number.isFinite(dimensions) || dimensions <= 0)) || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.verification.checkedAt)) throw new Error('Valid dimensions and review date are required.');
  if (metadata.reconstruction) {
    if (metadata.reconstruction.method !== 'photo-observed-surface-profile' || metadata.reconstruction.scope !== 'exterior' || metadata.reconstruction.accuracy !== 'estimated-from-photographs' || new URL(metadata.reconstruction.photo).protocol !== 'https:' || !metadata.reconstruction.profile) throw new Error('Photo reconstructions require a source photograph, profile and explicit accuracy.');
  } else if (dimensions === undefined) throw new Error('Measured dimensions or explicitly labelled photo reconstruction are required.');
  const gltf = inspectCubeGlb(bytes), scene = gltf.scenes?.[gltf.scene ?? 0];
  const positions = new Set(slotsFor(metadata.size).map(slot => slot.p.join(',')));
  if (!scene || scene.nodes.filter((id: number) => gltf.nodes?.[id]?.extras?.cubixCore !== true).length !== positions.size) throw new Error(`Expected ${positions.size} separately bound physical pieces.`);
  const used = new Set<number>();
  const inspectNode = (id: number): number => {
    if (used.has(id)) throw new Error('A node belongs to more than one physical piece or contains a cycle.');
    used.add(id);
    const node = gltf.nodes?.[id];
    if (!node) throw new Error('Missing GLB node.');
    return (node.mesh === undefined ? 0 : 1) + (node.children ?? []).reduce((sum: number, child: number) => sum + inspectNode(child), 0);
  };
  for (const id of scene.nodes) {
    const node = gltf.nodes?.[id], position = node?.extras?.cubixPosition;
    if (node?.extras?.cubixCore === true) { if (!inspectNode(id)) throw new Error('Internal hardware needs geometry.'); continue; }
    if (!Array.isArray(position) || position.length !== 3 || !positions.delete(position.join(','))) throw new Error('Missing, invalid or duplicate cubixPosition binding.');
    if (!inspectNode(id)) throw new Error('Each physical piece needs geometry.');
  }
  if (positions.size) throw new Error('Missing physical pieces.');
  return gltf;
}

if (import.meta.main) {
  const [metadataPath, filePath] = process.argv.slice(2);
  if (!metadataPath || !filePath) throw new Error('Usage: bun scripts/register-cube-model.ts metadata.json model.glb');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const bytes = await Bun.file(filePath).arrayBuffer();
  validateModelRegistration(metadata, bytes);
  const catalogue = await Bun.file('public/cube-library/catalog.json').json();
  const product = catalogue.products.find((entry: { id: string }) => entry.id === metadata.productId);
  if (!product || product.puzzle !== String(metadata.size).repeat(3) || !product.variants.some((variant: { id: string }) => variant.id === metadata.variantId)) throw new Error('The exact product, puzzle and variant must exist in the reference catalogue.');
  const manifest: CubeModelAsset[] = await Bun.file('data/cube-model-assets.json').json();
  if (manifest.some(asset => asset.id === metadata.id || (asset.productId === metadata.productId && asset.variantId === metadata.variantId))) throw new Error('This model or variant is already registered. Review its existing entry before replacing it.');
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const url = `/cube-library/models/${metadata.id}/${sha256}.glb`;
  await mkdir(`public/cube-library/models/${metadata.id}`, { recursive: true });
  await writeFile(`public${url}`, new Uint8Array(bytes));
  manifest.push({ ...metadata, sha256, url });
  await writeFile('data/cube-model-assets.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Registered ${metadata.name}: ${url}`);
}
