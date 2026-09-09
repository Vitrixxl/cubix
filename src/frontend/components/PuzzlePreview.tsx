import {puzzleInfo,type PuzzleId} from '../../shared/puzzles';
import {SetupCube} from './SetupCube';
import {SpecialPuzzle3D} from './SpecialPuzzle3D';
export function PuzzlePreview({puzzle,alg}:{puzzle:PuzzleId;alg:string}){
  const info=puzzleInfo(puzzle);
  return info.cubeSize?<SetupCube cubeSize={info.cubeSize} alg={alg} size={260} style={{width:"100%",height:"100%"}} interactive/>:<div className="puzzle-preview"><SpecialPuzzle3D puzzle={puzzle as 'sq1'|'clock'|'pyram'|'skewb'|'minx'} alg={alg}/></div>;
}
