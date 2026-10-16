import { useAtomValue } from "jotai";
import { CalendarCheck, CalendarX, ChevronLeft, ChevronRight, MessageSquare, SearchX, SlidersHorizontal, Star, Timer, UserRoundX, Users } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { plural } from "../../../../src/client/lib/format";
import { wcaUrl } from "../../../../src/client/lib/wca";
import { localFormat, locale, said, tr } from "../../../../src/client/i18n";
import { EVENTS, eventInfo } from "../../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useLayout } from "../../hooks/useLayout";
import { userAtom } from "../../state";
import { openUrl } from "../../lib/social";
import { useColors } from "../../theme";
import { PushedBar } from "../AppBar";
import { Chip } from "../Chips";
import { SheetChoice } from "../PuzzlePicker";
import { Sheet } from "../Sheet";
import { Pill } from "../community/marks";
import { Bar, Empty, Numeric, SearchField } from "../layout";
import { CANCELLATION_NOTICE, CANCELLATION_TERMS, cancellationOpen, coaching, mondayOf, price, useCoaching, zone, type Coach } from "./client";
import { Activity, Learned, PuzzleCard } from "./person";
import { CheckRow, Face, Stars, day, dayKey, span, time, useAction, useCoachingNav } from "./parts";

/**
 * Finding a coach (the web's coaching/browse.tsx): every coach as a card with their next slot and price, searched,
 * then filtered and sorted in a sheet; a coach pushes their page, who they are and their week of slots to book, the booking stuck at the
 * bottom; then their times, practice and reviews. The booking alone (from a conversation) keeps the same panel.
 */

const WEEK = 7 * 86_400_000;
const SORTS = [{ id: "next", label: "Next slot first" }, { id: "price", label: "Cheapest first" }, { id: "rating", label: "Best rated first" }];
const PRICES = [
  { id: "any", label: "Any price" }, { id: "0", label: "Free" }, { id: "1000", label: "Up to €10" },
  { id: "2000", label: "Up to €20" }, { id: "3000", label: "Up to €30" }, { id: "5000", label: "Up to €50" },
];

/** Every coach, in two columns on a tablet; on a wide screen a coach's page docks beside the list, `selected` marked. */
export function CoachList({ selected }: { selected?: string }) {
  const c = useCoaching(), nav = useCoachingNav(), { tablet, wide } = useLayout(), columns = tablet ? 2 : 1;
  useEffect(() => { void coaching.load("coaches"); }, []);
  const [query, setQuery] = useState(""), [event, setEvent] = useState("all"), [language, setLanguage] = useState("all"), [most, setMost] = useState("any"),
    [soon, setSoon] = useState(false), [sort, setSort] = useState("next"), [filtering, setFiltering] = useState(false);
  const list = c.coaches;
  const taught = useMemo(() => EVENTS.filter(e => list?.some(c => c.events.includes(e.id))), [list]),
    spoken = useMemo(() => [...new Set(list?.flatMap(c => c.languages) ?? [])].sort(), [list]);
  const now = Date.now();
  const shown = list?.filter(c => (event === "all" || c.events.includes(event)) && (language === "all" || c.languages.includes(language)) &&
    (most === "any" || c.priceCents <= Number(most)) && (!soon || (!!c.nextSlot && c.nextSlot < now + WEEK)) &&
    query.toLowerCase().split(/\s+/).every(w => [c.username, c.headline, c.bio, ...c.languages].join(" ").toLowerCase().includes(w)))
    .sort((a, b) => sort === "price" ? a.priceCents - b.priceCents : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) : (a.nextSlot ?? Infinity) - (b.nextSlot ?? Infinity));
  // What narrows the list (the order does not), counted on the filter button.
  const active = [event !== "all", soon, language !== "all", most !== "any"].filter(Boolean).length;
  const reset = () => { setEvent("all"); setSoon(false); setLanguage("all"); setMost("any"); setSort("next"); };
  return <View className="min-h-0 flex-1 gap-2.5">
    <View className="flex-row items-center gap-2">
      <SearchField value={query} onChangeText={setQuery} placeholder={tr("Name, method, speciality…")} className="min-w-0 flex-1" />
      <Pill icon={SlidersHorizontal} text={active ? String(active) : undefined} label={tr("Filter")} tone={active ? "soft" : "muted"} onPress={() => setFiltering(true)} className={cn("h-11", !active && "w-11")} />
    </View>
    <Text className="text-base font-bold tracking-tight">{shown ? plural(shown.length, "coach") : tr("Coaches")}</Text>
    {/* The filters, the order and the time zone of the slots in one sheet. */}
    <Sheet open={filtering} onClose={() => setFiltering(false)} title={tr("Filter")} description={tr("times in {0}", { 0: zone() })} scroll
      right={active || sort !== "next" ? <Button variant="ghost" size="sm" onPress={reset}><Text>{tr("Reset")}</Text></Button> : null}>
      <SheetChoice label={tr("Event")} columns={2} value={event} onChange={setEvent} options={[{ id: "all", label: tr("Every event") }, ...taught.map(e => ({ id: e.id as string, label: e.label }))]} />
      <Chip icon={CalendarCheck} on={soon} onPress={() => setSoon(!soon)} className="self-start">{tr("Free this week")}</Chip>
      {spoken.length > 1 ? <SheetChoice label={tr("Language")} columns={2} value={language} onChange={setLanguage} options={[{ id: "all", label: tr("Every language") }, ...spoken.map(l => ({ id: l, label: l }))]} /> : null}
      <SheetChoice label={tr("Price")} columns={2} value={most} onChange={setMost} options={PRICES} />
      <SheetChoice label={tr("Sort")} columns={1} value={sort} onChange={setSort} options={SORTS} />
    </Sheet>
    {!shown ? <View accessibilityLabel={tr("Loading")} className="gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-32 rounded-3xl" />)}</View>
      : !shown.length ? <Empty icon={list?.length ? SearchX : Users}>
        {list?.length ? tr("No coach matches your search.") : tr("No coach has opened their page yet.")}
        {!c.isCoach && !list?.length ? <Button variant="outline" onPress={() => nav.go("apply", true)}><Text>{tr("Become a coach")}</Text></Button> : null}
      </Empty>
        : <FlatList key={columns} data={shown} extraData={selected} keyExtractor={c => c.id} numColumns={columns} className={cn("min-h-0 flex-1", tablet && "-mx-1")} contentContainerClassName={tablet ? "pb-2" : "gap-2 pb-2"} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <View className={cn(tablet && "w-1/2 p-1")}><CoachCard c={item} on={item.id === selected} onPress={() => nav.go("coach/" + item.id, wide)} /></View>} />}
  </View>;
}

/** A coach in the list: the face, the name and their rating, the price on the right, what they teach, then their next slot and how many more are open. */
function CoachCard({ c, onPress, on = false }: { c: Coach; onPress: () => void; on?: boolean }) {
  const line = [c.headline || tr("Speedcubing coach"), c.languages.join(", ")].filter(Boolean).join(" · ");
  return <Pressable accessibilityRole="button" accessibilityLabel={c.username} accessibilityState={{ selected: on }} onPress={onPress} testID={"coach-" + c.username}
    className={cn("gap-2.5 rounded-3xl bg-card p-3.5 active:bg-muted/40", on && "bg-accent")}>
    <View className="flex-row items-center gap-2.5">
      <Face name={c.username} src={c.avatar} size={40} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-base font-bold tracking-tight">{c.username}</Text>
        <Numeric className="text-xs text-muted-foreground">{c.rating == null ? tr("New") : <><Text className="text-xs font-extrabold text-warning">★ {c.rating.toFixed(1)}</Text> · {plural(c.reviews, "review")}</>}</Numeric>
      </View>
      <View className="items-end">
        <Numeric className={cn("text-xl font-extrabold tracking-tight", !c.priceCents && "text-success")}>{price(c.priceCents)}</Numeric>
        <Text className="text-xs text-muted-foreground">{tr("{0} min", { 0: c.sessionMinutes })}</Text>
      </View>
    </View>
    <Text numberOfLines={2} className="text-[13px] text-muted-foreground">{line}</Text>
    <View className="flex-row items-center gap-2">
      {!c.newStudents ? <Text className="text-xs text-muted-foreground">{tr("Full · own students only")}</Text>
        : c.nextSlot ? <>
          <View className="h-8 justify-center rounded-full bg-muted px-3"><Numeric className="text-[13px] font-semibold">{span(c.nextSlot)}</Numeric></View>
          {c.openSlots && c.openSlots > 1 ? <Numeric className="text-xs text-muted-foreground">+{c.openSlots - 1}</Numeric> : null}
        </> : <Text className="text-xs text-muted-foreground">{tr("No open slot")}</Text>}
    </View>
  </Pressable>;
}

/**
 * A coach's page, pushed from the list: who they are, their figures, their words and a review, their week of slots
 * with the booking stuck at the bottom; then their times per puzzle, their practice and every review. `docked` beside
 * the list on a wide screen, it closes back to the list alone.
 */
export function CoachPage({ id, docked = false }: { id: string; docked?: boolean }) {
  const cs = useCoaching(), nav = useCoachingNav(), { run } = useAction(), scroller = useRef<ScrollView>(null), reviewsAt = useRef(0);
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load("bookings");
  }, [id]);
  const c = cs.profiles.get(id) ?? cs.coaches?.find(x => x.id === id), own = id === useAtomValue(userAtom)?.id,
    // Messages open once a session is booked with them, even one cancelled since.
    booked = cs.bookings?.some(b => b.coachId === id);
  const message = () => run(async () => nav.go("messages/" + (await coaching.talkTo(id)).id));
  return <View className="min-h-0 flex-1">
    <PushedBar title={tr("Coach")} back={docked ? "close" : "back"} onBack={() => docked ? nav.go("coaches", true) : nav.back(own ? "profile" : "coaches")}>
      {c?.reviews ? <Pressable accessibilityRole="button" onPress={() => scroller.current?.scrollTo({ y: reviewsAt.current })} className="h-10 justify-center rounded-lg px-1.5 active:bg-muted">
        <Text className="text-[13px] font-bold text-muted-foreground">{plural(c.reviews, "review")}</Text>
      </Pressable> : null}
      {!own && c && booked ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Message")} onPress={message} className="size-10 items-center justify-center rounded-xl border border-border bg-muted active:bg-muted/60">
        <Icon as={MessageSquare} size={17} />
      </Pressable> : null}
    </PushedBar>
    {!c ? <ProfileSkeleton /> : <Booking id={id} scroller={scroller} head={<CoachHead c={c} />}
      after={<>
        <Times c={c} />
        <Activity days={c.history?.days ?? []} />
        <Learned ids={c.history?.learned ?? []} />
        <View onLayout={e => { reviewsAt.current = e.nativeEvent.layout.y; }}><Reviews c={c} /></View>
      </>} />}
  </View>;
}

/** A coach in a few lines: the face, the name, what they teach, their figures, their words (more on a tap) and a review. */
function CoachHead({ c }: { c: Coach }) {
  const [more, setMore] = useState(false), review = c.reviewList?.find(r => r.comment);
  return <View className="gap-3">
    <View className="flex-row items-center gap-3">
      <Face name={c.username} src={c.avatar} size={64} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} accessibilityRole="header" className="min-w-0 shrink text-xl font-extrabold tracking-[-0.03em]">{c.username}</Text>
          {c.wcaId ? <Pressable accessibilityRole="link" accessibilityLabel={tr("WCA")} hitSlop={8} onPress={() => openUrl(wcaUrl("persons/" + c.wcaId))}
            className="h-7 flex-row items-center gap-1 rounded-full bg-muted px-2.5 active:bg-accent">
            <Text className="text-xs font-bold text-muted-foreground">WCA</Text>
          </Pressable> : null}
        </View>
        <Text numberOfLines={2} className="text-[13px] text-muted-foreground">{c.headline || tr("Speedcubing coach")}</Text>
        <Text numberOfLines={2} className="text-xs text-muted-foreground">{[c.events.map(e => said(eventInfo(e)?.label ?? e)).join(" · "), c.languages.join(", ")].filter(Boolean).join(" · ")}</Text>
      </View>
    </View>
    <View className="flex-row gap-2" accessibilityLabel={tr("As a coach")}>
      <Fact value={c.rating == null ? tr("New") : c.rating.toFixed(1)} label={plural(c.reviews, "review")} tone="text-warning" />
      <Fact value={c.sessions} label={tr("sessions given")} />
      <Fact value={c.students} label={plural(c.students, "student").replace(/^\d+\s*/, "")} />
      {c.practice ? <Fact value={c.practice.solves.toLocaleString(locale())} label={tr("solves")} /> : null}
    </View>
    {c.bio ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)}>
      <Text numberOfLines={more ? undefined : 2} className="text-[13.5px] leading-snug text-muted-foreground">{c.bio}</Text>
      {!more ? <Text className="text-[13px] font-bold text-primary">{tr("More")}</Text> : null}
    </Pressable> : null}
    {review ? <View className="gap-1 rounded-2xl bg-muted px-3 py-2.5">
      <Text className="text-sm">“{review.comment}”</Text>
      <View className="flex-row items-center gap-1.5"><Stars rating={review.rating} size={11} figure={false} /><Text className="text-xs text-muted-foreground">{review.username}</Text></View>
    </View> : null}
  </View>;
}

function Fact({ value, label, tone }: { value: ReactNode; label: string; tone?: string }) {
  return <View className="min-w-0 flex-1">
    <Numeric numberOfLines={1} className={cn("text-base font-extrabold", tone)}>{value}</Numeric>
    <Text numberOfLines={1} className="text-[11px] text-muted-foreground">{label}</Text>
  </View>;
}

/** A small title over a part of the page. */
function Caption({ children, meta }: { children: string; meta?: ReactNode }) {
  return <View className="flex-row items-baseline gap-2 pt-2">
    <Text accessibilityRole="header" className="text-base font-extrabold tracking-tight">{children}</Text>
    {meta != null ? <Numeric className="text-xs text-muted-foreground">{meta}</Numeric> : null}
  </View>;
}

/** Their times on each puzzle they solve most. */
function Times({ c }: { c: Coach }) {
  const puzzles = c.practice?.puzzles ?? [];
  return <View className="gap-3" accessibilityLabel={tr("Times per puzzle")}>
    <Caption>{tr("Times per puzzle")}</Caption>
    {!puzzles.length ? <View className="flex-row items-center gap-2"><Icon as={Timer} size={16} className="text-muted-foreground" /><Text className="text-[13px] text-muted-foreground">{tr("No timed solve yet.")}</Text></View>
      : puzzles.map(x => <PuzzleCard key={x.puzzle} x={x} history={c.history?.puzzles[x.puzzle]} />)}
  </View>;
}

/** What the students say: the average and the spread of the ratings, then every review. */
function Reviews({ c }: { c: Coach }) {
  const counts = c.ratingCounts ?? [0, 0, 0, 0, 0], most = Math.max(1, ...counts);
  return <View className="gap-3" accessibilityLabel={tr("Reviews")}>
    <Caption meta={c.reviews || undefined}>{tr("Reviews")}</Caption>
    {!c.reviewList?.length ? <View className="flex-row items-center gap-2"><Icon as={Star} size={16} className="text-muted-foreground" /><Text className="text-[13px] text-muted-foreground">{tr("No review yet.")}</Text></View> : <>
      <View accessibilityLabel={tr("Ratings")} className="flex-row items-center gap-5">
        <View className="shrink-0 items-center gap-1">
          <Numeric className="text-4xl font-extrabold tracking-tight">{c.rating?.toFixed(1) ?? "–"}</Numeric>
          <Stars rating={c.rating} size={12} figure={false} />
        </View>
        <View className="flex-1 gap-1.5">
          {[5, 4, 3, 2, 1].map(n => <View key={n} className="flex-row items-center gap-2">
            <Numeric className="w-3 text-xs text-muted-foreground">{n}</Numeric>
            <Bar ratio={counts[n - 1]! / most} fill="bg-warning" className="h-1.5 flex-1" />
            <Numeric className="w-6 text-right text-xs text-muted-foreground">{counts[n - 1]}</Numeric>
          </View>)}
        </View>
      </View>
      {c.reviewList.map((r, i) => <View key={i} className="gap-1.5 rounded-2xl bg-muted/50 p-3">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] font-extrabold">{r.username}</Text>
          <Numeric className="text-[11px] text-muted-foreground">{day(r.at)}</Numeric>
        </View>
        <Stars rating={r.rating} size={12} figure={false} />
        {r.comment ? <Text className="text-[15px] leading-normal">{r.comment}</Text> : null}
      </View>)}
    </>}
  </View>;
}

/** A coach's page on its way: the head, the figures, the week. */
function ProfileSkeleton() {
  return <View accessibilityLabel={tr("Loading")} className="gap-4 px-4">
    <View className="flex-row items-center gap-3"><Skeleton className="size-16 rounded-full" /><View className="flex-1 gap-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-3 w-3/4" /></View></View>
    <Skeleton className="h-10" />
    <Skeleton className="h-14" />
    <View className="flex-row gap-1">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 flex-1" />)}</View>
  </View>;
}

/** Booking a coach on its own, as from a conversation: their week of slots, and the way back. */
export function BookPage({ id }: { id: string }) {
  useCoaching();
  const nav = useCoachingNav();
  useEffect(() => { void coaching.load(`coach:${id}`); }, [id]);
  // Opened from a conversation, the way back returns to it.
  const fromConversation = nav.previous?.startsWith("messages/");
  return <View className="min-h-0 flex-1">
    <PushedBar title={tr("Book a session")} onBack={() => nav.back(fromConversation ? nav.previous! : "coach/" + id)} />
    <Booking id={id} />
  </View>;
}

const weekdayName = localFormat({ weekday: "short" });
const dayMonth = localFormat({ day: "numeric", month: "short" });
/** The seven days of the week starting on a Monday, at midnight. */
function weekOf(monday: number) {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d.getTime(); });
}

/**
 * The free slots of a coach a week at a time, in a scroll with `head` above and `after` below: the days with how many
 * slots each, the times of the day chosen, a note. Stuck under the scroll, what is booked in one sentence, the
 * cancellation policy to accept and Book.
 */
function Booking({ id, head, after, scroller }: { id: string; head?: ReactNode; after?: ReactNode; scroller?: React.RefObject<ScrollView | null> }) {
  const cs = useCoaching(), nav = useCoachingNav(), colors = useColors(), own = id === useAtomValue(userAtom)?.id;
  useEffect(() => { if (!own) void coaching.load(`slots:${id}`); }, [id, own]);
  const data = cs.slots.get(id), c = cs.profiles.get(id) ?? cs.coaches?.find(x => x.id === id);
  const byDay = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    for (const slot of data?.slots ?? []) map.set(dayKey(slot.start), [...(map.get(dayKey(slot.start)) ?? []), slot]);
    return map;
  }, [data]);
  const first = data?.slots[0]?.start, last = data?.slots.at(-1)?.start;
  const [week, setWeek] = useState<number | null>(null), [picked, setPicked] = useState(""), [slot, setSlot] = useState<number | null>(null),
    [note, setNote] = useState(""), [accepted, setAccepted] = useState(false);
  const { pending, run } = useAction();
  const monday = week ?? mondayOf(slot ?? first ?? Date.now()), days = weekOf(monday),
    // The day chosen, else the one of the slot chosen, else the week's first day with a slot.
    chosenDay = picked && days.some(d => dayKey(d) === picked) ? picked : slot && days.some(d => dayKey(d) === dayKey(slot)) ? dayKey(slot) : days.map(dayKey).find(d => byDay.has(d)) ?? "",
    times = byDay.get(chosenDay) ?? [], chosen = data?.slots.find(t => t.start === slot), open = !!data?.accepting && !!data.slots.length;
  async function book() {
    if (!chosen || !accepted || pending) return;
    const ok = await run(() => coaching.book(id, chosen.start, note.trim()), booking => ({ title: tr("Session booked"), description: tr("{0} with {1}", { 0: span(booking.startsAt, booking.endsAt), 1: booking.with.username }) }));
    if (ok) nav.go("sessions");
    else {
      void coaching.load(`slots:${id}`);
      setSlot(null);
    }
  }
  const moveWeek = (by: number) => { setWeek(mondayOf(monday + by * WEEK + 12 * 3_600_000)); setPicked(""); };
  return <View className="min-h-0 flex-1">
    <ScrollView ref={scroller} className="min-h-0 flex-1" contentContainerClassName="gap-3 px-4 pb-4" keyboardShouldPersistTaps="handled">
      {head}
      {own ? <Button variant="outline" className="self-start" accessibilityLabel={tr("Edit your schedule")} onPress={() => nav.go("schedule", true)}><Text>{tr("Edit")}</Text></Button>
        : !data ? <View accessibilityLabel={tr("Loading")} className="gap-2"><Skeleton className="h-5 w-40" /><View className="flex-row gap-1">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 flex-1" />)}</View></View>
          : !open ? <Empty icon={!data.welcome ? UserRoundX : CalendarX} className="flex-none rounded-2xl bg-muted">
            {!data.welcome ? tr("Full · own students only") : tr("No open slot")}
          </Empty>
            : <>
              <View className="flex-row items-center gap-1 pt-1">
                <Text accessibilityRole="header" className="text-base font-extrabold tracking-tight">{tr("Pick your slot")}</Text>
                <Numeric className="ml-1 flex-1 text-xs text-muted-foreground">{dayMonth.format(days[0]!)} – {dayMonth.format(days[6]!)}</Numeric>
                <WeekButton icon={ChevronLeft} label={tr("Previous week")} disabled={!first || monday <= mondayOf(first)} onPress={() => moveWeek(-1)} />
                <WeekButton icon={ChevronRight} label={tr("Next week")} disabled={!last || monday >= mondayOf(last)} onPress={() => moveWeek(1)} />
              </View>
              <View accessibilityRole="radiogroup" accessibilityLabel={tr("Day")} className="flex-row gap-1">
                {days.map(d => {
                  const key = dayKey(d), n = byDay.get(key)?.length ?? 0, on = key === chosenDay;
                  return <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !n }} accessibilityLabel={`${day(d)}, ${plural(n, "free slot")}`} disabled={!n} onPress={() => setPicked(key)}
                    className={cn("flex-1 items-center rounded-2xl pt-1.5 pb-1", on && "bg-accent")}>
                    <Text className="text-[11px] font-semibold text-muted-foreground">{weekdayName.format(d)}</Text>
                    <Numeric className={cn("text-[17px] font-extrabold", !n && "text-muted-foreground")}>{new Date(d).getDate()}</Numeric>
                    <Numeric className={cn("text-[11px] font-extrabold", !n ? "text-muted-foreground" : on ? "text-primary" : "text-success")}>{n || "–"}</Numeric>
                  </Pressable>;
                })}
              </View>
              <View className="flex-row flex-wrap gap-2">
                {times.map(t => {
                  const on = t.start === slot;
                  return <Pressable key={t.start} accessibilityRole="radio" accessibilityState={{ checked: on }} testID={"slot-" + t.start} onPress={() => setSlot(t.start)}
                    className={cn("h-10 justify-center rounded-xl px-4", on ? "border-[1.5px] border-primary bg-primary/15" : "bg-muted active:bg-muted/60")}>
                    <Numeric className={cn("text-sm font-bold", on && "text-primary")}>{time(t.start)}</Numeric>
                  </Pressable>;
                })}
              </View>
              <TextInput value={note} onChangeText={setNote} maxLength={1000} multiline textAlignVertical="top" accessibilityLabel={tr("What would you like to work on?")}
                placeholder={tr("What would you like to work on?")} placeholderTextColor={colors.mutedForeground}
                className="min-h-11 rounded-xl border border-input bg-input/30 px-3 py-2.5 font-sans text-base text-foreground" />
            </>}
      {after}
    </ScrollView>
    {!own && open ? <View testID="booking-details" className="mx-3 mt-1 mb-2 gap-2.5 rounded-3xl border border-border bg-card p-3.5">
      {chosen ? <Numeric className="text-[15px] leading-snug font-bold">{day(chosen.start)}, <Text className="text-[15px] font-bold text-primary">{time(chosen.start)} – {time(chosen.end)}</Text> {tr("with {0}", { 0: c?.username ?? "" })} · <Text className="text-[15px] font-bold text-primary">{price(data!.priceCents)}</Text></Numeric>
        : <Text className="text-[15px] font-bold text-muted-foreground">{tr("Pick a time to book")}</Text>}
      <View>
        <CheckRow checked={accepted} onChange={setAccepted}>{tr("I have read and accept the cancellation policy.")}</CheckRow>
        <View className="gap-0.5 pl-[30px]">
          {chosen ? cancellationOpen(chosen.start) ? <Text className="text-xs text-muted-foreground">{tr("Cancellable until {0}, not in the last 24 hours.", { 0: span(chosen.start - CANCELLATION_NOTICE) })}</Text>
            : <Text className="text-xs font-bold text-warning">{tr("This session starts within 24 hours and cannot be cancelled once booked.")}</Text> : null}
          <Text className="text-[11px] leading-snug text-muted-foreground">{said(CANCELLATION_TERMS)}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-3">
        <Button disabled={!chosen || !accepted || pending} onPress={book} testID="book" className="h-11 rounded-xl px-4">
          <Icon as={CalendarCheck} size={17} className="text-primary-foreground" />
          <Text>{tr("Book")}</Text>
        </Button>
      </View>
    </View> : null}
  </View>;
}

function WeekButton({ icon, label, disabled, onPress }: { icon: typeof ChevronLeft; label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className={cn("size-10 items-center justify-center rounded-full active:bg-muted", disabled && "opacity-35")}>
    <Icon as={icon} size={20} />
  </Pressable>;
}
