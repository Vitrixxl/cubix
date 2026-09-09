/** A separate browser bundle keeps Three.js geometry construction off the UI thread. */
export async function buildModelWorker(outdir='build/workers'){
  const result=await Bun.build({entrypoints:['./src/frontend/workers/puzzle-model.ts'],outdir,target:'browser',format:'esm',minify:true,naming:'puzzle-model.js'});
  if(!result.success)throw new AggregateError(result.logs,'Could not build the puzzle worker');
}
