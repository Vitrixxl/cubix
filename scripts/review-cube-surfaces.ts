/** Local visual review only. Does not preload models in the public application. */
export {};
const bundle = await Bun.build({ entrypoints: ['scripts/cube-surface-review-client.ts'], target: 'browser', minify: true });
if (!bundle.success) throw new Error(bundle.logs.join('\n'));
Bun.serve({ hostname: '127.0.0.1', port: 5182, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/review.js') return new Response(bundle.outputs[0], { headers: { 'Content-Type': 'application/javascript' } });
  if (/^\/cube-library\/models\/[a-z0-9-]+\/[a-f0-9]{64}\.glb$/.test(path)) return new Response(Bun.file(`public${path}`));
  if (path !== '/') return new Response('Not found', { status: 404 });
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Cubix surface review</title><style>
  *{box-sizing:border-box}body{margin:0;font:13px system-ui;background:#ecedef;color:#202326;height:100vh;overflow:hidden}header{height:54px;display:flex;align-items:center;gap:14px;padding:10px}button,a{color:inherit}#grid{height:calc(100vh - 54px);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px}.card{position:relative;background:white;min-height:0;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:40px 1fr}.card strong{grid-column:1/-1;padding:6px;font-size:12px}.card img{width:100%;height:100%;object-fit:contain;min-height:0}.view{min-width:0;min-height:0}canvas{position:fixed;inset:0;pointer-events:none}#grid.single{grid-template-columns:1fr;grid-template-rows:1fr}.error{color:red}</style></head><body><header><a id="prev">Previous</a><strong id="page"></strong><a id="next">Next</a><button id="front">Front</button><button id="iso">Perspective</button><button id="turn">45° turn</button><span id="status"></span></header><main id="grid"></main><script type="module" src="/review.js"></script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
} });
console.log('Surface comparison: http://localhost:5182/');
