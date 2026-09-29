import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { METHODS } from "../../../src/shared/methods";
import { PUZZLES, type PuzzleId } from "../../../src/shared/puzzles";
import { guidesAtom, puzzleAtom, type GuideId } from "../state";
import { FONT, useTheme } from "../theme";
import { IconClose } from "./icons";
import { Sheet, SheetScrollView } from "./Sheet";
import { Btn, Label, CellGroup } from "./ui";

// Bundled with the app: help remains available offline, independently of the website.
const guides: Record<Exclude<GuideId, "methods">, { title: string; lead: string; sections: [string, string][] }> = {
  about: {
    title: "About Cubix", lead: "Cubix is a free cube timer and algorithm trainer. No account is needed to start.",
    sections: [
      ["Timer", "Apply the scramble, hold a free area of the screen until the time turns green, release to start, then tap to stop. Times, Ao5 and Ao12 are kept per puzzle, scramble type and solve mode."],
      ["Algorithms and training", "Browse case diagrams, setups and algorithms, then select the cases you want to practise. Cubix includes 2×2 to 7×7, Square-1, Pyraminx, Skewb, Megaminx and Clock."],
      ["Accounts and offline practice", "Guest practice is saved on this device. The timer, scrambles, catalogue and guides work offline from installation. An account synchronises your times, statistics and achievements between devices. Local times are merged when you sign in; synchronisation requires a connection."],
      ["Achievements", "Open Account and choose Achievements. Speed goals (sub-30, sub-20…) count full-scramble solves in standard mode, average goals use your average of 5, and knowledge goals unlock when every case of a set (PLL, OLL, F2L…) is marked as learned. Each puzzle has its own goals; general goals count solves, drills and active days across all puzzles."],
      ["Competition timing", "Cubix is an independent practice tool. It is not an official competition timer and is not affiliated with Rubik’s or the World Cube Association."],
    ],
  },
  timer: {
    title: "Using the cube timer", lead: "Time physical solves with the touchscreen.",
    sections: [
      ["1. Choose a puzzle and scramble", "Open Settings with the gear in the navigation bar to change the active puzzle, theme or accent. On phones, the bottom toolbar contains scramble type, solve mode, time entry, New scramble and Times. Normal generates a scramble for the selected WCA event. New scramble generates another one."],
      ["2. Start", "Hold a free area of the screen for 0.3 seconds until the time turns green, then release. Releasing early cancels. Buttons and lists do not start the timer."],
      ["3. Stop and review", "Tap the screen to stop. Your time is saved and the next scramble appears. Four buttons in the bottom toolbar on phones (under the time on larger screens) let you delete it, mark it DNF, add a +2 (the flag) or write a comment. Open Times to inspect scrambles and comments, change penalties, or delete an earlier time with the button on its right."],
      ["Typing and casual entry", "The entry menu in the toolbar chooses how times come in. Timer is the built-in timer. Typing replaces it with a field for a time measured on an external timer such as a speed-stacking mat: type it and confirm. Bare digits are read from the right, so 1234 is 12.34 and 12345 is 1:23.45; 12.34 and 1:23.45 work too. Casual runs the timer without recording anything: the time is shown, then forgotten, and the session, statistics and profile stay untouched."],
      ["Modes", "Standard, one-handed and blindfolded modes keep separate histories. Blindfolded time includes memorisation. Guest times stay on this device; sign in to sync them."],
    ],
  },
  duel: {
    title: "Racing another cuber", lead: "Duel races you against another cuber, live, on the same scrambles.",
    sections: [
      ["1. Find an opponent", "Choose the puzzle, open Duel and tap Find an opponent. There is no rating: your level is the mean of your last twelve timer solves on that puzzle, without the best and the worst, once five of them count. You meet the player searching the same puzzle whose level is closest to yours. The range accepted widens the longer you wait, from 15% at once to anyone after 30 seconds. Without a level you first meet other new players, then anyone after 10 seconds. Signed-in players race under their username, guests under a short guest name."],
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
      ["Review everything learned", "Choose Review learned in the training toolbar to mix every case marked learned for the selected puzzle, across all stages and sets. Each timed attempt or Next picks another case. New learned cases join automatically; removing a learned mark removes the case from review after the current attempt. Daily assignments and your free-practice selection are preserved."],
      ["Daily learning (3×3)", "Choose Learn F2L, Learn OLL or Learn PLL in the 3×3 training toolbar. Repeat the algorithm of the day as often as you like, then mark it learned. It stays assigned across restarts and missed days until learned; the next case arrives on the following local calendar day. You can keep practising today’s case after learning it, or undo Learned. Open Groups and use the up and down arrows to choose the order of case families. The order is saved per track on this device. Reordering keeps today’s case and affects future assignments; already learned cases are skipped. Each track remembers its own case. Press Train learned (Review on phones) to repeat every case of the track you have already marked learned, one random case per attempt; press it again to return to today’s case. Free practice restores your manual selection. Daily assignments stay on this device for each account; learned marks synchronise with your account."],
      ["Set up a session", "On phones, the controls are in the bottom toolbar. Open Cases, search or expand a set, then select cases individually or select a whole set. Apply the displayed setup to your cube. Hold a free area of the screen, release when green, then tap to stop."],
      ["Review attempts", "Open Times to review results by case. Undo removes the last time. Previous and next restore your case history, including its random U turn. Open a case title to inspect its details."],
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

/** The dialog's list of guides, in the web order (`GUIDE_NAMES`). */
const GUIDE_NAMES: [GuideId, string][] = [
  ["about", "About Cubix"], ["timer", "Timer"], ["algorithms", "Algorithms"], ["training", "Training"], ["duel", "Duel"], ["methods", "Solving methods"], ["averages", "Ao5 and Ao12"],
];

/**
 * The guides (`.guides-modal` on a phone): the list of guides as a row across the top with the close button,
 * the chosen guide below. Opened anywhere with `guidesAtom` (Settings → Open the guides).
 */
export function GuidesDialog() {
  const t = useTheme();
  const [guide, setGuide] = useAtom(guidesAtom);
  // The last guide stays rendered while the dialog fades out.
  const [shown, setShown] = useState<GuideId>(guide ?? "about");
  if (guide && guide !== shown) setShown(guide);
  const close = () => setGuide(null);
  const content = shown === "methods" ? undefined : guides[shown];
  return <Sheet open={guide !== null} onClose={close} title="Guides" header={false} flush tall style={{ height: "100%" }}>
    <View style={[styles.nav, { borderBottomColor: t.line }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.navItems} accessibilityLabel="Guides">
        {GUIDE_NAMES.map(([id, name]) => {
          const selected = id === shown;
          return <Pressable key={id} onPress={() => setGuide(id)} accessibilityRole="tab" accessibilityState={{ selected }}
            style={({ pressed }) => [styles.navItem, { backgroundColor: selected ? t.surface2 : pressed ? t.hover : "transparent" }]}>
            <Text numberOfLines={1} style={[styles.navText, { color: selected ? t.text : t.secondary }]}>{name}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <Btn iconOnly icon={IconClose} onPress={close} accessibilityLabel="Close the guides" style={{ marginRight: 10 }} />
    </View>
    <SheetScrollView key={shown} style={{ flex: 1 }} contentContainerStyle={styles.body}>
      <Label>Cubix · Guides</Label>
      {content ? <>
        <Text style={[styles.h1, { color: t.text }]} accessibilityRole="header">{content.title}</Text>
        <Text style={[styles.lead, { color: t.text }]}>{content.lead}</Text>
        {content.sections.map(([title, body]) => <Section key={title} title={title} body={body} />)}
      </> : <MethodsGuide />}
      <Text onPress={() => void Linking.openURL("https://github.com/Vitrixxl/cubix")} accessibilityRole="link" style={[styles.link, { color: t.accent }]}>Cubix source code</Text>
    </SheetScrollView>
  </Sheet>;
}

function Section({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return <View style={styles.section}>
    <Text style={[styles.h2, { color: t.text }]} accessibilityRole="header">{title}</Text>
    <Text style={[styles.paragraph, { color: t.secondary }]}>{body}</Text>
  </View>;
}

/** Puzzle and method tabs of the solving methods; they open on the active puzzle without changing it. */
function MethodTabs({ puzzle, method, onPuzzle, onMethod }: { puzzle: PuzzleId; method: string; onPuzzle: (puzzle: PuzzleId) => void; onMethod: (id: string) => void }) {
  return <View style={{ gap: 8 }}>
    <CellGroup style={styles.tabs}>
      {PUZZLES.map(p => <Btn key={p.id} small variant="ghost" active={p.id === puzzle} label={p.label} onPress={() => onPuzzle(p.id)} />)}
    </CellGroup>
    <CellGroup style={styles.tabs}>
      {METHODS[puzzle].map(m => <Btn key={m.id} small variant="ghost" active={m.id === method} label={m.name} onPress={() => onMethod(m.id)} />)}
    </CellGroup>
  </View>;
}

function useMethod() {
  const [puzzle, setPuzzle] = useState<PuzzleId>(useAtomValue(puzzleAtom));
  const [methodId, setMethodId] = useState("");
  const methods = METHODS[puzzle], method = methods.find(m => m.id === methodId) ?? methods[0]!;
  return { puzzle, method, onPuzzle: (value: PuzzleId) => { setPuzzle(value); setMethodId(""); }, onMethod: setMethodId };
}

/** The chosen method: summary, then its numbered steps (`.methods-body`). */
function MethodBody({ method }: { method: ReturnType<typeof useMethod>["method"] }) {
  const t = useTheme();
  return <View style={{ gap: 14 }}>
    <View style={{ gap: 6 }}>
      <Text style={[styles.h2, { color: t.text }]}>{method.name}</Text>
      <Text style={[styles.paragraph, { color: t.muted }]}>{method.summary}</Text>
    </View>
    {method.steps.map((step, i) => <View key={step.title} style={styles.step}>
      <Text style={[styles.stepIndex, { color: t.muted }]}>{i + 1}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.stepTitle, { color: t.text }]}>{step.title}</Text>
        <Text style={[styles.paragraph, { color: t.muted }]}>{step.text}</Text>
      </View>
    </View>)}
  </View>;
}

function MethodsGuide() {
  const t = useTheme();
  const state = useMethod();
  return <>
    <Text style={[styles.h1, { color: t.text }]} accessibilityRole="header">Solving methods</Text>
    <Text style={[styles.lead, { color: t.text }]}>How each puzzle is usually solved, from a first solve to speed methods. Choose a puzzle, then a method.</Text>
    <MethodTabs puzzle={state.puzzle} method={state.method.id} onPuzzle={state.onPuzzle} onMethod={state.onMethod} />
    <MethodBody method={state.method} />
  </>;
}

/** Solving methods (`.methods-modal`): puzzle and method tabs stay put while the chosen method scrolls. */
export function MethodsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Solving methods" tall>{open && <MethodsContent />}</Sheet>;
}
function MethodsContent() {
  const state = useMethod();
  return <View style={{ flex: 1, minHeight: 0, gap: 14 }}>
    <MethodTabs puzzle={state.puzzle} method={state.method.id} onPuzzle={state.onPuzzle} onMethod={state.onMethod} />
    <SheetScrollView key={`${state.puzzle}:${state.method.id}`} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}><MethodBody method={state.method} /></SheetScrollView>
  </View>;
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  navItems: { flexDirection: "row", alignItems: "center", gap: 2, padding: 10 },
  navItem: { height: 34, paddingHorizontal: 10, borderRadius: 0, justifyContent: "center" },
  navText: { fontSize: 13.5, fontWeight: "500" },
  body: { paddingTop: 22, paddingHorizontal: 18, paddingBottom: 28, gap: 12 },
  h1: { fontSize: 30, fontWeight: "600", lineHeight: 34.5, letterSpacing: -0.6, marginTop: 4, marginBottom: 4 },
  lead: { fontSize: 16.5, lineHeight: 28 },
  section: { gap: 8, marginTop: 16 },
  h2: { fontSize: 18, fontWeight: "600", lineHeight: 23.4 },
  paragraph: { fontSize: 15, lineHeight: 25.5 },
  link: { fontSize: 15, marginTop: 20, textDecorationLine: "underline", alignSelf: "flex-start" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  step: { flexDirection: "row", gap: 12 },
  stepIndex: { fontFamily: FONT.mono, fontSize: 15, lineHeight: 25.5, minWidth: 16 },
  stepTitle: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
});
