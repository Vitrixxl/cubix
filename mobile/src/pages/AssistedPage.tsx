import { useSetAtom } from "jotai";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Check, ChevronLeft, ChevronRight, GraduationCap, Hand, Info, Repeat2, RotateCcw, RotateCw,
  ScanLine, Timer, TriangleAlert, Undo2, X, type LucideIcon,
} from "lucide-react-native";
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { BackHandler, PanResponder, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { G, Path } from "react-native-svg";
import { applyAlg, faceOfSlot, invertToken, parseAlg, solved, type CubeState, type Face } from "../../../src/shared/cube";
import { HELD_HEX } from "../../../src/shared/cubeAppearance";
import { cubeSceneDuration, cubeShapes, cubeViewRadius, type CubeScene } from "../../../src/shared/cubeScene";
import { CubeView } from "../../../src/client/lib/cubeView";
import { assistedCourse, solveMethod } from "../../../src/client/lib/methodSolver";
import { scannedState } from "../../../src/client/lib/cubeScan";
import { clock } from "../../../src/client/lib/duel";
import { colours } from "../../../src/client/lib/solveAnalysis";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PushedBar } from "../components/AppBar";
import { Alg, Label, Numeric, Segmented } from "../components/layout";
import { CubeScan, hex } from "../components/scan/CubeScan";
import { pathsOf } from "../components/ScrambleCube";
import { Pulse, ViewButtons } from "../components/AlgPlayer";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { catalogCases } from "../components/analysis/steps";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useLayout } from "../hooks/useLayout";
import { goBackAtom, replaceRouteAtom } from "../state";
import { StepLesson } from "./LearnPage";
import { said, tr } from "../../../src/client/i18n";

/**
 * The assisted solve of a 3×3 course, as the web's (desktop/renderer/AssistedSolve.tsx), over the whole screen: the
 * player's own cube, read by the camera or painted by hand (CubeScan), solved with the course's steps (methodSolver.ts),
 * turn by turn on a model of it, the turn said in words. The player says when each turn is done; a player who got lost
 * goes back to the start of the part, or reads the cube again. (No connected cube on the phone.)
 */
type Course = ReturnType<typeof assistedCourse>;
const PHASES = ["Your cube", "Read your cube", "Solve it"];
/** The small uppercase caption over a block. */
const CAP = "font-bold tracking-widest uppercase";

export function AssistedPage({ method }: { method: string }) {
  const leave = useSetAtom(goBackAtom),
    [course] = useState(() => assistedCourse(method)),
    [source, setSource] = useState<"scan" | "hand" | null>(null),
    // The cube read, then as it stands when it is read again.
    [cube, setCube] = useState<CubeState | null>(null),
    [reading, setReading] = useState<false | "camera" | "check">("camera"),
    [round, setRound] = useState(0);
  const choose = (way: "scan" | "hand") => { setSource(way); setReading(way === "hand" ? "check" : "camera"); };
  // A step inside the solve before leaving it: back to the solve from a new reading, or to the choice of source.
  const back = !source ? leave : reading ? (round ? () => setReading(false) : () => setSource(null)) : () => setReading("check");
  useEffect(() => {
    if (!source) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => subscription.remove();
  }, [source, back]);
  if (!source) return <Frame phase={0} back={leave} close={leave}><Choose onChoose={choose} /></Frame>;
  if (reading || !cube)
    return <Frame phase={1} back={back} close={leave}>
      <Segmented label={tr("Read your cube")} value={reading === "check" ? "hand" : "scan"} onChange={way => setReading(way === "hand" ? "check" : "camera")}
        options={[{ id: "scan", label: tr("Camera") }, { id: "hand", label: tr("By hand") }]} />
      <CubeScan key={String(reading) + round} hand={reading === "check"} initial={cube ? colours(cube) : undefined}
        onDone={read => { setCube(scannedState(read)); setReading(false); setRound(r => r + 1); }} />
    </Frame>;
  return <Solve key={round} course={course} start={cube} back={back} leave={() => leave()} rescan={(now, how) => { setCube(now); setReading(how ?? (source === "hand" ? "check" : "camera")); }} />;
}

/**
 * The screen: back, the title and Close, the three moments of the assisted solve (`phase` 0 to 2, 3 once solved), then
 * the content down to the safe area.
 */
function Frame({ phase, back, close, children }: { phase: number; back: () => void; close: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets(), { tablet } = useLayout();
  return <View className="flex-1" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
    <PushedBar title={tr("My cube")} onBack={back}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={close} className="size-11 items-center justify-center rounded-full active:bg-muted">
        <Icon as={X} size={22} />
      </Pressable>
    </PushedBar>
    <View accessibilityLabel={tr("Steps")} className="flex-row items-center justify-center gap-1.5 pb-2.5">
      {PHASES.map((name, k) => {
        const done = k < phase, current = k === phase;
        return <View key={name} className="flex-row items-center gap-1.5" accessibilityState={{ selected: current }}>
          {k > 0 && <View className="h-0.5 w-4 rounded-full bg-muted" />}
          <View className={cn("h-9 flex-row items-center gap-2 rounded-xl px-1.5", current && "bg-card pr-3")}>
            <View className={cn("size-6 items-center justify-center rounded-md", done ? "bg-success" : current ? "bg-primary" : "bg-muted")}>
              {done ? <Icon as={Check} size={14} strokeWidth={3} className="text-background" />
                : <Text className={cn("text-xs font-bold", current ? "text-primary-foreground" : "text-muted-foreground")}>{k + 1}</Text>}
            </View>
            {current && <Text className="text-sm font-bold">{tr(name)}</Text>}
          </View>
        </View>;
      })}
    </View>
    <View className={cn("min-h-0 flex-1 gap-2.5 px-4", tablet && "gap-3 px-7")}>{children}</View>
  </View>;
}

/** How Qbix sees the cube: the camera or the colours by hand, each a tile; then a scramble for a cube already solved. */
function Choose({ onChoose }: { onChoose: (way: "scan" | "hand") => void }) {
  const [scramble, setScramble] = useState(""), { tablet } = useLayout();
  useEffect(() => {
    let live = true;
    void generatePracticeScramble({ puzzle: "333", solveMode: "standard", scrambleType: "normal" }).then(s => { if (live) setScramble(s); }, () => {});
    return () => { live = false; };
  }, []);
  return <>
    <Text accessibilityRole="header" className="py-2 text-center text-2xl font-extrabold tracking-[-0.04em]">{tr("How does Qbix see your cube?")}</Text>
    {/* The two ways side by side on a tablet. */}
    <View className={cn("min-h-0 flex-1 gap-2.5", tablet && "flex-row gap-3")}>
      <WayTile icon={Camera} title={tr("Camera")} onPress={() => onChoose("scan")} />
      <WayTile icon={Hand} title={tr("By hand")} onPress={() => onChoose("hand")} />
    </View>
    <View className="flex-row items-center gap-3 rounded-[20px] bg-card px-4 py-3">
      <StaticCubeSvg state={solved(3)} size={48} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Label className={CAP}>{tr("Your cube is already solved?")}</Label>
        {scramble ? <Alg text={scramble} size={15} /> : null}
      </View>
    </View>
  </>;
}

/** A way to give the cube, stretched to share the screen: its icon, its name and Start. */
function WayTile({ icon, title, onPress }: { icon: LucideIcon; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    className="min-h-0 flex-1 justify-between gap-3 rounded-3xl bg-card p-4 active:bg-muted">
    <View className="min-h-0 flex-1 items-center justify-center rounded-2xl bg-background"><Icon as={icon} size={40} className="text-primary" /></View>
    <View className="flex-row items-center justify-between gap-2">
      <Text className="min-w-0 shrink text-xl font-extrabold tracking-[-0.03em]">{title}</Text>
      <View className="flex-row items-center gap-1"><Text className="text-[13px] font-bold text-primary">{tr("Start")}</Text><Icon as={ChevronRight} size={15} className="text-primary" /></View>
    </View>
  </Pressable>;
}

/** The parts of the solve and the state each starts from; null when the cube cannot be solved. */
function planFrom(methodId: string, state: CubeState) {
  const parts = solveMethod(methodId, state, catalogCases());
  if (!parts) return null;
  const starts = [state];
  for (const part of parts) starts.push(applyAlg(starts.at(-1)!, part.alg));
  return { parts, starts };
}
const turnsOf = (alg: string) => alg.split(" ");

/** The face a turn moves and the way it goes, held yellow on top and green in front; the arrow drawn beside the cube. */
const FACE_NAME: Record<string, string> = { R: "Right face", L: "Left face", U: "Top face", D: "Bottom face", F: "Front face", B: "Back face" };
const WAY: Record<string, [string, string]> = {
  R: ["upwards", "downwards"], L: ["downwards", "upwards"], U: ["to the left", "to the right"], D: ["to the right", "to the left"],
  F: ["clockwise", "anticlockwise"], B: ["clockwise, seen from the back", "anticlockwise, seen from the back"],
};
const ARROW: Record<string, [LucideIcon, LucideIcon]> = {
  R: [ArrowUp, ArrowDown], L: [ArrowDown, ArrowUp], U: [ArrowLeft, ArrowRight], D: [ArrowRight, ArrowLeft], F: [RotateCw, RotateCcw], B: [RotateCcw, RotateCw],
};
function turnWords(turn: string) {
  const face = turn[0]!, back = turn.endsWith("'") ? 1 : 0, half = turn.endsWith("2");
  return { face: tr(FACE_NAME[face]!), way: half ? tr("a half turn") : tr(WAY[face]![back]!), arrow: half ? Repeat2 : ARROW[face]![back]! };
}

/** The time since the solve started, every second. */
function useClock(start: number, end: number | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (end != null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);
  return clock(Math.max(0, (end ?? now) - start));
}

/** Where the player is: the part, the turns made in it, the cube as it stands and the last turn (to play it). */
type At = { part: number; made: number; state: CubeState; turn: { before: CubeState; move: string } | null };

/**
 * The solve: the course's steps across the top, the turn to make on the cube and in words, the part under way with
 * its turns, then Previous and Done, next turn under the thumb; the time and turns once solved.
 */
function Solve({ course, start, back, leave, rescan }: { course: Course; start: CubeState; back: () => void; leave: () => void; rescan: (now: CubeState, how?: "camera" | "check") => void }) {
  const { steps } = course,
    [plan] = useState(() => planFrom(course.method.id, start)),
    [at, setAt] = useState<At>({ part: 0, made: 0, state: start, turn: null }),
    [began] = useState(Date.now),
    [end, setEnd] = useState<number | null>(null),
    [lost, setLost] = useState(false),
    [box, setBox] = useState(0),
    [view] = useState(() => new CubeView()),
    replace = useSetAtom(replaceRouteAtom),
    { tablet, wide } = useLayout();
  const part = plan?.parts[at.part],
    turns = part ? turnsOf(part.alg) : [],
    finished = !!plan?.parts.length && at.part >= plan.parts.length,
    time = useClock(began, end);
  useEffect(() => { if (finished && end == null) setEnd(Date.now()); }, [finished, end]);
  const turn = (move: string, next: Omit<At, "state" | "turn">) => setAt({ ...next, state: applyAlg(at.state, move), turn: { before: at.state, move } });
  const forward = () => {
    if (!part) return;
    const last = at.made + 1 >= turns.length;
    turn(turns[at.made]!, last ? { part: at.part + 1, made: 0 } : { part: at.part, made: at.made + 1 });
  };
  const previous = () => {
    if (at.made) return turn(invertToken(turns[at.made - 1]!), { part: at.part, made: at.made - 1 });
    const before = plan?.parts[at.part - 1];
    if (!before) return;
    const list = turnsOf(before.alg);
    turn(invertToken(list.at(-1)!), { part: at.part - 1, made: list.length - 1 });
  };
  /** Back to the start of the part, the turns made undone. */
  const restart = () => { setAt({ part: at.part, made: 0, state: plan!.starts[at.part]!, turn: null }); setLost(false); };
  const again = (how?: "camera" | "check") => rescan(at.state, how);
  const step = part?.step ?? steps.length;
  // A step's lesson opens over the solve, which goes on where it was once the sheet is closed.
  const [lesson, setLesson] = useState<number | null>(null);
  const lessonSheet = <StepLesson puzzle="333" methodId={course.method.id} step={lesson} onClose={() => setLesson(null)} />;

  if (!plan || !plan.parts.length)
    return <Frame phase={2} back={back} close={leave}>
      <Notice cube={plan ? <StaticCubeSvg state={solved(3)} size={120} /> : <Icon as={TriangleAlert} size={40} className="text-warning" />}
        title={plan ? tr("Your cube is already solved") : tr("This cube cannot be solved")}
        text={plan ? undefined : tr("A piece is twisted or two pieces are swapped. Check the colours.")}>
        {!plan && <Action primary icon={Check} title={tr("Colours")} accessibilityLabel={tr("Check the colours")} onPress={() => again("check")} />}
        <Action primary={!!plan} icon={ScanLine} title={tr("Read again")} accessibilityLabel={plan ? tr("Read the cube again") : tr("Read everything again")} onPress={() => again()} />
      </Notice>
    </Frame>;

  const total = plan.parts.reduce((sum, p) => sum + turnsOf(p.alg).length, 0),
    done = plan.parts.slice(0, at.part).reduce((sum, p) => sum + turnsOf(p.alg).length, 0) + at.made;

  if (finished) {
    const per = steps.map((_, k) => plan.parts.filter(p => p.step === k).reduce((n, p) => n + turnsOf(p.alg).length, 0)), max = Math.max(1, ...per);
    return <Frame phase={3} back={back} close={leave}>
      <Route steps={steps} plan={plan} at={at.part} finished onStep={setLesson} />
      <View className="min-h-0 flex-1 items-center justify-center gap-2 rounded-3xl bg-card p-4">
        <StaticCubeSvg state={solved(3)} size={110} />
        <Text accessibilityRole="header" className="text-4xl font-extrabold tracking-[-0.05em]">{tr("Solved!")}</Text>
        <View className="flex-row gap-8 pt-1">
          {[[time, tr("Time")], [String(total), tr("Turns")]].map(([value, label]) => <View key={label} className="items-center">
            <Numeric className="text-3xl font-extrabold tracking-[-0.03em]">{value}</Numeric>
            <Text className="text-[13px] font-bold text-muted-foreground">{label}</Text>
          </View>)}
        </View>
      </View>
      <View className="gap-1.5 rounded-3xl bg-card px-4 py-3" accessibilityLabel={tr("Turns per step")}>
        <Label className={CAP}>{tr("Turns per step")}</Label>
        {steps.map((st, k) => <View key={st.title} className="flex-row items-center gap-3">
          <Text numberOfLines={1} className="w-32 text-sm">{said(st.title)}</Text>
          <View className="h-2.5 flex-1 rounded-[4px] bg-muted"><View className="h-full rounded-[4px] bg-primary" style={{ width: `${(per[k]! / max) * 100}%` }} /></View>
          <Numeric className="w-8 text-right text-sm font-bold text-muted-foreground">{per[k]}</Numeric>
        </View>)}
      </View>
      <Action primary icon={RotateCcw} title={tr("Again")} accessibilityLabel={tr("Solve again")} onPress={() => again()} />
      <View className="flex-row gap-2">
        <Action className="flex-1" icon={Timer} title={tr("Timer")} accessibilityLabel={tr("On your own, with the timer")} onPress={() => replace({ page: "playground" })} />
        <Action className="flex-1" icon={GraduationCap} title={tr("Course")} accessibilityLabel={tr("Back to the course")} onPress={leave} />
      </View>
      {lessonSheet}
    </Frame>;
  }

  if (lost)
    return <Frame phase={2} back={back} close={leave}>
      <Route steps={steps} plan={plan} at={at.part} finished={false} onStep={setLesson} />
      <Notice cube={<StaticCubeSvg state={at.state} size={120} />} title={tr("Your cube left the plan")}>
        <Action primary icon={ScanLine} title={tr("Read again")} accessibilityLabel={tr("Read the cube again")} onPress={() => again()} />
        <Action icon={Undo2} title={tr("Restart")} accessibilityLabel={tr("Back to the start of this part")} text={at.made ? tr("Undo {0}", { 0: turns.slice(0, at.made).reverse().map(invertToken).join(" ") }) : undefined} onPress={restart} />
        <Action icon={Check} title={tr("Colours")} accessibilityLabel={tr("Check the colours")} onPress={() => again("check")} />
      </Notice>
      {lessonSheet}
    </Frame>;

  const inStep = plan.parts.filter(p => p.step === step),
    shown = turns[at.made]!,
    words = turnWords(shown);
  // The turn in words grows with a tablet's room; a wide screen docks the part and the help at the right.
  const turnSize = tablet ? (wide ? 120 : 150) : 72;
  const stage = <View className={cn("min-h-0 flex-1 flex-row items-center gap-3 rounded-3xl bg-card p-3.5", tablet && "gap-6 p-6")} accessibilityLiveRegion="polite">
    <View className="h-full min-w-0 flex-1 items-center justify-center" onLayout={e => { const { width, height } = e.nativeEvent.layout; setBox(Math.floor(Math.min(width, height))); }}>
      {box > 0 && <SolveCube state={at.state} turn={at.turn} size={box} view={view} />}
      <View className={cn("absolute top-1/2 -right-1 -mt-4 size-8 items-center justify-center rounded-[10px] bg-primary/20", tablet && "-mt-6 size-12 rounded-[14px]")}><Icon as={words.arrow} size={tablet ? 26 : 18} className="text-primary" /></View>
      <ViewButtons player={view} compact className="absolute bottom-0" />
    </View>
    <View className={cn("w-36 gap-1", tablet && "w-64 gap-2")}>
      <Label className={CAP}>{tr("Turn {0} of {1} in this part", { 0: at.made + 1, 1: turns.length })}</Label>
      <Text className="font-sans font-extrabold tracking-[-0.04em] text-primary" style={{ fontSize: turnSize, lineHeight: Math.round(turnSize * 1.03) }}>{said(shown)}</Text>
      <Text className={cn("text-xl font-extrabold tracking-[-0.03em]", tablet && "text-3xl")}>{words.face}</Text>
      <Text className={cn("text-base text-muted-foreground", tablet && "text-xl")}>{words.way}</Text>
    </View>
  </View>;
  const partCard = <View className="gap-2 rounded-3xl bg-card px-3.5 py-3" accessibilityLabel={tr("Current turns")}>
    <Text numberOfLines={1} className="text-[13px] font-bold text-primary">
      {tr("Step {0}", { 0: step + 1 })} · {said(steps[step]!.title)}{inStep.length > 1 ? ` · ${tr("{0} of {1}", { 0: inStep.indexOf(part!) + 1, 1: inStep.length })}` : ""}
    </Text>
    <View className="flex-row items-center gap-2.5">
      {part!.piece && <Piece faces={part!.piece} />}
      <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-extrabold tracking-[-0.02em]">{said(part!.label)}</Text>
    </View>
    <Tape turns={turns} made={at.made} />
    <View className="flex-row items-center justify-between gap-2">
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-1.5">
        {part!.gesture && <>
          <Text className="text-[13px] text-muted-foreground">{tr("The course's algorithm")}</Text>
          <Alg text={part!.gesture.alg} size={14} />
          {part!.gesture.times > 1 && <Text className="text-[13px] text-muted-foreground">· {tr("{0} times", { 0: part!.gesture.times })}</Text>}
        </>}
      </View>
      <Pressable onPress={() => setLesson(step)} accessibilityRole="button" accessibilityLabel={tr("Review the lesson")} className="min-h-10 flex-row items-center gap-0.5">
        <Text className="text-[13px] font-bold text-primary">{tr("Lesson")}</Text><Icon as={ChevronRight} size={14} className="text-primary" />
      </Pressable>
    </View>
  </View>;
  const progress = <View className="flex-row items-center gap-3">
    <Text className="text-[13px] font-bold text-muted-foreground">{tr("Turns")}</Text>
    <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><View className="h-full rounded-full bg-success" style={{ width: `${(done / total) * 100}%` }} /></View>
    <Numeric className="text-[13px] font-bold">{done} / {total}</Numeric>
    <Text className="text-[13px] font-bold text-muted-foreground">{tr("Time")}</Text>
    <Numeric className="text-[13px] font-bold">{time}</Numeric>
  </View>;
  const next = <View className="flex-row gap-2">
    <Button variant="secondary" size="icon" className="h-14 w-14 rounded-2xl" accessibilityLabel={tr("Previous turn")} disabled={!at.part && !at.made} onPress={previous}>
      <Icon as={ChevronLeft} size={22} />
    </Button>
    <Button className="h-14 flex-1 rounded-2xl" accessibilityLabel={tr("Done, next turn")} onPress={forward}><Text className="text-lg font-extrabold">{tr("Next")}</Text></Button>
  </View>;
  const help = <View className="flex-row gap-2">
    <Button variant="secondary" className="h-12 flex-1 gap-2 rounded-2xl" accessibilityLabel={tr("I'm lost")} onPress={() => setLost(true)}><Icon as={Info} size={17} /><Text>{tr("Lost?")}</Text></Button>
    <Button variant="secondary" className="h-12 flex-1 gap-2 rounded-2xl" accessibilityLabel={tr("Read the cube again")} onPress={() => again()}><Icon as={ScanLine} size={17} /><Text>{tr("Read again")}</Text></Button>
  </View>;
  return <Frame phase={2} back={back} close={leave}>
    {wide ? <View className="min-h-0 flex-1 flex-row gap-4">
      <View className="min-h-0 min-w-0 flex-1 gap-3"><Route steps={steps} plan={plan} at={at.part} finished={false} onStep={setLesson} />{stage}{next}</View>
      <View className="w-[380px] gap-3 rounded-[26px] bg-popover p-4">{partCard}{progress}<View className="flex-1" />{help}</View>
    </View> : <>
      <Route steps={steps} plan={plan} at={at.part} finished={false} onStep={setLesson} />
      {stage}
      {partCard}
      {progress}
      {next}
      {help}
    </>}
    {lessonSheet}
  </Frame>;
}

/**
 * The course's steps across the top: each its number and a dash per part, done in green, the current one in the
 * accent; a tap opens the step's lesson.
 */
function Route({ steps, plan, at, finished, onStep }: { steps: Course["steps"]; plan: NonNullable<ReturnType<typeof planFrom>>; at: number; finished: boolean; onStep: (step: number) => void }) {
  const step = finished ? steps.length : (plan.parts[at]?.step ?? steps.length);
  return <View accessibilityLabel={tr("Steps")} className="flex-row gap-1.5">
    {steps.map((st, i) => {
      const parts = plan.parts.flatMap((p, k) => (p.step === i ? [k] : []));
      return <Pressable key={st.title} accessibilityRole="button" accessibilityLabel={`${said(st.title)} · ${tr("Lesson")}`} accessibilityState={{ selected: i === step }} onPress={() => onStep(i)}
        className={cn("min-w-0 flex-1 gap-1.5 rounded-xl px-2 py-1.5", i === step ? "bg-muted active:bg-muted/70" : "bg-card active:bg-muted")}>
        <Numeric className={cn("text-xs font-bold", i > step && "text-muted-foreground")}>{i + 1}</Numeric>
        <View className="flex-row flex-wrap gap-[3px]">
          {(parts.length ? parts : [-1]).map(k => <View key={k} className={cn("h-[5px] w-2.5 rounded-full", k >= 0 && (k < at || finished) ? "bg-success" : k === at ? "bg-primary" : "bg-muted-foreground/25")} />)}
        </View>
      </Pressable>;
    })}
  </View>;
}

/** The turns of a part as keys: done struck out, the next one in the accent, those to come. */
function Tape({ turns, made }: { turns: string[]; made: number }) {
  return <View accessibilityLabel={tr("Turns")} className="flex-row flex-wrap gap-1.5">
    {turns.map((turn, i) => <View key={i} accessibilityState={{ selected: i === made }} className={cn("min-w-10 items-center rounded-lg px-1.5 py-1", i === made ? "bg-primary" : i > made && "bg-muted")}>
      <Text className={cn("font-sans text-sm font-bold", i < made ? "text-muted-foreground line-through" : i === made ? "text-primary-foreground" : "text-foreground")}>{said(turn)}</Text>
    </View>)}
  </View>;
}

/** A piece's colours as small squares. */
const Piece = ({ faces }: { faces: Face[] }) => <View className="flex-row gap-0.5" importantForAccessibility="no-hide-descendants">
  {faces.map(face => <View key={face} className="size-3.5 rounded-sm border border-foreground/20" style={{ backgroundColor: hex(face) }} />)}
</View>;

/** What happened, with the ways forward, in the room the screen has. */
function Notice({ cube, title, text, children }: { cube: ReactNode; title: string; text?: string; children: ReactNode }) {
  return <View className="min-h-0 flex-1 justify-end gap-2">
    <View className="min-h-0 flex-1 items-center justify-center gap-2 px-4">
      {cube}
      <Text accessibilityRole="header" className="text-center text-2xl font-extrabold tracking-[-0.04em]">{title}</Text>
      {text ? <Text className="text-center text-sm text-muted-foreground">{text}</Text> : null}
    </View>
    {children}
  </View>;
}

/** A way forward as a large card: its icon, its word and a line on it; `accessibilityLabel` says it whole. */
function Action({ icon, title, text, onPress, primary = false, className, accessibilityLabel }: { icon: LucideIcon; title: string; text?: string; onPress: () => void; primary?: boolean; className?: string; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    className={cn("min-h-14 flex-row items-center gap-3 rounded-2xl px-4 py-2.5", primary ? "bg-primary active:bg-primary/85" : "bg-card active:bg-muted", className)}>
    <Icon as={icon} size={19} className={primary ? "text-primary-foreground" : "text-foreground"} />
    <View className="min-w-0 flex-1">
      <Text className={cn("text-base font-bold", primary && "text-primary-foreground")}>{title}</Text>
      {text ? <Text numberOfLines={1} className={cn("text-xs", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{text}</Text> : null}
    </View>
  </Pressable>;
}

/** How long a turn takes on screen. */
const TURN_MS = 320;
/** Each sticker keeps the colour of the face it started on, in the held palette (yellow on top). */
const COLORS = Array.from({ length: 54 }, (_, origin) => HELD_HEX[faceOfSlot(origin)]);

/** The cube as it stands, its last turn played (at once with reduced motion); a drag turns `view`. */
function SolveCube({ state, turn, size, view }: { state: CubeState; turn: At["turn"]; size: number; view: CubeView }) {
  const reduced = useReducedMotion(),
    [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => view.subscribe(redraw), [view]);
  const scene = useMemo<CubeScene>(() => turn
    ? { size: 3, colors: COLORS, states: [Array.from(turn.before), Array.from(state)], moves: parseAlg(turn.move) }
    : { size: 3, colors: COLORS, states: [Array.from(state)], moves: [] }, [state, turn]);
  const started = useMemo(() => performance.now(), [scene]),
    progress = !turn || reduced ? 1 : Math.min(1, (performance.now() - started) / TURN_MS);
  useEffect(() => {
    if (progress >= 1) return;
    const frame = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(frame);
  });
  const last = useRef<{ x: number; y: number } | null>(null);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => { last.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; },
    onPanResponderMove: event => {
      const { pageX, pageY } = event.nativeEvent, from = last.current;
      if (!from) return;
      view.rotate((pageX - from.x) * 0.012, (pageY - from.y) * 0.012);
      last.current = { x: pageX, y: pageY };
    },
    onPanResponderRelease: () => { last.current = null; },
  }), [view]);
  const radius = cubeViewRadius(scene),
    shapes = cubeShapes(scene, progress * cubeSceneDuration(scene), undefined, undefined, view.orientation),
    paths = pathsOf(shapes);
  return <View {...responder.panHandlers} accessibilityRole="image" accessibilityLabel={tr("Your cube: drag to turn it")} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
      {paths.map((p, i) => p.line
        ? <Path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={(radius * 2) / size} />
        : <Path key={i} d={p.d} fill={p.color} />)}
      <G transform={`translate(${-radius} ${-radius}) scale(${radius / 60})`}><Pulse pulse={view.pulse()} unit={60 / radius} shapes={shapes} size={size} /></G>
    </Svg>
  </View>;
}
