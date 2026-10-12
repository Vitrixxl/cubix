import { Users, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { Conversation } from "../../../../src/client/lib/community";
import { said } from "../../../../src/client/i18n";

/** The small pieces the community's screens share: a group's face, captions, buttons and links. */

/** A group's face beside its name, where a person has an avatar. */
export function GroupMark({ size = 40 }: { size?: number }) {
  return <View className="shrink-0 items-center justify-center rounded-full bg-accent" style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <Icon as={Users} size={size > 30 ? 17 : 15} className="text-primary" />
  </View>;
}

export const title = (c: Conversation) => (c.kind === "group" ? c.group!.name : c.with!.username);
export const organiser = (role: string | undefined) => role === "owner" || role === "admin";

/** A small caption in capitals over a part of a screen. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <Text accessibilityRole="header" numberOfLines={1} className={cn("text-[11px] font-bold tracking-widest text-muted-foreground uppercase", className)}>{children}</Text>;
}

/**
 * A filled pill of a screen's head or a card, 40 dp: muted, `soft` on a tint of the accent, `primary` on the accent;
 * an icon alone when it has no `text`.
 */
export function Pill({ icon, text, label, onPress, tone = "muted", disabled, className }: {
  icon?: LucideIcon; text?: string; label?: string; onPress: () => void; tone?: "muted" | "soft" | "primary"; disabled?: boolean; className?: string;
}) {
  const fg = tone === "primary" ? "text-primary-foreground" : tone === "soft" ? "text-primary" : "text-foreground";
  return <Pressable accessibilityRole="button" accessibilityLabel={said(label ?? text ?? "")} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className={cn("h-10 flex-row items-center justify-center gap-1.5 rounded-xl", text ? "px-3.5" : "w-10",
      tone === "primary" ? "bg-primary active:bg-primary/85" : tone === "soft" ? "bg-primary/15 active:bg-primary/25" : "border border-border bg-muted active:bg-muted/60",
      disabled && "opacity-45", className)}>
    {icon ? <Icon as={icon} size={17} className={fg} /> : null}
    {text ? <Text numberOfLines={1} className={cn("text-sm font-bold", fg)}>{text}</Text> : null}
  </Pressable>;
}

/** An action in a word, on a 40 dp target: the accent for the one expected. */
export function TextLink({ children, onPress, accent = false, label }: { children: string; onPress: () => void; accent?: boolean; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} className="h-10 justify-center rounded-lg px-1 active:opacity-60">
    <Text className={cn("text-[13px] font-bold", accent ? "text-primary" : "text-muted-foreground")}>{children}</Text>
  </Pressable>;
}

/** A card waiting for an answer, outlined in dashes: a group's invitation, a request sent. */
export function Dashed({ children, quiet = false, className }: { children: ReactNode; quiet?: boolean; className?: string }) {
  return <View className={cn("gap-1 rounded-2xl border-[1.5px] border-dashed px-3.5 py-2.5", quiet ? "border-border" : "border-warning/45", className)}>{children}</View>;
}
