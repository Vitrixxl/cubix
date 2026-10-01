import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { METHODS } from "../../../src/shared/methods";
import { PUZZLES, type PuzzleId } from "../../../src/shared/puzzles";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { guidesAtom, puzzleAtom, type GuideId } from "../state";
import { Label } from "./layout";
import { Sheet, SheetScrollView } from "./Sheet";

// Bundled with the app: help remains available offline, independently of the website.
const guides: Record<Exclude<GuideId, "methods">, { title: string; lead: string; sections: [string, string][] }> = {
  about: {
    title: "About Cubix", lead: "Cubix is a free cube timer and algorithm trainer. Sign in or create a free account to start.",
    sections: [
      ["Timer", "Apply the scramble, hold a free area of the screen until the time turns green, release to start, then tap to stop. Times, Ao5 and Ao12 are kept per puzzle, scramble type and solve mode."],
      ["Algorithms and training", "Browse case diagrams, setups and algorithms, then select the cases you want to practise. Cubix includes 2×2 to 7×7, Square-1, Pyraminx, Skewb, Megaminx and Clock."],
      ["Accounts and offline practice", "Your account keeps your times, statistics, learned cases and achievements in sync between devices. Signing in needs a connection; after that the timer, scrambles, catalogue and guides work offline, and your times are saved on the phone and sent once the connection is back. Times kept on the phone before accounts were required join your account when you sign in."],
      ["Achievements", "Open Account and choose Achievements. Speed goals (sub-30, sub-20…) count full-scramble solves in standard mode, average goals use your average of 5, and knowledge goals unlock when every case of a set (PLL, OLL, F2L…) is marked as learned. Each puzzle has its own goals; general goals count solves, drills and active days across all puzzles."],
      ["Competition timing", "Cubix is an independent practice tool. It is not an official competition timer and is not affiliated with Rubik’s or the World Cube Association."],
    ],
  },
  timer: {
    title: "Using the cube timer", lead: "Time physical solves with the touchscreen.",
    sections: [
      ["1. Choose a puzzle and scramble", "Tap the puzzle at the top of the Timer: one sheet holds the puzzle (each WCA event, one-handed and blindfolded included), the scramble type and the time entry. Normal generates a scramble for the selected event; Scramble in the bar under the timer draws another one. Tap the cube to replay the scramble on it."],
      ["2. Start", "Hold a free area of the screen for 0.3 seconds until the time turns green, then release. Releasing early cancels. Buttons and lists do not start the timer."],
      ["3. Stop and review", "Tap the screen to stop. Your time is saved and the next scramble appears. The bar under the timer adds a +2 or a DNF to it, writes a comment or deletes it. The chips under the time are your current average of five. Tap the session strip (Ao5, Ao12, Best) to open every time of the session: tap a time for its details, hold it for +2, DNF, a comment or its deletion."],
      ["Typing and casual entry", "The entry menu in the toolbar chooses how times come in. Timer is the built-in timer. Typing replaces it with a field for a time measured on an external timer such as a speed-stacking mat: type it and confirm. Bare digits are read from the right, so 1234 is 12.34 and 12345 is 1:23.45; 12.34 and 1:23.45 work too. Casual runs the timer without recording anything: the time is shown, then forgotten, and the session, statistics and profile stay untouched."],
      ["Modes", "Standard, one-handed and blindfolded modes keep separate histories. Blindfolded time includes memorisation. Every time syncs to your account."],
    ],
  },
  duel: {
    title: "Racing another cuber", lead: "Duel races you against another cuber, live, on the same scrambles.",
    sections: [
      ["1. Find an opponent", "Choose the puzzle, open Duel and tap Find an opponent. There is no rating: your level is the mean of your last twelve timer solves on that puzzle, without the best and the worst, once five of them count. You meet the player searching the same puzzle whose level is closest to yours. The range accepted widens the longer you wait, from 15% at once to anyone after 30 seconds. Without a level you first meet other new players, then anyone after 10 seconds. You race under your username."],
      ["2. Race five rounds", "Both of you get the same five scrambles, one round at a time. Your opponent's timer is at the top and yours at the bottom: you see them hold, start and stop as it happens. Start and stop like on the timer page; the next round opens once you have both finished."],
      ["3. +2, DNF and Cancel", "The cells under your times put a +2 or a DNF on your latest solve, or take it off again. Cancel takes your solve back so you can redo it on the same scramble, as long as your opponent has not finished that round."],
      ["4. The result", "After five rounds the best Ao5 wins: best and worst dropped, one DNF counts as the worst, two make the average DNF. The result offers a rematch, which starts once you both accept it on five new scrambles, or a new opponent. Your recent battles appear in Account."],
      ["Chat", "The Chat cell opens the conversation with your opponent. Messages last as long as the race."],
    ],
  },
  algorithms: {
    title: "Using the algorithm library", lead: "Open a case to compare its algorithms, view its setup and review your statistics.",
    sections: [
      ["Browse by stage", "F2L pairs a corner and an edge to finish the first two layers. OLL orients the last layer. PLL permutes it. ZBLL finishes the last layer in one algorithm when its edges are already oriented, sorted by corner pattern (T, U, L, Pi, H, S, AS). The stage tabs at the top of Algorithms show one stage at a time, and the set switch below them chooses 2-look or full variants. Other puzzles have their own stages and sets; change the puzzle with the puzzle button in the header."],
      ["Search and solving methods", "Search finds a case by number, name, set or group, such as oll fish or pll t. The book button next to it opens a short explanation of each way to solve a puzzle, such as CFOP, Roux or ZZ on the 3×3. It is also listed with the guides."],
      ["From reference to practice", "Press Train on a case or on a group to open the trainer with that selection. Each row shows the case's best time. All, Learned and To learn filter the list by the learning status you mark with the checkbox at the end of each row; their counts cover the whole set. Groups fold and unfold with their title."],
      ["Case pages", "A case opens as a page with its diagram, best and mean times, setup, algorithms and statistics. Swipe sideways or use the arrows at the bottom to move to the previous or next case of the list, and press Mark learned to change its learning status. Sources, recommendations, move counts and available video links appear under each algorithm."],
    ],
  },
  training: {
    title: "Using the algorithm trainer", lead: "Repeat selected cases to work on recognition and execution separately from full solves.",
    sections: [
      ["Review everything learned", "Choose Review learned to mix every case marked learned for the selected puzzle, across all stages and sets. Each timed attempt or Next case picks another case. New learned cases join automatically; removing a learned mark removes the case from review after the current attempt. Daily assignments and your free-practice selection are preserved."],
      ["Daily learning (3×3)", "Choose Learn F2L, Learn OLL or Learn PLL. Repeat the algorithm of the day as often as you like, then mark it learned. It stays assigned across restarts and missed days until learned; the next case arrives on the following local calendar day. The … menu holds Group order (drag the families into the order you want to learn them; today’s case stays), Train learned (every case of the track you have already learned, one random case per attempt) and Random AUF. Daily assignments stay on this device for each account; learned marks synchronise with your account."],
      ["Set up a session", "Open Training and pick a way to practise. Free practice lists every set: search or open a set, tap the cases you want (or Select all), then Start at the bottom. Apply the displayed setup to your cube, hold a free area of the screen, release when green, then tap to stop."],
      ["Review attempts", "The strip under the stage opens the session, grouped by case: tap a time for its details, hold it for +2, DNF or delete. Next case draws another case; the case name opens its page."],
      ["Recognition", "Start with a few cases you confuse. Keep the solution hidden to practise recognition and reveal it when needed. Random AUF changes the U alignment; the diagram and solution account for that adjustment."],
      ["Full solves", "Use the Timer tab for complete solves. The averages guide explains how your results are calculated."],
    ],
  },
  averages: {
    title: "Ao5 and Ao12", lead: "A best time shows what happened once. An average describes a series of solves.",
    sections: [
      ["Average of 5 (Ao5)", "Take five consecutive results, drop the fastest and slowest, then average the remaining three. For 10.00, 12.00, 13.00, 14.00 and 20.00: (12 + 13 + 14) ÷ 3 = 13.00."],
      ["Average of 12 (Ao12)", "Drop the best and worst of twelve consecutive results and average the ten remaining. Twelve solves from 10 to 21 seconds give an Ao12 of 15.50."],
      ["+2 and DNF", "A +2 adds two seconds before sorting. A DNF counts as the worst result. One DNF is dropped as the worst; two or more make the average DNF."],
      ["Best and mean", "Best is the fastest valid result. Mean averages all valid results without dropping any. Ao5 and Ao12 use the most recent five or twelve results and stay blank until enough solves exist."],
      ["Personal bests", "A timer solve that beats your all-time best single, Ao5 or Ao12 for the puzzle, scramble type and solve mode shows a brief green message. The first result sets the record without beating one."],
    ],
  },
};

/** The list of guides, in the web order (`GUIDE_NAMES`). */
const GUIDE_NAMES: [GuideId, string][] = [
  ["about", "About Cubix"], ["timer", "Timer"], ["algorithms", "Algorithms"], ["training", "Training"], ["duel", "Duel"], ["methods", "Solving methods"], ["averages", "Ao5 and Ao12"],
];

/** A row of choices that scrolls sideways, the chosen one filled. */
function Chips<T extends string>({ items, value, onChange, label }: { items: [T, string][]; value: T; onChange: (id: T) => void; label: string }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerClassName="gap-1.5 px-5" className="grow-0">
    {items.map(([id, name]) => {
      const on = id === value;
      return <Pressable key={id} onPress={() => onChange(id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
        className={cn("h-9 justify-center rounded-lg px-3", on ? "bg-primary/15" : "bg-muted/40 active:bg-muted")}>
        <Text numberOfLines={1} className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{name}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

/**
 * The guides in a sheet taking the screen's height: the guides as a row of chips at the top, the chosen one below.
 * Opened anywhere with `guidesAtom` (Settings → Guides, the account's menu).
 */
export function GuidesSheet() {
  const [guide, setGuide] = useAtom(guidesAtom);
  // The last guide stays rendered while the sheet goes away.
  const [shown, setShown] = useState<GuideId>(guide ?? "about");
  if (guide && guide !== shown) setShown(guide);
  const content = shown === "methods" ? undefined : guides[shown];
  return <Sheet open={guide !== null} onClose={() => setGuide(null)} title="Guides" hideTitle tall contentClassName="gap-0 px-0 pt-0">
    <Chips label="Guides" items={GUIDE_NAMES} value={shown} onChange={setGuide} />
    <SheetScrollView key={shown} style={{ flex: 1 }} contentContainerClassName="gap-3 px-5 pt-6 pb-10">
      <Label>Cubix · Guides</Label>
      {content ? <>
        <Text accessibilityRole="header" className="text-3xl font-semibold tracking-tight">{content.title}</Text>
        <Text className="text-[17px] leading-[28px]">{content.lead}</Text>
        {content.sections.map(([title, text]) => <View key={title} className="mt-4 gap-2">
          <Text accessibilityRole="header" className="text-lg font-semibold">{title}</Text>
          <Text className="text-[15px] leading-[24px] text-muted-foreground">{text}</Text>
        </View>)}
      </> : <MethodsGuide />}
      <Text onPress={() => void Linking.openURL("https://github.com/Vitrixxl/cubix")} accessibilityRole="link" className="mt-6 text-[15px] text-primary underline">Cubix source code</Text>
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
      <Text className="text-lg font-semibold">{method.name}</Text>
      <Text className="text-[15px] leading-[24px] text-muted-foreground">{method.summary}</Text>
    </View>
    {method.steps.map((step, i) => <View key={step.title} className="flex-row gap-3">
      <Text className="min-w-4 font-mono text-[15px] leading-[24px] text-muted-foreground">{i + 1}</Text>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[15px] font-semibold leading-[24px]">{step.title}</Text>
        <Text className="text-[15px] leading-[24px] text-muted-foreground">{step.text}</Text>
      </View>
    </View>)}
  </View>;
}

function MethodsGuide() {
  const state = useMethod();
  return <>
    <Text accessibilityRole="header" className="text-3xl font-semibold tracking-tight">Solving methods</Text>
    <Text className="text-[17px] leading-[28px]">How each puzzle is usually solved, from a first solve to speed methods. Choose a puzzle, then a method.</Text>
    <View className="-mx-5 gap-2">
      <Chips label="Puzzle" items={PUZZLES.map(p => [p.id, p.label] as [PuzzleId, string])} value={state.puzzle} onChange={state.onPuzzle} />
      <Chips label="Method" items={METHODS[state.puzzle].map(m => [m.id, m.name] as [string, string])} value={state.method.id} onChange={state.onMethod} />
    </View>
    <MethodBody method={state.method} />
  </>;
}

/** Solving methods on their own (the algorithms' menu): puzzle and method chips stay put while the method scrolls. */
export function MethodsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Solving methods" tall contentClassName="gap-3 px-0">{open && <MethodsContent />}</Sheet>;
}
function MethodsContent() {
  const state = useMethod();
  return <>
    <Chips label="Puzzle" items={PUZZLES.map(p => [p.id, p.label] as [PuzzleId, string])} value={state.puzzle} onChange={state.onPuzzle} />
    <Chips label="Method" items={METHODS[state.puzzle].map(m => [m.id, m.name] as [string, string])} value={state.method.id} onChange={state.onMethod} />
    <SheetScrollView key={`${state.puzzle}:${state.method.id}`} style={{ flex: 1 }} contentContainerClassName="px-5 pt-2 pb-10"><MethodBody method={state.method} /></SheetScrollView>
  </>;
}
