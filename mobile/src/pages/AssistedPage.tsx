import { useSetAtom } from "jotai";
import {
  Camera, Check, ChevronLeft, ChevronRight, GraduationCap, Hand, RotateCcw, 
  ScanLine, Timer, TriangleAlert, X, type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { applyAlg, solved, type CubeState, type Face } from "../../../src/shared/cube";
import { assistedCourse, solveMethod } from "../../../src/client/lib/methodSolver";
import { stepPicture } from "../../../src/client/lib/course";
import { viewForMask } from "../../../src/shared/cubeDiagram";
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
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { catalogCases } from "../components/analysis/steps";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { useLayout } from "../hooks/useLayout";
import { goBackAtom, replaceRouteAtom } from "../state";
import { StepLesson } from "./LearnPage";
import { said, tr } from "../../../src/client/i18n";

/**
 * The assisted solve of a 3×3 course, as the web's (desktop/renderer/AssistedSolve.tsx), over the whole screen: the
 * player's own cube, read by the camera or painted by hand (CubeScan), solved by the player with the course's steps
 * (methodSolver.ts says which ones it still needs), one step at a time and never the turns themselves. The player says
 * when a step is done, or reads the cube again. (No connected cube on the phone.)
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
    <Text accessibilityRole="header" className="py-2 text-center text-2xl font-extrabold tracking-[-0.04em]">{tr("Show Qbix your cube")}</Text>
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

/**
 * The solve, as on the web: the course's steps across the top, the step to do now (what it is for, the cube it leaves
 * and the pieces it is about), never the turns themselves. The player says when a step is done, or reads the cube again.
 */
function Solve({ course, start, back, leave, rescan }: { course: Course; start: CubeState; back: () => void; leave: () => void; rescan: (now: CubeState, how?: "camera" | "check") => void }) {
  const { steps, method } = course,
    [plan] = useState(() => solveMethod(method.id, start, catalogCases())),
    // The steps this cube still goes through, in their order: one already done is not asked for.
    [todo] = useState(() => [...new Set((plan ?? []).map(part => part.step))]),
    [index, setIndex] = useState(0),
    [began] = useState(Date.now),
    [end, setEnd] = useState<number | null>(null),
    [box, setBox] = useState(0),
    replace = useSetAtom(replaceRouteAtom),
    { tablet, wide } = useLayout();
  const finished = !!plan?.length && index >= todo.length,
    step = todo[index] ?? steps.length,
    time = useClock(began, end);
  useEffect(() => { if (finished && end == null) setEnd(Date.now()); }, [finished, end]);
  const again = (how?: "camera" | "check") => rescan(start, how);
  // A step's lesson opens over the solve, which goes on where it was once the sheet is closed.
  const [lesson, setLesson] = useState<number | null>(null);
  const lessonSheet = <StepLesson puzzle="333" methodId={method.id} step={lesson} onClose={() => setLesson(null)} />;

  if (!plan || !plan.length)
    return <Frame phase={2} back={back} close={leave}>
      <Notice cube={plan ? <StaticCubeSvg state={solved(3)} size={120} /> : <Icon as={TriangleAlert} size={40} className="text-warning" />}
        title={plan ? tr("Your cube is already solved") : tr("This cube cannot be solved")}
        text={plan ? undefined : tr("A piece is twisted or two pieces are swapped. Check the colours.")}>
        {!plan && <Action primary icon={Check} title={tr("Colours")} accessibilityLabel={tr("Check the colours")} onPress={() => again("check")} />}
        <Action primary={!!plan} icon={ScanLine} title={tr("Read again")} accessibilityLabel={plan ? tr("Read the cube again") : tr("Read everything again")} onPress={() => again()} />
      </Notice>
    </Frame>;

  if (finished)
    return <Frame phase={3} back={back} close={leave}>
      <Route steps={steps} todo={todo} index={index} onStep={setLesson} />
      <View className="min-h-0 flex-1 items-center justify-center gap-2 rounded-3xl bg-card p-4">
        <StaticCubeSvg state={solved(3)} size={110} />
        <Text accessibilityRole="header" className="text-4xl font-extrabold tracking-[-0.05em]">{tr("Solved!")}</Text>
        <Numeric className="text-3xl font-extrabold tracking-[-0.03em]">{time}</Numeric>
      </View>
      <Action primary icon={RotateCcw} title={tr("Again")} accessibilityLabel={tr("Solve again")} onPress={() => again()} />
      <View className="flex-row gap-2">
        <Action className="flex-1" icon={Timer} title={tr("Timer")} accessibilityLabel={tr("On your own, with the timer")} onPress={() => replace({ page: "playground" })} />
        <Action className="flex-1" icon={GraduationCap} title={tr("Course")} accessibilityLabel={tr("Back to the course")} onPress={leave} />
      </View>
      {lessonSheet}
    </Frame>;

  const shown = steps[step]!,
    picture = stepPicture(method, step),
    pieces = [...new Map(plan.filter(part => part.step === step && part.piece).map(part => [part.piece!.join(""), part.piece!])).values()];
  const stage = <View className={cn("min-h-0 flex-1 items-center gap-1 rounded-3xl bg-card p-3.5", tablet && "p-6")} accessibilityLiveRegion="polite">
    <Label className={CAP}>{tr("Desired state")}</Label>
    <View className="min-h-0 w-full flex-1 items-center justify-center" onLayout={e => { const { width, height } = e.nativeEvent.layout; setBox(Math.floor(Math.min(width, height))); }}>
      {box > 0 && <StaticCubeSvg state={applyAlg(solved(3), picture.after)} size={box} mask={picture.mask} view={viewForMask(picture.mask)} held={picture.held} />}
    </View>
  </View>;
  const stepCard = <View className="gap-2 rounded-3xl bg-card px-3.5 py-3" accessibilityLabel={tr("Current step")}>
    <Text numberOfLines={1} className="text-[13px] font-bold text-primary">{tr("Step {0}", { 0: step + 1 })} · {said(shown.title)}</Text>
    <Text numberOfLines={tablet ? undefined : 4} className="text-sm leading-snug text-muted-foreground">{said(shown.text)}</Text>
    {pieces.length > 0 && <View className="flex-row flex-wrap items-center gap-2" accessibilityLabel={tr("Pieces to place")}>
      <Label className={CAP}>{tr("Pieces to place")}</Label>
      {pieces.map(faces => <View key={faces.join("")} className="rounded-lg bg-muted p-1.5"><Piece faces={faces} /></View>)}
    </View>}
    <View className="flex-row items-center justify-between gap-2">
      <Numeric className="text-[13px] font-bold text-muted-foreground">{time}</Numeric>
      <Pressable onPress={() => setLesson(step)} accessibilityRole="button" accessibilityLabel={tr("Review the lesson")} className="min-h-10 flex-row items-center gap-0.5">
        <Text className="text-[13px] font-bold text-primary">{tr("Lesson")}</Text><Icon as={ChevronRight} size={14} className="text-primary" />
      </Pressable>
    </View>
  </View>;
  const next = <View className="flex-row gap-2">
    <Button variant="secondary" size="icon" className="h-14 w-14 rounded-2xl" accessibilityLabel={tr("Previous step")} disabled={!index} onPress={() => setIndex(index - 1)}>
      <Icon as={ChevronLeft} size={22} />
    </Button>
    <Button className="h-14 flex-1 rounded-2xl" accessibilityLabel={tr("Step done")} onPress={() => setIndex(index + 1)}><Text className="text-lg font-extrabold">{tr("Step done")}</Text></Button>
  </View>;
  const reread = <Button variant="secondary" className="h-12 gap-2 rounded-2xl" accessibilityLabel={tr("Read the cube again")} onPress={() => again()}><Icon as={ScanLine} size={17} /><Text>{tr("Read again")}</Text></Button>;
  return <Frame phase={2} back={back} close={leave}>
    {wide ? <View className="min-h-0 flex-1 flex-row gap-4">
      <View className="min-h-0 min-w-0 flex-1 gap-3"><Route steps={steps} todo={todo} index={index} onStep={setLesson} />{stage}{next}</View>
      <View className="w-[380px] gap-3 rounded-[26px] bg-popover p-4">{stepCard}<View className="flex-1" />{reread}</View>
    </View> : <>
      <Route steps={steps} todo={todo} index={index} onStep={setLesson} />
      {stage}
      {stepCard}
      {next}
      {reread}
    </>}
    {lessonSheet}
  </Frame>;
}

/** The course's steps across the top: done in green, the current one in the accent; a tap opens the step's lesson. */
function Route({ steps, todo, index, onStep }: { steps: Course["steps"]; todo: number[]; index: number; onStep: (step: number) => void }) {
  const here = todo[index] ?? steps.length;
  return <View accessibilityLabel={tr("Steps")} className="flex-row gap-1.5">
    {steps.map((st, i) => <Pressable key={st.title} accessibilityRole="button" accessibilityLabel={`${said(st.title)} · ${tr("Lesson")}`} accessibilityState={{ selected: i === here }} onPress={() => onStep(i)}
      className={cn("min-w-0 flex-1 gap-1.5 rounded-xl px-2 py-1.5", i === here ? "bg-muted active:bg-muted/70" : "bg-card active:bg-muted")}>
      <Numeric className={cn("text-xs font-bold", i > here && "text-muted-foreground")}>{i + 1}</Numeric>
      <View className={cn("h-[5px] rounded-full", i < here ? "bg-success" : i === here ? "bg-primary" : "bg-muted-foreground/25")} />
    </Pressable>)}
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
