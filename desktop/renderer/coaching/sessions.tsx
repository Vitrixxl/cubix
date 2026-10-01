/** Every session of the account, as a student or as a coach: the coming ones to join, the past ones to review. */
import { useEffect, useState } from "react";
import { MessageSquare, Star, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, NUMERIC, Tip } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, price, type Booking } from "./client";
import { Nothing, PANEL, RowsSkeleton, Stars, day, relative, time, url } from "./parts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
          <ul className="min-h-0 flex-1 overflow-y-auto" data-slot="sessions">
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
    <li className={cn("flex items-center gap-4 border-b px-4 py-3 last:border-b-0", b.status === "cancelled" && "opacity-60")} data-booking={b.id}>
      <div className="flex w-24 shrink-0 flex-col">
        <span className="text-xs text-muted-foreground">{day(b.startsAt)}</span>
        <span className={cn(NUMERIC, "font-medium")}>
          {time(b.startsAt)}–{time(b.endsAt)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={b.with.username} size={32} />
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
        {b.status === "booked" && !over && <CancelButton b={b} />}
      </div>
    </li>
  );
}

function CancelButton({ b }: { b: Booking }) {
  const [pending, setPending] = useState(false),
    [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Tip content="Cancel the session">
        <AlertDialogTrigger render={<UiButton variant="ghost" size="icon-sm" aria-label="Cancel the session" data-action="coaching:cancel" className="hover:text-destructive" />}>
          <X />
        </AlertDialogTrigger>
      </Tip>
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
