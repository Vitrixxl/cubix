/** Asking to become a coach: an e-mail address to be answered on, the events taught and a few words; then its status. */
import { useState } from "react";
import { Clock, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { coaching } from "./client";
import { day } from "./parts";
import { Empty, EventPicker, Surface } from "../base";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button as UiButton } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

export function Apply() {
  const me = coaching.me,
    application = me?.application;
  const [again, setAgain] = useState(false);
  if (!me)
    return (
      <Surface className="mx-auto w-full max-w-2xl gap-5 p-6" aria-busy="true" aria-label={tr("Loading")}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9" />
          </div>
        ))}
        <Skeleton className="h-28" />
      </Surface>
    );
  if (application?.status === "pending" || (application?.status === "rejected" && !again))
    return (
      <Surface className="mx-auto w-full max-w-xl" data-slot="application" data-status={application.status}>
        <Empty
          icon={application.status === "pending" ? Clock : XCircle}
          title={application.status === "pending" ? "Your application is being reviewed" : "Your application was not accepted"}
          className="py-10"
        >
          <p>
            {application.status === "pending"
              ? tr("Sent on {0}. We will write to {1}.", { 0: day(application.createdAt), 1: application.email })
              : tr("Answered on {0}. You can apply again.", { 0: day(application.decidedAt ?? application.createdAt) })}
          </p>
          {application.status === "rejected" && (
            <UiButton variant="outline" onClick={() => setAgain(true)} data-action="coaching:apply:again">
              {tr("Apply again")}
            </UiButton>
          )}
        </Empty>
      </Surface>
    );
  return <Form />;
}

function Form() {
  const previous = coaching.me?.application;
  const [email, setEmail] = useState(previous?.email ?? ""),
    [events, setEvents] = useState<string[]>(previous?.events ?? []),
    [experience, setExperience] = useState(previous?.experience ?? ""),
    [message, setMessage] = useState(""),
    [error, setError] = useState<{ field: string; text: string } | null>(null),
    [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError({ field: "email", text: "Enter the e-mail address we can answer you on." });
    if (!message.trim()) return setError({ field: "message", text: "Tell us how you would coach." });
    setError(null);
    setPending(true);
    try {
      await coaching.apply({ email: email.trim(), events, experience: experience.trim(), message: message.trim() });
      toast.success(tr("Application sent"));
    } catch (reason) {
      setError({ field: "form", text: (reason as Error).message });
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="mx-auto flex min-h-0 w-full max-w-2xl flex-col" data-slot="apply">
      <Surface className="flex-1">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 max-md:p-4">
        <p className="text-muted-foreground">{tr("The team reads every application and answers by e-mail.")}</p>
        <Field data-invalid={error?.field === "email" || undefined}>
          <FieldLabel htmlFor="apply-email">{tr("E-mail address")}</FieldLabel>
          <Input id="apply-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("you@example.com")} aria-invalid={error?.field === "email" || undefined} data-action="apply:email" />
          {error?.field === "email" && <FieldError>{said(error.text)}</FieldError>}
        </Field>
        <Field>
          <FieldLabel>{tr("Events you would coach")}</FieldLabel>
          <EventPicker multiple value={events} onChange={setEvents} />
        </Field>
        <Field>
          <FieldLabel htmlFor="apply-experience">{tr("Your level")}</FieldLabel>
          <Input id="apply-experience" value={experience} onChange={(e) => setExperience(e.target.value)} maxLength={1000} placeholder={tr("Averages, competitions, WCA ID…")} data-action="apply:experience" />
        </Field>
        <Field data-invalid={error?.field === "message" || undefined}>
          <FieldLabel htmlFor="apply-message">{tr("How would you coach?")}</FieldLabel>
          <Textarea id="apply-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} className="resize-none" aria-invalid={error?.field === "message" || undefined} data-action="apply:message" />
          {error?.field === "message" && <FieldError>{said(error.text)}</FieldError>}
        </Field>
        {error?.field === "form" && (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">{said(error.text)}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="shrink-0 px-6 pt-2 pb-6 max-md:px-4 max-md:pb-4">
        <UiButton type="submit" className="w-full" disabled={pending} data-action="coaching:apply:send">
          <Send />
          {pending ? tr("Sending…") : tr("Send my application")}
        </UiButton>
      </div>
      </Surface>
    </form>
  );
}
