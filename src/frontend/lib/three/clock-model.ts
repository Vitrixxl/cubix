import {BoxGeometry,CircleGeometry,CylinderGeometry,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial} from 'three';
import type {KPattern} from 'cubing/kpuzzle';
import type {Move} from 'cubing/alg';
const TAU=Math.PI*2;
export function clockDialAngles(pattern:KPattern){return pattern.patternData.DIALS.orientation.map(o=>-o*TAU/12);}
export function createClockModel(){
  const object=new Group(),frame=new Mesh(new BoxGeometry(2.62,2.62,.24),new MeshStandardMaterial({color:0x263956,roughness:.45}));object.add(frame);
  const hands:Group[]=[],faces:Mesh[]=[],pins:Mesh[][]=[];
  for(let back=0;back<2;back++){
    const side=new Group();side.rotation.y=back*Math.PI;object.add(side);
    const pinSide:Mesh[]=[];pins.push(pinSide);
    for(let i=0;i<9;i++){
      const x=(i%3-1)*.8,y=(1-Math.floor(i/3))*.8;
      const border=new Mesh(new CircleGeometry(.352,48),new MeshBasicMaterial({color:0x7588a4}));border.position.set(x,y,.126);side.add(border);
      const dial=new Mesh(new CircleGeometry(.318,48),new MeshBasicMaterial());dial.position.set(x,y,.128);side.add(dial);faces.push(dial);
      for(let tick=0;tick<12;tick++){const a=tick*TAU/12,mark=new Mesh(new CircleGeometry(tick%3===0?.022:.012,8),new MeshBasicMaterial({color:0x8093ab}));mark.position.set(x+Math.sin(a)*.267,y+Math.cos(a)*.267,.13);side.add(mark);}
      const hand=new Group();hand.position.set(x,y,.15);side.add(hand);hands.push(hand);
      const needle=new Mesh(new BoxGeometry(.034,.235,.015),new MeshBasicMaterial({color:0xffd35e}));needle.position.y=.086;hand.add(needle);
      const cap=new Mesh(new CircleGeometry(.04,16),new MeshBasicMaterial({color:0xffd35e}));cap.position.z=.02;hand.add(cap);
    }
    for(let i=0;i<4;i++){const pin=new Mesh(new CylinderGeometry(.075,.075,.08,20),new MeshStandardMaterial({color:0xffd35e,roughness:.4}));pin.rotation.x=Math.PI/2;pin.position.set(i%2?.4:-.4,i<2?.4:-.4,.19);side.add(pin);pinSide.push(pin);}
  }
  return {object,update(pattern:KPattern,move?:Move,fraction=0,pinMask=0){
    const angles=clockDialAngles(pattern);
    const unit=move&&move.family!=='y'?clockDialAngles(pattern.applyMove(move.modified({amount:Math.sign(move.amount)}))):angles;
    const flip=move?.family==='y';
    object.rotation.y=flip?Math.PI*fraction:0;
    for(let i=0;i<18;i++){
      const delta=((unit[i]-angles[i]+Math.PI*3)%TAU-Math.PI)*Math.abs(move?.amount??0);
      hands[i].rotation.z=angles[i]+(flip?0:delta*fraction);
      (faces[i].material as MeshBasicMaterial).color.set(pattern.patternData.FACES.pieces[i]<9?0x123d78:0xdee5ec);
    }
    for(let side=0;side<2;side++)for(let i=0;i<4;i++){const bit=side?(i^1):i,up=!!(pinMask&(1<<bit));pins[side][i].position.z=(side?!up:up)?.21:.145;}
  }};
}
