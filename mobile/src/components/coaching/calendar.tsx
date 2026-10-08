import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { localFormat, tr } from "../../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Surface } from "../layout";

/**
 * The coaching calendar (the web's coaching/calendar.tsx), shared by the coach's schedule, a player's booking and the
 * sessions: a month as one grid, Monday first, six weeks tall, each day a cell its page fills. Days are YYYY-MM-DD
 * keys, computed in UTC so the phone's own zone never shifts them.
 */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const toDate = (key: string) => new Date(key + "T00:00:00Z");
export const keyOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => keyOf(new Date(toDate(key).getTime() + n * 86_400_000));
export const weekdayOf = (key: string) => (toDate(key).getUTCDay() + 6) % 7;
export const longDay = localFormat({ weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const shortDay = localFormat({ day: "numeric", month: "short", timeZone: "UTC" });
const monthName = localFormat({ month: "long", year: "numeric", timeZone: "UTC" });
/** The month ("2026-10") some months away. */
function shiftMonth(month: string, n: number) {
  const d = toDate(month + "-01");
  d.setUTCMonth(d.getUTCMonth() + n);
  return keyOf(d).slice(0, 7);
}
const COLUMN = { width: `${100 / 7}%` } as const;

/** A day too narrow for its hours as text: a line under the date. */
export function NarrowBar({ muted = false }: { muted?: boolean }) {
  return <View className={cn("h-1 rounded-full", muted ? "bg-muted-foreground/30" : "bg-primary/50")} />;
}

/** The month's name, the arrows to the months around it and Today; the page's own actions on the right. */
export function MonthHeader({ month, today, onMonth, children }: { month: string; today: string; onMonth: (month: string) => void; children?: ReactNode }) {
  const name = monthName.format(toDate(month + "-01"));
  return <View className="min-h-11 flex-row flex-wrap items-center gap-1">
    <Text accessibilityRole="header" className="min-w-32 text-base font-semibold tracking-tight">{name.charAt(0).toUpperCase() + name.slice(1)}</Text>
    <Button variant="outline" size="icon" className="size-10 rounded-lg" accessibilityLabel={tr("Previous month")} onPress={() => onMonth(shiftMonth(month, -1))}>
      <Icon as={ChevronLeft} size={18} />
    </Button>
    <Button variant="outline" size="icon" className="size-10 rounded-lg" accessibilityLabel={tr("Next month")} onPress={() => onMonth(shiftMonth(month, 1))}>
      <Icon as={ChevronRight} size={18} />
    </Button>
    <Button variant="ghost" size="sm" className="h-10" onPress={() => onMonth(today.slice(0, 7))}><Text>{tr("Today")}</Text></Button>
    {children}
  </View>;
}

/** The month on its way: the weekdays over six weeks of empty days. */
export function CalendarSkeleton({ className }: { className?: string }) {
  return <Surface accessibilityLabel={tr("Loading")} className={cn("min-h-80 flex-1", className)}>
    <View className="flex-row border-b border-border">{WEEKDAYS.map(w => <View key={w} style={COLUMN} className="px-1.5 py-2"><Skeleton className="h-4 w-7" /></View>)}</View>
    <View className="flex-1 flex-row flex-wrap">
      {Array.from({ length: 42 }, (_, i) => <View key={i} style={[COLUMN, { height: `${100 / 6}%` }]} className={cn("p-1", i % 7 !== 6 && "border-r border-border", i < 35 && "border-b border-border")}>
        <Skeleton className="size-6 rounded-full" />
      </View>)}
    </View>
  </Surface>;
}

/** What a day's cell shows besides its date: beside the date, under it, and the look of the whole cell. */
export interface DayCell {
  corner?: ReactNode;
  body?: ReactNode;
  className?: string;
}

/** The month as one grid: a day is picked with a tap; past days and closed ones cannot be. */
export function Month({ month, today, selected, disabled, allowPast = false, pick, cell, className }: {
  month: string;
  today: string;
  selected: (day: string) => boolean;
  /** Days that cannot be picked, besides past days when `allowPast` is false. */
  disabled?: (day: string) => boolean;
  allowPast?: boolean;
  pick: (day: string) => void;
  cell: (day: string, past: boolean) => DayCell;
  className?: string;
}) {
  const first = month + "-01";
  const start = addDays(first, -weekdayOf(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return <Surface accessibilityLabel={tr("Calendar")} className={cn("min-h-80 flex-1", className)}>
    <View className="flex-row border-b border-border">
      {WEEKDAYS.map(w => <Text key={w} style={COLUMN} className="px-1.5 py-2 text-xs font-medium text-muted-foreground">{tr(w)}</Text>)}
    </View>
    <View className="flex-1">
      {[0, 1, 2, 3, 4, 5].map(week => <View key={week} className={cn("min-h-0 flex-1 flex-row", week < 5 && "border-b border-border")}>
        {days.slice(week * 7, week * 7 + 7).map((day, i) => {
          const past = day < today, off = (past && !allowPast) || !!disabled?.(day), outside = !day.startsWith(month), chosen = selected(day);
          const { corner, body, className } = cell(day, past);
          return <Pressable key={day} style={COLUMN} accessibilityRole="button" accessibilityLabel={longDay.format(toDate(day))} accessibilityState={{ disabled: off, selected: chosen }}
            disabled={off} onPress={() => pick(day)} testID={"day-" + day}
            className={cn("min-h-0 gap-1 overflow-hidden p-1", i !== 6 && "border-r border-border", outside && "bg-muted/25", !off && "active:bg-muted/50", className,
              chosen && "border-2 border-primary bg-primary/10")}>
            <View className="flex-row items-center gap-0.5">
              <View className={cn("size-6 items-center justify-center rounded-full", day === today && "bg-primary")}>
                <Text className={cn("text-xs font-medium tabular-nums", day === today ? "text-primary-foreground" : outside || off ? "text-muted-foreground/60" : "text-foreground")}>{toDate(day).getUTCDate()}</Text>
              </View>
              {corner}
            </View>
            {body}
          </Pressable>;
        })}
      </View>)}
    </View>
  </Surface>;
}

/** What a box holds: free (a slot to book, a session to come), chosen (the slot picked, a session in the coach's month), offered (another time offered), past. */
const TONES = {
  free: ["bg-primary/15 active:bg-primary/25", "text-primary"],
  chosen: ["bg-primary active:bg-primary/90", "text-primary-foreground"],
  offered: ["bg-warning/15 active:bg-warning/25", "text-warning"],
  past: ["bg-muted active:bg-muted/70", "text-muted-foreground"],
} as const;

/** A box of a day's grid, the same in every calendar: a time to book, a session booked, the count of the others. */
export function DayChip({ tone, label, onPress, accessibilityLabel, testID }: { tone: keyof typeof TONES; label: string; onPress?: () => void; accessibilityLabel?: string; testID?: string }) {
  return <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={accessibilityLabel} disabled={!onPress} pointerEvents={onPress ? "auto" : "none"} onPress={onPress} testID={testID}
    className={cn("h-5 min-w-0 items-center justify-center rounded px-0.5", TONES[tone][0])}>
    <Text numberOfLines={1} className={cn("text-[10px] font-semibold tabular-nums", TONES[tone][1])}>{label}</Text>
  </Pressable>;
}

/** A day's items as boxes, one per line: up to three, else two and a last box counting the others, whose tap reaches the day. */
export function DayBoxes<T>({ items, children }: { items: T[]; children: (item: T) => ReactNode }) {
  const shown = items.length > 3 ? items.slice(0, 2) : items;
  return <View className="gap-0.5">
    {shown.map(children)}
    {shown.length < items.length ? <DayChip tone="past" label={`+${items.length - shown.length}`} accessibilityLabel={tr("{0} more", { 0: items.length - shown.length })} /> : null}
  </View>;
}
