import * as Haptics from "expo-haptics";
import { useAtomValue } from "jotai";
import { Boxes, Dumbbell, GraduationCap, Headset, Swords, Timer, type LucideIcon } from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { userAtom, type Tab } from "../state";
import { useTourTarget } from "../tour";
import { UserAvatar } from "./UserAvatar";
import { tr } from "../../../src/client/i18n";

/** The web phone's tabs, the account last (its face rather than an icon). Seven share a phone's width: each takes a short name,
 * its letters a little smaller where a language's word is longer. */
const TABS: [tab: Tab, label: string, icon: LucideIcon | null][] = [
  ["timer", "Timer", Timer],
  ["algorithms", "Algs", Boxes],
  ["learn", "Learn", GraduationCap],
  ["train", "Train", Dumbbell],
  ["duel", "Duel", Swords],
  ["coaching", "Coach", Headset],
  ["profile", "Account", null],
];

/**
 * The bottom bar: an icon over a short name; the current tab's icon sits in a tinted pill. `waiting` counts what waits in
 * a tab (unread messages, requests, invitations), shown as a dot on its icon.
 */
export function TabBar({ active: current, waiting = {}, onNavigate }: { active: Tab; waiting?: Partial<Record<Tab, number>>; onNavigate: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const user = useAtomValue(userAtom);
  return <View accessibilityRole="tablist" className="flex-row border-t border-border bg-background px-0.5 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
    {TABS.map(([tab, label, I]) => {
      const here = tab === current, count = waiting[tab] ?? 0;
      return <TabButton key={tab} tab={tab} label={tr(label)} here={here} count={count} onPress={() => {
        if (tab !== current) void Haptics.selectionAsync().catch(() => {});
        onNavigate(tab);
      }}>
        {I ? <Icon as={I} size={20} strokeWidth={here ? 2.25 : 1.9} className={here ? "text-primary" : "text-muted-foreground"} /> : <UserAvatar user={user} size={22} />}
      </TabButton>;
    })}
  </View>;
}

/** One tab, tagged `tab:<tab>` for the guided tour. */
function TabButton({ tab, label, here, count, onPress, children }: { tab: Tab; label: string; here: boolean; count: number; onPress: () => void; children: ReactNode }) {
  const tour = useTourTarget(`tab:${tab}`);
  return <View {...tour} className="min-w-0 flex-1">
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} accessibilityValue={count ? { text: tr("{0} unread", { 0: count }) } : undefined}
      onPress={onPress} className="min-h-12 items-center gap-1 py-1">
      <View className={cn("h-8 w-full max-w-14 items-center justify-center rounded-lg", here && "bg-primary/15")}>
        {children}
        {count > 0 && <View pointerEvents="none" className="absolute top-0.5 left-1/2 ml-1 size-3 rounded-full border-2 border-background bg-primary" />}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className={cn("max-w-full text-xs font-medium tracking-tighter", here ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
    </Pressable>
  </View>;
}
