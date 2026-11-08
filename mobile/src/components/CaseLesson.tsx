import { useAtomValue } from "jotai";
import { Bluetooth, Check, Eye, GraduationCap, RotateCcw, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { casePlayItem, displayAlg } from "../../../src/client/lib/caseState";
import { advanceLesson, algTurns, caseWatcher, chunkAlg, lessonStage, MASTERY_LABELS, MASTERY_TOP, startLesson, type Mastery, type Outcome } from "../../../src/client/lib/mastery";
import { smartCube } from "../../../src/client/lib/smartCube";
import type { CaseDto } from "../../../src/shared/types";
import { said, tr } from "../../../src/client/i18n";
import { api } from "../api";
import { masteryAtom } from "../state";
import { useSmartCubeOn } from "../hooks/useSmartCube";
import { PlayerControls, PlayerCube, useAlgPlayer } from "./AlgPlayer";
import { CaseDiagram } from "./CaseDiagram";
import { Alg } from "./layout";

/** Where a case stands on the ladder: its five rungs, then the rung's name. */
export function MasteryMeter({ level, className }: { level: Mastery; className?: string }) {
  return <View accessibilityLabel={tr("Level: {0}", { 0: said(MASTERY_LABELS[level]) })} className={cn("flex-row items-center gap-2", className)}>
    <View className="flex-row gap-0.5">
      {Array.from({ length: MASTERY_TOP }, (_, i) => <View key={i} className={cn("h-1.5 w-4 rounded-full", i < level ? (level >= 3 ? "bg-success" : "bg-primary") : "bg-muted")} />)}
    </View>
    <Text className={cn("text-xs font-bold", level >= 3 ? "text-success" : level ? "text-primary" : "text-muted-foreground")}>{said(MASTERY_LABELS[level])}</Text>
  </View>;
}

const COPY = {
  understand: ["Watch it", "Find what makes this case, then follow the algorithm gesture by gesture."],
  guided: ["Your turn", "Put the case on your cube, then do the algorithm with it in view."],
  fading: ["Fewer clues", "Some gestures are hidden: do them from memory."],
  recall: ["From memory", "Only the case now. No algorithm."],
  done: ["By heart", "It joins your reviews: Qbix brings it back just before you forget it."],
} as const;

function Action({ icon, label, onPress, primary = false }: { icon: typeof Check; label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" className={cn("h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl", primary ? "bg-primary active:bg-primary/85" : "bg-muted active:bg-muted/70")}>
    <Icon as={icon} size={18} className={primary ? "text-primary-foreground" : "text-foreground"} />
    <Text numberOfLines={1} className={cn("text-base font-bold", primary ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
  </Pressable>;
}

/** A case's lesson, on the phone: as the web's (desktop/renderer/caseLesson.tsx). */
export function CaseLesson({ c, alg, onClose }: { c: CaseDto; alg: { alg: string; pre_auf?: string }; onClose: () => void }) {
  const level = useAtomValue(masteryAtom)(c.id),
    text = displayAlg(alg),
    chunks = useMemo(() => chunkAlg(text), [text]),
    [lesson, setLesson] = useState(() => startLesson(level)),
    [round, setRound] = useState(0),
    [shown, setShown] = useState<number[]>([]),
    [armed, setArmed] = useState(false),
    link = useSmartCubeOn(),
    item = casePlayItem(c),
    playing = lesson.phase === "understand" || lesson.phase === "guided",
    player = useAlgPlayer(playing ? text : "", playing ? item?.size : null, item?.mask, { puzzle: item?.puzzle, hints: item?.hints });
  const answer = (outcome: Outcome) => {
    const next = advanceLesson(lesson, outcome, chunks.length), stage = lessonStage(next);
    setLesson(next);
    setRound(n => n + 1);
    setShown([]);
    if (stage > level) void api.setLearned(c.id, stage >= 3, stage >= 3 ? [alg.alg] : null, stage).catch(() => { /* Reported by the sync indicator. */ });
  };
  useEffect(() => {
    setArmed(false);
    if (!link || lesson.phase === "understand" || lesson.phase === "done") return;
    const watcher = caseWatcher(c, algTurns(text).length);
    if (!watcher) return;
    return smartCube.subscribe(() => {
      const outcome = watcher.see(smartCube.snapshot.state, smartCube.snapshot.count);
      setArmed(watcher.armed);
      if (outcome) answer(outcome);
    });
  }, [link, round, lesson.phase]);
  const hides = (i: number) => !shown.includes(i) && (lesson.phase === "recall" || (lesson.phase === "fading" && i >= chunks.length - lesson.hidden)),
    [title, line] = COPY[lesson.phase],
    done = lesson.phase === "done";
  return <View className="gap-4 px-4 pt-3 pb-5">
    <View className="items-center gap-3 rounded-3xl bg-card p-3">
      {playing && player ? <>
        <PlayerCube player={player} size={190} />
        <PlayerControls player={player} className="w-full" />
      </> : <CaseDiagram c={c} size={170} />}
    </View>
    <View className="gap-1">
      <Text accessibilityRole="header" className="text-2xl font-extrabold tracking-[-0.03em]">{tr(title)}</Text>
      <Text className="text-sm text-muted-foreground">{tr(line)}</Text>
    </View>
    {!done && <View className="flex-row flex-wrap gap-2">
      {chunks.map((chunk, i) => hides(i)
        ? <Pressable key={i} onPress={() => setShown(s => [...s, i])} accessibilityRole="button" accessibilityLabel={tr("Show this gesture")} className="h-11 min-w-16 items-center justify-center rounded-xl bg-muted px-3 active:bg-muted/70"><Icon as={Eye} size={16} className="text-muted-foreground" /></Pressable>
        : <View key={i} className="gap-1"><View className="h-11 justify-center rounded-xl bg-muted px-3"><Alg text={chunk.turns.join(" ")} size={17} /></View>{chunk.name ? <Text className="px-1 text-[11px] font-bold text-muted-foreground">{said(chunk.name)}</Text> : null}</View>)}
    </View>}
    {!done && lesson.phase !== "understand" && <View className="flex-row items-baseline gap-2"><Text className="text-sm text-muted-foreground">{tr("Setup")}</Text><Alg text={c.setup} size={14} className="min-w-0 flex-1" /></View>}
    {link && !done && lesson.phase !== "understand" && item && <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
      <Icon as={Bluetooth} size={15} className={armed ? "text-success" : "text-muted-foreground"} />
      <Text className={cn("text-sm font-semibold", armed ? "text-success" : "text-muted-foreground")}>{armed ? tr("Case found: go") : tr("Set up the case on your cube")}</Text>
    </View>}
    <View className="flex-row gap-2">
      {done ? <Action primary icon={Check} label={tr("Finish")} onPress={onClose} />
        : lesson.phase === "understand" ? <Action primary icon={GraduationCap} label={tr("Understood")} onPress={() => answer("good")} />
        : <>
          <Action primary icon={Check} label={tr("Done it")} onPress={() => answer("good")} />
          <Action icon={RotateCcw} label={tr("Hesitated")} onPress={() => answer("hesitant")} />
          <Action icon={X} label={tr("Missed")} onPress={() => answer("miss")} />
        </>}
    </View>
  </View>;
}
