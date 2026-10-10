/**
 * Finding a coach: every coach in a list with their next slot and price, the one chosen beside it with what matters
 * about them and their week of slots to book on the same screen. A coach's full page (their figures as a coach and as a
 * cuber, their reviews) and the booking alone (from a conversation) keep the same booking panel.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarX, ChevronLeft, ChevronRight, MessageSquare, SearchX, Star, Timer, UserRoundX, Users } from "lucide-react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, Icon, NUMERIC, SelectMenu, plural, usePhone } from "../ui";
import { go } from "../navigation";
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { coaching, price, type Coach } from "./client";
import { fmtTime } from "../../../src/client/lib/format";
import { Back, Tools, dayKey, day, span, time, url } from "./parts";
import { Bar, Empty, LINK, ListSkeleton, SearchField, Stars, Surface, Tip } from "../base";
import { Activity, Learned, PuzzleCard } from "./person";
import { SLOT } from "./calendar";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";
import { CANCELLATION_NOTICE, CANCELLATION_TERMS, cancellationOpen } from "./policy";
import { tr, localFormat, locale } from "../../../src/client/i18n";
import { said } from "../base";

const WEEK = 7 * 86_400_000;
const SORTS = [
  { id: "next", label: "Next slot first" },
  { id: "price", label: "Cheapest first" },
  { id: "rating", label: "Best rated first" },
];
const PRICES = [
  { id: "any", label: "Any price" },
  { id: "0", label: "Free" },
  { id: "1000", label: "Up to €10" },
  { id: "2000", label: "Up to €20" },
  { id: "3000", label: "Up to €30" },
  { id: "5000", label: "Up to €50" },
];
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CoachList() {
  useEffect(() => {
    void coaching.load("coaches");
  }, []);
  const phone = usePhone();
  const [query, setQuery] = useState(""),
    [event, setEvent] = useState("all"),
    [language, setLanguage] = useState("all"),
    [most, setMost] = useState("any"),
    [soon, setSoon] = useState(false),
    [sort, setSort] = useState("next"),
    [picked, setPicked] = useState<{ id: string; slot: number | null } | null>(null);
  const list = coaching.coaches;
  const taught = useMemo(() => EVENTS.filter((e) => list?.some((c) => c.events.includes(e.id))), [list]),
    spoken = useMemo(() => [...new Set(list?.flatMap((c) => c.languages) ?? [])].sort(), [list]);
  const now = Date.now();
  const shown = list
    ?.filter(
      (c) =>
        (event === "all" || c.events.includes(event)) &&
        (language === "all" || c.languages.includes(language)) &&
        (most === "any" || c.priceCents <= Number(most)) &&
        (!soon || (!!c.nextSlot && c.nextSlot < now + WEEK)) &&
        query
          .toLowerCase()
          .split(/\s+/)
          .every((w) => [c.username, c.headline, c.bio, ...c.languages].join(" ").toLowerCase().includes(w)),
    )
    .sort((a, b) => (sort === "price" ? a.priceCents - b.priceCents : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) : (a.nextSlot ?? Infinity) - (b.nextSlot ?? Infinity)));
  const chosen = shown?.find((c) => c.id === picked?.id) ?? shown?.[0];
  const pick = (c: Coach, slot: number | null = null) => (phone ? go(url("coach/" + c.id)) : setPicked({ id: c.id, slot }));
  return (
    <>
      <Tools>
        <SearchField value={query} onChange={setQuery} placeholder="Name, method, speciality…" label="Search coaches" action="coaching:search" className="w-full sm:w-64" />
        {!phone && (
          <>
            <SelectMenu action="coaching:event" variant="outline" value={event} onChange={setEvent} label="Event" options={[{ id: "all", label: "Every event" }, ...taught.map((e) => ({ id: e.id, label: e.label, icon: <Icon name={"Puzzle" + e.id} size={14} /> }))]} />
            <Toggle variant="outline" pressed={soon} onPressedChange={setSoon} data-action="coaching:soon" className="aria-pressed:text-foreground">
              {tr("Free this week")}
            </Toggle>
            {spoken.length > 1 && <SelectMenu action="coaching:language" variant="outline" value={language} onChange={setLanguage} label="Language" options={[{ id: "all", label: "Every language" }, ...spoken.map((l) => ({ id: l, label: l }))]} />}
            <SelectMenu action="coaching:price" variant="outline" value={most} onChange={setMost} label="Price" options={PRICES} />
          </>
        )}
      </Tools>
      <div className={cn("grid min-h-0 flex-1 gap-5", !phone && "grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]")}>
        <Surface className="min-w-0 gap-2 px-2.5 pt-4 pb-2.5" aria-label={tr("Coaches")}>
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 px-2.5">
            <h1 className="text-lg font-extrabold">{shown ? plural(shown.length, "coach") : tr("Coaches")}</h1>
            <span className="text-[13px] text-muted-foreground">{tr("times in {0}", { 0: zone() })}</span>
            <SelectMenu action="coaching:sort" variant="ghost" value={sort} onChange={setSort} label="Sort" options={SORTS} className="ml-auto h-7 px-2 text-[13px]" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!shown ? (
              <ListSkeleton rows={5} />
            ) : !shown.length ? (
              <Empty icon={list?.length ? SearchX : Users} className="h-full">
                {list?.length ? tr("No coach matches your search.") : tr("No coach has opened their page yet.")}
                {!coaching.isCoach && !list?.length && (
                  <UiButton variant="outline" onClick={() => go(url("apply"))} data-action="coaching:apply-first">
                    {tr("Become the first coach")}
                  </UiButton>
                )}
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1" data-slot="coach-list">
                {shown.map((c) => (
                  <li key={c.id}>
                    <CoachRow c={c} active={!phone && c.id === chosen?.id} slot={c.id === picked?.id ? picked.slot : null} onPick={(slot) => pick(c, slot)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>
        {!phone && (
          <Surface className="min-w-0 overflow-hidden" data-slot="coach-panel">
            {chosen ? <CoachPanel key={chosen.id} c={chosen} slot={picked?.id === chosen.id ? picked.slot : null} /> : shown ? <Empty icon={Users} /> : <PanelSkeleton />}
          </Surface>
        )}
      </div>
    </>
  );
}

/**
 * A coach in the list (and in their own profile's preview): the face, the name with their rating, a line on what they
 * teach, the price on the right, then their next slot to pick at once and how many more are open.
 */
export function CoachRow({ c, active = false, slot = null, onPick }: { c: Coach; active?: boolean; slot?: number | null; onPick?: (slot: number | null) => void }) {
  const line = [c.headline || tr("Speedcubing coach"), c.languages.join(", ")].filter(Boolean).join(" · ");
  return (
    <div
      className={cn("relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[18px] px-3.5 py-3 transition-colors", onPick && "hover:bg-muted", active && "bg-muted")}
      data-coach={c.username}
      aria-current={active || undefined}
    >
      <Avatar name={c.username} src={c.avatar} size={52} className="row-span-2" />
      <span className="flex min-w-0 items-baseline gap-2.5">
        {onPick ? (
          <button type="button" className="truncate text-base font-extrabold outline-none after:absolute after:inset-0 after:rounded-[18px] focus-visible:after:ring-3 focus-visible:after:ring-ring/50" onClick={() => onPick(null)}>
            {c.username}
          </button>
        ) : (
          <span className="truncate text-base font-extrabold">{c.username}</span>
        )}
        <span className={cn(NUMERIC, "shrink-0 text-[13px] text-muted-foreground")}>{c.rating == null ? tr("New") : `${c.rating.toFixed(1)} · ${plural(c.reviews, "review")}`}</span>
      </span>
      <span className="row-span-2 flex flex-col items-end">
        <span className={cn(NUMERIC, "text-2xl font-extrabold tracking-[-0.03em]")}>{price(c.priceCents)}</span>
        <span className="text-xs text-muted-foreground">
          {c.sessionMinutes} {tr("min")}
        </span>
      </span>
      <span className="truncate text-[13px] text-muted-foreground">{line}</span>
      <span className="relative col-start-2 col-end-4 mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {!c.newStudents ? (
          <>
            <button type="button" className={SLOT} disabled>
              {tr("full")}
            </button>
            {tr("own students only")}
          </>
        ) : c.nextSlot ? (
          <>
            <button type="button" className={SLOT} aria-pressed={slot === c.nextSlot} onClick={() => onPick?.(c.nextSlot!)} disabled={!onPick} data-action="coaching:next-slot">
              {span(c.nextSlot)}
            </button>
            {!!c.openSlots && c.openSlots > 1 && <span className={NUMERIC}>{tr("+ {0} more in 4 weeks", { 0: c.openSlots - 1 })}</span>}
          </>
        ) : (
          <span>{tr("No open slot")}</span>
        )}
      </span>
    </div>
  );
}

/** The coach chosen in the list: who they are in a few lines and figures, then their week of slots to book. */
function CoachPanel({ c: listed, slot }: { c: Coach; slot: number | null }) {
  useEffect(() => {
    void coaching.load(`coach:${listed.id}`);
  }, [listed.id]);
  const c = coaching.profiles.get(listed.id) ?? listed;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="coach-about">
      <CoachHead c={c} more={<button type="button" className={LINK} onClick={() => go(url("coach/" + c.id))} data-action="coaching:coach-page">{tr("Full page")}</button>} />
      <Booking id={c.id} preset={slot} />
    </div>
  );
}

/** A coach in a few lines: the face, the name, what they teach and their times; their figures; their words and the latest review. */
function CoachHead({ c, more, full = false }: { c: Coach; more?: React.ReactNode; full?: boolean }) {
  const top = c.practice?.puzzles[0],
    review = c.reviewList?.find((r) => r.comment);
  const line = [
    c.events.map((e) => said(eventInfo(e)?.label ?? e)).join(", "),
    top?.best != null && `${tr("PB")} ${fmtTime(top.best)}${top.ao5 != null ? `, ${tr("Ao5")} ${fmtTime(top.ao5)}` : ""}`,
    tr("on Qbix since {0}", { 0: new Date(c.since).getFullYear() }),
  ].filter(Boolean);
  return (
    <div className="flex shrink-0 flex-col gap-3 px-6 pt-5 pb-2">
      <div className="flex items-center gap-4">
        <Avatar name={c.username} src={c.avatar} size={full ? 80 : 68} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-3">
            <h2 className="truncate text-2xl font-extrabold tracking-[-0.02em]">{c.username}</h2>
            <span className="ml-auto shrink-0">{more}</span>
          </span>
          <span className="line-clamp-1 text-[13px] text-muted-foreground">{c.headline || tr("Speedcubing coach")}</span>
          <span className={cn(NUMERIC, "line-clamp-1 text-[13px] text-muted-foreground")}>{line.join(" · ")}</span>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-7 gap-y-2 text-xs text-muted-foreground" data-slot="coach-figures">
        <Fact value={c.rating == null ? tr("New") : c.rating.toFixed(1)} label={plural(c.reviews, "review")} />
        <Fact value={c.sessions} label={tr("sessions given")} />
        <Fact value={c.students} label={plural(c.students, "student").replace(/^\d+\s*/, "")} />
        {c.practice && <Fact value={c.practice.solves.toLocaleString(locale())} label={tr("solves")} />}
        {full && c.practice && <Fact value={c.practice.activeDays} label={tr("active days · 30 d")} />}
      </dl>
      {c.bio && <p className={cn("whitespace-pre-line text-sm leading-relaxed text-muted-foreground", !full && "line-clamp-2 whitespace-normal")}>{c.bio}</p>}
      {review && !full && (
        <p className="line-clamp-2 text-[13px] text-muted-foreground">
          “{review.comment}” <b className="font-bold text-foreground">{review.username}</b>
        </p>
      )}
    </div>
  );
}

function Fact({ value, label }: { value: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dd className={cn(NUMERIC, "order-first text-lg font-extrabold text-foreground")}>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label={tr("Loading")}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <Skeleton className="h-10" />
      <Skeleton className="h-16" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <Skeleton className="h-24" />
    </div>
  );
}

/** A coach's page: who they are, their figures as a coach and as a cuber, how they practise and what their students say; their slots to book beside. */
export function CoachPage({ id }: { id: string }) {
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load("bookings");
  }, [id]);
  const phone = usePhone(),
    c = coaching.profiles.get(id),
    own = id === s.user.id,
    // Messages open once a session is booked with them, even one cancelled since.
    booked = coaching.bookings?.some((b) => b.coachId === id);
  const message = async () => {
    try {
      const conversation = await coaching.talkTo(id);
      go(url("messages/" + conversation.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <Tools>
        <Back to={url(own ? "profile" : "coaches")} label={own ? tr("Your coach profile") : tr("Every coach")} />
        {!own && c && booked && (
          <UiButton variant="outline" onClick={message} data-action="coaching:message">
            <MessageSquare />
            {tr("Message")}
          </UiButton>
        )}
      </Tools>
      <div className={cn("grid min-h-0 flex-1 gap-5", phone ? "auto-rows-max overflow-y-auto" : "grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]")}>
        <Surface className={cn("min-w-0", !phone && "overflow-hidden")}>
          {!c ? (
            <PanelSkeleton />
          ) : (
            <div className={cn("flex min-h-0 flex-1 flex-col gap-2 pb-4", !phone && "overflow-y-auto")} data-slot="coach-about">
              <CoachHead c={c} full />
              <div className="flex flex-col gap-6 px-6 pt-3 max-md:px-4">
                <Times c={c} />
                <div className="grid gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-slot="coach-practice">
                  <Activity days={c.history?.days ?? []} className="bg-transparent p-0 ring-0" />
                  <Learned ids={c.history?.learned ?? []} className="bg-transparent p-0 ring-0" />
                </div>
                <Reviews c={c} />
              </div>
            </div>
          )}
        </Surface>
        <Surface className="min-w-0 overflow-hidden max-md:min-h-[36rem]">
          {own ? (
            <Empty icon={CalendarCheck}>
              {tr("Players book you here.")}
              <UiButton variant="outline" onClick={() => go(url("schedule"))}>
                {tr("Edit your schedule")}
              </UiButton>
            </Empty>
          ) : (
            <Booking id={id} />
          )}
        </Surface>
      </div>
    </>
  );
}

/** A small title over a part of the page. */
const Caption = ({ children, meta }: { children: React.ReactNode; meta?: React.ReactNode }) => (
  <h3 className="flex items-baseline gap-2 text-xs font-bold text-muted-foreground">
    {children}
    {meta != null && <span className="font-semibold">{meta}</span>}
  </h3>
);

/** Their times on each puzzle they solve most. */
function Times({ c }: { c: Coach }) {
  const puzzles = c.practice?.puzzles ?? [];
  return (
    <section className="flex flex-col gap-3" aria-label={tr("Times per puzzle")}>
      <Caption meta={tr("most solved first")}>{tr("Times per puzzle")}</Caption>
      {!puzzles.length ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Timer className="size-4" />
          {tr("No timed solve yet.")}
        </p>
      ) : (
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 2xl:grid-cols-3">
          {puzzles.map((x) => (
            <PuzzleCard key={x.puzzle} x={x} history={c.history?.puzzles[x.puzzle]} />
          ))}
        </div>
      )}
    </section>
  );
}

/** What the students say: the average and how many gave each rating, then every review. */
function Reviews({ c }: { c: Coach }) {
  const counts = c.ratingCounts ?? [0, 0, 0, 0, 0],
    most = Math.max(1, ...counts);
  return (
    <section className="flex flex-col gap-3" aria-label={tr("Reviews")}>
      <Caption meta={c.reviews || undefined}>{tr("Reviews")}</Caption>
      {!c.reviewList?.length ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Star className="size-4" />
          {tr("No review yet.")}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-6" aria-label={tr("Ratings")}>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className={cn(NUMERIC, "text-5xl font-extrabold tracking-[-0.04em]")}>{c.rating?.toFixed(1) ?? "–"}</span>
              <Stars rating={c.rating} size={12} figure={false} />
            </div>
            <div className="flex max-w-80 flex-1 flex-col gap-1.5">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className={cn(NUMERIC, "w-10 text-muted-foreground")}>{tr("{0} stars", { 0: n })}</span>
                  <Bar ratio={counts[n - 1]! / most} fill="bg-warning" className="h-1.5 flex-1" />
                  <span className={cn(NUMERIC, "w-6 text-right text-muted-foreground")}>{counts[n - 1]}</span>
                </div>
              ))}
            </div>
          </div>
          <ul className="flex flex-col gap-4" data-slot="reviews">
            {c.reviewList.map((r, i) => (
              <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-[18px] max-md:grid-cols-1">
                <span className="flex flex-col md:items-end md:text-right">
                  <b className="truncate text-[13px] font-extrabold">{r.username}</b>
                  <span className={cn(NUMERIC, "text-[11px] text-muted-foreground")}>{day(r.at)}</span>
                </span>
                <span className="flex flex-col gap-1">
                  <Stars rating={r.rating} size={12} figure={false} />
                  {r.comment && <p className="text-[15px] leading-normal whitespace-pre-line">{r.comment}</p>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Booking a coach on its own, as from a conversation: their slots, and the way back. */
export function BookPage({ id }: { id: string }) {
  const { state } = useLocation();
  const conversationId = state?.conversationId;
  const fromConversation = Number.isSafeInteger(conversationId) && conversationId > 0;
  useEffect(() => {
    void coaching.load(`coach:${id}`);
  }, [id]);
  const c = coaching.profiles.get(id);
  return (
    <>
      <Tools>
        <Back to={url(fromConversation ? "messages/" + conversationId : "coach/" + id)} label={fromConversation ? tr("Back to conversation") : (c?.username ?? tr("Back"))} />
      </Tools>
      <Surface className="mx-auto w-full max-w-[34rem] flex-1 overflow-hidden" aria-label={tr("Book a session")}>
        {c && (
          <div className="flex shrink-0 items-center gap-3 px-6 pt-5">
            <Avatar name={c.username} src={c.avatar} size={44} />
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-lg font-extrabold">{tr("Book a session")}</b>
              <span className={cn(NUMERIC, "text-[13px] text-muted-foreground")}>
                {tr("with {0}", { 0: c.username })} · {c.sessionMinutes} {tr("min")} · {price(c.priceCents)}
              </span>
            </span>
          </div>
        )}
        {id === s.user.id ? <Empty icon={CalendarCheck}>{tr("Players book you here.")}</Empty> : <Booking id={id} />}
      </Surface>
    </>
  );
}

const weekdayName = localFormat({ weekday: "short" });
const dayMonth = localFormat({ day: "numeric", month: "short" });
const longDay = localFormat({ weekday: "long", day: "numeric", month: "long" });
/** The Monday starting the week of a moment, at midnight on this device. */
function mondayOf(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
/** The seven days of the week starting on a Monday, at midnight. */
function weekOf(monday: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });
}

/**
 * The free slots of a coach a week at a time: the days with how many slots each, the times of the day chosen, a note,
 * then what is booked in one sentence, the cancellation policy to accept and Book. `preset` chooses a slot at once.
 */
export function Booking({ id, preset = null }: { id: string; preset?: number | null }) {
  useEffect(() => {
    void coaching.load(`slots:${id}`);
  }, [id]);
  const data = coaching.slots.get(id),
    c = coaching.profiles.get(id) ?? coaching.coaches?.find((x) => x.id === id);
  const byDay = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    for (const slot of data?.slots ?? []) map.set(dayKey(slot.start), [...(map.get(dayKey(slot.start)) ?? []), slot]);
    return map;
  }, [data]);
  const first = data?.slots[0]?.start,
    last = data?.slots[data.slots.length - 1]?.start;
  const [week, setWeek] = useState<number | null>(null),
    [picked, setPicked] = useState(""),
    [slot, setSlot] = useState<number | null>(preset),
    [note, setNote] = useState(""),
    [accepted, setAccepted] = useState(false),
    [pending, setPending] = useState(false);
  useEffect(() => setSlot(preset), [preset]);
  const monday = week ?? mondayOf(slot ?? first ?? Date.now()),
    days = weekOf(monday),
    // The day chosen, else the one of the slot chosen, else the week's first day with a slot.
    chosenDay = picked && days.some((d) => dayKey(d) === picked) ? picked : slot && days.some((d) => dayKey(d) === dayKey(slot)) ? dayKey(slot) : (days.map(dayKey).find((d) => byDay.has(d)) ?? ""),
    times = byDay.get(chosenDay) ?? [],
    chosen = data?.slots.find((t) => t.start === slot);
  async function book() {
    if (!chosen || !accepted || pending) return;
    setPending(true);
    try {
      const booking = await coaching.book(id, chosen.start, note.trim());
      toast.success(tr("Session booked"), { description: tr("{0} with {1}", { 0: span(booking.startsAt, booking.endsAt), 1: booking.with.username }) });
      go(url("sessions"));
    } catch (e) {
      toast.error((e as Error).message);
      void coaching.load(`slots:${id}`);
      setSlot(null);
    } finally {
      setPending(false);
    }
  }
  if (id === s.user.id) return <Empty icon={CalendarCheck}>{tr("Players book you here.")}</Empty>;
  if (!data)
    return (
      <div className="flex flex-col gap-3 px-6 pt-4" aria-busy="true" aria-label={tr("Loading")}>
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  if (!data.accepting || !data.slots.length)
    return (
      <Empty icon={!data.welcome ? UserRoundX : CalendarX} className="flex-1">
        {!data.welcome
          ? tr("{0} is not taking new students right now. Write to them to ask.", { 0: c?.username ?? tr("This coach") })
          : data.accepting
            ? tr("{0} has no open slot in the next four weeks.", { 0: c?.username ?? tr("This coach") })
            : tr("This coach is not taking bookings right now.")}
      </Empty>
    );
  const name = c?.username ?? "";
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-3 pb-5 max-md:px-4" aria-label={tr("Book a session")} data-slot="booking">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-extrabold">{tr("Pick your slot")}</h3>
        <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
          {dayMonth.format(days[0]!)} – {dayMonth.format(days[6]!)}
        </span>
        <Tip content={tr("Previous week")}>
          <UiButton variant="ghost" size="icon" className="ml-auto" aria-label={tr("Previous week")} disabled={!first || monday <= mondayOf(first)} onClick={() => (setWeek(mondayOf(monday - WEEK + 12 * 3_600_000)), setPicked(""))} data-action="booking:previous">
            <ChevronLeft />
          </UiButton>
        </Tip>
        <Tip content={tr("Next week")}>
          <UiButton variant="ghost" size="icon" aria-label={tr("Next week")} disabled={!last || monday >= mondayOf(last)} onClick={() => (setWeek(mondayOf(monday + WEEK + 12 * 3_600_000)), setPicked(""))} data-action="booking:next">
            <ChevronRight />
          </UiButton>
        </Tip>
      </div>
      <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label={tr("Day")} data-slot="week">
        {days.map((d) => {
          const key = dayKey(d),
            n = byDay.get(key)?.length ?? 0,
            on = key === chosenDay;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!n}
              onClick={() => setPicked(key)}
              data-day={key}
              className={cn("flex flex-col items-center gap-0.5 rounded-[14px] py-2 text-xs text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:hover:bg-transparent", on && "bg-accent hover:bg-accent")}
            >
              {weekdayName.format(d)}
              <b className={cn(NUMERIC, "text-lg font-extrabold", n ? "text-foreground" : "text-muted-foreground")}>{new Date(d).getDate()}</b>
              <span className={cn(NUMERIC, "font-bold", n ? "text-success" : "text-muted-foreground")} aria-label={plural(n, "free slot")}>
                {n || "–"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5" data-slot="slots">
        {times.map((t) => (
          <button key={t.start} type="button" className={SLOT} aria-pressed={t.start === slot} onClick={() => setSlot(t.start)} data-slot-start={t.start}>
            {time(t.start)}
          </button>
        ))}
      </div>
      <Textarea id="booking-note" aria-label={tr("What would you like to work on?")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={1} placeholder={tr("What you want to work on: your average, the step you struggle with… (optional)")} className="min-h-10 resize-none" />
      <div className="mt-auto flex flex-col gap-3 rounded-[18px] bg-muted px-4 py-3.5" data-slot="booking-details">
        <p className={cn(NUMERIC, "text-[17px] leading-snug font-bold")}>
          {chosen ? (
            <>
              <span className="first-letter:uppercase">{longDay.format(chosen.start)}</span>, <span className="text-primary">{time(chosen.start)} – {time(chosen.end)}</span> {tr("with {0}", { 0: name })} · <span className="text-primary">{price(data.priceCents)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{tr("Pick a time to book")}</span>
          )}
        </p>
        <label className="flex items-start gap-2 text-xs text-muted-foreground" htmlFor="accept-cancellation-policy" data-slot="cancellation-policy">
          <Checkbox id="accept-cancellation-policy" checked={accepted} onCheckedChange={setAccepted} aria-describedby="cancellation-terms" className="mt-px" />
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground">{tr("I have read and accept the cancellation policy.")}</span>
            {chosen && (cancellationOpen(chosen.start) ? <span>{tr("Cancellable until {0}, not in the last 24 hours.", { 0: span(chosen.start - CANCELLATION_NOTICE) })}</span> : <span className="font-bold text-warning">{tr("This session starts within 24 hours and cannot be cancelled once booked.")}</span>)}
            <span id="cancellation-terms" className="text-[11px] leading-snug">
              {said(CANCELLATION_TERMS)}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <UiButton disabled={!chosen || !accepted || pending} onClick={book} data-action="coaching:book">
            <CalendarCheck />
            {tr("Book")}
          </UiButton>
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">{tr("Confirmed at once · payment comes later · the call opens 15 min before")}</span>
        </div>
      </div>
    </section>
  );
}

