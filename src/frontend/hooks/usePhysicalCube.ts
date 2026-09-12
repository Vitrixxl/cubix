import { useEffect, useState } from 'react';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cubeModelAsset, type CubeModelAsset } from '../lib/cube-library';
import { validatePhysicalCube } from '../lib/three/physical-cube-model';
import { cachedModelBytes } from '../lib/cube-model-cache';
import { inspectCubeGlb } from '../../shared/physical-cube-asset';

const models = new Map<string, Group>(), pending = new Map<string, Promise<void>>();
export async function loadPhysicalCube(asset: CubeModelAsset) {
  if (models.has(asset.id)) return;
  let request = pending.get(asset.id);
  if (!request) {
    request = (async () => {
      const bytes = await cachedModelBytes(asset);
      inspectCubeGlb(bytes);
      const result = await new GLTFLoader().parseAsync(bytes, '');
      validatePhysicalCube(result.scene, asset.size);
      models.set(asset.id, result.scene);
    })().finally(() => pending.delete(asset.id));
    pending.set(asset.id, request);
  }
  await request;
}
export function usePhysicalCube(id: string | undefined, size: number) {
  const asset = cubeModelAsset(id, size), [, refresh] = useState(0), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    if (asset) void loadPhysicalCube(asset).then(() => { if (active) refresh(value => value + 1); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [asset, attempt]);
  return { asset, template: asset ? models.get(asset.id) : undefined, ready: !asset || models.has(asset.id), error, retry: () => setAttempt(value => value + 1) };
}
