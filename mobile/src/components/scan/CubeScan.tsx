import { Camera, CameraOff, Check, Paintbrush, RefreshCw, Settings, SwitchCamera, TriangleAlert } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import Svg, { Circle, G, Path, Polygon } from "react-native-svg";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { FACES, slotsFor, type Face, type Vec3 } from "../../../../src/shared/cube";
import { HELD_HEX } from "../../../../src/shared/cubeAppearance";
import { readCube, scanProblem, type Rgb } from "../../../../src/client/lib/cubeScan";
import { COLOUR_NAMES } from "../../../../src/client/lib/solveAnalysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { SCAN_HTML } from "../../scan/scan-html";
import { useColors } from "../../theme";
import { Empty, Label, Numeric } from "../layout";
import { tr } from "../../../../src/client/i18n";
import { msg } from "../../../../src/client/i18n/msg";

/**
 * The cube read face by face for the assisted solve, as the web's (desktop/renderer/CubeScan.tsx): each face shown to
 * the camera in turn, read on its own once held still, then every colour checked on the cube's net, the doubtful ones
 * marked, where a sticker read wrong is painted over. Without a camera, the net is painted by hand.
 *
 * The camera runs in a WebView (scripts/scan-entry.ts, built into src/scan/scan-html.ts by scripts/build-scan.ts) with
 * the web's own face reader; it posts each face read, the app keeps the faces, the instructions and the net.
 */

export const hex = (face: Face) => `#${HELD_HEX[face].toString(16).padStart(6, "0")}`;
const rgb = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`;

/**
 * The faces in the order they are shown, each with how to hold the cube for it (`top` on top, the face's top row up),
 * and whether it comes from the last one by a quarter turn of the whole cube to the left.
 */
const ORDER: { face: Face; top: Face; title: string; held: string; left?: boolean }[] = [
  { face: "F", top: "U", title: "Green face to the camera", held: msg("Yellow on top") },
  { face: "R", top: "U", title: "Orange face to the camera", held: msg("Yellow on top"), left: true },
  { face: "B", top: "U", title: "Blue face to the camera", held: msg("Yellow on top"), left: true },
  { face: "L", top: "U", title: "Red face to the camera", held: msg("Yellow on top"), left: true },
  { face: "U", top: "B", title: "Yellow face to the camera", held: msg("Blue on top") },
  { face: "D", top: "F", title: "White face to the camera", held: msg("Green on top") },
];
/** Below this, a sticker read is marked to check. */
const DOUBT = 0.8;
type Hint = "dark" | "again" | "none" | "close" | "far" | null;
const HINT: Record<Exclude<Hint, null>, string> = {
  dark: msg("More light would help: face a lamp or a window."),
  again: msg("This face is read already: turn the cube as shown."),
  none: msg("Show the whole face inside the square."),
  close: msg("Bring the cube closer."),
  far: msg("Move the cube back a little."),
};

/** Each face's outward direction, to find the side a held cube shows on the right. */
const NORMAL = Object.fromEntries(FACES.map((f, i) => [f, slotsFor(3)[i * 9 + 4]!.n])) as Record<Face, Vec3>;
const rightOf = (front: Face, top: Face) => {
  const [a, b] = [NORMAL[top], NORMAL[front]],
    n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return FACES.find(f => NORMAL[f].every((v, k) => v === n[k]))!;
};

/** A cube drawn as it should be held: `front` to the camera, `top` on top; an arrow when it turns to the left. */
function HoldCube({ front, top, left = false, size }: { front: Face; top: Face; left?: boolean; size: number }) {
  const colors = useColors();
  type P = [number, number];
  const faces: [Face, P[], number][] = [
    [top, [[14, 34], [64, 34], [86, 14], [36, 14]], 1],
    [rightOf(front, top), [[64, 34], [86, 14], [86, 64], [64, 84]], 0.6],
    [front, [[14, 34], [64, 34], [64, 84], [14, 84]], 1],
  ];
  // The corners of a sticker, from the face's four (top left, top right, bottom right, bottom left).
  const at = ([a, b, c, d]: P[], s: number, t: number) => [
    (1 - t) * ((1 - s) * a![0] + s * b![0]) + t * ((1 - s) * d![0] + s * c![0]),
    (1 - t) * ((1 - s) * a![1] + s * b![1]) + t * ((1 - s) * d![1] + s * c![1]),
  ].map(v => v.toFixed(2)).join(",");
  return <Svg width={size} height={size} viewBox="0 0 100 100">
    {faces.map(([face, quad, light]) => Array.from({ length: 9 }, (_, k) => {
      const [i, j] = [k % 3, Math.floor(k / 3)], e = 0.06;
      return <Polygon key={`${face}${k}`} points={[at(quad, (i + e) / 3, (j + e) / 3), at(quad, (i + 1 - e) / 3, (j + e) / 3), at(quad, (i + 1 - e) / 3, (j + 1 - e) / 3), at(quad, (i + e) / 3, (j + 1 - e) / 3)].join(" ")}
        fill={hex(face)} fillOpacity={light} stroke={colors.foreground} strokeOpacity={0.15} strokeWidth={0.6} strokeLinejoin="round" />;
    }))}
    {left && <G fill="none" stroke={colors.primary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M 78 92 Q 46 100 18 92" />
      <Path d="M 25 86 L 17 92 L 26 97" />
    </G>}
  </Svg>;
}

/** A face read so far, small: its nine colours, or its centre's colour while it waits; a tap reads a read one again. */
function MiniFace({ step, colours, current, onPress }: { step: (typeof ORDER)[number]; colours?: Rgb[]; current: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={colours ? tr("{0}: read this face again", { 0: tr(step.title) }) : tr(step.title)} accessibilityState={{ disabled: !onPress, selected: current }}
    disabled={!onPress} onPress={onPress}
    className={cn("size-11 flex-row flex-wrap content-center justify-center gap-px rounded-lg border p-[3px]", current ? "border-2 border-primary p-[2px]" : colours ? "border-success/60" : "border-border")}>
    {Array.from({ length: 9 }, (_, k) => <View key={k} className={cn("size-[10px] rounded-[2px]", !colours && k !== 4 && "bg-muted")}
      style={colours ? { backgroundColor: rgb(colours[k]!) } : k === 4 ? { backgroundColor: hex(step.face) } : undefined} />)}
  </Pressable>;
}

type Live = { found: boolean; progress: number; hint: Hint };
type Status = "starting" | "live" | "none";

/** Whether the app is in front: the camera is let go of in the background. */
function useForeground() {
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * The camera's picture and the faces read so far. A face found in it is drawn with the colours read, and read on its
 * own once it stays still, provided its centre is one not read yet; "Read this face" reads it at once, from the guide
 * in the middle when no face is found.
 */
function CameraScan({ onRead, onHand }: { onRead: (samples: Rgb[]) => void; onHand: () => void }) {
  const colors = useColors(),
    foreground = useForeground(),
    web = useRef<WebView>(null),
    [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState<Status>("starting"),
    [cameras, setCameras] = useState(0),
    [live, setLive] = useState<Live>({ found: false, progress: 0, hint: null }),
    [faces, setFaces] = useState<(Rgb[] | null)[]>(ORDER.map(() => null)),
    [redo, setRedo] = useState<number | null>(null),
    [flash, setFlash] = useState(false),
    [side, setSide] = useState(0);
  const current = redo ?? faces.findIndex(f => !f),
    step = ORDER[current] ?? ORDER[0]!,
    // Kept current for the messages of the page.
    latest = useRef({ faces, current });
  latest.current = { faces, current };
  const send = (message: object) => web.current?.injectJavaScript(`window.__scan&&window.__scan(${JSON.stringify(message)});true;`);
  // The page learns the centres read already (the face shown again waits) and whether a face is still awaited.
  const state = () => send({ type: "state", known: faces.flatMap((f, i) => f && i !== current ? [f[4]!] : []), active: current >= 0, primary: colors.primary });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(state, [faces, current, colors.primary]);

  const capture = (colours: Rgb[]) => {
    const { faces, current } = latest.current;
    if (current < 0) return;
    const next = faces.map((f, i) => i === current ? colours : f);
    setFaces(next);
    setRedo(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 450);
    // Cubix's sticker order: U, D, F, B, R, L.
    if (next.every(Boolean)) onRead(FACES.flatMap(face => next[ORDER.findIndex(o => o.face === face)]!));
  };
  const receive = (event: WebViewMessageEvent) => {
    let data: { type: string; state?: Status; cameras?: number; colours?: Rgb[] } & Partial<Live>;
    try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (data.type === "ready") state();
    else if (data.type === "status") { setStatus(data.state!); setCameras(data.cameras ?? 0); }
    else if (data.type === "live") setLive({ found: !!data.found, progress: data.progress ?? 0, hint: data.hint ?? null });
    else if (data.type === "face" && data.colours?.length === 9) capture(data.colours);
  };

  if (status === "none")
    return <Empty className="flex-1">
      <View className="size-12 items-center justify-center rounded-2xl bg-muted"><Icon as={CameraOff} size={22} className="text-muted-foreground" /></View>
      <Text className="text-lg font-semibold tracking-tight">{tr("No camera")}</Text>
      <Text className="max-w-xs text-center text-sm text-muted-foreground">{tr("Allow the camera to read your cube, or enter its colours by hand.")}</Text>
      <View className="w-full max-w-xs gap-2 pt-2">
        <Button size="lg" className="h-12" onPress={onHand}><Icon as={Paintbrush} size={18} /><Text>{tr("Enter the colours by hand")}</Text></Button>
        <View className="flex-row gap-2">
          <Button variant="outline" size="lg" className="h-12 flex-1" onPress={() => { setStatus("starting"); setAttempt(a => a + 1); }}><Icon as={RefreshCw} size={17} /><Text>{tr("Try again")}</Text></Button>
          <Button variant="outline" size="lg" className="h-12 flex-1" onPress={() => void Linking.openSettings()}><Icon as={Settings} size={17} /><Text>{tr("Settings")}</Text></Button>
        </View>
      </View>
    </Empty>;

  const holding = live.found && live.progress > 0,
    done = faces.filter(Boolean).length,
    ring = 2 * Math.PI * 7,
    turn = step.left && redo === null;
  return <View className="min-h-0 flex-1 gap-4">
    <View className="min-h-0 flex-1 items-center justify-center" onLayout={e => { const { width, height } = e.nativeEvent.layout; setSide(Math.floor(Math.min(width, height))); }}>
      {side > 0 && <View className={cn("overflow-hidden rounded-2xl border bg-muted", flash ? "border-4 border-success" : "border-border")} style={{ width: side, height: side }}>
        {foreground && <WebView key={attempt} ref={web} source={{ html: SCAN_HTML, baseUrl: "https://cubix.local/" }} originWhitelist={["*"]}
          javaScriptEnabled mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback domStorageEnabled={false} cacheEnabled={false}
          mixedContentMode="never" scrollEnabled={false} overScrollMode="never" style={{ flex: 1, backgroundColor: "transparent" }}
          onMessage={receive} onRenderProcessGone={() => setAttempt(a => a + 1)} onError={() => setStatus("none")} />}
        {status === "starting" && <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Text className="text-sm text-muted-foreground">{tr("Starting your camera…")}</Text>
        </View>}
        {status === "live" && <View pointerEvents="none" className="absolute inset-x-0 bottom-3 items-center px-3" accessibilityLiveRegion="polite">
          <Badge variant="secondary" className="h-8 gap-1.5 rounded-full bg-background/85 px-3">
            {holding ? <Svg width={16} height={16} viewBox="0 0 18 18" style={{ transform: [{ rotate: "-90deg" }] }}>
              <Circle cx={9} cy={9} r={7} fill="none" stroke={colors.foreground} strokeOpacity={0.2} strokeWidth={2.5} />
              <Circle cx={9} cy={9} r={7} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${ring * live.progress} ${ring}`} />
            </Svg> : live.hint ? <Icon as={TriangleAlert} size={14} className="text-warning" /> : null}
            <Text className="text-xs font-medium text-foreground">{holding || !live.hint ? tr("Hold still…") : tr(HINT[live.hint])}</Text>
          </Badge>
        </View>}
        {cameras > 1 && <Button variant="secondary" size="icon" accessibilityLabel={tr("Switch camera")} className="absolute top-3 right-3 size-11 rounded-full bg-background/85"
          onPress={() => send({ type: "switch" })}>
          <Icon as={SwitchCamera} size={19} />
        </Button>}
      </View>}
    </View>
    <View className="flex-row items-center gap-4" accessibilityLiveRegion="polite">
      <HoldCube front={step.face} top={step.top} left={turn} size={64} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Label>{tr("Face {0} of {1}", { 0: Math.max(current, 0) + 1, 1: ORDER.length })}</Label>
        <Text className="text-lg font-semibold tracking-tight">{tr(step.title)}</Text>
        <Text className="text-sm text-muted-foreground">{turn ? tr("Turn the whole cube a quarter to the left, yellow still on top") : tr(step.held)}</Text>
      </View>
    </View>
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Label>{tr("Faces read")}</Label>
        <Numeric className="text-xs text-muted-foreground">{done}/{ORDER.length}</Numeric>
      </View>
      <View className="flex-row justify-between">
        {ORDER.map((o, i) => <MiniFace key={o.face} step={o} colours={faces[i] ?? undefined} current={i === current} onPress={faces[i] ? () => setRedo(i) : undefined} />)}
      </View>
    </View>
    <View className="flex-row gap-2">
      <Button variant="outline" size="lg" className="h-12 flex-1" disabled={status !== "live"} onPress={() => send({ type: "read" })}>
        <Icon as={Camera} size={18} /><Text>{tr("Read this face")}</Text>
      </Button>
      <Button variant="ghost" size="lg" className="h-12 flex-1" onPress={onHand}>
        <Icon as={Paintbrush} size={18} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("By hand")}</Text>
      </Button>
    </View>
  </View>;
}

/** Where each face sits on the net (column, row): U above F, D below, L F R B across. */
const PLACE: Record<Face, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
const GAP = 2, FACE_GAP = 6;

/** The colour each sticker of a face is painted, the centre fixed: the net of the cube, as large as the room allows. */
function Net({ colours, doubt, brush, onPaint }: { colours: (Face | null)[]; doubt: boolean[]; brush: Face; onPaint: (slot: number) => void }) {
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const s = room ? Math.max(16, Math.floor(Math.min((room.width - 4 * 2 * GAP - 3 * FACE_GAP) / 12, (room.height - 3 * 2 * GAP - 2 * FACE_GAP) / 9, 40))) : 0,
    face = 3 * s + 2 * GAP;
  return <View className="min-h-0 w-full flex-1 items-center justify-center" onLayout={e => setRoom(e.nativeEvent.layout)}>
    {s > 0 && <View accessibilityLabel={tr("Cube net")} style={{ width: 4 * face + 3 * FACE_GAP, height: 3 * face + 2 * FACE_GAP }}>
      {FACES.map((f, k) => <View key={f} className="absolute flex-row flex-wrap" style={{ left: PLACE[f][0] * (face + FACE_GAP), top: PLACE[f][1] * (face + FACE_GAP), width: face, gap: GAP }}>
        {Array.from({ length: 9 }, (_, i) => {
          const slot = k * 9 + i, colour = colours[slot], unsure = doubt[slot];
          return <Pressable key={i} accessibilityRole="button" accessibilityLabel={unsure ? tr("Check this sticker") : tr("Paint this sticker")} disabled={i === 4} onPress={() => onPaint(slot)}
            className={cn("rounded-[4px] border active:opacity-70", unsure ? "border-2 border-warning" : colour === brush && i !== 4 ? "border-foreground/50" : "border-foreground/15", !colour && "bg-muted")}
            style={{ width: s, height: s, ...(colour && { backgroundColor: hex(colour) }) }}>
            {unsure && <View className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-warning" />}
          </Pressable>;
        })}
      </View>)}
    </View>}
  </View>;
}

/** What is wrong, in a tinted box (the web's destructive alert). */
export function Problem({ children }: { children: string }) {
  return <View accessibilityRole="alert" className="flex-row items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5">
    <Icon as={TriangleAlert} size={16} className="mt-0.5 text-destructive" />
    <Text className="min-w-0 flex-1 text-sm text-destructive">{tr(children)}</Text>
  </View>;
}

/**
 * The colours read, to check and correct on the net, the doubtful ones marked; the solve starts once they make a cube
 * that can be solved.
 */
function Review({ initial, doubt: unsure, onDone, onCamera }: { initial: (Face | null)[]; doubt?: boolean[]; onDone: (colours: Face[]) => void; onCamera?: () => void }) {
  const [colours, setColours] = useState(initial),
    [doubt, setDoubt] = useState(unsure ?? initial.map(() => false)),
    [brush, setBrush] = useState<Face>("U"),
    problem = scanProblem(colours),
    // Nothing painted yet (manual entry): no problem to show before the first sticker.
    blank = colours.every((c, i) => i % 9 === 4 || !c),
    checks = doubt.filter(Boolean).length;
  return <View className="min-h-0 flex-1 items-center gap-3">
    <View className="w-full items-center gap-1">
      <View className="flex-row flex-wrap items-center justify-center gap-2">
        <Text accessibilityRole="header" className="text-base font-semibold tracking-tight">{tr("Check the colours")}</Text>
        {checks > 0 && <Badge className="border-warning/40 bg-warning/15"><Text className="text-xs font-medium text-warning">{checks === 1 ? tr("1 sticker to check") : tr("{0} stickers to check", { 0: checks })}</Text></Badge>}
      </View>
      <Text className="text-center text-sm text-muted-foreground">{tr("Yellow on top, green in front. Pick a colour, then tap the stickers to correct.")}</Text>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel={tr("Colour")} className="flex-row gap-1.5">
      {FACES.map(face => <Pressable key={face} accessibilityRole="radio" accessibilityLabel={tr(COLOUR_NAMES[face])} accessibilityState={{ checked: brush === face }} onPress={() => setBrush(face)}
        className={cn("size-11 items-center justify-center rounded-xl border-2", brush === face ? "border-primary" : "border-transparent")}>
        <View className="size-8 rounded-md border border-foreground/20" style={{ backgroundColor: hex(face) }} />
      </Pressable>)}
    </View>
    <Net colours={colours} doubt={doubt} brush={brush} onPaint={slot => {
      setColours(c => c.map((v, i) => i === slot ? brush : v));
      setDoubt(d => d.map((v, i) => v && i !== slot));
    }} />
    <View className="min-h-12 w-full justify-center">{problem && !blank ? <Problem>{problem}</Problem> : null}</View>
    <View className="w-full flex-row gap-2">
      {onCamera && <Button variant="outline" size="lg" className="h-12 flex-1" onPress={onCamera}><Icon as={Camera} size={18} /><Text>{tr("Read again")}</Text></Button>}
      <Button size="lg" className="h-12 flex-1" disabled={!!problem} onPress={() => onDone(colours as Face[])}><Icon as={Check} size={18} /><Text>{tr("Looks right")}</Text></Button>
    </View>
  </View>;
}

/** Only the centres: the stickers to paint by hand. */
const CENTRES = Array.from({ length: 54 }, (_, i) => (i % 9 === 4 ? FACES[Math.floor(i / 9)]! : null));

/**
 * Reads a cube: by the camera, then on the net; `hand` opens on the net, to paint by hand. `initial`, the colours the
 * cube should have, starts the net when it is painted by hand.
 */
export function CubeScan({ initial, hand = false, onDone }: { initial?: Face[]; hand?: boolean; onDone: (colours: Face[]) => void }) {
  const [read, setRead] = useState<{ colours: (Face | null)[]; doubt?: boolean[]; camera: boolean } | null>(hand ? { colours: initial ?? CENTRES, camera: false } : null);
  if (read)
    return <Review key={read.camera ? "read" : "hand"} initial={read.colours} doubt={read.doubt} onDone={onDone} onCamera={read.camera || !hand ? () => setRead(null) : undefined} />;
  return <CameraScan
    onRead={samples => {
      const cube = readCube(samples);
      setRead({ colours: cube.colours, doubt: cube.confidence.map(c => c < DOUBT), camera: true });
    }}
    onHand={() => setRead({ colours: initial ?? CENTRES, camera: false })} />;
}
