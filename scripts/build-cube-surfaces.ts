/** Offline authoring: product-specific exterior surfaces -> self-contained GLBs.
 * These are photographic reconstructions, not manufacturer CAD or hidden mechanisms.
 * Run: bun scripts/build-cube-surfaces.ts [product-id ...]
 */
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Path, Shape, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import profiles from '../data/cube-surface-profiles.json';
import { slotsFor } from '../src/shared/cube';
import { validateModelRegistration } from './register-cube-model';
import type { CubeModelAsset } from '../src/frontend/lib/cube-library';

export type SurfaceProfile = typeof profiles[number];
const palette: Record<string, string> = { U: '#ffda00', D: '#f6f6f2', F: '#08bd48', B: '#0055da', R: '#ff7700', L: '#d91d2a' };

/** Four independently rounded corners, TL/TR/BR/BL, in face coordinates. */
export function roundedFace(x0: number, y0: number, x1: number, y1: number, radii: number[]) {
  const [tl, tr, br, bl] = radii.map(r => Math.max(.0001, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)));
  const shape = new Shape();
  shape.moveTo(x0 + bl, y0); shape.lineTo(x1 - br, y0);
  shape.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false); shape.lineTo(x1, y1 - tr);
  shape.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false); shape.lineTo(x0 + tl, y1);
  shape.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false); shape.lineTo(x0, y0 + bl);
  shape.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false); shape.closePath();
  return shape;
}

/** Row widths come from the exterior profile; larger cubes need wider outer rows. */
export function surfaceGrid(profile: SurfaceProfile) {
  const n = profile.size, weights = Array.from({ length: n }, (_, i) => i === 0 || i === n - 1 ? profile.shape.outerRowRatio : 1);
  const sum = weights.reduce((a, b) => a + b, 0), grid = [-1];
  for (const width of weights) grid.push(grid.at(-1)! + 2 * width / sum);
  grid[n] = 1; return grid;
}

function radiiAt(profile: SurfaceProfile, col: number, row: number) {
  const n = profile.size, s = profile.shape;
  const corners = [[col, row + 1], [col + 1, row + 1], [col + 1, row], [col, row]];
  const edges = Number(col === 0 || col === n - 1) + Number(row === 0 || row === n - 1);
  return corners.map(([x, y]) => {
    if (x === 0 || y === 0 || x === n || y === n) return s.outerRadius;
    if (n === 2) return s.cornerInnerRadius;
    return edges === 2 ? s.cornerInnerRadius : edges === 1 ? s.edgeInnerRadius : s.centerRadius;
  });
}

function capGeometry(shape: Shape, depth: number, bevel: number) {
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSegments: 3, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8, steps: 1 });
  geometry.clearGroups(); geometry.translate(0, 0, 1 - depth - bevel);
  // A shallow cap, including its real outline and sides; recessed side walls are shaded.
  const positions = geometry.getAttribute('position'), colours: number[] = [];
  const contour = shape.getPoints(16);
  const x0 = Math.min(...contour.map(p => p.x)) - bevel, x1 = Math.max(...contour.map(p => p.x)) + bevel;
  const y0 = Math.min(...contour.map(p => p.y)) - bevel, y1 = Math.max(...contour.map(p => p.y)) + bevel;
  for (let i = 0; i < positions.count; i++) {
    // ExtrudeGeometry's mitres can overshoot tiny outside radii. Keep perpendicular
    // caps inside their shared outer edge, preventing coloured strips / z-fighting.
    positions.setXY(i, Math.max(x0, Math.min(x1, positions.getX(i))), Math.max(y0, Math.min(y1, positions.getY(i))));
    const t = Math.max(0, Math.min(1, (positions.getZ(i) - (1 - depth - bevel * 2)) / (depth + bevel * 2)));
    const shade = .38 + .62 * t; colours.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.deleteAttribute('uv'); geometry.deleteAttribute('normal');
  const indexed = mergeVertices(geometry, 1e-5); geometry.dispose();
  // Weld the extrusion before smoothing, so bevel arcs do not retain flat facets.
  const vertices = indexed.getAttribute('position'), index = indexed.getIndex()!, triangles: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    a.fromBufferAttribute(vertices, ia); b.fromBufferAttribute(vertices, ib); c.fromBufferAttribute(vertices, ic);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-18) triangles.push(ia, ib, ic);
  }
  indexed.setIndex(triangles); indexed.computeVertexNormals();
  const normals = indexed.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) if (a.fromBufferAttribute(normals, i).lengthSq() < .1) normals.setXYZ(i, 0, 0, 1);
  return indexed;
}

export function createSurfaceCube(profile: SurfaceProfile) {
  const root = new Group(), n = profile.size, unit = 2 / n, half = (n - 1) / 2, grid = surfaceGrid(profile), s = profile.shape;
  root.name = profile.name;
  root.userData = { cubixModel: profile.id, cubixScope: 'exterior-photographic-reconstruction', cubixReference: profile.reference };
  const pieces = new Map<string, Group>();
  const supports = new Map<string, BufferGeometry>(), surfaces = new Map<string, BufferGeometry>(), bodies = new Map<string, BufferGeometry>();
  const interior = new MeshStandardMaterial({ color: profile.interior === 'primary' ? '#c9c0af' : '#18191a', roughness: .8 }); interior.name = 'recessed_support';
  // An untextured occluder keeps the opposite face from showing through junctions.
  // This is not a reconstructed mechanism and has no visible mechanical details.
  const occluder = new Mesh(new SphereGeometry(.95, 24, 16), interior);
  occluder.name = 'interior_occlusion'; occluder.userData.cubixCore = true; root.add(occluder);
  for (const slot of slotsFor(n)) {
    const key = slot.p.join(','); if (pieces.has(key)) continue;
    const piece = new Group(); piece.name = `piece_${key}`; piece.userData.cubixPosition = [...slot.p];
    // Only a recessed support, intentionally no invented mechanism, magnets or stems.
    const coords = slot.p.map(p => Math.round(p + half));
    const widths = coords.map(i => grid[i + 1] - grid[i]);
    const center = coords.map(i => (grid[i + 1] + grid[i]) / 2);
    const supportKey = widths.map(w => w.toFixed(6)).join(',');
    let backing = supports.get(supportKey);
    if (!backing) {
      const raw = new RoundedBoxGeometry(widths[0] * .82, widths[1] * .82, widths[2] * .82, 1, unit * .055);
      raw.deleteAttribute('uv'); raw.normalizeNormals(); backing = mergeVertices(raw, 1e-5); raw.dispose(); supports.set(supportKey, backing);
    }
    const support = new Mesh(backing, interior); support.position.set(...center as [number, number, number]);
    piece.add(support); pieces.set(key, piece); root.add(piece);
  }
  const faceMaterials = new Map<string, MeshPhysicalMaterial>();
  for (const slot of slotsFor(n)) {
    const normal = new Vector3(...slot.n), up = Math.abs(normal.y) === 1 ? new Vector3(0, 0, -normal.y) : new Vector3(0, 1, 0);
    const right = up.clone().cross(normal), basis = new Matrix4().makeBasis(right, up, normal);
    const pos = new Vector3(...slot.p), col = Math.round(pos.dot(right) + half), row = Math.round(pos.dot(up) + half);
    const bevel = s.bevel * unit, gap = s.gap * unit;
    // Extrusion expands the outline by bevel; compensate so the authored gap remains exact.
    const x0 = grid[col] + gap / 2 + bevel, x1 = grid[col + 1] - gap / 2 - bevel;
    const y0 = grid[row] + gap / 2 + bevel, y1 = grid[row + 1] - gap / 2 - bevel;
    const radii = radiiAt(profile, col, row).map(r => r * unit);
    const piece = pieces.get(slot.p.join(','))!;
    let material = faceMaterials.get(slot.face);
    if (!material) {
      material = new MeshPhysicalMaterial({ color: palette[slot.face], vertexColors: true, roughness: profile.finish === 'uv' ? .18 : profile.finish === 'matte' ? .6 : .38, metalness: 0, clearcoat: profile.finish === 'uv' ? .8 : 0, clearcoatRoughness: .12, specularIntensity: .35 });
      material.name = `face_${slot.face}`; faceMaterials.set(slot.face, material);
    }
    const key = `${col},${row}`;
    const cached = surfaces.get(key);
    if (cached) {
      if (bodies.has(key)) { const body = new Mesh(bodies.get(key)!, interior); body.applyMatrix4(basis); piece.add(body); }
      const surface = new Mesh(cached, material); surface.applyMatrix4(basis); piece.add(surface); continue;
    }
    const layers: BufferGeometry[] = [];
    if (s.stickered) {
      // The black plastic is a separate solid, rather than a black line painted on a tile.
      const body = capGeometry(roundedFace(x0, y0, x1, y1, radii), s.capDepth * unit, bevel);
      bodies.set(key, body); const black = new Mesh(body, interior); black.applyMatrix4(basis); piece.add(black);
      const inset = .064 * unit;
      const sticker = capGeometry(roundedFace(x0 + inset, y0 + inset, x1 - inset, y1 - inset, radii.map(r => Math.max(unit * .04, r - inset))), .003 * unit, .001 * unit);
      sticker.translate(0, 0, .0015 * unit); layers.push(sticker);
    } else {
      const shape = roundedFace(x0, y0, x1, y1, radii);
      if (s.centreSlots && n === 3 && col === 1 && row === 1) {
        // Recessed moulded diagonal slots, observed around the MGC / Meta3 centre.
        for (let i = 0; i < 4; i++) {
          const angle = Math.PI / 4 + i * Math.PI / 2, radius = unit * .485;
          const hole = new Path();
          for (let k = 0; k <= 24; k++) {
            const a = 2 * Math.PI * k / 24;
            const dx = Math.cos(a) * unit * .048, dy = Math.sin(a) * unit * .009;
            const x = Math.cos(angle) * radius - Math.sin(angle) * dx + Math.cos(angle) * dy;
            const y = Math.sin(angle) * radius + Math.cos(angle) * dx + Math.sin(angle) * dy;
            if (k === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
          }
          shape.holes.push(hole);
        }
      }
      layers.push(capGeometry(shape, s.capDepth * unit, bevel));
      if (s.gripRidge) {
        const inset = .045 * unit, width = .019 * unit;
        const ridge = roundedFace(x0 + inset, y0 + inset, x1 - inset, y1 - inset, radii.map(r => Math.max(.025 * unit, r - inset)));
        const inner = roundedFace(x0 + inset + width, y0 + inset + width, x1 - inset - width, y1 - inset - width, radii.map(r => Math.max(.015 * unit, r - inset - width)));
        const hole = new Path(inner.getPoints(12).reverse()); ridge.holes.push(hole);
        const raised = capGeometry(ridge, s.gripRidge * unit, .003 * unit); raised.translate(0, 0, s.gripRidge * unit); layers.push(raised);
      }
    }
    const surface = layers.length === 1 ? layers[0] : mergeGeometries(layers)!;
    if (layers.length > 1) layers.forEach(geometry => geometry.dispose());
    surfaces.set(key, surface); const cap = new Mesh(surface, material); cap.applyMatrix4(basis); piece.add(cap);
  }
  return root;
}

// Three's browser-oriented GLB exporter needs only this FileReader operation in Bun.
class BinaryFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
}

export async function exportSurfaceCube(profile: SurfaceProfile) {
  if (typeof globalThis.FileReader === 'undefined') Object.assign(globalThis, { FileReader: BinaryFileReader });
  const scene = createSurfaceCube(profile);
  // Export the pieces as scene roots, preserving their separately movable bindings.
  const bytes = await new GLTFExporter().parseAsync(scene.children, { binary: true, onlyVisible: true }) as ArrayBuffer;
  const materials = new Set<Mesh['material']>();
  scene.traverse(node => { if (node instanceof Mesh) { node.geometry.dispose(); materials.add(node.material); } });
  for (const material of materials) for (const item of Array.isArray(material) ? material : [material]) item.dispose();
  return bytes;
}

if (import.meta.main) {
  const filter = new Set(process.argv.slice(2)), selected = profiles.filter(profile => !filter.size || filter.has(profile.id));
  const catalogue = JSON.parse(await readFile('public/cube-library/catalog.json', 'utf8'));
  const existing: CubeModelAsset[] = JSON.parse(await readFile('data/cube-model-assets.json', 'utf8'));
  const output = existing.filter(asset => !selected.some(profile => profile.id === asset.id));
  let total = 0;
  for (const profile of selected) {
    const product = catalogue.products.find((r: { id: string }) => r.id === profile.productId);
    if (!product || !product.variants.some((v: { id: string }) => v.id === profile.variantId) || product.puzzle !== String(profile.size).repeat(3)) throw new Error(`Unmatched source: ${profile.id}`);
    const metadata: Omit<CubeModelAsset, 'url' | 'sha256'> = {
      id: profile.id, productId: profile.productId, variantId: profile.variantId, name: profile.name, size: profile.size,
      provenance: { source: profile.reference, author: 'Cubix', license: 'Original Cubix reconstruction; photographic references remain with their owners.' },
      verification: { reference: profile.reference, checkedBy: 'Cubix photo surface review', checkedAt: '2026-09-12' },
      reconstruction: { method: 'photo-observed-surface-profile', photo: profile.photo, profile: `data/cube-surface-profiles.json#${profile.id}`, scope: 'exterior', accuracy: 'estimated-from-photographs' },
    };
    const bytes = await exportSurfaceCube(profile); validateModelRegistration(metadata, bytes);
    const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    const url = `/cube-library/models/${profile.id}/${sha256}.glb`, directory = `public/cube-library/models/${profile.id}`;
    await mkdir(directory, { recursive: true }); await writeFile(`public${url}`, new Uint8Array(bytes));
    for (const file of await readdir(directory)) if (file.endsWith('.glb') && file !== `${sha256}.glb`) await unlink(`${directory}/${file}`);
    output.push({ ...metadata, url, sha256 }); total += bytes.byteLength;
    console.log(`${profile.size}x${profile.size} ${profile.id}: ${(bytes.byteLength / 1024).toFixed(0)} KiB`);
  }
  await writeFile('data/cube-model-assets.json', JSON.stringify(output, null, 2) + '\n');
  console.log(`${selected.length} surface models generated, ${(total / 1024 / 1024).toFixed(1)} MiB total.`);
}
