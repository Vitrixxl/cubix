import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, ChevronRight, Compass, RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text as RNText, ScrollView, View } from "react-native";
import { METHODS } from "../../../src/shared/methods";
import { PUZZLES, type PuzzleId } from "../../../src/shared/puzzles";
import { GUIDE_FOOTER, GUIDE_LINKS, GUIDE_TEXT, GUIDES, guideOfPath, type Block, type Guide, type Inline } from "../../../src/client/lib/guides";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { introductionAtom } from "../journey";
import { guidesAtom, puzzleAtom, type GuideId } from "../state";
import { Sheet, SheetScrollView } from "./Sheet";
import { NotationContent, useNotation } from "./Notation";
import { GraduationCap } from "lucide-react-native";
import { openCourse } from "../../../src/client/lib/course";
import { courseProgressAtom, routeAtom } from "../state";
import { tr } from "../../../src/client/i18n";

/** The guides, in the web's order, by the names the app opens them with (`guidesAtom`). Their texts are the web's
 * (src/client/lib/guides.ts), bundled with the app: help remains available offline. */
const KEYS: Record<GuideId, Guide> = {
  about: "overviewGuide", algorithms: "algorithmsGuide", training: "trainingGuide", timer: "timerGuide", smartCube: "smartCubeGuide", duel: "duelGuide",
  community: "communityGuide", coaching: "coachingGuide", methods: "methodsGuide", notation: "notationGuide", averages: "averagesGuide",
};
const GUIDE_NAMES = (Object.keys(KEYS) as GuideId[]).map(id => [id, GUIDES[KEYS[id]].name] as [GuideId, string]);
const idOf = (guide: Guide) => (Object.keys(KEYS) as GuideId[]).find(id => KEYS[id] === guide)!;

/** A paragraph's pieces: its text, links in the accent and figures in bold, in the paragraph's size. */
function Pieces({ parts, onLink }: { parts: Inline[]; onLink: (href: string) => void }) {
  return <>{parts.map((part, i) => typeof part === "string" ? tr(part)
    : "href" in part ? <RNText key={i} accessibilityRole="link" onPress={() => onLink(part.href)} className="font-medium text-primary">{tr(part.text)}</RNText>
    : <RNText key={i} className="font-medium text-foreground">{part.strong}</RNText>)}</>;
}

/** A folded question: tapping it shows its answer. */
function Question({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return <View className="border-b border-border">
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(v => !v)} className="min-h-12 flex-row items-center gap-2 py-3 active:opacity-70">
      <Icon as={open ? ChevronDown : ChevronRight} size={16} className="text-muted-foreground" />
      <Text className="min-w-0 flex-1 text-base font-medium">{tr(q)}</Text>
    </Pressable>
    {open ? <Text className="pb-3 text-base text-muted-foreground">{tr(a)}</Text> : null}
  </View>;
}

/** A guide's blocks, as the web draws them: headings, muted paragraphs (the first, the lead, larger and brighter), lists, questions and cards. */
function Blocks({ blocks, onLink }: { blocks: Block[]; onLink: (href: string) => void }) {
  return <>{blocks.map((block, i) =>
    "h" in block ? <Text key={i} accessibilityRole="header" className="mt-5 text-lg font-semibold">{tr(block.h)}</Text>
    : "p" in block ? <Text key={i} className={i === 0 ? "text-lg text-foreground/80" : "text-base text-muted-foreground"}><Pieces parts={block.p} onLink={onLink} /></Text>
    : "ol" in block ? <View key={i} className="gap-2">{block.ol.map((item, n) => <View key={item} className="flex-row gap-3">
      <Text className="min-w-4 font-sans text-base text-muted-foreground">{n + 1}.</Text>
      <Text className="min-w-0 flex-1 text-base text-muted-foreground">{tr(item)}</Text>
    </View>)}</View>
    : "q" in block ? <Question key={i} q={block.q} a={block.a} />
    : <View key={i} className="mt-2 gap-4">{block.cards.map(card => <View key={card.h} className="gap-1">
      <Text accessibilityRole="header" className="text-lg font-semibold">{tr(card.h)}</Text>
      <Text className="text-base text-muted-foreground">{tr(card.p)}</Text>
      <View className="flex-row flex-wrap gap-x-4">{card.links.map(link => <Text key={link.href} accessibilityRole="link" onPress={() => onLink(link.href)} className="py-1.5 text-base font-medium text-primary">{tr(link.text)}</Text>)}</View>
    </View>)}</View>)}</>;
}

/** A row of choices that scrolls sideways, the chosen one filled. */
function Chips<T extends string>({ items, value, onChange, label }: { items: [T, string][]; value: T; onChange: (id: T) => void; label: string }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerClassName="gap-1.5 px-5" className="grow-0">
    {items.map(([id, name]) => {
      const on = id === value;
      return <Pressable key={id} onPress={() => onChange(id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
        className={cn("h-9 justify-center rounded-lg px-3 active:bg-muted", on ? "bg-primary/15" : "bg-muted/40")}>
        <Text numberOfLines={1} className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{tr(name)}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

/**
 * The guides in a sheet taking the screen's height, as the web's on a phone: the guides as a row of chips at the top,
 * the replays (the tour, the introduction), then the chosen guide. Opened anywhere with `guidesAtom` (Settings →
 * Guides, the account's menu). A link opens another guide, a page of the app or the website.
 */
export function GuidesSheet() {
  const [guide, setGuide] = useAtom(guidesAtom);
  // The last guide stays rendered while the sheet goes away.
  const [shown, setShown] = useState<GuideId>(guide ?? "about");
  if (guide && guide !== shown) setShown(guide);
  const key = KEYS[shown];
  const setIntro = useSetAtom(introductionAtom), setRoute = useSetAtom(routeAtom);
  const replayTour = () => { setGuide(null); setIntro("tour"); };
  const redoIntroduction = () => { setGuide(null); setIntro("setup"); };
  const open = (href: string) => {
    const target = guideOfPath(href);
    if (target) return setGuide(idOf(target));
    if (href.startsWith("http")) return void Linking.openURL(href);
    setGuide(null);
    setRoute({ page: href === "/training/" ? "training" : href === "/algorithms/" ? "algorithms" : "playground" });
  };
  return <Sheet open={guide !== null} onClose={() => setGuide(null)} title={tr("Guides")} hideTitle contentClassName="gap-0 px-0 pt-0">
    <Chips label={tr("Guides")} items={GUIDE_NAMES} value={shown} onChange={setGuide} />
    <SheetScrollView key={shown} contentContainerClassName="gap-3 px-5 pt-4 pb-10">
      <View className="-ml-3 flex-row flex-wrap">
        <Button variant="ghost" size="sm" className="h-11 gap-1.5" onPress={replayTour}><Icon as={Compass} size={16} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Replay tour")}</Text></Button>
        <Button variant="ghost" size="sm" className="h-11 gap-1.5" onPress={redoIntroduction}><Icon as={RotateCcw} size={16} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Redo the introduction")}</Text></Button>
      </View>
      {shown === "methods" ? <MethodsGuide /> : <>
        <Text accessibilityRole="header" className="text-3xl font-semibold tracking-tight">{tr(GUIDES[key].heading)}</Text>
        <Blocks blocks={GUIDE_TEXT[key]} onLink={open} />
        {shown === "notation" && <NotationGuide />}
      </>}
      <View className="mt-8 flex-row flex-wrap gap-x-4 border-t border-border pt-3" accessibilityLabel={tr("Guides")}>
        {GUIDE_LINKS.map(link => <Text key={link.href} accessibilityRole="link" onPress={() => open(link.href)} className="py-1.5 text-xs text-muted-foreground">{tr(link.text)}</Text>)}
      </View>
      <Text className="text-xs text-muted-foreground">{tr(GUIDE_FOOTER[0])} <Pieces parts={[GUIDE_FOOTER[1]]} onLink={open} /></Text>
    </SheetScrollView>
  </Sheet>;
}

function useMethod() {
  const [puzzle, setPuzzle] = useState<PuzzleId>(useAtomValue(puzzleAtom));
  const [methodId, setMethodId] = useState("");
  const methods = METHODS[puzzle], method = methods.find(m => m.id === methodId) ?? methods[0]!;
  return { puzzle, method, onPuzzle: (value: PuzzleId) => { setPuzzle(value); setMethodId(""); }, onMethod: setMethodId };
}

/** The chosen method: summary, then its numbered steps. */
function MethodBody({ method }: { method: ReturnType<typeof useMethod>["method"] }) {
  return <View className="gap-4">
    <View className="gap-1.5">
      <Text className="text-lg font-semibold">{tr(method.name)}</Text>
      <Text className="text-base text-muted-foreground">{tr(method.summary)}</Text>
    </View>
    {method.steps.map((step, i) => <View key={step.title} className="flex-row gap-3">
      <Text className="min-w-4 font-sans text-base text-muted-foreground">{i + 1}</Text>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-semibold">{tr(step.title)}</Text>
        <Text className="text-base text-muted-foreground">{tr(step.text)}</Text>
      </View>
    </View>)}
  </View>;
}

function MethodsGuide() {
  const state = useMethod();
  return <>
    <Text accessibilityRole="header" className="text-3xl font-semibold tracking-tight">{tr("Solving methods")}</Text>
    <Text className="text-lg">{tr("How each puzzle is usually solved, from a first solve to speed methods. Choose a puzzle, then a method.")}</Text>
    <View className="-mx-5 gap-2">
      <Chips label={tr("Puzzle")} items={PUZZLES.map(p => [p.id, p.label] as [PuzzleId, string])} value={state.puzzle} onChange={state.onPuzzle} />
      <Chips label={tr("Method")} items={METHODS[state.puzzle].map(m => [m.id, m.name] as [string, string])} value={state.method.id} onChange={state.onMethod} />
    </View>
    <MethodBody method={state.method} />
  </>;
}

/** The notation guide's moves: the cube's on the cube, the other puzzles' in a few lines. */
function NotationGuide() {
  return <View className="gap-6 pt-2"><NotationContent state={useNotation()} /></View>;
}

/** Solving methods on their own (the algorithms' menu): puzzle and method chips stay put while the method scrolls. */
export function MethodsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title={tr("Solving methods")} contentClassName="gap-3 px-0">{open && <MethodsContent onClose={onClose} />}</Sheet>;
}
function MethodsContent({ onClose }: { onClose: () => void }) {
  const state = useMethod();
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const setPuzzle = useSetAtom(puzzleAtom), setRoute = useSetAtom(routeAtom);
  // Opens the method's course where it was left, on its puzzle (the web's `learnFrom`).
  const learn = () => {
    onClose();
    setPuzzle(state.puzzle);
    setProgress(openCourse(progress, state.puzzle, state.method.id));
    setRoute({ page: "learn", method: state.method.id });
  };
  return <>
    <Chips label={tr("Puzzle")} items={PUZZLES.map(p => [p.id, p.label] as [PuzzleId, string])} value={state.puzzle} onChange={state.onPuzzle} />
    <Chips label={tr("Method")} items={METHODS[state.puzzle].map(m => [m.id, m.name] as [string, string])} value={state.method.id} onChange={state.onMethod} />
    <SheetScrollView key={`${state.puzzle}:${state.method.id}`} contentContainerClassName="gap-4 px-5 pt-2 pb-10">
      <Button variant="outline" className="h-11 gap-2 self-start" onPress={learn}><Icon as={GraduationCap} size={16} className="text-foreground" /><Text>{tr("Learn this method")}</Text></Button>
      <MethodBody method={state.method} />
    </SheetScrollView>
  </>;
}
