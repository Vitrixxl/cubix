import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { dayKey } from "../../../src/client/lib/profile";
import { REMINDED_KEY, remindersDue } from "../../../src/client/lib/reminders";
import { dueCases } from "../../../src/client/lib/trainingPicks";
import { local } from "../api";
import { introductionAtom } from "../journey";
import { casesAtom, learnedCaseIdsAtom, persisted, remindersAtom, routeAtom, statsAtom, trainingRunAtom, trainingStepAtom, userAtom } from "../state";
import { toastAtom } from "./Toast";

const remindedAtom = persisted<string | null>(REMINDED_KEY, null);

/**
 * Today's reminders (`lib/reminders`), a moment after the app opens and past its introduction, as one notice whose
 * button opens the first. Looked at again when the account or its data change (a sign-in, the first sync) until shown.
 */
export function Reminders() {
  const on = useAtomValue(remindersAtom), [shown, setShown] = useAtom(remindedAtom), intro = useAtomValue(introductionAtom), user = useAtomValue(userAtom);
  const cases = useAtomValue(casesAtom), learned = useAtomValue(learnedCaseIdsAtom), stats = useAtomValue(statsAtom);
  const toast = useSetAtom(toastAtom), navigate = useSetAtom(routeAtom), setRun = useSetAtom(trainingRunAtom), setStep = useSetAtom(trainingStepAtom);
  useEffect(() => {
    if (intro || !user) return;
    const timer = setTimeout(() => {
      const [first, second] = remindersDue(on, shown, { due: dueCases(cases, new Set(learned), [...stats.values()]).length, streak: local.read.streak() });
      if (!first) return;
      setShown(dayKey(new Date()));
      toast({
        title: first.title, description: second?.title, duration: 15000, icon: "play",
        action: { label: first.action, run: () => {
          if (first.id === "review") { setRun("review"); setStep("practice"); navigate({ page: "training" }); } else navigate({ page: "playground" });
        } },
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [intro, user?.id, stats, shown, on]);
  return null;
}
