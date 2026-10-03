import * as Haptics from "expo-haptics";
import { Dumbbell, GraduationCap, Timer, UserRound, type LucideIcon } from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { type Tab } from "../state";
import { useTourTarget } from "../tour";

/** The four tabs: the timer first, then practice, learning and the player's own page. */
const TABS: [tab: Tab, label: string, icon: LucideIcon][] = [
  ["timer", "Timer", Timer],
  ["train", "Train", Dumbbell],
  ["learn", "Learn", GraduationCap],
  ["profile", "Profile", UserRound],
];

/**
 * Four icon-only tabs: the current page uses the primary colour. Labels remain available to screen readers.
 * `locked` greys the tabs waiting for the puzzle's course; a tap on them still goes through (it offers to skip it).
 */
export function TabBar({ active: current, locked, onNavigate }: { active: Tab; locked: (tab: Tab) => boolean; onNavigate: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  return <View accessibilityRole="tablist" className="border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
    <View className="h-14 flex-row">
      {TABS.map(([tab, label, I]) => {
        const here = tab === current;
        return <TabButton key={tab} tab={tab} label={label} here={here} locked={locked(tab)} onPress={() => {
          if (tab === current || locked(tab)) { onNavigate(tab); return; }
          void Haptics.selectionAsync().catch(() => {});
          onNavigate(tab);
        }}>
          <Icon as={I} size={24} strokeWidth={here ? 2.25 : 1.9} className={here ? "text-primary" : "text-muted-foreground"} />
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
      className="h-full items-center justify-center">
      {children}
    </Pressable>
  </View>;
}
