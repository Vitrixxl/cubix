import {useEffect,useState} from 'react';
import {hasCubeTemplates,installCubeTemplates,type CubeTemplateData} from '../lib/three/cube-model';
let worker:Worker|null=null,nextId=0;
const pending=new Map<number,{resolve:(data:CubeTemplateData[])=>void;reject:(error:Error)=>void}>();
const requests=new Map<number,Promise<void>>();
function requestTemplates(size:number){
  if(!worker){
    worker=new Worker('/workers/puzzle-model.js',{type:'module',name:'Cubix puzzle geometry'});
    worker.onmessage=({data}:{data:{id:number;templates?:CubeTemplateData[];error?:string}})=>{
      const request=pending.get(data.id);if(!request)return;pending.delete(data.id);
      if(data.templates)request.resolve(data.templates);else request.reject(new Error(data.error??'Model unavailable'));
    };
    worker.onerror=event=>{
      event.preventDefault();
      pending.forEach(request=>request.reject(new Error('The 3D model could not be loaded.')));pending.clear();worker?.terminate();worker=null;
    };
  }
  const id=++nextId;
  return new Promise<CubeTemplateData[]>((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,size});});
}
export function loadCubeGeometry(size:number){
  if(hasCubeTemplates(size))return Promise.resolve();
  // 2/3, 4/5 and 6/7 share their respective detail level.
  const level=size<=3?3:size<=5?5:7;
  let request=requests.get(level);
  if(!request){
    request=Promise.resolve().then(()=>requestTemplates(size)).then(installCubeTemplates).finally(()=>requests.delete(level));requests.set(level,request);
  }
  return request;
}
export function useCubeGeometry(size:number|null){
  const [,refresh]=useState(0),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const ready=size===null||hasCubeTemplates(size);
  useEffect(()=>{
    let active=true;setError('');if(size===null||ready)return;
    void loadCubeGeometry(size).then(()=>{if(active)refresh(value=>value+1);}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[size,attempt,ready]);
  return {ready,error,retry:()=>setAttempt(value=>value+1)};
}
