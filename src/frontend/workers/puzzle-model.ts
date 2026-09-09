import {exportCubeTemplates} from '../lib/three/cube-model';
import type {CubeTemplateData} from '../lib/three/cube-model';
const scope=globalThis as unknown as {
  onmessage:(event:MessageEvent<{id:number;size:number}>)=>void;
  postMessage:(value:{id:number;templates?:CubeTemplateData[];error?:string},transfer?:ArrayBuffer[])=>void;
};
scope.onmessage=({data:{id,size}})=>{
  try{
    if(!Number.isInteger(size)||size<2||size>7)throw Error('Unsupported cube size');
    const templates=exportCubeTemplates(size);
    scope.postMessage({id,templates},templates.flatMap(template=>Object.values(template.attributes).map(attribute=>attribute.array.buffer as ArrayBuffer)));
  }catch(error){scope.postMessage({id,error:(error as Error).message});}
};
