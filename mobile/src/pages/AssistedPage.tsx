import { useSetAtom } from "jotai";
import { Camera, Check, ChevronLeft, ChevronRight, Paintbrush, RotateCcw, ScanLine, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { BackHandler, PanResponder, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { applyAlg, faceOfSlot, invertToken, parseAlg, type CubeState, type Face } from "../../../src/shared/cube";
import { HELD_HEX } from "../../../src/shared/cubeAppearance";
import { cubeOrientation, cubeSceneDuration, cubeShapes, cubeViewRadius, turnCube, type CubeScene } from "../../../src/shared/cubeScene";
import { METHODS } from "../../../src/shared/methods";
import { solveBeginner } from "../../../src/client/lib/beginnerSolver";
import { scannedState } from "../../../src/client/lib/cubeScan";
import { clock } from "../../../src/client/lib/duel";
import { colours } from "../../../src/client/lib/solveAnalysis";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { BackButton, Empty, Figure, HeadButton, Label, Numeric, Page, PageHead } from "../components/layout";
import { CubeScan, hex } from "../components/scan/CubeScan";
import { pathsOf } from "../components/ScrambleCube";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { goBackAtom } from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * The assisted solve of the 3×3 beginner course, as the web's (desktop/renderer/AssistedSolve.tsx): the player's own
 * cube, read by the camera or painted by hand (CubeScan), solved with the course's steps (beginnerSolver.ts), turn by
 * turn on a model of it. Without a smart cube the player says when each turn is done; the cube can be read again.
 */
const STEPS = METHODS["333"].find(m => m.id === "beginner")!.steps;

export function AssistedPage() {
  const leave = useSetAtom(goBackAtom),
    [source, setSource] = useState<"scan" | "hand" | null>(null),
    // The cube read, then as it stands when it is read again.
    [cube, setCube] = useState<CubeState | null>(null),
    [reading, setReading] = useState(true),
    [round, setRound] = useState(0);
  // A step inside the solve before leaving it: back to the solve from a new reading, or to the choice of source.
  const inner = !source ? null : reading ? (round ? () => setReading(false) : () => setSource(null)) : null;
  useEffect(() => {
    if (!inner) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { inner(); return true; });
    return () => subscription.remove();
  }, [inner]);
  if (!source)
    return <Frame sub={tr("Your cube")} back={() => leave()}>
      <View className="min-h-0 flex-1 justify-center gap-6 pb-8">
        <View className="gap-1.5">
          <Text className="text-xl font-semibold tracking-tight">{tr("Start from your own cube")}</Text>
          <Text className="text-sm text-muted-foreground">{tr("Qbix plans a beginner solve for it, then takes you through it turn by turn.")}</Text>
        </View>
        <View className="gap-3">
          <SourceTile icon={Camera} title={tr("Show the faces")} text={tr("Hold each face up to the camera: its colours are read for you.")} status={tr("Six faces, one at a time")} onPress={() => setSource("scan")} />
          <SourceTile icon={Paintbrush} title={tr("By hand")} text={tr("Paint the colours of each face on a flat cube.")} status={tr("No camera needed")} onPress={() => setSource("hand")} />
        </View>
      </View>
    </Frame>;
  if (reading || !cube)
    return <Frame sub={tr("Read your cube")} back={inner!}>
      <CubeScan hand={source === "hand"} initial={cube ? colours(cube) : undefined}
        onDone={read => { setCube(scannedState(read)); setReading(false); setRound(r => r + 1); }} />
    </Frame>;
  return <Solve key={round} start={cube} leave={() => leave()} rescan={now => { setCube(now); setReading(true); }} />;
}

/** The page: the way back, the title and where the player is, its control, then the content down to the safe area. */
function Frame({ sub, back, backLabel = "Back", action, children }: { sub?: string; back: () => void; backLabel?: string; action?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Page style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
    <PageHead lead={<BackButton label={backLabel} onPress={back} />} title={tr("Assisted solve")} sub={sub}>{action}</PageHead>
    {children}
  </Page>;
}

/** A way to give the cube: its icon, what it does, and a word on what it takes. */
function SourceTile({ icon, title, text, status, onPress }: { icon: LucideIcon; title: string; text: string; status: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    className="min-h-28 flex-row items-center gap-4 rounded-2xl border border-border bg-card p-4 active:bg-muted/60">
    <View className="size-12 items-center justify-center rounded-xl bg-primary/10"><Icon as={icon} size={22} className="text-primary" /></View>
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-base font-medium">{title}</Text>
      <Text className="text-sm text-muted-foreground">{text}</Text>
      <Label className="pt-1">{status}</Label>
    </View>
    <Icon as={ChevronRight} size={18} className="text-primary" />
  </Pressable>;
}

/** The parts of the solve and the state each starts from; null when the cube cannot be solved. */
function planFrom(state: CubeState) {
  const parts = solveBeginner(state);
  if (!parts) return null;
  const starts = [state];
  for (const part of parts) starts.push(applyAlg(starts.at(-1)!, part.alg));
  return { parts, starts };
}
const turnsOf = (alg: string) => alg.split(" ");

/** Where the player is: the part, the turns made in it, the cube as it stands and the last turn (to play it). */
type At = { part: number; made: number; state: CubeState; turn: { before: CubeState; move: string } | null };

/**
 * The solve: the course's steps across the top, the cube as it stands, the turns of the current part under it, and
 * Previous and Next turn under the thumb; then the time and the turns once solved.
 */
function Solve({ start, leave, rescan }: { start: CubeState; leave: () => void; rescan: (now: CubeState) => void }) {
  const [plan] = useState(() => planFrom(start)),
    [at, setAt] = useState<At>({ part: 0, made: 0, state: start, turn: null }),
    [began] = useState(Date.now),
    [end, setEnd] = useState<number | null>(null),
    [box, setBox] = useState(0);
  const part = plan?.parts[at.part],
    turns = part ? turnsOf(part.alg) : [],
    finished = !!plan?.parts.length && at.part >= plan.parts.length;
  useEffect(() => { if (finished && end == null) setEnd(Date.now()); }, [finished, end]);
  const turn = (move: string, next: Omit<At, "state" | "turn">) => setAt({ ...next, state: applyAlg(at.state, move), turn: { before: at.state, move } });
  const forward = () => {
    if (!part) return;
    const last = at.made + 1 >= turns.length;
    turn(turns[at.made]!, last ? { part: at.part + 1, made: 0 } : { part: at.part, made: at.made + 1 });
  };
  const back = () => {
    if (at.made) return turn(invertToken(turns[at.made - 1]!), { part: at.part, made: at.made - 1 });
    const previous = plan?.parts[at.part - 1];
    if (!previous) return;
    const before = turnsOf(previous.alg);
    turn(invertToken(before.at(-1)!), { part: at.part - 1, made: before.length - 1 });
  };
  const again = () => rescan(at.state);

  if (!plan || !plan.parts.length)
    return <Frame back={leave} backLabel={tr("Back to the course")}>
      <Empty className="flex-1">
        <View className={cn("size-12 items-center justify-center rounded-full", plan ? "bg-success/15" : "bg-warning/15")}>
          <Icon as={plan ? Check : TriangleAlert} size={22} className={plan ? "text-success" : "text-warning"} />
        </View>
        <Text className="text-lg font-semibold tracking-tight">{plan ? tr("Your cube is already solved") : tr("This cube cannot be solved")}</Text>
        <Text className="max-w-xs text-center text-sm text-muted-foreground">
          {plan ? tr("Scramble it, then read it again.") : tr("A piece is twisted or two pieces are swapped. Check the colours.")}
        </Text>
        <Button size="lg" className="mt-2 h-12" onPress={again}><Icon as={ScanLine} size={18} /><Text>{tr("Read the cube again")}</Text></Button>
      </Empty>
    </Frame>;

  const step = part?.step ?? STEPS.length,
    inStep = part ? plan.parts.filter(p => p.step === step) : [],
    total = plan.parts.reduce((sum, p) => sum + turnsOf(p.alg).length, 0);
  return <Frame back={leave} backLabel={tr("Back to the course")} sub={finished ? tr("Solved") : tr("Step {0} of {1}", { 0: step + 1, 1: STEPS.length })}
    action={!finished && <HeadButton icon={ScanLine} label={tr("Read the cube again")} onPress={again} />}>
    <View accessibilityLabel={tr("Steps")} className="flex-row gap-1.5">
      {STEPS.map((st, i) => {
        const own = plan.parts.flatMap((p, k) => p.step === i ? [k] : []),
          ratio = i < step ? 1 : i > step ? 0 : own.filter(k => k < at.part).length / own.length;
        return <View key={st.title} accessibilityLabel={tr(st.title)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <View className={cn("h-full rounded-full", i < step ? "bg-success" : "bg-primary")} style={{ width: `${ratio * 100}%` }} />
        </View>;
      })}
    </View>
    <View className="min-h-0 flex-1 items-center justify-center" onLayout={e => { const { width, height } = e.nativeEvent.layout; setBox(Math.floor(Math.min(width, height))); }}>
      {box > 0 && <SolveCube state={at.state} turn={at.turn} size={box} />}
    </View>
    <Text className="text-center text-xs text-muted-foreground">{tr("Yellow on top, green in front, all the way through")}</Text>
    {finished ? <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-full bg-success/15"><Icon as={Check} size={24} className="text-success" /></View>
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-2xl font-semibold tracking-tight">{tr("Solved!")}</Text>
          <Text className="text-sm text-muted-foreground">{tr("Every step of the beginner method, on your own cube.")}</Text>
        </View>
      </View>
      <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-4">
        <Figure className="flex-1" label={tr("Time")} value={clock((end ?? Date.now()) - began)} />
        <Figure className="flex-1" label={tr("Turns")} value={total} />
      </View>
      <View className="gap-2">
        <Button size="lg" className="h-12" onPress={again}><Icon as={RotateCcw} size={18} /><Text>{tr("Solve again")}</Text></Button>
        <Button variant="outline" size="lg" className="h-12" onPress={leave}><Text>{tr("Back to the course")}</Text></Button>
      </View>
    </View> : part && <View className="gap-3" accessibilityLabel={tr("Current turns")}>
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-xl font-semibold tracking-tight">{tr(STEPS[step]!.title)}</Text>
        {(part.label !== STEPS[step]!.title || part.piece || inStep.length > 1) && <View className="flex-row items-center gap-2">
          {part.label !== STEPS[step]!.title && <Text className="text-sm text-muted-foreground">{tr(part.label)}</Text>}
          {part.piece && <Piece faces={part.piece} />}
          {inStep.length > 1 && <Numeric className="text-sm text-muted-foreground">{tr("{0} of {1}", { 0: inStep.indexOf(part) + 1, 1: inStep.length })}</Numeric>}
        </View>}
      </View>
      <Turns turns={turns} made={at.made} />
      <View className="flex-row gap-2">
        <Button variant="outline" size="icon" className="size-12" accessibilityLabel={tr("Previous turn")} disabled={!at.part && !at.made} onPress={back}>
          <Icon as={ChevronLeft} size={20} />
        </Button>
        <Button size="lg" className="h-12 flex-1" onPress={forward}>
          <Text>{tr("Next turn")}</Text><Icon as={ChevronRight} size={18} />
        </Button>
      </View>
    </View>}
  </Frame>;
}

/** A piece's colours as small squares. */
const Piece = ({ faces }: { faces: Face[] }) => <View className="flex-row gap-0.5" importantForAccessibility="no-hide-descendants">
  {faces.map(face => <View key={face} className="size-3.5 rounded-sm border border-foreground/20" style={{ backgroundColor: hex(face) }} />)}
</View>;

/** The turns of a part, large: those made faded, the next one lit. */
function Turns({ turns, made }: { turns: string[]; made: number }) {
  return <View accessibilityLabel={tr("Turns")} className="flex-row flex-wrap gap-1.5">
    {turns.map((turn, i) => <View key={i} accessibilityState={{ selected: i === made }}
      className={cn("min-w-11 items-center rounded-lg border px-2 py-0.5", i === made ? "border-primary/40 bg-primary/15" : "border-transparent")}>
      <Text className={cn("font-sans text-2xl font-medium tracking-tight", i < made ? "text-muted-foreground/50" : i === made ? "text-primary" : "text-foreground")}>{turn}</Text>
    </View>)}
  </View>;
}

/** How long a turn takes on screen. */
const TURN_MS = 320;
/** Each sticker keeps the colour of the face it started on, in the held palette (yellow on top). */
const COLORS = Array.from({ length: 54 }, (_, origin) => HELD_HEX[faceOfSlot(origin)]);

/** The cube as it stands, its last turn played (at once with reduced motion); a drag turns the view. */
function SolveCube({ state, turn, size }: { state: CubeState; turn: At["turn"]; size: number }) {
  const reduced = useReducedMotion(),
    orientation = useRef(cubeOrientation()),
    [, redraw] = useReducer((n: number) => n + 1, 0);
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
      orientation.current = turnCube(orientation.current, (pageX - from.x) * 0.012, (pageY - from.y) * 0.012);
      last.current = { x: pageX, y: pageY };
      redraw();
    },
    onPanResponderRelease: () => { last.current = null; },
  }), []);
  const radius = cubeViewRadius(scene),
    paths = pathsOf(cubeShapes(scene, progress * cubeSceneDuration(scene), undefined, undefined, orientation.current));
  return <View {...responder.panHandlers} accessibilityRole="image" accessibilityLabel={tr("Your cube: drag to turn it")} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
      {paths.map((p, i) => p.line
        ? <Path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={(radius * 2) / size} />
        : <Path key={i} d={p.d} fill={p.color} />)}
    </Svg>
  </View>;
}
