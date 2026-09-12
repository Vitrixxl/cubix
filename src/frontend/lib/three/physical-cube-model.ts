import { Color, Group, Matrix4, Mesh, Quaternion, Vector3, type Material, type Object3D } from 'three';
import { cubeSize, slotsFor, solved, stickerTangent, type CubeState } from '../../../shared/cube';
import { stickerColor, type CubeMask, type LayerAnimation } from '../cube-appearance';

/** GLB parts carry their original geometry and materials; no parametric substitute. */
export function validatePhysicalCube(scene: Group, size: number) {
  const slots = slotsFor(size);
  const expected = new Set(slots.map(slot => slot.p.join(',')));
  const pieces = new Map<string, Object3D>();
  scene.traverse(node => {
    const p = node.userData.cubixPosition;
    if (p === undefined) return;
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite) || !expected.has(p.join(','))) throw new Error('Invalid physical piece position.');
    if (pieces.has(p.join(','))) throw new Error('Duplicate physical piece position.');
    if (node.parent !== scene) throw new Error('Each physical piece must be a direct child of the GLB scene.');
    let meshes = 0; node.traverse(child => { if (child instanceof Mesh) meshes++; });
    if (!meshes) throw new Error('A physical piece has no geometry.');
    pieces.set(p.join(','), node);
  });
  if (pieces.size !== expected.size) throw new Error(`Expected ${expected.size} individually modelled pieces; found ${pieces.size}.`);
  if (scene.children.some(child => !pieces.has(child.userData.cubixPosition?.join(',')) && child.userData.cubixCore !== true)) throw new Error('Unbound geometry in physical cube.');
  return pieces;
}

type ColouredMaterial = Material & { color: Color };
export function createPhysicalCubeModel(template: Group, size: number) {
  const scene = template.clone(true);
  // Instances own GPU resources. Changing one viewport's mask cannot alter another.
  const geometries = new Map<Mesh['geometry'], Mesh['geometry']>();
  const cloneMaterial = (material: Material) => material.clone();
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
    node.geometry = geometries.get(node.geometry)!;
    node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
    node.castShadow = node.receiveShadow = true;
  });
  const nodes = validatePhysicalCube(scene, size), slots = slotsFor(size), initial = solved(size), object = new Group();
  // Fixed internal hardware is explicitly authored, never manufactured by the renderer.
  const core = new Group();
  for (const node of [...scene.children]) if (node.userData.cubixCore === true) core.add(node);
  if (core.children.length) object.add(core);
  const pieces = [...nodes].map(([key, node]) => {
    const pivot = new Group(); pivot.add(node); object.add(pivot);
    const origins = slots.flatMap((slot, index) => slot.p.join(',') === key ? [index] : []);
    const colours: { material: ColouredMaterial; original: Color; origin: number }[] = [], decals: Mesh[] = [];
    node.traverse(child => {
      if (!(child instanceof Mesh)) return;
      if (child.userData.cubixDecal) decals.push(child);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        const face = /^face_([UDFBRL])$/.exec(material.name)?.[1];
        const origin = origins.find(index => slots[index].face === face);
        if (origin !== undefined && 'color' in material) colours.push({ material: material as ColouredMaterial, original: (material as ColouredMaterial).color.clone(), origin });
      }
    });
    const normal = new Vector3(...slots[origins[0]].n);
    const tangent = new Vector3(...stickerTangent(initial, origins[0]));
    const basis = new Matrix4().makeBasis(tangent.clone().cross(normal), tangent, normal).invert();
    return { pivot, origins, colours, decals, basis };
  });
  return { object, update(state: CubeState, mask: CubeMask, animation?: LayerAnimation | null) {
    if (cubeSize(state) !== size) throw new Error('Physical cube size mismatch.');
    const targets = new Uint16Array(state.length);
    state.forEach((origin, target) => { targets[origin] = target; });
    for (const piece of pieces) {
      const target = targets[piece.origins[0]], targetSlot = slots[target];
      const normal = new Vector3(...targetSlot.n);
      // For edges/corners derive the rigid pose directly from the two facelets.
      // Centre pieces need the tangent retained while applying moves.
      let rotation: Quaternion;
      if (piece.origins.length > 1) {
        const a = new Vector3(...slots[piece.origins[0]].n), b = new Vector3(...slots[piece.origins[1]].n);
        const x = normal, y = new Vector3(...slots[targets[piece.origins[1]]].n);
        rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, x.clone().cross(y)).multiply(new Matrix4().makeBasis(a, b, a.clone().cross(b)).invert()));
      } else {
        const tangent = new Vector3(...stickerTangent(state, target));
        rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(tangent.clone().cross(normal), tangent, normal).multiply(piece.basis));
      }
      const originalPosition = new Vector3(...slots[piece.origins[0]].p).multiplyScalar(2 / size);
      const destination = new Vector3(...targetSlot.p).multiplyScalar(2 / size);
      const translation = destination.sub(originalPosition.applyQuaternion(rotation));
      if (animation?.move.layers.includes(targetSlot.p[animation.move.axis])) {
        const axis = new Vector3().setComponent(animation.move.axis, 1);
        const turn = new Quaternion().setFromAxisAngle(axis, animation.angle * Math.PI / 180);
        rotation.premultiply(turn); translation.applyQuaternion(turn);
      }
      piece.pivot.quaternion.copy(rotation); piece.pivot.position.copy(translation);
      for (const colour of piece.colours) {
        if (mask === 'full') colour.material.color.copy(colour.original);
        else colour.material.color.set(stickerColor(state, targets[colour.origin], mask));
      }
      piece.decals.forEach(mesh => { mesh.visible = mask === 'full'; });
    }
  } };
}
