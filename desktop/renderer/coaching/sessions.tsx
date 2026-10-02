/** Every session of the account, as a student or as a coach: the coming ones to join, the past ones to review. */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, MessageSquare, Star, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, NUMERIC, Tip } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, price, type Booking } from "./client";
import { Nothing, PANEL, ROWS, RowsSkeleton, Stars, day, dayKey, relative, span, time, url } from "./parts";
import { store as s } from "../store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const now = useMinute();
  const [tab, setTab] = useState("upcoming");
  const all = coaching.bookings;
  const groups = {
    upcoming: all?.filter((b) => b.status === "booked" && b.endsAt > now).sort((a, b) => a.startsAt - b.startsAt),
    past: all?.filter((b) => b.status === "booked" && b.endsAt <= now),
    cancelled: all?.filter((b) => b.status === "cancelled"),
  };
  const list = groups[tab as keyof typeof groups];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Tabs value={tab} onValueChange={(v: string) => setTab(v)} className="shrink-0">
        <TabsList>
          {(["upcoming", "past", "cancelled"] as const).map((id) => (
            <TabsTrigger key={id} value={id} data-action={"sessions:" + id} className="gap-1.5 px-3 capitalize">
              {id}
              {groups[id] && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{groups[id]!.length}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <section aria-label="Sessions" className={cn(PANEL, "flex-1")}>
        {!list ? (
          <RowsSkeleton />
        ) : !list.length ? (
          <Nothing>
            {tab === "upcoming" ? "No session planned." : tab === "past" ? "No session yet." : "No cancelled session."}
            {tab === "upcoming" && (
              <UiButton variant="outline" onClick={() => go(url("coaches"))} data-action="coaching:find">
                Find a coach
              </UiButton>
            )}
          </Nothing>
        ) : (
          <ul className={cn(ROWS, "min-h-0 flex-1 overflow-y-auto")} data-slot="sessions">
            {list.map((b) => (
              <SessionRow key={b.id} b={b} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One session: when, with whom and why, then what can be done with it. */
export function SessionRow({ b, now, compact = false }: { b: Booking; now: number; compact?: boolean }) {
  const open = callOpen(b, now),
    waiting = coaching.waiting.has(b.id),
    over = b.endsAt <= now;
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg px-3 py-2.5 hover:bg-muted/40", b.status === "cancelled" && "opacity-60")} data-booking={b.id}>
      <div className="flex items-center gap-4">
        <div className="flex w-24 shrink-0 flex-col">
          <span className="text-xs text-muted-foreground">{day(b.startsAt)}</span>
          <span className={cn(NUMERIC, "font-medium")}>
            {time(b.startsAt)}–{time(b.endsAt)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={b.with.username} src={b.with.avatar} size={32} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 truncate font-medium">
              {b.with.username}
              <Badge variant="secondary" className="font-normal">
                {b.role === "student" ? "Your coach" : "Your student"}
              </Badge>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {b.status === "cancelled"
                ? `Cancelled by ${b.cancelledByMe ? "you" : b.with.username}`
                : over
                  ? b.note || "Session over"
                  : `${relative(b.startsAt, now)}${b.note ? " · " + b.note : ""}`}
            </span>
          </div>
        </div>
        {!compact && <span className={cn(NUMERIC, "shrink-0 text-muted-foreground max-md:hidden")}>{price(b.priceCents)}</span>}
        <div className="flex shrink-0 items-center gap-1.5">
          {open && (
            <UiButton size="sm" onClick={() => go(url("call/" + b.id))} data-action="coaching:join" className={cn(waiting && "animate-pulse")}>
              <Video />
              {waiting ? `${b.with.username} is waiting` : "Join call"}
            </UiButton>
          )}
          {over && b.status === "booked" && b.role === "student" && <ReviewButton b={b} />}
          {over && b.role === "coach" && b.review && <Stars rating={b.review.rating} size={12} figure={false} />}
          {b.conversationId && (
            <Tip content={"Message " + b.with.username}>
              <UiButton variant="ghost" size="icon-sm" aria-label={"Message " + b.with.username} onClick={() => go(url("messages/" + b.conversationId))}>
                <MessageSquare />
              </UiButton>
            </Tip>
          )}
          {b.status === "booked" && !over && b.role === "coach" && <MoveButton b={b} />}
          {b.status === "booked" && !over && <CancelButton b={b} />}
        </div>
      </div>
      {b.proposal && b.status === "booked" && !over && <Offer b={b} />}
    </li>
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-warning/10 px-3 py-2 text-sm" data-slot="offer">
      <CalendarClock className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        {b.role === "student" ? `${b.with.username} offers to move it to ` : "You offered "}
        <span className={cn(NUMERIC, "font-medium")}>{span(b.proposal!.start, b.proposal!.end)}</span>
        {b.role === "coach" && <span className="text-muted-foreground"> · waiting for {b.with.username}</span>}
      </span>
      {b.role === "student" ? (
        <span className="flex gap-1.5">
          <UiButton size="sm" variant="outline" disabled={pending} onClick={() => act(() => coaching.answer(b.id, false), "Session kept where it was")} data-action="offer:decline">
            Keep the time
          </UiButton>
          <UiButton size="sm" disabled={pending} onClick={() => act(() => coaching.answer(b.id, true), "Session moved")} data-action="offer:accept">
            <Check />
            Move it
          </UiButton>
        </span>
      ) : (
        <UiButton size="sm" variant="ghost" disabled={pending} onClick={() => act(() => coaching.propose(b.id, null), "Offer taken back")} data-action="offer:withdraw">
          Take back
        </UiButton>
      )}
    </div>
  );
}

/** The coach offers another time: one of their free slots, which the student then takes or turns down. */
export function MoveButton({ b, label = false }: { b: Booking; label?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? (
        <UiButton variant="outline" size="sm" className="flex-1" onClick={() => setOpen(true)} data-action="coaching:move">
          <CalendarClock />
          Move
        </UiButton>
      ) : (
        <Tip content="Offer another time">
          <UiButton variant="ghost" size="icon-sm" aria-label="Offer another time" onClick={() => setOpen(true)} data-action="coaching:move">
            <CalendarClock />
          </UiButton>
        </Tip>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-slot="move-dialog">
          {open && <MoveForm b={b} close={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
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
      toast.success(`Offer sent to ${b.with.username}`);
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Offer another time</DialogTitle>
        <DialogDescription>
          Now {span(b.startsAt, b.endsAt)} with {b.with.username}. The session stays where it is until they accept.
        </DialogDescription>
      </DialogHeader>
      {!data ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : !days.size ? (
        <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">No free slot in the next four weeks: open more hours in your schedule.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Select items={items} value={shown} onValueChange={(v: string | null) => (setPicked(v ?? ""), setStart(null))}>
            <SelectTrigger aria-label="Day" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
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
          {pending ? "Sending…" : "Send the offer"}
        </UiButton>
      </DialogFooter>
    </>
  );
}

export function CancelButton({ b, label = false }: { b: Booking; label?: boolean }) {
  const [pending, setPending] = useState(false),
    [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {label ? (
        <AlertDialogTrigger render={<UiButton variant="outline" size="sm" className="flex-1 hover:text-destructive" data-action="coaching:cancel" />}>
          <X />
          Cancel
        </AlertDialogTrigger>
      ) : (
        <Tip content="Cancel the session">
          <AlertDialogTrigger render={<UiButton variant="ghost" size="icon-sm" aria-label="Cancel the session" data-action="coaching:cancel" className="hover:text-destructive" />}>
            <X />
          </AlertDialogTrigger>
        </Tip>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
          <AlertDialogDescription>
            {day(b.startsAt)} at {time(b.startsAt)} with {b.with.username}. They are told at once and the slot opens again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await coaching.cancel(b.id);
                setOpen(false);
                toast.success("Session cancelled");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            Cancel the session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Rating a past session: five stars and a few words, changeable later. */
function ReviewButton({ b }: { b: Booking }) {
  const [open, setOpen] = useState(false),
    [rating, setRating] = useState(b.review?.rating ?? 0),
    [comment, setComment] = useState(b.review?.comment ?? ""),
    [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    try {
      await coaching.review(b.id, rating, comment.trim());
      toast.success("Thanks for your review");
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
        <button type="button" onClick={() => setOpen(true)} aria-label="Edit your review" className="rounded-md px-1 py-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50">
          <Stars rating={b.review.rating} size={12} figure={false} />
        </button>
      ) : (
        <UiButton size="sm" variant="outline" onClick={() => setOpen(true)} data-action="coaching:review">
          <Star />
          Review
        </UiButton>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your session with {b.with.username}</DialogTitle>
            <DialogDescription>{day(b.startsAt)} · other players read your review on the coach's page.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} out of 5`} data-rating={n} onClick={() => setRating(n)} className="rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <Star className={cn("size-8", n <= rating ? "fill-warning text-warning" : "text-muted-foreground/40")} />
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={4} placeholder="What helped you most?" aria-label="Comment" className="resize-none" />
          <DialogFooter>
            <UiButton disabled={!rating || pending} onClick={save} data-action="coaching:review:save">
              {pending ? "Saving…" : "Save review"}
            </UiButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
