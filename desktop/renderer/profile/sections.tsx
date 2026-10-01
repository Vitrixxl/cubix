/** The overview's sections: timer, training, achievements and battles, each one card built the same way. */
import { BookOpen, CalendarDays, Gauge, Layers, MessageSquare, Swords, Timer, Trophy, type LucideIcon } from "lucide-react";
import { store as s } from "../store";
import { fmtTime, plural, shortDate, solvedAt } from "../../../src/client/lib/format";
import { timerFigures } from "../../../src/client/lib/practiceSummary";
import { Bar, Figure, NUMERIC, SolveMenu, run } from "../ui";
import { RESULT_MARK, ao5Text, battleRecord, type DuelRecord } from "../duelClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MoreLink, Section, Stats, SubHead } from "./card";
import { Trend, TrendLegend } from "./trend";
import { battles, type ProfileData } from "./data";

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
                {pb && <span className="text-xs font-medium text-success">PB</span>}
              </span>
              {!phone && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{averages[index] != null ? `Ao5 ${fmtTime(averages[index])}` : ""}</span>}
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                {v.comment && (
                  <>
                    <MessageSquare className="size-3.5 shrink-0" aria-label="Comment" />
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

export function TimerSection({ d, phone }: { d: ProfileData; phone: boolean }) {
  const t = d.timer,
    event = s.event(s.profilePuzzle, s.profileSolveMode);
  return (
    <Section
      label="Timer"
      title="Timer"
      meta={t.count ? plural(t.count, "solve") + (phone ? "" : ` · ${s.label("scrambles", s.profileScramble)} scrambles`) : event.label}
      open={t.count ? "playground" : undefined}
      more="Statistics"
      body={t.count ? undefined : "flex-1 items-center justify-center py-10"}
    >
      {!t.count ? (
        <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <Timer className="size-6" />
          <p>No timed {event.label} solves yet: your records and your curve appear here.</p>
          <Button variant="outline" data-action="nav:playground" onClick={run("nav:playground")}>
            <Timer />
            Open the timer
          </Button>
        </div>
      ) : (
        <>
          <Stats columns={6}>
            {/* The count is in the heading. */}
            {timerFigures(t).slice(0, 6).map(([label, value, tone]) => (
              <Figure key={label} label={label} value={value} tone={tone} caption="plain" size="xl" />
            ))}
          </Stats>
          <div className="flex flex-col gap-2">
            <SubHead title={`Last ${Math.min(100, d.history.length)} solves`}>
              <TrendLegend />
            </SubHead>
            <Trend history={d.history} averages={d.ao5} className={phone ? "h-40" : "h-48"} />
          </div>
          <div className="flex flex-col gap-1">
            <SubHead title="Latest solves">
              <MoreLink actions={["statsView:table", "profileMode:playground"]}>View all</MoreLink>
            </SubHead>
            <LatestSolves history={d.history} averages={d.ao5} phone={phone} />
          </div>
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

export function TrainingSection({ d }: { d: ProfileData }) {
  return (
    <Section label="Training" title="Training" meta={`${d.learned} of ${d.cases.length} learned`} open="training" more="Cases">
      <Stats columns={3}>
        <Figure caption="plain" size="xl" label="Learned" value={d.learned.toLocaleString()} tone="accent" />
        <Figure caption="plain" size="xl" label="Trained" value={d.trained.toLocaleString()} />
        <Figure caption="plain" size="xl" label="Solves" value={d.trainingSolves.toLocaleString()} />
      </Stats>
      {d.stages.length ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3">
            {d.stages.map((r) => (
              <div key={r.stage} className="col-span-3 grid grid-cols-subgrid items-center" title={`${r.learned} learned · ${r.trained} trained · ${r.total} cases`}>
                <span className="text-sm font-medium">{r.stage}</span>
                <TwoTone {...r} />
                <span className={cn(NUMERIC, "text-right text-xs whitespace-nowrap text-muted-foreground")}>
                  <span className="text-foreground">{r.learned}</span> / {r.total}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-primary" />
              Learned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-primary/35" />
              Trained
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No algorithm sets for this puzzle.</p>
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
          <span className="truncate text-sm font-medium">{a.title}</span>
          <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{Math.round(a.ratio * 100)}%</span>
        </div>
        <Bar ratio={a.ratio} fill="bg-primary/70" className="h-1.5" />
      </div>
    </div>
  );
}

export function AchievementsSection({ d, wide = false }: { d: ProfileData; wide?: boolean }) {
  const recent = d.recent.slice(0, wide ? 4 : 3),
    goals = d.goals.slice(0, 3);
  return (
    <Section label="Achievements" title="Achievements" meta={`${d.unlocked} of ${d.totalAchievements} unlocked`} open="achievements" more="All" body={wide ? "grid grid-cols-2 gap-x-10" : undefined}>
      <div className="flex flex-col gap-2">
        <SubHead title="Recently unlocked" />
        {recent.length ? (
          <div className={cn("grid gap-3", wide ? "grid-cols-4" : "grid-cols-3")}>
            {recent.map((a) => (
              <div key={a.id} className="flex min-w-0 flex-col items-start gap-2" title={a.description}>
                <Badge a={a} size="lg" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm leading-snug font-medium">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.unlockedAt ? shortDate(a.unlockedAt) : ""}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Your first solves unlock the first ones.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <SubHead title="Closest goals" />
        {goals.length ? (
          <div className="flex flex-col gap-3">
            {goals.map((a) => (
              <Goal key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Everything is unlocked.</p>
        )}
      </div>
    </Section>
  );
}

const RESULT_TONE = { win: "bg-success/15 text-success", loss: "bg-destructive/15 text-destructive", draw: "bg-muted text-muted-foreground" } as const;

export function ResultMark({ result }: { result: DuelRecord["result"] }) {
  return (
    <span className={cn(NUMERIC, "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold", RESULT_TONE[result])} aria-label={result}>
      {RESULT_MARK[result]}
    </span>
  );
}

/** A clean empty state for a battle-less account: what lands here and where to start. */
export function NoBattles({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-2 text-sm text-muted-foreground", className)}>
      <p>Race another cuber over five scrambles: your results land here.</p>
      <Button variant="outline" data-action="nav:duel" onClick={run("nav:duel")}>
        <Swords />
        Find an opponent
      </Button>
    </div>
  );
}

export function BattlesSection() {
  const list = battles(),
    won = list.filter((b) => b.result === "win").length,
    lost = list.filter((b) => b.result === "loss").length;
  return (
    <Section label="Battles" title="Battles" meta={list.length ? battleRecord(list) : undefined} open={list.length ? "duels" : undefined} more="History">
      {!list.length ? (
        <NoBattles />
      ) : (
        <>
          <Stats columns={3}>
            <Figure caption="plain" size="xl" label="Played" value={String(list.length)} />
            <Figure caption="plain" size="xl" label="Won" value={String(won)} tone="good" />
            <Figure caption="plain" size="xl" label="Win rate" value={Math.round((won / Math.max(1, won + lost)) * 100) + "%"} />
          </Stats>
          <div className="flex flex-col gap-1">
            <SubHead title="Recent battles" />
            <div className="flex flex-col gap-1">
              {list.slice(0, 3).map((b) => (
                <div key={b.id} className="flex h-9 items-center gap-3">
                  <ResultMark result={b.result} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.opponent}</span>
                  <span className={cn(NUMERIC, "text-xs whitespace-nowrap")}>
                    {ao5Text(b.ao5[0])} <span className="text-muted-foreground">vs</span> {ao5Text(b.ao5[1])}
                  </span>
                  <span className="w-12 text-right text-xs text-muted-foreground">{shortDate(b.at)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

