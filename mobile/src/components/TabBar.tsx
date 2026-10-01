import { useAtomValue } from "jotai";
import { Boxes, Dumbbell, GraduationCap, Swords, Timer, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { userAtom, type Page } from "../state";
import { alpha, useColors } from "../theme";
import { UserAvatar } from "./UserAvatar";

/**
 * Phone navigation, as on the web: icon over word. Six tabs have no middle one: the study tabs first in the order they
 * are used (learn a method, look up its algorithms, drill them), then the timer, the duel and the account last.
 */
const TABS: [page: Page, label: string, icon: LucideIcon | null][] = [
  ["learn", "Learn", GraduationCap],
  ["algorithms", "Algorithms", Boxes],
  ["training", "Training", Dumbbell],
  ["playground", "Timer", Timer],
  ["duel", "Duel", Swords],
  ["profile", "Account", null],
];

export function TabBar({ active, onNavigate }: { active: Page; onNavigate: (page: Page) => void }) {
  const insets = useSafeAreaInsets();
  const user = useAtomValue(userAtom);
  const colors = useColors();
  return <View accessibilityRole="tablist" className="flex-row border-t border-border bg-background px-1 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
    {TABS.map(([page, label, I]) => {
      const here = active === page;
      return <Pressable key={page} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: here }} onPress={() => onNavigate(page)}
        className="flex-1 items-center gap-1 rounded-lg py-1 active:bg-muted/50">
        {/* The pill as a plain style: a class toggled on a view that keeps its other classes loses its radius. */}
        <View className="h-8 w-full max-w-14 items-center justify-center" style={{ borderRadius: 10, backgroundColor: here ? alpha(colors.primary, 15) : "transparent" }}>
          {I ? <Icon as={I} size={20} className={here ? "text-primary" : "text-muted-foreground"} /> : <UserAvatar user={user} size={22} />}
        </View>
        <Text numberOfLines={1} className={cn("text-[11px] font-medium", here ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}
