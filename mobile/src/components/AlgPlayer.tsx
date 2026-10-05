import { ChevronFirst, ChevronLeft, ChevronRight, Focus, Pause, Play, Rotate3d, RotateCcw, StepBack, StepForward } from "lucide-react-native";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { PanResponder, Pressable, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Polygon, Polyline } from "react-native-svg";
import { AlgPlayer, algScene, readAlg, speedLabel, type PlayerOptions } from "../../../src/client/lib/algPlayer";
import type { CubeMask } from "../../../src/shared/cubeAppearance";
import { cubeViewRadius } from "../../../src/shared/cubeScene";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Choice, Numeric } from "./layout";
import { Sheet } from "./Sheet";

/**
 * The 3D algorithm player, as the web app's (desktop/renderer/AlgPlayer.tsx): the case on the cube, the algorithm
 * played move by move, its current move lit in the written algorithm, and the controls. The logic is shared
 * (`src/client/lib/algPlayer`); the cube is drawn with react-native-svg from the same shapes as the web canvas.
 */

/** A player for `alg` on a cube of `size`, or null where it cannot be played (other puzzles, unknown moves). */
export function useAlgPlayer(alg: string, size: number | null | undefined, mask: CubeMask = "full", options: PlayerOptions & { setup?: string } = {}) {
  const { setup, autoplay, loop, speed, view } = options;
  const player = useMemo(() => {
    const scene = size ? algScene(alg, size, mask, setup) : null;
    return scene ? new AlgPlayer(scene, { autoplay, loop, speed, view }) : null;
    // The view and speed are read once: a new algorithm starts a new player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alg, size, mask, setup, autoplay, loop]);
  useEffect(() => () => player?.dispose(), [player]);
  return player;
}
/** The playback, re-rendering on each of its frames. */
export const usePlayback = (player: AlgPlayer) => useSyncExternalStore(player.subscribe, player.getSnapshot);

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");
/** The cube: drag to turn it, double-tap to see it from the start again. */
export function PlayerCube({ player, size }: { player: AlgPlayer; size: number }) {
  // Every change of the player (a frame, a turn of the view) redraws.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => player.subscribe(redraw), [player]);
  const last = useRef<{ x: number; y: number } | null>(null), tap = useRef(0);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => { last.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; },
    onPanResponderMove: event => {
      const { pageX, pageY } = event.nativeEvent, from = last.current;
      if (!from) return;
      player.rotate((pageX - from.x) * 0.012, (pageY - from.y) * 0.012);
      last.current = { x: pageX, y: pageY };
    },
    onPanResponderRelease: (_, gesture) => {
      last.current = null;
      if (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6) return;
      const now = Date.now();
      if (now - tap.current < 320) { player.resetView(); tap.current = 0; } else tap.current = now;
    },
  }), [player]);
  const unit = 60 / cubeViewRadius(player.scene);
  const points = (list: number[][]) => list.map(([x, y]) => `${(60 + x! * unit).toFixed(2)},${(60 - y! * unit).toFixed(2)}`).join(" ");
  return <View {...responder.panHandlers} accessibilityRole="image" accessibilityLabel="3D cube: drag to turn it, double-tap to reset" style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 120 120">
      {player.shapes().map((shape, i) => shape.line
        ? <Polyline key={i} points={points(shape.points)} fill="none" stroke={hex(shape.color)} strokeWidth={120 / size} />
        : <Polygon key={i} points={points(shape.points)} fill={hex(shape.color)} />)}
      <Pulse player={player} unit={unit} />
    </Svg>
  </View>;
}

/** The glow of `AlgPlayer.showFront`, as the web canvas draws it: the front face lit, two waves spreading from its centre. */
function Pulse({ player, unit }: { player: AlgPlayer; unit: number }) {
  const pulse = player.pulse();
  if (!pulse) return null;
  const at = (v: number[]) => [60 + v[0]! * unit, 60 - v[1]! * unit] as const,
    [cx, cy] = at(pulse.centre),
    corners = pulse.corners.map(at),
    reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy))),
    outline = corners.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
    fade = 1 - pulse.t;
  return <G>
    <Defs><ClipPath id="front"><Polygon points={outline} /></ClipPath></Defs>
    <Polygon points={outline} fill="#fff" fillOpacity={0.22 * fade} stroke="#fff" strokeOpacity={0.8 * fade} strokeWidth={1} />
    <G clipPath="url(#front)">
      {[0, 0.3].map(delay => {
        const t = (pulse.t - delay) / (1 - delay);
        return t > 0 ? <Circle key={delay} cx={cx} cy={cy} r={t * reach} fill="none" stroke="#fff" strokeOpacity={0.55 * (1 - t)} strokeWidth={reach * 0.18} /> : null;
      })}
    </G>
  </G>;
}

/** Under the cube: show the face to hold in front (it glows), and put the cube back as it started once it has been turned. */
function ViewButtons({ player }: { player: AlgPlayer }) {
  const turned = useSyncExternalStore(player.subscribe, player.turned);
  return <View className="flex-row justify-center gap-2">
    <Button variant="secondary" size="lg" onPress={player.showFront} className="gap-2">
      <Icon as={Focus} size={18} className="text-secondary-foreground" />
      <Text>Show front</Text>
    </Button>
    {turned && <Button variant="secondary" size="lg" onPress={player.resetView} className="gap-2">
      <Icon as={Rotate3d} size={18} className="text-secondary-foreground" />
      <Text>Reset view</Text>
    </Button>}
  </View>;
}

/** The written algorithm, its brackets muted, the move being played lit; a tap on a move turns it. */
export function PlayerAlg({ player, text, size = 18 }: { player: AlgPlayer | null; text: string; size?: number }) {
  const words = useMemo(() => readAlg(text).words, [text]);
  return player ? <LitWords player={player} words={words} size={size} /> : <Words words={words} size={size} current={-1} />;
}
function LitWords({ player, words, size }: { player: AlgPlayer; words: ReturnType<typeof readAlg>["words"]; size: number }) {
  usePlayback(player);
  return <Words words={words} size={size} current={player.current()} onMove={player.playSource} />;
}
function Words({ words, size, current, onMove }: { words: ReturnType<typeof readAlg>["words"]; size: number; current: number; onMove?: (move: number) => void }) {
  const style = { fontSize: size, lineHeight: Math.round(size * 1.35) };
  return <View className="min-w-0 flex-row flex-wrap" style={{ columnGap: size * 0.4, rowGap: size * 0.25 }}>
    {words.map((word, i) => <View key={i} className="flex-row">
      {word.map((part, j) => part.move === undefined
        ? <Text key={j} className="font-sans font-medium text-muted-foreground" style={style}>{part.text}</Text>
        : <Pressable key={j} disabled={!onMove} onPress={() => onMove?.(part.move!)} accessibilityRole="button" accessibilityLabel={`Move ${part.text}`}
          accessibilityState={{ selected: part.move === current }} hitSlop={4}
          className={cn("rounded-[4px] px-[2px]", part.move === current && "bg-primary/15")}>
          <Text className={cn("font-sans font-medium tracking-tight", part.move === current && "text-primary")} style={style}>{part.text}</Text>
        </Pressable>)}
    </View>)}
  </View>;
}

/** The transport, every target 44 dp: restart, step back, play or pause, step forward, the speed; the scrubber under it. */
export function PlayerControls({ player }: { player: AlgPlayer }) {
  const p = usePlayback(player), total = player.total;
  const button = (label: string, icon: typeof Play, onPress: () => void, disabled = false, primary = false) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      className={cn("size-11 items-center justify-center rounded-lg", primary ? "bg-primary active:bg-primary/85" : "active:bg-muted/60", disabled && "opacity-40")}>
      <Icon as={icon} size={19} className={primary ? "text-primary-foreground" : "text-muted-foreground"} />
    </Pressable>;
  const ended = p.position >= total;
  return <View className="gap-1">
    <View className="flex-row items-center justify-between">
      {button("Restart", ChevronFirst, player.restart, p.position === 0 && !p.playing)}
      {button("Previous move", StepBack, player.stepBack, p.target === 0)}
      {button(p.playing ? "Pause" : ended ? "Play again" : "Play", p.playing ? Pause : ended ? RotateCcw : Play, player.toggle, false, true)}
      {button("Next move", StepForward, player.stepForward, p.target >= total)}
      <Pressable accessibilityRole="button" accessibilityLabel={`Speed ${speedLabel(p.speed)}`} onPress={player.cycleSpeed} className="h-11 min-w-11 items-center justify-center rounded-lg px-2 active:bg-muted/60">
        <Numeric className="text-sm text-muted-foreground">{speedLabel(p.speed)}</Numeric>
      </Pressable>
    </View>
    <View className="flex-row items-center gap-3">
      <Scrubber value={p.position} total={total} onSeek={(at, settle) => player.seek(at, settle)} />
      <Numeric className="w-12 text-right text-xs text-muted-foreground">{Math.floor(Math.round(p.position * 10) / 10)} / {total}</Numeric>
    </View>
  </View>;
}

/** The progress bar: drag along it (or tap) to go anywhere in the algorithm; let go, it settles on a whole move. */
function Scrubber({ value, total, onSeek }: { value: number; total: number; onSeek: (position: number, settle: boolean) => void }) {
  const [width, setWidth] = useState(0);
  const seek = useRef(onSeek);
  seek.current = onSeek;
  const at = (x: number) => (width ? Math.max(0, Math.min(1, x / width)) * total : 0);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => seek.current(at(event.nativeEvent.locationX), false),
    onPanResponderMove: event => seek.current(at(event.nativeEvent.locationX), false),
    onPanResponderRelease: event => seek.current(at(event.nativeEvent.locationX), true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [width, total]);
  const ratio = total ? value / total : 0;
  return <View {...responder.panHandlers} onLayout={event => setWidth(event.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel="Moves played"
    accessibilityValue={{ min: 0, max: total, now: Math.round(value) }} className="h-11 flex-1 justify-center">
    <View pointerEvents="none" className="h-1 overflow-hidden rounded-full bg-muted">
      <View className="h-full bg-primary" style={{ width: `${ratio * 100}%` }} />
    </View>
    <View pointerEvents="none" className="absolute size-4 rounded-full border border-primary bg-background" style={{ left: Math.max(0, ratio * width - 8) }} />
  </View>;
}

/** An algorithm the player can show: its name, its ways to play it (the first one first), and the cube it is on. */
export interface PlayItem { key: string; name: string; detail?: string; context?: string; algs: string[]; note?: string; size: number; mask: CubeMask; setup?: string }

/**
 * A list of algorithms in 3D, in a sheet: the one shown with the previous and next a tap away, its alternatives, the
 * cube, the controls and how to hold it. Dragging the cube turns it rather than the sheet.
 */
export function AlgPlayerSheet({ items, index, onIndex, onClose, choice: initial = 0 }: {
  items: PlayItem[]; index: number | null; onIndex: (index: number) => void; onClose: () => void;
  /** The way to play it shown first: 0 the main algorithm, then its alternatives. */
  choice?: number;
}) {
  const [choice, setChoice] = useState(initial);
  // The last algorithm stays shown while the sheet goes away; opening it again starts on the choice asked.
  const [shown, setShown] = useState(index ?? 0), [open, setOpen] = useState(index !== null);
  if (index !== null && (index !== shown || !open)) { setShown(index); setChoice(open && index !== shown ? 0 : initial); setOpen(true); }
  if (index === null && open) setOpen(false);
  const item = items[shown];
  return <Sheet open={index !== null} onClose={onClose} title={item?.name ?? "Algorithm"} hideTitle scroll contentPanning={false} contentClassName="gap-3">
    {item ? <PlayerBody key={`${item.key}:${choice}`} item={item} choice={choice} onChoice={setChoice} count={items.length} index={shown} onIndex={i => { setChoice(0); onIndex(i); }} /> : null}
  </Sheet>;
}

function PlayerBody({ item, choice, onChoice, count, index, onIndex }: { item: PlayItem; choice: number; onChoice: (choice: number) => void; count: number; index: number; onIndex: (index: number) => void }) {
  const alg = item.algs[choice] ?? item.algs[0]!;
  const player = useAlgPlayer(alg, item.size, item.mask, { setup: item.setup });
  const step = (label: string, icon: typeof Play, target: number) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={target < 0 || target >= count} onPress={() => onIndex(target)}
      className={cn("size-11 items-center justify-center rounded-lg active:bg-muted/60", (target < 0 || target >= count) && "opacity-40")}>
      <Icon as={icon} size={18} className="text-muted-foreground" />
    </Pressable>;
  return <>
    <View className="flex-row items-center gap-1">
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text numberOfLines={1} accessibilityRole="header" className="shrink font-sans text-lg font-semibold tracking-tight">{item.name}</Text>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">{item.detail ?? item.context}</Text>
      </View>
      {count > 1 && <>
        {step("Previous algorithm", ChevronLeft, index - 1)}
        <Numeric className="min-w-10 text-center text-xs text-muted-foreground">{index + 1} / {count}</Numeric>
        {step("Next algorithm", ChevronRight, index + 1)}
      </>}
    </View>
    {player && <View className="items-center"><PlayerCube player={player} size={250} /></View>}
    {player && <ViewButtons player={player} />}
    {player && <PlayerControls player={player} />}
    {item.algs.length > 1 && <Choice label="Algorithm" value={String(choice)} onChange={id => onChoice(Number(id))}
      options={item.algs.map((_, i) => ({ id: String(i), label: i ? `Alternative ${i}` : "Main" }))} />}
    <PlayerAlg player={player} text={alg} size={19} />
    {item.note ? <Text className="text-sm leading-[20px] text-muted-foreground">{item.note}</Text> : null}
  </>;
}
