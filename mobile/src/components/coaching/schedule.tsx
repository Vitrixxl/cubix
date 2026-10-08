import { CalendarCog, CalendarOff, CalendarPlus, CalendarX, ChevronLeft, ChevronRight, Repeat, Trash2, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { plural } from "../../../../src/client/lib/format";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ask } from "../Confirm";
import { ChoiceButton } from "../PuzzlePicker";
import { Sheet } from "../Sheet";
import { Empty, Label, Numeric, Segmented } from "../layout";
import { coaching, useCoaching, type Booking, type Opening, type Override } from "./client";
import { CalendarSkeleton, DayBoxes, DayChip, Month, MonthHeader, NarrowBar, WEEKDAYS, addDays, longDay, shortDay, toDate, weekdayOf } from "./calendar";
import { PersonDialog, SessionCard } from "./person";
import { Field, clockTime, time, useAction } from "./parts";
import { tr } from "../../../../src/client/i18n";

/**
 * The coach's month as a calendar (the web's coaching/schedule.tsx): each day's open hours and the people who booked,
 * a tap on one showing who they are. Edit availability asks what to change: hours on dates or dates cancelled (picked
 * in the calendar, then finished in a sheet), or weekly hours (repeated over chosen weekdays, for good or between two
 * dates). A tap on a day shows what it holds and its exceptions. Everything is on the coach's own clock and saved at
 * once; players see the slots it makes, less the sessions already booked.
 */

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

/** The day of a moment on a given clock. */
function dayOn(ms: number, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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
  return [...rules.values()].map(r => ({ ...r, days: r.days.sort() }));
}
function windowsOf(rules: Rule[]): Opening[] {
  return rules.flatMap(r => r.days.map(weekday => ({ weekday, start: r.start, end: r.end, ...(r.from ? { from: r.from } : {}), ...(r.until ? { until: r.until } : {}) })));
}
const inForce = (r: Rule, day: string) => r.days.includes(weekdayOf(day)) && (!r.from || r.from <= day) && (!r.until || day <= r.until);
/** A day's open hours, as the server counts them: the rules in force and the extra hours, less the hours taken back. */
function hoursOn(day: string, rules: Rule[], changes: Override[], off: Set<string>): Range[] {
  if (off.has(day)) return [];
  const open = [...rules.filter(r => inForce(r, day)).map((r): Range => [r.start, r.end]), ...changes.filter(c => c.open && c.date === day).map((c): Range => [c.start, c.end])].sort((a, b) => a[0] - b[0]);
  let merged: Range[] = [];
  for (const [s, e] of open) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  for (const c of changes.filter(c => !c.open && c.date === day))
    merged = merged.flatMap(([s, e]): Range[] => [[s, Math.min(e, c.start)], [Math.max(s, c.end), e]]).filter(([s, e]) => s < e);
  return merged;
}

export function Schedule() {
  const coach = useCoaching().me?.coach;
  useEffect(() => { void coaching.load("bookings"); }, []);
  if (!coach?.windows) return <View accessibilityLabel={tr("Loading")} className="min-h-0 flex-1 gap-3">
    <View className="flex-row items-center gap-2"><Skeleton className="h-6 w-36" /><Skeleton className="size-10" /><Skeleton className="size-10" /></View>
    <CalendarSkeleton />
  </View>;
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
/** The sheet showing: what to change, weekly hours, a day, or the picked days. */
type Step = { kind: "menu" } | { kind: "rule"; index: number | null } | { kind: "day"; day: string } | { kind: Picking; days: string[] };

/** The month, as large as the page allows; every change goes through a sheet and is saved at once. */
function ScheduleForm() {
  const cs = useCoaching(), coach = cs.me!.coach!;
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
  const [step, setStep] = useState<Step | null>(null), [picking, setPicking] = useState<Picking | null>(null), [selected, setSelected] = useState<string[]>([]),
    [chip, setChip] = useState<Booking | null>(null), [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const { pending, run } = useAction();
  const today = dayOn(Date.now(), zone);
  const [month, setMonth] = useState(today.slice(0, 7));
  // The sessions booked with the coach, by day on the coach's clock.
  const sessions = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of [...(cs.bookings ?? [])].sort((a, b) => a.startsAt - b.startsAt)) {
      if (b.role !== "coach" || b.status !== "booked") continue;
      const key = dayOn(b.startsAt, zone);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return map;
  }, [cs.bookings, zone]);
  /** Saves the availability with a change; tells whether it went through. */
  function commit(change: Partial<Availability>) {
    const next = { ...saved, ...change };
    return run(() => coaching.saveAvailability({ timezone: next.zone, sessionMinutes: next.minutes, windows: windowsOf(next.rules), daysOff: [...new Set(next.off)].sort(), overrides: next.changes }), tr("Availability saved"));
  }
  /** Saves, then closes the sheet and leaves the calendar picking. */
  async function finish(change: Partial<Availability>) {
    if (!(await commit(change))) return;
    setStep(null);
    stopPicking();
  }
  function stopPicking() {
    setPicking(null);
    setSelected([]);
  }
  function pick(day: string) {
    if (!picking) return setStep({ kind: "day", day });
    setSelected(list => (list.includes(day) ? list.filter(d => d !== day) : [...list, day].sort()));
  }
  return <View accessibilityLabel={tr("Schedule")} className="min-h-0 flex-1 gap-3">
    <MonthHeader month={month} today={today} onMonth={setMonth}>
      {picking ? <View className="ml-auto flex-row items-center gap-1">
        <Button variant="ghost" className="h-10" onPress={stopPicking}><Text>{tr("Cancel")}</Text></Button>
        <Button className="h-10" disabled={!selected.length} onPress={() => setStep({ kind: picking, days: selected })} testID="schedule-continue">
          <Text>{tr("Continue")}</Text><Icon as={ChevronRight} size={16} className="text-primary-foreground" />
        </Button>
      </View> : <Button className="ml-auto h-10" onPress={() => setStep({ kind: "menu" })} testID="schedule-edit">
        <Icon as={CalendarCog} size={16} className="text-primary-foreground" /><Text>{tr("Edit availability")}</Text>
      </Button>}
    </MonthHeader>
    {picking ? <Text className="text-sm text-muted-foreground">{selected.length ? tr("{0} picked", { 0: plural(selected.length, "day") }) : picking === "open" ? tr("Pick the days to open") : tr("Pick the days to cancel")}</Text> : null}
    <Month month={month} today={today} selected={day => !!picking && selected.includes(day)} pick={pick}
      cell={(day, past) => {
        const hours = hoursOn(day, rules, changes, off), dayOff = off.has(day), booked = sessions.get(day) ?? [];
        return {
          className: cn(dayOff && !past && "bg-muted/60"),
          corner: <>
            {(dayOff || changes.some(c => c.date === day)) && !past ? <View accessibilityLabel={tr("Changed this day")} className="size-1.5 rounded-full bg-warning" /> : null}
            {dayOff ? <Text className="ml-auto text-[10px] text-muted-foreground">{tr("Off")}</Text> : null}
          </>,
          body: <>
            {!dayOff && hours.length ? <View accessibilityLabel={hours.map(rangeText).join(", ")}><NarrowBar muted={past} /></View> : null}
            <DayBoxes items={booked}>{b => <DayChip key={b.id} tone={b.endsAt <= Date.now() ? "past" : b.proposal ? "offered" : "chosen"} label={time(b.startsAt)}
              accessibilityLabel={`${time(b.startsAt)} · ${b.with.username}`} testID={"chip-" + b.id} onPress={() => setChip(b)} />}</DayBoxes>
          </>,
        };
      }} />
    <Sheet open={!!step} onClose={() => setStep(null)} title={tr("Edit availability")} hideTitle scroll>
      {step?.kind === "menu" ? <Menu saved={saved} pending={pending} commit={commit} edit={index => setStep({ kind: "rule", index })}
        choose={kind => {
          if (kind === "rule") return setStep({ kind: "rule", index: null });
          setStep(null);
          setSelected([]);
          setPicking(kind);
        }} /> : null}
      {step?.kind === "rule" ? <RuleForm key={step.index ?? "new"} rule={step.index == null ? null : rules[step.index]!} today={today} pending={pending} back={() => setStep({ kind: "menu" })}
        save={rule => finish({ rules: step.index == null ? [...rules, rule] : rules.map((r, i) => (i === step.index ? rule : r)) })}
        remove={() => finish({ rules: rules.filter((_, i) => i !== step.index) })} /> : null}
      {step?.kind === "day" ? <DayView day={step.day} saved={saved} off={off} sessions={sessions.get(step.day) ?? []} pending={pending} commit={commit} go={kind => setStep({ kind, days: [step.day] })} /> : null}
      {step?.kind === "open" || step?.kind === "close" ? <DaysForm key={step.kind} kind={step.kind} days={step.days} saved={saved} off={off} pending={pending}
        booked={step.days.reduce((n, d) => n + (sessions.get(d)?.length ?? 0), 0)}
        apply={(start, end, wholeDay) => finish(step.kind === "open"
          ? { changes: [...changes, ...step.days.map(date => ({ date, start, end, open: true }))], off: saved.off.filter(d => !step.days.includes(d)) }
          : wholeDay ? { off: [...saved.off, ...step.days] } : { changes: [...changes, ...step.days.map(date => ({ date, start, end, open: false }))] })} /> : null}
    </Sheet>
    <Sheet open={!!chip} onClose={() => setChip(null)} title={chip?.with.username ?? ""} hideTitle>
      {chip ? <SessionCard b={chip} onProfile={() => { setChip(null); setProfile({ id: chip.with.id, name: chip.with.username }); }} /> : null}
    </Sheet>
    <PersonDialog id={profile?.id ?? ""} name={profile?.name ?? ""} open={!!profile} onClose={() => setProfile(null)} />
  </View>;
}

/** A sheet's title and the line under it. */
function Head({ title, children }: { title: string; children?: ReactNode }) {
  return <View className="gap-0.5">
    <Text accessibilityRole="header" className="text-base font-semibold">{title}</Text>
    {children ? <Text className="text-sm text-muted-foreground">{children}</Text> : null}
  </View>;
}

const lengths = (list = [30, 45, 60, 90, 120]) => list.map(m => ({ id: String(m), label: tr("{0} min sessions", { 0: m }) }));
function zones(...current: string[]) {
  try { return (Intl as any).supportedValuesOf("timeZone") as string[]; } catch { return [...new Set([...current, "UTC"])]; }
}
/** "Mon–Fri", "Mon, Wed, Sat": the weekdays of a rule, runs of three or more shortened. */
function weekdaysText(days: number[]) {
  const runs: number[][] = [];
  for (const d of [...days].sort()) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === d - 1) run.push(d);
    else runs.push([d]);
  }
  return runs.flatMap(r => (r.length > 2 ? [`${tr(WEEKDAYS[r[0]!]!)}–${tr(WEEKDAYS[r[r.length - 1]!]!)}`] : r.map(d => tr(WEEKDAYS[d]!)))).join(", ");
}
const periodText = (r: Pick<Rule, "from" | "until">) =>
  r.from || r.until ? [r.from && tr("from {0}", { 0: shortDay.format(toDate(r.from)) }), r.until && tr("until {0}", { 0: shortDay.format(toDate(r.until)) })].filter(Boolean).join(" ") : tr("every week");
const daysText = (days: string[]) => (days.length === 1 ? longDay.format(toDate(days[0]!)) : `${plural(days.length, "day")} · ${shortDay.format(toDate(days[0]!))} – ${shortDay.format(toDate(days[days.length - 1]!))}`);

/** What to change: open a date, cancel a date, add weekly hours; then the weekly hours in force and the settings. */
function Menu({ saved, pending, commit, choose, edit }: { saved: Availability; pending: boolean; commit: (change: Partial<Availability>) => Promise<boolean>; choose: (kind: Picking | "rule") => void; edit: (index: number) => void }) {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <View className="gap-4" testID="schedule-menu">
    <Head title={tr("Edit availability")}>{tr("What do you want to change?")}</Head>
    <View className="gap-2">
      <ActionCard icon={CalendarPlus} title={tr("Add a date")} text={tr("Open hours on days you pick")} onPress={() => choose("open")} />
      <ActionCard icon={CalendarX} title={tr("Cancel a date")} text={tr("A day off, or a few hours away")} onPress={() => choose("close")} />
      <ActionCard icon={Repeat} title={tr("Add weekly hours")} text={tr("The same hours every week")} onPress={() => choose("rule")} />
    </View>
    {saved.rules.length ? <View className="gap-1.5">
      <Label>{tr("Weekly hours")}</Label>
      {saved.rules.map((r, i) => <Pressable key={i} accessibilityRole="button" onPress={() => edit(i)} className="min-h-11 flex-row items-center gap-2 rounded-lg px-1 active:bg-muted/50">
        <Text numberOfLines={1} className="min-w-0 flex-1 font-medium">{weekdaysText(r.days)}</Text>
        <Numeric className="shrink-0">{rangeText([r.start, r.end])}</Numeric>
        <Text numberOfLines={1} className="w-28 shrink-0 text-right text-xs text-muted-foreground">{periodText(r)}</Text>
      </Pressable>)}
    </View> : null}
    <View className="flex-row gap-2">
      <View className="flex-1"><ChoiceButton label={tr("Session length")} value={String(saved.minutes)} options={lengths(coaching.me?.lengths)} className="w-full justify-between"
        onChange={v => { if (!pending) void commit({ minutes: Number(v) }); }} /></View>
      <View className="flex-1"><ChoiceButton label={tr("Time zone")} value={saved.zone} className="w-full justify-between"
        options={zones(saved.zone, here).map(z => ({ id: z, label: z.replaceAll("_", " ") }))} onChange={v => { if (!pending) void commit({ zone: v }); }} /></View>
    </View>
  </View>;
}

/** One way to change the availability, as a card leading to its next step. */
function ActionCard({ icon, title, text, onPress }: { icon: LucideIcon; title: string; text: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:border-primary/40 active:bg-muted/30">
    <View className="size-9 items-center justify-center rounded-lg bg-primary/10"><Icon as={icon} size={18} className="text-primary" /></View>
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="font-medium">{title}</Text>
      <Text className="text-xs text-muted-foreground">{text}</Text>
    </View>
    <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
  </Pressable>;
}

/** Weekly hours, new or in force: the weekdays, the hours, and whether they repeat for good or between two dates. */
function RuleForm({ rule, today, pending, back, save, remove }: { rule: Rule | null; today: string; pending: boolean; back: () => void; save: (rule: Rule) => void; remove: () => void }) {
  const [days, setDays] = useState(rule?.days ?? [0, 1, 2, 3, 4]), [start, setStart] = useState(rule?.start ?? 18 * 60), [end, setEnd] = useState(rule?.end ?? 21 * 60),
    [dated, setDated] = useState(!!(rule?.from || rule?.until)), [from, setFrom] = useState(rule?.from ?? ""), [until, setUntil] = useState(rule?.until ?? "");
  return <View className="gap-4" testID="rule-form">
    <Head title={rule ? tr("Weekly hours") : tr("Add weekly hours")}>{days.length ? `${weekdaysText(days)} · ${rangeText([start, end])}` : tr("Pick at least one day.")}</Head>
    <Field label={tr("Days")}>
      <View accessibilityLabel={tr("Days")} className="flex-row overflow-hidden rounded-lg border border-border">
        {WEEKDAYS.map((w, d) => {
          const on = days.includes(d);
          return <Pressable key={w} accessibilityRole="checkbox" accessibilityLabel={tr(w)} accessibilityState={{ checked: on }}
            onPress={() => setDays(on ? days.filter(x => x !== d) : [...days, d].sort())}
            className={cn("h-11 flex-1 items-center justify-center", d && "border-l border-border", on ? "bg-primary/15" : "active:bg-muted/50")}>
            <Text className={cn("text-xs font-medium", on ? "text-primary" : "text-foreground")}>{tr(w).slice(0, 2)}</Text>
          </Pressable>;
        })}
      </View>
    </Field>
    <Field label={tr("Hours")}><Hours start={start} end={end} setStart={setStart} setEnd={setEnd} /></Field>
    <Field label={tr("Repeat")}>
      <Segmented label={tr("Repeat")} value={dated ? "dated" : "always"} onChange={v => setDated(v === "dated")} options={[{ id: "always", label: tr("For good") }, { id: "dated", label: tr("Between two dates") }]} />
      {dated ? <View className="flex-row gap-2">
        <Field label={tr("Starting")} className="flex-1"><DateField value={from} min={today} onChange={setFrom} label={tr("Starting")} /></Field>
        <Field label={tr("Until")} className="flex-1"><DateField value={until} min={from || today} onChange={setUntil} label={tr("Until")} /></Field>
      </View> : null}
    </Field>
    <View className="flex-row items-center gap-2">
      {rule ? <Button variant="ghost" className="mr-auto" disabled={pending}
        onPress={async () => (await ask({ title: tr("Remove these weekly hours?"), text: tr("Their free slots close; sessions already booked stay."), action: tr("Remove") })) && remove()}>
        <Icon as={Trash2} size={16} /><Text>{tr("Remove")}</Text>
      </Button> : <Button variant="ghost" className="mr-auto" onPress={back}><Icon as={ChevronLeft} size={16} /><Text>{tr("Back")}</Text></Button>}
      <Button disabled={!days.length || pending} onPress={() => save({ days, start, end, from: (dated && from) || null, until: (dated && until) || null })} testID="rule-save">
        <Text>{pending ? tr("Saving…") : rule ? tr("Save") : tr("Add")}</Text>
      </Button>
    </View>
  </View>;
}

/** A date picked on the month, in a sheet of its own. */
function DateField({ value, min, onChange, label }: { value: string; min: string; onChange: (day: string) => void; label: string }) {
  const [open, setOpen] = useState(false), [month, setMonth] = useState((value || min).slice(0, 7));
  return <>
    <Button variant="outline" className="h-11 justify-start" accessibilityLabel={label} onPress={() => setOpen(true)}>
      <Text className={cn("tabular-nums", !value && "text-muted-foreground")}>{value ? shortDay.format(toDate(value)) : tr("Pick a date")}</Text>
    </Button>
    <Sheet open={open} onClose={() => setOpen(false)} title={label}>
      <MonthHeader month={month} today={min} onMonth={setMonth} />
      <Month month={month} today={min} className="h-80 flex-none" selected={d => d === value} pick={d => { onChange(d); setOpen(false); }} cell={() => ({})} />
    </Sheet>
  </>;
}

/** One day: its hours, the weekly hours and exceptions that make them, its sessions; then to open or cancel it. */
function DayView({ day, saved, off, sessions, pending, commit, go }: { day: string; saved: Availability; off: Set<string>; sessions: Booking[]; pending: boolean; commit: (change: Partial<Availability>) => Promise<boolean>; go: (kind: Picking) => void }) {
  const hours = hoursOn(day, saved.rules, saved.changes, off), dayOff = off.has(day), weekly = saved.rules.filter(r => inForce(r, day)),
    own = saved.changes.map((c, i) => [c, i] as const).filter(([c]) => c.date === day), slots = hours.reduce((n, [s, e]) => n + Math.floor((e - s) / saved.minutes), 0);
  return <View className="gap-4" testID="day-panel">
    <Head title={longDay.format(toDate(day))}>{dayOff ? tr("Day off: no one can book you.") : hours.length ? `${hours.map(rangeText).join(", ")} · ${plural(slots, "slot")}` : tr("Closed: no hours this day.")}</Head>
    <View className="gap-1.5">
      <Label>{tr("Weekly hours")}</Label>
      {!weekly.length ? <Empty icon={Repeat} className="flex-none p-2">{tr("None this day.")}</Empty>
        : weekly.map((r, i) => <View key={i} className="flex-row items-center gap-2"><Icon as={Repeat} size={14} className="text-muted-foreground" /><Numeric>{rangeText([r.start, r.end])}</Numeric></View>)}
    </View>
    {dayOff || own.length ? <View className="gap-1">
      <Label>{tr("Only this day")}</Label>
      {dayOff ? <View className="flex-row items-center gap-2">
        <Icon as={CalendarOff} size={14} className="text-warning" />
        <Text className="flex-1">{tr("Day off")}</Text>
        <Button variant="ghost" size="sm" className="h-10" disabled={pending} onPress={() => commit({ off: saved.off.filter(d => d !== day) })}><Text>{tr("Reopen")}</Text></Button>
      </View> : null}
      {own.map(([c, i]) => <View key={i} className="flex-row items-center gap-2">
        <Badge variant={c.open ? "outline" : "warning"} className="w-14"><Text>{c.open ? tr("Extra") : tr("Away")}</Text></Badge>
        <Numeric className="flex-1">{rangeText([c.start, c.end])}</Numeric>
        <Button variant="ghost" size="icon" className="size-10" accessibilityLabel={tr("Remove")} disabled={pending}
          onPress={async () => (await ask({ title: c.open ? tr("Remove these extra hours?") : tr("Remove this time off?"), action: tr("Remove") })) && commit({ changes: saved.changes.filter((_, j) => j !== i) })}>
          <Icon as={Trash2} size={16} />
        </Button>
      </View>)}
    </View> : null}
    {sessions.length ? <View className="gap-1.5">
      <Label>{tr("Sessions")}</Label>
      {sessions.map(b => <View key={b.id} className="flex-row items-center gap-2"><Numeric>{time(b.startsAt)}</Numeric><Text numberOfLines={1} className="text-muted-foreground">{tr("with {0}", { 0: b.with.username })}</Text></View>)}
    </View> : null}
    <View className="flex-row gap-2">
      <Button variant="outline" className="h-11 flex-1" onPress={() => go("close")} disabled={dayOff}><Icon as={CalendarX} size={16} /><Text>{tr("Cancel hours")}</Text></Button>
      <Button variant="outline" className="h-11 flex-1" onPress={() => go("open")}><Icon as={CalendarPlus} size={16} /><Text>{tr("Add hours")}</Text></Button>
    </View>
  </View>;
}

/** The picked days, opened for some hours or cancelled: the whole day off, or a few hours away. */
function DaysForm({ kind, days, saved, off, booked, pending, apply }: { kind: Picking; days: string[]; saved: Availability; off: Set<string>; booked: number; pending: boolean; apply: (start: number, end: number, wholeDay: boolean) => void }) {
  const [start, setStart] = useState(18 * 60), [end, setEnd] = useState(20 * 60), [wholeDay, setWholeDay] = useState(true);
  const one = days.length === 1 ? days[0]! : null, hours = one ? hoursOn(one, saved.rules, saved.changes, off) : [];
  return <View className="gap-4" testID="days-form">
    <Head title={kind === "open" ? tr("Add a date") : tr("Cancel a date")}>{daysText(days)}{one ? ` · ${off.has(one) ? tr("day off") : hours.length ? hours.map(rangeText).join(", ") : tr("closed")}` : ""}</Head>
    {kind === "close" ? <Segmented label={tr("What to cancel")} value={wholeDay ? "day" : "hours"} onChange={v => setWholeDay(v === "day")} options={[{ id: "day", label: tr("Whole day") }, { id: "hours", label: tr("Some hours") }]} /> : null}
    {kind === "open" || !wholeDay ? <Field label={kind === "open" ? tr("Open") : tr("Away")}><Hours start={start} end={end} setStart={setStart} setEnd={setEnd} /></Field> : null}
    {kind === "close" && booked ? <Alert variant="warning" icon={TriangleAlert}>{tr("{0} already booked stay booked: cancel them from Sessions if you need to.", { 0: plural(booked, "session") })}</Alert> : null}
    <Button className="h-11" disabled={pending} onPress={() => apply(start, end, kind === "close" && wholeDay)} testID="days-apply">
      <Text>{pending ? tr("Saving…") : kind === "open" ? tr("Add hours") : wholeDay ? (days.length > 1 ? tr("Take these days off") : tr("Take the day off")) : tr("Take these hours off")}</Text>
    </Button>
  </View>;
}

/** From one time to a later one, half hour by half hour. */
function Hours({ start, end, setStart, setEnd }: { start: number; end: number; setStart: (minutes: number) => void; setEnd: (minutes: number) => void }) {
  const options = (list: number[]) => list.map(t => ({ id: String(t), label: clockTime(t) }));
  return <View className="flex-row items-center gap-2">
    <View className="flex-1"><ChoiceButton label={tr("From")} value={String(start)} className="w-full justify-between" options={options(TIMES.filter(t => t < 1440))}
      onChange={v => { setStart(Number(v)); setEnd(Math.max(end, Number(v) + 30)); }} /></View>
    <Text className="text-muted-foreground">–</Text>
    <View className="flex-1"><ChoiceButton label={tr("To")} value={String(end)} className="w-full justify-between" options={options(TIMES.filter(t => t > start))} onChange={v => setEnd(Number(v))} /></View>
  </View>;
}
