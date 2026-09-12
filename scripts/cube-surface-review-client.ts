import { AmbientLight, DirectionalLight, Group, NeutralToneMapping, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import assets from '../data/cube-model-assets.json';
import { createPhysicalCubeModel } from '../src/frontend/lib/three/physical-cube-model';
import { solved, parseMove } from '../src/shared/cube';
const params = new URLSearchParams(location.search), page = Number(params.get('page') ?? 0), id = params.get('id');
const selected = id ? assets.filter(asset => asset.id === id) : assets.slice(page * 9, page * 9 + 9);
const grid = document.querySelector('#grid')!; if (id) grid.classList.add('single');
(document.querySelector('#prev') as HTMLAnchorElement).href = `/?page=${Math.max(0, page - 1)}`;
(document.querySelector('#next') as HTMLAnchorElement).href = `/?page=${Math.min(Math.ceil(assets.length / 9) - 1, page + 1)}`;
document.querySelector('#page')!.textContent = `${page + 1}/${Math.ceil(assets.length / 9)} · ${assets.length} models`;
const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = NeutralToneMapping;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); document.body.append(renderer.domElement);
const views: { el: Element; scene: Scene; camera: OrthographicCamera; orientation: Group; model: ReturnType<typeof createPhysicalCubeModel>; size: number }[] = [];
let front = false, turned = false;
const render = () => {
  renderer.setSize(innerWidth, innerHeight); renderer.setScissorTest(false); renderer.setClearColor(0, 0); renderer.clear(); renderer.setScissorTest(true);
  for (const view of views) {
    const rect = view.el.getBoundingClientRect(), aspect = rect.width / rect.height, half = 1.7;
    view.camera.left = -half * Math.max(1, aspect); view.camera.right = -view.camera.left; view.camera.top = half * Math.max(1, 1 / aspect); view.camera.bottom = -view.camera.top; view.camera.updateProjectionMatrix();
    view.orientation.rotation.set(front ? 0 : .33, front ? 0 : -.5, 0);
    view.model.update(solved(view.size), 'full', turned ? { move: parseMove('R', view.size)!, angle: 45 } : undefined);
    renderer.setViewport(rect.x, innerHeight - rect.bottom, rect.width, rect.height); renderer.setScissor(rect.x, innerHeight - rect.bottom, rect.width, rect.height); renderer.render(view.scene, view.camera);
  }
};
document.querySelector('#front')!.addEventListener('click', () => { front = true; render(); });
document.querySelector('#iso')!.addEventListener('click', () => { front = false; render(); });
document.querySelector('#turn')!.addEventListener('click', () => { turned = !turned; render(); });
addEventListener('resize', render);
await Promise.all(selected.map(async asset => {
  const card = document.createElement('article'); card.className = 'card';
  const title = document.createElement('strong'), link = document.createElement('a'); link.href = `/?id=${asset.id}`; link.textContent = `${asset.name} · ${asset.size}×${asset.size}`; title.append(link); card.append(title);
  const photo = document.createElement('img'); photo.src = asset.reconstruction!.photo; photo.alt = asset.name; card.append(photo);
  const el = document.createElement('div'); el.className = 'view'; card.append(el); grid.append(card);
  try {
    const gltf = await new GLTFLoader().loadAsync(asset.url), model = createPhysicalCubeModel(gltf.scene, asset.size);
    const scene = new Scene(), orientation = new Group(), camera = new OrthographicCamera(-2, 2, 2, -2, .1, 100); camera.position.z = 8;
    const whiteFront = new Group(); whiteFront.rotation.x = -Math.PI / 2; whiteFront.add(model.object); orientation.add(whiteFront); scene.add(orientation);
    scene.add(new AmbientLight(0xffffff, 2));
    const key = new DirectionalLight(0xffffff, 2.5); key.position.set(-3, 5, 6); scene.add(key);
    const fill = new DirectionalLight(0xffffff, 1); fill.position.set(4, 1, 3); scene.add(fill);
    views.push({ el, scene, camera, orientation, model, size: asset.size }); render();
  } catch (error) { el.classList.add('error'); el.textContent = String(error); }
}));
document.querySelector('#status')!.textContent = `${views.length}/${selected.length} loaded`;
Object.assign(window, { cubixReview: { ready: views.length, total: selected.length, render } });
