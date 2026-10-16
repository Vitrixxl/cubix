/**
 * The timer's WCA attempts that are not a single timed solve, as on the web (desktop/renderer/attempts.tsx): Fewest
 * Moves (an hour to write a solution), the cubes solved of a Multi-Blind attempt, its numbered scrambles; and the
 * scrambles to export.
 */
import * as Clipboard from "expo-clipboard";
import { Copy, Download, Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSetAtom } from "jotai";
import { FMC_LIMIT_MS, fmcResult, readFmcSolution, type FmcResult } from "../../../src/client/lib/fewestMoves";
import { mbldValue, numberedScrambles, scrambleList, wcaResult } from "../../../src/client/lib/wca";
import { eventOf, scrambleLabel, type PracticeContext } from "../../../src/shared/puzzles";
import { said, tr } from "../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Alg, Numeric } from "./layout";
import { Digits, digitsSize, Hint } from "./Practice";
import { Sheet } from "./Sheet";
import { Pill } from "./PuzzlePicker";
import { toastAtom } from "./Toast";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { saveFile } from "../lib/files";

const countdown = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * A Fewest Moves attempt (WCA Article E): Start gives an hour to write a solution of the scramble, its moves counted as
 * they are typed; Done, or the hour's end, gives its result to `onDone`. A new `scramble` ends it unsaved.
 */
export function FewestMovesAttempt({ scramble, area, disabled, onDone }: {
  scramble: string; area: { width: number; height: number }; disabled: boolean; onDone: (ms: number, result: FmcResult) => void;
}) {
  const [started, setStarted] = useState<number | null>(null), [text, setText] = useState(""), [now, setNow] = useState(() => performance.now());
  useEffect(() => { setStarted(null); setText(""); }, [scramble]);
  useEffect(() => {
    if (started === null) return;
    const interval = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(interval);
  }, [started]);
  const left = started === null ? FMC_LIMIT_MS : FMC_LIMIT_MS - (now - started), read = readFmcSolution(text);
  const done = () => {
    if (started === null) return;
    const ms = Math.min(FMC_LIMIT_MS, performance.now() - started);
    setStarted(null); setText("");
    onDone(ms, fmcResult(scramble, text));
  };
  // The hour is up: what is written is the solution.
  useEffect(() => { if (started !== null && left <= 0) done(); }, [left <= 0]);
  return <View className="w-full items-center gap-3">
    <Digits text={countdown(left)} phase="idle" size={digitsSize(area, 6, started === null ? 128 : 72)} />
    {started === null
      ? <Button className="h-12 min-w-32 rounded-full" disabled={disabled} onPress={() => setStarted(performance.now())}><Text>{tr("Start")}</Text></Button>
      : <>
        <Input value={text} onChangeText={setText} multiline autoFocus autoCapitalize="none" autoCorrect={false} accessibilityLabel={tr("Solution")}
          placeholder="R U2 F' Rw x …" className="h-auto min-h-20 py-2 font-mono" textAlignVertical="top" />
        <View className="w-full flex-row items-center gap-3">
          <Text className={cn("flex-1 text-sm", "error" in read ? "text-destructive" : "text-muted-foreground")}>
            {"error" in read ? said(read.error) : tr("{0} moves", { 0: read.moves })}
          </Text>
          <Button className="rounded-full" onPress={done}><Text>{tr("Done")}</Text></Button>
        </View>
      </>}
  </View>;
}

/** A Multi-Blind attempt stopped: the cubes solved out of its cubes, its result as the WCA writes it, then Save. */
export function MultiBlindResult({ ms, cubes, onSave, onCancel, disabled }: { ms: number; cubes: number; onSave: (solved: number) => void; onCancel: () => void; disabled?: boolean }) {
  const [solved, setSolved] = useState(cubes), value = mbldValue(solved, cubes, ms);
  return <View className="items-center gap-3" accessibilityLabel={tr("Solved")}>
    <View className="flex-row items-center gap-3">
      <Button variant="secondary" size="icon" className="size-11 rounded-full" accessibilityLabel={tr("Less")} disabled={solved <= 0} onPress={() => setSolved(solved - 1)}><Icon as={Minus} size={18} /></Button>
      <Numeric className="min-w-24 text-center text-2xl font-bold">{solved}/{cubes}</Numeric>
      <Button variant="secondary" size="icon" className="size-11 rounded-full" accessibilityLabel={tr("More")} disabled={solved >= cubes} onPress={() => setSolved(solved + 1)}><Icon as={Plus} size={18} /></Button>
    </View>
    <Hint>{value === null ? tr("DNF") : wcaResult("333mbf", "single", value)}</Hint>
    <View className="flex-row gap-2">
      <Button variant="secondary" className="rounded-full" disabled={disabled} onPress={onCancel}><Text>{tr("Cancel")}</Text></Button>
      <Button className="rounded-full" disabled={disabled} onPress={() => onSave(solved)}><Text>{tr("Save")}</Text></Button>
    </View>
  </View>;
}

/** A Multi-Blind attempt's scrambles, one a line, numbered. */
export function ScrambleLines({ text, size }: { text: string; size: number }) {
  return <View className="gap-1.5">
    {scrambleList(text).map((scramble, i) => <View key={i} className="flex-row items-baseline gap-2">
      <Numeric className="w-6 text-right text-muted-foreground" style={{ fontSize: size * 0.8 }}>{i + 1}.</Numeric>
      <Alg text={scramble} size={size} className="flex-1" />
    </View>)}
  </View>;
}

const COUNTS = [5, 12, 25, 50, 100];

/** Scrambles of the timer's event and scramble type to take away, numbered as a WCA sheet: to copy or share as a file. */
export function ScrambleExportSheet({ open, onClose, context }: { open: boolean; onClose: () => void; context: PracticeContext }) {
  const [count, setCount] = useState(12), [text, setText] = useState<string | null>(null), toast = useSetAtom(toastAtom);
  const event = eventOf(context.puzzle, context.solveMode), kind = context.scrambleType !== "normal" ? " · " + tr(scrambleLabel(context.scrambleType)) : "";
  useEffect(() => {
    if (!open) return;
    let live = true;
    setText(null);
    // A Multi-Blind attempt's own scrambles are 3×3 blindfolded ones: one a line, as for the other events.
    const one = { ...context, solveMode: context.solveMode === "multi-blind" ? "blindfolded" as const : context.solveMode };
    void Promise.all(Array.from({ length: count }, () => generatePracticeScramble(one)))
      .then(list => { if (live) setText(numberedScrambles(list)); }, error => toast({ title: (error as Error).message }));
    return () => { live = false; };
  }, [open, count, context]);
  const file = text && `${tr(event?.label ?? context.puzzle)}${kind}\n\n${text}\n`;
  return <Sheet open={open} onClose={onClose} title={tr("Scrambles")} contentClassName="gap-3">
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
      {COUNTS.map(n => <Pill key={n} role="radio" label={String(n)} primary={n === count} onPress={() => setCount(n)} />)}
    </View>
    <ScrollView className="max-h-80 rounded-xl bg-muted p-3">
      {text ? <Text selectable className="font-mono text-sm">{text}</Text> : <Skeleton className="h-24 w-full" />}
    </ScrollView>
    <View className="flex-row justify-end gap-2">
      <Button variant="secondary" className="rounded-full" disabled={!file} onPress={() => file && void Clipboard.setStringAsync(file).then(() => toast({ title: tr("Copied") }), () => {})}>
        <Icon as={Copy} size={16} /><Text>{tr("Copy")}</Text>
      </Button>
      <Button className="rounded-full" disabled={!file} onPress={() => file && void saveFile(file, "text/plain", `qbix-scrambles-${event?.id ?? context.puzzle}.txt`).catch(() => {})}>
        <Icon as={Download} size={16} className="text-primary-foreground" /><Text>{tr("Download")}</Text>
      </Button>
    </View>
  </Sheet>;
}
