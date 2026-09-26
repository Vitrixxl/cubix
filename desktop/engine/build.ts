import { copyCubing } from '../vendor';
const result=await Bun.build({entrypoints:['desktop/engine/main.ts'],outdir:'desktop/bin',target:'bun',minify:true});
if(!result.success){console.error(result.logs);process.exit(1);}
await copyCubing('desktop/bin/vendor');
