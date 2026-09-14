import { useAtom } from "jotai";
import { learnedCaseIdsAtom } from "../state";
import { IconCheck } from "./icons";

export function LearnedToggle({ caseId }: { caseId: string }) {
  const [learnedIds, setLearnedIds] = useAtom(learnedCaseIdsAtom);
  const learned = learnedIds.includes(caseId);
  return <button
    type="button"
    className="learned-toggle"
    aria-label={`${caseId} learned`}
    aria-pressed={learned}
    title={learned ? "Mark as still learning" : "Mark as learned"}
    onClick={() => setLearnedIds(previous => previous.includes(caseId)
      ? previous.filter(id => id !== caseId)
      : [...previous, caseId])}
  >
    {learned && <IconCheck aria-hidden="true" />}
    <span>{learned ? "Learned" : "To learn"}</span>
  </button>;
}
