/**
 * The profile's notebook (profile/2.html): who they are with the account's actions, the records as plates, the
 * journal of the active days, the month as a calendar and the best Ao5 of each week.
 */
import React, { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  Gauge,
  LogOut,
  NotebookPen,
  Settings,
  Sheet,
  Swords,
  Trophy,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { store as s } from "../store";
import { AchievementBadge } from "./sections";
import { fmtTime } from "../../../src/client/lib/format";
import {
  dayKey,
  heatDays,
  journalDays,
  weeklyBestAo5,
} from "../../../src/client/lib/profile";
import { eventInfo, eventLabel } from "../../../src/shared/puzzles";
import { METHODS } from "../../../src/shared/methods";
import { journeyProfile } from "../../../src/client/lib/journey";
import { LevelBar } from "../xp";
import {
  Avatar,
  Button,
  Empty,
  MenuAction,
  NUMERIC,
  PuzzleButton,
  Segmented,
  Surface,
  Tip,
  plural,
  run,
} from "../ui";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { battles, type ProfileData } from "./data";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** A small upper-case heading over a group, its link at the end. */
function Caption({
  children,
  link,
}: {
  children: React.ReactNode;
  link?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-8 shrink-0 items-center gap-2">
      <h2 className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        {children}
      </h2>
      {link && <div className="ml-auto">{link}</div>}
    </div>
  );
}

/** A quiet link: "Statistics ›". */
function Link({
  action,
  children,
}: {
  action: string;
  children: React.ReactNode;
}) {
  return (
    <UiButton
      variant="ghost"
      data-action={action}
      onClick={run(action)}
      className="-mr-2 text-muted-foreground hover:text-foreground"
    >
      {children}
      <ChevronRight />
    </UiButton>
  );
}

/** Who they are on a plain card, the account's actions under the name: import, export, settings and signing out. */
export function IdentityCard() {
  const user = s.user,
    joined = s.profile?.user?.joined ?? user?.joined,
    // The 3×3 method they solve with, the latest one they know.
    method = METHODS["333"].find(
      (m) => m.id === journeyProfile(s.journey)?.knownMethods?.["333"]?.at(-1),
    ),
    line = [
      method && said(method.name),
      joined && tr("Joined {0}", { 0: joined }),
    ]
      .filter(Boolean)
      .join(" · "),
    action =
      "justify-start bg-muted text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <Surface className="shrink-0 gap-4 p-5" aria-label={tr("Account")}>
      <div className="flex min-w-0 items-center gap-3.5">
        <Avatar name={user?.username} size={56} className="rounded-[18px]" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-2xl font-extrabold tracking-[-0.03em]">
            {user?.username}
          </h1>
          {line && (
            <p className="truncate text-sm font-semibold text-muted-foreground">
              {line}
            </p>
          )}
        </div>
      </div>
      <Level />
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          action="importTimes"
          icon={Upload}
          variant="ghost"
          className={action}
        >
          {tr("Import")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <UiButton
                variant="ghost"
                className={action}
                data-action="menu:export"
              />
            }
          >
            <Download />
            {tr("Export")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <MenuAction action="exportSolves" icon={Sheet}>
              {tr("My solves, as a table (CSV)")}
            </MenuAction>
            <MenuAction action="exportData" icon={FileJson}>
              {tr("All my profile's data (JSON)")}
            </MenuAction>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          action="settings"
          icon={Settings}
          variant="ghost"
          className={action}
        >
          {tr("Account")}
        </Button>
        <Button
          action="logout"
          icon={LogOut}
          variant="ghost"
          className={cn(action, "hover:text-destructive")}
        >
          {tr("Log out")}
        </Button>
      </div>
    </Surface>
  );
}

/** Their level, earned with the achievements' XP, and how far into the next one; opens the achievements. */
function Level() {
  return (
    <button
      type="button"
      data-action="profileMode:achievements"
      onClick={() => void s.action("profileMode:achievements")}
      className="rounded-2xl bg-muted px-3.5 py-2.5 text-left hover:bg-accent"
    >
      <LevelBar xp={s.xp ?? s.achievements?.xp ?? 0} />
    </button>
  );
}

/** Each event's best single large and its best Ao5 under it, on small plates; one set this week in mint. */
export function RecordPlates({ d }: { d: ProfileData }) {
  const week = Date.now() - 7 * 86_400_000,
    records = d.records.filter((r) => r.best != null);
  return (
    <section
      aria-label={tr("Personal bests")}
      className="flex min-h-0 flex-col"
    >
      <Caption
        link={<Link action="profileMode:playground">{tr("Statistics")}</Link>}
      >
        {tr("Records · single / Ao5")}
      </Caption>
      {records.length ? (
        <div className="-mr-1 grid min-h-0 grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
          {records.map((r) => (
            <div
              key={r.event}
              className="min-w-0 rounded-2xl bg-card px-3 py-2.5"
            >
              <p className="truncate text-xs font-bold text-muted-foreground">
                {said(eventLabel(r.puzzle, r.solveMode))}
              </p>
              <p
                className={cn(
                  NUMERIC,
                  "text-xl font-extrabold tracking-[-0.02em]",
                  r.lastAt &&
                    new Date(r.lastAt).getTime() > week &&
                    "text-success",
                )}
              >
                {fmtTime(r.best)}
              </p>
              <p
                className={cn(
                  NUMERIC,
                  "text-xs font-semibold text-muted-foreground",
                )}
              >
                {r.bestAo5 != null
                  ? tr("Ao5 {0}", { 0: fmtTime(r.bestAo5) })
                  : "–"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tr("Your records appear after your first timed solves.")}
        </p>
      )}
    </section>
  );
}

/** Something that happened on a day: its icon and words, tinted with its colour. */
function Moment({
  icon: I,
  badge,
  tone,
  children,
}: {
  icon?: LucideIcon;
  /** An achievement's badge in place of the icon. */
  badge?: React.ReactNode;
  tone: "good" | "bad" | "accent" | "lilac" | "warning";
  children: React.ReactNode;
}) {
  const colour = {
    good: "text-success bg-success/12",
    bad: "text-destructive bg-destructive/12",
    accent: "text-primary bg-primary/12",
    lilac: "text-lilac bg-lilac/12",
    warning: "text-warning bg-warning/12",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-[10px] py-1.5 pr-2.5 pl-2 text-[13px] font-semibold",
        colour,
      )}
    >
      {badge ?? (I && <I className="size-3.5 shrink-0" />)}
      <span className="truncate text-foreground [&_b]:text-current">
        {children}
      </span>
    </span>
  );
}

/** An achievement's moment in its category's colour, like its badge. */
const ACHIEVEMENT_TONE: Record<string, "good" | "bad" | "accent" | "lilac" | "warning"> = { speed: "accent", average: "lilac", volume: "warning", knowledge: "good", dedication: "bad" };

const FILTERS = ["all", "records", "achievements", "battles"] as const;
type Filter = (typeof FILTERS)[number];

/** The journal: one entry per active day, newest first, its figures in words and what happened that day. */
export function Journal({ d, phone }: { d: ProfileData; phone: boolean }) {
  const [filter, setFilter] = useState<Filter>("all"),
    event = s.event(s.profilePuzzle, s.profileSolveMode),
    days = useMemo(() => {
      const duels = new Map<string, ReturnType<typeof battles>>(),
        unlocked = new Map<string, any[]>();
      for (const b of battles())
        duels.set(dayKey(new Date(b.at)), [
          ...(duels.get(dayKey(new Date(b.at))) ?? []),
          b,
        ]);
      for (const a of d.recent)
        unlocked.set(dayKey(new Date(a.unlockedAt)), [
          ...(unlocked.get(dayKey(new Date(a.unlockedAt))) ?? []),
          a,
        ]);
      return journalDays(d.activity, d.history, d.ao5).map((day) => ({
        ...day,
        duels: duels.get(day.key) ?? [],
        unlocked: unlocked.get(day.key) ?? [],
      }));
    }, [d]),
    shown = days.filter(
      (day) =>
        filter === "all" ||
        (filter === "records"
          ? day.records.length
          : filter === "achievements"
            ? day.unlocked.length
            : day.duels.length),
    ),
    today = dayKey(new Date());
  return (
    <section
      aria-label={tr("Journal")}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {!phone && (
          <h2 className="text-[26px] font-extrabold tracking-[-0.03em]">
            {tr("Journal")}
          </h2>
        )}
        <PuzzleButton profile />
        <Segmented
          className="ml-auto"
          label={tr("Show")}
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
          options={[
            { id: "all", label: tr("All") },
            { id: "records", label: tr("Records") },
            { id: "achievements", label: tr("Achievements") },
            { id: "battles", label: tr("Battles") },
          ]}
        />
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-col",
          !phone && "-mr-2 overflow-y-auto pr-2",
        )}
      >
        {!shown.length ? (
          <Empty
            icon={NotebookPen}
            title={
              days.length
                ? tr("Nothing of this kind yet.")
                : tr("Your practice days appear here.")
            }
            className="py-10"
          />
        ) : (
          shown.map((day, i) => (
            <article
              key={day.key}
              id={"day-" + day.key}
              className={cn(
                "grid scroll-mt-2 grid-cols-[3.5rem_minmax(0,1fr)] gap-4 px-1.5 pt-3.5 pb-4 md:grid-cols-[4rem_minmax(0,1fr)]",
                i && "border-t border-card",
              )}
            >
              <div className="text-center">
                <b
                  className={cn(
                    NUMERIC,
                    "block text-[32px] leading-none font-extrabold tracking-[-0.04em]",
                    day.key === today && "text-primary",
                  )}
                >
                  {day.date.getDate()}
                </b>
                <small className="text-xs font-bold text-muted-foreground">
                  {day.date.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                  {day.date.toLocaleDateString(undefined, { month: "short" })}
                </small>
              </div>
              <div className="flex min-w-0 flex-col gap-2.5">
                <h3 className="text-base font-bold">
                  {plural(day.count, "solve")}
                  {day.best != null && (
                    <span
                      className={cn(
                        NUMERIC,
                        "font-semibold text-muted-foreground",
                      )}
                    >
                      {" · "}
                      {said(event.label)}{" "}
                      {tr("best {0}", { 0: fmtTime(day.best) })}
                      {day.ao5 != null &&
                        " · " + tr("Ao5 {0}", { 0: fmtTime(day.ao5) })}
                    </span>
                  )}
                </h3>
                {filter !== "all" &&
                !day.records.length &&
                !day.unlocked.length &&
                !day.duels.length ? null : (
                  <div className="flex flex-wrap gap-1.5 empty:hidden">
                    {(filter === "all" || filter === "records") &&
                      day.records.map((r) => (
                        <Moment key={r.kind} icon={Trophy} tone="accent">
                          {r.kind === "single"
                            ? tr("Single record")
                            : tr("Ao5 record")}{" "}
                          <b className={NUMERIC}>{fmtTime(r.time)}</b>
                          {r.gain != null && (
                            <span
                              className={cn(NUMERIC, "text-muted-foreground")}
                            >
                              {" "}
                              (−{fmtTime(r.gain)})
                            </span>
                          )}
                        </Moment>
                      ))}
                    {(filter === "all" || filter === "achievements") &&
                      day.unlocked
                        .slice(0, day.unlocked.length > 3 ? 2 : 3)
                        .map((a) => (
                          <Moment
                            key={a.id}
                            badge={<AchievementBadge a={a} size={24} className="-my-1.5 -ml-1" />}
                            tone={ACHIEVEMENT_TONE[a.category] ?? "warning"}
                          >
                            {tr("Achievement")} <b>{said(a.title)}</b>
                          </Moment>
                        ))}
                    {(filter === "all" || filter === "achievements") &&
                      day.unlocked.length > 3 && (
                        <Tip
                          content={day.unlocked
                            .slice(2)
                            .map((a) => said(a.title))
                            .join(" · ")}
                        >
                          <button
                            type="button"
                            data-action="profileMode:achievements"
                            onClick={run("profileMode:achievements")}
                            className="rounded-[10px]"
                          >
                            <Moment icon={Gauge} tone="warning">
                              {tr("+{0} achievements", {
                                0: day.unlocked.length - 2,
                              })}
                            </Moment>
                          </button>
                        </Tip>
                      )}
                    {(filter === "all" || filter === "battles") &&
                      day.duels.map((b) => (
                        <Moment
                          key={b.id}
                          icon={Swords}
                          tone={
                            b.result === "win"
                              ? "lilac"
                              : b.result === "loss"
                                ? "bad"
                                : "warning"
                          }
                        >
                          {b.result === "win"
                            ? tr("Battle won")
                            : b.result === "loss"
                              ? tr("Battle lost")
                              : tr("Battle drawn")}{" "}
                          {tr("against {0}", { 0: b.opponent })}
                          {eventInfo(b.event) && (
                            <span className="text-muted-foreground">
                              {" "}
                              ·{" "}
                              {said(
                                eventLabel(
                                  eventInfo(b.event)!.puzzle,
                                  eventInfo(b.event)!.solveMode,
                                ),
                              )}
                            </span>
                          )}
                        </Moment>
                      ))}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

/** The month as a calendar: each active day marked by a bar as long as its solves, in the streak's colour while the run lasts. */
export function MonthCard({ d }: { d: ProfileData }) {
  const [shift, setShift] = useState(0),
    now = new Date(),
    month = new Date(now.getFullYear(), now.getMonth() + shift, 1),
    counts = useMemo(() => heatDays(d.activity), [d.activity]),
    most = Math.max(1, ...[...counts.values()].map((v) => v.count)),
    // The run still alive: back from today (or yesterday) while every day has solves.
    run = new Set<string>(),
    lead = (month.getDay() + 6) % 7,
    length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    today = dayKey(now);
  for (
    let day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (counts.has(today) ? 0 : 1),
    );
    counts.has(dayKey(day));
    day.setDate(day.getDate() - 1)
  )
    run.add(dayKey(day));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(undefined, {
        weekday: "narrow",
      }),
    ),
    open = (key: string) =>
      document
        .getElementById("day-" + key)
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    tally: [string, React.ReactNode, string?][] = [
      [
        d.streak.longest
          ? tr("streak · record {0}", { 0: d.streak.longest })
          : tr("streak"),
        tr("{0} d", { 0: d.streak.current }),
        d.streak.current ? "text-warning" : undefined,
      ],
      [tr("this week"), d.week.toLocaleString()],
      [tr("active days"), d.days.toLocaleString()],
      [tr("solves in all"), d.activity.length.toLocaleString()],
      [tr("training solves"), d.trainingSolves.toLocaleString()],
      [tr("cases learned"), d.learned.toLocaleString()],
    ];
  return (
    <Surface className="shrink-0 gap-2.5 p-[18px]" aria-label={tr("Calendar")}>
      <div className="flex items-center gap-1.5">
        <h2 className="mr-auto text-lg font-extrabold first-letter:uppercase">
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <UiButton
          variant="outline"
          size="icon"
          aria-label={tr("Previous month")}
          onClick={() => setShift(shift - 1)}
        >
          <ChevronLeft />
        </UiButton>
        <UiButton
          variant="outline"
          size="icon"
          aria-label={tr("Next month")}
          disabled={shift >= 0}
          onClick={() => setShift(shift + 1)}
        >
          <ChevronRight />
        </UiButton>
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {weekdays.map((w, i) => (
          <span
            key={i}
            className="pb-0.5 text-center text-[11px] font-bold text-muted-foreground uppercase"
          >
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={"lead" + i} />
        ))}
        {Array.from({ length }, (_, i) => {
          const date = new Date(month.getFullYear(), month.getMonth(), i + 1),
            key = dayKey(date),
            count = counts.get(key)?.count ?? 0,
            inRun = run.has(key);
          return (
            <Tip
              key={key}
              content={
                count
                  ? plural(count, "solve")
                  : date.toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                    })
              }
            >
              <button
                type="button"
                disabled={!count}
                onClick={() => open(key)}
                aria-label={
                  date.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                  }) + (count ? " · " + plural(count, "solve") : "")
                }
                className={cn(
                  NUMERIC,
                  "relative h-9 text-[13px] font-bold text-muted-foreground disabled:cursor-default",
                  count && "rounded-xl text-foreground hover:bg-muted",
                  key === today && "ring-2 ring-primary ring-inset",
                )}
              >
                {i + 1}
                {count > 0 && (
                  <i
                    className={cn(
                      "absolute bottom-1 left-1/2 h-1 -translate-x-1/2 rounded-full",
                      inRun ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: 6 + (count / most) * 18 }}
                  />
                )}
              </button>
            </Tip>
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-x-2 gap-y-3 pt-1.5">
        {tally.map(([label, value, tone]) => (
          <div key={label} className="flex min-w-0 flex-col-reverse">
            <dt className="truncate text-xs font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd className={cn(NUMERIC, "text-[19px] font-extrabold", tone)}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}

/** The best Ao5 of each of the last ten weeks as labelled columns, the best of them in lilac; then the other pages. */
export function WeeksCard({ d }: { d: ProfileData }) {
  const weeks = useMemo(
      () => weeklyBestAo5(d.history, d.ao5),
      [d.history, d.ao5],
    ),
    values = weeks.map((w) => w.best).filter((v): v is number => v != null),
    low = Math.min(...values),
    high = Math.max(...values),
    event = s.event(s.profilePuzzle, s.profileSolveMode);
  return (
    <Surface
      className="min-h-0 flex-1 gap-2.5 p-[18px]"
      aria-label={tr("Best Ao5 per week")}
    >
      <Caption>
        {tr("Best Ao5 per week")} · {said(event.label)}
      </Caption>
      {values.length ? (
        <div className="flex min-h-24 flex-1 items-end gap-1.5">
          {weeks.map((w, i) => (
            <Tip
              key={w.start.getTime()}
              content={
                w.best != null
                  ? `${w.start.toLocaleDateString(undefined, { day: "numeric", month: "long" })} · ${tr("Ao5 {0}", { 0: fmtTime(w.best) })}`
                  : w.start.toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                    })
              }
            >
              <div
                className={cn(
                  "flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 text-[10px] font-bold text-muted-foreground",
                  w.best === low && "text-lilac",
                )}
              >
                {/* Ten times side by side don't fit: the best week and this one are written, the others in their tooltip. */}
                {w.best != null &&
                  (w.best === low || i === weeks.length - 1) && (
                    <span className={cn(NUMERIC, "whitespace-nowrap")}>
                      {fmtTime(w.best)}
                    </span>
                  )}
                <i
                  className={cn(
                    "w-full rounded-t-md rounded-b-[3px]",
                    w.best === low ? "bg-lilac" : "bg-accent",
                  )}
                  // The fastest week stands tallest; the slowest still shows.
                  style={{
                    height:
                      w.best == null
                        ? 0
                        : `${high === low ? 80 : 25 + ((high - w.best) / (high - low)) * 60}%`,
                  }}
                />
                <span className={cn(NUMERIC, "whitespace-nowrap")}>
                  {w.start.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "numeric",
                  })}
                </span>
              </div>
            </Tip>
          ))}
        </div>
      ) : (
        <p className="flex-1 text-sm text-muted-foreground">
          {tr("No Ao5 in the last ten weeks.")}
        </p>
      )}
      <div className="grid shrink-0 grid-cols-2 gap-1.5">
        <Button
          action="profileMode:analysis"
          icon={Gauge}
          variant="outline"
        >
          {tr("Analysis")}
        </Button>
        <Button
          action="profileMode:training"
          icon={BookOpen}
          variant="outline"
        >
          {tr("Cases")}{" "}
          <span className={cn(NUMERIC, "text-muted-foreground")}>
            {d.learned}
          </span>
        </Button>
        <Button
          action="profileMode:achievements"
          icon={Trophy}
          variant="outline"
        >
          {tr("Achievements")}{" "}
          <span className={cn(NUMERIC, "text-muted-foreground")}>
            {d.unlocked}
          </span>
        </Button>
        <Button
          action="profileMode:duels"
          icon={Swords}
          variant="outline"
        >
          {tr("Battles")}{" "}
          <span className={cn(NUMERIC, "text-muted-foreground")}>
            {battles().length}
          </span>
        </Button>
      </div>
    </Surface>
  );
}
