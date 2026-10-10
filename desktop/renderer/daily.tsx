/**
 * The daily scramble (src/client/lib/daily.ts), drawn as the duel's arena: the days the player tried on the left, the
 * day's scramble and its one action in the middle (solve it, or the share of the field beaten once done), the field as
 * a histogram on the right with the player's bar raised. The same standing in a dialog after the solve.
 */
import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, History, Play, Undo2 } from "lucide-react";
import { store as s } from "./store";
import { call } from "./bridge";
import { Alg, Button, Empty, Modal, NUMERIC, PAGE, PageHead, Segmented, Surface, Tip, isPhone, useViewport } from "./ui";
import { CARD_LINK, KICKER, PanelHead, Stage, StageAction, StageFigure, StageMeter, Ticket, opens } from "./tournaments/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button as UiButton } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { bucketOf, dailyDay, dailyStats, fetchDaily, fetchDailyHistory, isDailyEvent, DAILY_EVENTS, type DailyBoard, type DailyDay, type DailyEvent, type DailyPlace } from "../../src/client/lib/daily";
import { fmtSolve, fmtTime } from "../../src/client/lib/format";
import { eventInfo } from "../../src/shared/puzzles";
import { locale, tn, tr } from "../../src/client/i18n";

const TICKET_LINK = cn(CARD_LINK, "hover:bg-muted aria-[current]:bg-muted");

/** A UTC day in words: "10 October". */
const dayLabel = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "long", timeZone: "UTC" });
/** An axis time: whole or tenth seconds, minutes past one. */
const axis = (ms: number) => (ms >= 60000 ? fmtTime(ms).replace(/\.\d+$/, "") : String(+(ms / 1000).toFixed(1))) + " s";
const eventLabel = (id: string) => tr(eventInfo(id)?.label ?? id);

/**
 * What the page read, kept for its next opening: shown at once, then read anew. A ranking that cannot be read stays as
 * it was, "offline" only when none was read yet. The field and results are kept by account.
 */
const scrambles = new Map<string, string>(),
  boards = new Map<string, DailyBoard | "offline">(),
  histories = new Map<string, DailyDay[] | "offline">();
/** The day's scramble of an event and its field, in the view chosen, with the attempt kept on this device placed in it. */
function loadDaily(event: DailyEvent, day: string) {
  const key = `${day}:${event}`,
    verified = s.dailyVerified,
    local = s.dailyDone[key],
    held = `${s.user.id}:${key}:${verified}`;
  void call("dailyScramble", day, event).then((v: string) => (scrambles.set(key, v), s.emit()), () => {});
  return (async () => {
    await s.dailyFlush();
    try {
      const token = s.signedIn ? await call("apiToken") : null;
      boards.set(held, await fetchDaily(location.origin, token, event, day, local ? { timeMs: local.timeMs, penalty: local.penalty } : undefined, false, verified));
    } catch {
      if (!boards.has(held)) boards.set(held, "offline");
    }
    s.emit();
  })();
}
/** The player's results on an event, in the view chosen. */
async function loadHistory(event: DailyEvent) {
  const key = `${s.user.id}:${event}:${s.dailyVerified}`;
  try {
    await s.dailyFlush();
    histories.set(key, await fetchDailyHistory(location.origin, await call("apiToken"), event, s.dailyVerified));
  } catch {
    if (!histories.has(key)) histories.set(key, "offline");
  }
  s.emit();
}
/** Today's scramble, field and results of the event the page opens on, read ahead so that it opens at once. */
export function preloadDaily() {
  const current = s.event().id,
    event: DailyEvent = isDailyEvent(current) ? current : "333";
  void loadDaily(event, dailyDay());
  if (s.signedIn) void loadHistory(event);
}

/** The field as a histogram on its side: a row per bucket of times, the bar as long as its solvers, the player's in the accent. */
function DailyChart({ board, place }: { board: DailyBoard; place: DailyPlace | null }) {
  const { from, width, counts } = board.buckets,
    max = Math.max(1, ...counts),
    mark = bucketOf(board, place);
  if (!counts.length) return <Empty title={tr("No finished solve yet today")} className="flex-1" />;
  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-[3px]" data-slot="daily-chart">
      <figcaption className="sr-only">{tr("How the day's times spread, {0} solvers", { 0: board.total })}</figcaption>
      {counts.map((n, i) => {
        const range = `${axis(from + i * width)} – ${i === counts.length - 1 ? "…" : axis(from + (i + 1) * width)}`;
        return (
          <Tip key={i} content={<span className={NUMERIC}>{range} · {tn(n, "{n} solver")}</span>} side="left">
            <div role="img" aria-label={`${range}: ${tn(n, "{n} solver")}${i === mark ? " · " + tr("You") : ""}`} className="group/bar grid max-h-6 min-h-0 flex-1 grid-cols-[44px_minmax(0,1fr)] items-center gap-2">
              <span className={cn(NUMERIC, "text-right text-[11px] leading-none font-semibold", i === mark ? "text-primary" : "text-muted-foreground")}>{axis(from + i * width)}</span>
              <span className="flex h-full max-h-3.5 min-h-[3px] items-center gap-1.5">
                <i className={cn("h-full rounded-[4px] transition-colors", i === mark ? "bg-primary" : "bg-muted group-hover/bar:bg-accent")} style={{ width: `${(n / max) * 100}%`, minWidth: n ? 4 : 0 }} />
                {i === mark && <b className="shrink-0 text-[11px] leading-none text-primary">{tr("You")}</b>}
              </span>
            </div>
          </Tip>
        );
      })}
    </figure>
  );
}

/** Time, share beaten, rank and field, as the stage's figures. */
function Figures({ board, place }: { board: DailyBoard | null; place: DailyPlace | null }) {
  const total = board ? board.total + (place && place !== board.mine ? 1 : 0) : 0;
  return (
    <>
      <StageFigure value={place ? fmtSolve(place.timeMs, place.penalty) : "–"} label="Time" />
      <StageFigure value={place ? `${place.beats.toLocaleString()} %` : "–"} label="Beats" tone={place ? "good" : undefined} />
      <StageFigure value={place && board ? tr("{0} of {1}", { 0: place.rank, 1: total }) : "–"} label="Rank" />
      <StageFigure value={board ? board.total.toLocaleString() : "–"} label="Solvers" />
    </>
  );
}

/** Whether a result was made on a connected cube (its moves recorded, verified) or typed, tapped or kept by the keyboard. */
function Verified({ on, className }: { on: boolean; className?: string }) {
  return (
    <Tip content={on ? tr("Solved on a connected cube: its moves are recorded.") : tr("Timed on the keyboard or the screen: nothing records the solve.")}>
      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", on ? "text-success" : "text-muted-foreground", className)}>
        {on && <BadgeCheck className="size-3.5" />}
        {on ? tr("Verified") : tr("Not verified")}
      </span>
    </Tip>
  );
}

/** The field shown: every result, or only the verified ones (a connected cube's). */
function View({ board }: { board: DailyBoard | null }) {
  return (
    <Segmented
      label={tr("Results shown")}
      value={s.dailyVerified ? "verified" : "all"}
      onChange={(id) => s.setDailyVerified(id === "verified")}
      action="daily-view:"
      options={[
        { id: "all", label: tr("All"), count: board?.allTotal, tip: tr("Every result: keyboard, screen and connected cube") },
        { id: "verified", label: tr("Verified"), count: board?.verifiedTotal, tip: tr("Only the results made on a connected cube") },
      ]}
    />
  );
}

const signIn = () => s.askSignIn();
function SignInNote() {
  return (
    <>
      {tr("Guests are not ranked.")}{" "}
      <UiButton variant="link" onClick={signIn}>
        {tr("Sign in")}
      </UiButton>
    </>
  );
}

/** After a solve of the daily scramble, or from its button once the day's attempt is made: where it stands. */
export function DailyDialog() {
  const r = s.dailyResult,
    board = r?.board,
    ranked = !!r?.ranked && s.signedIn,
    place = board ? (ranked ? board.mine ?? board.placed : board.placed) : null,
    // A false start or a stop missed: just solved, the API still allowing it (guests are not ranked, theirs stays local).
    cancellable = !!r?.fresh && !!r.ranked && (s.signedIn ? !!board?.mine?.cancellable : true);
  return (
    <Modal id="daily" title={tr("Daily scramble")} description={r ? `${eventLabel(r.event)} · ${dayLabel(r.day)}` : undefined} className="flex h-[min(86vh,580px)] flex-col sm:max-w-2xl">
      {!r ? null : board ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 flex-wrap justify-around gap-x-6 gap-y-3">
            <Figures board={board} place={place} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-muted-foreground">
            {ranked && board.mine && <Verified on={board.mine.verified} />}
            <span>{!s.signedIn ? <SignInNote /> : ranked ? tr("Your ranked attempt of the day.") : tr("Not ranked: only the first attempt of the day counts.")}</span>
          </div>
          <div className="flex shrink-0 justify-center">
            <View board={board} />
          </div>
          <DailyChart board={board} place={place} />
        </div>
      ) : r.error ? (
        <Empty title={r.error} className="flex-1" />
      ) : (
        <Skeleton className="min-h-40 flex-1 rounded-[20px]" />
      )}
      <DialogFooter>
        {cancellable && (
          <UiButton variant="destructive" className="sm:mr-auto" data-action="daily:cancel" onClick={() => void s.dailyCancel()}>
            <Undo2 />
            {tr("Cancel this time")}
          </UiButton>
        )}
        <Button action="nav:daily" variant="outline">{tr("Today's ranking")}</Button>
        <UiButton onClick={s.closeOverlay}>{tr("Close")}</UiButton>
      </DialogFooter>
    </Modal>
  );
}

/** Challenges › Daily: the player's results over the days, the day's scramble of each event with a way to the timer on it, and where one stands. */
export function DailyPage() {
  const current = s.event().id,
    today = dailyDay(),
    { w } = useViewport(),
    phone = isPhone(w),
    wide = w >= 1280,
    [event, setEvent] = useState<DailyEvent>(isDailyEvent(current) ? current : "333"),
    [day, setDay] = useState(today),
    [results, setResults] = useState(false),
    verified = s.dailyVerified,
    local = s.dailyDone[`${day}:${event}`],
    past = day !== today,
    scramble = scrambles.get(`${day}:${event}`) ?? "",
    board = boards.get(`${s.user.id}:${day}:${event}:${verified}`) ?? null;
  useEffect(() => void loadDaily(event, day), [event, day, local?.penalty, local?.timeMs, verified]);
  const loaded = board && board !== "offline" ? board : null,
    place = loaded ? loaded.mine ?? loaded.placed : null,
    done = !!local || !!loaded?.mine;
  const events = <Segmented label={tr("Event")} value={event} onChange={(id) => setEvent(id as DailyEvent)} options={DAILY_EVENTS.map((id) => ({ id, label: eventLabel(id) }))} action="daily-event:" />;
  const action =
    board === null ? (
      <Skeleton className="h-16 w-[min(100%,24rem)] rounded-xl" />
    ) : (past || done) && place ? (
      <StageMeter share={place.beats / 100} value={`${place.beats.toLocaleString()} %`} label={tr("of the field beaten")} tone="good" />
    ) : past ? (
      <StageMeter share={0} value="–" label={tr("Not tried that day")} />
    ) : (
      <StageAction icon={Play} title={tr("Solve it")} sub={s.signedIn ? tr("Your one ranked attempt of the day, on the timer") : tr("On the timer")} data-action={"daily:" + event} onClick={() => void s.action("daily:" + event)} />
    );
  const note = !s.signedIn ? <SignInNote /> : past ? tr("The scramble of {0}.", { 0: dayLabel(day) }) : !done ? tr("One ranked attempt a day: a connected cube makes it verified.") : tr("Done for today: a new scramble at midnight UTC.");
  const pick = (d: string, e: DailyEvent) => (setDay(d), setEvent(e), setResults(false));
  const resultsButton = !wide && (
    <UiButton variant="outline" onClick={() => setResults(true)} data-action="daily:results">
      <History />
      {tr("Your results")}
    </UiButton>
  );
  return (
    <div className={cn(PAGE, "daily")}>
      {phone && (
        <PageHead title={tr("Daily scramble")}>
          {events}
        </PageHead>
      )}
      <div className={cn("grid min-h-0 flex-1 gap-5", phone ? "grid-rows-[auto_minmax(0,1fr)]" : wide ? "grid-cols-[300px_minmax(0,1fr)_360px]" : "grid-cols-[minmax(0,1fr)_340px]")}>
        {wide && (
          <Surface className="daily-results gap-3.5 p-4 pt-5">
            <Results day={day} event={event} onPick={pick} />
          </Surface>
        )}
        <Stage
          className="daily-stage gap-4"
          lead={
            <div className="-mt-1 flex flex-col items-center gap-2">
              {loaded?.mine && <Verified on={loaded.mine.verified} />}
              <p className="max-w-md text-sm text-balance text-muted-foreground">{note}</p>
            </div>
          }
          figures={!phone && <Figures board={loaded} place={place} />}
        >
          <div className="flex flex-col items-center gap-2.5">
            {!phone && (
              <div className="flex items-center gap-3">
                <span className={KICKER}>{past ? dayLabel(day) : tr("{0} · new at midnight UTC", { 0: dayLabel(day) })}</span>
                {events}
              </div>
            )}
            <div className="max-w-[min(100%,40rem)] text-center font-semibold">{scramble ? <Alg text={scramble} size={phone ? 17 : 22} /> : <Skeleton className="h-7 w-[min(36rem,80vw)]" />}</div>
          </div>
          {action}
          <div className="flex flex-wrap justify-center gap-2">
            {past && (
              <UiButton variant="secondary" onClick={() => setDay(today)} data-action="daily:today">
                <CalendarDays />
                {tr("Back to today")}
              </UiButton>
            )}
            {resultsButton}
          </div>
        </Stage>
        <Surface className="daily-field gap-3 p-4 pt-[18px]">
          <PanelHead title={past ? tr("Field of {0}", { 0: dayLabel(day) }) : tr("Today's field")} meta={loaded ? tn(loaded.total, "{n} solver") : undefined} className="px-1" />
          <View board={loaded} />
          {board === null ? <Skeleton className="min-h-24 flex-1 rounded-[20px]" /> : board === "offline" ? <Empty title={tr("The ranking comes once you are online.")} className="flex-1" /> : <DailyChart board={board} place={place} />}
        </Surface>
      </div>
      {!wide && (
        <Modal open={results} onOpenChange={setResults} title={tr("Your results")} description={eventLabel(event)} className="flex h-[min(86vh,640px)] flex-col sm:max-w-md" tall>
          <Results day={day} event={event} onPick={pick} bare />
        </Modal>
      )}
    </div>
  );
}

/** A figure of the results: its value large, its caption under it. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="truncate text-xs font-semibold text-muted-foreground">{tr(label)}</dt>
      <dd className={cn(NUMERIC, "text-xl leading-tight font-extrabold tracking-[-0.02em]")}>{value ?? "–"}</dd>
    </div>
  );
}

/**
 * The player's results on the event, newest first, today on top when not tried yet: best, mean, mean rank and the run of
 * days above, each day its time, rank and whether it is verified; one picked shows its field. From the API once signed
 * in (in the view picked: all results or the verified ones), else the attempts kept on this device.
 */
function Results({ day, event, onPick, bare = false }: { day: string; event: DailyEvent; onPick: (day: string, event: DailyEvent) => void; bare?: boolean }) {
  const today = dailyDay(),
    verified = s.dailyVerified,
    local = s.dailyDone[`${today}:${event}`],
    history = !s.signedIn ? "offline" : (histories.get(`${s.user.id}:${event}:${verified}`) ?? null);
  useEffect(() => void (s.signedIn && loadHistory(event)), [event, verified, s.signedIn, local?.penalty, local?.timeMs]);
  // Offline or a guest: the attempts this device keeps (today's and yesterday's).
  const list: DailyDay[] =
    history && history !== "offline"
      ? history
      : Object.entries(s.dailyDone)
          .filter(([key]) => key.endsWith(":" + event))
          .map(([key, v]) => ({ day: key.split(":")[0]!, timeMs: v.timeMs, penalty: v.penalty as DailyDay["penalty"], verified: !!v.verified, rank: 0, beats: 0, total: 0 }))
          .sort((a, b) => b.day.localeCompare(a.day));
  const stats = dailyStats(list, today),
    ranked = history && history !== "offline";
  return (
    <>
      {!bare && <PanelHead title="Your results" meta={list.length || undefined} className="px-1" />}
      <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 px-1" aria-label={tr("Your results")}>
        <Stat label="Best" value={stats.best != null ? fmtTime(stats.best) : null} />
        <Stat label="Mean" value={stats.mean != null ? fmtTime(stats.mean) : null} />
        <Stat label="Mean rank" value={ranked && stats.rank != null ? stats.rank.toLocaleString() : null} />
        <Stat label="Streak" value={tn(stats.streak, "{n} day")} />
      </dl>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1" aria-label={tr("Your days")}>
        {history === null ? (
          <Skeleton className="min-h-24 flex-1 rounded-[14px]" />
        ) : (
          <>
            {!list.some((v) => v.day === today) && (
              <Ticket
                result={null}
                score="–"
                name={tr("Today")}
                level={eventLabel(event)}
                sub={tr("Not tried yet")}
                aria-current={day === today ? "true" : undefined}
                {...opens(() => onPick(today, event))}
                className={TICKET_LINK}
              />
            )}
            {list.map((v) => (
              <Ticket
                key={v.day}
                result={v.penalty === "dnf" ? "loss" : "win"}
                score={<span className="text-base">{fmtSolve(v.timeMs, v.penalty)}</span>}
                name={v.day === today ? tr("Today") : dayLabel(v.day)}
                level={v.total ? tr("{0} of {1}", { 0: v.rank, 1: v.total }) : undefined}
                sub={<Verified on={v.verified} />}
                aria-current={day === v.day ? "true" : undefined}
                {...opens(() => onPick(v.day, event))}
                className={cn(TICKET_LINK, "grid-cols-[72px_minmax(0,1fr)_auto]")}
              />
            ))}
            {!s.signedIn && (
              <p className="px-1 pt-3 text-sm text-muted-foreground">
                <SignInNote />
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
