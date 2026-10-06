/**
 * Someone the account coaches (or is coached by), from a session in the calendar or a conversation: a card in a
 * popover with the session and what matters at a glance, and their whole file in a dialog: figures, activity,
 * progress per puzzle, cases learned, the coach's notes and every session together.
 */
import { useEffect, useMemo } from "react";
import { MessageSquare, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import { Avatar, Icon, NUMERIC, plural } from "../ui";
import { catalog } from "../store";
import { go } from "../navigation";
import { fmtTime } from "../../../src/client/lib/format";
import { eventInfo } from "../../../src/shared/puzzles";
import { coaching, type Booking, type History, type PersonProfile } from "./client";
import { PrivateNotes } from "./notes";
import { Figures, Stars, day, relative, span, url } from "./parts";
import { CancelButton, MoveButton, Offer } from "./sessions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { tr, localFormat, locale } from "../../../src/client/i18n";
import { said } from "../base";

const sinceFormat = localFormat({ month: "long", year: "numeric" });
const since = (iso: string) => sinceFormat.format(new Date(iso));

function usePerson(id: string) {
  useEffect(() => {
    void coaching.load(`person:${id}`);
  }, [id]);
  return coaching.people.get(id);
}

/** The card of a booked session: who, when, why, and the way to their profile or their conversation. */
export function SessionCard({ b, onProfile }: { b: Booking; onProfile: () => void }) {
  const p = usePerson(b.with.id);
  const done = p?.sessions.filter((x) => x.status === "booked" && x.endsAt <= Date.now()).length;
  return (
    <div className="flex flex-col gap-3" data-slot="session-card">
      <div className="flex items-center gap-3">
        <Avatar name={b.with.username} src={b.with.avatar} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{b.with.username}</span>
          <span className="text-xs text-muted-foreground">{p ? tr("{0} · on Qbix since {1}", { 0: b.role === "coach" ? "Student" : "Coach", 1: since(p.since) }) : <Skeleton className="mt-1 h-3 w-36" />}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
        <span className={cn(NUMERIC, "font-medium")}>{span(b.startsAt, b.endsAt)}</span>
        <span className="text-xs text-muted-foreground">{relative(b.startsAt)}</span>
        {b.note && <p className="pt-1 whitespace-pre-line">“{b.note}”</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
        {(
          [
            ["Together", done],
            ["Solves", p?.practice.solves],
            ["Days · 30", p?.practice.activeDays],
          ] as const
        ).map(([label, value]) => (
          <span key={label} className="flex flex-col gap-0.5 rounded-lg border px-2 py-1.5">
            <span className={cn(NUMERIC, "text-base font-medium text-foreground")}>{value ?? "–"}</span>
            {said(label)}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        {b.conversationId && (
          <UiButton variant="outline" size="sm" className="flex-1" onClick={() => go(url(b.role === "coach" ? "students/" + b.studentId : "messages/" + b.conversationId))}>
            <MessageSquare />
            {tr("Message")}</UiButton>
        )}
        <UiButton size="sm" className="flex-1" onClick={onProfile} data-action="person:profile">
          <UserRound />
          {tr("View profile")}</UiButton>
      </div>
      {b.role === "coach" && b.status === "booked" && b.endsAt > Date.now() && (
        <>
          {b.proposal && <Offer b={b} />}
          <div className="flex gap-2">
            <MoveButton b={b} label />
            <CancelButton b={b} label />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Someone's whole file: their figures, their activity over a year, how each puzzle goes, the cases they learned, the
 * coach's notes (written here) and every session together. `inChat`: opened from their conversation, which it then
 * does not offer again.
 */
export function PersonDialog({ id, name, open, onOpenChange, inChat = false }: { id: string; name: string; open: boolean; onOpenChange: (open: boolean) => void; inChat?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" data-slot="person-dialog">
        {open && <PersonBody id={id} name={name} inChat={inChat} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const WEEKS = 53;
const SECTION = "flex flex-col gap-3 rounded-xl border p-4";
const SECTION_HEAD = "flex items-baseline gap-2 text-sm font-medium";

function PersonBody({ id, name, inChat, close }: { id: string; name: string; inChat: boolean; close: () => void }) {
  const p = usePerson(id),
    now = Date.now();
  const booked = p?.sessions.filter((b) => b.status === "booked") ?? [],
    done = booked.filter((b) => b.endsAt <= now),
    rated = done.filter((b) => b.review),
    minutes = done.reduce((sum, b) => sum + (b.endsAt - b.startsAt) / 60_000, 0);
  return (
    <>
      <DialogHeader className="flex-row items-center gap-4 border-b p-6 pb-5">
        <Avatar name={name} src={p?.avatar} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DialogTitle className="text-xl">{name}</DialogTitle>
          <DialogDescription>
            {p
              ? [
                  p.role === "student" ? "Your student" : "Your coach",
                  `on Qbix since ${since(p.since)}`,
                  p.practice.lastAt ? `last solve ${relative(new Date(p.practice.lastAt).getTime(), now)}` : "no solve yet",
                ].join(" · ")
              : tr("Loading…")}
          </DialogDescription>
        </div>
        {p && !inChat && (
          <UiButton
            variant="outline"
            size="sm"
            className="mr-6"
            onClick={() => {
              close();
              go(url(p.role === "student" ? "students/" + p.id : "messages/" + p.conversationId));
            }}
          >
            <MessageSquare />
            {tr("Message")}</UiButton>
        )}
      </DialogHeader>
      {!p ? (
        <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label={tr("Loading")}>
          <Skeleton className="h-[4.5rem] rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-[1fr_23rem]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <Figures
            className="bg-transparent max-lg:grid-cols-3!"
            items={[
              ["Sessions", done.length],
              ["Coming", booked.length - done.length],
              ["Together", minutes ? `${(minutes / 60).toLocaleString(locale(), { maximumFractionDigits: 1 })} h` : "–"],
              ["Rating", rated.length ? <Stars rating={rated.reduce((sum, b) => sum + b.review!.rating, 0) / rated.length} size={11} figure={false} /> : "–"],
              ["Solves", p.practice.solves],
              ["Active days · 30", p.practice.activeDays],
            ]}
          />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <Activity days={p.history.days} now={now} />
              <section className={SECTION} aria-label={tr("Puzzles")}>
                <h3 className={SECTION_HEAD}>{tr("Puzzles")}</h3>
                {!p.practice.puzzles.length ? (
                  <p className="text-sm text-muted-foreground">{tr("No timed solve yet.")}</p>
                ) : (
                  <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    {p.practice.puzzles.map((x) => (
                      <PuzzleCard key={x.puzzle} x={x} history={p.history.puzzles[x.puzzle]} />
                    ))}
                  </div>
                )}
              </section>
              <Learned ids={p.history.learned} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {p.note !== null && <PrivateNotes conversation={p.conversationId} note={p.note} className="h-96" />}
              <section className={SECTION} aria-label={tr("Sessions together")}>
                <h3 className={SECTION_HEAD}>
                  {tr("Sessions together")}{" "}<span className={cn(NUMERIC, "text-muted-foreground")}>{p.sessions.length || ""}</span>
                </h3>
                {!p.sessions.length ? (
                  <p className="text-sm text-muted-foreground">{tr("No session yet.")}</p>
                ) : (
                  <ul className="-mx-2 flex flex-col gap-0.5" data-slot="person-sessions">
                    {p.sessions.map((b) => (
                      <li key={b.id} className={cn("flex flex-col gap-1 rounded-lg px-2 py-2 hover:bg-muted/40", b.status === "cancelled" && "opacity-60")}>
                        <span className="flex items-center gap-2">
                          <span className={cn(NUMERIC, "text-sm")}>{span(b.startsAt)}</span>
                          <span className="ml-auto">
                            {b.status === "cancelled" ? (
                              <Badge variant="secondary">{tr("Cancelled")}</Badge>
                            ) : b.endsAt > now ? (
                              <Badge variant="secondary">{day(b.startsAt) === day(now) ? tr("Today") : tr("Coming")}</Badge>
                            ) : (
                              b.review && <Stars rating={b.review.rating} size={11} figure={false} />
                            )}
                          </span>
                        </span>
                        {b.note && <span className="text-xs whitespace-pre-line text-muted-foreground">{b.note}</span>}
                        {b.review?.comment && <span className="text-xs text-muted-foreground italic">“{b.review.comment}”</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Solves per day over the last year, a week per column, Monday on top. */
export function Activity({ days, now, className }: { days: History["days"]; now: number; className?: string }) {
  const { weeks, total, most } = useMemo(() => {
    const counts = new Map(days),
      today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    // The grid ends with the current week; its first column is the Monday 52 weeks before.
    const start = today.getTime() - (((today.getUTCDay() + 6) % 7) + WEEKS * 7 - 7) * 86_400_000;
    const weeks = Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const at = start + (w * 7 + d) * 86_400_000,
          key = new Date(at).toISOString().slice(0, 10);
        return { key, at, n: at > today.getTime() ? null : (counts.get(key) ?? 0) };
      }),
    );
    return { weeks, total: days.reduce((sum, [, n]) => sum + n, 0), most: Math.max(1, ...days.map(([, n]) => n)) };
  }, [days, now]);
  const tone = (n: number) => (n === 0 ? "bg-muted" : n / most > 0.66 ? "bg-primary" : n / most > 0.33 ? "bg-primary/65" : "bg-primary/35");
  return (
    <section className={cn(SECTION, className)} aria-label={tr("Activity")}>
      <h3 className={SECTION_HEAD}>
        {tr("Activity")}{" "}<span className="text-xs font-normal text-muted-foreground">{plural(total, "solve")} {" "}{tr("in the last year")}</span>
      </h3>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }} data-slot="person-activity">
        {weeks.flat().map((c) => (
          <span key={c.key} title={c.n == null ? undefined : `${plural(c.n, "solve")} · ${day(c.at)}`} className={cn("aspect-square rounded-[2px]", c.n == null ? "bg-transparent" : tone(c.n))} />
        ))}
      </div>
      <div className={cn(NUMERIC, "-mt-1 grid gap-x-[3px] text-[10px] text-muted-foreground")} style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }} aria-hidden="true">
        {weeks.map((week, w) => {
          const first = week.find((c) => new Date(c.at).getUTCDate() === 1);
          return first && w < WEEKS - 2 ? (
            <span key={w} className="whitespace-nowrap" style={{ gridColumn: `${w + 1} / span 3` }}>
              {monthLabel.format(first.at)}
            </span>
          ) : null;
        })}
      </div>
    </section>
  );
}
const monthLabel = localFormat({ month: "short", timeZone: "UTC" });

/** One puzzle: its best, Ao5 and Ao12, and the last solves as a line, with how much faster the recent half went. */
/** `grow`: the line takes the height the card is given. */
export function PuzzleCard({ x, history, grow = false }: { x: PersonProfile["practice"]["puzzles"][number]; history?: History["puzzles"][string]; grow?: boolean }) {
  const times = (history?.recent ?? []).filter((t): t is number => t != null);
  const half = Math.floor(times.length / 2),
    mean = (list: number[]) => list.reduce((sum, t) => sum + t, 0) / list.length,
    change = times.length >= 10 ? mean(times.slice(half)) - mean(times.slice(0, half)) : null;
  return (
    <div className="flex flex-col gap-2" data-puzzle={x.puzzle}>
      <div className="flex items-center gap-3">
        <Icon name={"Puzzle" + x.puzzle} size={22} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{eventInfo(x.puzzle)?.label ?? x.puzzle}</span>
          <span className="text-xs text-muted-foreground">{plural(x.solves, "solve")}</span>
        </div>
        {change != null && Math.abs(change) >= 10 && (
          <span className={cn(NUMERIC, "flex items-center gap-1 text-xs font-medium", change < 0 ? "text-success" : "text-destructive")} title={tr("Last solves against the ones before")}>
            {change < 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
            {change < 0 ? "−" : "+"}
            {fmtTime(Math.abs(change))}
          </span>
        )}
      </div>
      {times.length >= 2 ? <Sparkline times={times} detailed={grow} /> : grow && <span className="flex-1" />}
      <div className={cn(NUMERIC, "flex justify-between gap-3 text-xs whitespace-nowrap text-muted-foreground")}>
        {(
          [
            ["best", x.best],
            ["ao5", x.ao5],
            ["ao12", history?.ao12 ?? null],
          ] as const
        ).map(([label, value]) => (
          <span key={label}>
            {said(label)} <span className="font-medium text-foreground">{value == null ? "–" : fmtTime(value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Times as a line, faster higher. `detailed`: the times faint under their running Ao5, the fastest and slowest beside,
 * over the height the card gives. */
function Sparkline({ times, detailed = false }: { times: number[]; detailed?: boolean }) {
  const low = Math.min(...times),
    high = Math.max(...times),
    range = high - low || 1;
  const line = (list: (number | null)[]) =>
    list
      .map((t, i) => (t == null ? "" : `${(i / (times.length - 1)) * 100},${4 + ((t - low) / range) * 32}`))
      .filter(Boolean)
      .join(" ");
  const ao5 = times.map((_, i) => (i < 4 ? null : times.slice(i - 4, i + 1).reduce((sum, t) => sum + t, 0) / 5));
  const svg = (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={cn("w-full text-primary", detailed ? "absolute inset-0 h-full" : "h-10")} aria-hidden="true">
      <polyline points={line(times)} fill="none" stroke="currentColor" strokeWidth={detailed ? 1 : 1.5} opacity={detailed ? 0.35 : 1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {detailed && <polyline points={line(ao5)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
  if (!detailed) return svg;
  return (
    <div className="flex min-h-16 flex-1 gap-2" title={tr("The last solves, faint, under their running Ao5")}>
      <span className={cn(NUMERIC, "flex flex-col justify-between text-[10px] text-muted-foreground")}>
        <span>{fmtTime(low)}</span>
        <span>{fmtTime(high)}</span>
      </span>
      <div className="relative flex-1">{svg}</div>
    </div>
  );
}

/** The cases learned, per set of the catalogue, against the size of the set. */
export function Learned({ ids, className }: { ids: string[]; className?: string }) {
  const sets = useMemo(() => {
    const setOf = new Map<string, string>(catalog.cases.map((c: any) => [c.id, c.set]));
    const counts = new Map<string, number>();
    for (const id of ids) {
      const set = setOf.get(id);
      if (set) counts.set(set, (counts.get(set) ?? 0) + 1);
    }
    return (catalog.sets as { id: string; label: string; count: number }[]).filter((set) => counts.has(set.id)).map((set) => ({ ...set, learned: counts.get(set.id)! }));
  }, [ids]);
  return (
    <section className={cn(SECTION, className)} aria-label={tr("Cases learned")}>
      <h3 className={SECTION_HEAD}>
        {tr("Cases learned")}{" "}<span className={cn(NUMERIC, "text-muted-foreground")}>{ids.length || ""}</span>
      </h3>
      {!sets.length ? (
        <p className="text-sm text-muted-foreground">{tr("No case learned yet.")}</p>
      ) : (
        <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2" data-slot="person-learned">
          {sets.map((set) => (
            <li key={set.id} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium">{said(set.label)}</span>
                <span className={cn(NUMERIC, "text-muted-foreground")}>
                  {set.learned} / {set.count}
                </span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (set.learned / set.count) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
