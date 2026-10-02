/**
 * The coach's month as a calendar: each day's open hours and the people who booked, a click on one showing who they
 * are. Edit availability asks what to change: hours on a date or a date cancelled (picked in the calendar, then
 * finished in a dialog), or weekly hours (repeated over chosen weekdays, for good or between two dates). A click on a
 * day shows what it holds and its exceptions. Everything is on the coach's own clock and saved at once; players see
 * the slots it makes, less the sessions already booked.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarCog, CalendarOff, CalendarPlus, CalendarX, ChevronLeft, ChevronRight, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NUMERIC, Tip, plural } from "../ui";
import { coaching, type Booking, type Opening, type Override } from "./client";
import { PANEL, clockTime, time } from "./parts";
import { PersonDialog, SessionCard } from "./person";
import { BOX, DayBoxes, Month, MonthHeader, NARROW_BAR, WEEKDAYS, addDays, longDay, shortDay, toDate, weekdayOf } from "./calendar";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Weekly hours repeated on some weekdays (0 = Monday), between two dates or for good. */
interface Rule {
  days: number[];
  start: number;
  end: number;
  from: string | null;
  until: string | null;
}
type Range = [start: number, end: number];

const TIMES = Array.from({ length: 49 }, (_, i) => i * 30);
const zones = (() => {
  try {
    return (Intl as any).supportedValuesOf("timeZone") as string[];
  } catch {
    return ["UTC"];
  }
})();

/** The day and time of a moment on a given clock. */
function onClock(ms: number, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
const rangeText = ([s, e]: Range) => `${clockTime(s)}–${clockTime(e)}`;
/** "18–21", "9:30–12": hours as short as a calendar cell needs. */
const short = (m: number) => (m % 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : String(m / 60));
const rangeShort = ([s, e]: Range) => `${short(s)}–${short(e)}`;

/** The weekly openings as the server keeps them (one per weekday), gathered back into rules. */
function rulesOf(windows: Opening[]): Rule[] {
  const rules = new Map<string, Rule>();
  for (const w of windows) {
    const key = [w.start, w.end, w.from ?? "", w.until ?? ""].join("|");
    const rule = rules.get(key) ?? { days: [], start: w.start, end: w.end, from: w.from ?? null, until: w.until ?? null };
    if (!rule.days.includes(w.weekday)) rule.days.push(w.weekday);
    rules.set(key, rule);
  }
  return [...rules.values()].map((r) => ({ ...r, days: r.days.sort() }));
}
function windowsOf(rules: Rule[]): Opening[] {
  return rules.flatMap((r) => r.days.map((weekday) => ({ weekday, start: r.start, end: r.end, ...(r.from ? { from: r.from } : {}), ...(r.until ? { until: r.until } : {}) })));
}
const inForce = (r: Rule, day: string) => r.days.includes(weekdayOf(day)) && (!r.from || r.from <= day) && (!r.until || day <= r.until);
/** A day's open hours, as the server counts them: the rules in force and the extra hours, less the hours taken back. */
function hoursOn(day: string, rules: Rule[], changes: Override[], off: Set<string>): Range[] {
  if (off.has(day)) return [];
  const open = [...rules.filter((r) => inForce(r, day)).map((r): Range => [r.start, r.end]), ...changes.filter((c) => c.open && c.date === day).map((c): Range => [c.start, c.end])].sort((a, b) => a[0] - b[0]);
  let merged: Range[] = [];
  for (const [s, e] of open) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  for (const c of changes.filter((c) => !c.open && c.date === day))
    merged = merged.flatMap(([s, e]): Range[] => [[s, Math.min(e, c.start)], [Math.max(s, c.end), e]]).filter(([s, e]) => s < e);
  return merged;
}


export function Schedule() {
  const coach = coaching.me?.coach;
  useEffect(() => {
    void coaching.load("bookings");
  }, []);
  if (!coach?.windows)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  return <ScheduleForm key={coach.id} />;
}

/** The availability as the editor reads and writes it. */
interface Availability {
  zone: string;
  minutes: number;
  rules: Rule[];
  changes: Override[];
  off: string[];
}
/** Days picked in the calendar, to open them or cancel them. */
type Picking = "open" | "close";
/** The dialog showing: what to change, weekly hours, a day, or the picked days. */
type Step = { kind: "menu" } | { kind: "rule"; index: number | null } | { kind: "day"; day: string } | { kind: Picking; days: string[] };

/** The month, as large as the page allows; every change goes through a dialog and is saved at once. */
function ScheduleForm() {
  const coach = coaching.me!.coach!;
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const saved: Availability = {
    zone: coach.timezone === "UTC" && !coach.windows!.length ? here : coach.timezone,
    minutes: coach.sessionMinutes,
    rules: rulesOf(coach.windows!),
    changes: coach.overrides ?? [],
    off: coach.daysOff ?? [],
  };
  const { zone, rules, changes } = saved;
  const off = useMemo(() => new Set(saved.off), [coach.daysOff]);
  const [step, setStep] = useState<Step | null>(null),
    [picking, setPicking] = useState<Picking | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [anchor, setAnchor] = useState(""),
    [pending, setPending] = useState(false),
    [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const today = onClock(Date.now(), zone).day;
  const [month, setMonth] = useState(today.slice(0, 7));
  // The sessions booked with the coach, by day on the coach's clock.
  const sessions = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of [...(coaching.bookings ?? [])].sort((a, b) => a.startsAt - b.startsAt)) {
      if (b.role !== "coach" || b.status !== "booked") continue;
      const key = onClock(b.startsAt, zone).day;
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return map;
  }, [coaching.bookings, zone]);
  /** Saves the availability with a change; tells whether it went through. */
  async function commit(change: Partial<Availability>) {
    const next = { ...saved, ...change };
    setPending(true);
    try {
      await coaching.saveAvailability({ timezone: next.zone, sessionMinutes: next.minutes, windows: windowsOf(next.rules), daysOff: [...new Set(next.off)].sort(), overrides: next.changes });
      toast.success("Availability saved");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  /** Saves, then closes the dialog and leaves the calendar picking. */
  async function finish(change: Partial<Availability>) {
    if (!(await commit(change))) return;
    setStep(null);
    stopPicking();
  }
  function stopPicking() {
    setPicking(null);
    setSelected([]);
  }
  function pick(day: string, e: React.MouseEvent | React.KeyboardEvent) {
    if (!picking) return setStep({ kind: "day", day });
    if (e.shiftKey && anchor) {
      const [a, b] = anchor <= day ? [anchor, day] : [day, anchor];
      const range: string[] = [];
      for (let d = a; d <= b; d = addDays(d, 1)) if (d >= today) range.push(d);
      setSelected((list) => [...new Set([...list, ...range])].sort());
    } else setSelected((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort()));
    setAnchor(day);
  }
  return (
    <section aria-label="Schedule" className="flex min-h-0 flex-1 flex-col gap-3">
      <MonthHeader month={month} today={today} onMonth={setMonth}>
        {picking ? (
          <span className="ml-auto flex items-center gap-2" data-slot="schedule-picking">
            <span className="text-sm text-muted-foreground max-sm:hidden">{selected.length ? `${plural(selected.length, "day")} picked` : picking === "open" ? "Pick the days to open" : "Pick the days to cancel"}</span>
            <UiButton variant="ghost" onClick={stopPicking} data-action="schedule:stop">
              Cancel
            </UiButton>
            <UiButton disabled={!selected.length} onClick={() => setStep({ kind: picking, days: selected })} data-action="schedule:continue">
              Continue
              <ChevronRight />
            </UiButton>
          </span>
        ) : (
          <UiButton className="ml-auto" onClick={() => setStep({ kind: "menu" })} data-action="schedule:edit">
            <CalendarCog />
            Edit availability
          </UiButton>
        )}
      </MonthHeader>
      <div className="flex min-h-0 flex-1 max-lg:overflow-y-auto">
        <Month
          month={month}
          today={today}
          selected={(day) => !!picking && selected.includes(day)}
          pick={pick}
          cell={(day, past) => {
            const hours = hoursOn(day, rules, changes, off),
              dayOff = off.has(day),
              booked = sessions.get(day) ?? [];
            return {
              className: cn(dayOff && !past && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-muted)_6px_8px)]"),
              corner: (
                <>
                  {(dayOff || changes.some((c) => c.date === day)) && !past && <span className="size-1.5 rounded-full bg-warning" aria-label="Changed this day" />}
                  {dayOff ? (
                    <span className="ml-auto text-[11px] text-muted-foreground">Off</span>
                  ) : (
                    !!hours.length && (
                      <span title={hours.map(rangeText).join(", ")} className={cn(NUMERIC, "ml-auto truncate text-[11px] text-primary/90 @max-[5.5rem]:hidden", past && "text-muted-foreground/60")}>
                        {rangeShort(hours[0]!)}
                        {hours.length > 1 && ` +${hours.length - 1}`}
                      </span>
                    )
                  )}
                </>
              ),
              body: (
                <>
                  {!dayOff && !!hours.length && <span className={cn(NARROW_BAR, past && "bg-muted-foreground/30")} aria-hidden="true" />}
                  <DayBoxes items={booked}>{(b, paired) => <SessionChip key={b.id} b={b} paired={paired} past={b.endsAt <= Date.now()} onProfile={setProfile} />}</DayBoxes>
                </>
              ),
            };
          }}
        />
      </div>
      <Dialog open={!!step} onOpenChange={(open) => !open && setStep(null)}>
        <DialogContent className="sm:max-w-md" data-slot="schedule-dialog">
          {step?.kind === "menu" && (
            <Menu
              saved={saved}
              pending={pending}
              commit={commit}
              choose={(kind) => {
                if (kind === "rule") return setStep({ kind: "rule", index: null });
                setStep(null);
                setSelected([]);
                setPicking(kind);
              }}
              edit={(index) => setStep({ kind: "rule", index })}
            />
          )}
          {step?.kind === "rule" && <RuleForm key={step.index ?? "new"} rule={step.index == null ? null : rules[step.index]!} today={today} pending={pending} back={() => setStep({ kind: "menu" })} save={(rule) => finish({ rules: step.index == null ? [...rules, rule] : rules.map((r, i) => (i === step.index ? rule : r)) })} remove={() => finish({ rules: rules.filter((_, i) => i !== step.index) })} />}
          {step?.kind === "day" && <DayView day={step.day} saved={saved} off={off} sessions={sessions.get(step.day) ?? []} pending={pending} commit={commit} go={(kind) => setStep({ kind, days: [step.day] })} />}
          {(step?.kind === "open" || step?.kind === "close") && (
            <DaysForm
              key={step.kind}
              kind={step.kind}
              days={step.days}
              saved={saved}
              off={off}
              booked={step.days.reduce((n, d) => n + (sessions.get(d)?.length ?? 0), 0)}
              pending={pending}
              apply={(start, end, wholeDay) =>
                finish(
                  step.kind === "open"
                    ? { changes: [...changes, ...step.days.map((date) => ({ date, start, end, open: true }))], off: saved.off.filter((d) => !step.days.includes(d)) }
                    : wholeDay
                      ? { off: [...saved.off, ...step.days] }
                      : { changes: [...changes, ...step.days.map((date) => ({ date, start, end, open: false }))] },
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
      <PersonDialog id={profile?.id ?? ""} name={profile?.name ?? ""} open={!!profile} onOpenChange={(open) => !open && setProfile(null)} />
    </section>
  );
}
const lengths = (list = [30, 45, 60, 90, 120]) => list.map((m) => ({ value: String(m), label: `${m} min sessions` }));
const ZONES = zones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }));
/** "Mon–Fri", "Mon, Wed, Sat": the weekdays of a rule, runs of three or more shortened. */
function weekdaysText(days: number[]) {
  const runs: number[][] = [];
  for (const d of [...days].sort()) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === d - 1) run.push(d);
    else runs.push([d]);
  }
  return runs.flatMap((r) => (r.length > 2 ? [`${WEEKDAYS[r[0]!]}–${WEEKDAYS[r[r.length - 1]!]}`] : r.map((d) => WEEKDAYS[d]!))).join(", ");
}
const periodText = (r: Pick<Rule, "from" | "until">) => (r.from || r.until ? `${r.from ? "from " + shortDay.format(toDate(r.from)) : ""}${r.from && r.until ? " " : ""}${r.until ? "until " + shortDay.format(toDate(r.until)) : ""}` : "every week");
const daysText = (days: string[]) => (days.length === 1 ? longDay.format(toDate(days[0]!)) : `${plural(days.length, "day")} · ${shortDay.format(toDate(days[0]!))} – ${shortDay.format(toDate(days[days.length - 1]!))}`);

/** What to change: open a date, cancel a date, add weekly hours; then the weekly hours in force and the settings. */
function Menu({ saved, pending, commit, choose, edit }: { saved: Availability; pending: boolean; commit: (change: Partial<Availability>) => Promise<boolean>; choose: (kind: Picking | "rule") => void; edit: (index: number) => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit availability</DialogTitle>
        <DialogDescription>What do you want to change?</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Choice icon={<CalendarPlus />} title="Add a date" text="Open hours on days you pick" onClick={() => choose("open")} action="schedule:add-date" />
        <Choice icon={<CalendarX />} title="Cancel a date" text="A day off, or a few hours away" onClick={() => choose("close")} action="schedule:cancel-date" />
        <Choice icon={<Repeat />} title="Add weekly hours" text="The same hours every week" onClick={() => choose("rule")} action="schedule:rule" />
      </div>
      {!!saved.rules.length && (
        <div className="flex flex-col gap-1.5" data-slot="rules">
          <span className="text-xs font-medium text-muted-foreground">Weekly hours</span>
          <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {saved.rules.map((r, i) => (
              <li key={i} data-rule={i}>
                <button type="button" onClick={() => edit(i)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50">
                  <span className="min-w-0 flex-1 truncate font-medium">{weekdaysText(r.days)}</span>
                  <span className={cn(NUMERIC, "shrink-0")}>{rangeText([r.start, r.end])}</span>
                  <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">{periodText(r)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Select items={lengths(coaching.me?.lengths)} value={String(saved.minutes)} onValueChange={(v) => void commit({ minutes: Number(v) })} disabled={pending}>
          <SelectTrigger aria-label="Session length" data-action="schedule:length" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lengths(coaching.me?.lengths).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={ZONES} value={saved.zone} onValueChange={(v) => void commit({ zone: String(v) })} disabled={pending}>
          <SelectTrigger aria-label="Time zone" data-action="schedule:zone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZONES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
function Choice({ icon, title, text, onClick, action }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; action: string }) {
  return (
    <button type="button" onClick={onClick} data-action={action} className="flex items-center gap-3 rounded-lg border p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4.5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Weekly hours, new or in force: the weekdays, the hours, and whether they repeat for good or between two dates. */
function RuleForm({ rule, today, pending, back, save, remove }: { rule: Rule | null; today: string; pending: boolean; back: () => void; save: (rule: Rule) => void; remove: () => void }) {
  const [days, setDays] = useState(rule?.days ?? [0, 1, 2, 3, 4]),
    [start, setStart] = useState(rule?.start ?? 18 * 60),
    [end, setEnd] = useState(rule?.end ?? 21 * 60),
    [dated, setDated] = useState(!!(rule?.from || rule?.until)),
    [from, setFrom] = useState(rule?.from ?? ""),
    [until, setUntil] = useState(rule?.until ?? "");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{rule ? "Weekly hours" : "Add weekly hours"}</DialogTitle>
        <DialogDescription>{days.length ? `${weekdaysText(days)} · ${rangeText([start, end])}` : "Pick at least one day."}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Days</FieldLabel>
          <ToggleGroup multiple variant="outline" spacing={0} value={days.map(String)} onValueChange={(v: string[]) => setDays(v.map(Number).sort())} aria-label="Days" className="w-full">
            {WEEKDAYS.map((w, d) => (
              <ToggleGroupItem key={w} value={String(d)} aria-label={w} className="flex-1 px-0 text-xs data-[pressed]:bg-primary/15 data-[pressed]:text-primary">
                {w.slice(0, 2)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel>Hours</FieldLabel>
          <Hours start={start} end={end} setStart={setStart} setEnd={setEnd} />
        </Field>
        <Field>
          <FieldLabel>Repeat</FieldLabel>
          <ToggleGroup variant="outline" spacing={0} value={[dated ? "dated" : "always"]} onValueChange={(v: string[]) => v[0] && setDated(v[0] === "dated")} aria-label="Repeat" className="w-full">
            <ToggleGroupItem value="always" className="flex-1" data-action="schedule:always">
              For good
            </ToggleGroupItem>
            <ToggleGroupItem value="dated" className="flex-1" data-action="schedule:dated">
              Between two dates
            </ToggleGroupItem>
          </ToggleGroup>
          {dated && (
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <label className="flex flex-col gap-1">
                Starting
                <Input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} className={NUMERIC} />
              </label>
              <label className="flex flex-col gap-1">
                Until
                <Input type="date" value={until} min={from || today} onChange={(e) => setUntil(e.target.value)} className={NUMERIC} />
              </label>
            </div>
          )}
        </Field>
      </div>
      <DialogFooter>
        {rule ? (
          <UiButton variant="ghost" className="mr-auto hover:text-destructive" disabled={pending} onClick={remove} data-action="schedule:remove-rule">
            <Trash2 />
            Remove
          </UiButton>
        ) : (
          <UiButton variant="ghost" className="mr-auto" onClick={back}>
            <ChevronLeft />
            Back
          </UiButton>
        )}
        <UiButton disabled={!days.length || pending} onClick={() => save({ days, start, end, from: (dated && from) || null, until: (dated && until) || null })} data-action="schedule:save-rule">
          {pending ? "Saving…" : rule ? "Save" : "Add"}
        </UiButton>
      </DialogFooter>
    </>
  );
}

/** One day: its hours, the weekly hours and exceptions that make them, its sessions; then to open or cancel it. */
function DayView({ day, saved, off, sessions, pending, commit, go }: { day: string; saved: Availability; off: Set<string>; sessions: Booking[]; pending: boolean; commit: (change: Partial<Availability>) => Promise<boolean>; go: (kind: Picking) => void }) {
  const hours = hoursOn(day, saved.rules, saved.changes, off),
    dayOff = off.has(day),
    weekly = saved.rules.filter((r) => inForce(r, day)),
    own = saved.changes.map((c, i) => [c, i] as const).filter(([c]) => c.date === day),
    slots = hours.reduce((n, [s, e]) => n + Math.floor((e - s) / saved.minutes), 0);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{longDay.format(toDate(day))}</DialogTitle>
        <DialogDescription>{dayOff ? "Day off: no one can book you." : hours.length ? `${hours.map(rangeText).join(", ")} · ${plural(slots, "slot")}` : "Closed: no hours this day."}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4" data-slot="day-panel">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Weekly hours</span>
          {!weekly.length ? (
            <span className="text-muted-foreground">None this day.</span>
          ) : (
            weekly.map((r, i) => (
              <span key={i} className={cn(NUMERIC, "flex items-center gap-2")}>
                <Repeat className="size-3.5 text-muted-foreground" />
                {rangeText([r.start, r.end])}
              </span>
            ))
          )}
        </div>
        {(dayOff || !!own.length) && (
          <div className="flex flex-col gap-1" data-slot="day-changes">
            <span className="text-xs font-medium text-muted-foreground">Only this day</span>
            {dayOff && (
              <span className="flex items-center gap-2" data-change="off">
                <CalendarOff className="size-3.5 text-warning" />
                <span className="flex-1">Day off</span>
                <UiButton variant="ghost" size="sm" disabled={pending} onClick={() => commit({ off: saved.off.filter((d) => d !== day) })} data-action="schedule:reopen">
                  Reopen
                </UiButton>
              </span>
            )}
            {own.map(([c, i]) => (
              <span key={i} className="flex items-center gap-2" data-change={c.open ? "open" : "closed"}>
                <span className={cn("w-12 shrink-0 text-xs font-medium", c.open ? "text-primary" : "text-warning")}>{c.open ? "Extra" : "Away"}</span>
                <span className={cn(NUMERIC, "flex-1")}>{rangeText([c.start, c.end])}</span>
                <Tip content="Remove">
                  <UiButton variant="ghost" size="icon-sm" aria-label="Remove" disabled={pending} onClick={() => commit({ changes: saved.changes.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </UiButton>
                </Tip>
              </span>
            ))}
          </div>
        )}
        {!!sessions.length && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Sessions</span>
            {sessions.map((b) => (
              <span key={b.id} className="flex items-center gap-2">
                <span className={NUMERIC}>{time(b.startsAt)}</span>
                <span className="truncate text-muted-foreground">with {b.with.username}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <UiButton variant="outline" onClick={() => go("close")} disabled={dayOff} data-action="schedule:day-close">
          <CalendarX />
          Cancel hours
        </UiButton>
        <UiButton variant="outline" onClick={() => go("open")} data-action="schedule:day-open">
          <CalendarPlus />
          Add hours
        </UiButton>
      </DialogFooter>
    </>
  );
}

/** The picked days, opened for some hours or cancelled: the whole day off, or a few hours away. */
function DaysForm({ kind, days, saved, off, booked, pending, apply }: { kind: Picking; days: string[]; saved: Availability; off: Set<string>; booked: number; pending: boolean; apply: (start: number, end: number, wholeDay: boolean) => void }) {
  const [start, setStart] = useState(18 * 60),
    [end, setEnd] = useState(20 * 60),
    [wholeDay, setWholeDay] = useState(true);
  const one = days.length === 1 ? days[0]! : null,
    hours = one ? hoursOn(one, saved.rules, saved.changes, off) : [];
  return (
    <>
      <DialogHeader>
        <DialogTitle>{kind === "open" ? "Add a date" : "Cancel a date"}</DialogTitle>
        <DialogDescription>
          {daysText(days)}
          {one && ` · ${off.has(one) ? "day off" : hours.length ? hours.map(rangeText).join(", ") : "closed"}`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {kind === "close" && (
          <ToggleGroup variant="outline" spacing={0} value={[wholeDay ? "day" : "hours"]} onValueChange={(v: string[]) => v[0] && setWholeDay(v[0] === "day")} aria-label="What to cancel" className="w-full">
            <ToggleGroupItem value="day" className="flex-1" data-action="schedule:off">
              <CalendarOff />
              Whole day
            </ToggleGroupItem>
            <ToggleGroupItem value="hours" className="flex-1" data-action="schedule:away">
              Some hours
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        {(kind === "open" || !wholeDay) && (
          <Field>
            <FieldLabel>{kind === "open" ? "Open" : "Away"}</FieldLabel>
            <Hours start={start} end={end} setStart={setStart} setEnd={setEnd} />
          </Field>
        )}
        {kind === "close" && !!booked && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{plural(booked, "session")} already booked stay booked: cancel them from Sessions if you need to.</p>}
      </div>
      <DialogFooter>
        <UiButton disabled={pending} onClick={() => apply(start, end, kind === "close" && wholeDay)} data-action={kind === "open" ? "schedule:extra" : "schedule:confirm"}>
          {pending ? "Saving…" : kind === "open" ? "Add hours" : wholeDay ? `Take ${days.length > 1 ? "these days" : "the day"} off` : "Take these hours off"}
        </UiButton>
      </DialogFooter>
    </>
  );
}

/** From one time to a later one, half hour by half hour. */
function Hours({ start, end, setStart, setEnd }: { start: number; end: number; setStart: (minutes: number) => void; setEnd: (minutes: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <TimeSelect value={start} options={TIMES.filter((t) => t < 1440)} onChange={(v) => (setStart(v), setEnd(Math.max(end, v + 30)))} label="From" />
      <span className="text-muted-foreground">–</span>
      <TimeSelect value={end} options={TIMES.filter((t) => t > start)} onChange={setEnd} label="To" />
    </div>
  );
}

/** A booked session in its day, a box like the times to book: its time and who booked it (the time alone when it
 * shares its line); a click shows who they are, and lets the coach move or cancel it. */
function SessionChip({ b, paired, past, onProfile }: { b: Booking; paired: boolean; past: boolean; onProfile: (person: { id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        render={
          <button
            type="button"
            data-booking={b.id}
            aria-label={`${time(b.startsAt)} · ${b.with.username}`}
            className={cn(BOX, paired && "px-0.5", past ? "bg-muted text-muted-foreground hover:bg-muted/80" : b.proposal ? "bg-warning/20 text-warning hover:bg-warning/30" : "bg-primary text-primary-foreground hover:bg-primary/85")}
          />
        }
      >
        <span className="shrink-0">{time(b.startsAt)}</span>
        {!paired && <span className="truncate font-medium opacity-85 @max-[7rem]:hidden">{b.with.username}</span>}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-4" onClick={(e) => e.stopPropagation()}>
        <SessionCard
          b={b}
          onProfile={() => {
            setOpen(false);
            onProfile({ id: b.with.id, name: b.with.username });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}


function TimeSelect({ value, options, onChange, label }: { value: number; options: number[]; onChange: (minutes: number) => void; label: string }) {
  const items = options.map((t) => ({ value: String(t), label: clockTime(t) }));
  return (
    <Select items={items} value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-label={label} className={cn(NUMERIC, "flex-1")}>
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
  );
}
