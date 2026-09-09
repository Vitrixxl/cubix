import type {SVGProps} from 'react';
import {puzzleInfo,type PuzzleId} from '../../shared/puzzles';
type Point=[number,number];
const mix=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const path=(points:Point[],closed=false)=>`M${points.map(p=>p.join(' ')).join('L')}${closed?'Z':''}`;
const A:Point=[16,2],B:Point=[29,9.5],C:Point=[16,17],D:Point=[3,9.5],E:Point=[3,22.5],F:Point=[16,30],G:Point=[29,22.5];
const cubeFaces=[[A,B,C,D],[D,C,F,E],[C,B,G,F]];
/** One outline per edge; face cuts follow the actual pieces, with no hidden edges. */
export function PuzzleIcon({puzzle,...props}:{puzzle:PuzzleId}&SVGProps<SVGSVGElement>){
  const size=puzzleInfo(puzzle).cubeSize;
  const cube=<><path d={path([A,B,G,F,E,D],true)}/><path d={path([D,C,B])}/><path d={path([C,F])}/></>;
  const radial=(r:number,a:number):Point=>[16+r*Math.cos(a),16+r*Math.sin(a)];
  return <svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {size?<>{cube}<g strokeWidth={size>4?.65:1} opacity=".8">{cubeFaces.flatMap(([a,b,c,d],face)=>Array.from({length:size-1},(_,i)=>{const t=(i+1)/size;return <g key={`${face}-${i}`}><path d={path([mix(a,b,t),mix(d,c,t)])}/><path d={path([mix(a,d,t),mix(b,c,t)])}/></g>;}))}</g></>
    :puzzle==='sq1'?<>{cube}{[.34,.66].map(t=><path key={t} d={path([mix(D,E,t),mix(C,F,t),mix(B,G,t)])}/>)}{[A,B,C,D].flatMap((a,i)=>[.2113,.7887].map(t=><path key={`${i}-${t}`} d={path([[16,9.5],mix(a,[B,C,D,A][i],t)])}/>))}{[.2113,.7887].flatMap(t=>[[D,C,E,F],[C,B,F,G]].flatMap(([a,b,c,d],i)=>[0,.66].map(y=><path key={`${t}-${i}-${y}`} d={path([mix(mix(a,b,t),mix(c,d,t),y),mix(mix(a,b,t),mix(c,d,t),y+.34)])}/>)))}</>
    :puzzle==='skewb'?<>{cube}{cubeFaces.map((face,i)=><path key={i} d={path(face.map((p,j)=>mix(p,face[(j+1)%4],.5)),true)}/>)}</>
    :puzzle==='pyram'?<><path d="M16 2 30 29H2Z"/>{[1/3,2/3].flatMap(t=>{const a:Point=[16,2],b:Point=[30,29],c:Point=[2,29];return [[a,b,c],[b,c,a],[c,a,b]].map(([v,w,x],i)=><path key={`${t}-${i}`} d={path([mix(v,w,t),mix(v,x,t)])}/>);})}</>
    :puzzle==='minx'?<><path d={path(Array.from({length:10},(_,i)=>radial(14.5,-Math.PI/2+i*Math.PI/5)),true)}/><path d={path(Array.from({length:5},(_,i)=>radial(7.2,-Math.PI/2+i*2*Math.PI/5)),true)}/>{Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/5;return <path key={i} d={path([radial(7.2,a),radial(14.5,a)])}/>;})}</>
    :<><rect x="2" y="2" width="28" height="28" rx="6"/>{[8,16,24].flatMap(x=>[8,16,24].map(y=><g key={`${x}-${y}`}><circle cx={x} cy={y} r="3"/><path d={`M${x} ${y-1.6}v1.6l1 .7`}/></g>))}{[12,20].flatMap(x=>[12,20].map(y=><circle key={`${x}-${y}`} cx={x} cy={y} r=".7" stroke="none" fill="currentColor"/>))}</>}
  </svg>;
}
