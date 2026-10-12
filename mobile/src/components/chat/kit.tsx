import { ChevronLeft, Lock, Send, type LucideIcon } from "lucide-react-native";
import { Fragment, useRef, type ReactNode } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { localFormat, tr } from "../../../../src/client/i18n";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "../../api";
import { useColors } from "../../theme";
import { day, time } from "../tournaments/format";
import { Numeric, SearchField } from "../layout";

/**
 * The conversations' kit, the same in the community and in coaching (the web's chat.tsx): the list of conversations
 * and its rows, the head of the open one, its messages read as a transcript split by day, and the box to write.
 */

// Dates, as the web's coaching/parts.tsx (the day, the time and "2 days ago" are the tournaments').
export { day, relative, time } from "../tournaments/format";
const shortDay = localFormat({ day: "numeric", month: "short" });
/** The local calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** When a conversation last moved: the time today, "Yesterday", the date before. */
function stamp(at: number) {
  const key = dayKey(at);
  if (key === dayKey(Date.now())) return time(at);
  if (key === dayKey(Date.now() - 86_400_000)) return tr("Yesterday");
  return shortDay.format(at);
}

/** Each player's own colour, the same wherever their name shows (their face, their name in a conversation): picked from their name. */
const PERSON = [["bg-primary", "text-primary"], ["bg-success", "text-success"], ["bg-chart-2", "text-chart-2"], ["bg-warning", "text-warning"]] as const;
export const personColour = (name = "", part: 0 | 1 = 1) => PERSON[Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % PERSON.length]![part];

/** A player's face: their picture, or the first two letters of their name on their colour. */
export function Face({ name, src, size = 32 }: { name: string | undefined; src?: string | null; size?: number }) {
  if (src) return <Image source={{ uri: src.startsWith("/") ? API_ORIGIN + src : src }} accessibilityIgnoresInvertColors className="shrink-0 rounded-full bg-muted" style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return <View className={cn("shrink-0 items-center justify-center rounded-full", personColour(name, 0))} style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <Text className="font-extrabold text-background" style={{ fontSize: Math.max(9, size / 2.8) }}>{name?.slice(0, 2).toUpperCase()}</Text>
  </View>;
}

/** A count on the accent (unread, waiting); nothing at zero. */
export function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <Badge className={cn("min-w-5 rounded-full px-1.5", className)}><Numeric className="text-xs font-bold text-primary-foreground">{n}</Numeric></Badge>;
}

/** The conversations, scrolling in the room left: their search on top when it has one. */
export function ConversationList({ query, onQuery, children, className }: { query?: string; onQuery?: (query: string) => void; children: ReactNode; className?: string }) {
  return <View className={cn("min-h-0 flex-1 gap-2", className)}>
    {onQuery ? <SearchField value={query ?? ""} onChangeText={onQuery} placeholder={tr("Search conversations")} /> : null}
    <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-0.5 pb-2" keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </View>;
}

/**
 * A conversation in the list: the face, the name (with `tag` after it) and the last words, then when it last moved
 * and the count unread. `act` tints it while something there waits for the account (a battle not seen yet).
 */
export function ConversationRow({ onPress, face, name, tag, at, icon, preview, unread, act = false }: {
  onPress: () => void; face: ReactNode; name: string;
  /** A word after the name: what the other is to the account, a group's size. */
  tag?: string | number; at?: number; icon?: LucideIcon | null; preview: string; unread: number; act?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={unread ? tr("{0}, {1} unread", { 0: name, 1: unread }) : name} onPress={onPress}
    className={cn("min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-muted/60", act && "bg-primary/10")}>
    {face}
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-baseline gap-1.5">
        <Text numberOfLines={1} className="shrink text-base font-bold tracking-tight">{name}</Text>
        {tag != null ? <Numeric className="shrink-0 text-xs text-muted-foreground">{typeof tag === "string" ? tr(tag) : tag}</Numeric> : null}
      </View>
      <View className="min-w-0 flex-row items-center gap-1">
        {icon ? <Icon as={icon} size={12} className={unread ? "text-foreground" : "text-muted-foreground"} /> : null}
        <Text numberOfLines={1} className={cn("shrink text-sm", unread ? "text-foreground" : "text-muted-foreground")}>{preview}</Text>
      </View>
    </View>
    <View className="shrink-0 items-end gap-1">
      {at != null ? <Numeric className={cn("text-xs font-bold", unread ? "text-primary" : "text-muted-foreground")}>{stamp(at)}</Numeric> : null}
      <Count n={unread} />
    </View>
  </Pressable>;
}

/**
 * The head of the open conversation, as a pushed screen's: the way back, the face, the name and one muted line (a tap
 * opens their details when `onOpen` is given), the conversation's actions on the right.
 */
export function ChatHeader({ back, face, title, sub, onOpen, openLabel, children }: {
  back?: { label: string; onPress: () => void }; face: ReactNode; title: string; sub?: string; onOpen?: () => void; openLabel?: string; children?: ReactNode;
}) {
  const who = <>
    {face}
    <View className="min-w-0 shrink">
      <Text numberOfLines={1} accessibilityRole="header" className="text-lg font-extrabold tracking-[-0.03em]">{title}</Text>
      {sub ? <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{sub}</Numeric> : null}
    </View>
  </>;
  return <View className="min-h-14 flex-row items-center gap-1 pr-3 pl-2">
    {back ? <Pressable accessibilityRole="button" accessibilityLabel={back.label} onPress={back.onPress} className="size-11 items-center justify-center rounded-full active:bg-muted">
      <Icon as={ChevronLeft} size={22} />
    </Pressable> : null}
    {onOpen
      ? <Pressable accessibilityRole="button" accessibilityLabel={openLabel ?? title} onPress={onOpen} className="min-h-11 min-w-0 shrink flex-row items-center gap-2.5 rounded-xl px-1 py-1 active:bg-muted/60">{who}</Pressable>
      : <View className="min-w-0 shrink flex-row items-center gap-2.5 px-1">{who}</View>}
    {children ? <View className="ml-auto shrink-0 flex-row items-center gap-1.5 pl-2">{children}</View> : null}
  </View>;
}

/** What a message needs to take its place: who sent it and when. */
export interface Said {
  id: number;
  senderId: string;
  createdAt: number;
  sender?: { username: string; avatar?: string | null };
}

/** How long apart two messages of one sender may be and still read as one turn. */
const GROUP_GAP = 5 * 60_000;
/** A turn: one sender's run of messages, or a message standing alone as a card (`event`). */
type Turn<T> = { day: boolean; mine: boolean; items: T[]; event?: ReactNode };

/** The messages split into days and turns, the cards apart (exported for the tests). */
export function turnsOf<T extends Said>(messages: T[], me: string, event?: (m: T) => ReactNode) {
  const turns: Turn<T>[] = [];
  messages.forEach((m, i) => {
    const previous = messages[i - 1], newDay = !previous || dayKey(previous.createdAt) !== dayKey(m.createdAt), ev = event?.(m), last = turns.at(-1), mine = m.senderId === me;
    if (ev) return void turns.push({ day: newDay, mine, items: [m], event: ev });
    if (!newDay && last && !last.event && previous!.senderId === m.senderId && m.createdAt - previous!.createdAt < GROUP_GAP) last.items.push(m);
    else turns.push({ day: newDay, mine, items: [m] });
  });
  return turns;
}

/**
 * The messages as a transcript, newest at the bottom: split by day, each sender's run one turn with their name (in
 * their colour, "You" in the accent) and its time in the margin. A message `event` returns something for (a battle, a
 * tournament) is a turn of its own. `them` names the other party when the messages do not carry their sender. `bubble`
 * draws a message inside its turn; `children` come after (the ones on their way). The newest stays in view as messages
 * arrive and pictures take their height, unless the reader went up.
 */
export function MessageList<T extends Said>({ messages, me, them, event, bubble, empty, children }: {
  messages: T[] | undefined; me: string; them?: string; event?: (m: T) => ReactNode;
  bubble: (m: T, mine: boolean, last: boolean) => ReactNode; empty: ReactNode; children?: ReactNode;
}) {
  const scroller = useRef<ScrollView>(null), near = useRef(true);
  const extra = [children].flat().filter(Boolean).length;
  const turns = messages ? turnsOf(messages, me, event) : [];
  return <ScrollView ref={scroller} className="min-h-0 flex-1" contentContainerClassName="grow px-4 py-3" keyboardShouldPersistTaps="handled" accessibilityLiveRegion="polite"
    onScroll={e => { const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent; near.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 480; }}
    scrollEventThrottle={100} onContentSizeChange={() => { if (near.current) scroller.current?.scrollToEnd({ animated: false }); }}>
    {!messages ? <ChatSkeleton /> : !messages.length && !extra ? empty : <View className="gap-3.5">
      {turns.map(t => {
        const first = t.items[0]!, name = t.mine ? tr("You") : first.sender?.username ?? them ?? "";
        return <Fragment key={first.id}>
          {t.day ? <DayDivider at={first.createdAt} /> : null}
          <View className="flex-row items-start gap-2.5">
            <View className="w-14 items-end pt-0.5">
              <Text numberOfLines={1} className={cn("max-w-full text-[13px] font-extrabold", t.mine ? "text-primary" : personColour(name))}>{name}</Text>
              <Numeric className="text-[11px] font-semibold text-muted-foreground">{time(first.createdAt)}</Numeric>
            </View>
            <View className="min-w-0 flex-1 items-start gap-1.5">
              {t.items.map((m, i) => <View key={m.id} className={cn("max-w-full min-w-0 items-start gap-1.5", t.event && "w-full")}>{t.event ?? bubble(m, t.mine, i === t.items.length - 1)}</View>)}
            </View>
          </View>
        </Fragment>;
      })}
      {children}
    </View>}
  </ScrollView>;
}

/** A message's words, as written. */
export function Bubble({ children }: { mine?: boolean; last?: boolean; children: string }) {
  return <Text selectable className="max-w-full text-[15px] leading-normal">{children}</Text>;
}

/** The day the messages under it were written, between two hairlines: Today, Yesterday, then the date. */
function DayDivider({ at }: { at: number }) {
  const key = dayKey(at), label = key === dayKey(Date.now()) ? tr("Today") : key === dayKey(Date.now() - 86_400_000) ? tr("Yesterday") : day(at);
  return <View accessibilityRole="text" className="flex-row items-center gap-2.5 py-1">
    <View className="h-px flex-1 bg-border" />
    <Numeric className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{label}</Numeric>
    <View className="h-px flex-1 bg-border" />
  </View>;
}

/** Messages on their way: a name in the margin, a line of words. */
function ChatSkeleton() {
  return <View className="gap-4" accessibilityLabel={tr("Loading")}>
    {["w-2/5", "w-3/5", "w-1/4", "w-1/2", "w-2/5"].map((w, i) => <View key={i} className="flex-row gap-2.5">
      <Skeleton className="h-4 w-14" />
      <Skeleton className={cn("h-5", w)} />
    </View>)}
  </View>;
}

/**
 * The box to write, at the bottom (the page lifts it over the keyboard): a pill whose text grows with its lines up to
 * a few, `attach` on its left (the paper clip), `actions` on its right; then the round send button.
 */
export function Composer({ value, onChange, onSend, sending = false, label, maxLength, attach, actions }: {
  value: string; onChange: (text: string) => void; onSend: () => void; sending?: boolean; label: string; maxLength: number; attach?: ReactNode; actions?: ReactNode;
}) {
  const colors = useColors(), ready = !!value.trim() && !sending;
  return <View className="flex-row items-end gap-2 px-3 pt-1 pb-2">
    <View className="min-h-11 min-w-0 flex-1 flex-row items-end rounded-3xl border border-input bg-input/30 px-1">
      {attach ? <View className="py-0.5">{attach}</View> : null}
      <TextInput value={value} onChangeText={onChange} multiline maxLength={maxLength} placeholder={label} accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground} cursorColor={colors.primary} selectionColor={colors.primary + "55"}
        className="max-h-32 min-h-11 min-w-0 flex-1 px-3 py-2.5 font-sans text-base text-foreground" style={{ textAlignVertical: "center" }} />
      {actions ? <View className="flex-row items-center py-0.5">{actions}</View> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={tr("Send")} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={onSend}
      className={cn("size-11 items-center justify-center rounded-full", ready ? "bg-primary active:bg-primary/85" : "bg-muted")}>
      <Icon as={Send} size={18} className={ready ? "text-primary-foreground" : "text-muted-foreground"} />
    </Pressable>
  </View>;
}

/** In place of the box to write, while the conversation is closed: why, with a lock, and the way to open it if any. */
export function ChatClosed({ children, action }: { children: string; action?: ReactNode }) {
  return <View className="m-3 mt-1 flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl bg-muted px-4 py-3">
    <View className="shrink flex-row items-center gap-2">
      <Icon as={Lock} size={14} className="text-muted-foreground" />
      <Text className="shrink text-center text-sm text-muted-foreground">{children}</Text>
    </View>
    {action}
  </View>;
}
