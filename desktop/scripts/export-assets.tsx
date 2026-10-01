import { cubeScene as cubePreview } from '../../src/shared/cubeScene';
import { maskForStage } from '../../src/client/lib/caseState';
import { viewForStage } from '../../src/shared/cubeDiagram';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdir, readFile } from 'node:fs/promises';
import { cases, sets } from '../../src/client/local/catalog';
import { CaseDiagram } from '../../src/client/diagrams/CaseDiagram';
import shared from '../../data/catalog.json';
const puzzles=shared.puzzles;
await mkdir('desktop/assets/cases',{recursive:true});
const svgDocument=(s:string)=>s.includes('xmlns=')?s:s.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
const catalog=[];
for(const [index,c] of cases.entries()){
 const file=`cases/${index}.svg`;
 const svg=c.diagram?await readFile(`assets${c.diagram}`,'utf8'):renderToStaticMarkup(createElement(CaseDiagram,{c,size:300}));
 await Bun.write(`desktop/assets/${file}`,svgDocument(svg));
 // Cases read from above keep their diagram on the desktop; the others are shown on the 3D cube.
 const flat=!c.diagram&&viewForStage(c.stage)!=='iso';
 catalog.push({...c,asset:file,...(flat ? {flat} : !c.diagram ? {cube:cubePreview(c.setup,c.cube_size ?? 3,maskForStage(c.stage),false)} : {})});
}
await Bun.write('desktop/assets/catalog.json',JSON.stringify({cases:catalog,sets,puzzles}));
console.log(`Exported ${catalog.length} diagrams for the web app`);
