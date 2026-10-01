import { useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Check, Compass, Pencil, Plus, SlidersHorizontal, Timer, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PROFILE_KEY, goalTitle, journeyProfile, type GoalProgress, type Journey, type PersonalGoal } from "../../../src/client/lib/journey";
import { METHODS } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { api, local } from "../api";
import { editingGoalAtom, goalsAtom, introductionAtom, journeyAtom } from "../journey";
import { useTourTarget } from "../tour";
import { courseProgressAtom } from "../state";
import { EmptyLine, Section, Tag } from "./ProfileCard";

const methodNames = (puzzle: PuzzleId, ids?: string[]) => (ids ?? []).map(id => METHODS[puzzle].find(m => m.id === id)?.name).filter(Boolean).join(", ");

/** One line of the journey card: a caption over the puzzles as tags, each with its methods. */
function PuzzleTags({ label, puzzles, methods, empty, first }: { label: string; puzzles: PuzzleId[]; methods: Partial<Record<PuzzleId, string[]>>; empty: string; first?: boolean }) {
  return <View className="gap-1.5" accessibilityLabel={`${label}: ${puzzles.length ? puzzles.map(p => puzzleInfo(p).label).join(", ") : empty}`}>
    <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
    {puzzles.length ? <View className="flex-row flex-wrap gap-1.5">
      {puzzles.map((p, i) => <Tag key={p} tone={first && i === 0 ? "primary" : "muted"} detail={methodNames(p, methods[p]) || undefined}>{puzzleInfo(p).label}</Tag>)}
    </View> : <Text className="text-sm text-muted-foreground">{empty}</Text>}
  </View>;
}

/** "Your journey": what the player is learning and can already solve, with the setup and the tour one tap away. */
export function JourneyCard() {
  const profile = journeyProfile(useAtomValue(journeyAtom)), setIntro = useSetAtom(introductionAtom);
  // Learning: the puzzles whose course has begun and that cannot be solved yet.
  const courses = useAtomValue(courseProgressAtom).methods;
  const learning = (Object.keys(courses) as PuzzleId[]).filter(p => !profile?.knownPuzzles.includes(p));
  return <Section title="Your journey" label="Your journey">
    {profile ? <>
      <PuzzleTags label="Learning" puzzles={learning} methods={Object.fromEntries(learning.map(p => [p, [courses[p]!]]))} empty="Nothing yet" />
      <PuzzleTags label="Can solve" puzzles={profile.knownPuzzles} methods={profile.knownMethods ?? {}} empty="None yet" />
    </> : <EmptyLine>Tell Cubix the puzzles you can already solve.</EmptyLine>}
    <View className="flex-row gap-2">
      <Button variant="outline" size="sm" className="h-10 flex-1 gap-2" onPress={() => setIntro("setup")}>
        <Icon as={SlidersHorizontal} size={15} /><Text>{profile ? "Edit setup" : "Set up"}</Text>
      </Button>
      <Button variant="outline" size="sm" className="h-10 flex-1 gap-2" onPress={() => setIntro("tour")}>
        <Icon as={Compass} size={15} /><Text>Replay tour</Text>
      </Button>
    </View>
  </Section>;
}

/** A goal: its mark, title, progress line and a thin bar, then edit and delete. */
function GoalRow({ goal, progress, busy, onEdit, onDelete, onSolved }: { goal: PersonalGoal; progress: GoalProgress; busy: boolean; onEdit: () => void; onDelete: () => void; onSolved?: () => void }) {
  const title = goalTitle(goal, local.read.catalog(goal.puzzle).sets);
  const ratio = Math.max(0, Math.min(1, progress.ratio));
  return <View className="flex-row items-start gap-3">
    <View className={cn("mt-0.5 size-9 items-center justify-center rounded-lg", progress.complete ? "bg-primary/15" : "bg-muted")}>
      <Icon as={progress.complete ? Check : goal.kind === "time" ? Timer : BookOpen} size={17} className={progress.complete ? "text-primary" : "text-muted-foreground"} />
    </View>
    <View className="min-w-0 flex-1 gap-1">
      <Text numberOfLines={2} className="text-sm font-medium">{title}</Text>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">{progress.complete ? "Reached · " : ""}{progress.detail}{goal.dueDate ? ` · due ${goal.dueDate}` : ""}</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100), text: progress.detail }} className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <View className={cn("h-full rounded-full", progress.complete ? "bg-primary" : "bg-primary/70")} style={{ width: `${ratio * 100}%` }} />
      </View>
      {onSolved ? <Button variant="outline" size="sm" className="mt-1.5 h-8 self-start" disabled={busy} onPress={onSolved}><Text>I can solve it</Text></Button> : null}
    </View>
    <View className="-mr-2 flex-row">
      <Button variant="ghost" size="icon" className="size-9" disabled={busy} accessibilityLabel={`Edit ${title}`} onPress={onEdit}><Icon as={Pencil} size={15} className="text-muted-foreground" /></Button>
      <Button variant="ghost" size="icon" className="size-9" disabled={busy} accessibilityLabel={`Delete ${title}`} onPress={onDelete}><Icon as={Trash2} size={15} className="text-muted-foreground" /></Button>
    </View>
  </View>;
}

/** "Your goals": compact rows, "Add goal" in the heading. The guided tour points at this card (`profile-goals`). */
export function PersonalGoals() {
  const goals = useAtomValue(goalsAtom), profile = journeyProfile(useAtomValue(journeyAtom));
  const setIntro = useSetAtom(introductionAtom), setKey = useSetAtom(editingGoalAtom);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const target = useTourTarget("profile-goals");
  const edit = (key = "") => { setKey(key); setIntro("goal"); };
  const change = async (values: Journey) => { if (busy) return; setBusy(true); setError(""); try { await api.updateJourney(values); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const reached = goals.filter(g => g.progress.complete).length;
  return <View {...target}>
    <Section title="Your goals" label="Your goals" meta={goals.length ? `${reached} of ${goals.length} reached` : undefined}
      aside={<Button variant="ghost" size="sm" className="h-9 gap-1 px-2" accessibilityLabel="Add goal" onPress={() => edit()}><Icon as={Plus} size={15} className="text-muted-foreground" /><Text className="text-sm text-muted-foreground">Add goal</Text></Button>}>
      {goals.length ? goals.map(({ key, goal, progress }) => <GoalRow key={key} goal={goal} progress={progress} busy={busy} onEdit={() => edit(key)} onDelete={() => void change({ [key]: null })}
        onSolved={goal.kind === "learning" && !goal.setId && !progress.complete && profile ? () => void change({ [PROFILE_KEY]: { ...profile, knownPuzzles: [...new Set([...profile.knownPuzzles, goal.puzzle])] } }) : undefined} />)
        : <EmptyLine>No goals yet: aim for a time or a set to learn.</EmptyLine>}
      {!!error && <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text>}
    </Section>
  </View>;
}
