import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useAtomValue} from 'jotai';
import {Alg,Move} from 'cubing/alg';
import {puzzles} from 'cubing/puzzles';
import type {KPattern} from 'cubing/kpuzzle';
import {animationsEnabledAtom} from '../state';
import {ThreeViewport} from './ThreeViewport';
import {createSquare1Model} from '../lib/three/square1-model';
import {createPolyhedralModel,type StickerGeometry} from '../lib/three/polyhedral-model';
import {createClockModel} from '../lib/three/clock-model';
import {IconPlay,IconPause,IconReset,IconStep} from './icons';

export type SpecialPuzzle='sq1'|'clock'|'pyram'|'skewb'|'minx';
const ids:Record<SpecialPuzzle,string>={sq1:'square1',clock:'clock',pyram:'pyraminx',skewb:'skewb',minx:'megaminx'};
function pinMask(moves:Move[],count:number){
  let mask=0;
  for(const move of moves.slice(0,count)){
    const family=move.family,bit=['UL','UR','DL','DR'].indexOf(family);
    if(bit>=0){mask|=1<<bit;continue;}
    const group=family.replace('_PLUS_','');
    const masks:Record<string,number>={UL:1,UR:2,DL:4,DR:8,U:3,R:10,D:12,L:5,ALL:15};
    if(family.endsWith('_PLUS_'))mask=masks[group]??mask;
    if(family==='y')mask=((~mask&1)<<1)|((~mask&2)>>1)|((~mask&4)<<1)|((~mask&8)>>1);
  }
  return mask;
}
export function useSpecialPuzzlePlayer({puzzle,setup='',alg,controls=false}:{puzzle:SpecialPuzzle|null;setup?:string;alg:string;controls?:boolean}){
  const [loaded,setLoaded]=useState<{puzzle:SpecialPuzzle;solved:KPattern;geometry:StickerGeometry|null}|null>(null),[error,setError]=useState('');
  const [index,setIndex]=useState(0),[fraction,setFraction]=useState(0),[playing,setPlaying]=useState(false);
  const enabled=useAtomValue(animationsEnabledAtom),raf=useRef(0);
  const parsed=useMemo(()=>{try{return {moves:[...new Alg(alg).experimentalExpand()].filter((m):m is Move=>m instanceof Move),error:''};}catch(e){return {moves:[],error:(e as Error).message};}},[alg]);
  const moves=parsed.moves;
  useEffect(()=>{
    let live=true;setError('');if(!puzzle)return;
    void (async()=>{
      const loader=puzzles[ids[puzzle]],kp=await loader.kpuzzle();
      const geometry=loader.pg?(await loader.pg()).get3d():null;
      if(live)setLoaded({puzzle,solved:kp.defaultPattern(),geometry});
    })().catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;cancelAnimationFrame(raf.current);};
  },[puzzle]);
  useEffect(()=>{
    cancelAnimationFrame(raf.current);setIndex(controls?0:moves.length);setFraction(0);setPlaying(false);
  },[puzzle,setup,alg,controls,moves]);
  // Loading a new puzzle must never apply its notation to the previous puzzle's state.
  const prepared=useMemo(()=>{
    if(!loaded||loaded.puzzle!==puzzle)return {states:[] as KPattern[],setupMoves:[] as Move[],error:''};
    try{
      const setupMoves=[...new Alg(setup).experimentalExpand()].filter((m):m is Move=>m instanceof Move);
      const states=[loaded.solved.applyAlg(setup)];
      for(const move of moves)states.push(states.at(-1)!.applyMove(move));
      return {states,setupMoves,error:''};
    }catch(e){return {states:[] as KPattern[],setupMoves:[] as Move[],error:(e as Error).message};}
  },[loaded,puzzle,setup,moves]);
  const states=prepared.states,initial=states[0],geometry=loaded?.puzzle===puzzle?loaded.geometry:null;
  const reset=()=>{cancelAnimationFrame(raf.current);setPlaying(false);setFraction(0);setIndex(0);};
  useEffect(()=>{
    if(!playing||!initial||index>=moves.length){if(index>=moves.length)setPlaying(false);return;}
    if(!enabled){setIndex(moves.length);setPlaying(false);setFraction(0);return;}
    const duration=350+Math.min(5,Math.abs(moves[index].amount)-1)*80,start=performance.now()-fraction*duration;
    const tick=(now:number)=>{const f=Math.min(1,(now-start)/duration);setFraction(f);if(f<1)raf.current=requestAnimationFrame(tick);else{setFraction(0);setIndex(i=>i+1);}};
    raf.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf.current);
  },[playing,index,initial,moves,enabled]);
  const createModel=useCallback(()=>puzzle==='sq1'?createSquare1Model():puzzle==='clock'?createClockModel():createPolyhedralModel(geometry!),[puzzle,geometry]);
  const state=states[Math.min(index,states.length-1)];
  const label=puzzle?{sq1:'Square-1',clock:'Clock',pyram:'Pyraminx',skewb:'Skewb',minx:'Megaminx'}[puzzle]:'';
  const move=moves[index];
  // Pin-only moves are part of Clock notation even though they do not change its dial pattern.
  const pins=pinMask([...prepared.setupMoves,...moves.slice(0,index+(move&&fraction>0?1:0))],Infinity);
  return {
    view:state?{cacheKey:puzzle!,createModel,updateModel:(model:ReturnType<typeof createModel>)=>model.update(state,move,fraction,pins),label:`${label}, drag to rotate`,rotation:puzzle==='clock'?{x:-12,y:-15}:{x:-30,y:-35},viewSize:puzzle==='clock'?3.3:puzzle==='minx'?4.6:puzzle==='pyram'?4.2:3.9}:null,
    error:error||parsed.error||prepared.error,
    controls:controls&&<div className="player-controls">
      <button className="btn icon" aria-label="Reset solution" title="Reset" onClick={reset}><IconReset/></button>
      <button className="btn icon" aria-label={playing?'Pause solution':'Play solution'} title={playing?'Pause':'Play'} onClick={()=>{if(index>=moves.length){setIndex(0);setFraction(0);}setPlaying(v=>!v);}}>{playing?<IconPause/>:<IconPlay/>}</button>
      <button className="btn icon" aria-label="Next move" title="Next move" disabled={index>=moves.length} onClick={()=>{setPlaying(false);setFraction(0);setIndex(i=>Math.min(moves.length,i+1));}}><IconStep/></button>
      <span className="player-count">{index} / {moves.length}</span>
    </div>
  };
}
export function SpecialPuzzle3D(props:{puzzle:SpecialPuzzle;setup?:string;alg:string;controls?:boolean}){
  const player=useSpecialPuzzlePlayer(props);
  return <div className={`special-puzzle-view ${props.controls?'with-controls':''}`}>
    {player.view&&<ThreeViewport {...player.view}/>}
    {player.error&&<p className="three-error" role="alert">{player.error}</p>}
    {player.controls}
  </div>;
}
