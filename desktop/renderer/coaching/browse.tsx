/** Finding a coach: every coach as a card, then a coach's page: the slots to book first, their reviews beside. */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, Clock, Languages, MessageSquare, Search } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, Icon, NUMERIC, PAGE, PageHead, plural } from "../ui";
import { go } from "../navigation";
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { coaching, price, type Coach } from "./client";
import { fmtTime } from "../../../src/client/lib/format";
import { Back, Events, Nothing, PANEL, PANEL_HEAD, Stars, dayKey, day, relative, span, time, url } from "./parts";
import { Activity, Learned, PuzzleCard } from "./person";
import { BOX, DayBoxes, Month, MonthHeader, NARROW_BAR } from "./calendar";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

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
  const options = [{ value: "all", label: "Every event" }, ...taught.map((e) => ({ value: e.id, label: e.label }))];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, language, method…" aria-label="Search coaches" data-action="coaching:search" />
        </InputGroup>
        <Select items={options} value={event} onValueChange={(v) => setEvent(String(v))}>
          <SelectTrigger aria-label="Event" data-action="coaching:event" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.value !== "all" && <Icon name={"Puzzle" + o.value} size={14} />}
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-px">
        {!shown ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : !shown.length ? (
          <Nothing className="h-full">
            {list?.length ? "No coach matches your search." : "No coach has opened their page yet."}
            {!coaching.isCoach && !list?.length && (
              <UiButton variant="outline" onClick={() => go(url("apply"))} data-action="coaching:apply">
                Become the first coach
              </UiButton>
            )}
          </Nothing>
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

function CoachCard({ c }: { c: Coach }) {
  const top = c.practice?.puzzles[0];
  return (
    <Link
      to={url("coach/" + c.id)}
      data-coach={c.username}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50"
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
          <span className="block text-xs font-normal text-muted-foreground">{c.sessionMinutes} min</span>
        </span>
      </div>
      <p className="line-clamp-2 min-h-10 text-muted-foreground">{c.headline || "Speedcubing coach"}</p>
      {top && (
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2" data-slot="coach-stats">
          <Icon name={"Puzzle" + top.puzzle} size={18} />
          <span className="text-xs text-muted-foreground">{eventInfo(top.puzzle)?.label ?? top.puzzle}</span>
          <span className={cn(NUMERIC, "ml-auto text-xs text-muted-foreground")}>
            PB <span className="font-medium text-foreground">{fmtTime(top.best)}</span>
          </span>
          {top.ao5 != null && (
            <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
              Ao5 <span className="font-medium text-foreground">{fmtTime(top.ao5)}</span>
            </span>
          )}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Events events={c.events} />
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", c.nextSlot ? "text-foreground" : "text-muted-foreground")}>
          <CalendarCheck className="size-3.5" />
          {!c.newStudents ? "Full · own students only" : c.nextSlot ? span(c.nextSlot) : "No open slot"}
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
      <PageHead lead={<Back to={url(own ? "profile" : "coaches")} label={own ? "Your coach profile" : "Every coach"} />} title={c?.username ?? <Skeleton className="h-7 w-40" />}>
        {!own && c && booked && (
          <UiButton variant="outline" onClick={message} data-action="coaching:message">
            <MessageSquare />
            Message
          </UiButton>
        )}
      </PageHead>
      {!c ? (
        <ProfileSkeleton />
      ) : (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] max-lg:auto-rows-max max-lg:overflow-y-auto">
          <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto">
            <About c={c} own={own} />
            <div className="grid shrink-0 gap-4 xl:grid-cols-2">
              <FigureCard
                title="As a coach"
                sub={`since ${month(c.since)}`}
                items={[
                  ["Rating", c.rating == null ? "New" : c.rating.toFixed(1), "text-warning"],
                  ["Sessions given", c.sessions],
                  ["Students", c.students],
                ]}
              />
              <FigureCard
                title="As a cuber"
                sub={c.practice?.lastAt ? `last solve ${relative(new Date(c.practice.lastAt).getTime())}` : "no solve yet"}
                items={[
                  ["Solves", (c.practice?.solves ?? 0).toLocaleString("en-US")],
                  ["Active days · 30 d", c.practice?.activeDays ?? 0],
                  ["Cases learned", c.practice?.learned ?? 0],
                ]}
              />
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

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const month = (ms: number) => monthFormat.format(ms);

/** The coach in full: their picture, headline, terms and presentation, and beside them the way to book. */
function About({ c, own }: { c: Coach; own: boolean }) {
  const slots = coaching.slots.get(c.id),
    next = slots?.slots[0]?.start ?? c.nextSlot;
  return (
    <div className={cn(PANEL, "shrink-0")} data-slot="coach-about">
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
              {c.sessionMinutes} min sessions
            </span>
            {!!c.languages.length && (
              <span className="flex items-center gap-1">
                <Languages className="size-3.5" />
                {c.languages.join(", ")}
              </span>
            )}
          </span>
          <p className="max-h-28 max-w-3xl overflow-y-auto whitespace-pre-line text-muted-foreground">{c.bio || "This coach has not written about themselves yet."}</p>
          {!!c.events.length && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {c.events.map((e) => (
                <span key={e} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                  <Icon name={"Puzzle" + e} size={14} />
                  {eventInfo(e)?.label ?? e}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-64 shrink-0 flex-col justify-center gap-3 border-l pl-5 max-sm:w-full max-sm:border-t max-sm:border-l-0 max-sm:pt-4 max-sm:pl-0">
          <span className={cn(NUMERIC, "flex items-baseline gap-2")}>
            <span className="text-2xl font-semibold text-primary">{price(c.priceCents)}</span>
            <span className="text-muted-foreground">for {c.sessionMinutes} min</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarCheck className="size-3.5 shrink-0" />
            <span className="truncate">{!c.newStudents && !own ? "Own students only" : next ? `Next free slot ${span(next)}` : "No open slot"}</span>
          </span>
          {own ? (
            <UiButton variant="outline" size="lg" onClick={() => go(url("schedule"))}>
              Edit your schedule
            </UiButton>
          ) : (
            <UiButton size="lg" className="h-11" onClick={() => go(url(`coach/${c.id}/book`))} data-action="coaching:open-booking">
              <CalendarCheck />
              Book a session
            </UiButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** Three figures under a title, one card. */
function FigureCard({ title, sub, items }: { title: string; sub: string; items: [label: string, value: React.ReactNode, tone?: string][] }) {
  return (
    <div className={cn(PANEL, "gap-2 px-4 py-3")} data-slot="coach-figures">
      <h3 className="flex items-baseline gap-2 font-medium">
        {title} <span className="truncate text-xs font-normal text-muted-foreground">{sub}</span>
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map(([label, value, tone]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <span className={cn(NUMERIC, "truncate text-xl font-medium tracking-tight", tone)}>{value}</span>
            <span className="truncate text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** How the coach practises: their year of solves beside the cases they learned. */
function Progress({ c }: { c: Coach }) {
  return (
    <div className="grid shrink-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-slot="coach-practice">
      <Activity days={c.history?.days ?? []} now={Date.now()} className="bg-card" />
      <Learned ids={c.history?.learned ?? []} className="bg-card" />
    </div>
  );
}

/** Their times on each puzzle they solve most, the cards sharing the height left. */
function Times({ c }: { c: Coach }) {
  const puzzles = c.practice?.puzzles ?? [];
  return (
    <section className={cn(PANEL, "min-h-56 flex-1 max-lg:flex-none")} aria-label="Puzzles">
      <h3 className={PANEL_HEAD}>
        Times per puzzle <span className="text-xs font-normal text-muted-foreground">most solved first</span>
      </h3>
      {!puzzles.length ? (
        <Nothing>No timed solve yet.</Nothing>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(8.5rem,1fr)] gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-2 2xl:grid-cols-3">
          {puzzles.map((x) => (
            <PuzzleCard key={x.puzzle} x={x} history={c.history?.puzzles[x.puzzle]} grow />
          ))}
        </div>
      )}
    </section>
  );
}

/** What the students say: the average and the spread of the ratings, then every review. */
function Reviews({ c }: { c: Coach }) {
  const counts = c.ratingCounts ?? [0, 0, 0, 0, 0],
    most = Math.max(1, ...counts);
  return (
    <div className={cn(PANEL, "min-h-40 max-lg:flex-none")}>
      <h3 className={PANEL_HEAD}>
        Reviews <span className={cn(NUMERIC, "text-muted-foreground")}>{c.reviews || ""}</span>
      </h3>
      {!c.reviewList?.length ? (
        <Nothing className="py-8">No review yet.</Nothing>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-5 px-4 pt-1 pb-4" aria-label="Ratings">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className={cn(NUMERIC, "text-4xl font-semibold tracking-tight")}>{c.rating?.toFixed(1) ?? "–"}</span>
              <Stars rating={c.rating} size={12} figure={false} />
              <span className="text-xs text-muted-foreground">{plural(c.reviews, "review")}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className={cn(NUMERIC, "w-3 text-muted-foreground")}>{n}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-warning" style={{ width: `${(counts[n - 1]! / most) * 100}%` }} />
                  </span>
                  <span className={cn(NUMERIC, "w-6 text-right text-muted-foreground")}>{counts[n - 1]}</span>
                </div>
              ))}
            </div>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3" data-slot="reviews">
            {c.reviewList.map((r, i) => (
              <li key={i} className="flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-3.5">
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
    </div>
  );
}

/** Booking a coach: their calendar of free slots and the times of the chosen day, the whole page. */
export function BookPage({ id }: { id: string }) {
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load(`slots:${id}`);
  }, [id]);
  const c = coaching.profiles.get(id),
    data = coaching.slots.get(id);
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Back to={url("coach/" + id)} label={c?.username ?? "Back"} />}
        title="Book a session"
        sub={
          c && (
            <span className={NUMERIC}>
              with {c.username} · {data?.sessionMinutes ?? c.sessionMinutes} min · <span className="text-primary">{price(data?.priceCents ?? c.priceCents)}</span>
            </span>
          )
        }
      />
      <section aria-label="Book a session" className="flex min-h-0 min-w-0 flex-1 flex-col max-lg:overflow-y-auto">
        {id === s.user.id ? <Nothing className={cn(PANEL, "flex-1")}>Players book you here.</Nothing> : <Booking id={id} />}
      </section>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="flex-1 rounded-xl" />
      </div>
      <Skeleton className="rounded-xl" />
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
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
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
    if (!chosen || pending) return;
    setPending(true);
    try {
      const booking = await coaching.book(id, chosen.start, note.trim());
      toast.success("Session booked", { description: `${span(booking.startsAt, booking.endsAt)} with ${booking.with.username}` });
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
      <div aria-busy="true" aria-label="Loading" className="flex flex-1 flex-col gap-3">
        <Skeleton className="h-7 w-72" />
        <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="rounded-xl" />
          <Skeleton className="rounded-xl" />
        </div>
      </div>
    );
  return (
    <>
      {!data.accepting || !data.slots.length ? (
        <Nothing className={cn(PANEL, "flex-1")}>{!data.welcome ? `${c?.username ?? "This coach"} is not taking new students right now. Write to them to ask.` : data.accepting ? `${c?.username ?? "This coach"} has no open slot in the next four weeks.` : "This coach is not taking bookings right now."}</Nothing>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <MonthHeader month={shown} today={today} onMonth={setMonth}>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                Free slots · times in {zone}
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
                          <button
                            key={t.start}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPicked(d);
                              setSlot(t.start);
                            }}
                            className={cn(BOX, paired && "px-0.5", t.start === slot ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary hover:bg-primary/25")}
                          >
                            {time(t.start)}
                          </button>
                        )}
                      </DayBoxes>
                    </>
                  ),
                };
              }}
            />
          </div>
          <div className={PANEL}>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              <div className="flex flex-col gap-3">
                <Step n={1} state={chosen ? "done" : "now"}>
                  Pick a time
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{chosenDay && day(times[0]?.start ?? Date.now())}</span>
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
                  What would you like to work on?
                </Step>
                <Textarea id="booking-note" aria-labelledby="booking-note-label" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={4} placeholder="Optional: your average, the step you struggle with…" className="min-h-20 resize-none" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 p-4 pt-0">
              <UiButton size="lg" className="h-11 w-full" disabled={!chosen || pending} onClick={book} data-action="coaching:book">
                <CalendarCheck />
                {chosen ? `Book ${span(chosen.start, chosen.end)}` : "Pick a time to book"}
              </UiButton>
              <span className="text-center text-xs text-muted-foreground">Confirmed at once · payment comes later</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
