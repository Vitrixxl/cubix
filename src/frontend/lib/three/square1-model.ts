import {BufferGeometry,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import type {KPattern} from 'cubing/kpuzzle';
import type {Move} from 'cubing/alg';
const RAD=Math.PI/180, Y=new Vector3(0,1,0), X=new Vector3(1,0,0);
const topCorners=[0,3,6,9],bottomCorners=[13,16,19,22];
export const square1Pieces=Array.from({length:24},(_,i)=>i).filter(i=>!topCorners.some(c=>c+1===i)&&!bottomCorners.some(c=>c+1===i)).map(start=>({start,width:topCorners.includes(start)||bottomCorners.includes(start)?2:1}));
const slotAngle=(slot:number)=>slot<12?-(slot+.5)*30:(slot-12+.5)*30;
/** A slash flips the right half, reversing the order as viewed from above. */
export function square1Pose(start:number,pattern:KPattern){
  const target=pattern.patternData.WEDGES.pieces.indexOf(start),flip=(target<12)!==(start<12);
  const angle=slotAngle(target)-(flip?180-slotAngle(start):slotAngle(start));
  const quaternion=new Quaternion().setFromAxisAngle(Y,angle*RAD);
  if(flip)quaternion.multiply(new Quaternion().setFromAxisAngle(X,Math.PI));
  return {target,quaternion};
}
function ray(angle:number):[number,number]{const a=angle*RAD,r=1/Math.max(Math.abs(Math.sin(a-15*RAD)),Math.abs(Math.cos(a-15*RAD)));return [r*Math.sin(a),r*Math.cos(a)];}
export function square1Polygon(start:number,width:number):[number,number][]{
  const first=start<12?-start*30:(start-12)*30,sign=start<12?-1:1;
  return [[0,0],ray(first),...(width===2?[ray(first+sign*30)]:[]),ray(first+sign*width*30)];
}
function polygon(points:number[][],color:string|number,plastic=false){
  const positions:number[]=[];for(let i=1;i<points.length-1;i++)positions.push(...points[0],...points[i],...points[i+1]);
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const material=plastic?new MeshStandardMaterial({color,side:DoubleSide,roughness:.65}):new MeshBasicMaterial({color,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  return new Mesh(geometry,material);
}
const sideColor=(x:number,z:number)=>{const angle=15*RAD,rx=x*Math.cos(angle)-z*Math.sin(angle),rz=x*Math.sin(angle)+z*Math.cos(angle);return Math.abs(rx)>Math.abs(rz)?rx>0?'#ff801f':'#eb4242':rz>0?'#1abe57':'#3d7ce0';};
function prism(points:[number,number][],low:number,high:number,topColor:string,bottomColor:string){
  const group=new Group(),cx=points.reduce((s,p)=>s+p[0],0)/points.length,cz=points.reduce((s,p)=>s+p[1],0)/points.length;
  const inset=points.map(([x,z])=>[cx+(x-cx)*.965,cz+(z-cz)*.965]);
  group.add(polygon(inset.map(([x,z])=>[x,high,z]),topColor),polygon(inset.map(([x,z])=>[x,low,z]),bottomColor));
  for(let i=0;i<inset.length;i++){
    const a=inset[i],b=inset[(i+1)%inset.length],radial=Math.hypot(...points[i])<.01||Math.hypot(...points[(i+1)%points.length])<.01;
    group.add(polygon([[a[0],low,a[1]],[b[0],low,b[1]],[b[0],high,b[1]],[a[0],high,a[1]]],0x111217,true));
    if(!radial){const u=.035,v=.965;group.add(polygon([[a[0]*v+b[0]*u,low+.035,a[1]*v+b[1]*u],[a[0]*u+b[0]*v,low+.035,a[1]*u+b[1]*v],[a[0]*u+b[0]*v,high-.035,a[1]*u+b[1]*v],[a[0]*v+b[0]*u,high-.035,a[1]*v+b[1]*u]],sideColor((a[0]+b[0])/2,(a[1]+b[1])/2)));}
  }
  return group;
}
export function createSquare1Model(){
  const object=new Group();
  const pieces=square1Pieces.map(({start,width})=>{
    const top=start<12,mesh=prism(square1Polygon(start,width),top?.35:-1,top?1:-.35,top?'#ffe62a':'#111217',top?'#111217':'#ece8e2');object.add(mesh);return {start,mesh};
  });
  // Two trapezoidal middle blocks, cut along the same plane as the slash.
  const left=prism([[0,-1/Math.cos(15*RAD)],ray(240),ray(-30),[0,1/Math.cos(15*RAD)]],-.31,.31,'#16171b','#16171b');
  const right=prism([[0,1/Math.cos(15*RAD)],ray(60),ray(150),[0,-1/Math.cos(15*RAD)]],-.31,.31,'#16171b','#16171b');
  object.add(left,right);
  return {object,update(pattern:KPattern,move?:Move,fraction=0){
    for(const piece of pieces){const {target,quaternion}=square1Pose(piece.start,pattern);piece.mesh.quaternion.copy(quaternion);
      const family=move?.family;
      if((family==='U_SQ_'&&target<12)||(family==='D_SQ_'&&target>=12))piece.mesh.quaternion.premultiply(new Quaternion().setFromAxisAngle(Y,(target<12?-1:1)*move!.amount*30*RAD*fraction));
      if(family==='_SLASH_'&&((target>=6&&target<12)||(target>=12&&target<18)))piece.mesh.quaternion.premultiply(new Quaternion().setFromAxisAngle(X,Math.PI*move!.amount*fraction));
    }
    right.rotation.x=pattern.patternData.EQUATOR.orientation[1]/3*Math.PI+(move?.family==='_SLASH_'?Math.PI*move.amount*fraction:0);
  }};
}
