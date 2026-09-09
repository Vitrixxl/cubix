import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {BoxGeometry,BufferAttribute,BufferGeometry,Float32BufferAttribute,Group,Matrix4,InstancedMesh,InstancedBufferAttribute,DynamicDrawUsage,Color,MeshPhysicalMaterial,Quaternion,Sphere,Vector3} from 'three';
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
/** The outer silhouette stays square; the internal junctions have generous corner-cutting radii. */
export function createCubieShell(unit:number,directions:Vector3[]){
  // Smaller cubies need fewer subdivisions at the same viewport size.
  const segments=unit<.4?12:unit<.6?16:24;
  const half=.49,base=new BoxGeometry(unit*.98,unit*.98,unit*.98,segments,segments,segments);
  const positions=base.getAttribute('position'),point=new Vector3();
  const exposed=[0,0,0];
  for(const direction of directions)for(let axis=0;axis<3;axis++)if(direction.getComponent(axis))exposed[axis]=direction.getComponent(axis);
  // Intersect three rounded extrusions. The broad corner cut is independent of
  // the shallow edge fillet, so the coloured faces retain a regular, flat outline.
  const smoothMax=(a:number,b:number)=>{
    const h=Math.max(.025-Math.abs(a-b),0)/.025;
    return Math.max(a,b)+h*h*.025/4;
  };
  const distance=(x:number,y:number,z:number)=>{
    const p=[x,y,z],distances:number[]=[];
    for(let axis=0;axis<3;axis++){
      const a=(axis+1)%3,b=(axis+2)%3;
      const outer=(exposed[a]*p[a]>0)||(exposed[b]*p[b]>0);
      const radius=exposed[axis] && !outer ? .18 : .045;
      const u=Math.abs(p[a])-half+radius,v=Math.abs(p[b])-half+radius;
      distances.push(Math.hypot(Math.max(u,0),Math.max(v,0))+Math.min(Math.max(u,v),0)-radius);
    }
    const [a,b,c]=distances;
    return (smoothMax(smoothMax(a,b),c)+smoothMax(smoothMax(a,c),b)+smoothMax(smoothMax(b,c),a))/3;
  };
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).divideScalar(unit);
    let lo=0,hi=1;
    for(let step=0;step<16;step++){
      const t=(lo+hi)/2;
      if(distance(point.x*t,point.y*t,point.z*t)>0)hi=t;else lo=t;
    }
    const rounded=point.clone().multiplyScalar((lo+hi)/2);
    // A shallow crown gives the plastic a broad highlight, without bulging seams.
    for(let axis=0;axis<3;axis++)if(Math.abs(Math.abs(point.getComponent(axis))-half)<1e-6){
      const a=point.getComponent((axis+1)%3)/half,b=point.getComponent((axis+2)%3)/half;
      rounded.setComponent(axis,rounded.getComponent(axis)+Math.sign(point.getComponent(axis))*.005*(1-a*a)**2*(1-b*b)**2);
    }
    positions.setXYZ(i,rounded.x*unit,rounded.y*unit,rounded.z*unit);
  }
  base.deleteAttribute('normal');base.deleteAttribute('uv');
  const welded=mergeVertices(base,unit*1e-5);welded.computeVertexNormals();
  const shell=welded.toNonIndexed();base.dispose();welded.dispose();
  return shell;
}
/** A single moulded cubie. Coloured plastic continues around the bevel and onto its inner faces. */
export function createStickerlessGeometry(unit:number,directions:Vector3[]){
  const base=createCubieShell(unit,directions);
  const positions=base.getAttribute('position'),normals=base.getAttribute('normal');
  const geometry=new BufferGeometry(),vertices:number[]=[],vertexNormals:number[]=[],occlusion:number[]=[];
  for(const [material,direction] of directions.entries()){
    const start=vertices.length/3;
    const planes=directions.filter(other=>other!==direction).map(other=>direction.clone().sub(other));
    for(let i=0;i<positions.count;i+=3){
      let polygon:Vertex[]=Array.from({length:3},(_,j)=>({position:new Vector3().fromBufferAttribute(positions,i+j),normal:new Vector3().fromBufferAttribute(normals,i+j)}));
      for(const plane of planes){polygon=clip(polygon,plane);if(polygon.length<3)break;}
      for(let j=1;j<polygon.length-1;j++){
        const triangle=[polygon[0],polygon[j],polygon[j+1]];
        if(new Vector3().subVectors(triangle[1].position,triangle[0].position).cross(new Vector3().subVectors(triangle[2].position,triangle[0].position)).lengthSq()<1e-18)continue;
        for(const vertex of triangle){
          vertices.push(...vertex.position.toArray());vertexNormals.push(...vertex.normal.toArray());
          // The environment light cannot reach deeply recessed plastic between pieces.
          const depth=Math.max(...directions.map(n=>vertex.position.dot(n)))/unit;
          const t=Math.max(0,Math.min(1,(depth-.08)/.39)),shade=.35+.65*t*t*(3-2*t);
          occlusion.push(shade,shade,shade);
        }
      }
    }
    geometry.addGroup(start,vertices.length/3-start,material);
  }
  base.dispose();
  geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('normal',new Float32BufferAttribute(vertexNormals,3));
  geometry.setAttribute('color',new Float32BufferAttribute(occlusion,3));
  geometry.computeBoundingSphere();
  return geometry;
}

// Three templates per detail level, shared by all sizes. GPU copies belong to their model.
const templates=new Map<string,BufferGeometry>();
function cubieTemplate(unit:number,count:number){
  const level=unit<.4?12:unit<.6?16:24,key=`${level}:${count}`;
  let template=templates.get(key);
  if(!template){
    const directions=[new Vector3(0,0,1),new Vector3(0,1,0),new Vector3(1,0,0)].slice(0,count);
    template=createStickerlessGeometry(unit,directions);template.scale(1/unit,1/unit,1/unit);
    const regions=new Float32Array(template.getAttribute('position').count);
    for(const group of template.groups)regions.fill(group.materialIndex!,group.start,group.start+group.count);
    template.setAttribute('colourRegion',new Float32BufferAttribute(regions,1));template.clearGroups();
    templates.set(key,template);
  }
  return template.clone();
}
export interface CubeTemplateData { key:string; attributes:Record<string,{array:Float32Array;itemSize:number;normalized:boolean}>; }
export function hasCubeTemplates(size:number){
  const unit=2/size,level=unit<.4?12:unit<.6?16:24;
  return [1,2,3].every(count=>templates.has(`${level}:${count}`));
}
/** Transfer owned typed arrays; the worker retains its reusable templates. */
export function exportCubeTemplates(size:number):CubeTemplateData[]{
  const unit=2/size,level=unit<.4?12:unit<.6?16:24;
  return [1,2,3].map(count=>{
    const geometry=cubieTemplate(unit,count);
    const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,{array:attribute.array as Float32Array,itemSize:attribute.itemSize,normalized:attribute.normalized}]));
    geometry.dispose();return {key:`${level}:${count}`,attributes};
  });
}
export function installCubeTemplates(data:CubeTemplateData[]){
  for(const {key,attributes} of data){
    if(templates.has(key))continue;
    const geometry=new BufferGeometry();
    for(const [name,attribute] of Object.entries(attributes))geometry.setAttribute(name,new BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized));
    templates.set(key,geometry);
  }
}
function plasticMaterial(){
  const material=new MeshPhysicalMaterial({vertexColors:true,roughness:.32,metalness:0,clearcoat:.18,clearcoatRoughness:.3});
  // Each physical piece has up to three plastic colours, while all pieces of a
  // shape share one draw call. The baked recess shading remains in vertex colours.
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <color_pars_vertex>',`#include <color_pars_vertex>
      attribute float colourRegion;
      attribute vec3 faceColour0;
      attribute vec3 faceColour1;
      attribute vec3 faceColour2;`)
      .replace('#include <color_vertex>',`#include <color_vertex>
      vColor *= colourRegion < 0.5 ? faceColour0 : (colourRegion < 1.5 ? faceColour1 : faceColour2);`);
  };
  material.customProgramCacheKey=()=> 'cubix-stickerless-instances-v1';
  return material;
}

export function createCubeModel(size:number){
  const object=new Group(),unit=2/size,slots=slotsFor(size);
  const cubieSlots=new Map<string,number[]>();
  for(const [index,slot] of slots.entries()){
    const key=slot.p.join(',');const list=cubieSlots.get(key)??[];list.push(index);cubieSlots.set(key,list);
  }
  const pieces=[...cubieSlots.values()].map(slotIndices=>{
    const indices=[...slotIndices];
    if(indices.length===3&&new Vector3(...slots[indices[1]].n).cross(new Vector3(...slots[indices[0]].n)).dot(new Vector3(...slots[indices[2]].n))<0)[indices[0],indices[1]]=[indices[1],indices[0]];
    const z=new Vector3(...slots[indices[0]].n),y=indices.length>1?new Vector3(...slots[indices[1]].n):null;
    const orientation=y?new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3().crossVectors(y,z),y,z)):new Quaternion().setFromUnitVectors(new Vector3(0,0,1),z);
    return {indices,orientation,position:new Vector3(...slots[indices[0]].p).multiplyScalar(unit)};
  });
  const batches=[1,2,3].flatMap(count=>{
    const members=pieces.filter(piece=>piece.indices.length===count);if(!members.length)return [];
    const geometry=cubieTemplate(unit,count);
    const colours=Array.from({length:3},(_,i)=>{
      const attribute=new InstancedBufferAttribute(new Float32Array(members.length*3),3).setUsage(DynamicDrawUsage);
      geometry.setAttribute(`faceColour${i}`,attribute);return attribute;
    });
    const mesh=new InstancedMesh(geometry,plasticMaterial(),members.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.boundingSphere=new Sphere(new Vector3(),2);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.pieces=members;
    object.add(mesh);return [{mesh,members,colours}];
  });
  const matrix=new Matrix4(),position=new Vector3(),orientation=new Quaternion(),scale=new Vector3(unit,unit,unit),colour=new Color();
  return {object,update(state:CubeState,mask:CubeMask,animation?:LayerAnimation|null){
    const moving=animation?new Set(movingSlots(animation.move,cubeSize(state))):null;
    const q=new Quaternion();if(animation){const axis=new Vector3();axis.setComponent(animation.move.axis,1);q.setFromAxisAngle(axis,animation.angle*Math.PI/180);}
    for(const {mesh,members,colours} of batches){
      members.forEach((piece,instance)=>{
        piece.indices.forEach((slot,i)=>{colour.set(stickerColor(state,slot,mask));colours[i].setXYZ(instance,colour.r,colour.g,colour.b);});
        position.copy(piece.position);orientation.copy(piece.orientation);
        if(moving?.has(piece.indices[0])){position.applyQuaternion(q);orientation.premultiply(q);}
        mesh.setMatrixAt(instance,matrix.compose(position,orientation,scale));
      });
      mesh.instanceMatrix.needsUpdate=true;colours.forEach(attribute=>attribute.needsUpdate=true);
    }
  }};
}
