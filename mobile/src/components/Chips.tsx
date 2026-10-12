import { ChevronDown, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/** A pill showing a setting; a tap opens its choices as a menu, the chosen one marked. `extra` adds items under them. */
export function ChipMenu<T extends string>({ label, value, options, onChange, icon, children, disabled, extra }: {
  label: string; value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (id: T) => void;
  icon?: LucideIcon; children: ReactNode; disabled?: boolean; extra?: ReactNode;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild disabled={disabled}>
      <Pressable accessibilityRole="button" accessibilityLabel={said(label)} disabled={disabled} className={cn(CHIP, "bg-muted active:bg-muted/70", disabled && "opacity-45")}>
        {icon ? <Icon as={icon} size={16} className="text-muted-foreground" /> : null}
        {typeof children === "string" ? <Text numberOfLines={1} className="shrink text-sm font-bold">{said(children)}</Text> : children}
        <Icon as={ChevronDown} size={15} className="text-muted-foreground" />
      </Pressable>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-52">
      <DropdownMenuLabel><Text className="text-xs text-muted-foreground">{said(label)}</Text></DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={id => onChange(id as T)}>
        {options.map(o => <DropdownMenuRadioItem key={o.id} value={o.id} disabled={o.disabled} className="min-h-11"><Text className="text-base">{said(o.label)}</Text></DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      {extra}
    </DropdownMenuContent>
  </DropdownMenu>;
}
