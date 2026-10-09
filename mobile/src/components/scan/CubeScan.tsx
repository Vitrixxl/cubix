import { Camera, CameraOff, Check, Paintbrush, RefreshCw, Settings, SwitchCamera, TriangleAlert, Undo2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import Svg, { G, Path, Polygon } from "react-native-svg";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { FACES, slotsFor, type Face, type Vec3 } from "../../../../src/shared/cube";
import { GREY, HELD_HEX } from "../../../../src/shared/cubeAppearance";
import { cubeSamples, readCube, resolve, scanColour, scanProblem, scanRefs, scanStickers, type Rgb } from "../../../../src/client/lib/cubeScan";
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

/**
 * The cube read face by face for the assisted solve, as the web's (desktop/renderer/CubeScan.tsx): each face asked for
 * by its centre's colour and held any way round, found wherever it stands and read on a tap, then every colour
 * checked on the cube's net, where a sticker read wrong is painted over. Without a camera, the net is painted by hand.
 *
 * The camera runs in a WebView (scripts/scan-entry.ts, built into src/scan/scan-html.ts by scripts/build-scan.ts) with
 * the web's own face reader; it posts each face read, the app keeps the faces, the instructions and the net.
 */

const UNKNOWN = `#${GREY.toString(16)}`;
export const hex = (face: Face) => `#${HELD_HEX[face].toString(16).padStart(6, "0")}`;

/**
 * The faces in the order they are shown (`SCAN_FACES`, the lab's), each held any way round: `cubeSamples` finds how
 * each one was turned. `top` is on top of the cube drawn for it, and `turn` how it comes from the last one when by a
 * quarter turn of the whole cube (to the right, or tipped back).
 */
const ORDER: { face: Face; top: Face; title: string; turn?: "right" | "back" }[] = [
  { face: "U", top: "B", title: "Yellow face to the camera" },
  { face: "R", top: "U", title: "Orange face to the camera" },
  { face: "L", top: "U", title: "Red face to the camera" },
  { face: "B", top: "U", title: "Blue face to the camera", turn: "right" },
  { face: "F", top: "U", title: "Green face to the camera" },
  { face: "D", top: "F", title: "White face to the camera", turn: "back" },
];
/** Below this, a sticker read is marked to check. */
const DOUBT = 0.8;

/** Each face's outward direction, to find the side a held cube shows on the right. */
const NORMAL = Object.fromEntries(FACES.map((f, i) => [f, slotsFor(3)[i * 9 + 4]!.n])) as Record<Face, Vec3>;
const rightOf = (front: Face, top: Face) => {
  const [a, b] = [NORMAL[top], NORMAL[front]],
    n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return FACES.find(f => NORMAL[f].every((v, k) => v === n[k]))!;
};

const SLOTS = slotsFor(3),
  neg = ([x, y, z]: Vec3): Vec3 => [-x, -y, -z];
/** The sticker (Cubix's index) of the face of normal `n` at column `i`, row `j`, its columns along `u`, its rows along `v`. */
const stickerAt = (n: Vec3, u: Vec3, v: Vec3, i: number, j: number) => {
  const p = n.map((x, k) => x + u[k]! * (i - 1) + v[k]! * (j - 1));
  return SLOTS.findIndex(s => s.n.every((x, k) => x === n[k]) && s.p.every((x, k) => x === p[k]));
};

/**
 * A cube drawn as it should be held: `front` to the camera, `top` on top, in the colours read so far (see
 * `scanStickers`), grey where not read yet; an arrow for the quarter turn that gets there.
 */
function HoldCube({ front, top, turn, size, stickers }: { front: Face; top: Face; turn?: "right" | "back"; size: number; stickers: (Face | null)[] }) {
  const colors = useColors();
  type P = [number, number];
  const [f, t, r] = [NORMAL[front], NORMAL[top], NORMAL[rightOf(front, top)]];
  const faces: [string, P[], number, Vec3, Vec3, Vec3][] = [
    ["t", [[14, 34], [64, 34], [86, 14], [36, 14]], 1, t, r, neg(f)],
    ["r", [[64, 34], [86, 14], [86, 64], [64, 84]], 0.6, r, neg(f), neg(t)],
    ["f", [[14, 34], [64, 34], [64, 84], [14, 84]], 1, f, r, neg(t)],
  ];
  // The corners of a sticker, from the face's four (top left, top right, bottom right, bottom left).
  const at = ([a, b, c, d]: P[], s: number, t: number) => [
    (1 - t) * ((1 - s) * a![0] + s * b![0]) + t * ((1 - s) * d![0] + s * c![0]),
    (1 - t) * ((1 - s) * a![1] + s * b![1]) + t * ((1 - s) * d![1] + s * c![1]),
  ].map(v => v.toFixed(2)).join(",");
  return <Svg width={size} height={size} viewBox="0 0 100 100">
    {faces.map(([face, quad, light, n, u, v]) => Array.from({ length: 9 }, (_, k) => {
      const [i, j] = [k % 3, Math.floor(k / 3)], e = 0.06, sticker = stickers[stickerAt(n, u, v, i, j)];
      return <Polygon key={`${face}${k}`} points={[at(quad, (i + e) / 3, (j + e) / 3), at(quad, (i + 1 - e) / 3, (j + e) / 3), at(quad, (i + 1 - e) / 3, (j + 1 - e) / 3), at(quad, (i + e) / 3, (j + 1 - e) / 3)].join(" ")}
        fill={sticker ? hex(sticker) : UNKNOWN} fillOpacity={light} stroke={colors.foreground} strokeOpacity={0.15} strokeWidth={0.6} strokeLinejoin="round" />;
    }))}
    {turn && <G fill="none" stroke={colors.primary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      {turn === "right" ? <><Path d="M 18 92 Q 50 100 78 92" /><Path d="M 71 86 L 79 92 L 70 97" /></> : <><Path d="M 6 80 Q 1 57 6 34" /><Path d="M 1 41 L 6 33 L 11 41" /></>}
    </G>}
  </Svg>;
}

/** A face read so far, small: its nine colours, or its centre's colour while it waits; a tap reads a read one again. */
function MiniFace({ step, colours, current, onPress }: { step: (typeof ORDER)[number]; colours?: Face[]; current: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={colours ? tr("{0}: read this face again", { 0: tr(step.title) }) : tr(step.title)} accessibilityState={{ disabled: !onPress, selected: current }}
    disabled={!onPress} onPress={onPress}
    className={cn("size-11 flex-row flex-wrap content-center justify-center gap-px rounded-lg border p-[3px]", current ? "border-2 border-primary p-[2px]" : colours ? "border-success/60" : "border-border")}>
    {Array.from({ length: 9 }, (_, k) => <View key={k} className={cn("size-[10px] rounded-[2px]", !colours && k !== 4 && "bg-muted")}
      style={colours ? { backgroundColor: hex(colours[k]!) } : k === 4 ? { backgroundColor: hex(step.face) } : undefined} />)}
  </Pressable>;
}

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
 * The camera's picture with the face found drawn on it, each cell marked with the colour read there (nothing while no
 * face is found, and nothing to read), and the faces read so far. "Read this face" reads the face asked for, the undo button the last one again. As in the lab, the face asked
 * for's centre is its colour's look while it is held; once read, it stays that colour's look and the faces read before
 * are sorted again.
 */
function CameraScan({ onRead, onHand }: { onRead: (samples: Rgb[]) => void; onHand: () => void }) {
  const foreground = useForeground(),
    web = useRef<WebView>(null),
    [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState<Status>("starting"),
    [cameras, setCameras] = useState(0),
    [dark, setDark] = useState(false),
    [found, setFound] = useState(false),
    [faces, setFaces] = useState<(Rgb[] | null)[]>(ORDER.map(() => null)),
    [redo, setRedo] = useState<number | null>(null),
    [flash, setFlash] = useState(false),
    [side, setSide] = useState(0);
  const current = redo ?? faces.findIndex(f => !f),
    step = ORDER[current] ?? ORDER[0]!,
    refs = scanRefs(faces),
    last = faces.findLastIndex(Boolean),
    // Kept current for the messages of the page.
    latest = useRef({ faces, current });
  latest.current = { faces, current };
  const send = (message: object) => web.current?.injectJavaScript(`window.__scan&&window.__scan(${JSON.stringify(message)});true;`);
  // The page learns each colour's look and the face asked for.
  const state = () => send({ type: "state", refs, want: current >= 0 ? step.face : null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(state, [faces, current]);

  const capture = (colours: Rgb[]) => {
    const { faces, current } = latest.current;
    if (current < 0) return;
    const next = faces.map((f, i) => i === current ? colours : f);
    setFaces(next);
    setRedo(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 450);
    if (next.every(Boolean)) onRead(cubeSamples(next as Rgb[][]));
  };
  /** The last face read, read again. */
  const undo = () => {
    if (last < 0) return;
    setFaces(faces.map((f, i) => i === last ? null : f));
    setRedo(null);
  };
  const receive = (event: WebViewMessageEvent) => {
    let data: { type: string; state?: Status; cameras?: number; colours?: Rgb[]; dark?: boolean; found?: boolean };
    try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (data.type === "ready") state();
    else if (data.type === "status") { setStatus(data.state!); setCameras(data.cameras ?? 0); }
    else if (data.type === "live") { setDark(!!data.dark); setFound(!!data.found); }
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

  const done = faces.filter(Boolean).length,
    turn = redo === null ? step.turn : undefined;
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
            {dark && <Icon as={TriangleAlert} size={14} className="text-warning" />}
            <Text className="text-xs font-medium text-foreground">{dark ? tr("More light would help: face a lamp or a window.") : found ? tr("Face found: read it.") : tr("Show the whole face to the camera.")}</Text>
          </Badge>
        </View>}
        {cameras > 1 && <Button variant="secondary" size="icon" accessibilityLabel={tr("Switch camera")} className="absolute top-3 right-3 size-11 rounded-full bg-background/85"
          onPress={() => send({ type: "switch" })}>
          <Icon as={SwitchCamera} size={19} />
        </Button>}
      </View>}
    </View>
    <View className="flex-row items-center gap-4" accessibilityLiveRegion="polite">
      <HoldCube front={step.face} top={step.top} turn={turn} size={64} stickers={scanStickers(faces, refs)} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Label>{tr("Face {0} of {1}", { 0: Math.max(current, 0) + 1, 1: ORDER.length })}</Label>
        <Text className="text-lg font-semibold tracking-tight">{tr(step.title)}</Text>
      </View>
    </View>
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Label>{tr("Faces read")}</Label>
        <Numeric className="text-xs text-muted-foreground">{done}/{ORDER.length}</Numeric>
      </View>
      <View className="flex-row justify-between">
        {ORDER.map((o, i) => <MiniFace key={o.face} step={o} colours={faces[i]?.map(c => scanColour(c, refs))} current={i === current} onPress={faces[i] ? () => setRedo(i) : undefined} />)}
      </View>
    </View>
    <View className="flex-row gap-2">
      <Button size="lg" className="h-12 flex-1" disabled={status !== "live" || !found} onPress={() => send({ type: "read" })}>
        <Icon as={Camera} size={18} /><Text>{tr("Read this face")}</Text>
      </Button>
      <Button variant="outline" size="icon" className="size-12" accessibilityLabel={tr("Read the last face again")} disabled={last < 0} onPress={undo}>
        <Icon as={Undo2} size={18} />
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
      // The colours compared with each other, as the lab does; should they make no real cube, the real cube closest
      // to them, its doubtful stickers marked.
      const colours = resolve(samples);
      if (!scanProblem(colours)) return setRead({ colours, camera: true });
      const cube = readCube(samples);
      setRead({ colours: cube.colours, doubt: cube.confidence.map(c => c < DOUBT), camera: true });
    }}
    onHand={() => setRead({ colours: initial ?? CENTRES, camera: false })} />;
}
