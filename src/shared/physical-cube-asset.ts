/** Inspect the GLB container before a loader can resolve any resources. */
export function inspectCubeGlb(bytes: ArrayBuffer) {
  if (bytes.byteLength < 20 || bytes.byteLength > 64 * 1024 * 1024) throw new Error('Expected a GLB between 20 bytes and 64 MiB.');
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error('Invalid GLB 2.0 header.');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length > bytes.byteLength - 20 || length % 4) throw new Error('Invalid GLB JSON chunk.');
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)));
  if (data.asset?.version !== '2.0') throw new Error('Expected glTF 2.0.');
  if ((data.buffers ?? []).some((buffer: { uri?: string }) => buffer.uri !== undefined)
    || (data.images ?? []).some((image: { uri?: string; bufferView?: number }) => image.uri !== undefined || image.bufferView === undefined)) throw new Error('All geometry and textures must be embedded in the GLB.');
  if (data.animations?.length || data.skins?.length) throw new Error('Cube parts must be rigid, without baked animations or skins.');
  if (data.extensionsRequired?.length) throw new Error('This cube format requires core glTF, without external decoder extensions.');
  for (const mesh of data.meshes ?? []) {
    if (!mesh.primitives?.length) throw new Error('A mesh has no geometry.');
    for (const primitive of mesh.primitives) {
      const position = data.accessors?.[primitive.attributes?.POSITION];
      if (!position || position.type !== 'VEC3' || position.componentType !== 5126 || position.count < 3 || !data.bufferViews?.[position.bufferView]) throw new Error('A mesh needs valid vertex positions.');
    }
  }
  for (const node of data.nodes ?? []) if (node.mesh !== undefined && !data.meshes?.[node.mesh]) throw new Error('A node references missing geometry.');
  if (data.buffers?.length) {
    const offset = 20 + length;
    if (data.buffers.length !== 1 || offset + 8 > bytes.byteLength || view.getUint32(offset + 4, true) !== 0x004e4942 || view.getUint32(offset, true) !== bytes.byteLength - offset - 8 || data.buffers[0].byteLength > bytes.byteLength - offset - 8) throw new Error('Missing or invalid embedded geometry buffer.');
    for (const bufferView of data.bufferViews ?? []) if (bufferView.buffer !== 0 || (bufferView.byteOffset ?? 0) < 0 || bufferView.byteLength < 0 || (bufferView.byteOffset ?? 0) + bufferView.byteLength > data.buffers[0].byteLength) throw new Error('Geometry buffer view is outside the GLB.');
  }
  return data;
}
