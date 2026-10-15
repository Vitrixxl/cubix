import { useAtom, useAtomValue } from "jotai";
import { Check, Eye, Pencil, RotateCcw, Settings2, SkipForward, X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  BLD_COLORS, BLD_FACES, BLD_PREFS, BLD_SCRAMBLE, BUFFERS, SPEFFZ, allPairs, bldPicture, bldState, cleanBuffers, cleanScheme, nextPair, pairsOf,
  recentPairs, repeated, reviewPair, sameMemo, stickerAt, traceMemo, withLetter, type BldKind, type Memo, type PairBoxes,
} from "../../../src/client/lib/bld";
import { tr } from "../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useLayout } from "../hooks/useLayout";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { bldWordsAtom, persisted } from "../state";
import { PushedBar } from "./AppBar";
import { Chip } from "./Chips";
import { Alg, Empty, HeadButton, Label, Numeric, Segmented } from "./layout";
import { useBackTo } from "./Practice";
import { ScrambleCube } from "./ScrambleCube";
import { Sheet, SheetInput } from "./Sheet";

/**
 * Blindfolded training (3×3), as on the web (desktop/renderer/bld.tsx): Memo (a blindfolded scramble and its cube held
 * white on top, the memo typed, then checked against the one traced) and Pairs (each letter pair's word, written once,
 * then recalled); the letter scheme and the buffers in a drawer. The rules are src/client/lib/bld.ts's.
 */
const modeAtom = persisted<string>(BLD_PREFS.mode, "memo");
const schemeAtom = persisted<unknown>(BLD_PREFS.scheme, SPEFFZ);
const buffersAtom = persisted<unknown>(BLD_PREFS.buffers, null);
const boxesAtom = persisted<PairBoxes>(BLD_PREFS.boxes, {});
const recentAtom = persisted<string[]>(BLD_PREFS.recent, []);
const poolAtom = persisted<string>(BLD_PREFS.pool, "all");

/** The blindfolded training, pushed from Training: Memo or Pairs, the settings in a drawer. */
export function BldRun({ onBack }: { onBack: () => void }) {
  useBackTo(onBack);
  const [mode, setMode] = useAtom(modeAtom), [settings, setSettings] = useState(false);
  return <View className="flex-1">
    <PushedBar title={tr("BLD")} onBack={onBack}>
      <HeadButton icon={Settings2} label={tr("Letter scheme and buffers")} onPress={() => setSettings(true)} />
    </PushedBar>
    <View className="min-h-0 flex-1 gap-3 px-4 pb-3">
      <Segmented label={tr("Blindfolded")} value={mode === "pairs" ? "pairs" : "memo"} onChange={setMode} options={[{ id: "memo", label: tr("Memo") }, { id: "pairs", label: tr("Pairs") }]} />
      {mode === "pairs" ? <PairsDrill /> : <MemoDrill />}
    </View>
    <BldSettings open={settings} onClose={() => setSettings(false)} />
  </View>;
}

/** A blindfolded scramble and its cube, the memo typed, then the one traced beside it. */
function MemoDrill() {
  const { height, width } = useLayout();
  const scheme = cleanScheme(useAtomValue(schemeAtom)), buffers = cleanBuffers(useAtomValue(buffersAtom));
  const [recent, setRecent] = useAtom(recentAtom);
  const [scramble, setScramble] = useState(""), [typed, setTyped] = useState(""), [memo, setMemo] = useState<Memo | null>(null);
  const size = Math.round(Math.max(120, Math.min(height * 0.3, width - 64, 260)));
  const draw = () => {
    setMemo(null); setTyped("");
    void generatePracticeScramble(BLD_SCRAMBLE).then(setScramble, () => {});
  };
  useEffect(draw, []);
  const check = () => {
    const traced = traceMemo(bldState(scramble), scheme, buffers);
    setMemo(traced);
    setRecent(recentPairs(traced, recent));
  };
  return <View className="min-h-0 flex-1 gap-3">
    <Alg text={scramble || "…"} size={16} />
    <View className="min-h-0 flex-1 items-center justify-center">
      {scramble ? <ScrambleCube key={scramble} puzzle="333" cubeSize={3} scramble={bldPicture(scramble)} held size={size} still /> : null}
    </View>
    {memo && <MemoResult memo={memo} right={sameMemo(typed, memo)} />}
    <View className="flex-row items-center gap-2">
      <Input value={typed} onChangeText={setTyped} placeholder="AB CD EF" accessibilityLabel={tr("Your memo")} editable={!memo} autoCapitalize="characters" autoCorrect={false}
        returnKeyType="done" onSubmitEditing={() => scramble && !memo && check()} className="h-12 flex-1 rounded-xl font-semibold" />
      <Button accessibilityLabel={tr(memo ? "Next" : "Check")} disabled={!scramble} onPress={memo ? draw : check} className="h-12 rounded-full px-5">
        <Icon as={memo ? SkipForward : Check} size={16} className="text-primary-foreground" />
        <Text className="text-base font-bold">{tr(memo ? "Next" : "Check")}</Text>
      </Button>
    </View>
  </View>;
}

/** The memo traced: right or not, edges then corners in pairs, then what is noted apart. */
function MemoResult({ memo, right }: { memo: Memo; right: boolean }) {
  const rows: [string, string][] = [
    [tr("Edges"), pairsOf(memo.edges).join(" ")],
    [tr("Corners"), pairsOf(memo.corners).join(" ")],
    ...(memo.flipped.length ? [[tr("Flipped"), memo.flipped.join(" ")] as [string, string]] : []),
    ...(memo.twisted.length ? [[tr("Twisted"), memo.twisted.join(" ")] as [string, string]] : []),
  ];
  return <View accessibilityLiveRegion="polite" className="flex-row items-start gap-3 rounded-2xl bg-card px-4 py-3">
    <View accessibilityLabel={tr(right ? "Your memo is right" : "Your memo differs")}
      className={cn("size-7 items-center justify-center rounded-full", right ? "bg-success/15" : "bg-destructive/15")}>
      <Icon as={right ? Check : X} size={16} className={right ? "text-success" : "text-destructive"} />
    </View>
    <View className="min-w-0 flex-1 gap-1">
      {rows.map(([label, text]) => <View key={label} className="flex-row items-baseline gap-3">
        <Text className="w-16 text-xs font-bold text-muted-foreground">{label}</Text>
        <Numeric className="min-w-0 flex-1 text-base font-extrabold tracking-wide">{text || "–"}</Numeric>
      </View>)}
    </View>
    {memo.parity && <View className="rounded-full bg-warning/15 px-2.5 py-1"><Text className="text-xs font-bold text-warning">{tr("Parity")}</Text></View>}
  </View>;
}

/** A letter pair to recall: shown, then its word (written here once), Got it or Again. */
function PairsDrill() {
  const scheme = cleanScheme(useAtomValue(schemeAtom)), recent = useAtomValue(recentAtom);
  const [from, setFrom] = useAtom(poolAtom), [boxes, setBoxes] = useAtom(boxesAtom), [words, setWords] = useAtom(bldWordsAtom);
  const pool = from === "recent" ? recent : allPairs(scheme);
  const [seen, setSeen] = useState<string[]>([]);
  const [pair, setPair] = useState<string | undefined>(() => nextPair(pool, boxes, []));
  const [shown, setShown] = useState(false), [draft, setDraft] = useState<string | null>(null);
  const word = pair ? words[pair] : undefined;
  useEffect(() => { if (!pair || !pool.includes(pair)) setPair(nextPair(pool, boxes, seen)); }, [from]);
  const answer = (got: boolean) => {
    if (!pair) return;
    const next = reviewPair(boxes, pair, got), last = [...seen, pair].slice(-6);
    setBoxes(next); setSeen(last); setPair(nextPair(pool, next, last)); setShown(false); setDraft(null);
  };
  const keep = () => {
    if (pair && draft?.trim()) setWords({ ...words, [pair]: draft.trim() });
    setDraft(null);
  };
  return <View className="min-h-0 flex-1 gap-3">
    <Segmented label={tr("Pairs")} value={from === "recent" ? "recent" : "all"} onChange={setFrom}
      options={[{ id: "all", label: tr("All") }, { id: "recent", label: tr("Recent") }]} />
    {!pair ? <Empty icon={Eye} title={tr("No memo yet")} />
      : <View className="min-h-0 flex-1 items-center justify-center gap-5">
        <Numeric className="text-[96px] leading-[104px] font-extrabold tracking-[2px]">{pair}</Numeric>
        {!shown ? <Chip icon={Eye} onPress={() => setShown(true)}>{tr("Show")}</Chip>
          : draft != null || !word ? <View className="w-full flex-row items-center gap-2">
            <Input autoFocus value={draft ?? ""} onChangeText={setDraft} placeholder={tr("Your word")} accessibilityLabel={tr("Your word")} maxLength={40}
              returnKeyType="done" onSubmitEditing={keep} className="h-12 flex-1 rounded-xl" />
            <Chip on disabled={!draft?.trim()} onPress={keep}>{tr("Save")}</Chip>
          </View>
          : <View className="flex-row items-center gap-1">
            <Text className="text-2xl font-extrabold tracking-tight">{word}</Text>
            <HeadButton icon={Pencil} label={tr("Edit")} onPress={() => setDraft(word)} />
          </View>}
        <View className="w-full flex-row gap-2">
          <Pressable accessibilityRole="button" onPress={() => answer(false)} className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-muted active:bg-muted/70">
            <Icon as={RotateCcw} size={16} /><Text className="text-[15px] font-bold">{tr("Again")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => answer(true)} className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-primary active:bg-primary/85">
            <Icon as={Check} size={16} className="text-primary-foreground" /><Text className="text-[15px] font-bold text-primary-foreground">{tr("Got it")}</Text>
          </Pressable>
        </View>
      </View>}
  </View>;
}

/** Where each face of the net stands, in stickers' thirds: U above L F R B, D below. */
const NET: Record<(typeof BLD_FACES)[number], [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** The settings' drawer: the buffers, then the letter scheme on the cube's net; a sticker picked takes the letter typed, then the next one. */
function BldSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { width } = useLayout();
  const [stored, setScheme] = useAtom(schemeAtom), [storedBuffers, setBuffers] = useAtom(buffersAtom);
  const letters = cleanScheme(stored), chosen = cleanBuffers(storedBuffers);
  const [kind, setKind] = useState<BldKind>("edges"), [picked, setPicked] = useState(0);
  const cell = Math.floor((Math.min(width, 520) - 40 - 11 * 2) / 12);
  const buffer = (BUFFERS[kind] as Record<string, number>)[chosen[kind]];
  return <Sheet open={open} onClose={onClose} title={tr("Settings")} scroll>
    <Field label={tr("Edge buffer")}>
      <Segmented label={tr("Edge buffer")} value={chosen.edges} onChange={id => setBuffers({ ...chosen, edges: id })} options={Object.keys(BUFFERS.edges).map(id => ({ id, label: id }))} />
    </Field>
    <Field label={tr("Corner buffer")}>
      <Segmented label={tr("Corner buffer")} value={chosen.corners} onChange={id => setBuffers({ ...chosen, corners: id })} options={Object.keys(BUFFERS.corners).map(id => ({ id, label: id }))} />
    </Field>
    <Field label={tr("Letters")}>
      <Segmented label={tr("Letters")} value={kind} onChange={setKind} options={[{ id: "edges", label: tr("Edges") }, { id: "corners", label: tr("Corners") }]} />
      <View accessibilityRole="radiogroup" accessibilityLabel={tr("Letters")} style={{ height: cell * 9 + 16 }}>
        {BLD_FACES.flatMap(face => Array.from({ length: 9 }, (_, f) => {
          const sticker = stickerAt(face, f), [x, y] = NET[face];
          const style = { position: "absolute" as const, left: (x * 3 + f % 3) * (cell + 2), top: (y * 3 + Math.floor(f / 3)) * (cell + 2), width: cell, height: cell, backgroundColor: BLD_COLORS[face] };
          if (sticker?.kind !== kind) return <View key={face + f} style={style} className={cn("rounded", sticker && "opacity-35")} />;
          const on = picked === sticker.index;
          return <Pressable key={face + f} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${face} ${letters[kind][sticker.index]}`}
            onPress={() => setPicked(sticker.index)} style={style} className={cn("items-center justify-center rounded", on ? "border-2 border-foreground" : repeated(letters, kind, sticker.index) && "border-2 border-destructive")}>
            <Text className={cn("text-sm font-extrabold text-black/75", sticker.index === buffer && "underline")}>{letters[kind][sticker.index]}</Text>
          </Pressable>;
        }))}
      </View>
      <View className="flex-row items-center gap-2">
        <SheetInput value={letters[kind][picked]} selectTextOnFocus autoCapitalize="characters" autoCorrect={false} accessibilityLabel={tr("Letter of the sticker picked")}
          onChangeText={text => { if (!text.trim()) return; setScheme(withLetter(letters, kind, picked, text)); setPicked((picked + 1) % 24); }}
          className="w-16 text-center font-extrabold" />
        <View className="flex-1" />
        <Chip icon={RotateCcw} onPress={() => setScheme({ ...letters, [kind]: SPEFFZ[kind] })}>{tr("Speffz")}</Chip>
      </View>
    </Field>
  </Sheet>;
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => <View className="gap-2">
  <Label className="font-bold tracking-widest uppercase">{label}</Label>
  {children}
</View>;
