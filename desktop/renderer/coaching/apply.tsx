/** Asking to become a coach: an e-mail address to be answered on, the events taught and a few words; then its status. */
import { useState } from "react";
import { Clock, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { coaching } from "./client";
import { EventPicker, PANEL, day } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export function Apply() {
  const me = coaching.me,
    application = me?.application;
  const [again, setAgain] = useState(false);
  if (!me)
    return (
      <div className={cn(PANEL, "mx-auto w-full max-w-xl gap-4 p-6")} aria-busy="true" aria-label="Loading">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
      </div>
    );
  if (application?.status === "pending" || (application?.status === "rejected" && !again))
    return (
      <div className={cn(PANEL, "mx-auto w-full max-w-xl items-center gap-3 p-8 text-center")} data-slot="application" data-status={application.status}>
        <span className={cn("flex size-12 items-center justify-center rounded-xl", application.status === "pending" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
          {application.status === "pending" ? <Clock className="size-6" /> : <XCircle className="size-6" />}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{application.status === "pending" ? "Your application is being reviewed" : "Your application was not accepted"}</h2>
        <p className="text-muted-foreground">
          {application.status === "pending"
            ? `Sent on ${day(application.createdAt)}. We will write to ${application.email}.`
            : `Answered on ${day(application.decidedAt ?? application.createdAt)}. You can apply again.`}
        </p>
        {application.status === "rejected" && (
          <UiButton variant="outline" onClick={() => setAgain(true)} data-action="coaching:apply:again">
            Apply again
          </UiButton>
        )}
      </div>
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
      toast.success("Application sent");
    } catch (reason) {
      setError({ field: "form", text: (reason as Error).message });
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className={cn(PANEL, "mx-auto w-full max-w-2xl")} data-slot="apply">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Become a coach</h2>
          <p className="text-muted-foreground">The team reads every application and answers by e-mail.</p>
        </div>
        <Field data-invalid={error?.field === "email" || undefined}>
          <FieldLabel htmlFor="apply-email">E-mail address</FieldLabel>
          <Input id="apply-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={error?.field === "email" || undefined} data-action="apply:email" />
          {error?.field === "email" && <FieldError>{error.text}</FieldError>}
        </Field>
        <Field>
          <FieldLabel>Events you would coach</FieldLabel>
          <EventPicker value={events} onChange={setEvents} />
        </Field>
        <Field>
          <FieldLabel htmlFor="apply-experience">Your level</FieldLabel>
          <Input id="apply-experience" value={experience} onChange={(e) => setExperience(e.target.value)} maxLength={1000} placeholder="Averages, competitions, WCA ID…" data-action="apply:experience" />
        </Field>
        <Field data-invalid={error?.field === "message" || undefined}>
          <FieldLabel htmlFor="apply-message">How would you coach?</FieldLabel>
          <Textarea id="apply-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} className="resize-none" aria-invalid={error?.field === "message" || undefined} data-action="apply:message" />
          {error?.field === "message" && <FieldError>{error.text}</FieldError>}
        </Field>
        {error?.field === "form" && <p className="text-sm text-destructive">{error.text}</p>}
      </div>
      <div className="shrink-0 border-t p-4">
        <UiButton type="submit" size="lg" className="h-10 w-full" disabled={pending} data-action="coaching:apply:send">
          <Send />
          {pending ? "Sending…" : "Send my application"}
        </UiButton>
      </div>
    </form>
  );
}
