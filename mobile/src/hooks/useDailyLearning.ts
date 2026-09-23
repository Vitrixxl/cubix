import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { reviewCases, learningModeForPuzzle, dailyAssignment, EMPTY_LEARNING_PLAN, isLearningTrack, learningCases, learningKey, learningStatus, localDay, type LearningMode, type LearningPlan } from "../../../src/client/lib/dailyLearning";
import { casesAtom, cubeSwitchLockedAtom, learnedCaseIdsAtom, puzzleAtom, userAtom } from "../state";
import { storage } from "../platform/storage";

export function useDailyLearning() {
  const user = useAtomValue(userAtom), puzzle = useAtomValue(puzzleAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const key = learningKey(user?.id ?? "guest");
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [plan, setPlan] = useState<LearningPlan>(() => {
    try { return JSON.parse(storage.getItem(key) ?? "null") ?? EMPTY_LEARNING_PLAN; } catch { return EMPTY_LEARNING_PLAN; }
  });
  const [day, setDay] = useState(localDay);
  useEffect(() => {
    const tick = () => { if (!locked) setDay(localDay()); };
    tick();
    const interval = setInterval(tick, 30000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") tick(); });
    return () => { clearInterval(interval); listener.remove(); };
  }, [locked]);
  const mode = learningModeForPuzzle(plan.mode, puzzle);
  const reviewPool = useMemo(() => reviewCases(cases, learned, puzzle).map(c => c.id), [cases, learned, puzzle]);
  const [reviewIds, setReviewIds] = useState(reviewPool);
  useEffect(() => { if (!locked) setReviewIds(previous => previous.join("\n") === reviewPool.join("\n") ? previous : reviewPool); }, [locked, reviewPool]);
  const pool = useMemo(() => isLearningTrack(mode) ? learningCases(cases, mode) : [], [cases, mode]);
  const assignment = useMemo(() => isLearningTrack(mode) ? dailyAssignment(plan.tracks[mode], pool, learned, day) : undefined, [plan, mode, pool, learned, day]);
  const save = (next: LearningPlan) => { storage.setItem(key, JSON.stringify(next)); setPlan(next); };
  useEffect(() => {
    if (isLearningTrack(mode) && assignment !== plan.tracks[mode]) save({ ...plan, tracks: { ...plan.tracks, [mode]: assignment } });
  }, [assignment, mode, plan]);
  return { mode, assignment, reviewIds, status: mode === "review" ? `Review learned · ${reviewIds.length} cases` : learningStatus(pool, learned, assignment), setMode: (mode: LearningMode) => save({ ...plan, mode }) };
}
