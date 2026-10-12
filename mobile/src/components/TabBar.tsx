import * as Haptics from "expo-haptics";
import { Boxes, GraduationCap, Swords, Timer, UserRound, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { TABS, type Tab } from "../state";
import { useTourTarget } from "../tour";
import { SECTION_LABELS } from "./AppBar";
import { tr } from "../../../src/client/i18n";

const ICONS: Record<Tab, LucideIcon> = { timer: Timer, learn: GraduationCap, algorithms: Boxes, compete: Swords, me: UserRound };

/**
 * The bottom bar, floating: the five sections as icons, the current one a filled pill in the accent with its name.
 * `waiting` counts what waits in a section (unread messages, requests, invitations), shown as a dot on its icon.
 */
export function TabBar({ active: current, waiting = {}, onNavigate }: { active: Tab; waiting?: Partial<Record<Tab, number>>; onNavigate: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  return <View className="px-3 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
    <View accessibilityRole="tablist" className="h-16 flex-row items-center justify-between rounded-[22px] bg-card px-2">
      {TABS.map(tab => <TabButton key={tab} tab={tab} here={tab === current} count={waiting[tab] ?? 0} onPress={() => {
        if (tab !== current) void Haptics.selectionAsync().catch(() => {});
        onNavigate(tab);
      }} />)}
    </View>
  </View>;
}

/** One section, tagged `tab:<tab>` for the guided tour. */
function TabButton({ tab, here, count, onPress }: { tab: Tab; here: boolean; count: number; onPress: () => void }) {
  const tour = useTourTarget(`tab:${tab}`);
  const label = tr(SECTION_LABELS[tab]);
  return <View {...tour} className={cn("items-center", here ? "shrink" : "flex-1")}>
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} accessibilityValue={count ? { text: tr("{0} unread", { 0: count }) } : undefined}
      onPress={onPress} className={cn("h-12 flex-row items-center justify-center gap-2 rounded-2xl", here ? "bg-primary px-5" : "w-12")}>
      <View>
        <Icon as={ICONS[tab]} size={22} strokeWidth={here ? 2.4 : 1.9} className={here ? "text-primary-foreground" : "text-muted-foreground"} />
        {count > 0 && <View pointerEvents="none" className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-primary" />}
      </View>
      {here && <Text numberOfLines={1} className="shrink text-base font-extrabold tracking-[-0.02em] text-primary-foreground">{label}</Text>}
    </Pressable>
  </View>;
}
