import { useAtomValue } from "jotai";
import { Sparkles } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { level } from "../../../src/client/lib/achievements";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { tr } from "../../../src/client/i18n";
import { profileAchievementsAtom } from "../profile";
import { timerRunningAtom, userAtom } from "../state";
import { Numeric } from "./layout";

/**
 * The gain of XP, at the bottom for a few seconds, as the web's (desktop/renderer/xp.tsx): the level's bar appears where
 * it was and grows to where it is; a new level fills it from empty under its name. Only a gain of the same account shows.
 */
export function XpGain() {
  const insets = useSafeAreaInsets();
  const xp = useAtomValue(profileAchievementsAtom)?.xp ?? null, owner = useAtomValue(userAtom)?.id ?? "", running = useAtomValue(timerRunningAtom);
  const last = useRef<{ xp: number; owner: string } | null>(null);
  const [gain, setGain] = useState<{ from: number; to: number } | null>(null);
  const shown = useRef(new Animated.Value(0)).current, width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (xp === null) return;
    const before = last.current;
    last.current = { xp, owner: String(owner) };
    if (!before || before.owner !== String(owner) || xp <= before.xp) return;
    const from = level(before.xp), to = level(xp), up = to.level > from.level;
    setGain({ from: before.xp, to: xp });
    width.setValue(up ? 0 : from.into / from.span);
    Animated.sequence([
      Animated.timing(shown, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.timing(width, { toValue: to.into / to.span, duration: 1000, useNativeDriver: false }),
      Animated.delay(2700),
      Animated.timing(shown, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(({ finished }) => { if (finished) setGain(null); });
  }, [xp, owner, shown, width]);
  if (!gain || running) return null;
  const before = level(gain.from), after = level(gain.to), up = after.level > before.level;
  return <View pointerEvents="none" className="absolute z-50 flex-row justify-center" style={{ bottom: insets.bottom + 84, left: insets.left + 14, right: insets.right + 14 }}>
    <Animated.View accessibilityLiveRegion="polite" className="w-full max-w-[340px] gap-2 rounded-2xl border border-border bg-popover px-4 py-3 shadow-lg"
      style={{ opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <View className="flex-row items-baseline justify-between gap-3">
        <View className="flex-row items-center gap-1.5">
          {up && <Icon as={Sparkles} size={16} className="text-primary" />}
          <Text className="text-sm font-extrabold">{up ? tr("Level up · level {0}", { 0: after.level }) : tr("Level {0}", { 0: after.level })}</Text>
        </View>
        <Numeric className="text-sm font-extrabold text-primary">{tr("+{0} XP", { 0: (gain.to - gain.from).toLocaleString() })}</Numeric>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-muted">
        <Animated.View className="h-full rounded-full bg-primary" style={{ width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
      </View>
      <Numeric className="text-xs font-bold text-muted-foreground">{tr("{0} / {1} XP", { 0: after.into.toLocaleString(), 1: after.span.toLocaleString() })}</Numeric>
    </Animated.View>
  </View>;
}
