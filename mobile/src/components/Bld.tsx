import { useAtom, useAtomValue } from "jotai";
import { Check, Eye, ListFilter, Pencil, RotateCcw, Settings2, SkipForward, X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  BLD_COLORS, BLD_FACES, BLD_INK, BLD_KINDS, BLD_PREFS, BLD_PUZZLES, BUFFER_NAMES, BUFFERS, SPEFFZ, allPairs, bldPicture, bldScramble, bldState, cleanBuffers, cleanCommFilter,
  cleanPuzzle, cleanScheme, commLetters, commOf, commPool, doesComm, kindName, netSize, nextPair, ownAlg, pairsOf, recentPairs, repeated, reviewPair, sameMemo, stickerAt,
  traceMemo, withLetter, withOwnAlg, type BldKind, type BldPuzzle, type CommFilter, type Memo, type PairBoxes,
} from "../../../src/client/lib/bld";
import { puzzleInfo } from "../../../src/shared/puzzles";
import type { CaseDto } from "../../../src/shared/types";
import { tr } from "../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { local } from "../api";
import { useLayout } from "../hooks/useLayout";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { bldWordsAtom, ownAlgsAtom, persisted } from "../state";
import { useColors } from "../theme";
import { PlayerAlg, PlayerControls, PlayerCube, useAlgPlayer } from "./AlgPlayer";
import { PushedBar } from "./AppBar";
import { Chip } from "./Chips";
import { Alg, Empty, HeadButton, Label, Numeric, Segmented } from "./layout";
import { useBackTo } from "./Practice";
import { ScrambleCube } from "./ScrambleCube";
import { Sheet, SheetInput } from "./Sheet";

/**
 * Blindfolded training (3×3, 4×4, 5×5), as on the web (desktop/renderer/bld.tsx): Memo (a blindfolded scramble and its
 * cube held white on top, the memo typed, then checked against the one traced), Pairs (each letter pair's word,
 * written once, then recalled) and Comms (a pair of targets, then its 3-style commutator played in 3D); the letter
 * scheme and the buffers in a drawer. The rules are src/client/lib/bld.ts's.
 */
const modeAtom = persisted<string>(BLD_PREFS.mode, "memo");
const bldPuzzleAtom = persisted<unknown>(BLD_PREFS.puzzle, "333");
const schemeAtom = persisted<unknown>(BLD_PREFS.scheme, SPEFFZ);
const buffersAtom = persisted<unknown>(BLD_PREFS.buffers, null);
const boxesAtom = persisted<PairBoxes>(BLD_PREFS.boxes, {});
const recentAtom = persisted<string[]>(BLD_PREFS.recent, []);
const poolAtom = persisted<string>(BLD_PREFS.pool, "all");
const commsAtom = persisted<unknown>(BLD_PREFS.comms, null);
const commBoxesAtom = persisted<PairBoxes>(BLD_PREFS.commBoxes, {});
const kindLabel = (kind: BldKind, puzzle?: BldPuzzle) => tr(kindName(kind, puzzle));
/** The 3×3's catalogue cases, for the commutators, whatever puzzle the app is on. */
let cases: Map<string, CaseDto> | undefined;
const findCase = (id: string) => (cases ??= new Map(local.read.catalog("333").cases.map(c => [c.id, c]))).get(id);

/** The blindfolded training, pushed from Training: Memo, Pairs or Comms, the settings in a drawer. */
export function BldRun({ onBack }: { onBack: () => void }) {
  useBackTo(onBack);
  const [mode, setMode] = useAtom(modeAtom), [settings, setSettings] = useState(false);
  return <View className="flex-1">
    <PushedBar title={tr("BLD")} onBack={onBack}>
      <HeadButton icon={Settings2} label={tr("Letter scheme and buffers")} onPress={() => setSettings(true)} />
    </PushedBar>
    <View className="min-h-0 flex-1 gap-3 px-4 pb-3">
      <Segmented label={tr("Blindfolded")} value={mode === "pairs" || mode === "comms" ? mode : "memo"} onChange={setMode}
        options={[{ id: "memo", label: tr("Memo") }, { id: "pairs", label: tr("Pairs") }, { id: "comms", label: tr("Comms") }]} />
      {mode === "pairs" ? <PairsDrill /> : mode === "comms" ? <CommsDrill /> : <MemoDrill />}
    </View>
    <BldSettings open={settings} onClose={() => setSettings(false)} />
  </View>;
}

/** A blindfolded scramble of the puzzle chosen and its cube, the memo typed, then the one traced beside it. */
function MemoDrill() {
  const { height, width } = useLayout();
  const scheme = cleanScheme(useAtomValue(schemeAtom)), buffers = cleanBuffers(useAtomValue(buffersAtom));
  const [stored, setPuzzle] = useAtom(bldPuzzleAtom), puzzle = cleanPuzzle(stored), n = puzzleInfo(puzzle).cubeSize!;
  const [recent, setRecent] = useAtom(recentAtom);
  const [round, setRound] = useState(0), [scramble, setScramble] = useState(""), [typed, setTyped] = useState(""), [memo, setMemo] = useState<Memo | null>(null);
  // The cube takes the room the memo's result leaves it, never drawn over it.
  const [room, setRoom] = useState(0), size = Math.round(Math.min(height * 0.3, width - 64, 260, room - 8));
  useEffect(() => {
    let live = true;
    setMemo(null); setTyped(""); setScramble("");
    void generatePracticeScramble(bldScramble(puzzle)).then(v => { if (live) setScramble(v); }, () => {});
    return () => { live = false; };
  }, [puzzle, round]);
  const check = () => {
    const traced = traceMemo(bldState(scramble, n), scheme, buffers);
    setMemo(traced);
    setRecent(recentPairs(traced, recent));
  };
  return <View className="min-h-0 flex-1 gap-3">
    <Segmented label={tr("Puzzle")} value={puzzle} onChange={setPuzzle} options={BLD_PUZZLES.map(id => ({ id, label: puzzleInfo(id).label }))} />
    <Alg text={scramble || "…"} size={n > 3 ? 14 : 16} />
    <View className="min-h-0 flex-1 items-center justify-center" onLayout={e => setRoom(e.nativeEvent.layout.height)}>
      {scramble && size >= 64 ? <ScrambleCube key={scramble} puzzle={puzzle} cubeSize={n} scramble={bldPicture(scramble, n)} held size={size} still /> : null}
    </View>
    {memo && <MemoResult memo={memo} puzzle={puzzle} right={sameMemo(typed, memo)} />}
    <View className="flex-row items-center gap-2">
      <Input value={typed} onChangeText={setTyped} placeholder="AB CD EF" accessibilityLabel={tr("Your memo")} editable={!memo} autoCapitalize="characters" autoCorrect={false}
        returnKeyType="done" onSubmitEditing={() => scramble && !memo && check()} className="h-12 flex-1 rounded-xl font-semibold" />
      <Button accessibilityLabel={tr(memo ? "Next" : "Check")} disabled={!scramble} onPress={memo ? () => setRound(round + 1) : check} className="h-12 rounded-full px-5">
        <Icon as={memo ? SkipForward : Check} size={16} className="text-primary-foreground" />
        <Text className="text-base font-bold">{tr(memo ? "Next" : "Check")}</Text>
      </Button>
    </View>
  </View>;
}

/** The memo traced: right or not, each piece type's pairs in order (parity beside), then what is noted apart. */
function MemoResult({ memo, puzzle, right }: { memo: Memo; puzzle: BldPuzzle; right: boolean }) {
  const edges = memo.find(p => p.kind === "edges"), corners = memo.find(p => p.kind === "corners")!;
  const rows: [string, string, boolean][] = [
    ...memo.map((part): [string, string, boolean] => [kindLabel(part.kind, puzzle), pairsOf(part.targets).join(" "), part.parity]),
    ...(edges?.turned.length ? [[tr("Flipped"), edges.turned.join(" "), false] as [string, string, boolean]] : []),
    ...(corners.turned.length ? [[tr("Twisted"), corners.turned.join(" "), false] as [string, string, boolean]] : []),
  ];
  // Scrolled within on a small phone, a 5×5's memo being long.
  return <ScrollView accessibilityLiveRegion="polite" className="min-h-0 shrink grow-0 rounded-2xl bg-card" contentContainerClassName="flex-row items-start gap-3 px-4 py-3">
    <View accessibilityLabel={tr(right ? "Your memo is right" : "Your memo differs")}
      className={cn("size-7 items-center justify-center rounded-full", right ? "bg-success/15" : "bg-destructive/15")}>
      <Icon as={right ? Check : X} size={16} className={right ? "text-success" : "text-destructive"} />
    </View>
    <View className="min-w-0 flex-1 gap-1">
      {rows.map(([label, text, parity]) => <View key={label} className="flex-row items-baseline gap-3">
        <Text className="w-16 text-xs font-bold text-muted-foreground">{label}</Text>
        <Numeric className="min-w-0 flex-1 text-base font-extrabold tracking-wide">{text || "–"}</Numeric>
        {parity && <View className="rounded-full bg-warning/15 px-2.5 py-1"><Text className="text-xs font-bold text-warning">{tr("Parity")}</Text></View>}
      </View>)}
    </View>
  </ScrollView>;
}

/** Again or Got it, under a card. */
const Answer = ({ onAnswer }: { onAnswer: (got: boolean) => void }) => <View className="w-full flex-row gap-2">
  <Pressable accessibilityRole="button" onPress={() => onAnswer(false)} className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-muted active:bg-muted/70">
    <Icon as={RotateCcw} size={16} /><Text className="text-[15px] font-bold">{tr("Again")}</Text>
  </Pressable>
  <Pressable accessibilityRole="button" onPress={() => onAnswer(true)} className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-primary active:bg-primary/85">
    <Icon as={Check} size={16} className="text-primary-foreground" /><Text className="text-[15px] font-bold text-primary-foreground">{tr("Got it")}</Text>
  </Pressable>
</View>;

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
        <Answer onAnswer={answer} />
      </View>}
  </View>;
}

/**
 * A pair of targets from the chosen buffer, in the player's letters: recall its commutator, show it (the player's own
 * or the catalogue's 3-style one, played in 3D from the case), then Got it or Again, boxed as the letter pairs are.
 */
function CommsDrill() {
  const scheme = cleanScheme(useAtomValue(schemeAtom)), buffers = cleanBuffers(useAtomValue(buffersAtom));
  const [stored, setStored] = useAtom(commsAtom), filter = cleanCommFilter(stored), [boxes, setBoxes] = useAtom(commBoxesAtom);
  const setFilter = (change: Partial<CommFilter>) => setStored({ ...filter, ...change });
  const pool = commPool(filter, buffers, scheme, boxes);
  const [seen, setSeen] = useState<string[]>([]);
  const [key, setKey] = useState<string | undefined>(() => nextPair(pool, boxes, []));
  const [shown, setShown] = useState(false), [filters, setFilters] = useState(false);
  useEffect(() => {
    if (!key || !pool.includes(key)) setKey(nextPair(pool, boxes, seen));
    setShown(false);
  }, [filter.kind, filter.letter, filter.fresh, buffers[filter.kind]]);
  const answer = (got: boolean) => {
    if (!key) return;
    const next = reviewPair(boxes, key, got), last = [...seen, key].slice(-6);
    setBoxes(next); setSeen(last); setKey(nextPair(commPool(filter, buffers, scheme, next), next, last)); setShown(false);
  };
  const firsts = [...new Set(commPool({ ...filter, letter: "", fresh: false }, buffers, scheme, {}).map(k => commLetters(k, filter.kind, scheme)[0]!))].sort();
  return <View className="min-h-0 flex-1 gap-3">
    <View className="flex-row items-center gap-2">
      <Segmented label={tr("Pieces")} value={filter.kind} onChange={kind => setFilter({ kind, letter: "" })} className="flex-1"
        options={(["edges", "corners"] as const).map(id => ({ id, label: kindLabel(id) }))} />
      <HeadButton icon={ListFilter} label={tr("Filter")} active={!!filter.letter || filter.fresh} onPress={() => setFilters(true)} />
    </View>
    {!key ? <Empty icon={Check} title={tr("All known")} />
      : <View className="min-h-0 flex-1 items-center justify-center gap-4">
        <Numeric className={cn("font-extrabold tracking-[2px]", shown ? "text-5xl leading-[56px]" : "text-[96px] leading-[104px]")}>{commLetters(key, filter.kind, scheme)}</Numeric>
        {shown ? <CommAnswer key={key} id={key} kind={filter.kind} /> : <Chip icon={Eye} onPress={() => setShown(true)}>{tr("Show")}</Chip>}
        <Answer onAnswer={answer} />
      </View>}
    <Sheet open={filters} onClose={() => setFilters(false)} title={tr("Filter")} scroll>
      <Field label={tr("First letter")}>
        <View className="flex-row flex-wrap gap-2">
          {["", ...firsts].map(letter => <Chip key={letter || "all"} on={filter.letter === letter} onPress={() => setFilter({ letter })}>{letter || tr("All")}</Chip>)}
        </View>
      </Field>
      <Field label={tr("Pairs")}>
        <Segmented label={tr("Pairs")} value={filter.fresh ? "new" : "all"} onChange={id => setFilter({ fresh: id === "new" })}
          options={[{ id: "all", label: tr("All") }, { id: "new", label: tr("New") }]} />
      </Field>
    </Sheet>
  </View>;
}

/** A commutator shown: played in 3D from its case, its moves and notation, and the player's own written in its place. */
function CommAnswer({ id, kind }: { id: string; kind: CommFilter["kind"] }) {
  const { height, width } = useLayout();
  const [own, setOwn] = useAtom(ownAlgsAtom), mine = ownAlg(own, id), comm = commOf(id, kind, findCase), alg = mine ?? comm?.alg ?? "";
  const player = useAlgPlayer(alg, alg ? 3 : null, "full", { autoplay: 300 });
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft?.trim().replace(/\s+/g, " ") ?? "", valid = !typed || doesComm(id, kind, typed);
  const keep = () => {
    if (!valid) return;
    setOwn(withOwnAlg(own, id, typed === comm?.alg ? "" : typed));
    setDraft(null);
  };
  return <View className="w-full min-h-0 flex-1 items-center gap-2">
    <View className="min-h-0 flex-1 items-center justify-center">
      {player ? <PlayerCube player={player} size={Math.round(Math.max(110, Math.min(height * 0.24, width - 96, 220)))} /> : null}
    </View>
    {draft != null ? <View className="w-full gap-1.5">
      <View className="w-full flex-row items-center gap-2">
        <Input autoFocus value={draft} onChangeText={setDraft} placeholder={comm?.alg} accessibilityLabel={tr("Your algorithm")} autoCapitalize="none" autoCorrect={false}
          returnKeyType="done" onSubmitEditing={keep} className="h-12 flex-1 rounded-xl" />
        <Chip on disabled={!valid} onPress={keep}>{tr("Save")}</Chip>
      </View>
      {!valid ? <Text className="text-sm text-destructive">{tr("Not this cycle")}</Text> : null}
    </View> : <>
      <View className="max-w-full flex-row items-center gap-1">
        <View className="min-w-0 shrink items-center"><PlayerAlg player={player} text={alg || "–"} size={17} /></View>
        <HeadButton icon={Pencil} label={tr("Edit")} onPress={() => setDraft(mine ?? "")} />
      </View>
      {mine ? <Text className="text-xs font-bold text-muted-foreground">{tr("Yours")}</Text>
        : comm?.notation ? <Numeric className="text-sm text-muted-foreground">{comm.notation}</Numeric> : null}
      {player ? <PlayerControls player={player} inline className="w-full rounded-2xl bg-card p-1" /> : null}
    </>}
  </View>;
}

/** Where each face of the net stands, in faces: U above L F R B, D below. */
const NET: Record<(typeof BLD_FACES)[number], [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** The settings' drawer: the buffers, then the letter scheme on the cube's net; a sticker picked takes the letter typed, then the next one. */
function BldSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { width } = useLayout(), rim = useColors().variables["--rim"];
  const [stored, setScheme] = useAtom(schemeAtom), [storedBuffers, setBuffers] = useAtom(buffersAtom);
  const letters = cleanScheme(stored), chosen = cleanBuffers(storedBuffers);
  const [kind, setKind] = useState<BldKind>("edges"), [picked, setPicked] = useState(0);
  const n = netSize(kind), gap = n > 3 ? 1 : 2, cell = Math.floor((Math.min(width, 520) - 40 - (4 * n - 1) * gap) / (4 * n));
  const buffer = (BUFFERS[kind] as Record<string, number>)[chosen[kind]];
  return <Sheet open={open} onClose={onClose} title={tr("Settings")} scroll>
    {BLD_KINDS.map(k => <Field key={k} label={tr(BUFFER_NAMES[k])}>
      <Segmented label={tr(BUFFER_NAMES[k])} value={chosen[k]} onChange={id => setBuffers({ ...chosen, [k]: id })} options={Object.keys(BUFFERS[k]).map(id => ({ id, label: id }))} />
    </Field>)}
    <Field label={tr("Letters")}>
      <Segmented label={tr("Letters")} value={kind} onChange={id => { setKind(id); setPicked(0); }} options={BLD_KINDS.map(id => ({ id, label: kindLabel(id) }))} />
      <View accessibilityRole="radiogroup" accessibilityLabel={tr("Letters")} style={{ height: (cell + gap) * 3 * n }}>
        {BLD_FACES.flatMap(face => Array.from({ length: n * n }, (_, f) => {
          const sticker = stickerAt(face, f, n), [x, y] = NET[face];
          const style = { position: "absolute" as const, left: (x * n + f % n) * (cell + gap), top: (y * n + Math.floor(f / n)) * (cell + gap), width: cell, height: cell, backgroundColor: BLD_COLORS[face] };
          if (sticker?.kind !== kind) return <View key={face + f} style={style} className={cn("rounded", f !== (n * n - 1) / 2 && "opacity-35")} />;
          const on = picked === sticker.index, twice = repeated(letters, kind, sticker.index);
          // The theme's rim holds the pale stickers (white, yellow) on a light drawer; the ink is dark on every sticker.
          return <Pressable key={face + f} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${face} ${letters[kind][sticker.index]}`}
            onPress={() => setPicked(sticker.index)} style={[style, !on && !twice && { borderWidth: 1, borderColor: rim }]}
            className={cn("items-center justify-center rounded", on ? "border-2 border-foreground" : twice && "border-2 border-destructive")}>
            <Text style={{ color: BLD_INK }} className={cn("font-extrabold", n > 3 ? "text-xs" : "text-sm", sticker.index === buffer && "underline")}>{letters[kind][sticker.index]}</Text>
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
