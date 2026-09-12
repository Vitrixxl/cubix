import type { PuzzleId } from '../../shared/puzzles';
import assetManifest from '../../../data/cube-model-assets.json';

export interface CubeReference {
  id: string;
  name: string;
  brand: string;
  source: string;
  puzzle?: PuzzleId;
  images: { url: string; alt: string }[];
  variants: { id: string; name: string; image: string | null }[];
}
export interface CubeLibrary {
  schemaVersion: 1;
  retrievedAt: string;
  sourceProductCount: number;
  products: CubeReference[];
  logos: CubeReference[];
}
/** One asset belongs to one documented physical version, never to a whole brand. */
export interface CubeModelAsset {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  size: number;
  url: string;
  sha256: string;
  provenance: { source: string; author: string; license: string };
  verification: { reference: string; dimensionsMm?: number; checkedBy: string; checkedAt: string };
  reconstruction?: { method: 'photo-observed-surface-profile'; photo: string; profile: string; scope: 'exterior'; accuracy: 'estimated-from-photographs' };
}
export const CUBE_MODEL_ASSETS = assetManifest as CubeModelAsset[];
export const cubeModelAsset = (id: unknown, size?: number) => CUBE_MODEL_ASSETS.find(asset => asset.id === id && (size === undefined || asset.size === size));
export const productAssets = (productId: string) => CUBE_MODEL_ASSETS.filter(asset => asset.productId === productId);
export const referenceImage = (reference: CubeReference, variantId?: string) => reference.variants.find(v => v.id === variantId)?.image ?? reference.images[0]?.url;

let catalogue: Promise<CubeLibrary> | undefined;
export function loadCubeLibrary(): Promise<CubeLibrary> {
  return catalogue ??= fetch('/cube-library/catalog.json').then(async response => {
    if (!response.ok) throw new Error('Cube library could not be loaded.');
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.products) || !Array.isArray(data.logos)) throw new Error('Unsupported cube library.');
    return data as CubeLibrary;
  }).catch(error => { catalogue = undefined; throw error; });
}

const normalise = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[×]/g, 'x');
export function filterCubeReferences(records: CubeReference[], search: string, brand = '', puzzle = '') {
  const words = normalise(search).split(/\s+/).filter(Boolean);
  return records.filter(record => (!brand || record.brand === brand) && (!puzzle || record.puzzle === puzzle)
    && words.every(word => normalise(`${record.name} ${record.brand} ${record.variants.map(v => v.name).join(' ')}`).includes(word)));
}
