import {BoxGeometry,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,PlaneGeometry,Quaternion,Vector3} from 'three';
import {cubeSize,movingSlots,slotsFor,type CubeState} from '../../../shared/cube';
import {stickerColor,type CubeMask,type LayerAnimation} from '../cube-appearance';

export function createCubeModel(size:number){
  const object=new Group(),unit=2/size;
  const bodyGeometry=new BoxGeometry(unit*.975,unit*.975,unit*.975),bodyMaterial=new MeshStandardMaterial({color:0x101116,roughness:.65});
  const stickerGeometry=new PlaneGeometry(unit*.87,unit*.87);
  const bodies:{mesh:Mesh;position:Vector3;slot:number}[]=[];
  const occupied=new Set<string>();
  const stickers=slotsFor(size).map((slot,index)=>{
    const key=slot.p.join(',');
    if(!occupied.has(key)){occupied.add(key);const mesh=new Mesh(bodyGeometry,bodyMaterial);mesh.position.set(...slot.p).multiplyScalar(unit);object.add(mesh);bodies.push({mesh,position:mesh.position.clone(),slot:index});}
    const material=new MeshBasicMaterial(),mesh=new Mesh(stickerGeometry,material);
    mesh.position.set(...slot.p).multiplyScalar(unit).addScaledVector(new Vector3(...slot.n),unit*.501);
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
