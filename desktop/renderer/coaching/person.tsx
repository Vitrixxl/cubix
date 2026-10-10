/**
 * Someone the account coaches (or is coached by), from a session in the calendar or a conversation: a card in a
 * popover with the session and what matters at a glance, and their whole file in a dialog: figures, activity,
 * progress per puzzle, cases learned, the coach's notes and every session together.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CalendarDays, GraduationCap, MessageSquare, Timer, TrendingDown, TrendingUp, UserRound, Video } from "lucide-react";
import { Avatar, Icon, Modal, NUMERIC, plural } from "../ui";
import { catalog } from "../store";
import { go } from "../navigation";
import { fmtTime } from "../../../src/client/lib/format";
import { eventInfo } from "../../../src/shared/puzzles";
import { callOpen, coaching, price, type Booking, type History, type PersonProfile } from "./client";
import { day, relative, span, url } from "./parts";
import { Bar, Empty, SectionHead, StateMark, Stars, Surface, Tip } from "../base";
import { HEAT_LEVELS, heatmap, type HeatCell } from "../../../src/client/lib/profile";
import { CancelButton, MoveButton, Offer, ReviewButton } from "./sessions";
import { CANCELLATION_NOTICE, cancellationOpen } from "./policy";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tr, localFormat, locale } from "../../../src/client/i18n";
import { said } from "../base";
import { msg } from "../../../src/client/i18n/msg";
/** The notes' editor, loaded with them only: it weighs more than the rest of coaching. */
const PrivateNotes = lazy(() => import("./notes").then((m) => ({ default: m.PrivateNotes })));

const sinceFormat = localFormat({ month: "long", year: "numeric" });
const since = (iso: string) => sinceFormat.format(new Date(iso));

function usePerson(id: string) {
  useEffect(() => {
    void coaching.load(`person:${id}`);
  }, [id]);
  return coaching.people.get(id);
}

/**
 * A session in full: who with (their face, since when on Qbix), when and why, what matters at a glance, then what can
 * be done: join the call, write, see their file, review it, offer another time, cancel; another time offered under it.
 */
export function SessionCard({ b, onProfile }: { b: Booking; onProfile: () => void }) {
  const p = usePerson(b.with.id),
    now = Date.now(),
    over = b.endsAt <= now,
    open = callOpen(b, now),
    waiting = coaching.waiting.has(b.id),
    upcoming = b.status === "booked" && !over;
  const done = p?.sessions.filter((x) => x.status === "booked" && x.endsAt <= now).length;
  return (
    <div className="flex flex-col gap-5 p-6 max-md:p-1" data-slot="session-card">
      <div className="flex items-center gap-3.5">
        <Avatar name={b.with.username} src={b.with.avatar} size={52} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xl font-extrabold tracking-[-0.02em]">{b.with.username}</span>
          <span className="text-[13px] text-muted-foreground">{p ? tr("{0} · on Qbix since {1}", { 0: b.role === "coach" ? tr("Your student") : tr("Your coach"), 1: since(p.since) }) : <Skeleton className="mt-1 h-3 w-36" />}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className={cn(NUMERIC, "text-2xl font-extrabold tracking-[-0.02em] first-letter:uppercase", b.status === "cancelled" && "text-muted-foreground line-through")}>{span(b.startsAt, b.endsAt)}</span>
        <span className={cn(NUMERIC, "text-[13px] text-muted-foreground")}>
          {b.status === "cancelled" ? (b.cancelledByMe ? tr("Cancelled by you") : tr("Cancelled by {0}", { 0: b.with.username })) : over ? tr("Session over") : relative(b.startsAt, now)} · {price(b.priceCents)}
        </span>
        {b.note && <p className="pt-2 text-[15px] leading-normal whitespace-pre-line">“{b.note}”</p>}
      </div>
      <dl className="flex gap-8 text-xs text-muted-foreground">
        {(
          [
            [done, tr("sessions together")],
            [p?.practice.solves.toLocaleString(locale()), tr("solves")],
            [p?.practice.activeDays, tr("active days · 30 d")],
          ] as const
        ).map(([value, label]) => (
          <div key={label} className="flex flex-col">
            <dd className={cn(NUMERIC, "order-first text-lg font-extrabold text-foreground")}>{value ?? "–"}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {open && (
          <UiButton onClick={() => go(url("call/" + b.id))} data-action="coaching:join">
            <Video />
            {waiting ? tr("{0} is waiting", { 0: b.with.username }) : tr("Join call")}
          </UiButton>
        )}
        {over && b.status === "booked" && b.role === "student" && <ReviewButton b={b} />}
        {b.conversationId && (
          <UiButton variant="outline" onClick={() => go(url(b.role === "coach" ? "students/" + b.studentId : "messages/" + b.conversationId))} data-action="session:message">
            <MessageSquare />
            {tr("Message")}
          </UiButton>
        )}
        <UiButton variant="outline" onClick={onProfile} data-action="person:profile">
          <UserRound />
          {b.role === "coach" ? tr("Student file") : tr("Coach file")}
        </UiButton>
      </div>
      {over && b.role === "coach" && b.review && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Stars rating={b.review.rating} size={12} figure={false} />
          {b.review.comment && <span>“{b.review.comment}”</span>}
        </p>
      )}
      {upcoming && (
        <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            {b.role === "coach" && <MoveButton b={b} label />}
            <CancelButton b={b} label />
          </span>
          <span data-slot="cancellation-deadline">{cancellationOpen(b.startsAt, now) ? tr("Cancellation allowed before {0}.", { 0: span(b.startsAt - CANCELLATION_NOTICE) }) : tr("Cancellation closed: this session starts within 24 hours.")}</span>
        </div>
      )}
      {b.proposal && upcoming && <Offer b={b} />}
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
    <Modal open={open} onOpenChange={onOpenChange} title={name} hideHeader tall className="flex h-[min(88vh,52rem)] flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-5xl" sheetClassName="gap-0 bg-background p-0">
      {open && <PersonBody id={id} name={name} inChat={inChat} close={() => onOpenChange(false)} />}
    </Modal>
  );
}

/** A part of someone's file: a card, its title on top. */
const SECTION = "gap-3 p-5";

function PersonBody({ id, name, inChat, close }: { id: string; name: string; inChat: boolean; close: () => void }) {
  const p = usePerson(id),
    now = Date.now();
  const booked = p?.sessions.filter((b) => b.status === "booked") ?? [],
    done = booked.filter((b) => b.endsAt <= now),
    rated = done.filter((b) => b.review),
    minutes = done.reduce((sum, b) => sum + (b.endsAt - b.startsAt) / 60_000, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="person-dialog">
      {/* The close button keeps the top right corner: the way to the conversation sits under the name. */}
      <header className="flex shrink-0 items-center gap-4 p-6 pr-14 pb-3 max-md:p-5">
        <Avatar name={name} src={p?.avatar} size={64} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <h2 className="truncate text-2xl font-extrabold tracking-[-0.03em]">{name}</h2>
          <p className="text-sm text-muted-foreground">
            {p
              ? [
                  p.role === "student" ? tr("Your student") : tr("Your coach"),
                  tr("on Qbix since {0}", { 0: since(p.since) }),
                  p.practice.lastAt ? tr("last solve {0}", { 0: relative(new Date(p.practice.lastAt).getTime(), now) }) : tr("no solve yet"),
                ].join(" · ")
              : tr("Loading…")}
          </p>
          {p && !inChat && (
            <UiButton
              variant="outline"
              className="mt-1"
              onClick={() => {
                close();
                go(url(p.role === "student" ? "students/" + p.id : "messages/" + p.conversationId));
              }}
            >
              <MessageSquare />
              {tr("Message")}
            </UiButton>
          )}
        </div>
      </header>
      {!p ? (
        <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label={tr("Loading")}>
          <Skeleton className="h-16 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-[1fr_23rem]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 max-md:p-5">
          <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-3 px-1 lg:grid-cols-6">
            {(
              [
                [done.length, msg("sessions together")],
                [booked.length - done.length, msg("to come")],
                [minutes ? `${(minutes / 60).toLocaleString(locale(), { maximumFractionDigits: 1 })} h` : "–", msg("spent together")],
                [rated.length ? (rated.reduce((sum, b) => sum + b.review!.rating, 0) / rated.length).toFixed(1) : "–", msg("rating of the sessions")],
                [p.practice.solves.toLocaleString(locale()), msg("solves")],
                [p.practice.activeDays, msg("active days · 30 d")],
              ] as const
            ).map(([value, label]) => (
              <div key={label} className="flex flex-col">
                <dd className={cn(NUMERIC, "order-first text-2xl font-extrabold tracking-[-0.02em]")}>{value}</dd>
                <dt className="text-xs text-muted-foreground">{said(label)}</dt>
              </div>
            ))}
          </dl>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <Activity days={p.history.days} />
              <Surface className={SECTION} aria-label={tr("Puzzles")}>
                <SectionHead title="Puzzles" />
                {!p.practice.puzzles.length ? (
                  <Empty icon={Timer} className="p-4">
                    {tr("No timed solve yet.")}
                  </Empty>
                ) : (
                  <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    {p.practice.puzzles.map((x) => (
                      <PuzzleCard key={x.puzzle} x={x} history={p.history.puzzles[x.puzzle]} />
                    ))}
                  </div>
                )}
              </Surface>
              <Learned ids={p.history.learned} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {p.note !== null && <Suspense fallback={<Skeleton className="h-96" />}><PrivateNotes conversation={p.conversationId} note={p.note} className="h-96" /></Suspense>}
              <Surface className={SECTION} aria-label={tr("Sessions together")}>
                <SectionHead title="Sessions together" meta={p.sessions.length || undefined} />
                {!p.sessions.length ? (
                  <Empty icon={CalendarDays} className="p-4">
                    {tr("No session yet.")}
                  </Empty>
                ) : (
                  <ul className="-mx-2 flex flex-col gap-0.5" data-slot="person-sessions">
                    {p.sessions.map((b) => (
                      <li key={b.id} className={cn("flex flex-col gap-1 rounded-xl px-2 py-2", b.status === "cancelled" && "opacity-60")}>
                        <span className="flex items-center gap-2">
                          <span className={cn(NUMERIC, "text-sm")}>{span(b.startsAt)}</span>
                          <span className="ml-auto">
                            {b.status === "cancelled" ? (
                              <StateMark tone="off">{tr("cancelled")}</StateMark>
                            ) : b.endsAt > now ? (
                              <StateMark tone="good">{day(b.startsAt) === day(now) ? tr("today") : tr("to come")}</StateMark>
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
              </Surface>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Solves per day over the last year, a week per column from Monday: the profile's graph, its steps and its cells. */
export function Activity({ days, className }: { days: History["days"]; className?: string }) {
  const { cells, weeks, months, level, total } = useMemo(() => heatmap(new Map(days.map(([key, count]) => [key, { count, times: [] }])), null), [days]),
    [hover, setHover] = useState<HeatCell | null>(null);
  return (
    <Surface className={cn(SECTION, className)} aria-label={tr("Activity")}>
      {/* The day under the pointer takes the place of the year's total. */}
      <SectionHead title="Activity" meta={<span className="text-xs">{hover ? `${plural(hover.count, "solve")} · ${day(hover.date.getTime())}` : `${plural(total, "solve")} ${tr("in the last year")}`}</span>} />
      <div
        className="grid"
        role="img"
        aria-label={`${plural(total, "solve")} ${tr("in the last year")}`}
        onMouseLeave={() => setHover(null)}
        style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, gridTemplateRows: "auto", gap: 3 }}
        data-slot="person-activity"
      >
        {/* A month starting in the last weeks would stick out past the grid. */}
        {months
          .filter((m) => m.week < weeks - 2)
          .map((m) => (
            <span key={m.week} className="pb-1 text-xs leading-none whitespace-nowrap text-muted-foreground" style={{ gridRow: 1, gridColumn: m.week + 1 }}>
              {said(m.label)}
            </span>
          ))}
        {cells.map((c, i) =>
          c.hidden ? null : (
            <span
              key={c.key}
              className={cn("aspect-square rounded-[3px] outline-offset-1", HEAT_LEVELS[level(c.count)], hover?.key === c.key && "outline outline-foreground/70")}
              onMouseEnter={() => setHover(c)}
              style={{ gridRow: 2 + (i % 7), gridColumn: 1 + Math.floor(i / 7) }}
            />
          ),
        )}
      </div>
    </Surface>
  );
}

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
          <span className="text-sm font-bold">{said(eventInfo(x.puzzle)?.label ?? x.puzzle)}</span>
          <span className="text-xs text-muted-foreground">{plural(x.solves, "solve")}</span>
        </div>
        {change != null && Math.abs(change) >= 10 && (
          <Tip content={tr("Last solves against the ones before")}>
            <span className={cn(NUMERIC, "flex items-center gap-1 text-xs font-medium", change < 0 ? "text-success" : "text-destructive")}>
              {change < 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
              {change < 0 ? "−" : "+"}
              {fmtTime(Math.abs(change))}
            </span>
          </Tip>
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
    <div className="flex min-h-16 flex-1 gap-2" aria-label={tr("The last solves, faint, under their running Ao5")} role="img">
      <span className={cn(NUMERIC, "flex flex-col justify-between text-xs text-muted-foreground")}>
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
    <Surface className={cn(SECTION, className)} aria-label={tr("Cases learned")}>
      <SectionHead title="Cases learned" meta={ids.length || undefined} />
      {!sets.length ? (
        <Empty icon={GraduationCap} className="p-4">
          {tr("No case learned yet.")}
        </Empty>
      ) : (
        <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2" data-slot="person-learned">
          {sets.map((set) => (
            <li key={set.id} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium">{said(set.label)}</span>
                <span className={cn(NUMERIC, "shrink-0 whitespace-nowrap text-muted-foreground")}>
                  {set.learned} / {set.count}
                </span>
              </span>
              <Bar ratio={set.learned / set.count} label={set.label} />
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
