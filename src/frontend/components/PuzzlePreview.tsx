import {useCallback,useEffect,useMemo,useRef} from 'react';
import {useAtomValue} from 'jotai';
import {cubeModelSelectionAtom} from '../state';
import {puzzleInfo,type PuzzleId} from '../../shared/puzzles';
import {cubeSize,solved} from '../../shared/cube';
import {useCubeGeometry} from '../hooks/useCubeGeometry';
import {PuzzlePlaceholder} from './PuzzlePlaceholder';
import {useAlgPlayer,DEFAULT_ROTATION} from './Cube3D';
import {createCubeModel} from '../lib/three/cube-model';
import {createPhysicalCubeModel} from '../lib/three/physical-cube-model';
import {usePhysicalCube} from '../hooks/usePhysicalCube';
import {useSpecialPuzzlePlayer,type SpecialPuzzle} from './SpecialPuzzle3D';
import {ThreeViewport,type ThreeViewportProps} from './ThreeViewport';

type SpecialModel=ReturnType<NonNullable<ReturnType<typeof useSpecialPuzzlePlayer>['view']>['createModel']>;
type Model=ReturnType<typeof createCubeModel>|SpecialModel;
/** One WebGL viewport survives every puzzle and scramble change. */
export function PuzzlePreview({puzzle,alg}:{puzzle:PuzzleId;alg:string}){
  const info=puzzleInfo(puzzle),size=info.cubeSize??3,selections=useAtomValue(cubeModelSelectionAtom);
  const physical=usePhysicalCube(info.cubeSize?selections[size]:undefined,size);
  const geometry=useCubeGeometry(physical.asset?null:info.cubeSize??null);
  const cubeReady=geometry.ready&&physical.ready;
  const initial=useMemo(()=>solved(size),[size]);
  const cubeAlg=info.cubeSize?alg:'';
  const cube=useAlgPlayer(initial,cubeAlg,{totalDurationMs:(size-1)*1500,moveGapMs:12});
  useEffect(()=>{cube.reset();if(cubeAlg&&cubeReady)cube.play();},[cubeAlg,cubeReady,cube.reset,cube.play]);
  const special=useSpecialPuzzlePlayer({puzzle:info.cubeSize?null:puzzle as SpecialPuzzle,alg:info.cubeSize?'':alg});
  const createCube=useCallback(()=>physical.template?createPhysicalCubeModel(physical.template,size):createCubeModel(size),[size,physical.template]);
  const view=useRef<ThreeViewportProps<Model>|null>(null);
  // Keep the last valid model visible while a new puzzle's resources load.
  if(info.cubeSize&&cubeReady&&cubeSize(cube.state)===size)view.current={
    cacheKey:`cube:${size}:${physical.asset?.sha256??'generic'}`,createModel:createCube,updateModel:model=>(model as ReturnType<typeof createCubeModel>).update(cube.state,'full',cube.animation),
    label:`${physical.asset?.name??`${info.label} generic cube`}, drag to rotate`,rotation:DEFAULT_ROTATION,viewSize:3.9,
  };
  else if(!info.cubeSize&&special.view){const next=special.view;view.current={...next,updateModel:model=>next.updateModel(model as SpecialModel)};}
  const loading=info.cubeSize?!cubeReady||cubeSize(cube.state)!==size:!special.view;
  const error=info.cubeSize?physical.error||geometry.error:special.error;
  return <div style={{width:'100%',height:'100%',position:'relative'}}>
    {view.current&&!error?<ThreeViewport {...view.current} loading={loading}/>:<PuzzlePlaceholder error={error} onRetry={info.cubeSize?(physical.asset?physical.retry:geometry.retry):undefined}/>}
  </div>;
}
