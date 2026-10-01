import { useAtomValue } from "jotai";
import { Boxes, Dumbbell, GraduationCap, Swords, Timer, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { userAtom, type Page } from "../state";
import { alpha, useColors } from "../theme";
import { UserAvatar } from "./UserAvatar";
import { useTourTarget } from "../tour";

/**
 * Phone navigation follows the web: Timer, Algorithms, Training, Duel, Learn, then Account. The page stack slides
 * between tabs in this order (`TAB_ORDER` in PageStack.tsx).
 */
const TABS: [page: Page, label: string, icon: LucideIcon | null][] = [
  ["playground", "Timer", Timer],
  ["algorithms", "Algorithms", Boxes],
  ["training", "Training", Dumbbell],
  ["duel", "Duel", Swords],
  ["learn", "Learn", GraduationCap],
  ["profile", "Account", null],
];

export function TabBar({ active, onNavigate }: { active: Page; onNavigate: (page: Page) => void }) {
  const insets = useSafeAreaInsets();
  const user = useAtomValue(userAtom);
  return <View accessibilityRole="tablist" className="flex-row border-t border-border bg-background px-1 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
    {TABS.map(([page, label, I]) => <Tab key={page} page={page} label={label} here={active === page} onPress={() => onNavigate(page)}>
      {I ? <Icon as={I} size={20} className={active === page ? "text-primary" : "text-muted-foreground"} /> : <UserAvatar user={user} size={22} />}
    </Tab>)}
  </View>;
}

/** One tab: icon over word. Tagged `tab:<page>` for the guided tour. */
function Tab({ page, label, here, onPress, children }: { page: Page; label: string; here: boolean; onPress: () => void; children: ReactNode }) {
  const colors = useColors();
  const tour = useTourTarget(`tab:${page}`);
  return <View {...tour} className="flex-1">
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} onPress={onPress}
      className="items-center gap-1 rounded-lg py-1 active:bg-muted/50">
      {/* The highlight as a plain style: a class toggled on a view that keeps its other classes loses its radius. */}
      <View className="h-8 w-full max-w-14 items-center justify-center" style={{ borderRadius: 10, backgroundColor: here ? alpha(colors.primary, 15) : "transparent" }}>
        {children}
      </View>
      <Text numberOfLines={1} className={cn("text-[11px] font-medium", here ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
    </Pressable>
  </View>;
}
