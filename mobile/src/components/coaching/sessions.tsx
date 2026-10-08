import { CalendarClock, CalendarDays, CalendarX, Check, MessageSquare, Star, Video, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { plural } from "../../../../src/client/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useAtomValue } from "jotai";
import { userAtom } from "../../state";
import { useColors } from "../../theme";
import { ask } from "../Confirm";
import { ChoiceButton } from "../PuzzlePicker";
import { Sheet, SheetInput, SheetScrollView } from "../Sheet";
import { Empty, Numeric, Segmented } from "../layout";
import { Alert } from "@/components/ui/alert";
import { CANCELLATION_NOTICE, callOpen, cancellationOpen, coaching, price, useCoaching, type Booking } from "./client";
import { CalendarSkeleton, DayBoxes, DayChip, Month, MonthHeader, longDay, toDate } from "./calendar";
import { Face, Stars, day, dayKey, relative, span, time, useAction, useCoachingNav } from "./parts";
import { tr } from "../../../../src/client/i18n";
import { msg } from "../../../../src/client/i18n/msg";

/** Every session on the shared calendar, filtered by status; a day opens its sessions and their actions (the web's coaching/sessions.tsx). */
const SESSION_TABS = { upcoming: msg("Upcoming"), past: msg("Past"), cancelled: msg("Cancelled") };
type Tab = keyof typeof SESSION_TABS;

/** Redraws every half minute, so calls open and sessions end on time. */
export function useMinute() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Sessions() {
  const c = useCoaching(), nav = useCoachingNav();
  useEffect(() => { void coaching.load("bookings"); }, []);
  const now = useMinute();
  const [tab, setTab] = useState<Tab>("upcoming"), [month, setMonth] = useState(""), [picked, setPicked] = useState("");
  const all = c.bookings;
  const groups: Record<Tab, Booking[] | undefined> = {
    upcoming: all?.filter(b => b.status === "booked" && b.endsAt > now).sort((a, b) => a.startsAt - b.startsAt),
    past: all?.filter(b => b.status === "booked" && b.endsAt <= now).sort((a, b) => b.startsAt - a.startsAt),
    cancelled: all?.filter(b => b.status === "cancelled").sort((a, b) => b.startsAt - a.startsAt),
  };
  const list = groups[tab];
  const byDay = new Map<string, Booking[]>();
  for (const b of [...(list ?? [])].sort((a, b) => a.startsAt - b.startsAt)) byDay.set(dayKey(b.startsAt), [...(byDay.get(dayKey(b.startsAt)) ?? []), b]);
  const today = dayKey(now), shown = month || dayKey(list?.[0]?.startsAt ?? now).slice(0, 7), sessions = byDay.get(picked) ?? [],
    hasSessions = [...byDay.keys()].some(d => d.startsWith(shown));
  return <View className="min-h-0 flex-1 gap-3">
    <Segmented label={tr("Sessions")} value={tab} onChange={id => { setTab(id); setMonth(""); setPicked(""); }}
      options={(Object.keys(SESSION_TABS) as Tab[]).map(id => ({ id, label: tr(SESSION_TABS[id]) + (groups[id] ? ` ${groups[id]!.length}` : "") }))} />
    <MonthHeader month={shown} today={today} onMonth={setMonth} />
    {!list ? <CalendarSkeleton /> : <>
      {!hasSessions ? <View accessibilityRole="summary" className="flex-row flex-wrap items-center gap-3">
        <Text className="text-sm text-muted-foreground">{tab === "upcoming" ? tr("No upcoming session this month.") : tab === "past" ? tr("No past session this month.") : tr("No cancelled session this month.")}</Text>
        {tab === "upcoming" && !list.length ? <Button variant="outline" size="sm" className="h-10" onPress={() => nav.go("coaches")}><Text>{tr("Find a coach")}</Text></Button> : null}
      </View> : null}
      <Month month={shown} today={today} allowPast selected={d => d === picked} disabled={d => !byDay.has(d)} pick={setPicked}
        cell={d => ({
          body: byDay.get(d)?.length ? <DayBoxes items={byDay.get(d)!}>
            {b => <DayChip key={b.id} tone={tab === "cancelled" ? "past" : "free"} label={time(b.startsAt)} testID={"session-" + b.id}
              accessibilityLabel={`${time(b.startsAt)}–${time(b.endsAt)} · ${b.with.username}`} onPress={() => setPicked(d)} />}
          </DayBoxes> : null,
        })} />
    </>}
    <Sheet open={!!picked} onClose={() => setPicked("")} title={picked ? longDay.format(toDate(picked)) : tr("Sessions")}
      description={`${tr(SESSION_TABS[tab])} · ${plural(sessions.length, "session")}`}>
      {sessions.length ? <SheetScrollView contentContainerClassName="gap-1">
        {sessions.map(b => <SessionRow key={b.id} b={b} now={now} />)}
      </SheetScrollView> : <Empty icon={CalendarDays} title={tr("No session for this filter on this day.")} />}
    </Sheet>
  </View>;
}

/** One session: when, with whom and why, then what can be done with it. */
export function SessionRow({ b, now, compact = false }: { b: Booking; now: number; compact?: boolean }) {
  useCoaching();
  const nav = useCoachingNav();
  const open = callOpen(b, now), waiting = coaching.waiting.has(b.id), over = b.endsAt <= now;
  return <View className={cn("gap-2 rounded-lg py-2.5", b.status === "cancelled" && "opacity-60")} testID={"booking-" + b.id}>
    <View className="flex-row items-center gap-3">
      <View className="w-24 shrink-0">
        <Text className="text-xs text-muted-foreground">{day(b.startsAt)}</Text>
        <Numeric className="text-base font-medium">{time(b.startsAt)}–{time(b.endsAt)}</Numeric>
      </View>
      <Face name={b.with.username} src={b.with.avatar} size={32} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink font-medium">{b.with.username}</Text>
          <Badge variant="secondary"><Text className="font-normal">{b.role === "student" ? tr("Your coach") : tr("Your student")}</Text></Badge>
        </View>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {b.status === "cancelled" ? (b.cancelledByMe ? tr("Cancelled by you") : tr("Cancelled by {0}", { 0: b.with.username }))
            : over ? b.note || tr("Session over") : `${relative(b.startsAt, now)}${b.note ? " · " + b.note : ""}`}
        </Text>
      </View>
      {!compact ? <Numeric className="shrink-0 text-sm text-muted-foreground">{price(b.priceCents)}</Numeric> : null}
    </View>
    <View className="flex-row flex-wrap items-center justify-end gap-1.5">
      {open ? <Button size="sm" className={cn("h-10", waiting && "opacity-90")} onPress={() => nav.go("call/" + b.id)}>
        <Icon as={Video} size={16} className="text-primary-foreground" />
        <Text>{waiting ? tr("{0} is waiting", { 0: b.with.username }) : tr("Join call")}</Text>
      </Button> : null}
      {over && b.status === "booked" && b.role === "student" ? <ReviewButton b={b} /> : null}
      {over && b.role === "coach" && b.review ? <Stars rating={b.review.rating} size={12} figure={false} /> : null}
      {b.conversationId ? <Button variant="ghost" size="icon" className="size-10" accessibilityLabel={tr("Message {0}", { 0: b.with.username })} onPress={() => nav.go("messages/" + b.conversationId)}>
        <Icon as={MessageSquare} size={18} />
      </Button> : null}
      {b.status === "booked" && !over && b.role === "coach" ? <MoveButton b={b} /> : null}
      {b.status === "booked" && !over ? <CancelButton b={b} /> : null}
    </View>
    {b.status === "booked" && !over ? <Text className="text-xs text-muted-foreground">
      {cancellationOpen(b.startsAt, now) ? tr("Cancellation allowed before {0}.", { 0: span(b.startsAt - CANCELLATION_NOTICE) }) : tr("Cancellation closed: this session starts within 24 hours.")}
    </Text> : null}
    {b.proposal && b.status === "booked" && !over ? <Offer b={b} /> : null}
  </View>;
}

/** Another time the coach offered: the student takes it or keeps the session where it is; the coach may take it back. */
export function Offer({ b }: { b: Booking }) {
  const { pending, run } = useAction();
  return <Alert variant="warning" icon={CalendarClock}>
    <Text className="text-sm">
      {(b.role === "student" ? tr("{0} offers to move it to", { 0: b.with.username }) : tr("You offered")) + " "}
      <Text className="text-sm font-medium tabular-nums">{span(b.proposal!.start, b.proposal!.end)}</Text>
      {b.role === "coach" ? <Text className="text-sm text-muted-foreground">{" "}{tr("· waiting for {0}", { 0: b.with.username })}</Text> : null}
    </Text>
    <View className="flex-row flex-wrap gap-1.5 pt-1.5">
      {b.role === "student" ? <>
        <Button size="sm" className="h-10" disabled={pending} onPress={() => run(() => coaching.answer(b.id, true), tr("Session moved"))}>
          <Icon as={Check} size={16} className="text-primary-foreground" /><Text>{tr("Move it")}</Text>
        </Button>
        <Button size="sm" variant="outline" className="h-10" disabled={pending} onPress={() => run(() => coaching.answer(b.id, false), tr("Session kept where it was"))}>
          <Text>{tr("Keep the time")}</Text>
        </Button>
      </> : <Button size="sm" variant="outline" className="h-10" disabled={pending} onPress={() => run(() => coaching.propose(b.id, null), tr("Offer taken back"))}>
        <Text>{tr("Take back")}</Text>
      </Button>}
    </View>
  </Alert>;
}

/** The coach offers another time: one of their free slots, which the student then takes or turns down. */
export function MoveButton({ b, label = false }: { b: Booking; label?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    {label ? <Button variant="outline" size="sm" className="h-10 flex-1" onPress={() => setOpen(true)}>
      <Icon as={CalendarClock} size={16} /><Text>{tr("Move")}</Text>
    </Button> : <Button variant="ghost" size="icon" className="size-10" accessibilityLabel={tr("Offer another time")} onPress={() => setOpen(true)}>
      <Icon as={CalendarClock} size={18} />
    </Button>}
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Offer another time")}
      description={tr("Now {0} with {1}. The session stays where it is until they accept.", { 0: span(b.startsAt, b.endsAt), 1: b.with.username })}>
      {open ? <MoveForm b={b} close={() => setOpen(false)} /> : null}
    </Sheet>
  </>;
}

function MoveForm({ b, close }: { b: Booking; close: () => void }) {
  useCoaching();
  const me = useAtomValue(userAtom)?.id ?? "";
  useEffect(() => { void coaching.load(`slots:${me}`); }, [me]);
  const data = coaching.slots.get(me);
  const days = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const slot of data?.slots ?? []) if (slot.start !== b.startsAt) map.set(dayKey(slot.start), [...(map.get(dayKey(slot.start)) ?? []), slot.start]);
    return map;
  }, [data, b.startsAt]);
  const [picked, setPicked] = useState(""), [start, setStart] = useState<number | null>(null);
  const { pending, run } = useAction();
  const shown = days.has(picked) ? picked : [...days.keys()][0] ?? "";
  return <View className="gap-5">
    {!data ? <View accessibilityLabel={tr("Loading")} className="gap-3">
      <Skeleton className="h-11" />
      <View className="flex-row flex-wrap gap-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-[22%]" />)}</View>
    </View> : !days.size ? <Empty icon={CalendarX} className="p-2">{tr("No free slot in the next four weeks: open more hours in your schedule.")}</Empty> : <View className="gap-3">
      <ChoiceButton label={tr("Day")} value={shown} className="w-full justify-between" options={[...days.keys()].map(d => ({ id: d, label: day(days.get(d)![0]!) }))}
        onChange={d => { setPicked(d); setStart(null); }} />
      <View className="flex-row flex-wrap gap-2">
        {(days.get(shown) ?? []).map(t => <Button key={t} variant={t === start ? "default" : "outline"} className="h-11 w-[23%] px-0" onPress={() => setStart(t)}>
          <Text className="tabular-nums">{time(t)}</Text>
        </Button>)}
      </View>
    </View>}
    <Button className="h-11" disabled={start == null || pending} onPress={async () => { if (await run(() => coaching.propose(b.id, start), tr("Offer sent to {0}", { 0: b.with.username }))) close(); }}>
      <Text>{pending ? tr("Sending…") : tr("Send the offer")}</Text>
    </Button>
  </View>;
}

/** Cancelling a session once confirmed; within its last 24 hours, only why it cannot be. */
export function CancelButton({ b, label = false }: { b: Booking; label?: boolean }) {
  const [closed, setClosed] = useState(false);
  const { run } = useAction();
  const when = tr("{0} at {1} with {2}.", { 0: day(b.startsAt), 1: time(b.startsAt), 2: b.with.username });
  async function cancel() {
    if (!cancellationOpen(b.startsAt)) return setClosed(true);
    if (!(await ask({ title: tr("Cancel this session?"), text: tr("{0} They are told at once and the slot opens again.", { 0: when }), action: tr("Cancel the session"), cancel: tr("Keep it") }))) return;
    if (!cancellationOpen(b.startsAt)) return setClosed(true);
    await run(() => coaching.cancel(b.id), tr("Session cancelled"));
  }
  return <>
    {label ? <Button variant="outline" size="sm" className="h-10 flex-1" onPress={cancel}>
      <Icon as={X} size={16} /><Text>{tr("Cancel")}</Text>
    </Button> : <Button variant="ghost" size="icon" className="size-10" accessibilityLabel={tr("Cancel the session")} onPress={cancel}>
      <Icon as={X} size={18} />
    </Button>}
    {/* Nothing to confirm: the same sheet as a confirmation, closed by its one button. */}
    <Sheet open={closed} onClose={() => setClosed(false)} title={tr("Cancellation is closed")}
      description={tr("{0} Sessions cannot be cancelled in the final 24 hours before they start. Cancellation deadline: {1}. Cancellations must be made before this time.", { 0: when, 1: span(b.startsAt - CANCELLATION_NOTICE) })}>
      <View className="flex-row justify-end"><Button variant="outline" onPress={() => setClosed(false)}><Text>{tr("Close")}</Text></Button></View>
    </Sheet>
  </>;
}

/** Rating a past session: five stars and a few words, changeable later. */
function ReviewButton({ b }: { b: Booking }) {
  const [open, setOpen] = useState(false), [rating, setRating] = useState(b.review?.rating ?? 0), [comment, setComment] = useState(b.review?.comment ?? "");
  const { pending, run } = useAction();
  return <>
    {b.review ? <Button variant="ghost" size="sm" className="h-10" accessibilityLabel={tr("Edit your review")} onPress={() => setOpen(true)}>
      <Stars rating={b.review.rating} size={12} figure={false} />
    </Button> : <Button size="sm" variant="outline" className="h-10" onPress={() => setOpen(true)}>
      <Icon as={Star} size={16} /><Text>{tr("Review")}</Text>
    </Button>}
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Your session with {0}", { 0: b.with.username })} description={tr("{0} · other players read your review on the coach's page.", { 0: day(b.startsAt) })}>
      <Rating value={rating} onChange={setRating} />
      <SheetInput value={comment} onChangeText={setComment} maxLength={1000} multiline numberOfLines={4} textAlignVertical="top" className="min-h-24 py-2"
        placeholder={tr("What helped you most?")} accessibilityLabel={tr("Comment")} />
      <Button className="h-11" disabled={!rating || pending} onPress={async () => { if (await run(() => coaching.review(b.id, rating, comment.trim()), tr("Thanks for your review"))) setOpen(false); }}>
        <Text>{pending ? tr("Saving…") : tr("Save review")}</Text>
      </Button>
    </Sheet>
  </>;
}

/** One to five stars, picked with a tap: every star up to the one chosen lights up. */
function Rating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const warning = useColors().variables["--warning"];
  return <View accessibilityRole="radiogroup" accessibilityLabel={tr("Rating")} className="flex-row justify-center">
    {[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={tr("{0} out of 5", { 0: n })} accessibilityState={{ checked: n === value }} onPress={() => onChange(n)}
      className="size-12 items-center justify-center">
      <Icon as={Star} size={32} className={n <= value ? "text-warning" : "text-muted-foreground/40"} fill={n <= value ? warning : "none"} />
    </Pressable>)}
  </View>;
}
