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
import { Numeric, SearchField, Surface } from "../layout";

/**
 * The conversations' kit, the same in the community and in coaching (the web's chat.tsx): the list of conversations
 * and its rows, the header of the open one, its messages grouped by sender and split by day, and the box to write.
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

/** A player's face: their picture, or the first two letters of their name on the accent. */
export function Face({ name, src, size = 32 }: { name: string | undefined; src?: string | null; size?: number }) {
  if (src) return <Image source={{ uri: src.startsWith("/") ? API_ORIGIN + src : src }} accessibilityIgnoresInvertColors className="shrink-0 rounded-full bg-muted" style={{ width: size, height: size }} />;
  return <View className="shrink-0 items-center justify-center rounded-full bg-primary/15" style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <Text className="font-semibold text-primary" style={{ fontSize: size / 2.8 }}>{name?.slice(0, 2).toUpperCase()}</Text>
  </View>;
}

/** A count on the accent (unread, waiting); nothing at zero. */
export function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <Badge className={cn("ml-auto min-w-5 rounded-full px-1.5", className)}><Numeric className="text-xs font-semibold text-primary-foreground">{n}</Numeric></Badge>;
}

/** The conversations: a card the page's height, its search on top when it has one. */
export function ConversationList({ query, onQuery, children, className }: { query?: string; onQuery?: (query: string) => void; children: ReactNode; className?: string }) {
  return <Surface className={cn("min-h-0 flex-1", className)}>
    {onQuery ? <View className="p-2 pb-1"><SearchField value={query ?? ""} onChangeText={onQuery} placeholder={tr("Search conversations")} /></View> : null}
    <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-0.5 p-1.5" keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </Surface>;
}

/** A conversation in the list: the face, the name (bold while unread) and when it last moved, then the last words and the count unread. */
export function ConversationRow({ onPress, face, name, tag, at, icon, preview, unread }: {
  onPress: () => void; face: ReactNode; name: string;
  /** A word after the name: what the other is to the account. */
  tag?: string; at?: number; icon?: LucideIcon | null; preview: string; unread: number;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={unread ? tr("{0}, {1} unread", { 0: name, 1: unread }) : name} onPress={onPress}
    className="min-h-16 flex-row items-center gap-3 rounded-lg px-2.5 py-2 active:bg-muted/60">
    {face}
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-baseline gap-2">
        <Text numberOfLines={1} className={cn("shrink text-base", unread ? "font-semibold" : "font-medium")}>{name}</Text>
        {tag ? <Text className="shrink-0 text-xs text-muted-foreground">{tr(tag)}</Text> : null}
        {at != null ? <Numeric className="ml-auto shrink-0 text-xs text-muted-foreground">{stamp(at)}</Numeric> : null}
      </View>
      <View className="min-w-0 flex-row items-center gap-2">
        <View className="min-w-0 shrink flex-row items-center gap-1">
          {icon ? <Icon as={icon} size={12} className={unread ? "text-foreground" : "text-muted-foreground"} /> : null}
          <Text numberOfLines={1} className={cn("shrink text-sm", unread ? "text-foreground" : "text-muted-foreground")}>{preview}</Text>
        </View>
        <Count n={unread} />
      </View>
    </View>
  </Pressable>;
}

/**
 * The open conversation's header over a hairline: the way back, the face, the name and one muted line (a tap opens
 * their details when `onOpen` is given), the conversation's actions on the right.
 */
export function ChatHeader({ back, face, title, sub, onOpen, openLabel, children }: {
  back?: { label: string; onPress: () => void }; face: ReactNode; title: string; sub?: string; onOpen?: () => void; openLabel?: string; children?: ReactNode;
}) {
  const who = <>
    {face}
    <View className="min-w-0 shrink">
      <Text numberOfLines={1} className="text-base font-semibold">{title}</Text>
      {sub ? <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{sub}</Numeric> : null}
    </View>
  </>;
  return <View className="min-h-14 flex-row items-center gap-1 border-b border-border px-1.5">
    {back ? <Pressable accessibilityRole="button" accessibilityLabel={back.label} onPress={back.onPress} className="size-11 items-center justify-center rounded-lg active:bg-muted">
      <Icon as={ChevronLeft} size={22} />
    </Pressable> : null}
    {onOpen
      ? <Pressable accessibilityRole="button" accessibilityLabel={openLabel ?? title} onPress={onOpen} className="min-h-11 min-w-0 shrink flex-row items-center gap-3 rounded-lg px-1.5 py-1 active:bg-muted/60">{who}</Pressable>
      : <View className="min-w-0 shrink flex-row items-center gap-3 px-1.5">{who}</View>}
    {children ? <View className="ml-auto shrink-0 flex-row items-center gap-0.5">{children}</View> : null}
  </View>;
}

/** What a message needs to take its place: who sent it and when. */
export interface Said {
  id: number;
  senderId: string;
  createdAt: number;
  sender?: { username: string; avatar?: string | null };
}
/** A message shown apart, centred (a battle, a tournament): its line and what goes under it. */
export type ChatEvent = { icon: LucideIcon; text: ReactNode; body?: ReactNode };

/** How long apart two messages of one sender may be and still read as one group. */
const GROUP_GAP = 5 * 60_000;
type Block<T> = { day: boolean } & ({ kind: "group"; mine: boolean; items: T[] } | { kind: "event"; m: T; event: ChatEvent });

/** The messages split into days, each sender's run grouped, the events apart (exported for the tests). */
export function blocksOf<T extends Said>(messages: T[], me: string, event?: (m: T) => ChatEvent | null) {
  const blocks: Block<T>[] = [];
  messages.forEach((m, i) => {
    const previous = messages[i - 1], newDay = !previous || dayKey(previous.createdAt) !== dayKey(m.createdAt), ev = event?.(m), last = blocks.at(-1);
    if (ev) return void blocks.push({ kind: "event", m, event: ev, day: newDay });
    if (!newDay && last?.kind === "group" && previous!.senderId === m.senderId && m.createdAt - previous!.createdAt < GROUP_GAP) last.items.push(m);
    else blocks.push({ kind: "group", mine: m.senderId === me, items: [m], day: newDay });
  });
  return blocks;
}

/**
 * The messages, newest at the bottom: split by day, each sender's run of messages grouped, its time once after the
 * group; `group` (more than two people) names the others once per group with their face. A message `event` returns
 * something for stands apart, centred. `bubble` draws a message inside its group; `children` come after (the ones on
 * their way). The newest stays in view as messages arrive and pictures take their height, unless the reader went up.
 */
export function MessageList<T extends Said>({ messages, me, group = false, event, bubble, empty, children }: {
  messages: T[] | undefined; me: string; group?: boolean; event?: (m: T) => ChatEvent | null;
  bubble: (m: T, mine: boolean, last: boolean) => ReactNode; empty: ReactNode; children?: ReactNode;
}) {
  const scroller = useRef<ScrollView>(null), near = useRef(true);
  const extra = [children].flat().filter(Boolean).length;
  const blocks = messages ? blocksOf(messages, me, event) : [];
  return <ScrollView ref={scroller} className="min-h-0 flex-1" contentContainerClassName="grow px-3 py-4" keyboardShouldPersistTaps="handled" accessibilityLiveRegion="polite"
    onScroll={e => { const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent; near.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 480; }}
    scrollEventThrottle={100} onContentSizeChange={() => { if (near.current) scroller.current?.scrollToEnd({ animated: false }); }}>
    {!messages ? <ChatSkeleton /> : !messages.length && !extra ? empty : <View className="gap-3">
      {blocks.map(b => {
        const first = b.kind === "group" ? b.items[0]! : b.m;
        return <Fragment key={first.id}>
          {b.day ? <DayDivider at={first.createdAt} /> : null}
          {b.kind === "event" ? <View className="items-center gap-2">
            <View className="flex-row flex-wrap items-center justify-center gap-1.5 px-4">
              <Icon as={b.event.icon} size={14} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">{b.event.text}</Text>
              <Text className="text-xs text-muted-foreground">·</Text>
              <Numeric className="text-xs text-muted-foreground">{time(b.m.createdAt)}</Numeric>
            </View>
            {b.event.body}
          </View> : <Group mine={b.mine} items={b.items} group={group} bubble={bubble} />}
        </Fragment>;
      })}
      {children}
    </View>}
  </ScrollView>;
}

function Group<T extends Said>({ mine, items, group, bubble }: { mine: boolean; items: T[]; group: boolean; bubble: (m: T, mine: boolean, last: boolean) => ReactNode }) {
  const sender = items[0]!.sender, named = group && !mine && !!sender;
  return <View className={cn("gap-1", mine ? "items-end" : "items-start")}>
    {named ? <Text className="pl-12 text-xs font-medium text-muted-foreground">{sender!.username}</Text> : null}
    <View className="min-w-0 max-w-[85%] flex-row items-end gap-2">
      {named ? <Face name={sender!.username} src={sender!.avatar} size={28} /> : null}
      <View className={cn("min-w-0 shrink gap-0.5", mine ? "items-end" : "items-start")}>
        {items.map((m, i) => <View key={m.id} className={cn("max-w-full", mine ? "items-end" : "items-start")}>{bubble(m, mine, i === items.length - 1)}</View>)}
      </View>
    </View>
    <Numeric className={cn("text-xs text-muted-foreground", named ? "pl-12" : "px-1")}>{time(items.at(-1)!.createdAt)}</Numeric>
  </View>;
}

/** A message's words: on the accent for one's own, muted for the others'; the last of a group points to its sender. */
export function Bubble({ mine, last, children }: { mine: boolean; last: boolean; children: string }) {
  return <View className={cn("max-w-full rounded-2xl px-3 py-1.5", mine ? "bg-primary" : "bg-muted", last && (mine ? "rounded-br-md" : "rounded-bl-md"))}>
    <Text selectable className={cn("text-base", mine ? "text-primary-foreground" : "text-foreground")}>{children}</Text>
  </View>;
}

/** The day the messages under it were written, between two hairlines: Today, Yesterday, then the date. */
function DayDivider({ at }: { at: number }) {
  const key = dayKey(at), label = key === dayKey(Date.now()) ? tr("Today") : key === dayKey(Date.now() - 86_400_000) ? tr("Yesterday") : day(at);
  return <View accessibilityRole="text" className="flex-row items-center gap-3 py-1">
    <View className="h-px flex-1 bg-border/60" />
    <View className="rounded-full bg-muted/60 px-2.5 py-0.5"><Numeric className="text-xs font-medium text-muted-foreground">{label}</Numeric></View>
    <View className="h-px flex-1 bg-border/60" />
  </View>;
}

/** Messages on their way: bubbles one side then the other. */
function ChatSkeleton() {
  return <View className="gap-2" accessibilityLabel={tr("Loading")}>
    {["w-2/5", "ml-auto w-1/3", "ml-auto w-1/4", "w-1/2", "ml-auto w-2/5"].map((w, i) => <Skeleton key={i} className={cn("h-9 rounded-2xl", w)} />)}
  </View>;
}

/**
 * The box to write, at the bottom (the page lifts it over the keyboard): the text growing with its lines up to a few,
 * `attach` on its left (the paper clip), `actions` before the send button.
 */
export function Composer({ value, onChange, onSend, sending = false, label, maxLength, attach, actions }: {
  value: string; onChange: (text: string) => void; onSend: () => void; sending?: boolean; label: string; maxLength: number; attach?: ReactNode; actions?: ReactNode;
}) {
  const colors = useColors(), ready = !!value.trim() && !sending;
  return <View className="border-t border-border p-3">
    <View className="min-h-11 flex-row items-end rounded-xl border border-input bg-input/30 px-1">
      {attach ? <View className="py-0.5">{attach}</View> : null}
      <TextInput value={value} onChangeText={onChange} multiline maxLength={maxLength} placeholder={label} accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground} cursorColor={colors.primary} selectionColor={colors.primary + "55"}
        className="max-h-32 min-h-11 min-w-0 flex-1 px-2 py-2.5 font-sans text-base text-foreground" style={{ textAlignVertical: "center" }} />
      <View className="flex-row items-center gap-0.5 py-0.5">
        {actions}
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Send")} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={onSend}
          className={cn("size-10 items-center justify-center rounded-lg", ready && "bg-primary active:bg-primary/85")}>
          <Icon as={Send} size={18} className={ready ? "text-primary-foreground" : "text-muted-foreground"} />
        </Pressable>
      </View>
    </View>
  </View>;
}

/** In place of the box to write, while the conversation is closed: why, with a lock, and the way to open it if any. */
export function ChatClosed({ children, action }: { children: string; action?: ReactNode }) {
  return <View className="flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-border px-4 py-3">
    <View className="shrink flex-row items-center gap-2">
      <Icon as={Lock} size={14} className="text-muted-foreground" />
      <Text className="shrink text-center text-sm text-muted-foreground">{children}</Text>
    </View>
    {action}
  </View>;
}
