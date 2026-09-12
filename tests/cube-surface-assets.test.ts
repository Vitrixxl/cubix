import { expect, test } from 'bun:test';
import { Box3, Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import assets from '../data/cube-model-assets.json';
import profiles from '../data/cube-surface-profiles.json';
import catalogue from '../public/cube-library/catalog.json';
import { validateModelRegistration } from '../scripts/register-cube-model';
import { createPhysicalCubeModel, validatePhysicalCube } from '../src/frontend/lib/three/physical-cube-model';
import { disposeObject } from '../src/frontend/components/ThreeViewport';
import { applyAlg, applyMove, moveAngleDeg, parseMove, solved } from '../src/shared/cube';
import type { CubeModelAsset } from '../src/frontend/lib/cube-library';

test('every published photo model has complete geometry, exact variant attribution and a matching content hash', async () => {
  expect(assets.length).toBe(profiles.length);
  expect(assets.length).toBeGreaterThanOrEqual(98);
  expect(new Set(assets.map(asset => `${asset.productId}:${asset.variantId}`)).size).toBe(assets.length);
  const loader = new GLTFLoader();
  for (const asset of assets) {
    const product = catalogue.products.find(product => product.id === asset.productId)!;
    expect(product.variants.some(variant => variant.id === asset.variantId)).toBe(true);
    expect(asset.reconstruction.accuracy).toBe('estimated-from-photographs');
    const bytes = await Bun.file(`public${asset.url}`).arrayBuffer();
    expect(bytes.byteLength).toBeLessThan(3 * 1024 * 1024);
    expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    const json = validateModelRegistration(asset as CubeModelAsset, bytes);
    expect(json.animations).toBeUndefined();
    const loaded = await loader.parseAsync(bytes, '');
    expect(validatePhysicalCube(loaded.scene, asset.size).size).toBe(asset.size ** 3 - (asset.size - 2) ** 3);
    const bounds = new Box3().setFromObject(loaded.scene);
    const profile = profiles.find(profile => profile.id === asset.id)!;
    const extent = profile.shape.gripRidge ? 1.03 : profile.shape.stickered ? 1.002 : 1.00001;
    expect(Math.max(...bounds.max.toArray())).toBeLessThan(extent);
    expect(Math.min(...bounds.min.toArray())).toBeGreaterThan(-extent);
    const faces = new Map<string, number>();
    loaded.scene.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      expect([...positions.array].every(Number.isFinite)).toBe(true);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (/^face_[UDFBRL]$/.test(material.name)) faces.set(material.name, (faces.get(material.name) ?? 0) + 1);
      }
    });
    for (const face of ['U', 'D', 'F', 'B', 'R', 'L']) expect(faces.get(`face_${face}`)).toBe(asset.size ** 2);
    disposeObject(loaded.scene);
  }
}, 20000);

test('real authored surfaces, including wider outer rows, keep their rigid transforms at turn endpoints', async () => {
  for (const size of [2, 3, 4, 5, 6, 7]) {
    const asset = assets.find(asset => asset.size === size)!;
    const loaded = await new GLTFLoader().parseAsync(await Bun.file(`public${asset.url}`).arrayBuffer(), '');
    const model = createPhysicalCubeModel(loaded.scene, size);
    let state = applyAlg(solved(size), "R U F' L2");
    const transforms = () => {
      model.object.updateMatrixWorld(true); const matrices: number[][] = [];
      model.object.traverse(node => { if (node instanceof Mesh) matrices.push([...node.matrixWorld.elements]); });
      return matrices;
    };
    for (const token of ['R', 'U', 'F2', 'x', ...(size > 2 ? ['Rw', 'M'] : []), ...(size > 3 ? ['2R'] : [])]) {
      const move = parseMove(token, size)!;
      model.update(state, 'full', { move, angle: moveAngleDeg(move) }); const before = transforms();
      state = applyMove(state, move); model.update(state, 'full');
      transforms().forEach((matrix, i) => matrix.forEach((value, j) => expect(value).toBeCloseTo(before[i][j], 6)));
    }
    disposeObject(model.object); disposeObject(loaded.scene);
  }
});
