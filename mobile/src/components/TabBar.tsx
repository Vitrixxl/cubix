import * as Haptics from "expo-haptics";
import { useAtomValue } from "jotai";
import { Dumbbell, GraduationCap, Timer, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { userAtom, type Tab } from "../state";
import { alpha, useColors } from "../theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { UserAvatar } from "./UserAvatar";
import { useTourTarget } from "../tour";

/** The four tabs: the timer first, then practice, learning and the player's own page. */
const TABS: [tab: Tab, label: string, icon: LucideIcon | null][] = [
  ["timer", "Timer", Timer],
  ["train", "Train", Dumbbell],
  ["learn", "Learn", GraduationCap],
  ["profile", "Profile", null],
];
const INDICATOR = { width: 60, height: 32 };

/**
 * The bottom bar: four tabs, an icon over its word, the current one on a tinted plate that glides from tab to tab.
 * `locked` greys the tabs waiting for the puzzle's course; a tap on them still goes through (it offers to skip it).
 */
export function TabBar({ active: current, locked, onNavigate }: { active: Tab; locked: (tab: Tab) => boolean; onNavigate: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  // The tapped tab lights up at once; the page it opens renders on the next frames, so a heavy page never holds the
  // bar back.
  const [pressed, setPressed] = useState<Tab | null>(null);
  useEffect(() => setPressed(null), [current]);
  const active = pressed ?? current;
  const colors = useColors();
  const reduced = useReducedMotion();
  const user = useAtomValue(userAtom);
  const [width, setWidth] = useState(0);
  const index = TABS.findIndex(([tab]) => tab === active);
  const position = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (reduced) { position.setValue(index); return; }
    const animation = Animated.spring(position, { toValue: index, useNativeDriver: true, damping: 22, stiffness: 260, mass: 0.8 });
    animation.start();
    return () => animation.stop();
  }, [index, position, reduced]);
  const cell = width / TABS.length;
  return <View accessibilityRole="tablist" className="border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
    <View className="h-16 flex-row" onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 8, left: 0, ...INDICATOR, borderRadius: 10, backgroundColor: alpha(colors.primary, 16),
        transform: [{ translateX: position.interpolate({ inputRange: [0, TABS.length - 1], outputRange: [(cell - INDICATOR.width) / 2, (cell - INDICATOR.width) / 2 + cell * (TABS.length - 1)] }) }],
      }} />}
      {TABS.map(([tab, label, I]) => {
        const here = tab === active;
        return <TabButton key={tab} tab={tab} label={label} here={here} locked={locked(tab)} onPress={() => {
          if (tab === current || locked(tab)) { onNavigate(tab); return; }
          void Haptics.selectionAsync().catch(() => {});
          setPressed(tab);
          requestAnimationFrame(() => requestAnimationFrame(() => onNavigate(tab)));
        }}>
          {I ? <Icon as={I} size={21} strokeWidth={here ? 2.25 : 1.9} className={here ? "text-primary" : "text-muted-foreground"} />
            : <View style={{ borderRadius: 999, borderWidth: 1.5, borderColor: here ? colors.primary : "transparent", padding: 1 }}><UserAvatar user={user} size={21} /></View>}
        </TabButton>;
      })}
    </View>
  </View>;
}

/** One tab, tagged `tab:<tab>` for the guided tour. Greyed while the puzzle's course comes first. */
function TabButton({ tab, label, here, locked, onPress, children }: { tab: Tab; label: string; here: boolean; locked: boolean; onPress: () => void; children: ReactNode }) {
  const tour = useTourTarget(`tab:${tab}`);
  return <View {...tour} className="flex-1" style={locked ? { opacity: 0.4 } : undefined}>
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} onPress={onPress}
      className="h-full items-center justify-start gap-1 pt-2">
      <View style={INDICATOR} className="items-center justify-center">{children}</View>
      <Text numberOfLines={1} className={cn("text-xs", here ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{label}</Text>
    </Pressable>
  </View>;
}
