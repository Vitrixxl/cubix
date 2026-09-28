import { cubeScene as cubePreview } from '../../src/shared/cubeScene';
import { maskForStage } from '../../src/client/lib/caseState';
import { viewForStage } from '../../src/shared/cubeDiagram';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdir, readFile } from 'node:fs/promises';
import { cases, sets } from '../../src/client/local/catalog';
import { CaseDiagram } from '../../src/client/diagrams/CaseDiagram';
import * as icons from '../../src/client/diagrams/icons';
import shared from '../../data/catalog.json';
const puzzles=shared.puzzles;
await mkdir('desktop/assets/cases',{recursive:true});
await mkdir('desktop/assets/icons',{recursive:true});
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
for(const [name,Icon] of Object.entries(icons)) await Bun.write(`desktop/assets/icons/${name}.svg`,svgDocument(renderToStaticMarkup(createElement(Icon)).replaceAll('currentColor','#ffffff')));
// Native control icons use the same 24px stroke geometry as the shared icons.
for (const [name,path] of Object.entries({IconBook:'M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15M5 8h4M15 8h4M5 12h4M15 12h4',IconChevronDown:'M6 9l6 6 6-6',IconChevronRight:'M9 6l6 6-6 6',IconInfo:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01',IconPlus:'M12 6v12M6 12h12',IconShare:'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',IconTrash:'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6'})) {
 await Bun.write(`desktop/assets/icons/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`);
}
await Bun.write('desktop/assets/catalog.json',JSON.stringify({cases:catalog,sets,puzzles}));
console.log(`Exported ${catalog.length} diagrams and ${Object.keys(icons).length} icons for the web app`);
