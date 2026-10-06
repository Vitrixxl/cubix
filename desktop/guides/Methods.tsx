import { METHODS } from '../../src/shared/methods';
import { PUZZLES, type PuzzleId } from '../../src/shared/puzzles';
import { tr } from "../../src/client/i18n";
import { said } from "../renderer/base";

/** Pure markup: the guide view dispatches the `data-action` of these buttons. */
export function MethodsGuide({ puzzle, method }: { puzzle: PuzzleId; method: string }) {
  const methods = METHODS[puzzle], active = methods.find(m => m.id === method) ?? methods[0]!;
  return <>
    <p className="text-base text-foreground/80!">{tr("How each puzzle is usually solved, from a first solve to speed methods. Choose a puzzle, then a method.")}</p>
    <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label={tr("Puzzle")}>
      {PUZZLES.map(p => <button key={p.id} type="button" className="inline-flex h-7 items-center rounded-md px-2.5 text-[0.8rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground" data-action={'guidePuzzle:' + p.id} aria-pressed={p.id === puzzle}>{said(p.label)}</button>)}
    </div>
    <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label={tr("Method")}>
      {methods.map(m => <button key={m.id} type="button" className="inline-flex h-7 items-center rounded-md px-2.5 text-[0.8rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground" data-action={'guideMethod:' + m.id} aria-pressed={m === active}>{said(m.name)}</button>)}
    </div>
    <h2>{said(active.name)}</h2>
    <p>{said(active.summary)}</p>
    <ol>{active.steps.map((step, i) => <li key={step.title}><strong>{i + 1}. {said(step.title)}.</strong> {said(step.text)}</li>)}</ol>
  </>;
}
