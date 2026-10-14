import { viewForStage } from '../../src/shared/cubeDiagram';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdir, readFile } from 'node:fs/promises';
import { cases, sets } from '../../src/client/local/catalog';
import { CaseDiagram } from '../../src/client/diagrams/CaseDiagram';
import shared from '../../data/catalog.json';
import { optimize } from 'svgo';
const puzzles=shared.puzzles;
await mkdir('desktop/assets/cases',{recursive:true});
// Each diagram is an image of its own, read and laid out apart: a set's dozens of them, at a tenth of a unit, one path a colour.
const svgDocument=(s:string)=>optimize(s.includes('xmlns=')?s:s.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"'),{multipass:true,floatPrecision:1}).data;
const catalog=[];
for(const [index,c] of cases.entries()){
 const file=`cases/${index}.svg`;
 const svg=c.diagram?await readFile(`assets${c.diagram}`,'utf8'):renderToStaticMarkup(createElement(CaseDiagram,{c,size:300}));
 await Bun.write(`desktop/assets/${file}`,svgDocument(svg));
 // Cases read from above keep their diagram on the desktop; the others are drawn on the 3D cube (`Diagram`, ui.tsx).
 const flat=!c.diagram&&viewForStage(c.stage)!=='iso';
 catalog.push({...c,asset:file,...(flat ? {flat} : {})});
}
await Bun.write('desktop/assets/catalog.json',JSON.stringify({cases:catalog,sets,puzzles}));
console.log(`Exported ${catalog.length} diagrams for the web app`);
