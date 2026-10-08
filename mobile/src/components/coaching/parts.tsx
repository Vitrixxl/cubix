import { useAtomValue, useSetAtom } from "jotai";
import { Check, Star } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Image, Pressable, View, type ViewProps } from "react-native";
import { localFormat, tn, tr } from "../../../../src/client/i18n";
import { EVENTS, eventInfo, type EventId } from "../../../../src/shared/puzzles";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "../../api";
import { goBackAtom, previousRouteAtom, replaceRouteAtom, routeAtom } from "../../state";
import { useColors } from "../../theme";
import { PuzzleIcon } from "../PuzzlePicker";
import { toastAtom } from "../Toast";
import { Numeric } from "../layout";

/** Pieces shared by the coaching pages (the web's coaching/parts.tsx and base.tsx): their addresses, dates, faces, stars. */

/** Opens a coaching view ("coaches", "coach/<id>/book"…); `back` returns to one, popping when it is the page before. */
export function useCoachingNav() {
  const push = useSetAtom(routeAtom), replace = useSetAtom(replaceRouteAtom), pop = useSetAtom(goBackAtom);
  const previous = useAtomValue(previousRouteAtom) as { page: string; view?: string } | null;
  return {
    go: (view: string, inPlace = false) => (inPlace ? replace : push)({ page: "coaching", view }),
    back: (view: string) => (previous?.page === "coaching" && (previous.view ?? "") === view ? pop() : replace({ page: "coaching", view })),
    /** The coaching view before this one, if any. */
    previous: previous?.page === "coaching" ? previous.view ?? "" : null,
  };
}

/** Runs an action of the server: `pending` while it goes, its message in a notification when it fails. */
export function useAction() {
  const toast = useSetAtom(toastAtom);
  const [pending, setPending] = useState(false);
  async function run(work: () => Promise<unknown>, done?: string | ((value: any) => { title: string; description?: string })) {
    setPending(true);
    try {
      const value = await work();
      if (done) toast(typeof done === "string" ? { title: done } : done(value));
      return true;
    } catch (e) {
      toast({ error: true, title: (e as Error).message });
      return false;
    } finally {
      setPending(false);
    }
  }
  return { pending, run, toast };
}

const dayFormat = localFormat({ weekday: "short", day: "numeric", month: "short" });
const timeFormat = localFormat({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const day = (ms: number) => dayFormat.format(ms);
export const time = (ms: number) => timeFormat.format(ms);
/** "Tue 7 Oct · 18:00–19:00" */
export const span = (start: number, end?: number) => `${day(start)} · ${time(start)}${end ? "–" + time(end) : ""}`;
/** The local calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(ms: number | Date) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "in 3 hours", "in 2 days", "now", "2 days ago", translated as the tournaments' (Hermes has no Intl.RelativeTimeFormat). */
export function relative(ms: number, now = Date.now()) {
  const minutes = Math.round((ms - now) / 60_000), abs = Math.abs(minutes), future = minutes > 0;
  if (abs < 1) return tr("now");
  if (abs < 60) return future ? tn(abs, "in {n} minute") : tn(abs, "{n} minute ago", "{n} minutes ago");
  const hours = Math.round(abs / 60);
  if (abs < 48 * 60) return future ? tn(hours, "in {n} hour") : tn(hours, "{n} hour ago", "{n} hours ago");
  const days = Math.round(abs / 1440);
  return future ? tn(days, "in {n} day") : tn(days, "{n} day ago", "{n} days ago");
}
export const clockTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** An account's face: its picture, or the first two letters of its name on a disc of the accent. */
export function Face({ name, src, size = 32 }: { name: string | undefined; src?: string | null; size?: number }) {
  if (src) return <Image source={{ uri: src.startsWith("/") ? API_ORIGIN + src : src }} accessibilityIgnoresInvertColors
    className="shrink-0 rounded-full bg-muted" style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return <View className="shrink-0 items-center justify-center rounded-full bg-primary/15" style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <Text className="font-semibold text-primary" style={{ fontSize: Math.max(9, size / 2.8) }}>{name?.slice(0, 2).toUpperCase()}</Text>
  </View>;
}

/** Five stars, filled up to the rating (halves rounded), with the figure beside. */
export function Stars({ rating, size = 14, figure = true }: { rating: number | null; size?: number; figure?: boolean }) {
  const filled = Math.round(rating ?? 0), warning = useColors().variables["--warning"];
  return <View className="flex-row items-center gap-1" accessibilityLabel={rating == null ? tr("Not rated yet") : tr("Rated {0} out of 5", { 0: rating.toFixed(1) })}>
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map(i => <Icon key={i} as={Star} size={size} className={i <= filled ? "text-warning" : "text-muted-foreground/40"} fill={i <= filled ? warning : "none"} />)}
    </View>
    {figure ? <Numeric className="text-xs text-muted-foreground">{rating == null ? tr("New") : rating.toFixed(1)}</Numeric> : null}
  </View>;
}

/** A secondary group of figures: a quiet muted band, no outline. */
export function Strip({ className, ...props }: ViewProps) {
  return <View className={cn("flex-row flex-wrap gap-y-3 rounded-xl border border-border bg-muted/45 px-4 py-3", className)} {...props} />;
}

/** Events as their WCA glyphs. */
export function Events({ events, size = 16 }: { events: string[]; size?: number }) {
  const colors = useColors();
  return <View className="flex-row flex-wrap items-center gap-1.5">
    {events.filter(id => eventInfo(id)).map(id => <View key={id} accessibilityLabel={tr(eventInfo(id)!.label)}><PuzzleIcon puzzle={id as EventId} size={size} color={colors.mutedForeground} /></View>)}
  </View>;
}

/** Events picked among every WCA event: glyph cells, the chosen ones tinted; several may be chosen. */
export function EventPicker({ value, onChange }: { value: string[]; onChange: (events: string[]) => void }) {
  const colors = useColors();
  return <View accessibilityLabel={tr("Events")} className="flex-row flex-wrap gap-1">
    {EVENTS.map(e => {
      const on = value.includes(e.id);
      return <Pressable key={e.id} accessibilityRole="checkbox" accessibilityLabel={tr(e.label)} accessibilityState={{ checked: on }}
        onPress={() => onChange(EVENTS.filter(x => x.id === e.id ? !on : value.includes(x.id)).map(x => x.id))}
        className={cn("size-11 items-center justify-center rounded-lg border", on ? "border-primary/60 bg-primary/10" : "border-border active:bg-muted/50")}>
        <PuzzleIcon puzzle={e.id} size={20} color={on ? colors.primary : colors.foreground} />
      </Pressable>;
    })}
  </View>;
}

/** A count on a navigation row, in the accent; nothing when zero. */
export function Count({ n }: { n: number }) {
  if (!n) return null;
  return <Badge className="min-w-5 px-1.5"><Numeric className="text-xs font-medium text-primary-foreground">{n}</Numeric></Badge>;
}

/** A box ticked to agree, with its sentence beside. */
export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} className="min-h-11 flex-row items-center gap-2.5">
    <View className={cn("size-5 items-center justify-center rounded border", checked ? "border-primary bg-primary" : "border-input")}>
      {checked ? <Icon as={Check} size={14} strokeWidth={3} className="text-primary-foreground" /> : null}
    </View>
    <Text className="min-w-0 flex-1 text-sm">{children}</Text>
  </Pressable>;
}

/** A form field: its caption, the control, a line of help or the error under it. */
export function Field({ label, help, error, children, className }: { label?: string; help?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return <View className={cn("gap-2", className)}>
    {label ? <Text className="text-sm font-medium">{label}</Text> : null}
    {children}
    {error ? <Text className="text-sm text-destructive">{error}</Text> : help ? <Text className="text-sm text-muted-foreground">{help}</Text> : null}
  </View>;
}
