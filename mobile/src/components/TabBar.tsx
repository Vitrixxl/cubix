import * as Haptics from "expo-haptics";
import { Boxes, GraduationCap, Swords, Timer, UserRound, UsersRound, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { TABS, type Tab } from "../state";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { SECTION_LABELS } from "./AppBar";
import { SlidingPill } from "./layout";
import { tr } from "../../../src/client/i18n";

const ICONS: Record<Tab, LucideIcon> = { timer: Timer, learn: GraduationCap, algorithms: Boxes, challenges: Swords, social: UsersRound, me: UserRound };

/**
 * The bottom bar, flush with the screen's edges under a hairline: the five sections as icons, each named under it. The
 * current one is marked as the app marks its tabs everywhere (the section's pages, the desktop's header): its name in
 * full ink and a short line in the accent, here over its icon. `waiting` counts what waits in a section (unread
 * messages, requests, invitations), shown as a dot on its icon.
 */
export function TabBar({ active: current, waiting = {}, onNavigate }: { active: Tab; waiting?: Partial<Record<Tab, number>>; onNavigate: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  // On a tablet the tabs keep a phone's width, centred, rather than stretching across the screen.
  const { tablet } = useLayout();
  return <View className={cn("border-t border-border bg-background", tablet && "items-center")} style={{ paddingBottom: insets.bottom }}>
    <View accessibilityRole="tablist" className={cn("h-14 flex-row px-1", tablet && "w-[480px]")}>
      {/* The line of the current section, hanging from the bar's hairline; it slides to the section opened. */}
      <SlidingPill index={TABS.indexOf(current)} count={TABS.length} className="inset-x-1 top-[-1px] h-[3px]">
        <View className="h-full items-center"><View className="h-full w-8 rounded-b-full bg-primary" /></View>
      </SlidingPill>
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
  return <View {...tour} className="flex-1">
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} accessibilityValue={count ? { text: tr("{0} unread", { 0: count }) } : undefined}
      onPress={onPress} className="h-14 w-full items-center justify-center gap-1 active:opacity-60">
      <View>
        <Icon as={ICONS[tab]} size={22} strokeWidth={here ? 2.3 : 1.8} className={here ? "text-foreground" : "text-muted-foreground"} />
        {count > 0 && <View pointerEvents="none" className="absolute -top-0.5 -right-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />}
      </View>
      <Text numberOfLines={1} className={cn("text-[11px]", here ? "font-extrabold text-foreground" : "font-semibold text-muted-foreground")}>{label}</Text>
    </Pressable>
  </View>;
}
