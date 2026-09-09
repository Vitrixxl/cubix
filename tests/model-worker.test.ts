import {expect,test} from 'bun:test';
import type {CubeTemplateData} from '../src/frontend/lib/three/cube-model';

test('geometry worker transfers reusable templates for all detail levels and rejects invalid sizes',async()=>{
  const worker=new Worker(new URL('../src/frontend/workers/puzzle-model.ts',import.meta.url).href);
  let id=0;
  const request=(size:number)=>new Promise<{templates?:CubeTemplateData[];error?:string}>((resolve,reject)=>{
    worker.onmessage=event=>resolve(event.data);worker.onerror=event=>reject(new Error(event.message));worker.postMessage({id:++id,size});
  });
  try{
    for(const size of [2,3,4,5,6,7,3]){
      const result=await request(size);expect(result.error).toBeUndefined();expect(result.templates).toHaveLength(3);
      for(const template of result.templates!){
        const {position,normal,color,colourRegion}=template.attributes;
        expect(position.array).toBeInstanceOf(Float32Array);expect(position.array.length).toBeGreaterThan(0);
        expect(normal.array.length).toBe(position.array.length);expect(color.array.length).toBe(position.array.length);
        expect(colourRegion.array.length*3).toBe(position.array.length);
        expect(position.array.every(Number.isFinite)).toBe(true);
      }
    }
    expect((await request(8)).error).toBe('Unsupported cube size');
    expect((await request(3)).templates).toHaveLength(3);
  }finally{worker.terminate();}
});
