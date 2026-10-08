import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { fmtTime } from "../../../../src/client/lib/format";
import type { DuelSolve } from "../../lib/duel";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Numeric } from "../layout";
import { UserAvatar } from "../UserAvatar";
import { said, tr } from "../../../../src/client/i18n";

/**
 * The pieces of a race as a game site draws them (the web's desktop/renderer/duel.tsx and tournaments/format.tsx): the
 * live dot, a player's bar over the board, the rounds as a move list, a time with its penalty.
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

/** The dot of something live (a timer running), pulsing in the accent. */
export function LiveDot({ className }: { className?: string }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className={cn("size-2", className)}>
    <Ping duration={1200} className="bg-primary" />
    <View className="size-full rounded-full bg-primary" />
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

/**
 * A player's bar, as over a chess board: the face, the name and the level, what the player is doing under them (with
 * the live dot while solving), the rounds won as dots, and the score in a box on the right, lit while the player's
 * timer is on.
 */
export function PlayerBar({ name, level, status, live = false, won, score, active = false, className }: {
  name: string; level?: string; status: string; live?: boolean;
  /** Each round: won, lost (or drawn), or not raced yet. */
  won: (boolean | null)[];
  score: number; active?: boolean; className?: string;
}) {
  return <View className={cn("min-w-0 flex-row items-center gap-3", className)}>
    <UserAvatar user={{ username: name, isGuest: false }} size={36} />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="min-w-0 flex-row items-baseline gap-2">
        <Text numberOfLines={1} className="shrink text-[15px] font-medium">{name}</Text>
        {level ? <Numeric className="text-xs text-muted-foreground">{level}</Numeric> : null}
      </View>
      <View className="h-4 flex-row items-center gap-1.5">
        {live ? <LiveDot className="size-1.5" /> : null}
        <Text numberOfLines={1} className={cn("shrink text-xs", live ? "text-primary" : "text-muted-foreground")}>{said(status)}</Text>
        <View accessibilityLabel={tr("{0} rounds won", { 0: score })} className="ml-auto flex-row gap-1">
          {won.map((w, i) => <View key={i} className={cn("size-1.5 rounded-full", w ? "bg-success" : w === false ? "bg-muted-foreground/35" : "border border-border")} />)}
        </View>
      </View>
    </View>
    <View className={cn("h-11 min-w-12 items-center justify-center rounded-lg px-3", active ? "bg-foreground" : "bg-muted")}>
      <Numeric className={cn("text-2xl font-semibold", active ? "text-background" : "text-muted-foreground")}>{score}</Numeric>
    </View>
  </View>;
}

export interface Move {
  /** The number of the round. */
  n: number;
  results: [DuelSolve | undefined, DuelSolve | undefined];
  /** The seat with the better time, if any. */
  best: number | null;
  /** The row being raced. */
  current?: boolean;
}

/** The rounds as a move list: the number muted, each player's time (the better in green), the row being raced marked; `foot` closes it. */
export function MoveList({ names, rows, foot, label }: {
  names: [string, string]; rows: Move[]; label: string;
  foot?: { label: string; values: [string, string]; best: number | null };
}) {
  const cell = "min-w-0 flex-1 flex-row items-center justify-end px-2";
  return <View accessibilityLabel={label}>
    <View className="h-8 flex-row items-center border-b border-border">
      <Text className="w-11 px-2 text-xs font-medium text-muted-foreground">#</Text>
      {names.map((name, i) => <View key={i} className={cell}><Text numberOfLines={1} className="text-xs font-medium text-muted-foreground">{name}</Text></View>)}
    </View>
    {rows.map(row => <View key={row.n} accessibilityState={{ selected: row.current }} className={cn("h-9 flex-row items-center rounded-md", row.current && "bg-muted/60")}>
      <Numeric className="w-11 px-2 text-xs text-muted-foreground">{row.n}</Numeric>
      {row.results.map((r, seat) => <View key={seat} className={cell}><SolveTime r={r} best={row.best === seat} /></View>)}
    </View>)}
    {foot ? <View className="h-10 flex-row items-center border-t border-border">
      <Text className="w-11 px-2 text-xs font-medium text-muted-foreground">{foot.label}</Text>
      {foot.values.map((v, seat) => <View key={seat} className={cell}>
        <Numeric className={cn("text-sm font-semibold", foot.best === seat ? "text-success" : v === "–" && "text-muted-foreground/40")}>{v}</Numeric>
      </View>)}
    </View> : null}
  </View>;
}
