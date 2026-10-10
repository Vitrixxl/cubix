/** Every session as a line under its day, filtered by status; the one chosen beside, with what can be done with it. */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, CalendarX, Check, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Modal, NUMERIC, ROW, StateMark, Surface, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, price, type Booking } from "./client";
import { Tools, day, dayKey, relative, span, time, url } from "./parts";
import { Empty, LINK, LINK_ACCENT, ListSkeleton, Segmented, Stars } from "../base";
import { PersonDialog, SessionCard } from "./person";
import { CANCELLATION_NOTICE, cancellationOpen } from "./policy";
import { store as s } from "../store";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { ask } from "../confirm";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";
import { msg } from "../../../src/client/i18n/msg";

const SESSION_TABS = { upcoming: msg("Upcoming"), past: msg("Past"), cancelled: msg("Cancelled") };

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
  useEffect(() => {
    void coaching.load("bookings");
  }, []);
  const now = useMinute(),
    phone = usePhone();
  const [tab, setTab] = useState("upcoming"),
    [picked, setPicked] = useState(""),
    [person, setPerson] = useState<Booking | null>(null);
  const all = coaching.bookings;
  const groups = {
    upcoming: all?.filter((b) => b.status === "booked" && b.endsAt > now).sort((a, b) => a.startsAt - b.startsAt),
    past: all?.filter((b) => b.status === "booked" && b.endsAt <= now).sort((a, b) => b.startsAt - a.startsAt),
    cancelled: all?.filter((b) => b.status === "cancelled").sort((a, b) => b.startsAt - a.startsAt),
  };
  const list = groups[tab as keyof typeof groups],
    current = list?.find((b) => b.id === picked) ?? (phone ? undefined : list?.[0]);
  const detail = current && <SessionCard key={current.id} b={current} onProfile={() => setPerson(current)} />;
  return (
    <>
      <Tools>
        <Segmented
          label="Sessions"
          value={tab}
          action="sessions:"
          onChange={(v) => {
            setTab(v);
            setPicked("");
          }}
          options={(["upcoming", "past", "cancelled"] as const).map((id) => ({ id, label: said(SESSION_TABS[id]), count: groups[id]?.length }))}
        />
      </Tools>
      <div className={cn("grid min-h-0 flex-1 gap-5", !phone && "grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]")}>
        <Surface className="min-w-0 px-2.5 pt-3 pb-2.5" aria-label={tr("Sessions")}>
          {!list ? (
            <ListSkeleton />
          ) : !list.length ? (
            <Empty icon={CalendarDays} className="h-full">
              {tab === "upcoming" ? tr("No upcoming session.") : tab === "past" ? tr("No past session yet.") : tr("No cancelled session.")}
              {tab === "upcoming" && (
                <UiButton variant="outline" onClick={() => go(url("coaches"))} data-action="coaching:find">
                  {tr("Find a coach")}
                </UiButton>
              )}
            </Empty>
          ) : (
            <SessionDays list={list} now={now} active={current?.id} onPick={(b) => setPicked(b.id)} />
          )}
        </Surface>
        {!phone && <Surface className="min-w-0 overflow-y-auto">{detail ?? <Empty icon={CalendarDays} title="Pick a session." />}</Surface>}
      </div>
      {phone && (
        <Modal open={!!current} onOpenChange={(open) => !open && setPicked("")} title={current ? span(current.startsAt, current.endsAt) : tr("Sessions")} hideHeader>
          {detail}
        </Modal>
      )}
      {person && <PersonDialog id={person.with.id} name={person.with.username} open onOpenChange={(open) => !open && setPerson(null)} />}
    </>
  );
}

const dayTitle = (ms: number, now: number) => (dayKey(ms) === dayKey(now) ? tr("Today") : dayKey(ms) === dayKey(now + 86_400_000) ? tr("Tomorrow") : dayKey(ms) === dayKey(now - 86_400_000) ? tr("Yesterday") : day(ms));

/** Sessions as lines under their day; a click on one shows it. */
export function SessionDays({ list, now, active, onPick }: { list: Booking[]; now: number; active?: string; onPick: (b: Booking) => void }) {
  const days: Booking[][] = [];
  for (const b of list) {
    const last = days[days.length - 1];
    if (last && dayKey(last[0]!.startsAt) === dayKey(b.startsAt)) last.push(b);
    else days.push([b]);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" data-slot="sessions">
      {days.map((d) => (
        <section key={d[0]!.id} className="flex flex-col gap-0.5" aria-label={dayTitle(d[0]!.startsAt, now)}>
          <h3 className="px-3 pt-1 pb-0.5 text-xs font-bold text-muted-foreground first-letter:uppercase">{dayTitle(d[0]!.startsAt, now)}</h3>
          {d.map((b) => (
            <SessionLine key={b.id} b={b} now={now} active={b.id === active} onClick={() => onPick(b)} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** Where a session stands, in a word after its dot: the call open, a new time offered, a review to leave, how soon. */
function standing(b: Booking, now: number): [tone: "" | "good" | "accent" | "lilac" | "off", text: string] {
  if (b.status === "cancelled") return ["off", b.cancelledByMe ? tr("cancelled by you") : tr("cancelled")];
  if (callOpen(b, now)) return coaching.waiting.has(b.id) ? ["accent", tr("{0} is waiting", { 0: b.with.username })] : ["good", tr("call open")];
  if (b.proposal && b.endsAt > now) return ["lilac", tr("new time offered")];
  if (b.endsAt <= now) return b.role === "student" && !b.review ? ["accent", tr("to review")] : ["", tr("over")];
  return ["", relative(b.startsAt, now)];
}

/** One session in a list: its hours and price, who with and why, and where it stands. */
export function SessionLine({ b, now, active = false, onClick }: { b: Booking; now: number; active?: boolean; onClick: () => void }) {
  const [tone, text] = standing(b, now);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(ROW, "grid w-full grid-cols-[6.5rem_auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 aria-[current=true]:bg-muted", b.status === "cancelled" && "text-muted-foreground")}
      data-booking={b.id}
      data-session={b.id}
    >
      <span className="flex flex-col">
        <b className={cn(NUMERIC, "text-[15px] font-extrabold", b.status === "cancelled" && "line-through")}>
          {time(b.startsAt)}–{time(b.endsAt)}
        </b>
        <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{price(b.priceCents)}</span>
      </span>
      <Avatar name={b.with.username} src={b.with.avatar} size={36} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">
          {b.with.username} <span className="text-xs font-semibold text-muted-foreground">{b.role === "student" ? tr("your coach") : tr("your student")}</span>
        </span>
        <span className="truncate text-[13px] text-muted-foreground">{b.note || tr("No note")}</span>
      </span>
      <StateMark tone={tone}>{text}</StateMark>
    </button>
  );
}

/** Another time the coach offered: the student takes it or keeps the session where it is; the coach may take it back. */
export function Offer({ b }: { b: Booking }) {
  const [pending, setPending] = useState(false);
  const act = async (work: () => Promise<void>, done: string) => {
    setPending(true);
    try {
      await work();
      toast.success(done);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] bg-muted px-4 py-3.5 text-sm" data-slot="offer">
      <StateMark tone="lilac">{b.role === "student" ? tr("{0} offers another time", { 0: b.with.username }) : tr("You offered another time")}</StateMark>
      <p>
        <span className={cn(NUMERIC, "text-[17px] font-bold first-letter:uppercase")}>{span(b.proposal!.start, b.proposal!.end)}</span>
        {b.role === "coach" && <span className="text-muted-foreground"> {tr("· waiting for")} {b.with.username}</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {b.role === "student" ? (
          <>
            <UiButton size="sm" disabled={pending} onClick={() => act(() => coaching.answer(b.id, true), tr("Session moved"))} data-action="offer:accept">
              <Check />
              {tr("Move it")}
            </UiButton>
            <UiButton size="sm" variant="outline" disabled={pending} onClick={() => act(() => coaching.answer(b.id, false), tr("Session kept where it was"))} data-action="offer:decline">
              {tr("Keep the time")}
            </UiButton>
          </>
        ) : (
          <UiButton size="sm" variant="outline" disabled={pending} onClick={() => act(() => coaching.propose(b.id, null), tr("Offer taken back"))} data-action="offer:withdraw">
            {tr("Take back")}
          </UiButton>
        )}
      </div>
    </div>
  );
}

/** The coach offers another time: one of their free slots, which the student then takes or turns down. */
export function MoveButton({ b, label = false }: { b: Booking; label?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? (
        <button type="button" className={LINK_ACCENT} onClick={() => setOpen(true)} data-action="coaching:move">
          {tr("Offer another time")}
        </button>
      ) : (
        <Tip content={tr("Offer another time")}>
          <UiButton variant="ghost" size="icon-sm" aria-label={tr("Offer another time")} onClick={() => setOpen(true)} data-action="coaching:move">
            <CalendarClock />
          </UiButton>
        </Tip>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={tr("Offer another time")}
        description={`${tr("Now")} ${span(b.startsAt, b.endsAt)} ${tr("with")} ${b.with.username}${tr(". The session stays where it is until they accept.")}`}
        className="sm:max-w-lg"
      >
        {open && <MoveForm b={b} close={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function MoveForm({ b, close }: { b: Booking; close: () => void }) {
  useEffect(() => {
    void coaching.load(`slots:${s.user.id}`);
  }, []);
  const data = coaching.slots.get(s.user.id);
  const days = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const slot of data?.slots ?? []) if (slot.start !== b.startsAt) map.set(dayKey(slot.start), [...(map.get(dayKey(slot.start)) ?? []), slot.start]);
    return map;
  }, [data, b.startsAt]);
  const [picked, setPicked] = useState(""),
    [start, setStart] = useState<number | null>(null),
    [pending, setPending] = useState(false);
  const shown = days.has(picked) ? picked : ([...days.keys()][0] ?? "");
  const items = [...days.keys()].map((d) => ({ value: d, label: day(days.get(d)![0]!) }));
  async function send() {
    if (start == null) return;
    setPending(true);
    try {
      await coaching.propose(b.id, start);
      toast.success(tr("Offer sent to {0}", { 0: b.with.username }));
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-5" data-slot="move-dialog">
      {!data ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label={tr("Loading")}>
          <Skeleton className="h-8" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        </div>
      ) : !days.size ? (
        <Empty icon={CalendarX} className="p-2">
          {tr("No free slot in the next four weeks: open more hours in your schedule.")}
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <Select items={items} value={shown} onValueChange={(v: string | null) => (setPicked(v ?? ""), setStart(null))}>
            <SelectTrigger aria-label={tr("Day")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {said(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-4 gap-2" data-slot="move-times">
            {(days.get(shown) ?? []).map((t) => (
              <UiButton key={t} variant={t === start ? "default" : "outline"} className={NUMERIC} onClick={() => setStart(t)}>
                {time(t)}
              </UiButton>
            ))}
          </div>
        </div>
      )}
      <DialogFooter>
        <UiButton disabled={start == null || pending} onClick={send} data-action="coaching:move:send">
          {pending ? tr("Sending…") : tr("Send the offer")}
        </UiButton>
      </DialogFooter>
    </div>
  );
}

/** Cancelling a session once confirmed; within its last 24 hours, only why it cannot be. */
export function CancelButton({ b, label = false }: { b: Booking; label?: boolean }) {
  const [closed, setClosed] = useState(false);
  const when = `${day(b.startsAt)} ${tr("at")} ${time(b.startsAt)} ${tr("with")} ${b.with.username}.`;
  async function cancel() {
    if (!cancellationOpen(b.startsAt)) return setClosed(true);
    if (!(await ask({ title: tr("Cancel this session?"), text: when + tr(" They are told at once and the slot opens again."), action: tr("Cancel the session"), cancel: tr("Keep it") }))) return;
    if (!cancellationOpen(b.startsAt)) return setClosed(true);
    try {
      await coaching.cancel(b.id);
      toast.success(tr("Session cancelled"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <>
      {label ? (
        <button type="button" className={cn(LINK, "hover:text-destructive")} onClick={cancel} data-action="coaching:cancel">
          {tr("Cancel the session")}
        </button>
      ) : (
        <Tip content={tr("Cancel the session")}>
          <UiButton variant="ghost" size="icon-sm" aria-label={tr("Cancel the session")} onClick={cancel} data-action="coaching:cancel" className="hover:text-destructive">
            <X />
          </UiButton>
        </Tip>
      )}
      {/* Nothing to confirm: the same dialog as a confirmation, closed by its one button. */}
      <AlertDialog open={closed} onOpenChange={setClosed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Cancellation is closed")}</AlertDialogTitle>
            <AlertDialogDescription>
              {when}
              {tr(" Sessions cannot be cancelled in the final 24 hours before they start.")} {tr("Cancellation deadline:")} {span(b.startsAt - CANCELLATION_NOTICE)}
              {tr(". Cancellations must be made before this time.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Rating a past session: five stars and a few words, changeable later. */
export function ReviewButton({ b }: { b: Booking }) {
  const [open, setOpen] = useState(false),
    [rating, setRating] = useState(b.review?.rating ?? 0),
    [comment, setComment] = useState(b.review?.comment ?? ""),
    [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    try {
      await coaching.review(b.id, rating, comment.trim());
      toast.success(tr("Thanks for your review"));
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      {b.review ? (
        <Tip content={tr("Edit your review")}>
          <UiButton variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={tr("Edit your review")}>
            <Stars rating={b.review.rating} size={12} figure={false} />
          </UiButton>
        </Tip>
      ) : (
        <UiButton size="sm" variant="outline" onClick={() => setOpen(true)} data-action="coaching:review">
          <Star />
          {tr("Review")}
        </UiButton>
      )}
      <Modal open={open} onOpenChange={setOpen} title={`${tr("Your session with")} ${b.with.username}`} description={`${day(b.startsAt)} ${tr("· other players read your review on the coach's page.")}`} className="sm:max-w-md">
        <Rating value={rating} onChange={setRating} />
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={4} placeholder={tr("What helped you most?")} aria-label={tr("Comment")} className="resize-none" />
        <DialogFooter>
          <UiButton disabled={!rating || pending} onClick={save} data-action="coaching:review:save">
            {pending ? tr("Saving…") : tr("Save review")}
          </UiButton>
        </DialogFooter>
      </Modal>
    </>
  );
}

/** One to five stars, picked with a click: every star up to the one chosen lights up. */
function Rating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <ToggleGroup value={value ? [String(value)] : []} onValueChange={(v: string[]) => v[0] && onChange(Number(v[0]))} aria-label={tr("Rating")} className="justify-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <ToggleGroupItem key={n} value={String(n)} aria-label={tr("{0} out of 5", { 0: n })} data-rating={n} size="icon" className="hover:bg-transparent aria-pressed:bg-transparent data-[pressed]:bg-transparent">
          <Star className={cn("size-8! transition-colors", n <= value ? "fill-warning text-warning" : "text-muted-foreground/40")} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
