import type {PuzzleId} from '../../shared/puzzles';
import {AlgText} from './AlgorithmList';
import {SpecialPuzzle3D} from './SpecialPuzzle3D';
export function PuzzleSolutionPlayer({puzzle,setup,alg}:{puzzle:PuzzleId;setup:string;alg:string}){
  return <div className="case-player niche-case-player"><div className="niche-solution-view"><SpecialPuzzle3D puzzle={puzzle as 'sq1'|'clock'|'pyram'|'skewb'|'minx'} setup={setup} alg={alg} controls/></div><div className="niche-solution-caption"><AlgText alg={alg}/></div></div>;
}
