import {test,expect} from 'bun:test';
import {Alg,Move} from 'cubing/alg';
import {puzzles} from 'cubing/puzzles';
import {Vector3,Quaternion,Mesh} from 'three';
import {createSquare1Model,square1Pose,square1Pieces,square1Polygon} from '../src/frontend/lib/three/square1-model';
import {createClockModel,clockDialAngles} from '../src/frontend/lib/three/clock-model';
import {createCubeModel} from '../src/frontend/lib/three/cube-model';
import {applyAlg,solved,parseMove,moveAngleDeg,slotsFor} from '../src/shared/cube';
import {disposeObject} from '../src/frontend/components/ThreeViewport';
import catalog from '../data/niche-catalog.json';
const sameRotation=(a:Quaternion,b:Quaternion)=>Math.abs(a.dot(b))>1-1e-7;

test('Square-1 has 16 physical pieces and a continuous, rigid pose across every catalogue move',async()=>{
  expect(square1Pieces).toHaveLength(16);
  const kp=await puzzles.square1.kpuzzle(),model=createSquare1Model();
  const x=new Vector3(1,0,0),y=new Vector3(0,1,0);
  for(const c of catalog.cases.filter(c=>c.puzzle_id==='sq1')){
    let pattern=kp.defaultPattern();
    for(const move of new Alg(c.setup+' '+c.algorithms[0].alg).experimentalExpand()){
      if(!(move instanceof Move))continue;
      const next=pattern.applyMove(move);
      for(const piece of square1Pieces){
        const before=square1Pose(piece.start,pattern),after=square1Pose(piece.start,next);
        const expected=before.quaternion.clone();
        if((move.family==='U_SQ_'&&before.target<12)||(move.family==='D_SQ_'&&before.target>=12))expected.premultiply(new Quaternion().setFromAxisAngle(y,(before.target<12?-1:1)*move.amount*Math.PI/6));
        if(move.family==='_SLASH_'&&before.target>=6&&before.target<18)expected.premultiply(new Quaternion().setFromAxisAngle(x,move.amount*Math.PI));
        expect(sameRotation(expected,after.quaternion),c.id+' '+move.toString()).toBe(true);
      }
      model.update(pattern,move,1);const matrices=model.object.children.map(o=>o.quaternion.clone());model.update(next);
      model.object.children.forEach((o,i)=>expect(sameRotation(o.quaternion,matrices[i]),c.id+' endpoint '+i).toBe(true));
      pattern=next;
    }
  }
  // Solved faces are a square; corners include their actual 90° outer vertex.
  for(const piece of square1Pieces){const polygon=square1Polygon(piece.start,piece.width);expect(polygon).toHaveLength(piece.width===2?4:3);expect(polygon.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]))).toBe(true);}
  disposeObject(model.object);
});

test('Clock dial animation meets the exact pattern at signed turn endpoints',async()=>{
  const kp=await puzzles.clock.kpuzzle(),model=createClockModel();
  let pattern=kp.defaultPattern();
  for(const text of ['UR6+','DL6-','ALL5+','y2','U4-','R3+','ALL6-','y2']){
    const move=new Move(text),next=pattern.applyMove(move);
    model.update(pattern,move,1);
    if(move.family!=='y'){
      const hands=model.object.children.slice(1).flatMap(s=>s.children.filter(c=>c.children.length===2));
      const angles=clockDialAngles(next);
      hands.forEach((h,i)=>expect(Math.abs(Math.sin((h.rotation.z-angles[i])/2))).toBeLessThan(1e-7));
    }
    model.update(next);pattern=next;
  }
  expect(pattern.patternData.DIALS.orientation.every(o=>o>=0&&o<12)).toBe(true);
  disposeObject(model.object);
});

test('stickerless cubies carry all face colours through outer, wide and inner turns',()=>{
  for(const n of [2,3,4,5,6,7]){
    const model=createCubeModel(n),slots=slotsFor(n);
    expect(model.object.children).toHaveLength(n**3-(n-2)**3);
    const capture=()=>model.object.children.flatMap(object=>{
      const mesh=object as Mesh;
      return (mesh.userData.cubieSlots as number[]).map((slot,i)=>{
        const normal=new Vector3(...slots[slot].n).applyQuaternion(mesh.quaternion);
        return {position:mesh.position.clone().addScaledVector(normal,1/n),normal,color:(mesh.material as any[])[i].color.getHexString()};
      });
    });
    for(const alg of ['R','U2',...(n>3?['2R','Rw']:[])]){
      const move=parseMove(alg,n)!;model.update(solved(n),'full',{move,angle:moveAngleDeg(move)});
      const ends=capture();model.update(applyAlg(solved(n),alg),'full');
      expect(ends).toHaveLength(6*n*n);
      for(const face of capture()){
        const previous=ends.find(e=>e.position.distanceTo(face.position)<1e-7&&e.normal.distanceTo(face.normal)<1e-7);
        expect(previous?.color).toBe(face.color);
      }
    }
    for(const object of model.object.children){
      const mesh=object as Mesh;expect(Array.isArray(mesh.material)).toBe(true);
      expect(mesh.geometry.groups).toHaveLength(mesh.userData.cubieSlots.length);
      expect(mesh.geometry.groups.every(g=>g.count>0)).toBe(true);
    }
    disposeObject(model.object);
  }
});

test('Pyraminx, Skewb and Megaminx rotations meet the next state without jumps',async()=>{
  const {createPolyhedralModel}=await import('../src/frontend/lib/three/polyhedral-model');
  for(const [id,puzzleId] of [['pyraminx','pyram'],['skewb','skewb'],['megaminx','minx']]){
    const kp=await puzzles[id].kpuzzle(),data=(await puzzles[id].pg!()).get3d(),model=createPolyhedralModel(data);
    const moves=new Map<string,Move>();for(const c of catalog.cases.filter(c=>c.puzzle_id===puzzleId))for(const move of new Alg(c.algorithms[0].alg).experimentalExpand())if(move instanceof Move)moves.set(move.toString(),move);
    let pattern=kp.defaultPattern();
    const capture=()=>model.object.children.map((g,i)=>{
      const coords=data.stickers[i].coords,center=new Vector3();for(let j=0;j<coords.length;j+=3)center.add(new Vector3(...coords.slice(j,j+3) as [number,number,number]));center.multiplyScalar(3/coords.length).applyQuaternion(g.quaternion);
      return {center,color:((g.children[1] as Mesh).material as any).color.getHexString()};
    });
    for(const move of moves.values()){
      const next=pattern.applyMove(move);model.update(pattern,move,1);const animated=capture();model.update(next);const settled=capture();
      for(const sticker of settled){const before=animated.find(a=>a.center.distanceTo(sticker.center)<1e-6);expect(before?.color,`${id}: ${move}`).toBe(sticker.color);}
      pattern=next;
    }
    disposeObject(model.object);
  }
});

test('stickerless colour seams partition a closed rounded body without gaps or overlapping shells',async()=>{
  const {RoundedBoxGeometry}=await import('three/addons/geometries/RoundedBoxGeometry.js');
  const {createStickerlessGeometry}=await import('../src/frontend/lib/three/cube-model');
  const area=(geometry:import('three').BufferGeometry)=>{
    const p=geometry.getAttribute('position');let sum=0;
    for(let i=0;i<p.count;i+=3){const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2);sum+=b.sub(a).cross(c.sub(a)).length()/2;}
    return sum;
  };
  const body=new RoundedBoxGeometry(.98,.98,.98,3,.095),expected=area(body);
  for(const normals of [[new Vector3(0,1,0)],[new Vector3(0,1,0),new Vector3(0,0,1)],[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)]]){
    const geometry=createStickerlessGeometry(1,normals);
    expect(area(geometry)).toBeCloseTo(expected,5);
    expect(geometry.groups.reduce((sum,g)=>sum+g.count,0)).toBe(geometry.getAttribute('position').count);
    geometry.dispose();
  }
  body.dispose();
});
