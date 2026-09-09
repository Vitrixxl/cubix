import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import {ExtrudeGeometry,Group,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,Quaternion,Shape,Vector3} from 'three';
import {cubeSize,movingSlots,slotsFor,type CubeState} from '../../../shared/cube';
import {stickerColor,type CubeMask,type LayerAnimation} from '../cube-appearance';

/** A rounded, raised tile with a soft bevel, sharing geometry across all facelets. */
function createTileGeometry(unit:number){
  const half=unit*.435,r=unit*.09,shape=new Shape();
  shape.moveTo(-half+r,-half);shape.lineTo(half-r,-half);
  shape.quadraticCurveTo(half,-half,half,-half+r);shape.lineTo(half,half-r);
  shape.quadraticCurveTo(half,half,half-r,half);shape.lineTo(-half+r,half);
  shape.quadraticCurveTo(-half,half,-half,half-r);shape.lineTo(-half,-half+r);
  shape.quadraticCurveTo(-half,-half,-half+r,-half);
  const geometry=new ExtrudeGeometry(shape,{depth:unit*.012,bevelEnabled:true,bevelThickness:unit*.018,bevelSize:unit*.018,bevelSegments:4,curveSegments:6,steps:1});
  return geometry;
}

export function createCubeModel(size:number){
  const object=new Group(),unit=2/size;
  const bodyGeometry=new RoundedBoxGeometry(unit*.96,unit*.96,unit*.96,3,unit*.09),bodyMaterial=new MeshStandardMaterial({color:0x15161b,roughness:.38});
  const stickerGeometry=createTileGeometry(unit);
  const bodies:{mesh:Mesh;position:Vector3;slot:number}[]=[];
  const occupied=new Set<string>();
  const stickers=slotsFor(size).map((slot,index)=>{
    const key=slot.p.join(',');
    if(!occupied.has(key)){occupied.add(key);const mesh=new Mesh(bodyGeometry,bodyMaterial);mesh.position.set(...slot.p).multiplyScalar(unit);object.add(mesh);bodies.push({mesh,position:mesh.position.clone(),slot:index});}
    const material=new MeshPhysicalMaterial({roughness:.32,metalness:0,clearcoat:.3,clearcoatRoughness:.26}),mesh=new Mesh(stickerGeometry,material);
    mesh.userData.cubeSticker=true;
    mesh.position.set(...slot.p).multiplyScalar(unit).addScaledVector(new Vector3(...slot.n),unit*.485);
    mesh.quaternion.setFromUnitVectors(new Vector3(0,0,1),new Vector3(...slot.n));object.add(mesh);
    return {mesh,material,position:mesh.position.clone(),quaternion:mesh.quaternion.clone()};
  });
  return {object,update(state:CubeState,mask:CubeMask,animation?:LayerAnimation|null){
    const moving=animation?new Set(movingSlots(animation.move,cubeSize(state))):null;
    const q=new Quaternion();if(animation)q.setFromAxisAngle(new Vector3(...([animation.move.axis===0?1:0,animation.move.axis===1?1:0,animation.move.axis===2?1:0] as [number,number,number])),animation.angle*Math.PI/180);
    for(const [index,sticker] of stickers.entries()){sticker.material.color.set(stickerColor(state,index,mask));sticker.mesh.position.copy(sticker.position);sticker.mesh.quaternion.copy(sticker.quaternion);if(moving?.has(index)){sticker.mesh.position.applyQuaternion(q);sticker.mesh.quaternion.premultiply(q);}}
    for(const body of bodies){body.mesh.position.copy(body.position);body.mesh.quaternion.identity();if(moving?.has(body.slot)){body.mesh.position.applyQuaternion(q);body.mesh.quaternion.copy(q);}}
  }};
}
