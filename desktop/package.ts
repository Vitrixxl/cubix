/** Build a self-contained native application directory for the current desktop OS. */
import {cp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dir,'..');process.chdir(root);
async function run(args:string[]){const p=Bun.spawn(args,{stdout:'inherit',stderr:'inherit'});if(await p.exited)throw Error(`Build failed: ${args[0]}`);}
await run(['bun','desktop/scripts/export-assets.tsx']);
await run(['bun','desktop/engine/build.ts']);
const cargo=process.env.CARGO??Bun.which('cargo')??join(process.env.HOME??process.env.USERPROFILE!,'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo');
await run([cargo,'build','--manifest-path','desktop/Cargo.toml','--release','--locked']);
const name=`cubix-${process.platform}-${process.arch}`;const out=resolve('artifacts/gpui',name);await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const ext=process.platform==='win32'?'.exe':'';
await cp(join(process.env.CARGO_TARGET_DIR??'desktop/target',`release/cubix-desktop${ext}`),join(out,`cubix-desktop${ext}`));
await run(['bun','build','desktop/bin/main.js','--compile','--outfile',join(out,`cubix-engine${ext}`)]);
await cp('desktop/assets',join(out,'assets'),{recursive:true});
await cp('desktop/bin/vendor',join(out,'vendor'),{recursive:true});
await cp('desktop/NOTICE',join(out,'NOTICE'));
await cp('desktop/licenses',join(out,'licenses'),{recursive:true});
await cp('desktop/README.md',join(out,'README.md'));
console.log(out);
