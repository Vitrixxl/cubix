import {memo} from 'react';
import type {CaseDto} from '../../shared/types';
import {StaticCubeSvg} from './StaticCubeSvg';
import {caseState,maskForStage} from '../lib/caseState';

/** Every catalogue surface uses the same puzzle-specific case diagram. */
export const CaseDiagram=memo(function CaseDiagram({c,size=102}:{c:CaseDto;size?:number}){
  return c.diagram ? <img className="case-diagram" src={c.diagram} width={size} height={size} alt={`${c.name} setup`} loading="lazy" draggable={false}/> : <StaticCubeSvg state={caseState(c)} size={size} mask={maskForStage(c.stage)}/>;
});
