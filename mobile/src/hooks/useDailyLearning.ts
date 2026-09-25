import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { orderedGroups, reviewCases, learningModeForPuzzle, dailyAssignment, EMPTY_LEARNING_PLAN, isLearningTrack, learningCases, learningKey, learningStatus, localDay, type LearningMode, type LearningPlan } from "../../../src/client/lib/dailyLearning";
import { casesAtom, cubeSwitchLockedAtom, learnedCaseIdsAtom, puzzleAtom, userAtom } from "../state";
import { storage } from "../platform/storage";
import { api, local, localChanged } from "../api";

export function useDailyLearning() {
  const user = useAtomValue(userAtom), puzzle = useAtomValue(puzzleAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const key = learningKey(user?.id ?? "guest");
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [devicePlan, setPlan] = useState<LearningPlan>(() => {
    try { return JSON.parse(storage.getItem(key) ?? "null") ?? EMPTY_LEARNING_PLAN; } catch { return EMPTY_LEARNING_PLAN; }
  });
  const [groupOrder, setGroupOrder] = useState(local.learningGroupOrder);
  useEffect(() => {
    const refresh = () => {
      if (locked) return;
      const next = local.learningGroupOrder();
      setGroupOrder(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    refresh();
    return localChanged.on(refresh);
  }, [key, locked]);
  const plan = useMemo(() => ({ ...devicePlan, groupOrder }), [devicePlan, groupOrder]);
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
  const pool = useMemo(() => isLearningTrack(mode) ? learningCases(cases, mode, plan.groupOrder?.[mode]) : [], [cases, mode, plan.groupOrder]);
  const assignment = useMemo(() => isLearningTrack(mode) ? dailyAssignment(plan.tracks[mode], pool, learned, day) : undefined, [plan, mode, pool, learned, day]);
  const save = ({ groupOrder: _order, ...next }: LearningPlan) => { storage.setItem(key, JSON.stringify(next)); setPlan(next); };
  useEffect(() => {
    if (isLearningTrack(mode) && assignment !== plan.tracks[mode]) save({ ...plan, tracks: { ...plan.tracks, [mode]: assignment } });
  }, [assignment, mode, plan]);
  const reorderGroups = async (groups: string[]) => {
    if (locked || !isLearningTrack(mode)) return;
    await api.setLearningGroupOrder(mode, groups).catch(() => { /* The sync indicator reports storage failures. */ });
  };
  return { groups: orderedGroups(pool, isLearningTrack(mode) ? plan.groupOrder?.[mode] : []), reorderGroups, mode, assignment, reviewIds, status: mode === "review" ? `Review learned · ${reviewIds.length} cases` : learningStatus(pool, learned), setMode: (mode: LearningMode) => save({ ...plan, mode }) };
}
