import {useState} from 'react';
import {useAtom,useAtomValue} from 'jotai';
import * as Popover from '@radix-ui/react-popover';
import {puzzleAtom,cubeSwitchLockedAtom} from '../state';
import {PUZZLES,puzzleInfo} from '../../shared/puzzles';
import {PuzzleIcon} from './PuzzleIcon';
import {IconCheck} from './icons';

export function PuzzlePicker(){
  const [puzzle,setPuzzle]=useAtom(puzzleAtom), locked=useAtomValue(cubeSwitchLockedAtom);
  const [open,setOpen]=useState(false);
  return <Popover.Root open={open} onOpenChange={setOpen} modal>
    <Popover.Trigger asChild><button type="button" className="puzzle-picker-trigger" disabled={locked} aria-label={`Choose puzzle, ${puzzleInfo(puzzle).label}`} title="Choose puzzle">
      <PuzzleIcon puzzle={puzzle}/><span>{puzzleInfo(puzzle).label}</span><svg className="puzzle-picker-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content data-puzzle-popover className="puzzle-popover" side="top" align="start" sideOffset={12} collisionPadding={12} aria-label="Choose puzzle" onOpenAutoFocus={event=>{
      event.preventDefault();requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-puzzle-popover] [aria-checked="true"]')?.focus());
    }}>
      <div className="puzzle-popover-heading"><strong>Puzzles</strong></div>
      <div className="puzzle-options" role="radiogroup" aria-label="Puzzle" onKeyDown={event=>{
        if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:event.key==='ArrowDown'?3:-3;
        buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+step+buttons.length)%buttons.length]?.focus();
      }}>{PUZZLES.map(p=><button key={p.id} type="button" role="radio" aria-checked={p.id===puzzle} aria-label={p.label} tabIndex={p.id===puzzle?0:-1} onClick={()=>{setPuzzle(p.id);setOpen(false);}}>
        <PuzzleIcon puzzle={p.id}/><span>{p.label}</span>{p.id===puzzle&&<IconCheck className="puzzle-option-check"/>}
      </button>)}</div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
