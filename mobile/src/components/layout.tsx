import { ChevronLeft, ChevronRight, Ellipsis, Search, X, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, TextInput, View, type ViewProps } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "../../../src/client/lib/tone";
import { useColors } from "../theme";

export type { Tone };

/**
 * The app's page furniture, after the web phone layout (desktop/renderer/ui.tsx and phone.tsx): a page with its head
 * (title, subtitle, controls, "…" menu), surfaces, figures, and the rows of large touch targets at the bottom of a stage.
 */

/** Figures and moves: Geist with even digits. */
export function Numeric({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn("font-sans tabular-nums", className)} {...props} />;
}

/** A quiet caption over a value or a block (`LABEL`). */
export function Label({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn("font-sans text-xs font-medium text-muted-foreground", className)} {...props} />;
}

/** A screen: the page padding and the gap between its head and its content. */
export function Page({ className, ...props }: ViewProps) {
  return <View className={cn("flex-1 gap-3 px-4 pt-2 pb-3", className)} {...props} />;
}

/** The way back in a page head: a chevron on a 40 dp target, flush with the page's edge. */
export function BackButton({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  return <Button variant="ghost" size="icon" className="-ml-2.5 size-10 rounded-lg" accessibilityLabel={label} onPress={onPress}>
    <Icon as={ChevronLeft} size={22} />
  </Button>;
}

/**
 * Page head on one 48 dp row: an optional lead (the back button), the title and its subtitle beside it, then the
 * page's controls on the right. A tab's first page has a large title; the pages opened from it (with a lead) a
 * smaller one.
 */
export function PageHead({ title, sub, lead, children, className }: { title: ReactNode; sub?: ReactNode; lead?: ReactNode; children?: ReactNode; className?: string }) {
  return <View className={cn("min-h-12 flex-row items-center justify-between gap-2", className)}>
    <View className="min-w-0 flex-1 flex-row items-center gap-1">
      {lead}
      {/* One line: the title, then its subtitle on the same baseline, cut short where the row runs out. */}
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text numberOfLines={1} accessibilityRole="header" className={cn("max-w-full shrink-0 font-sans font-semibold tracking-tight", lead ? "text-lg" : "text-[26px] leading-[32px]")}>{title}</Text>
        {sub ? <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] text-muted-foreground">{sub}</Text> : null}
      </View>
    </View>
    {children ? <View className="shrink-0 flex-row items-center gap-1.5">{children}</View> : null}
  </View>;
}

/** An icon button of a page head, 40 dp, quiet until pressed; `badge` puts a count on its corner. */
export function HeadButton({ icon, label, onPress, disabled, active, badge }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; active?: boolean; badge?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress}
    className={cn("size-10 items-center justify-center rounded-lg active:bg-muted", active && "bg-muted", disabled && "opacity-40")}>
    <Icon as={icon} size={20} className="text-foreground" />
    {badge ? <View className="absolute top-1 right-1 min-w-4 items-center rounded-full bg-primary px-1"><Text className="text-[10px] font-semibold text-primary-foreground">{badge}</Text></View> : null}
  </Pressable>;
}

/** Two or three parts of one page as a segmented control, the chosen part raised; `locked` ones are greyed but answer a tap. */
export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { id: T; label: string; locked?: boolean }[]; onChange: (id: T) => void; label: string; className?: string }) {
  return <View accessibilityRole="tablist" accessibilityLabel={label} className={cn("h-10 flex-row rounded-xl bg-muted p-1", className)}>
    {options.map(o => {
      const on = o.id === value;
      return <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { if (!on) onChange(o.id); }}
        className={cn("flex-1 items-center justify-center rounded-lg", on && "bg-background shadow-sm shadow-black/20", o.locked && "opacity-45")}>
        <Text numberOfLines={1} className={cn("text-sm", on ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{o.label}</Text>
      </Pressable>;
    })}
  </View>;
}

/** A titled group of rows on one card, split by hairlines (the settings and the ways to practise). */
export function ListGroup({ title, children, className, ...props }: ViewProps & { title?: string }) {
  return <View className={cn("gap-2", className)} {...props}>
    {title ? <Text accessibilityRole="header" className="px-1 text-[13px] font-medium text-muted-foreground">{title}</Text> : null}
    <View className="overflow-hidden rounded-2xl border border-border bg-card">{children}</View>
  </View>;
}

/**
 * A row of a list group: an icon on a tinted tile, its title and a line under it, then `trailing` (a figure, a word)
 * and a chevron when it opens something. `first` drops the hairline above it.
 */
export function ListRow({ icon, iconNode, title, detail, trailing, onPress, first, tone = "muted", chevron = !!onPress, disabled, accessibilityLabel, children }: {
  icon?: LucideIcon; iconNode?: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode; onPress?: () => void; first?: boolean;
  tone?: "muted" | "primary" | "success"; chevron?: boolean; disabled?: boolean; accessibilityLabel?: string; children?: ReactNode;
}) {
  const tile = { muted: "bg-muted", primary: "bg-primary/15", success: "bg-success/15" }[tone];
  const glyph = { muted: "text-muted-foreground", primary: "text-primary", success: "text-success" }[tone];
  return <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={accessibilityLabel} disabled={!onPress || disabled} onPress={onPress}
    className={cn("min-h-16 flex-row items-center gap-3.5 px-4 py-3 active:bg-muted/60", !first && "border-t border-border", disabled && "opacity-45")}>
    {iconNode ?? (icon ? <View className={cn("size-10 items-center justify-center rounded-xl", tile)}><Icon as={icon} size={19} className={glyph} /></View> : null)}
    <View className="min-w-0 flex-1 gap-0.5">
      {typeof title === "string" ? <Text numberOfLines={1} className="text-[15px] font-medium">{title}</Text> : title}
      {typeof detail === "string" ? <Text numberOfLines={2} className="text-[13px] leading-[18px] text-muted-foreground">{detail}</Text> : detail}
      {children}
    </View>
    {trailing}
    {chevron ? <Icon as={ChevronRight} size={18} className="-mr-1 text-muted-foreground/70" /> : null}
  </Pressable>;
}

/** The "…" of a page head: the page's other controls as menu items. Controls in a page head are outlined. */
export function MoreMenu({ children, label = "More" }: { children: ReactNode; label?: string }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="size-10 rounded-lg" accessibilityLabel={label}>
        <Icon as={Ellipsis} size={20} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-56">{children}</DropdownMenuContent>
  </DropdownMenu>;
}

/** A menu item with its icon, tall enough for a thumb. */
export function MenuItem({ icon, children, onPress, disabled, destructive }: { icon?: LucideIcon; children: ReactNode; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return <DropdownMenuItem className="min-h-11 gap-3 px-3" disabled={disabled} variant={destructive ? "destructive" : "default"} onPress={onPress}>
    {icon ? <Icon as={icon} size={17} className={destructive ? "text-destructive" : "text-muted-foreground"} /> : null}
    <Text className="text-[15px]">{children}</Text>
  </DropdownMenuItem>;
}

/** A card holding a page's main content, flush (no padding, no gap). */
export function Surface({ className, ...props }: ViewProps) {
  return <Card className={cn("gap-0 overflow-hidden py-0", className)} {...props} />;
}

const FIGURE: Record<"sm" | "base" | "lg" | "xl", string> = { sm: "text-sm", base: "text-lg", lg: "text-2xl", xl: "text-4xl" };
/** A caption over a figure; an empty figure (a dash) is faded. */
export function Figure({ label, value, tone = "", size = "base", className }: { label: ReactNode; value: ReactNode; tone?: Tone; size?: "sm" | "base" | "lg" | "xl"; className?: string }) {
  const empty = typeof value === "string" && /^[-–—]$/.test(value.trim());
  return <View className={cn("min-w-0 gap-1", className)}>
    <Label numberOfLines={1}>{label}</Label>
    <Numeric numberOfLines={1} className={cn("font-medium tracking-tight", FIGURE[size], empty ? "text-muted-foreground/60" : TONE_TEXT[tone])}>{value}</Numeric>
  </View>;
}

/** A quiet line standing for an empty list. */
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("items-center justify-center gap-3 px-4 py-8", className)}>
    {typeof children === "string" ? <Text className="text-center text-sm text-muted-foreground">{children}</Text> : children}
  </View>;
}

/** A thin bar: the accent once reached (`done`), muted while on its way. */
export function Bar({ ratio, done = true, className }: { ratio: number; done?: boolean; className?: string }) {
  const value = Math.max(0, Math.min(1, ratio));
  return <View className={cn("h-1 min-w-10 overflow-hidden rounded-full bg-muted", className)} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
    <View className={cn("h-full rounded-full", done ? "bg-primary" : "bg-muted-foreground/60")} style={{ width: `${value * 100}%` }} />
  </View>;
}

/** Moves in Geist, wrapping between moves only; brackets and rotations in parentheses are muted. */
export function Alg({ text, size = 18, className, selectable }: { text: string; size?: number; className?: string; selectable?: boolean }) {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  return <View className={cn("min-w-0 flex-row flex-wrap", className)} style={{ columnGap: size * 0.5, rowGap: size * 0.3 }}>
    {words.map((word, i) => <Text key={i} selectable={selectable} className={cn("font-sans font-medium tracking-tight", /[()[\]]/.test(word) && "text-muted-foreground")}
      style={{ fontSize: size, lineHeight: Math.round(size * 1.3) }}>{word.replace(/ /g, " ")}</Text>)}
  </View>;
}

/** A bottom row of large touch targets: icon over a short word, equal widths. */
export function TouchBar({ className, ...props }: ViewProps) {
  return <View className={cn("flex-row gap-1", className)} {...props} />;
}

/** One target of a touch bar; `pressed` marks an on/off one, `tone` colours it while on (`good` also tints its ground). */
export function TouchAction({ icon, label, onPress, pressed, disabled, tone = "", primary = false, accessibilityLabel }: {
  icon?: LucideIcon; label: string; onPress: () => void; pressed?: boolean; disabled?: boolean; tone?: Tone; primary?: boolean; accessibilityLabel?: string;
}) {
  const text = cn(primary ? "text-primary-foreground" : pressed ? "text-foreground" : "text-muted-foreground", pressed && TONE_TEXT[tone]);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: pressed, disabled }} disabled={disabled} onPress={onPress}
    className={cn("h-14 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1",
      "active:bg-muted/60", primary ? "bg-primary active:bg-primary/85" : pressed && "bg-muted",
      pressed && tone === "good" && "bg-success/15",
      disabled && "opacity-40")}>
    {icon ? <Icon as={icon} size={19} className={text} /> : null}
    <Text numberOfLines={1} className={cn("text-[11px] font-medium", text)}>{label}</Text>
  </Pressable>;
}

/**
 * While a solve runs everything but the time fades out (the web's FADE), and fades back afterwards; the layout never
 * moves and hidden controls take no touch.
 */
export function Fade({ hidden, children, className, style }: { hidden: boolean; children: ReactNode; className?: string; style?: ViewProps["style"] }) {
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: hidden ? 0 : 1, duration: hidden ? 160 : 220, useNativeDriver: true }).start();
  }, [hidden, opacity]);
  return <Animated.View pointerEvents={hidden ? "none" : "box-none"} className={className} style={[style, { opacity }]}>{children}</Animated.View>;
}

/** Small toggles in a row (a set, a filter), the chosen one filled; `count` in muted text after the label. */
export function Choice<T extends string>({ value, options, onChange, label, className }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (id: T) => void; label: string; className?: string }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} className={cn("flex-row flex-wrap gap-1", className)}>
    {options.map(o => {
      const on = o.id === value;
      return <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.id)}
        className={cn("h-9 flex-row items-center gap-1.5 rounded-lg px-2.5 active:bg-muted/50", on && "bg-muted")}>
        <Text className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{o.label}</Text>
        {o.count !== undefined ? <Numeric className="text-xs text-muted-foreground">{o.count}</Numeric> : null}
      </Pressable>;
    })}
  </View>;
}

/** A search field: the magnifier, the text and a clear button once something is typed. */
export function SearchField({ value, onChangeText, placeholder, className, autoFocus }: { value: string; onChangeText: (text: string) => void; placeholder: string; className?: string; autoFocus?: boolean }) {
  const colors = useColors();
  return <View className={cn("h-11 flex-row items-center gap-2 rounded-lg border border-input bg-input/30 pl-3", className)}>
    <Icon as={Search} size={17} className="text-muted-foreground" />
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false}
      returnKeyType="search" autoFocus={autoFocus} cursorColor={colors.primary} selectionColor={colors.primary + "55"} accessibilityLabel={placeholder}
      className="h-full min-w-0 flex-1 font-sans text-base text-foreground" />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" onPress={() => onChangeText("")} className="h-full w-11 items-center justify-center rounded-lg active:bg-muted/60">
      <Icon as={X} size={16} className="text-muted-foreground" />
    </Pressable> : null}
  </View>;
}
