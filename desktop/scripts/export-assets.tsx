import { cubePreview } from '../engine/cubePreview';
import { maskForStage } from '../../src/client/lib/caseState';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdir, readFile } from 'node:fs/promises';
import { cases, sets } from '../../src/client/local/catalog';
import { CaseDiagram } from '../../src/client/diagrams/CaseDiagram';
import * as icons from '../../src/client/diagrams/icons';
import puzzles from '../../data/puzzles.json';
await mkdir('desktop/assets/cases',{recursive:true});
await mkdir('desktop/assets/icons',{recursive:true});
const svgDocument=(s:string)=>s.includes('xmlns=')?s:s.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
const catalog=[];
for(const [index,c] of cases.entries()){
 const file=`cases/${index}.svg`;
 const svg=c.diagram?await readFile(`assets${c.diagram}`,'utf8'):renderToStaticMarkup(createElement(CaseDiagram,{c,size:300}));
 await Bun.write(`desktop/assets/${file}`,svgDocument(svg));
 catalog.push({...c,asset:file,...(!c.diagram ? {cube:cubePreview(c.setup,c.cube_size ?? 3,maskForStage(c.stage),false)} : {})});
}
for(const [name,Icon] of Object.entries(icons)) await Bun.write(`desktop/assets/icons/${name}.svg`,svgDocument(renderToStaticMarkup(createElement(Icon)).replaceAll('currentColor','#ffffff')));
// Native control icons use the same 24px stroke geometry as the shared icons.
for (const [name,path] of Object.entries({IconChevronDown:'M6 9l6 6 6-6',IconChevronRight:'M9 6l6 6-6 6',IconPlus:'M12 6v12M6 12h12'})) {
 await Bun.write(`desktop/assets/icons/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`);
}
await Bun.write('desktop/assets/catalog.json',JSON.stringify({cases:catalog,sets,puzzles}));
console.log(`Exported ${catalog.length} diagrams and ${Object.keys(icons).length} icons for the native application`);
// Export semantic guide content, not rendered pages. GPUI performs all layout.
const {GuideContent}=await import('../guides/Content');
const {GUIDES}=await import('../guides/pages');
function nodes(node:any):any[]{
 if(node==null||typeof node==='boolean')return [];
 if(Array.isArray(node))return node.flatMap(nodes);
 if(typeof node==='string'||typeof node==='number')return [String(node)];
 if(typeof node.type==='function')return nodes(node.type(node.props));
 if(typeof node.type==='symbol')return nodes(node.props.children);
 return [{tag:node.type,class:node.props.className??'',href:node.props.href??'',children:nodes(node.props.children)}];
}
await Bun.write('desktop/assets/guides.json',JSON.stringify(Object.fromEntries(Object.entries(GUIDES).map(([p,info])=>[p,{...info,content:nodes(GuideContent({page:p as any}))[0]}]))));
