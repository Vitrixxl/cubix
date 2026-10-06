/** The coach's side: the dashboard with the weeks ahead, the students, the weekly schedule and the public profile. */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImageUp, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Avatar, NUMERIC, plural, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching, euros, price } from "./client";
import { Chat } from "./chat";
import { SessionRow, useMinute } from "./sessions";
import { Count, EventPicker, Figures, Nothing, PANEL, PANEL_HEAD, ROWS, RowLink, RowsSkeleton, day, span, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { tr, locale } from "../../../src/client/i18n";
import { said } from "../base";

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
      <div className="flex min-h-0 flex-1 flex-col gap-4" aria-busy="true" aria-label={tr("Loading")}>
        <Skeleton className="h-[4.5rem] rounded-xl" />
        <div className="flex flex-1 gap-4">
          <Skeleton className="h-full w-80 rounded-xl" />
          <Skeleton className="h-full flex-1 rounded-xl" />
        </div>
      </div>
    );
  const c = d.coach,
    week = d.weeks[0]!,
    month = d.weeks.reduce((sum, w) => sum + w.incomeCents, 0),
    most = Math.max(1, ...d.weeks.map((w) => w.sessions + w.openSlots));
  const todo = [
    !c.windows?.length && !c.overrides?.some((o) => o.open) && ["Add your hours so players can book you.", "schedule", "Set my hours"],
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
            {said(action)}
          </UiButton>
        </div>
      ))}
      <section aria-label={tr("Dashboard")} className="flex min-h-0 flex-1 flex-col gap-4">
        <Figures
          className="max-xl:grid-cols-3!"
          items={[
            ["Sessions · 7 days", week.sessions],
            ["Booked · 7 days", `${(week.minutes / 60).toLocaleString(locale(), { maximumFractionDigits: 1 })} h`],
            ["Expected · 4 weeks", euros(month), "text-primary"],
            ["Free slots · 7 days", week.openSlots],
            ["Students", d.students.length],
            ["Rating", c.rating == null ? "–" : c.rating.toFixed(1), "text-warning"],
          ]}
        />
        <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col">
          <div className={cn(PANEL, "shrink-0 lg:w-80")} aria-label={tr("Forecast")}>
            <h3 className={PANEL_HEAD}>{tr("Forecast")}</h3>
            <ul className="flex flex-col gap-4 px-4 pt-2 pb-4">
              {d.weeks.map((w, i) => (
                <li key={w.from} className="flex flex-col gap-1.5" data-week={i}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{said(WEEK_NAMES[i])}</span>
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
          <div className={cn(PANEL, "min-w-0 flex-1")}>
            <h3 className={PANEL_HEAD}>
              {tr("Next sessions")}{" "}<span className={cn(NUMERIC, "text-muted-foreground")}>{d.upcoming.length}</span>
            </h3>
            {!d.upcoming.length ? (
              <Nothing>{tr("No session booked yet.")}</Nothing>
            ) : (
              <ul className={cn(ROWS, "min-h-0 flex-1 overflow-y-auto")} data-slot="upcoming">
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

/** The students: the list, then one student's conversation, floating on the page; their name opens their file. */
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
    <div className="flex min-h-0 flex-1 gap-4">
      {showList && (
        <div className={cn(PANEL, "shrink-0", phone ? "flex-1" : "w-72")}>
          {!d ? (
            <RowsSkeleton />
          ) : !d.students.length ? (
            <Nothing>{tr("Players who book you or write to you appear here.")}</Nothing>
          ) : (
            <ul className={cn(ROWS, "min-h-0 flex-1 overflow-y-auto")} data-slot="students">
              {d.students.map((st) => (
                <li key={st.id}>
                  <RowLink to={url("students/" + st.id)} active={st.id === id}>
                    <Avatar name={st.username} src={st.avatar} size={36} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{st.username}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {plural(st.done, "session")}
                        {st.nextAt ? tr(" · next {0}", { 0: span(st.nextAt) }) : ""}
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col text-sm">{conversation ? <Chat conversation={conversation} back={phone ? url("students") : undefined} /> : <div className="flex-1" />}</div>
        ) : (
          <div className={cn(PANEL, "flex-1 max-md:hidden")}>
            {d && id ? <Nothing>{tr("This student is not among yours.")}</Nothing> : <Nothing>{d?.students.length ? tr("Pick a student.") : ""}</Nothing>}
          </div>
        ))}
    </div>
  );
}

/** What players see of the coach: a line, a few paragraphs, the events, the languages, the price and whether they book. */
export function CoachProfile() {
  const coach = coaching.me?.coach;
  if (!coach)
    return (
      <div className={cn(PANEL, "mx-auto w-full max-w-2xl gap-4 p-6")} aria-busy="true" aria-label={tr("Loading")}>
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
    [newStudents, setNewStudents] = useState(coach.newStudents),
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
        newStudents,
      });
      toast.success(tr("Profile saved"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={save} className={cn(PANEL, "mx-auto w-full max-w-3xl")} data-slot="coach-profile">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <Picture />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel>{tr("Bookings")}</FieldLabel>
            <ToggleGroup variant="outline" spacing={0} value={[accepting ? "open" : "paused"]} onValueChange={(v: string[]) => v[0] && setAccepting(v[0] === "open")} aria-label={tr("Bookings")}>
              <ToggleGroupItem value="open" data-action="profile:open" className="px-4">
                {tr("Open")}</ToggleGroupItem>
              <ToggleGroupItem value="paused" data-action="profile:paused" className="px-4">
                {tr("Paused")}</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel>{tr("New students")}</FieldLabel>
            <ToggleGroup variant="outline" spacing={0} value={[newStudents ? "open" : "closed"]} onValueChange={(v: string[]) => v[0] && setNewStudents(v[0] === "open")} aria-label={tr("New students")}>
              <ToggleGroupItem value="open" data-action="profile:newcomers" className="px-4">
                {tr("Welcome")}</ToggleGroupItem>
              <ToggleGroupItem value="closed" data-action="profile:regulars" className="px-4">
                {tr("My students only")}</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{newStudents ? tr("Anyone can book your free slots.") : tr("Only players you already coached see your slots.")}</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="coach-headline">{tr("Headline")}</FieldLabel>
          <Input id="coach-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} placeholder={tr("Sub-10 CFOP coach, F2L and lookahead")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="coach-bio">{tr("About you")}</FieldLabel>
          <Textarea id="coach-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={6} className="resize-none" placeholder={tr("Your results, how a session goes, who you help best…")} />
        </Field>
        <Field>
          <FieldLabel>{tr("Events")}</FieldLabel>
          <EventPicker value={events} onChange={setEvents} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="coach-languages">{tr("Languages")}</FieldLabel>
            <Input id="coach-languages" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder={tr("English, French")} />
          </Field>
          <Field data-invalid={!valid || undefined}>
            <FieldLabel htmlFor="coach-price">{tr("Price per session")}</FieldLabel>
            <InputGroup>
              <InputGroupInput id="coach-price" inputMode="decimal" value={euros} onChange={(e) => setEuros(e.target.value)} placeholder="0" className={NUMERIC} aria-invalid={!valid || undefined} />
              <InputGroupAddon align="inline-end">€ · {coach.sessionMinutes} {" "}{tr("min")}</InputGroupAddon>
            </InputGroup>
            <FieldDescription>{cents ? price(cents) : tr("Free")} {" "}{tr("· payment comes later")}</FieldDescription>
          </Field>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 p-4 pt-0">
        <UiButton type="button" variant="outline" onClick={() => go(url("coach/" + coach.id))} data-action="profile:preview">
          <ExternalLink />
          {tr("Public page")}</UiButton>
        <UiButton type="submit" className="flex-1" disabled={!valid || pending} data-action="profile:save">
          <Save />
          {pending ? tr("Saving…") : tr("Save")}
        </UiButton>
      </div>
    </form>
  );
}

/** The coach's picture, set at once: any image, cut to its middle square and made small before it is sent. */
function Picture() {
  const coach = coaching.me!.coach!,
    [pending, setPending] = useState(false),
    input = useRef<HTMLInputElement>(null);
  async function set(file: File | null) {
    setPending(true);
    try {
      await coaching.setAvatar(file && (await square(file)));
      toast.success(file ? tr("Picture saved") : tr("Picture removed"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Field>
      <FieldLabel>{tr("Picture")}</FieldLabel>
      <div className="flex items-center gap-4">
        <Avatar name={coach.username} src={coach.avatar} size={72} />
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void set(file);
          }}
          data-action="profile:picture-file"
        />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <UiButton type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()} data-action="profile:picture">
              <ImageUp />
              {coach.avatar ? tr("Change") : tr("Add a picture")}
            </UiButton>
            {coach.avatar && (
              <UiButton type="button" variant="ghost" size="sm" disabled={pending} onClick={() => set(null)}>
                {tr("Remove")}</UiButton>
            )}
          </div>
          <FieldDescription>{tr("Players see it beside your name. A face works best.")}</FieldDescription>
        </div>
      </div>
    </Field>
  );
}
/** The middle square of a picture, 256 pixels wide. */
async function square(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This file is not a picture the browser can read.");
  });
  const side = Math.min(bitmap.width, bitmap.height),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be prepared."))), "image/webp", 0.88));
}
