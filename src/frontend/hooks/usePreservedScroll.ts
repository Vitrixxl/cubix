import {useCallback} from 'react';
const positions=new Map<string,{top:number;left:number}>();
const storageKey='cubix.scroll.v1';
try{for(const [key,value] of JSON.parse(sessionStorage.getItem(storageKey)??'[]'))positions.set(key,value);}catch{/* No browser storage during SSR or private browsing. */}
function save(key:string,element:HTMLElement){
  positions.delete(key);positions.set(key,{top:element.scrollTop,left:element.scrollLeft});
  while(positions.size>200)positions.delete(positions.keys().next().value!);
}
function persist(){try{sessionStorage.setItem(storageKey,JSON.stringify([...positions]));}catch{/* Scroll memory is optional. */}}
if(typeof window!=='undefined')window.addEventListener('pagehide',persist);
/** Callback refs also run after AnimatePresence mounts the incoming panel. */
export function usePreservedScroll<T extends HTMLElement=HTMLDivElement>(key:string){
  return useCallback((element:T|null)=>{
    if(!element)return;
    const target=positions.get(key);let restoring=!!target,frame=0;
    const started=performance.now();
    const restore=()=>{
      if(!restoring||!target)return;
      element.scrollTop=target.top;element.scrollLeft=target.left;
      if((Math.abs(element.scrollTop-target.top)<1&&Math.abs(element.scrollLeft-target.left)<1)||performance.now()-started>2000){restoring=false;return;}
      frame=requestAnimationFrame(restore);
    };
    if(restoring)restore();
    const scroll=()=>{if(!restoring&&element.clientHeight>0)save(key,element);};
    const interrupt=()=>{restoring=false;cancelAnimationFrame(frame);};
    element.addEventListener('scroll',scroll,{passive:true});
    element.addEventListener('wheel',interrupt,{passive:true});element.addEventListener('touchstart',interrupt,{passive:true});element.addEventListener('pointerdown',interrupt);element.addEventListener('keydown',interrupt);
    return()=>{
      cancelAnimationFrame(frame);if(!restoring&&element.clientHeight>0)save(key,element);persist();
      element.removeEventListener('scroll',scroll);element.removeEventListener('wheel',interrupt);element.removeEventListener('touchstart',interrupt);element.removeEventListener('pointerdown',interrupt);element.removeEventListener('keydown',interrupt);
    };
  },[key]);
}
