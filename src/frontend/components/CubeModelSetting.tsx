import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { cubeModelSelectionAtom, cubeSizeAtom } from '../state';
import { cubeModelAsset } from '../lib/cube-library';
import { CubeLibrary } from './CubeLibrary';

export function CubeModelSetting() {
  const [open, setOpen] = useState(false);
  const selections = useAtomValue(cubeModelSelectionAtom), size = useAtomValue(cubeSizeAtom);
  const selected = cubeModelAsset(selections[size], size);
  return <>
    <div className="animation-setting cube-model-setting">
      <div><strong>Cube model</strong><p>{selected?.name ?? 'Generic cube'}</p></div>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Cube library</button>
    </div>
    <CubeLibrary open={open} onClose={() => setOpen(false)} />
  </>;
}
