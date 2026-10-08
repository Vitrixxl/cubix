import { Check, ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Bar } from "./layout";
import { said, tr } from "../../../src/client/i18n";

/**
 * One choice of a page as a large card (the web's `PickerCard`: what to train, which method): its icon, title and
 * line, then a quieter line of figures and the progress of a course under way. With `pressed`, a card among several to
 * pick together: a check in place of the arrow. Its texts are translated (`said`).
 */
export function PickerCard({ icon, title, detail, meta, badge, marked = false, progress, disabled = false, pressed, onPress, accessibilityLabel }: {
  /** Its icon, accented (`lit`) on the card to pick. */
  icon: (lit: boolean) => ReactNode; title: string; detail: string; meta?: string; badge?: string;
  /** The one to pick by default (trained last, recommended): its icon takes the accent. */
  marked?: boolean; progress?: number; disabled?: boolean; pressed?: boolean; onPress: () => void; accessibilityLabel?: string;
}) {
  const lit = marked || !!pressed;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={pressed === undefined ? "button" : "checkbox"}
    accessibilityState={{ disabled, checked: pressed }} accessibilityLabel={said(accessibilityLabel ?? title)}
    className={cn("min-h-28 gap-3 rounded-2xl border border-border bg-card p-4 active:bg-muted/50", pressed && "border-primary/50 bg-primary/10", disabled && "opacity-45")}>
    <View className="flex-row items-center gap-3">
      <View className={cn("size-10 shrink-0 items-center justify-center rounded-lg", lit ? "bg-primary/15" : "bg-muted")}>{icon(lit)}</View>
      <Text numberOfLines={2} className="min-w-0 flex-1 text-base font-semibold tracking-tight">{said(title)}</Text>
      {pressed === undefined ? <Icon as={ChevronRight} size={20} className="text-muted-foreground" />
        : <View className={cn("size-5 items-center justify-center rounded-full border", pressed ? "border-primary bg-primary" : "border-input")}>
          {pressed ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
        </View>}
    </View>
    <Text numberOfLines={3} className="text-sm leading-relaxed text-muted-foreground">{said(detail)}</Text>
    {meta || badge || progress !== undefined ? <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        {/* All of it learned: said with a check, and the bar in green. */}
        {progress === 1 ? <Badge variant="success"><Icon as={Check} size={12} strokeWidth={3} className="text-success" /><Text>{tr("Learned")}</Text></Badge> : null}
        {badge ? <Badge variant="accent"><Text>{said(badge)}</Text></Badge> : null}
        {meta ? <Text className="text-xs text-muted-foreground">{meta}</Text> : null}
      </View>
      {progress !== undefined ? <Bar ratio={progress} fill={progress === 1 ? "bg-success" : undefined} /> : null}
    </View> : null}
  </Pressable>;
}
