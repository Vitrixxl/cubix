/** Finding a coach: every coach as a card, then a coach's page with their reviews and the slots to book. */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Clock, Languages, MessageSquare, Search } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { store as s } from "../store";
import { Avatar, Icon, NUMERIC, PAGE, PageHead, plural } from "../ui";
import { go } from "../navigation";
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { coaching, price, type Coach } from "./client";
import { Back, Events, Figures, Nothing, PANEL, PANEL_HEAD, Stars, dayKey, day, span, time, url } from "./parts";
import { CalendarGrid } from "./calendar";
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
  return (
    <Link
      to={url("coach/" + c.id)}
      data-coach={c.username}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-3">
        <Avatar name={c.username} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{c.username}</span>
          <span className="flex items-center gap-1.5 text-xs">
            <Stars rating={c.rating} size={12} />
            <span className="text-muted-foreground">· {plural(c.reviews, "review")}</span>
          </span>
        </div>
        <span className={cn(NUMERIC, "shrink-0 text-right font-medium")}>
          {price(c.priceCents)}
          <span className="block text-xs font-normal text-muted-foreground">{c.sessionMinutes} min</span>
        </span>
      </div>
      <p className="line-clamp-2 min-h-10 text-muted-foreground">{c.headline || "Speedcubing coach"}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <Events events={c.events} />
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", c.nextSlot ? "text-foreground" : "text-muted-foreground")}>
          <CalendarCheck className="size-3.5" />
          {c.nextSlot ? span(c.nextSlot) : "No open slot"}
        </span>
      </div>
    </Link>
  );
}

/** A coach's page: who they are and what their students say on the left, the slots to book on the right. */
export function CoachPage({ id }: { id: string }) {
  useEffect(() => {
    void coaching.load(`coach:${id}`);
    void coaching.load(`slots:${id}`);
  }, [id]);
  const c = coaching.profiles.get(id),
    own = id === s.user.id;
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
      <PageHead lead={<Back to={url(own ? "profile" : "coaches")} label={own ? "Your coach profile" : "Every coach"} />} title={c?.username ?? <Skeleton className="h-7 w-40" />} sub={c?.headline}>
        {!own && c && (
          <UiButton variant="outline" onClick={message} data-action="coaching:message">
            <MessageSquare />
            Message
          </UiButton>
        )}
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-5 max-lg:flex-col max-lg:overflow-y-auto">
        <section aria-label="Profile" className={cn(PANEL, "flex-1 max-lg:shrink-0 max-lg:overflow-visible")}>
          {!c ? <ProfileSkeleton /> : <Profile c={c} />}
        </section>
        <section aria-label="Book a session" className={cn(PANEL, "w-[26rem] shrink-0 max-lg:w-full")}>
          {own ? (
            <Nothing>
              Players book you here.
              <UiButton variant="outline" onClick={() => go(url("schedule"))}>
                Edit your schedule
              </UiButton>
            </Nothing>
          ) : (
            <Booking id={id} />
          )}
        </section>
      </div>
    </div>
  );
}

function Profile({ c }: { c: Coach }) {
  const counts = c.ratingCounts ?? [0, 0, 0, 0, 0],
    most = Math.max(1, ...counts);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-4 border-b px-5 py-4">
        <Avatar name={c.username} size={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-lg font-semibold tracking-tight">{c.username}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Stars rating={c.rating} />
            <span>{plural(c.reviews, "review")}</span>
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
        </div>
      </div>
      <Figures
        items={[
          ["Rating", c.rating == null ? "–" : c.rating.toFixed(1), "text-warning"],
          ["Sessions given", c.sessions],
          ["Students", c.students],
          ["Per session", price(c.priceCents), "text-primary"],
        ]}
      />
      <div className="grid border-b md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex flex-col gap-3 px-5 py-4">
          <h3 className="text-xs font-medium text-muted-foreground">About</h3>
          <p className="whitespace-pre-line">{c.bio || "This coach has not written about themselves yet."}</p>
          {!!c.events.length && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              {c.events.map((e) => (
                <span key={e} className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon name={"Puzzle" + e} size={16} />
                  {eventInfo(e)?.label ?? e}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 px-5 py-4 md:border-l" aria-label="Ratings">
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
      <h3 className={PANEL_HEAD}>
        Reviews <span className={cn(NUMERIC, "text-muted-foreground")}>{c.reviews}</span>
      </h3>
      {!c.reviewList?.length ? (
        <Nothing className="py-10">No review yet.</Nothing>
      ) : (
        <ul className="flex flex-col" data-slot="reviews">
          {c.reviewList.map((r, i) => (
            <li key={i} className="flex flex-col gap-1.5 border-b px-5 py-3 last:border-b-0">
              <span className="flex items-center gap-2 text-xs">
                <Avatar name={r.username} size={20} />
                <span className="font-medium">{r.username}</span>
                <Stars rating={r.rating} size={12} figure={false} />
                <span className="ml-auto text-muted-foreground">{day(r.at)}</span>
              </span>
              {r.comment && <p className="whitespace-pre-line">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col">
      <div className="flex items-center gap-4 border-b px-5 py-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <Skeleton className="m-5 h-12" />
      <Skeleton className="mx-5 h-24" />
    </div>
  );
}

/** The free slots in the player's time: a day of the next four weeks, then one of its times, a note, and Book. */
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
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-56" />
        <Skeleton className="h-20" />
      </div>
    );
  return (
    <>
      <div className={PANEL_HEAD}>
        Book a session
        <span className={cn(NUMERIC, "ml-auto font-normal text-muted-foreground")}>
          {data.sessionMinutes} min · {price(data.priceCents)}
        </span>
      </div>
      {!data.accepting || !data.slots.length ? (
        <Nothing>{data.accepting ? `${c?.username ?? "This coach"} has no open slot in the next four weeks.` : "This coach is not taking bookings right now."}</Nothing>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <CalendarGrid
            weeks={5}
            marked={(key) => (byDay.has(key) ? "open" : "none")}
            selected={new Set([chosenDay])}
            onPick={(key) => {
              setPicked(key);
              setSlot(null);
            }}
            disabled={(key) => !byDay.has(key)}
            className="border-b px-4 py-3"
          />
          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <span className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{chosenDay && day(times[0]?.start ?? Date.now())}</span>
              <span className="truncate pl-2">{zone}</span>
            </span>
            <div className="grid grid-cols-4 gap-1.5" data-slot="slots">
              {times.map((t) => (
                <UiButton key={t.start} variant={t.start === slot ? "default" : "outline"} size="sm" className={NUMERIC} data-slot-start={t.start} onClick={() => setSlot(t.start)}>
                  {time(t.start)}
                </UiButton>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            <label htmlFor="booking-note" className="text-xs font-medium text-muted-foreground">
              What would you like to work on?
            </label>
            <Textarea id="booking-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Optional" className="min-h-16 resize-none" />
          </div>
        </div>
      )}
      {data.accepting && !!data.slots.length && (
        <div className="flex shrink-0 flex-col gap-1.5 border-t p-4">
          <UiButton size="lg" className="h-10 w-full" disabled={!chosen || pending} onClick={book} data-action="coaching:book">
            <CalendarCheck />
            {chosen ? `Book ${span(chosen.start, chosen.end)}` : "Pick a time"}
          </UiButton>
          <span className="text-center text-xs text-muted-foreground">Confirmed at once · payment comes later</span>
        </div>
      )}
    </>
  );
}
