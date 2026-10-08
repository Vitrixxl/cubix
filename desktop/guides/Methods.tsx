import { METHODS } from '../../src/shared/methods';
import { PUZZLES, type PuzzleId } from '../../src/shared/puzzles';
import { tr } from "../../src/client/i18n";
import { Segmented, said } from "../renderer/base";

/** Pure markup: the guide view dispatches the `data-action` of these buttons. */
export function MethodsGuide({ puzzle, method }: { puzzle: PuzzleId; method: string }) {
  const methods = METHODS[puzzle], active = methods.find(m => m.id === method) ?? methods[0]!;
  return <>
    <p>{tr("How each puzzle is usually solved, from a first solve to speed methods. Choose a puzzle, then a method.")}</p>
    {/* The guide dispatches the `data-action` of each option itself (overlays.tsx): nothing more on a change. */}
    <div className="mb-2 flex flex-col gap-2">
      <Segmented label="Puzzle" action="guidePuzzle:" value={puzzle} options={PUZZLES.map(p => ({ id: p.id, label: p.label }))} onChange={() => {}} className="flex-wrap justify-start" />
      <Segmented label="Method" action="guideMethod:" value={active.id} options={methods.map(m => ({ id: m.id, label: m.name }))} onChange={() => {}} className="flex-wrap justify-start" />
    </div>
    <h2>{said(active.name)}</h2>
    <p>{said(active.summary)}</p>
    <ol>{active.steps.map((step, i) => <li key={step.title}><strong>{i + 1}. {said(step.title)}.</strong> {said(step.text)}</li>)}</ol>
  </>;
}
