import { useAtom } from "jotai";
import { learnedCaseIdsAtom } from "../state";

export function LearnedCheckbox({ caseId }: { caseId: string }) {
  const [learnedIds, setLearnedIds] = useAtom(learnedCaseIdsAtom);
  return <label className="learned-checkbox">
    <input
      type="checkbox"
      aria-label={`${caseId} learned`}
      checked={learnedIds.includes(caseId)}
      onChange={event => {
        const checked = event.currentTarget.checked;
        setLearnedIds(previous => checked
          ? previous.includes(caseId) ? previous : [...previous, caseId]
          : previous.filter(id => id !== caseId));
      }}
    />
    <span>Learned</span>
  </label>;
}
