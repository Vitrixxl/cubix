import { Ban, Plus, Undo2 } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { fmtTime } from "../../../../src/client/lib/format";
import type { DuelSolve } from "../../lib/duel";
import type { TimerApi } from "../../hooks/useTimer";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Fade, Numeric, TouchAction, TouchBar } from "../layout";
import { Digits, LiveDigits, digitsSize, responder } from "../Practice";
import { UserAvatar } from "../UserAvatar";
import { said, tr } from "../../../../src/client/i18n";

/**
 * The pieces of a race as the phone draws them (the web's desktop/renderer/duel.tsx and tournaments/format.tsx): the
 * live dot, both players with the score over the strip of rounds, a round as a butterfly, the player's own timer card.
 */

/** A ring going out from its parent and fading, again and again, as a radar would; still under reduced motion. */
export function Ping({ duration = 1800, scale = 2.2, className }: { duration?: number; scale?: number; className?: string }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.cubic) }), -1, false);
    return () => { cancelAnimation(t); t.value = 0; };
  }, [reduced, duration, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 1 + (scale - 1) * t.value }] }));
  if (reduced) return null;
  // The classes go on a plain view: only `style` is sure to reach an animated one.
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}><View className={cn("size-full rounded-full", className)} /></Animated.View>;
}

/** The dot of something live (a timer running), pulsing; `tone` colours it (the accent by default). */
export function LiveDot({ className, tone = "bg-primary" }: { className?: string; tone?: string }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className={cn("size-2", className)}>
    <Ping duration={1200} className={tone} />
    <View className={cn("size-full rounded-full", tone)} />
  </View>;
}

/** A small tag on a time: +2 in the warning colour, DNF in the destructive one. */
export function Tag({ children, tone }: { children: ReactNode; tone: "warning" | "bad" }) {
  return <View className={cn("rounded px-1 py-px", tone === "bad" ? "bg-destructive/15" : "bg-warning/15")}>
    <Text className={cn("text-[10px] font-semibold", tone === "bad" ? "text-destructive" : "text-warning")}>{children}</Text>
  </View>;
}

/** A solve's time as a move list shows it: the better one green, +2 and DNF as small tags. */
export function SolveTime({ r, best = false }: { r: DuelSolve | undefined; best?: boolean }) {
  if (!r) return <Numeric className="text-sm text-muted-foreground/40">–</Numeric>;
  if (r.penalty === "dnf") return <Tag tone="bad">{tr("DNF")}</Tag>;
  return <View className="flex-row items-center gap-1.5">
    {r.penalty === "+2" ? <Tag tone="warning">+2</Tag> : null}
    <Numeric className={cn("text-sm", best && "font-semibold text-success")}>{fmtTime(r.ms + (r.penalty === "+2" ? 2000 : 0))}</Numeric>
  </View>;
}

/** Who took a round or a solve: the player, the other, neither; the one being raced; one still to come. */
export type Cell = "me" | "them" | "tie" | "now" | "";
const CELL: Record<Cell, string> = { me: "bg-primary", them: "bg-muted-foreground", tie: "bg-muted-foreground/40", now: "border-2 border-primary", "": "bg-muted" };
/** The rounds as a strip of short bars, each in the colour of the side that took it, the one being raced outlined. */
export function RoundStrip({ cells, label, className }: { cells: Cell[]; label: string; className?: string }) {
  return <View accessibilityLabel={said(label)} className={cn("min-w-12 flex-1 flex-row gap-1", className)}>
    {cells.map((c, i) => <View key={i} className={cn("h-2.5 flex-1 rounded-full", CELL[c])} />)}
  </View>;
}

/** A player of a race, as the score line shows them: the face, the name, what they are doing under it. */
export type Racer = { name: string; shown?: string; status: string; live?: boolean; turn?: boolean; gone?: boolean; extra?: ReactNode };
function RacerSide({ p, end = false }: { p: Racer; end?: boolean }) {
  return <View className={cn("min-w-0 flex-1 flex-row items-center gap-2", end && "flex-row-reverse", p.gone && "opacity-50")}>
    <UserAvatar user={{ username: p.name, isGuest: false }} size={32} />
    <View className={cn("min-w-0 shrink", end && "items-end")}>
      <Text numberOfLines={1} className="text-[15px] font-bold">{said(p.shown ?? p.name)}</Text>
      <View className={cn("h-4 flex-row items-center gap-1", end && "flex-row-reverse")}>
        {p.live ? <LiveDot className="size-1.5" tone="bg-success" /> : null}
        <Text numberOfLines={1} className={cn("shrink text-xs font-semibold", p.live ? "text-success" : p.turn ? "text-primary" : "text-muted-foreground")}>{said(p.status)}</Text>
        {p.extra}
      </View>
    </View>
  </View>;
}

/**
 * Both players face to face (the player on the left), then the score between them in their colours either side of the
 * strip of rounds; `unit` names what the score counts ("sets") under each number.
 */
export function RaceScore({ players, score, cells, label, unit }: { players: [Racer, Racer]; score: [ReactNode, ReactNode]; cells: Cell[]; label: string; unit?: string }) {
  const number = (value: ReactNode, mine: boolean) => <View className="min-w-6 items-center">
    <Numeric className={cn("text-2xl leading-7 font-extrabold", mine ? "text-primary" : "text-muted-foreground")}>{value}</Numeric>
    {unit ? <Text className="text-[11px] text-muted-foreground">{said(unit)}</Text> : null}
  </View>;
  return <View className="gap-1.5">
    <View className="flex-row items-center justify-between gap-3">
      <RacerSide p={players[0]} />
      <RacerSide p={players[1]} end />
    </View>
    <View className="flex-row items-center gap-2.5">
      {number(score[0], true)}
      <RoundStrip cells={cells} label={label} />
      {number(score[1], false)}
    </View>
  </View>;
}

/** A time on the butterfly: +2 tagged, DNF in red; the winner's bold, the other's muted. */
function FlyTime({ r, won, end = false }: { r: DuelSolve | undefined; won: boolean; end?: boolean }) {
  return <View className={cn("w-14 flex-row items-center gap-1", end ? "justify-start" : "justify-end")}>
    {r?.penalty === "+2" ? <Tag tone="warning">+2</Tag> : null}
    <Numeric numberOfLines={1} className={cn("text-[15px] font-bold", r?.penalty === "dnf" ? "text-destructive" : won ? "text-foreground" : "text-muted-foreground")}>
      {!r ? "" : r.penalty === "dnf" ? tr("DNF") : fmtTime(r.ms + (r.penalty === "+2" ? 2000 : 0))}
    </Numeric>
  </View>;
}
/** A round as a butterfly: the player's time and bar on the left, the other's on the right, the winner's bar filled. */
export function Fly({ n, times, best, current = false }: { n: ReactNode; times: [DuelSolve | undefined, DuelSolve | undefined]; best: number | null; current?: boolean }) {
  const bar = (seat: number) => <View className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
    {best === seat ? <View className={cn("h-full w-full rounded-full", seat ? "bg-muted-foreground" : "bg-primary")} /> : null}
  </View>;
  return <View accessibilityState={{ selected: current }} className="h-6 flex-row items-center gap-2">
    <FlyTime r={times[0]} won={best === 0} />
    {bar(0)}
    <Numeric className={cn("w-6 text-center text-xs", current ? "font-semibold text-primary" : "text-muted-foreground")}>{n}</Numeric>
    {bar(1)}
    <FlyTime r={times[1]} won={best === 1} end />
  </View>;
}

/**
 * The player's own timer as a card: the digits large in the middle (`rest` at rest), the hint under them, and the
 * latest solve's +2, DNF and Redo along its foot. A touch on the card arms the timer, as on the timer page.
 */
export function TimerCard({ timer, rest, hint, disabled, actions, top, className }: {
  timer: TimerApi; rest: string; hint: ReactNode; disabled: boolean; actions?: ReactNode; top?: ReactNode; className?: string;
}) {
  const [area, setArea] = useState({ width: 320, height: 200 });
  const running = timer.phase === "running", size = digitsSize(area, 6, 112);
  return <View className={cn("min-h-0 flex-1 overflow-hidden rounded-3xl bg-card", className)} {...responder(timer, disabled && !running)}>
    <View className="min-h-0 flex-1 items-center justify-center gap-2 px-3"
      onLayout={e => { const { width, height } = e.nativeEvent.layout; setArea(a => a.width === width && a.height === height ? a : { width, height }); }}>
      {top}
      {running ? <LiveDigits startedAt={timer.startedAt} size={size} />
        : <Digits text={timer.phase === "idle" || timer.phase === "stopped" ? rest : "0.000"} phase={timer.phase} size={size} />}
      <Text numberOfLines={1} className={cn("min-h-5 text-sm text-muted-foreground", running && "opacity-0")}>{said(hint)}</Text>
    </View>
    {actions ? <Fade hidden={running}><TouchBar className="px-2 pb-2">{actions}</TouchBar></Fade> : null}
  </View>;
}

/** +2, DNF and Redo on the latest solve, as the foot of a timer card. */
export function SolveActions({ last, onPenalty, canCancel, onCancel }: {
  last: { penalty: string } | null | undefined; onPenalty: (penalty: "+2" | "dnf") => void; canCancel: boolean; onCancel: () => void;
}) {
  return <>
    <TouchAction icon={Plus} label="+2" accessibilityLabel={tr("+2 penalty")} pressed={last?.penalty === "+2"} tone="warning" disabled={!last} onPress={() => onPenalty("+2")} />
    <TouchAction icon={Ban} label={tr("DNF")} accessibilityLabel={tr("Did not finish")} pressed={last?.penalty === "dnf"} tone="bad" disabled={!last} onPress={() => onPenalty("dnf")} />
    <TouchAction icon={Undo2} label={tr("Redo")} accessibilityLabel={tr("Take the solve back and redo it")} disabled={!canCancel} onPress={onCancel} />
  </>;
}

/** A small card of the other player while they solve: the live dot, what they are doing, their time ticking. */
export function OpponentLive({ title, sub, phase, startedAt, rest, gone }: { title: string; sub: string; phase: string; startedAt: number; rest: string; gone?: boolean }) {
  const running = phase === "running";
  return <View className={cn("min-h-14 flex-row items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2", gone && "opacity-50")}>
    {running ? <LiveDot tone="bg-success" /> : <View className="size-2 rounded-full bg-muted-foreground/40" />}
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-sm font-bold">{said(title)}</Text>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">{said(sub)}</Text>
    </View>
    {running ? <LiveDigits startedAt={startedAt} size={26} /> : <Digits text={phase === "idle" ? rest : "0.000"} phase={phase} size={26} />}
  </View>;
}

/** A small heading in capitals over a block: the round, a list's group, a tournament's line. */
export function Cap({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text numberOfLines={2} className={cn("text-xs font-bold tracking-wider text-muted-foreground uppercase", className)} {...props} />;
}

/**
 * A page's side panel docked at its right on a wide screen (a tablet held sideways, a laptop): a card column always
 * visible beside the page, where a phone opens a sheet. Portrait tablets keep the sheet.
 */
export function SidePanel({ className, ...props }: ViewProps) {
  return <View className={cn("my-3 mr-3 w-[360px] gap-3 rounded-[26px] border border-border bg-card p-4", className)} {...props} />;
}
