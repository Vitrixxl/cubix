import { useSetAtom } from "jotai";
import { Linking, ScrollView, Text, View } from "react-native";
import { goBackAtom, routeAtom, type GuideId } from "../state";
import { useLayout } from "../hooks/useLayout";
import { useTheme } from "../theme";
import { Btn, Caption, H1, Muted } from "../components/ui";
import { IconBack } from "../components/icons";

// Bundled with the app: help remains available offline, independently of the website.
const guides: Record<GuideId, { title: string; lead: string; sections: [string, string][] }> = {
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
      ["1. Choose a puzzle and scramble", "Open Settings with the gear in the navigation bar to change the active puzzle, theme or accent. Choose a scramble type and solve mode in the toolbar. New scramble generates another one."],
      ["2. Start", "Hold a free area of the screen for 0.3 seconds until the time turns green, then release. Releasing early cancels. Buttons and lists do not start the timer."],
      ["3. Stop and review", "Tap the screen to stop. Your time is saved and the next scramble appears. Four buttons under the time let you delete it, mark it DNF, add a +2 (the flag) or write a comment. Open Times to inspect scrambles and comments, change penalties, or delete an earlier time with the button on its right."],
      ["Typing and casual entry", "The entry menu in the toolbar chooses how times come in. Timer is the built-in timer. Typing replaces it with a field for a time measured on an external timer such as a speed-stacking mat: type it and confirm. Bare digits are read from the right, so 1234 is 12.34 and 12345 is 1:23.45; 12.34 and 1:23.45 work too. Casual runs the timer without recording anything: the time is shown, then forgotten, and the session, statistics and profile stay untouched."],
      ["Modes", "Standard, one-handed and blindfolded modes keep separate histories. Blindfolded time includes memorisation. Guest times stay on this device; sign in to sync them."],
    ],
  },
  algorithms: {
    title: "Using the algorithm library", lead: "Open a case to compare its algorithms, view its setup and review your statistics.",
    sections: [
      ["Browse by stage", "F2L pairs a corner and an edge to finish the first two layers. OLL orients the last layer. PLL permutes it. ZBLL finishes the last layer in one algorithm when its edges are already oriented, sorted by corner pattern (T, U, L, Pi, H, S, AS). Stage tabs jump between sections; set switches choose 2-look or full variants. Other puzzles have their own stages and sets."],
      ["From reference to practice", "Press Train on a case or Train all on a group to open the trainer with that selection. Trained cases show their best and mean time on their card. Learned and Not learned filter the catalogue by the learning status you mark on each case. Press the active filter again to show all cases."],
      ["Learning and sources", "Mark a case as learned independently of timed solves. Sources, recommendations, move counts and available video links appear next to each algorithm."],
    ],
  },
  training: {
    title: "Using the algorithm trainer", lead: "Repeat selected cases to work on recognition and execution separately from full solves.",
    sections: [
      ["Set up a session", "Open Cases, search or expand a set, then select cases individually or select a whole set. Apply the displayed setup to your cube. Hold a free area of the screen, release when green, then tap to stop."],
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

export function GuidesPage({ guide = "about" }: { guide?: GuideId }) {
  const t = useTheme(), layout = useLayout();
  const back = useSetAtom(goBackAtom), navigate = useSetAtom(routeAtom);
  const content = guides[guide];
  return <View style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 850, alignSelf: "center", paddingHorizontal: layout.pagePadding, paddingTop: 12 }}>
    <Btn small variant="ghost" icon={<IconBack size={16} color={t.text2} />} label="Back" onPress={() => { if (!back()) navigate({ page: "profile" }); }} style={{ alignSelf: "flex-start", marginBottom: 12 }} />
    <ScrollView key={guide} style={{ flex: 1 }} contentContainerStyle={{ gap: 20, paddingBottom: layout.navSpace }}>
      <Caption>CUBIX · GUIDES</Caption><H1 size={28}>{content.title}</H1><Muted>{content.lead}</Muted>
      {content.sections.map(([title, body]) => <View key={title} style={{ gap: 8 }}><Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{title}</Text><Text style={{ color: t.text2, fontSize: 15, lineHeight: 24 }}>{body}</Text></View>)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{Object.entries(guides).map(([id, value]) => <Btn key={id} small pressed={id === guide} label={value.title} onPress={() => navigate({ page: "guides", guide: id as GuideId })} />)}</View>
      <Btn small label="Cubix source code" onPress={() => void Linking.openURL("https://github.com/Vitrixxl/cubix")} style={{ alignSelf: "flex-start" }} />
    </ScrollView>
  </View>;
}
