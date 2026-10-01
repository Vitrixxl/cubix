/** The coach's side: the dashboard with the weeks ahead, the students, the weekly schedule and the public profile. */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Avatar, NUMERIC, Tip, plural, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching, euros, price, type Opening } from "./client";
import { Chat } from "./chat";
import { SessionRow, useMinute } from "./sessions";
import { CalendarGrid } from "./calendar";
import { Count, EventPicker, Figures, Nothing, PANEL, PANEL_HEAD, RowLink, RowsSkeleton, Stars, clockTime, day, span, time, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function useDashboard() {
  useEffect(() => {
    void coaching.load("dashboard");
  }, []);
  return coaching.dashboard;
}
const WEEK_NAMES = ["This week", "Next week", "In 2 weeks", "In 3 weeks"];

/** What is coming: the figures of the weeks ahead, each week's load against its free slots, and the next sessions. */
export function Dashboard() {
  const d = useDashboard(),
    now = useMinute();
  if (!d)
    return (
      <div className={cn(PANEL, "flex-1")} aria-busy="true" aria-label="Loading">
        <Skeleton className="m-4 h-14" />
        <div className="flex flex-1 gap-4 p-4">
          <Skeleton className="h-full w-72" />
          <Skeleton className="h-full flex-1" />
        </div>
      </div>
    );
  const c = d.coach,
    week = d.weeks[0]!,
    month = d.weeks.reduce((sum, w) => sum + w.incomeCents, 0),
    most = Math.max(1, ...d.weeks.map((w) => w.sessions + w.openSlots));
  const todo = [
    !c.windows?.length && ["Add your weekly hours so players can book you.", "schedule", "Set my hours"],
    !c.headline && ["Introduce yourself on your public page.", "profile", "Edit my profile"],
    !c.accepting && ["Your bookings are paused.", "profile", "Open bookings"],
  ].filter(Boolean) as [string, string, string][];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {todo.map(([text, view, action]) => (
        <div key={view + text} className="flex shrink-0 items-center gap-3 rounded-xl border border-warning/40 bg-warning/8 px-4 py-2.5 text-sm" data-slot="todo">
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          <span className="flex-1">{text}</span>
          <UiButton size="sm" variant="outline" onClick={() => go(url(view))}>
            {action}
          </UiButton>
        </div>
      ))}
      <section aria-label="Dashboard" className={cn(PANEL, "flex-1")}>
        <Figures
          items={[
            ["Sessions · 7 days", week.sessions],
            ["Booked · 7 days", `${(week.minutes / 60).toLocaleString("en-US", { maximumFractionDigits: 1 })} h`],
            ["Expected · 4 weeks", euros(month), "text-primary"],
            ["Free slots · 7 days", week.openSlots],
            ["Students", d.students.length],
            ["Rating", c.rating == null ? "–" : c.rating.toFixed(1), "text-warning"],
          ]}
        />
        <div className="flex min-h-0 flex-1 max-lg:flex-col">
          <div className="flex shrink-0 flex-col lg:w-80 lg:border-r max-lg:border-b" aria-label="Forecast">
            <h3 className={PANEL_HEAD}>Forecast</h3>
            <ul className="flex flex-col">
              {d.weeks.map((w, i) => (
                <li key={w.from} className="flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0" data-week={i}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{WEEK_NAMES[i]}</span>
                    <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                      {day(w.from)} – {day(w.to - 1)}
                    </span>
                  </span>
                  <span className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className="bg-primary" style={{ width: `${(w.sessions / most) * 100}%` }} />
                    <span className="bg-primary/25" style={{ width: `${(w.openSlots / most) * 100}%` }} />
                  </span>
                  <span className={cn(NUMERIC, "flex justify-between text-xs text-muted-foreground")}>
                    <span>
                      <span className="font-medium text-foreground">{plural(w.sessions, "session")}</span> · {plural(w.openSlots, "free slot")}
                    </span>
                    <span className="text-foreground">{euros(w.incomeCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <h3 className={PANEL_HEAD}>
              Next sessions <span className={cn(NUMERIC, "text-muted-foreground")}>{d.upcoming.length}</span>
            </h3>
            {!d.upcoming.length ? (
              <Nothing>No session booked yet.</Nothing>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto" data-slot="upcoming">
                {d.upcoming.map((b) => (
                  <SessionRow key={b.id} b={b} now={now} compact />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** The students: the list, then one student's conversation beside their sessions and the coach's private notes. */
export function StudentsView({ id }: { id: string }) {
  const d = useDashboard(),
    phone = usePhone();
  useEffect(() => {
    void coaching.load("conversations");
    void coaching.load("bookings");
  }, []);
  const student = d?.students.find((st) => st.id === id),
    conversation = coaching.conversations?.find((c) => c.id === student?.conversationId);
  const showList = !phone || !id;
  return (
    <div className={cn(PANEL, "flex-1 flex-row")}>
      {showList && (
        <div className={cn("flex min-h-0 shrink-0 flex-col", phone ? "flex-1" : "w-72 border-r")}>
          {!d ? (
            <RowsSkeleton />
          ) : !d.students.length ? (
            <Nothing>Players who book you or write to you appear here.</Nothing>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto" data-slot="students">
              {d.students.map((st) => (
                <li key={st.id}>
                  <RowLink to={url("students/" + st.id)} active={st.id === id}>
                    <Avatar name={st.username} size={36} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{st.username}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {plural(st.done, "session")}
                        {st.nextAt ? ` · next ${span(st.nextAt)}` : ""}
                      </span>
                    </span>
                    <Count n={st.unread} />
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(!phone || id) &&
        (student ? (
          <div className="flex min-h-0 min-w-0 flex-1 max-xl:flex-col">
            {conversation ? <Chat conversation={conversation} back={phone ? url("students") : undefined} /> : <div className="flex-1" />}
            <StudentSide key={student.id} id={student.id} />
          </div>
        ) : d && id ? (
          <Nothing>This student is not among yours.</Nothing>
        ) : (
          <Nothing className="max-md:hidden">{d?.students.length ? "Pick a student." : ""}</Nothing>
        ))}
    </div>
  );
}

/** One student beside the conversation: their figures, the coach's notes and every session together. */
function StudentSide({ id }: { id: string }) {
  const st = coaching.dashboard!.students.find((s) => s.id === id)!,
    [note, setNote] = useState(st.note),
    [saving, setSaving] = useState(false);
  const sessions = (coaching.bookings ?? []).filter((b) => b.role === "coach" && b.studentId === id);
  async function save() {
    if (note === st.note) return;
    setSaving(true);
    try {
      await coaching.saveNote(st.conversationId, note);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside className="flex min-h-0 shrink-0 flex-col border-l xl:w-80 max-xl:max-h-[45%] max-xl:border-t max-xl:border-l-0" aria-label={st.username} data-slot="student">
      <div className="grid shrink-0 grid-cols-3 border-b">
        {(
          [
            ["Done", st.done],
            ["Coming", st.upcoming],
            ["Their rating", st.rating == null ? "–" : <Stars rating={st.rating} size={11} figure={false} />],
          ] as const
        ).map(([label, value], i) => (
          <div key={label} className={cn("flex min-w-0 flex-col gap-1 px-3 py-2.5", i > 0 && "border-l")}>
            <span className="truncate text-xs text-muted-foreground">{label}</span>
            <span className={cn(NUMERIC, "truncate text-lg font-medium")}>{value}</span>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-2 border-b p-3">
          <label htmlFor="student-note" className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            Private notes
            <span className="font-normal">{saving ? "Saving…" : note !== st.note ? "Unsaved" : ""}</span>
          </label>
          <Textarea id="student-note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={save} maxLength={4000} rows={5} placeholder="Goals, weak points, homework…" className="resize-none" data-action="student:note" />
        </div>
        <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">Sessions</h3>
        {!sessions.length ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground">No session yet.</p>
        ) : (
          <ul className="flex flex-col pb-2">
            {sessions.map((b) => (
              <li key={b.id} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", b.status === "cancelled" && "text-muted-foreground line-through")}>
                <span className={NUMERIC}>{span(b.startsAt)}</span>
                {b.review && <Stars rating={b.review.rating} size={10} figure={false} className="ml-auto" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

const TIMES = Array.from({ length: 49 }, (_, i) => i * 30);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const zones = (() => {
  try {
    return (Intl as any).supportedValuesOf("timeZone") as string[];
  } catch {
    return ["UTC"];
  }
})();

/** The weekly hours on the coach's clock, the length of a session, and the days off. */
export function Schedule() {
  const coach = coaching.me?.coach;
  if (!coach?.windows)
    return (
      <div className={cn(PANEL, "flex-1 gap-3 p-4")} aria-busy="true" aria-label="Loading">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  return <ScheduleForm key={coach.id} />;
}
function ScheduleForm() {
  const coach = coaching.me!.coach!,
    phone = usePhone();
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [zone, setZone] = useState(coach.timezone === "UTC" && !coach.windows!.length ? here : coach.timezone),
    [minutes, setMinutes] = useState(coach.sessionMinutes),
    [windows, setWindows] = useState<Opening[]>(coach.windows!),
    [off, setOff] = useState<string[]>(coach.daysOff ?? []),
    [pending, setPending] = useState(false);
  const dirty =
    zone !== coach.timezone || minutes !== coach.sessionMinutes || JSON.stringify(windows) !== JSON.stringify(coach.windows) || JSON.stringify(off) !== JSON.stringify(coach.daysOff ?? []);
  const set = (i: number, change: Partial<Opening>) => setWindows((list) => list.map((w, j) => (j === i ? { ...w, ...change } : w)));
  function add(weekday: number) {
    const last = windows.filter((w) => w.weekday === weekday).sort((a, b) => b.end - a.end)[0];
    const start = last ? Math.min(last.end + 60, 1380) : 18 * 60;
    setWindows((list) => [...list, { weekday, start, end: Math.min(start + 180, 1440) }]);
  }
  async function save() {
    const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
    setPending(true);
    try {
      await coaching.saveAvailability({ timezone: zone, sessionMinutes: minutes, windows: sorted, daysOff: off });
      setWindows(sorted);
      toast.success("Schedule saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const lengths = (coaching.me?.lengths ?? [30, 45, 60, 90, 120]).map((m) => ({ value: String(m), label: `${m} min` }));
  const zoneItems = useMemo(() => zones.map((z) => ({ value: z, label: z.replaceAll("_", " ") })), []);
  return (
    <section aria-label="Schedule" className={cn(PANEL, "flex-1")}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <Select items={lengths} value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
          <SelectTrigger aria-label="Session length" data-action="schedule:length" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lengths.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={zoneItems} value={zone} onValueChange={(v) => setZone(String(v))}>
          <SelectTrigger aria-label="Time zone" data-action="schedule:zone" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zoneItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UiButton className="ml-auto" disabled={!dirty || pending} onClick={save} data-action="schedule:save">
          <Save />
          {pending ? "Saving…" : dirty ? "Save" : "Saved"}
        </UiButton>
      </div>
      <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto max-lg:overflow-visible" aria-label="Weekly hours">
          {DAYS.map((name, weekday) => {
            const list = windows.map((w, i) => [w, i] as const).filter(([w]) => w.weekday === weekday);
            return (
              <li key={name} className="flex min-h-14 items-start gap-3 border-b px-4 py-2.5 last:border-b-0" data-weekday={weekday}>
                <span className={cn("w-24 shrink-0 pt-1.5 font-medium", !list.length && "text-muted-foreground")}>{phone ? name.slice(0, 3) : name}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {!list.length && <span className="pt-1.5 text-muted-foreground">Unavailable</span>}
                  {list.map(([w, i]) => (
                    <div key={i} className="flex items-center gap-1.5" data-window={i}>
                      <TimeSelect value={w.start} options={TIMES.filter((t) => t < 1440)} onChange={(start) => set(i, { start, end: Math.max(w.end, start + 30) })} label="From" />
                      <span className="text-muted-foreground">–</span>
                      <TimeSelect value={w.end} options={TIMES.filter((t) => t > w.start)} onChange={(end) => set(i, { end })} label="To" />
                      <Tip content="Remove">
                        <UiButton variant="ghost" size="icon-sm" aria-label="Remove these hours" onClick={() => setWindows((l) => l.filter((_, j) => j !== i))}>
                          <Trash2 />
                        </UiButton>
                      </Tip>
                      <span className={cn(NUMERIC, "text-xs text-muted-foreground max-sm:hidden")}>{plural(Math.floor((w.end - w.start) / minutes), "slot")}</span>
                    </div>
                  ))}
                </div>
                <Tip content={"Add hours on " + name}>
                  <UiButton variant="outline" size="icon-sm" aria-label={"Add hours on " + name} onClick={() => add(weekday)} data-action={"schedule:add:" + weekday}>
                    <Plus />
                  </UiButton>
                </Tip>
              </li>
            );
          })}
        </ul>
        <div className="flex shrink-0 flex-col gap-2 p-4 lg:w-80 lg:border-l max-lg:border-t" aria-label="Days off">
          <span className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-muted-foreground" />
            Days off
            <span className={cn(NUMERIC, "ml-auto text-xs font-normal text-muted-foreground")}>{off.length || ""}</span>
          </span>
          <CalendarGrid
            weeks={6}
            marked={(key) => (off.includes(key) ? "off" : "none")}
            selected={new Set(off)}
            onPick={(key) => setOff((list) => (list.includes(key) ? list.filter((d) => d !== key) : [...list, key].sort()))}
          />
        </div>
      </div>
    </section>
  );
}
function TimeSelect({ value, options, onChange, label }: { value: number; options: number[]; onChange: (minutes: number) => void; label: string }) {
  const items = options.map((t) => ({ value: String(t), label: clockTime(t) }));
  return (
    <Select items={items} value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-label={label} size="sm" className={cn(NUMERIC, "w-24")}>
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

/** What players see of the coach: a line, a few paragraphs, the events, the languages, the price and whether they book. */
export function CoachProfile() {
  const coach = coaching.me?.coach;
  if (!coach)
    return (
      <div className={cn(PANEL, "mx-auto w-full max-w-2xl gap-4 p-6")} aria-busy="true" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-32" />
        <Skeleton className="h-10" />
      </div>
    );
  return <ProfileForm key={coach.id} />;
}
function ProfileForm() {
  const coach = coaching.me!.coach!;
  const [headline, setHeadline] = useState(coach.headline),
    [bio, setBio] = useState(coach.bio),
    [events, setEvents] = useState(coach.events),
    [languages, setLanguages] = useState(coach.languages.join(", ")),
    [euros, setEuros] = useState(coach.priceCents ? String(coach.priceCents / 100) : ""),
    [accepting, setAccepting] = useState(coach.accepting),
    [pending, setPending] = useState(false);
  const cents = Math.round(Number(euros.replace(",", ".") || 0) * 100);
  const valid = Number.isFinite(cents) && cents >= 0 && cents <= 100_000;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    try {
      await coaching.saveProfile({
        headline: headline.trim(),
        bio: bio.trim(),
        events,
        languages: languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 10),
        priceCents: cents,
        accepting,
      });
      toast.success("Profile saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={save} className={cn(PANEL, "mx-auto w-full max-w-3xl")} data-slot="coach-profile">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <Field>
          <FieldLabel>Bookings</FieldLabel>
          <ToggleGroup variant="outline" spacing={0} value={[accepting ? "open" : "paused"]} onValueChange={(v: string[]) => v[0] && setAccepting(v[0] === "open")} aria-label="Bookings">
            <ToggleGroupItem value="open" data-action="profile:open" className="px-4">
              Open
            </ToggleGroupItem>
            <ToggleGroupItem value="paused" data-action="profile:paused" className="px-4">
              Paused
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="coach-headline">Headline</FieldLabel>
          <Input id="coach-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} placeholder="Sub-10 CFOP coach, F2L and lookahead" />
        </Field>
        <Field>
          <FieldLabel htmlFor="coach-bio">About you</FieldLabel>
          <Textarea id="coach-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={6} className="resize-none" placeholder="Your results, how a session goes, who you help best…" />
        </Field>
        <Field>
          <FieldLabel>Events</FieldLabel>
          <EventPicker value={events} onChange={setEvents} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="coach-languages">Languages</FieldLabel>
            <Input id="coach-languages" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English, French" />
          </Field>
          <Field data-invalid={!valid || undefined}>
            <FieldLabel htmlFor="coach-price">Price per session</FieldLabel>
            <InputGroup>
              <InputGroupInput id="coach-price" inputMode="decimal" value={euros} onChange={(e) => setEuros(e.target.value)} placeholder="0" className={NUMERIC} aria-invalid={!valid || undefined} />
              <InputGroupAddon align="inline-end">€ · {coach.sessionMinutes} min</InputGroupAddon>
            </InputGroup>
            <FieldDescription>{cents ? price(cents) : "Free"} · payment comes later</FieldDescription>
          </Field>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 border-t p-4">
        <UiButton type="button" variant="outline" onClick={() => go(url("coach/" + coach.id))} data-action="profile:preview">
          <ExternalLink />
          Public page
        </UiButton>
        <UiButton type="submit" className="flex-1" disabled={!valid || pending} data-action="profile:save">
          <Save />
          {pending ? "Saving…" : "Save"}
        </UiButton>
      </div>
    </form>
  );
}
