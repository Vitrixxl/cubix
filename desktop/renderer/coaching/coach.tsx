/** The coach's side: the dashboard with the weeks ahead, the students, the weekly schedule and the public profile. */
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ExternalLink, ImageUp, Save, UserRoundX, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Modal, NUMERIC, plural, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching, euros, price, type Booking } from "./client";
import { Chat } from "./chat";
import { SessionDays, useMinute } from "./sessions";
import { PersonDialog, SessionCard } from "./person";
import { CoachRow } from "./browse";
import { day, span, url } from "./parts";
import { Bar, Empty, EventPicker, LINK, ListSkeleton, Segmented, StateMark, Surface } from "../base";
import { ChatPanel, ConversationList, ConversationRow, LIST } from "../chat";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { tr, locale } from "../../../src/client/i18n";
import { ask } from "../confirm";
import { said } from "../base";
import { msg } from "../../../src/client/i18n/msg";

function useDashboard() {
  useEffect(() => {
    void coaching.load("dashboard");
  }, []);
  return coaching.dashboard;
}
const WEEK_NAMES = ["This week", "Next week", "In 2 weeks", "In 3 weeks"];

/** What is coming: what is left to set up, the figures of the weeks ahead, each week's sessions against its free slots, and the next sessions. */
export function Dashboard() {
  const d = useDashboard(),
    now = useMinute(),
    phone = usePhone(),
    [shown, setShown] = useState<Booking | null>(null),
    [person, setPerson] = useState<Booking | null>(null);
  if (!d)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4" aria-busy="true" aria-label={tr("Loading")}>
        <Skeleton className="h-24 shrink-0 rounded-[24px]" />
        <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col">
          <Skeleton className="rounded-[24px] lg:w-96" />
          <Skeleton className="flex-1 rounded-[24px]" />
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
  const figures: [React.ReactNode, string][] = [
    [week.sessions, msg("sessions in the next 7 days")],
    [`${(week.minutes / 60).toLocaleString(locale(), { maximumFractionDigits: 1 })} h`, msg("booked in the next 7 days")],
    [euros(month), msg("expected over 4 weeks")],
    [week.openSlots, msg("free slots in the next 7 days")],
    [d.students.length, msg("students")],
    [c.rating == null ? "–" : c.rating.toFixed(1), plural(c.reviews, "review")],
  ];
  return (
    <section aria-label={tr("Dashboard")} className="flex min-h-0 flex-1 flex-col gap-4 max-lg:overflow-y-auto">
      {todo.length > 0 && (
        <div className="grid shrink-0 gap-3 md:grid-cols-3">
          {todo.map(([text, view, action]) => (
            <div key={view + text} className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-3" data-slot="todo">
              <StateMark tone="accent" className="min-w-0 flex-1 whitespace-normal">
                {said(text)}
              </StateMark>
              <UiButton onClick={() => go(url(view))}>
                {said(action)}
              </UiButton>
            </div>
          ))}
        </div>
      )}
      <Surface className="shrink-0 px-6 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
          {figures.map(([value, label]) => (
            <div key={label} className="flex flex-col">
              <dd className={cn(NUMERIC, "order-first text-3xl font-extrabold tracking-[-0.03em] max-md:text-2xl")}>{value}</dd>
              <dt className="text-xs text-muted-foreground">{said(label)}</dt>
            </div>
          ))}
        </dl>
      </Surface>
      <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col-reverse max-lg:flex-none">
        <Surface className="shrink-0 gap-4 px-6 py-5 lg:w-96" aria-label={tr("Forecast")}>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-extrabold">{tr("The next four weeks")}</h2>
            {/* The bars' two colours said once, so nothing needs guessing. */}
            <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-[3px] bg-primary" aria-hidden="true" />
                {tr("sessions booked")}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-[3px] bg-primary/35" aria-hidden="true" />
                {tr("free slots left")}
              </span>
            </span>
          </div>
          <ul className="flex flex-col gap-5">
            {d.weeks.map((w, i) => (
              <li key={w.from} className="flex flex-col gap-1.5" data-week={i}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{said(WEEK_NAMES[i])}</span>
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                    {day(w.from)} – {day(w.to - 1)}
                  </span>
                </span>
                <Bar ratio={w.sessions / most} behind={(w.sessions + w.openSlots) / most} className="h-2" label="Forecast" text={`${plural(w.sessions, "session")} · ${plural(w.openSlots, "free slot")}`} />
                <span className={cn(NUMERIC, "flex justify-between text-xs text-muted-foreground")}>
                  <span>
                    <span className="font-bold text-foreground">{plural(w.sessions, "session")}</span> · {plural(w.openSlots, "free slot")}
                  </span>
                  <span className="font-bold text-foreground">{euros(w.incomeCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Surface>
        <Surface className="min-w-0 flex-1 px-2.5 pt-4 pb-2.5 max-lg:flex-none">
          <div className="flex shrink-0 items-baseline gap-2 px-3 pb-1">
            <h2 className="text-base font-extrabold">{tr("Next sessions")}</h2>
            <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{d.upcoming.length || ""}</span>
            <button type="button" className={cn(LINK, "ml-auto")} onClick={() => go(url("schedule"))}>
              {tr("Schedule")}
            </button>
          </div>
          {!d.upcoming.length ? (
            <Empty icon={CalendarDays}>{tr("No session booked yet.")}</Empty>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col" data-slot="upcoming">
              <SessionDays list={d.upcoming} now={now} onPick={setShown} />
            </div>
          )}
        </Surface>
      </div>
      <Modal open={!!shown} onOpenChange={(open) => !open && setShown(null)} title={shown ? shown.with.username : tr("Session")} hideHeader className={phone ? undefined : "sm:max-w-lg"}>
        {shown && <SessionCard b={shown} onProfile={() => setPerson(shown)} />}
      </Modal>
      {person && <PersonDialog id={person.with.id} name={person.with.username} open onOpenChange={(open) => !open && setPerson(null)} />}
    </section>
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
  // On a wide window the first student opens when none is chosen; a phone shows the list first.
  useEffect(() => {
    if (!phone && !id && d?.students.length) go(url("students/" + d.students[0]!.id), true);
  }, [id, d?.students.length, phone]);
  const student = d?.students.find((st) => st.id === id),
    conversation = coaching.conversations?.find((c) => c.id === student?.conversationId);
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {(!phone || !id) && (
        <ConversationList>
          {!d ? (
            <ListSkeleton />
          ) : !d.students.length ? (
            <Empty icon={Users}>{tr("Players who book you or write to you appear here.")}</Empty>
          ) : (
            <ul className={LIST} data-slot="students">
              {d.students.map((st) => (
                <li key={st.id}>
                  <ConversationRow
                    to={url("students/" + st.id)}
                    active={st.id === id}
                    face={<Avatar name={st.username} src={st.avatar} size={40} />}
                    name={st.username}
                    preview={plural(st.done, "session") + (st.nextAt ? tr(" · next {0}", { 0: span(st.nextAt) }) : "")}
                    unread={st.unread}
                  />
                </li>
              ))}
            </ul>
          )}
        </ConversationList>
      )}
      {(!phone || !!id) && (
        <ChatPanel>
          {student && conversation ? (
            <Chat conversation={conversation} back={phone ? url("students") : undefined} />
          ) : student ? null : (
            <Empty icon={d && id ? UserRoundX : Users} title={d && id ? "This student is not among yours." : d?.students.length ? "Pick a student." : undefined} />
          )}
        </ChatPanel>
      )}
    </div>
  );
}

/** What players see of the coach: a line, a few paragraphs, the events, the languages, the price and whether they book. */
export function CoachProfile() {
  const coach = coaching.me?.coach;
  if (!coach)
    return (
      <Surface className="mx-auto w-full max-w-3xl gap-5 p-6" aria-busy="true" aria-label={tr("Loading")}>
        <div className="flex items-center gap-4">
          <Skeleton className="size-18 rounded-full" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
        <Skeleton className="h-14" />
        <Skeleton className="h-36" />
      </Surface>
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
    <form onSubmit={save} className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]" data-slot="coach-profile">
      <Surface className="min-w-0">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 max-md:p-4">
        <Picture />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel>{tr("Bookings")}</FieldLabel>
            <div>
              <Segmented label="Bookings" value={accepting ? "open" : "paused"} onChange={(v) => setAccepting(v === "open")} action="profile:" className="w-fit bg-muted" options={[{ id: "open", label: "Open" }, { id: "paused", label: "Paused" }]} />
            </div>
          </Field>
          <Field>
            <FieldLabel>{tr("New students")}</FieldLabel>
            <div>
              <Segmented label="New students" value={newStudents ? "newcomers" : "regulars"} onChange={(v) => setNewStudents(v === "newcomers")} action="profile:" className="w-fit bg-muted" options={[{ id: "newcomers", label: "Welcome" }, { id: "regulars", label: "My students only" }]} />
            </div>
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
          <EventPicker multiple value={events} onChange={setEvents} />
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
      <div className="flex shrink-0 gap-2 px-6 pt-2 pb-6 max-md:px-4 max-md:pb-4">
        <UiButton type="button" variant="outline" onClick={() => go(url("coach/" + coach.id))} data-action="profile:preview">
          <ExternalLink />
          {tr("Public page")}
        </UiButton>
        <UiButton type="submit" className="flex-1" disabled={!valid || pending} data-action="profile:save">
          <Save />
          {pending ? tr("Saving…") : tr("Save")}
        </UiButton>
      </div>
      </Surface>
      {/* What players will see in the list of coaches, as it is typed. */}
      <Surface className="gap-3 self-start px-2.5 pt-4 pb-2.5 max-lg:hidden" aria-label={tr("How players see you")}>
        <h2 className="px-3 text-xs font-bold text-muted-foreground">{tr("How players see you in the list")}</h2>
        <CoachRow c={{ ...coach, headline: headline.trim(), events, languages: languages.split(",").map((l) => l.trim()).filter(Boolean), priceCents: valid ? cents : coach.priceCents, newStudents }} />
        <p className="px-3 pb-1 text-xs text-muted-foreground">{accepting ? tr("Bookings open.") : tr("Bookings paused: players see no slot.")}</p>
      </Surface>
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
            <UiButton type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()} data-action="profile:picture">
              <ImageUp />
              {coach.avatar ? tr("Change") : tr("Add a picture")}
            </UiButton>
            {coach.avatar && (
              <UiButton type="button" variant="ghost" disabled={pending} onClick={async () => (await ask({ title: tr("Remove your picture?"), action: tr("Remove") })) && set(null)}>
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
