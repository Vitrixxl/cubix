/** The overview's sections: timer, training, achievements and battles, each one card built the same way. */
import { BookOpen, CalendarDays, ChevronDown, Gauge, Layers, MessageSquare, Rotate3d, Swords, Timer, Trophy, type LucideIcon } from "lucide-react";
import { store as s } from "../store";
import { fmtTime, shortDate, solvedAt } from "../../../src/client/lib/format";
import { timerFigures } from "../../../src/client/lib/practiceSummary";
import { Bar, Figure, Icon, NUMERIC, PuzzlePicker, SolveMenu, run, plural } from "../ui";
import { RESULT_MARK, ao5Text, battleRecord, type DuelRecord } from "../duelClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MoreLink, Section, Stats, SubHead } from "./card";
import { Trend, TrendLegend } from "./trend";
import { battles, type ProfileData } from "./data";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** The latest timer solves, newest first; a click opens one, a right-click its menu. */
export function LatestSolves({ history, averages, count = 5, phone = false }: { history: any[]; averages: (number | null)[]; count?: number; phone?: boolean }) {
  const from = Math.max(0, history.length - count),
    rows = history
      .slice(from)
      .map((v, i) => ({ v, index: from + i }))
      .reverse(),
    columns = phone ? "grid-cols-[2.75rem_5.5rem_minmax(0,1fr)_auto]" : "grid-cols-[3rem_6rem_7.5rem_minmax(0,1fr)_auto]";
  return (
    <div className="-mx-2 flex flex-col">
      {rows.map(({ v, index }) => {
        const previous = history[index - 1],
          pb = v.time != null && v.time === v.best && (!previous || previous.best == null || previous.best > v.time);
        return (
          <SolveMenu key={v.id} solve={{ ...v, time_ms: v.timeMs }}>
            <button
              type="button"
              data-action={"solve:" + v.id}
              onClick={run("solve:" + v.id)}
              className={cn("grid h-9 w-full items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60", columns)}
            >
              <span className={cn(NUMERIC, "text-right text-xs text-muted-foreground")}>{index + 1}</span>
              <span className="flex items-center gap-1.5">
                <span className={cn(NUMERIC, "text-sm font-medium", v.time == null ? "text-destructive" : pb ? "text-success" : "")}>{fmtTime(v.time, { blank: "DNF" })}</span>
                {v.penalty === "+2" && <span className={cn(NUMERIC, "text-xs text-warning")}>+2</span>}
                {pb && <span className="text-xs font-medium text-success">{tr("PB")}</span>}
                {v.smart && <Rotate3d className="size-3 text-muted-foreground" aria-label={tr("Turned on a connected cube")} />}
              </span>
              {!phone && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{averages[index] != null ? tr("Ao5 {0}", { 0: fmtTime(averages[index]) }) : ""}</span>}
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                {v.comment && (
                  <>
                    <MessageSquare className="size-3.5 shrink-0" aria-label={tr("Comment")} />
                    <span className="truncate">{v.comment}</span>
                  </>
                )}
              </span>
              <span className="text-right text-xs text-muted-foreground">{solvedAt(v.at)}</span>
            </button>
          </SolveMenu>
        );
      })}
    </div>
  );
}

/** The chosen event as the timer card's title, opening the puzzle picker. */
function EventTitle() {
  const e = s.event(s.profilePuzzle, s.profileSolveMode);
  return (
    <PuzzlePicker
      profile
      trigger={
        <Button variant="ghost" className="-ml-2.5 h-8 gap-2 px-2.5 text-base font-semibold tracking-tight">
          <Icon name={"Puzzle" + e.id} size={18} className="text-primary" />
          {said(e.label)}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      }
    />
  );
}

/**
 * The chosen event's card: its best single and where it stands now, its curve and, on phones, its latest
 * solves. `fill` (the desktop overview) stretches the curve over the height the card is given.
 */
export function TimerSection({ d, phone, fill = false }: { d: ProfileData; phone: boolean; fill?: boolean }) {
  const t = d.timer,
    event = s.event(s.profilePuzzle, s.profileSolveMode),
    all = timerFigures(t),
    // Its best single beside where it stands now; the other bests are on the Timer page.
    figures = [all[0]!, ...all.slice(3, phone ? 6 : 7)];
  return (
    <Section
      label={tr("Timer")}
      title={<EventTitle />}
      meta={t.count && !phone ? tr("{0} scrambles", { 0: s.label("scrambles", s.profileScramble) }) : undefined}
      open={t.count ? "playground" : undefined}
      more={tr("Statistics")}
      aside={
        !phone && (
          <>
            {!!t.count && <TrendLegend />}
            {/* The analysis of the smart cube solves: their steps and cases. */}
            <MoreLink actions={["profileMode:analysis"]}>{tr("Analysis")}</MoreLink>
          </>
        )
      }
      className={fill ? "min-h-0 flex-1" : undefined}
      body={cn(fill && "min-h-0 flex-1", !t.count && "flex-1 items-center justify-center")}
    >
      {!t.count ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-sm text-muted-foreground">{tr("No {0} solves yet.", { 0: said(event.label) })}</p>
          <Button variant="outline" data-action="nav:playground" onClick={run("nav:playground")}>
            <Timer />
            {tr("Open the timer")}</Button>
        </div>
      ) : (
        <>
          <Stats columns={figures.length}>
            {figures.map(([label, value, tone]) => (
              <Figure key={label} label={said(label)} value={value} tone={tone} caption="plain" size="xl" />
            ))}
          </Stats>
          <Trend history={d.history} averages={d.ao5} className={fill ? "min-h-24 flex-1" : phone ? "h-40" : "h-48"} />
          {!fill && (
            <div className="flex flex-col gap-1">
              <SubHead title={tr("Latest solves")}>
                <MoreLink actions={["statsView:table", "profileMode:playground"]}>{tr("View all")}</MoreLink>
              </SubHead>
              <LatestSolves history={d.history} averages={d.ao5} phone={phone} />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** Two tones on one bar: the cases trained, and over them the ones learned. */
function TwoTone({ trained, learned, total }: { trained: number; learned: number; total: number }) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0) + "%";
  return (
    <div className="relative h-1.5 min-w-12 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={learned}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-primary/35" style={{ width: pct(Math.max(trained, learned)) }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(learned) }} />
    </div>
  );
}

/** Learned and trained cases per stage; `compact` (the overview's bottom row) keeps the first three stages. */
export function TrainingSection({ d, compact = false }: { d: ProfileData; compact?: boolean }) {
  const stages = compact ? d.stages.slice(0, 3) : d.stages;
  return (
    <Section label={tr("Training")} title={tr("Training")} meta={tr("{0} of {1} learned", { 0: d.learned, 1: d.cases.length })} open="training" more={tr("Cases")} body={compact ? "gap-3 pt-1" : undefined}>
      {!compact && (
        <Stats columns={3}>
          <Figure caption="plain" size="xl" label={tr("Learned")} value={d.learned.toLocaleString()} tone="accent" />
          <Figure caption="plain" size="xl" label={tr("Trained")} value={d.trained.toLocaleString()} />
          <Figure caption="plain" size="xl" label={tr("Solves")} value={d.trainingSolves.toLocaleString()} />
        </Stats>
      )}
      {stages.length ? (
        <div className="flex flex-col gap-3">
          <div className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4", compact ? "gap-y-2.5" : "gap-y-3")}>
            {stages.map((r) => (
              <div key={r.stage} className="col-span-3 grid grid-cols-subgrid items-center" title={tr("{0} learned · {1} trained · {2} cases", { 0: r.learned, 1: r.trained, 2: r.total })}>
                <span className="text-sm font-medium">{said(r.stage)}</span>
                <TwoTone {...r} />
                <span className={cn(NUMERIC, "text-right text-xs whitespace-nowrap text-muted-foreground")}>
                  <span className="text-foreground">{r.learned}</span> / {r.total}
                </span>
              </div>
            ))}
          </div>
          {!compact && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] bg-primary" />
                {tr("Learned")}</span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] bg-primary/35" />
                {tr("Trained")}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{tr("No algorithm sets for this puzzle.")}</p>
      )}
    </Section>
  );
}

const CATEGORY_ICON: Record<string, LucideIcon> = { knowledge: BookOpen, speed: Timer, average: Gauge, volume: Layers, dedication: CalendarDays };

/** An achievement's mark: its category's icon on a square, in the accent once unlocked. */
export function Badge({ a, size = "md" }: { a: any; size?: "md" | "lg" }) {
  const I = CATEGORY_ICON[a.category] ?? Trophy;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "lg" ? "size-10" : "size-9",
        a.unlocked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      <I className={size === "lg" ? "size-5" : "size-4"} />
    </span>
  );
}

/** A goal on its way: title, its progress in words and a bar. */
export function Goal({ a }: { a: any }) {
  return (
    <div className="flex items-center gap-3">
      <Badge a={a} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{said(a.title)}</span>
          <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{Math.round(a.ratio * 100)}%</span>
        </div>
        <Bar ratio={a.ratio} fill="bg-primary/70" className="h-1.5" />
      </div>
    </div>
  );
}

export function AchievementsSection({ d, wide = false, compact = false }: { d: ProfileData; wide?: boolean; compact?: boolean }) {
  const recent = d.recent.slice(0, wide ? 4 : 3),
    goals = d.goals.slice(0, 3);
  if (compact) {
    const next = d.goals[0];
    return (
      <Section label={tr("Achievements")} title={tr("Achievements")} meta={tr("{0} of {1}", { 0: d.unlocked, 1: d.totalAchievements })} open="achievements" more={tr("All")} body="gap-3 pt-1">
        {d.recent[0] ? (
          <div className="flex items-center gap-3" title={d.recent[0].description}>
            <Badge a={d.recent[0]} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{d.recent[0].title}</span>
              <span className="text-xs text-muted-foreground">{tr("Unlocked")}{" "}{d.recent[0].unlockedAt ? shortDate(d.recent[0].unlockedAt) : ""}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("Your first solves unlock the first ones.")}</p>
        )}
        {next && <Goal a={next} />}
      </Section>
    );
  }
  return (
    <Section label={tr("Achievements")} title={tr("Achievements")} meta={tr("{0} of {1} unlocked", { 0: d.unlocked, 1: d.totalAchievements })} open="achievements" more={tr("All")} body={wide ? "grid grid-cols-2 gap-x-10" : undefined}>
      <div className="flex flex-col gap-2">
        <SubHead title={tr("Recently unlocked")} />
        {recent.length ? (
          <div className={cn("grid gap-3", wide ? "grid-cols-4" : "grid-cols-3")}>
            {recent.map((a) => (
              <div key={a.id} className="flex min-w-0 flex-col items-start gap-2" title={said(a.description)}>
                <Badge a={a} size="lg" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm leading-snug font-medium">{said(a.title)}</span>
                  <span className="text-xs text-muted-foreground">{a.unlockedAt ? shortDate(a.unlockedAt) : ""}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("Your first solves unlock the first ones.")}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <SubHead title={tr("Closest goals")} />
        {goals.length ? (
          <div className="flex flex-col gap-3">
            {goals.map((a) => (
              <Goal key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("Everything is unlocked.")}</p>
        )}
      </div>
    </Section>
  );
}

const RESULT_TONE = { win: "bg-success/15 text-success", loss: "bg-destructive/15 text-destructive", draw: "bg-muted text-muted-foreground" } as const;

export function ResultMark({ result }: { result: DuelRecord["result"] }) {
  return (
    <span className={cn(NUMERIC, "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold", RESULT_TONE[result])} aria-label={said(result)}>
      {said(RESULT_MARK[result])}
    </span>
  );
}

/** An empty battle history, centred in whatever room it is given: what a battle is, and the way to a first one. */
export function NoBattles({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-3 text-center", className)}>
      {!compact && (
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Swords className="size-5" />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{tr("No battles yet")}</p>
        <p className="text-xs text-muted-foreground">{tr("Race a cuber of your level, solve for solve.")}</p>
      </div>
      <Button size="sm" variant="outline" data-action="nav:duel" onClick={run("nav:duel")}>
        {tr("Find an opponent")}</Button>
    </div>
  );
}

export function BattlesSection({ compact = false }: { compact?: boolean }) {
  const list = battles(),
    won = list.filter((b) => b.result === "win").length,
    lost = list.filter((b) => b.result === "loss").length;
  return (
    <Section label={tr("Battles")} title={tr("Battles")} meta={list.length ? battleRecord(list) : undefined} open={list.length ? "duels" : undefined} more={tr("History")} body={cn(compact && "pt-1", !list.length && "flex-1")}>
      {!list.length ? (
        <NoBattles compact={compact} />
      ) : (
        <>
          <Stats columns={3}>
            <Figure caption="plain" size="xl" label={tr("Played")} value={String(list.length)} />
            <Figure caption="plain" size="xl" label={tr("Won")} value={String(won)} tone="good" />
            <Figure caption="plain" size="xl" label={tr("Win rate")} value={Math.round((won / Math.max(1, won + lost)) * 100) + "%"} />
          </Stats>
          {!compact && (
            <div className="flex flex-col gap-1">
              <SubHead title={tr("Recent battles")} />
              <div className="flex flex-col gap-1">
                {list.slice(0, 3).map((b) => (
                  <div key={b.id} className="flex h-9 items-center gap-3">
                    <ResultMark result={b.result} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{said(b.opponent)}</span>
                    <span className={cn(NUMERIC, "text-xs whitespace-nowrap")}>
                      {ao5Text(b.ao5[0])} <span className="text-muted-foreground">{tr("vs")}</span> {ao5Text(b.ao5[1])}
                    </span>
                    <span className="w-12 text-right text-xs text-muted-foreground">{shortDate(b.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
