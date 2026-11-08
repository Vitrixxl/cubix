import { type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { said } from "../../../src/client/i18n";

const CHIP = "h-10 shrink-0 flex-row items-center gap-1.5 rounded-full px-3.5";

/** A filled pill: a setting at a glance, a toggle (`on` in the accent, or in green for `success`) or a small action. */
export function Chip({ icon, children, on = false, success = false, onPress, disabled, accessibilityLabel, className }: {
  icon?: LucideIcon; children?: ReactNode; on?: boolean; success?: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string; className?: string;
}) {
  const text = on ? (success ? "text-success" : "text-primary-foreground") : "text-muted-foreground";
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on, disabled }} accessibilityLabel={accessibilityLabel && said(accessibilityLabel)}
    className={cn(CHIP, on ? (success ? "bg-success/15 active:bg-success/25" : "bg-primary active:bg-primary/85") : "bg-muted active:bg-muted/70", disabled && "opacity-45", className)}>
    {icon ? <Icon as={icon} size={16} className={text} /> : null}
    {typeof children === "string" ? <Text numberOfLines={1} className={cn("text-sm font-bold", on && text)}>{said(children)}</Text> : children}
  </Pressable>;
}
