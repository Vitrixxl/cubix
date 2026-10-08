import { useAtomValue } from "jotai";
import { CalendarCheck, CalendarX, Check, Clock, Languages, MessageSquare, SearchX, Star, Timer, UserRoundX, Users } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { fmtTime, plural } from "../../../../src/client/lib/format";
import { localFormat, tr } from "../../../../src/client/i18n";
import { EVENTS, eventInfo, type EventId } from "../../../../src/shared/puzzles";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { userAtom } from "../../state";
import { useColors } from "../../theme";
import { ChoiceButton, PuzzleIcon } from "../PuzzlePicker";
import { BackButton, Bar, Empty, Figure, Numeric, Page, PageHead, SearchField, SectionHead, Surface } from "../layout";
import { CANCELLATION_TERMS, cancellationOpen, coaching, price, useCoaching, type Coach } from "./client";
import { CalendarSkeleton, Month, MonthHeader, NarrowBar } from "./calendar";
import { Activity, Learned, PuzzleCard } from "./person";
import { CheckRow, Events, Face, Stars, Strip, day, dayKey, relative, span, time, useAction, useCoachingNav } from "./parts";

/** Finding a coach (the web's coaching/browse.tsx): every coach as a card, then a coach's page, then booking one of their slots. */

export function CoachList() {
  const c = useCoaching(), nav = useCoachingNav();
  useEffect(() => { void coaching.load("coaches"); }, []);
  const [query, setQuery] = useState(""), [event, setEvent] = useState("all");
  const list = c.coaches;
  const taught = useMemo(() => EVENTS.filter(e => list?.some(c => c.events.includes(e.id))), [list]);
  const shown = list?.filter(c => (event === "all" || c.events.includes(event)) &&
    query.toLowerCase().split(/\s+/).every(w => [c.username, c.headline, c.bio, ...c.languages].join(" ").toLowerCase().includes(w)));
  return <View className="min-h-0 flex-1 gap-3">
    <View className="flex-row items-center gap-2">
      <SearchField value={query} onChangeText={setQuery} placeholder={tr("Name, language, method…")} className="min-w-0 flex-1" />
      <ChoiceButton label={tr("Event")} value={event} onChange={setEvent} className="max-w-40"
        options={[{ id: "all", label: tr("Every event") }, ...taught.map(e => ({ id: e.id as string, label: e.label }))]} />
    </View>
    {!shown ? <View accessibilityLabel={tr("Loading")} className="gap-3">{[0, 1, 2].map(i => <CoachCardSkeleton key={i} />)}</View>
      : !shown.length ? <Empty icon={list?.length ? SearchX : Users}>
        {list?.length ? tr("No coach matches your search.") : tr("No coach has opened their page yet.")}
        {!c.isCoach && !list?.length ? <Button variant="outline" onPress={() => nav.go("apply")}><Text>{tr("Become the first coach")}</Text></Button> : null}
      </Empty>
        : <FlatList data={shown} keyExtractor={c => c.id} className="-mx-4" contentContainerClassName="gap-3 px-4 pb-2" keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <CoachCard c={item} onPress={() => nav.go("coach/" + item.id)} />} />}
  </View>;
}

/** A coach's card on its way: the face, the name and lines, the band of figures. */
function CoachCardSkeleton() {
  return <View className="h-52 gap-3 rounded-xl border border-border p-4">
    <View className="flex-row items-center gap-3.5">
      <Skeleton className="size-16 rounded-full" />
      <View className="flex-1 gap-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></View>
    </View>
    <Skeleton className="h-4 w-4/5" />
    <Skeleton className="h-9 rounded-xl" />
    <Skeleton className="mt-auto h-4 w-2/3" />
  </View>;
}

function CoachCard({ c, onPress }: { c: Coach; onPress: () => void }) {
  const top = c.practice?.puzzles[0];
  return <Pressable accessibilityRole="button" accessibilityLabel={c.username} onPress={onPress} testID={"coach-" + c.username}
    className="gap-3 rounded-xl border border-border bg-card p-4 active:border-primary/40 active:bg-muted/30">
    <View className="flex-row items-center gap-3.5">
      <Face name={c.username} src={c.avatar} size={64} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className="text-base font-semibold tracking-tight">{c.username}</Text>
        <View className="flex-row items-center gap-1.5"><Stars rating={c.rating} size={12} /><Text className="text-xs text-muted-foreground">· {plural(c.reviews, "review")}</Text></View>
        <Text className="text-xs text-muted-foreground">{plural(c.sessions, "session")} · {plural(c.students, "student")}</Text>
      </View>
      <View className="shrink-0 items-end self-start">
        <Numeric className="font-medium">{price(c.priceCents)}</Numeric>
        <Text className="text-xs text-muted-foreground">{tr("{0} min", { 0: c.sessionMinutes })}</Text>
      </View>
    </View>
    <Text numberOfLines={2} className="min-h-10 text-sm text-muted-foreground">{c.headline || tr("Speedcubing coach")}</Text>
    {top ? <Strip className="flex-nowrap items-center gap-x-2.5 px-3 py-2">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {eventInfo(top.puzzle) ? <PuzzleIcon puzzle={top.puzzle as EventId} size={18} /> : null}
        <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{tr(eventInfo(top.puzzle)?.label ?? top.puzzle)}</Text>
      </View>
      <Numeric className="shrink-0 text-xs text-muted-foreground">{tr("PB")}{" "}<Text className="text-xs font-medium text-foreground">{fmtTime(top.best)}</Text></Numeric>
      {top.ao5 != null ? <Numeric className="shrink-0 text-xs text-muted-foreground">{tr("Ao5")}{" "}<Text className="text-xs font-medium text-foreground">{fmtTime(top.ao5)}</Text></Numeric> : null}
    </Strip> : null}
    <View className="flex-row items-center justify-between gap-2 pt-1">
      <Events events={c.events} />
      <View className="shrink-0 flex-row items-center gap-1.5">
        <Icon as={CalendarCheck} size={14} className={c.nextSlot ? "text-foreground" : "text-muted-foreground"} />
        <Text className={cn("text-xs", c.nextSlot ? "text-foreground" : "text-muted-foreground")}>{!c.newStudents ? tr("Full · own students only") : c.nextSlot ? span(c.nextSlot) : tr("No open slot")}</Text>
      </View>
    </View>
  </Pressable>;
}

const monthFormat = localFormat({ month: "long", year: "numeric" });

/** A coach's page: who they are and the way to book them on top, their figures as a coach and as a cuber, how they practise, then what their students say. */
export function CoachPage({ id }: { id: string }) {
  const cs = useCoaching(), nav = useCoachingNav(), { run } = useAction();
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load(`slots:${id}`);
    void coaching.load("bookings");
  }, [id]);
  const c = cs.profiles.get(id), own = id === useAtomValue(userAtom)?.id,
    // Messages open once a session is booked with them, even one cancelled since.
    booked = cs.bookings?.some(b => b.coachId === id);
  const message = () => run(async () => nav.go("messages/" + (await coaching.talkTo(id)).id));
  return <Page>
    <PageHead lead={<BackButton label={own ? tr("Your coach profile") : tr("Every coach")} onPress={() => nav.back(own ? "profile" : "coaches")} />}
      title={c ? c.username : <Skeleton className="h-6 w-32" />}>
      {!own && c && booked ? <Button variant="outline" className="h-11 rounded-lg" onPress={message}>
        <Icon as={MessageSquare} size={16} /><Text>{tr("Message")}</Text>
      </Button> : null}
    </PageHead>
    {!c ? <ProfileSkeleton /> : <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-4 px-4 pb-4">
      <About c={c} own={own} onBook={() => nav.go(`coach/${c.id}/book`)} onSchedule={() => nav.go("schedule")} />
      <FigureCard title={tr("As a coach")} sub={tr("since {0}", { 0: monthFormat.format(c.since) })}>
        <Figure className="flex-1" label={tr("Rating")} value={c.rating == null ? "New" : c.rating.toFixed(1)} tone="warning" size="lg" />
        <Figure className="flex-1" label={tr("Sessions given")} value={String(c.sessions)} size="lg" />
        <Figure className="flex-1" label={tr("Students")} value={String(c.students)} size="lg" />
      </FigureCard>
      <FigureCard title={tr("As a cuber")} sub={c.practice?.lastAt ? tr("last solve {0}", { 0: relative(new Date(c.practice.lastAt).getTime()) }) : tr("no solve yet")}>
        <Figure className="flex-1" label={tr("Solves")} value={(c.practice?.solves ?? 0).toLocaleString()} size="lg" />
        <Figure className="flex-1" label={tr("Active days · 30 d")} value={String(c.practice?.activeDays ?? 0)} size="lg" />
        <Figure className="flex-1" label={tr("Cases learned")} value={String(c.practice?.learned ?? 0)} size="lg" />
      </FigureCard>
      <Activity days={c.history?.days ?? []} />
      <Learned ids={c.history?.learned ?? []} />
      <Surface className="gap-3 p-4" accessibilityLabel={tr("Puzzles")}>
        <SectionHead title={tr("Times per puzzle")} meta={<Text className="text-xs text-muted-foreground">{tr("most solved first")}</Text>} />
        {!c.practice?.puzzles.length ? <Empty icon={Timer}>{tr("No timed solve yet.")}</Empty>
          : <View className="gap-5">{c.practice.puzzles.map(x => <PuzzleCard key={x.puzzle} x={x} history={c.history?.puzzles[x.puzzle]} />)}</View>}
      </Surface>
      <Reviews c={c} />
    </ScrollView>}
  </Page>;
}

/** The coach in full: their picture, headline, terms and presentation, then the way to book. */
function About({ c, own, onBook, onSchedule }: { c: Coach; own: boolean; onBook: () => void; onSchedule: () => void }) {
  const slots = coaching.slots.get(c.id), next = slots?.slots[0]?.start ?? c.nextSlot;
  return <Surface className="gap-4 p-4">
    <View className="flex-row gap-4">
      <Face name={c.username} src={c.avatar} size={72} />
      <View className="min-w-0 flex-1 gap-1.5">
        <Text className="text-lg font-semibold tracking-tight">{c.headline || c.username}</Text>
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <View className="flex-row items-center gap-1.5"><Stars rating={c.rating} size={12} /><Text className="text-xs text-muted-foreground">· {plural(c.reviews, "review")}</Text></View>
          <View className="flex-row items-center gap-1"><Icon as={Clock} size={14} className="text-muted-foreground" /><Text className="text-xs text-muted-foreground">{tr("{0} min sessions", { 0: c.sessionMinutes })}</Text></View>
          {c.languages.length ? <View className="flex-row items-center gap-1"><Icon as={Languages} size={14} className="text-muted-foreground" /><Text className="text-xs text-muted-foreground">{c.languages.join(", ")}</Text></View> : null}
        </View>
      </View>
    </View>
    <Text className="text-sm text-muted-foreground">{c.bio || tr("This coach has not written about themselves yet.")}</Text>
    {c.events.length ? <View className="flex-row flex-wrap gap-1.5">
      {c.events.map(e => <Badge key={e} variant="secondary">{eventInfo(e) ? <PuzzleIcon puzzle={e as EventId} size={14} /> : null}<Text>{tr(eventInfo(e)?.label ?? e)}</Text></Badge>)}
    </View> : null}
    <View className="gap-3 border-t border-border pt-4">
      <View className="flex-row items-baseline gap-2">
        <Numeric className="text-2xl font-semibold text-primary">{price(c.priceCents)}</Numeric>
        <Text className="text-muted-foreground">{tr("for {0} min", { 0: c.sessionMinutes })}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Icon as={CalendarCheck} size={14} className="text-muted-foreground" />
        <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{!c.newStudents && !own ? tr("Own students only") : next ? tr("Next free slot {0}", { 0: span(next) }) : tr("No open slot")}</Text>
      </View>
      {own ? <Button variant="outline" size="lg" onPress={onSchedule}><Text>{tr("Edit your schedule")}</Text></Button>
        : <Button size="lg" onPress={onBook} testID="open-booking"><Icon as={CalendarCheck} size={18} className="text-primary-foreground" /><Text>{tr("Book a session")}</Text></Button>}
    </View>
  </Surface>;
}

/** Three figures under a title, one card. */
function FigureCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <Surface className="gap-2 px-4 pt-2 pb-4">
    <SectionHead title={title} meta={<Text numberOfLines={1} className="text-xs text-muted-foreground">{sub}</Text>} />
    <View className="flex-row gap-3">{children}</View>
  </Surface>;
}

/** What the students say: the average and the spread of the ratings, then every review. */
function Reviews({ c }: { c: Coach }) {
  const counts = c.ratingCounts ?? [0, 0, 0, 0, 0], most = Math.max(1, ...counts);
  return <Surface className="gap-2 p-4">
    <SectionHead title={tr("Reviews")} meta={c.reviews || undefined} />
    {!c.reviewList?.length ? <Empty icon={Star}>{tr("No review yet.")}</Empty> : <>
      <View accessibilityLabel={tr("Ratings")} className="flex-row items-center gap-5 pt-1 pb-3">
        <View className="shrink-0 items-center gap-1">
          <Numeric className="text-4xl font-semibold tracking-tight">{c.rating?.toFixed(1) ?? "–"}</Numeric>
          <Stars rating={c.rating} size={12} figure={false} />
          <Text className="text-xs text-muted-foreground">{plural(c.reviews, "review")}</Text>
        </View>
        <View className="flex-1 gap-1.5">
          {[5, 4, 3, 2, 1].map(n => <View key={n} className="flex-row items-center gap-2">
            <Numeric className="w-3 text-xs text-muted-foreground">{n}</Numeric>
            <Bar ratio={counts[n - 1]! / most} fill="bg-warning" className="h-1.5 flex-1" />
            <Numeric className="w-6 text-right text-xs text-muted-foreground">{counts[n - 1]}</Numeric>
          </View>)}
        </View>
      </View>
      <View className="gap-2.5">
        {c.reviewList.map((r, i) => <View key={i} className="gap-2.5 rounded-lg bg-muted/40 p-3.5">
          <View className="flex-row items-center gap-2.5">
            <Face name={r.username} size={32} />
            <View className="min-w-0 flex-1"><Text numberOfLines={1} className="font-medium">{r.username}</Text><Text className="text-xs text-muted-foreground">{day(r.at)}</Text></View>
            <Stars rating={r.rating} size={13} figure={false} />
          </View>
          {r.comment ? <Text className="leading-relaxed text-foreground/85">{r.comment}</Text> : null}
        </View>)}
      </View>
    </>}
  </Surface>;
}

/** A coach's page on its way: the card about them, the two cards of figures, the reviews. */
function ProfileSkeleton() {
  return <View accessibilityLabel={tr("Loading")} className="gap-4">
    <View className="flex-row gap-4 rounded-xl border border-border p-4">
      <Skeleton className="size-18 rounded-full" />
      <View className="flex-1 gap-2.5"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></View>
    </View>
    {[0, 1].map(i => <View key={i} className="gap-3 rounded-xl border border-border p-4">
      <Skeleton className="h-4 w-1/3" />
      <View className="flex-row gap-3">{[0, 1, 2].map(j => <Skeleton key={j} className="h-10 flex-1" />)}</View>
    </View>)}
  </View>;
}

/** Booking a coach: their calendar of free slots and the times of the chosen day, the whole page. */
export function BookPage({ id }: { id: string }) {
  const cs = useCoaching(), nav = useCoachingNav();
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load(`slots:${id}`);
  }, [id]);
  const c = cs.profiles.get(id), data = cs.slots.get(id), own = id === useAtomValue(userAtom)?.id;
  // Opened from a conversation, the way back returns to it.
  const fromConversation = nav.previous?.startsWith("messages/");
  return <Page>
    <PageHead lead={<BackButton label={fromConversation ? tr("Back to conversation") : c?.username ?? tr("Back")} onPress={() => nav.back(fromConversation ? nav.previous! : "coach/" + id)} />}
      title={tr("Book a session")}
      sub={c ? tr("with {0} · {1} min · {2}", { 0: c.username, 1: data?.sessionMinutes ?? c.sessionMinutes, 2: price(data?.priceCents ?? c.priceCents) }) : undefined} />
    {own ? <Surface className="flex-1"><Empty icon={CalendarCheck}>{tr("Players book you here.")}</Empty></Surface> : <Booking id={id} />}
  </Page>;
}

/** One step of booking, numbered: ticked once done, filled while it waits on the player. */
function Step({ n, state, children, aside }: { n: number; state: "done" | "now" | "later"; children: string; aside?: string }) {
  return <View className="flex-row items-center gap-2">
    <View className={cn("size-5 items-center justify-center rounded-full", state === "done" ? "bg-primary/15" : state === "now" ? "bg-primary" : "bg-muted")}>
      {state === "done" ? <Icon as={Check} size={12} strokeWidth={3} className="text-primary" />
        : <Numeric className={cn("text-xs font-semibold", state === "now" ? "text-primary-foreground" : "text-muted-foreground")}>{n}</Numeric>}
    </View>
    <Text accessibilityRole="header" className={cn("shrink text-sm font-medium", state === "later" && "text-muted-foreground")}>{children}</Text>
    {aside ? <Text className="ml-auto text-xs text-muted-foreground">{aside}</Text> : null}
  </View>;
}

/** The free slots in the player's time on the shared calendar: a day, a time, a note, the policy accepted; then Book. */
function Booking({ id }: { id: string }) {
  const cs = useCoaching(), nav = useCoachingNav(), colors = useColors();
  const data = cs.slots.get(id), c = cs.profiles.get(id);
  const byDay = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    for (const slot of data?.slots ?? []) map.set(dayKey(slot.start), [...(map.get(dayKey(slot.start)) ?? []), slot]);
    return map;
  }, [data]);
  const [picked, setPicked] = useState(""), [slot, setSlot] = useState<number | null>(null), [note, setNote] = useState(""), [accepted, setAccepted] = useState(false);
  const { pending, run } = useAction();
  // The first day with a slot comes chosen; a slot taken meanwhile is dropped.
  const chosenDay = byDay.has(picked) ? picked : byDay.keys().next().value ?? "";
  const times = byDay.get(chosenDay) ?? [], chosen = times.find(t => t.start === slot);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone, today = dayKey(Date.now()), [month, setMonth] = useState(""), shown = month || (chosenDay || today).slice(0, 7);
  async function book() {
    if (!chosen || !accepted || pending) return;
    const ok = await run(() => coaching.book(id, chosen.start, note.trim()), booking => ({ title: tr("Session booked"), description: tr("{0} with {1}", { 0: span(booking.startsAt, booking.endsAt), 1: booking.with.username }) }));
    if (ok) nav.go("sessions");
    else {
      void coaching.load(`slots:${id}`);
      setSlot(null);
    }
  }
  if (!data) return <View accessibilityLabel={tr("Loading")} className="flex-1 gap-3">
    <Skeleton className="h-10 w-64" />
    <CalendarSkeleton />
  </View>;
  if (!data.accepting || !data.slots.length) return <Surface className="flex-1">
    <Empty icon={!data.welcome ? UserRoundX : CalendarX}>
      {!data.welcome ? tr("{0} is not taking new students right now. Write to them to ask.", { 0: c?.username ?? tr("This coach") })
        : data.accepting ? tr("{0} has no open slot in the next four weeks.", { 0: c?.username ?? tr("This coach") }) : tr("This coach is not taking bookings right now.")}
    </Empty>
  </Surface>;
  return <View className="min-h-0 flex-1 gap-3">
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-3 px-4 pb-2" keyboardShouldPersistTaps="handled">
      <MonthHeader month={shown} today={today} onMonth={setMonth} />
      <View className="flex-row items-center gap-1.5">
        <View className="size-1.5 rounded-full bg-primary" />
        <Text className="text-xs text-muted-foreground">{tr("Free slots · times in {0}", { 0: zone })}</Text>
      </View>
      <Month month={shown} today={today} className="h-80 flex-none" selected={d => d === chosenDay} disabled={d => !byDay.has(d)}
        pick={d => { setPicked(d); setSlot(null); }}
        // Days on a phone are too narrow for their times: a line shows the free ones, the times come below.
        cell={(d, past) => ({ body: !past && byDay.get(d)?.length ? <NarrowBar /> : null })} />
      <Surface className="gap-5 p-4" testID="booking-details">
        <View className="gap-3">
          <Step n={1} state={chosen ? "done" : "now"} aside={chosenDay ? day(times[0]?.start ?? Date.now()) : undefined}>{tr("Pick a time")}</Step>
          <View className="flex-row flex-wrap gap-2">
            {times.map(t => <Button key={t.start} variant={t.start === slot ? "default" : "outline"} className="h-11 w-[31%] px-0" testID={"slot-" + t.start} onPress={() => setSlot(t.start)}>
              <Text className="tabular-nums">{time(t.start)}</Text>
            </Button>)}
          </View>
        </View>
        <View className="gap-3">
          <Step n={2} state={chosen ? (note.trim() ? "done" : "now") : "later"}>{tr("What would you like to work on?")}</Step>
          <TextInput value={note} onChangeText={setNote} maxLength={1000} multiline textAlignVertical="top" accessibilityLabel={tr("What would you like to work on?")}
            placeholder={tr("Optional: your average, the step you struggle with…")} placeholderTextColor={colors.mutedForeground}
            className="min-h-20 rounded-lg border border-input bg-input/30 px-3 py-2 font-sans text-base text-foreground" />
        </View>
        <View className="gap-3">
          <Text accessibilityRole="header" className="text-sm font-medium">{tr("Cancellation policy")}</Text>
          <Text className="text-xs text-muted-foreground">{CANCELLATION_TERMS}</Text>
          {chosen && !cancellationOpen(chosen.start) ? <Alert variant="warning"><Text className="text-xs text-warning">{tr("This session starts within 24 hours and cannot be cancelled once booked.")}</Text></Alert> : null}
          <CheckRow checked={accepted} onChange={setAccepted}>{tr("I have read and accept the cancellation policy.")}</CheckRow>
        </View>
      </Surface>
    </ScrollView>
    <View className="gap-1.5">
      <Button size="lg" disabled={!chosen || !accepted || pending} onPress={book} testID="book">
        <Icon as={CalendarCheck} size={18} className="text-primary-foreground" />
        <Text>{chosen ? tr("Book {0}", { 0: span(chosen.start, chosen.end) }) : tr("Pick a time to book")}</Text>
      </Button>
      <Text className="text-center text-xs text-muted-foreground">{tr("Confirmed at once · payment comes later")}</Text>
    </View>
  </View>;
}
