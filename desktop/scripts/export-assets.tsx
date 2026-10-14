import { viewForStage } from '../../src/shared/cubeDiagram';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { cases, sets } from '../../src/client/local/catalog';
import shared from '../../data/catalog.json';
import { optimize } from 'svgo';
const puzzles=shared.puzzles;
await rm('desktop/assets/cases',{recursive:true,force:true});
await mkdir('desktop/assets/cases',{recursive:true});
// A puzzle's own diagram (Square-1 and the like), at a tenth of a unit, one path a colour.
const svgDocument=(s:string)=>optimize(s.includes('xmlns=')?s:s.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"'),{multipass:true,floatPrecision:1}).data;
const catalog=[];
let files=0;
for(const [index,c] of cases.entries()){
 // A cube's cases are drawn by the app where they show (ui.tsx `Diagram`): seen from above, or on the 3D cube.
 if(!c.diagram){
  catalog.push({...c,...(viewForStage(c.stage)!=='iso' ? {flat:true} : {})});
  continue;
 }
 const file=`cases/${index}.svg`;
 await Bun.write(`desktop/assets/${file}`,svgDocument(await readFile(`assets${c.diagram}`,'utf8')));
 catalog.push({...c,asset:file});
 files++;
}
await Bun.write('desktop/assets/catalog.json',JSON.stringify({cases:catalog,sets,puzzles}));
console.log(`Exported ${files} puzzle diagrams for the web app`);
