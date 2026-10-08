/** Finding a coach: every coach as a card, then a coach's page: the slots to book first, their reviews beside. */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarX, Check, Clock, Languages, MessageSquare, SearchX, Star, Timer, UserRoundX, Users } from "lucide-react";
import { Link, useLocation } from "react-router";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, Icon, NUMERIC, PAGE, PageHead, plural } from "../ui";
import { go } from "../navigation";
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { coaching, price, type Coach } from "./client";
import { fmtTime } from "../../../src/client/lib/format";
import { Back, dayKey, day, relative, span, time, url } from "./parts";
import { Bar, Empty, Events, Figure, SearchField, SectionHead, Stars, Strip, Surface, TILE } from "../base";
import { Activity, Learned, PuzzleCard } from "./person";
import { CalendarSkeleton, DayBoxes, DayChip, Month, MonthHeader, NARROW_BAR } from "./calendar";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CANCELLATION_TERMS, cancellationOpen } from "./policy";
import { tr, localFormat, locale } from "../../../src/client/i18n";
import { said } from "../base";

export function CoachList() {
  useEffect(() => {
    void coaching.load("coaches");
  }, []);
  const [query, setQuery] = useState(""),
    [event, setEvent] = useState("all");
  const list = coaching.coaches;
  const taught = useMemo(() => EVENTS.filter((e) => list?.some((c) => c.events.includes(e.id))), [list]);
  const shown = list?.filter(
    (c) =>
      (event === "all" || c.events.includes(event)) &&
      query
        .toLowerCase()
        .split(/\s+/)
        .every((w) => [c.username, c.headline, c.bio, ...c.languages].join(" ").toLowerCase().includes(w)),
  );
  const options = [{ value: "all", label: tr("Every event") }, ...taught.map((e) => ({ value: e.id, label: e.label }))];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SearchField value={query} onChange={setQuery} placeholder="Name, language, method…" label="Search coaches" action="coaching:search" className="w-full sm:w-72" />
        <Select items={options} value={event} onValueChange={(v) => setEvent(String(v))}>
          <SelectTrigger aria-label={tr("Event")} data-action="coaching:event" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.value !== "all" && <Icon name={"Puzzle" + o.value} size={14} />}
                {said(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-px">
        {!shown ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3" aria-busy="true" aria-label={tr("Loading")}>
            {Array.from({ length: 6 }, (_, i) => (
              <CoachCardSkeleton key={i} />
            ))}
          </div>
        ) : !shown.length ? (
          <Empty icon={list?.length ? SearchX : Users} className="h-full">
            {list?.length ? tr("No coach matches your search.") : tr("No coach has opened their page yet.")}
            {!coaching.isCoach && !list?.length && (
              <UiButton variant="outline" onClick={() => go(url("apply"))} data-action="coaching:apply">
                {tr("Become the first coach")}
              </UiButton>
            )}
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3" data-slot="coach-list">
            {shown.map((c) => (
              <CoachCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A coach's card on its way: the face, the name and lines, the band of figures. */
function CoachCardSkeleton() {
  return (
    <div className="flex h-56 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-9 rounded-xl" />
      <Skeleton className="mt-auto h-4 w-2/3" />
    </div>
  );
}

function CoachCard({ c }: { c: Coach }) {
  const top = c.practice?.puzzles[0];
  return (
    <Link
      to={url("coach/" + c.id)}
      data-coach={c.username}
      className={cn(TILE, "flex flex-col gap-3 p-4 text-sm")}
    >
      <div className="flex items-center gap-3.5">
        <Avatar name={c.username} src={c.avatar} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-base font-semibold tracking-tight">{c.username}</span>
          <span className="flex items-center gap-1.5 text-xs">
            <Stars rating={c.rating} size={12} />
            <span className="text-muted-foreground">· {plural(c.reviews, "review")}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {plural(c.sessions, "session")} · {plural(c.students, "student")}
          </span>
        </div>
        <span className={cn(NUMERIC, "shrink-0 self-start text-right font-medium")}>
          {price(c.priceCents)}
          <span className="block text-xs font-normal text-muted-foreground">{c.sessionMinutes} {" "}{tr("min")}</span>
        </span>
      </div>
      <p className="line-clamp-2 min-h-10 text-muted-foreground">{c.headline || tr("Speedcubing coach")}</p>
      {top && (
        <Strip className="flex items-center gap-x-2.5 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground" data-slot="coach-stats">
            <Icon name={"Puzzle" + top.puzzle} size={18} className="text-foreground" />
            <span className="truncate">{said(eventInfo(top.puzzle)?.label ?? top.puzzle)}</span>
          </span>
          <span className={cn(NUMERIC, "ml-auto shrink-0 text-xs text-muted-foreground")}>
            {tr("PB")} <span className="font-medium text-foreground">{fmtTime(top.best)}</span>
          </span>
          {top.ao5 != null && (
            <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>
              {tr("Ao5")} <span className="font-medium text-foreground">{fmtTime(top.ao5)}</span>
            </span>
          )}
        </Strip>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Events events={c.events} />
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", c.nextSlot ? "text-foreground" : "text-muted-foreground")}>
          <CalendarCheck className="size-3.5" />
          {!c.newStudents ? tr("Full · own students only") : c.nextSlot ? span(c.nextSlot) : tr("No open slot")}
        </span>
      </div>
    </Link>
  );
}

/** A coach's page: who they are and the way to book them on top, their figures as a coach and as a cuber, then how they
 * practise; what their students say beside. */
export function CoachPage({ id }: { id: string }) {
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load(`slots:${id}`);
    void coaching.load("bookings");
  }, [id]);
  const c = coaching.profiles.get(id),
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
    <div className={PAGE}>
      <PageHead lead={<Back to={url(own ? "profile" : "coaches")} label={own ? tr("Your coach profile") : tr("Every coach")} />} title={c ? <>{c.username}</> : <Skeleton className="h-7 w-40" />}>
        {!own && c && booked && (
          <UiButton variant="outline" onClick={message} data-action="coaching:message">
            <MessageSquare />
            {tr("Message")}</UiButton>
        )}
      </PageHead>
      {!c ? (
        <ProfileSkeleton />
      ) : (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] max-lg:auto-rows-max max-lg:overflow-y-auto">
          <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto">
            <About c={c} own={own} />
            <div className="grid shrink-0 gap-4 xl:grid-cols-2">
              <FigureCard title="As a coach" sub={tr("since {0}", { 0: month(c.since) })}>
                <Figure label="Rating" value={c.rating == null ? tr("New") : c.rating.toFixed(1)} tone="warning" size="xl" />
                <Figure label="Sessions given" value={c.sessions} size="xl" />
                <Figure label="Students" value={c.students} size="xl" />
              </FigureCard>
              <FigureCard title="As a cuber" sub={c.practice?.lastAt ? tr("last solve {0}", { 0: relative(new Date(c.practice.lastAt).getTime()) }) : tr("no solve yet")}>
                <Figure label="Solves" value={(c.practice?.solves ?? 0).toLocaleString(locale())} size="xl" />
                <Figure label="Active days · 30 d" value={c.practice?.activeDays ?? 0} size="xl" />
                <Figure label="Cases learned" value={c.practice?.learned ?? 0} size="xl" />
              </FigureCard>
            </div>
            <Progress c={c} />
            <Times c={c} />
          </div>
          <Reviews c={c} />
        </div>
      )}
    </div>
  );
}

const monthFormat = localFormat({ month: "long", year: "numeric" });
const month = (ms: number) => monthFormat.format(ms);

/** The coach in full: their picture, headline, terms and presentation, and beside them the way to book. */
function About({ c, own }: { c: Coach; own: boolean }) {
  const slots = coaching.slots.get(c.id),
    next = slots?.slots[0]?.start ?? c.nextSlot;
  return (
    <Surface className="shrink-0" data-slot="coach-about">
      <div className="flex flex-wrap items-stretch gap-5 p-5">
        <Avatar name={c.username} src={c.avatar} size={80} className="self-start" />
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <span className="text-lg font-semibold tracking-tight">{c.headline || c.username}</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Stars rating={c.rating} size={12} />· {plural(c.reviews, "review")}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {c.sessionMinutes} {" "}{tr("min sessions")}</span>
            {!!c.languages.length && (
              <span className="flex items-center gap-1">
                <Languages className="size-3.5" />
                {c.languages.join(", ")}
              </span>
            )}
          </span>
          <p className="max-h-28 max-w-3xl overflow-y-auto whitespace-pre-line text-muted-foreground">{c.bio || tr("This coach has not written about themselves yet.")}</p>
          {!!c.events.length && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {c.events.map((e) => (
                <Badge key={e} variant="secondary">
                  <Icon name={"Puzzle" + e} size={14} />
                  {said(eventInfo(e)?.label ?? e)}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-64 shrink-0 flex-col justify-center gap-3 border-l pl-5 max-sm:w-full max-sm:border-t max-sm:border-l-0 max-sm:pt-4 max-sm:pl-0">
          <span className={cn(NUMERIC, "flex items-baseline gap-2")}>
            <span className="text-2xl font-semibold text-primary">{price(c.priceCents)}</span>
            <span className="text-muted-foreground">{tr("for")}{" "}{c.sessionMinutes} {" "}{tr("min")}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarCheck className="size-3.5 shrink-0" />
            <span className="truncate">{!c.newStudents && !own ? tr("Own students only") : next ? tr("Next free slot {0}", { 0: span(next) }) : tr("No open slot")}</span>
          </span>
          {own ? (
            <UiButton variant="outline" size="lg" onClick={() => go(url("schedule"))}>
              {tr("Edit your schedule")}</UiButton>
          ) : (
            <UiButton size="lg" className="max-md:h-11" onClick={() => go(url(`coach/${c.id}/book`))} data-action="coaching:open-booking">
              <CalendarCheck />
              {tr("Book a session")}</UiButton>
          )}
        </div>
      </div>
    </Surface>
  );
}

/** Three figures under a title, one card. */
function FigureCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <Surface className="gap-2 px-4 pt-2 pb-4" data-slot="coach-figures">
      <SectionHead title={title} meta={<span className="truncate text-xs">{said(sub)}</span>} />
      <div className="grid grid-cols-3 gap-3">{children}</div>
    </Surface>
  );
}

/** How the coach practises: their year of solves beside the cases they learned. */
function Progress({ c }: { c: Coach }) {
  return (
    <div className="grid shrink-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-slot="coach-practice">
      <Activity days={c.history?.days ?? []} />
      <Learned ids={c.history?.learned ?? []} />
    </div>
  );
}

/** Their times on each puzzle they solve most, the cards sharing the height left. */
function Times({ c }: { c: Coach }) {
  const puzzles = c.practice?.puzzles ?? [];
  return (
    <Surface className="min-h-56 flex-1 max-lg:flex-none" aria-label={tr("Puzzles")}>
      <SectionHead title="Times per puzzle" meta={<span className="text-xs">{tr("most solved first")}</span>} className="px-4 pt-2" />
      {!puzzles.length ? (
        <Empty icon={Timer}>{tr("No timed solve yet.")}</Empty>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(8.5rem,1fr)] gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-2 2xl:grid-cols-3">
          {puzzles.map((x) => (
            <PuzzleCard key={x.puzzle} x={x} history={c.history?.puzzles[x.puzzle]} grow />
          ))}
        </div>
      )}
    </Surface>
  );
}

/** What the students say: the average and the spread of the ratings, then every review. */
function Reviews({ c }: { c: Coach }) {
  const counts = c.ratingCounts ?? [0, 0, 0, 0, 0],
    most = Math.max(1, ...counts);
  return (
    <Surface className="min-h-40 max-lg:flex-none">
      <SectionHead title="Reviews" meta={c.reviews || undefined} className="px-4 pt-2" />
      {!c.reviewList?.length ? (
        <Empty icon={Star}>{tr("No review yet.")}</Empty>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-5 px-4 pt-1 pb-4" aria-label={tr("Ratings")}>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className={cn(NUMERIC, "text-4xl font-semibold tracking-tight")}>{c.rating?.toFixed(1) ?? "–"}</span>
              <Stars rating={c.rating} size={12} figure={false} />
              <span className="text-xs text-muted-foreground">{plural(c.reviews, "review")}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className={cn(NUMERIC, "w-3 text-muted-foreground")}>{n}</span>
                  <Bar ratio={counts[n - 1]! / most} fill="bg-warning" className="h-1.5 flex-1" />
                  <span className={cn(NUMERIC, "w-6 text-right text-muted-foreground")}>{counts[n - 1]}</span>
                </div>
              ))}
            </div>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3" data-slot="reviews">
            {c.reviewList.map((r, i) => (
              <li key={i} className="flex flex-col gap-2.5 rounded-lg bg-muted/40 p-3.5">
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.username} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{r.username}</span>
                    <span className="text-xs text-muted-foreground">{day(r.at)}</span>
                  </span>
                  <Stars rating={r.rating} size={13} figure={false} />
                </span>
                {r.comment && <p className="whitespace-pre-line leading-relaxed text-foreground/85">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Surface>
  );
}

/** Booking a coach: their calendar of free slots and the times of the chosen day, the whole page. */
export function BookPage({ id }: { id: string }) {
  const { state } = useLocation();
  const conversationId = state?.conversationId;
  const fromConversation = Number.isSafeInteger(conversationId) && conversationId > 0;
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load(`slots:${id}`);
  }, [id]);
  const c = coaching.profiles.get(id),
    data = coaching.slots.get(id);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Back to={url(fromConversation ? "messages/" + conversationId : "coach/" + id)} label={fromConversation ? tr("Back to conversation") : c?.username ?? tr("Back")} />}
        title={tr("Book a session")}
        sub={
          c && (
            <span className={NUMERIC}>
              {tr("with")}{" "}{c.username} · {data?.sessionMinutes ?? c.sessionMinutes} {" "}{tr("min ·")}{" "}<span className="text-primary">{price(data?.priceCents ?? c.priceCents)}</span>
            </span>
          )
        }
      />
      <section aria-label={tr("Book a session")} className="flex min-h-0 min-w-0 flex-1 flex-col max-lg:overflow-y-auto">
        {id === s.user.id ? (
          <Surface className="flex-1">
            <Empty icon={CalendarCheck}>{tr("Players book you here.")}</Empty>
          </Surface>
        ) : (
          <Booking id={id} />
        )}
      </section>
    </div>
  );
}

/** A coach's page on its way: the card about them with its face, the two cards of figures, their times; the reviews beside. */
function ProfileSkeleton() {
  const card = "rounded-xl ring-1 ring-foreground/10";
  return (
    <div aria-busy="true" aria-label={tr("Loading")} className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex flex-col gap-4">
        <div className={cn(card, "flex gap-5 p-5")}>
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className={cn(card, "flex flex-col gap-3 p-4")}>
              <Skeleton className="h-4 w-1/3" />
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={cn(card, "flex-1")} />
      </div>
      <div className={cn(card, "flex flex-col gap-3 p-4")}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

/** One step of booking, numbered: ticked once done, filled while it waits on the player. */
function Step({ n, state, id, children }: { n: number; state: "done" | "now" | "later"; id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className={cn("flex items-center gap-2 text-sm font-medium", state === "later" && "text-muted-foreground")}>
      <span
        className={cn(
          NUMERIC,
          "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          state === "done" ? "bg-primary/15 text-primary" : state === "now" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {state === "done" ? <Check className="size-3" strokeWidth={3} /> : n}
      </span>
      {children}
    </h3>
  );
}

/** The free slots in the player's time, on the same calendar as the coach's: a day (or one of its times), a time, a note; then Book. */
function Booking({ id }: { id: string }) {
  const data = coaching.slots.get(id),
    c = coaching.profiles.get(id);
  const byDay = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    for (const slot of data?.slots ?? []) map.set(dayKey(slot.start), [...(map.get(dayKey(slot.start)) ?? []), slot]);
    return map;
  }, [data]);
  const [picked, setPicked] = useState<string>(""),
    [slot, setSlot] = useState<number | null>(null),
    [note, setNote] = useState(""),
    [accepted, setAccepted] = useState(false),
    [pending, setPending] = useState(false);
  // The first day with a slot comes chosen; a slot taken meanwhile is dropped.
  const chosenDay = byDay.has(picked) ? picked : (byDay.keys().next().value ?? "");
  const times = byDay.get(chosenDay) ?? [];
  const chosen = times.find((t) => t.start === slot);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    today = dayKey(Date.now()),
    [month, setMonth] = useState(""),
    shown = month || (chosenDay || today).slice(0, 7);
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
  if (!data)
    return (
      <div aria-busy="true" aria-label={tr("Loading")} className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-0 flex-col gap-3">
          <Skeleton className="h-8 w-72" />
          <CalendarSkeleton />
        </div>
        <div className="flex flex-col gap-3 self-start rounded-xl p-5 ring-1 ring-foreground/10">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
          <Skeleton className="h-20" />
          <Skeleton className="h-10" />
        </div>
      </div>
    );
  return (
    <>
      {!data.accepting || !data.slots.length ? (
        <Surface className="flex-1">
          <Empty icon={!data.welcome ? UserRoundX : CalendarX}>
            {!data.welcome ? tr("{0} is not taking new students right now. Write to them to ask.", { 0: c?.username ?? tr("This coach") }) : data.accepting ? tr("{0} has no open slot in the next four weeks.", { 0: c?.username ?? tr("This coach") }) : tr("This coach is not taking bookings right now.")}
          </Empty>
        </Surface>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <MonthHeader month={shown} today={today} onMonth={setMonth}>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {tr("Free slots · times in")}{" "}{said(zone)}
              </span>
            </MonthHeader>
            <Month
              month={shown}
              today={today}
              selected={(d) => d === chosenDay}
              disabled={(d) => !byDay.has(d)}
              pick={(d) => {
                setPicked(d);
                setSlot(null);
              }}
              cell={(d, past) => {
                const free = past ? [] : (byDay.get(d) ?? []);
                if (!free.length) return {};
                // The times fill their day as boxes; only a phone's days, too narrow for them, show a line instead.
                return {
                  body: (
                    <>
                      <span className={cn(NARROW_BAR, "@max-[5.5rem]:hidden @max-[3.5rem]:block")} aria-hidden="true" />
                      <DayBoxes items={free} className="@max-[3.5rem]:hidden">
                        {(t, paired) => (
                          <DayChip
                            key={t.start}
                            tone={t.start === slot ? "chosen" : "free"}
                            paired={paired}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPicked(d);
                              setSlot(t.start);
                            }}
                          >
                            {time(t.start)}
                          </DayChip>
                        )}
                      </DayBoxes>
                    </>
                  ),
                };
              }}
            />
          </div>
          <Surface className="max-h-full self-start" data-slot="booking-details">
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5">
              <div className="flex flex-col gap-3">
                <Step n={1} state={chosen ? "done" : "now"}>
                  {tr("Pick a time")}<span className="ml-auto text-xs font-normal text-muted-foreground">{chosenDay && day(times[0]?.start ?? Date.now())}</span>
                </Step>
                <div className="grid grid-cols-3 gap-2" data-slot="slots">
                  {times.map((t) => (
                    <UiButton key={t.start} variant={t.start === slot ? "default" : "outline"} className={NUMERIC} data-slot-start={t.start} onClick={() => setSlot(t.start)}>
                      {time(t.start)}
                    </UiButton>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Step n={2} state={chosen ? (note.trim() ? "done" : "now") : "later"} id="booking-note-label">
                  {tr("What would you like to work on?")}</Step>
                <Textarea id="booking-note" aria-labelledby="booking-note-label" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={4} placeholder={tr("Optional: your average, the step you struggle with…")} className="min-h-20 resize-none" />
              </div>
              <div className="flex flex-col gap-3 text-xs" data-slot="cancellation-policy">
                <h3 className="text-sm font-medium">{tr("Cancellation policy")}</h3>
                <p id="cancellation-terms" className="text-muted-foreground">{said(CANCELLATION_TERMS)}</p>
                {chosen && !cancellationOpen(chosen.start) && (
                  <Alert variant="warning">
                    <AlertDescription className="text-xs text-warning">{tr("This session starts within 24 hours and cannot be cancelled once booked.")}</AlertDescription>
                  </Alert>
                )}
                <label className="flex items-start gap-2" htmlFor="accept-cancellation-policy">
                  <Checkbox id="accept-cancellation-policy" checked={accepted} onCheckedChange={setAccepted} aria-describedby="cancellation-terms" />
                  <span>{tr("I have read and accept the cancellation policy.")}</span>
                </label>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 p-4 pt-0">
              <UiButton size="lg" className="w-full max-md:h-11" disabled={!chosen || !accepted || pending} onClick={book} data-action="coaching:book">
                <CalendarCheck />
                {chosen ? tr("Book {0}", { 0: span(chosen.start, chosen.end) }) : tr("Pick a time to book")}
              </UiButton>
              <span className="text-center text-xs text-muted-foreground">{tr("Confirmed at once · payment comes later")}</span>
            </div>
          </Surface>
        </div>
      )}
    </>
  );
}
