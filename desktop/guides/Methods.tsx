import { METHODS } from '../../src/shared/methods';
import { PUZZLES, type PuzzleId } from '../../src/shared/puzzles';

/** Pure markup: the guide view dispatches the `data-action` of these buttons. */
export function MethodsGuide({ puzzle, method }: { puzzle: PuzzleId; method: string }) {
  const methods = METHODS[puzzle], active = methods.find(m => m.id === method) ?? methods[0]!;
  return <>
    <p className="public-lead">How each puzzle is usually solved, from a first solve to speed methods. Choose a puzzle, then a method.</p>
    <div className="method-tabs" role="group" aria-label="Puzzle">
      {PUZZLES.map(p => <button key={p.id} type="button" className={`button ${p.id === puzzle ? 'active' : ''}`} data-action={'guidePuzzle:' + p.id} aria-pressed={p.id === puzzle}>{p.label}</button>)}
    </div>
    <div className="method-tabs" role="group" aria-label="Method">
      {methods.map(m => <button key={m.id} type="button" className={`button ${m === active ? 'active' : ''}`} data-action={'guideMethod:' + m.id} aria-pressed={m === active}>{m.name}</button>)}
    </div>
    <h2>{active.name}</h2>
    <p>{active.summary}</p>
    <ol>{active.steps.map((step, i) => <li key={step.title}><strong>{i + 1}. {step.title}.</strong> {step.text}</li>)}</ol>
  </>;
}
