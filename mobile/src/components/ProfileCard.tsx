import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * The profile's card system: every block of the overview is a `Section` (same radius, padding and heading row), empty
 * states are one muted line with at most one action (`EmptyLine`), and short facts are small rounded tags (`Tag`).
 */

/** A profile card: a heading row (title, muted meta beside it, controls or a link on the right) over its body. */
export function Section({ title, meta, more = "Details", onMore, aside, children, className, bodyClassName, label }: {
  title: ReactNode; meta?: ReactNode; more?: string; onMore?: () => void; aside?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string; label?: string;
}) {
  return <Card className={cn("gap-0 rounded-2xl py-0 shadow-none", className)} accessibilityLabel={label}>
    <View className="min-h-12 flex-row items-center gap-2 pt-1 pr-2 pl-4">
      <Text accessibilityRole="header" numberOfLines={1} className="shrink-0 text-base font-semibold tracking-tight">{title}</Text>
      {meta != null ? <Text numberOfLines={1} className="min-w-0 shrink text-sm text-muted-foreground">{meta}</Text> : null}
      <View className="ml-auto shrink-0 flex-row items-center gap-1">
        {aside}
        {onMore ? <MoreLink onPress={onMore}>{more}</MoreLink> : null}
      </View>
    </View>
    {children != null ? <View className={cn("gap-4 px-4 pt-1 pb-4", bodyClassName)}>{children}</View> : null}
  </Card>;
}

/** A quiet link at the end of a heading row: "Details ›". */
export function MoreLink({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return <Button variant="ghost" size="sm" className="h-9 gap-0.5 px-2" onPress={onPress}>
    <Text className="text-sm text-muted-foreground">{children}</Text>
    <Icon as={ChevronRight} size={15} className="text-muted-foreground" />
  </Button>;
}

/** A small heading inside a section, with an optional control on the right. */
export function SubHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <View className="h-8 flex-row items-center gap-2">
    <Text className="text-sm font-medium text-muted-foreground">{title}</Text>
    {children ? <View className="ml-auto flex-row items-center">{children}</View> : null}
  </View>;
}

/** A compact empty state: one muted line, and its action on the right. */
export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <View className="min-h-9 flex-row items-center gap-3">
    <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{children}</Text>
    {action}
  </View>;
}

/** A short fact on a small rounded tag (a level, a puzzle and its methods). */
export function Tag({ children, detail, tone = "muted" }: { children: ReactNode; detail?: ReactNode; tone?: "muted" | "primary" }) {
  return <View className={cn("flex-row items-center gap-1 rounded-md border px-2 py-0.5", tone === "primary" ? "border-primary/30 bg-primary/10" : "border-border bg-muted/40")}>
    <Text numberOfLines={1} className={cn("text-xs font-medium", tone === "primary" ? "text-primary" : "text-foreground")}>{children}</Text>
    {detail ? <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{detail}</Text> : null}
  </View>;
}
