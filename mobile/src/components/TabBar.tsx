import * as Haptics from "expo-haptics";
import { Boxes, GraduationCap, Timer, UserRound, UsersRound, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { TABS, type Tab } from "../state";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { SECTION_LABELS } from "./AppBar";
import { tr } from "../../../src/client/i18n";

const ICONS: Record<Tab, LucideIcon> = { timer: Timer, learn: GraduationCap, algorithms: Boxes, social: UsersRound, me: UserRound };

/**
 * The bottom bar, floating: the five sections as icons, each named under it, the current one's icon a filled pill in the accent.
 * `waiting` counts what waits in a section (unread messages, requests, invitations), shown as a dot on its icon.
 */
export function TabBar({ active: current, waiting = {}, onNavigate }: { active: Tab; waiting?: Partial<Record<Tab, number>>; onNavigate: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  // On a tablet the bar keeps a phone's width, centred, rather than stretching across the screen.
  const { tablet } = useLayout();
  return <View className={cn("px-3 pt-1.5", tablet && "items-center")} style={{ paddingBottom: Math.max(insets.bottom, tablet ? 16 : 8) }}>
    <View accessibilityRole="tablist" className={cn("h-16 flex-row items-center justify-between rounded-[22px] bg-card px-2", tablet && "w-[420px]")}>
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
  return <View {...tour} className="flex-1 items-center">
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} accessibilityValue={count ? { text: tr("{0} unread", { 0: count }) } : undefined}
      onPress={onPress} className="h-14 w-full items-center justify-center gap-0.5">
      <View className={cn("h-8 w-14 items-center justify-center rounded-full", here && "bg-primary")}>
        <Icon as={ICONS[tab]} size={20} strokeWidth={here ? 2.4 : 1.9} className={here ? "text-primary-foreground" : "text-muted-foreground"} />
        {count > 0 && <View pointerEvents="none" className={cn("absolute top-0.5 right-3 size-2.5 rounded-full", here ? "bg-primary-foreground" : "bg-primary")} />}
      </View>
      <Text numberOfLines={1} className={cn("text-[11px] font-bold", here ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
    </Pressable>
  </View>;
}
