import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshPhysicalMaterial,Quaternion,Vector3} from 'three';
import {cubeSize,movingSlots,slotsFor,type CubeState} from '../../../shared/cube';
import {stickerColor,type CubeMask,type LayerAnimation} from '../cube-appearance';

type Vertex={position:Vector3;normal:Vector3};
/** Split the solid at the colour seams; interpolated normals keep the bevel smooth. */
function clip(polygon:Vertex[],plane:Vector3):Vertex[]{
  const result:Vertex[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    const da=a.position.dot(plane),db=b.position.dot(plane);
    if(da>=-1e-10)result.push(a);
    if((da<0&&db>0)||(da>0&&db<0)){
      const t=da/(da-db);
      result.push({position:a.position.clone().lerp(b.position,t),normal:a.normal.clone().lerp(b.normal,t).normalize()});
    }
  }
  return result;
}
/** A single moulded cubie. Coloured plastic continues around the bevel and onto its inner faces. */
export function createStickerlessGeometry(unit:number,directions:Vector3[]){
  const base=new RoundedBoxGeometry(unit*.98,unit*.98,unit*.98,3,unit*.095);
  const positions=base.getAttribute('position'),normals=base.getAttribute('normal');
  const geometry=new BufferGeometry(),vertices:number[]=[],vertexNormals:number[]=[];
  for(const [material,direction] of directions.entries()){
    const start=vertices.length/3;
    const planes=directions.filter(other=>other!==direction).map(other=>direction.clone().sub(other));
    for(let i=0;i<positions.count;i+=3){
      let polygon:Vertex[]=Array.from({length:3},(_,j)=>({position:new Vector3().fromBufferAttribute(positions,i+j),normal:new Vector3().fromBufferAttribute(normals,i+j)}));
      for(const plane of planes){polygon=clip(polygon,plane);if(polygon.length<3)break;}
      for(let j=1;j<polygon.length-1;j++){
        const triangle=[polygon[0],polygon[j],polygon[j+1]];
        if(new Vector3().subVectors(triangle[1].position,triangle[0].position).cross(new Vector3().subVectors(triangle[2].position,triangle[0].position)).lengthSq()<1e-18)continue;
        for(const vertex of triangle){vertices.push(...vertex.position.toArray());vertexNormals.push(...vertex.normal.toArray());}
      }
    }
    geometry.addGroup(start,vertices.length/3-start,material);
  }
  base.dispose();
  geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('normal',new Float32BufferAttribute(vertexNormals,3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCubeModel(size:number){
  const object=new Group(),unit=2/size,slots=slotsFor(size);
  const cubieSlots=new Map<string,number[]>();
  for(const [index,slot] of slots.entries()){
    const key=slot.p.join(',');const list=cubieSlots.get(key)??[];list.push(index);cubieSlots.set(key,list);
  }
  const geometries=new Map<string,BufferGeometry>();
  const pieces=[...cubieSlots.values()].map(indices=>{
    const directions=indices.map(i=>new Vector3(...slots[i].n)),key=directions.map(n=>n.toArray().join(',')).join('|');
    let geometry=geometries.get(key);
    if(!geometry){geometry=createStickerlessGeometry(unit,directions);geometries.set(key,geometry);}
    const materials=indices.map(()=>new MeshPhysicalMaterial({roughness:.3,metalness:0,clearcoat:.24,clearcoatRoughness:.3}));
    const mesh=new Mesh(geometry,materials);mesh.position.set(...slots[indices[0]].p).multiplyScalar(unit);
    mesh.userData.cubieSlots=indices;object.add(mesh);
    return {mesh,position:mesh.position.clone(),indices,materials};
  });
  return {object,update(state:CubeState,mask:CubeMask,animation?:LayerAnimation|null){
    const moving=animation?new Set(movingSlots(animation.move,cubeSize(state))):null;
    const q=new Quaternion();if(animation){const axis=new Vector3();axis.setComponent(animation.move.axis,1);q.setFromAxisAngle(axis,animation.angle*Math.PI/180);}
    for(const piece of pieces){
      piece.indices.forEach((slot,i)=>piece.materials[i].color.set(stickerColor(state,slot,mask)));
      piece.mesh.position.copy(piece.position);piece.mesh.quaternion.identity();
      if(moving?.has(piece.indices[0])){piece.mesh.position.applyQuaternion(q);piece.mesh.quaternion.copy(q);}
    }
  }};
}
