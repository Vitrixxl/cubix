import { expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { applyAlg, applyMove, moveAngleDeg, parseMove, slotsFor, solved } from '../src/shared/cube';
import { createPhysicalCubeModel, validatePhysicalCube } from '../src/frontend/lib/three/physical-cube-model';
import { disposeObject } from '../src/frontend/components/ThreeViewport';
import { inspectCubeGlb } from '../src/shared/physical-cube-asset';
import { validateModelRegistration } from '../scripts/register-cube-model';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { filterCubeReferences } from '../src/frontend/lib/cube-library';
import catalogue from '../public/cube-library/catalog.json';

/** Synthetic test rig, deliberately never published as a manufacturer replica. */
function testRig(size: number) {
  const scene = new Group();
  const points = [...new Map(slotsFor(size).map(slot => [slot.p.join(','), slot.p])).values()];
  points.forEach((p, index) => {
    const piece = new Group(); piece.userData.cubixPosition = [...p]; piece.position.set(...p).multiplyScalar(2 / size);
    // Unequal geometry catches accidental replacement by a shared cubie template.
    const mesh = new Mesh(new BoxGeometry((.7 + index / 1000) / size, .8 / size, .9 / size), new MeshStandardMaterial({ color: index + 1 }));
    piece.add(mesh); scene.add(piece);
  });
  return scene;
}

test('every imported piece preserves its own geometry and rigid pose through turns', () => {
  for (const size of [2, 3, 4, 5, 6, 7]) {
    const source = testRig(size), model = createPhysicalCubeModel(source, size);
    let state = applyAlg(solved(size), "R U F' D2 L B");
    const matrices = () => { model.object.updateMatrixWorld(true); return model.object.children.map(pivot => pivot.children[0].matrixWorld.clone()); };
    for (const token of ['U', 'D', "F'", 'R2', 'x', 'y', 'z', ...(size > 2 ? ['M', 'Rw'] : []), ...(size > 3 ? ['2R'] : [])]) {
      const move = parseMove(token, size)!;
      model.update(state, 'full', { move, angle: moveAngleDeg(move) });
      const animated = matrices(); state = applyMove(state, move); model.update(state, 'full');
      matrices().forEach((matrix, i) => matrix.elements.forEach((value, j) => expect(value).toBeCloseTo(animated[i].elements[j], 6)));
    }
    model.object.children.forEach((pivot, index) => {
      const copy = pivot.children[0].children[0] as Mesh, original = source.children[index].children[0] as Mesh;
      expect(copy.geometry).not.toBe(original.geometry);
      expect([...copy.geometry.getAttribute('position').array]).toEqual([...original.geometry.getAttribute('position').array]);
      expect(copy.material).not.toBe(original.material);
    });
    disposeObject(model.object); disposeObject(source);
  }
});

test('a white centre keeps its rotation after the move and survives whole-cube rotations', () => {
  const source = testRig(3), model = createPhysicalCubeModel(source, 3);
  const centre = model.object.children.find(pivot => pivot.children[0].userData.cubixPosition.join(',') === '0,-1,0')!;
  model.update(solved(3), 'full'); const initial = new Vector3(0, 0, 1).applyQuaternion(centre.quaternion);
  model.update(applyAlg(solved(3), 'D'), 'full');
  expect(new Vector3(0, 0, 1).applyQuaternion(centre.quaternion).distanceTo(initial)).toBeGreaterThan(1);
  model.update(applyAlg(solved(3), 'D D D D'), 'full');
  expect(new Vector3(0, 0, 1).applyQuaternion(centre.quaternion).distanceTo(initial)).toBeLessThan(1e-8);
  disposeObject(model.object); disposeObject(source);
});

test('missing, duplicate and unbound physical pieces are rejected', () => {
  const source = testRig(3); expect(validatePhysicalCube(source, 3).size).toBe(26);
  source.children[0].userData.cubixPosition = [...source.children[1].userData.cubixPosition];
  expect(() => validatePhysicalCube(source, 3)).toThrow('Duplicate');
  source.remove(source.children[0]); expect(() => validatePhysicalCube(source, 3)).toThrow('Expected 26');
  disposeObject(source);
});

function glb(json: object, binary?: Uint8Array) {
  const text = JSON.stringify(json), padded = text + ' '.repeat((4 - text.length % 4) % 4), body = new TextEncoder().encode(padded);
  const result = new ArrayBuffer(20 + body.length + (binary ? 8 + binary.length : 0)), view = new DataView(result);
  [0x46546c67, 2, result.byteLength, body.length, 0x4e4f534a].forEach((value, i) => view.setUint32(i * 4, value, true));
  new Uint8Array(result, 20, body.length).set(body);
  if (binary) { const offset = 20 + body.length; view.setUint32(offset, binary.length, true); view.setUint32(offset + 4, 0x004e4942, true); new Uint8Array(result, offset + 8).set(binary); }
  return result;
}

test('GLB inspection disallows network-dependent assets and baked animations', () => {
  expect(() => inspectCubeGlb(new ArrayBuffer(30))).toThrow('header');
  for (const addition of [{ buffers: [{ uri: '/api/model' }] }, { images: [{ uri: 'https://example.test/image.jpg' }] }, { animations: [{}] }, { skins: [{}] }, { extensionsRequired: ['KHR_draco_mesh_compression'] }]) {
    expect(() => inspectCubeGlb(glb({ asset: { version: '2.0' }, ...addition }))).toThrow();
  }
  expect(inspectCubeGlb(glb({ asset: { version: '2.0' } })).asset.version).toBe('2.0');
});

test('registration requires independently bound pieces and source/review metadata', () => {
  const metadata = { id: 'test-rig', productId: 'test', variantId: 'test', name: 'Test rig', size: 3, provenance: { source: 'https://example.test/source', author: 'Test', license: 'Test only' }, verification: { reference: 'https://example.test/review', dimensionsMm: 56, checkedBy: 'Test', checkedAt: '2026-09-12' } };
  const nodes = [...new Map(slotsFor(3).map(slot => [slot.p.join(','), slot.p])).values()].map(p => ({ mesh: 0, extras: { cubixPosition: p } }));
  const geometry = { meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 3 }], bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }] };
  const bytes = glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, ...geometry }, new Uint8Array(36));
  expect(validateModelRegistration(metadata, bytes).nodes).toHaveLength(26);
  expect(() => validateModelRegistration({ ...metadata, verification: { ...metadata.verification, checkedBy: '' } }, bytes)).toThrow('completed review');
  expect(() => validateModelRegistration(metadata, glb({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes, ...geometry }, new Uint8Array(36)))).toThrow('26 separately');
});

test('an actual embedded GLB loads into independently movable physical pieces', async () => {
  const positions = [...new Map(slotsFor(3).map(slot => [slot.p.join(','), slot.p])).values()];
  const geometry = new Float32Array([-.1, -.1, 0, .1, -.1, 0, 0, .1, 0]);
  const nodes = positions.map(p => ({ mesh: 0, translation: p.map(value => value * 2 / 3), extras: { cubixPosition: p } }));
  const bytes = glb({ asset: { version: '2.0' }, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 3, min: [-.1, -.1, 0], max: [.1, .1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: geometry.byteLength }], buffers: [{ byteLength: geometry.byteLength }],
  }, new Uint8Array(geometry.buffer));
  inspectCubeGlb(bytes);
  const loaded = await new GLTFLoader().parseAsync(bytes, '');
  expect(validatePhysicalCube(loaded.scene, 3).size).toBe(26);
  const model = createPhysicalCubeModel(loaded.scene, 3);
  model.update(applyAlg(solved(3), "R U F'"), 'full'); model.object.updateMatrixWorld(true);
  expect(model.object.children).toHaveLength(26);
  for (const piece of model.object.children) expect(piece.matrixWorld.elements.every(Number.isFinite)).toBe(true);
  disposeObject(model.object); disposeObject(loaded.scene);
});

test('reference catalogue retains exact versions and never reports photographs as 3D assets', () => {
  const ids = new Set(catalogue.products.map(p => p.id)); expect(ids.size).toBe(catalogue.products.length);
  expect(catalogue.products.length).toBeGreaterThan(1900);
  expect(catalogue.products.every(p => p.source.startsWith('https://www.thecubicle.com/products/') && p.variants.length > 0)).toBe(true);
  const matches = filterCubeReferences(catalogue.products as any, 'FerYooCore V2');
  expect(matches.map(p => p.name)).toContain('The FerYooCore V2 3x3');
  expect(filterCubeReferences(catalogue.products as any, '', 'GAN', '333').every(p => p.brand === 'GAN' && p.puzzle === '333')).toBe(true);
});
