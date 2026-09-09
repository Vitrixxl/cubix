import {BufferGeometry,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,Quaternion,Vector3} from 'three';
import type {PuzzleGeometry} from 'cubing/puzzle-geometry';
import type {KPattern} from 'cubing/kpuzzle';
import type {Move} from 'cubing/alg';
export type StickerGeometry=ReturnType<PuzzleGeometry['get3d']>;
/** cubing.js supplies the exact cuts and notation; Three.js owns the scene and animation. */
export function createPolyhedralModel(data:StickerGeometry){
  const object=new Group();
  const colors=new Map(data.stickers.map(s=>[`${s.orbit}:${s.ord}:${s.ori}`,s.color]));
  const axes=new Map(data.axis.map(a=>[a.quantumMove.family,a]));
  const stickers=data.stickers.map(sticker=>{
    const points:Vector3[]=[];for(let i=0;i<sticker.coords.length;i+=3)points.push(new Vector3(...sticker.coords.slice(i,i+3) as [number,number,number]));
    const center=points.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(points.length),group=new Group();object.add(group);
    const face=(inset:number,color:string)=>{
      const coords:number[]=[];const vertices=points.map(p=>p.clone().sub(center).multiplyScalar(inset).add(center));
      if(inset<1)vertices.forEach(p=>p.addScaledVector(center,.001));
      for(let i=1;i<vertices.length-1;i++)coords.push(...vertices[0].toArray(),...vertices[i].toArray(),...vertices[i+1].toArray());
      const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(coords,3));geometry.computeVertexNormals();
      const material=new MeshBasicMaterial({color,side:DoubleSide}),mesh=new Mesh(geometry,material);group.add(mesh);return material;
    };
    face(1,'#111217');const material=face(.91,sticker.color);
    return {group,material,sticker};
  });
  return {object,update(pattern:KPattern,move?:Move,fraction=0){
    const internal=move?data.unswizzle(move):null,axis=internal?axes.get(internal.family):null;
    const rotation=axis&&internal?new Quaternion().setFromAxisAngle(new Vector3(...axis.coordinates).normalize(),-fraction*internal.amount*Math.PI*2/axis.order):new Quaternion();
    let transformation;
    if(move){try{transformation=pattern.kpuzzle.moveToTransformation(move.modified({amount:1}));}catch{
      const mapped=data.notationMapper.notationToInternal(move),external=mapped&&data.notationMapper.notationToExternal(mapped.modified({amount:1}));
      if(!external)throw Error(`Unsupported move: ${move}`);transformation=pattern.kpuzzle.moveToTransformation(external);
    }}
    for(const {group,material,sticker:s} of stickers){
      const orbit=pattern.patternData[s.orbit],count=pattern.kpuzzle.definition.orbits.find(o=>o.orbitName===s.orbit)!.numOrientations;
      material.color.set(colors.get(`${s.orbit}:${orbit.pieces[s.ord]}:${(s.ori+count-orbit.orientation[s.ord])%count}`)!);
      const t=transformation?.transformationData[s.orbit],moving=t&&(t.permutation[s.ord]!==s.ord||t.orientationDelta[s.ord]!==0);
      group.quaternion.copy(moving?rotation:new Quaternion());
    }
  }};
}
