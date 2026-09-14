export {};
const result=await Bun.build({entrypoints:['desktop/engine/main.ts'],outdir:'desktop/bin',target:'bun',minify:true});
if(!result.success){console.error(result.logs);process.exit(1);}
const {cp,mkdir}=await import('node:fs/promises');
await mkdir('desktop/bin/vendor',{recursive:true});
await cp('node_modules/cubing/dist/lib/cubing','desktop/bin/vendor/cubing',{recursive:true});
await mkdir('desktop/bin/vendor/node_modules',{recursive:true});
await cp('node_modules/random-uint-below','desktop/bin/vendor/node_modules/random-uint-below',{recursive:true,dereference:true});
// Standalone Bun executables do not resolve bare package names in external worker
// modules consistently. Keep module boundaries and point at the bundled dependency.
const {readdir,readFile,writeFile}=await import('node:fs/promises');
const {relative,dirname,join}=await import('node:path');
async function explicitWorkerImports(directory:string):Promise<void>{
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory())await explicitWorkerImports(path);
  else if(path.endsWith('.js')){
   const before=await readFile(path,'utf8');
   const dependency=relative(dirname(path),'desktop/bin/vendor/node_modules/random-uint-below/dist/esm/index.js').replaceAll('\\','/');
   const after=before.replaceAll('from "random-uint-below"',`from "${dependency.startsWith('.')?dependency:'./'+dependency}"`);
   if(after!==before)await writeFile(path,after);
  }
 }
}
await explicitWorkerImports('desktop/bin/vendor/cubing');
