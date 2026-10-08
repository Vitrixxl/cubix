import { Clock, Send, XCircle } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useColors } from "../../theme";
import { Empty, Surface } from "../layout";
import { coaching, useCoaching } from "./client";
import { EventPicker, Field, day, useAction } from "./parts";
import { tr } from "../../../../src/client/i18n";

/** Asking to become a coach (the web's coaching/apply.tsx): an e-mail address to be answered on, the events taught and a few words; then its status. */
export function Apply() {
  const me = useCoaching().me, application = me?.application;
  const [again, setAgain] = useState(false);
  if (!me) return <View accessibilityLabel={tr("Loading")} className="gap-5">
    <View className="gap-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-72" /></View>
    {[0, 1, 2].map(i => <View key={i} className="gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-11" /></View>)}
    <Skeleton className="h-28" />
  </View>;
  if (application?.status === "pending" || (application?.status === "rejected" && !again))
    return <Surface className="flex-1" testID={"application-" + application.status}>
      <Empty icon={application.status === "pending" ? Clock : XCircle} title={application.status === "pending" ? tr("Your application is being reviewed") : tr("Your application was not accepted")}>
        {application.status === "pending" ? tr("Sent on {0}. We will write to {1}.", { 0: day(application.createdAt), 1: application.email })
          : tr("Answered on {0}. You can apply again.", { 0: day(application.decidedAt ?? application.createdAt) })}
        {application.status === "rejected" ? <Button variant="outline" onPress={() => setAgain(true)}><Text>{tr("Apply again")}</Text></Button> : null}
      </Empty>
    </Surface>;
  return <Form />;
}

function Form() {
  const previous = coaching.me?.application, colors = useColors();
  const [email, setEmail] = useState(previous?.email ?? ""), [events, setEvents] = useState<string[]>(previous?.events ?? []),
    [experience, setExperience] = useState(previous?.experience ?? ""), [message, setMessage] = useState(""),
    [error, setError] = useState<{ field: string; text: string } | null>(null);
  const { toast } = useAction(), [pending, setPending] = useState(false);
  async function submit() {
    if (pending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError({ field: "email", text: tr("Enter the e-mail address we can answer you on.") });
    if (!message.trim()) return setError({ field: "message", text: tr("Tell us how you would coach.") });
    setError(null);
    setPending(true);
    try {
      await coaching.apply({ email: email.trim(), events, experience: experience.trim(), message: message.trim() });
      toast({ title: tr("Application sent") });
    } catch (reason) {
      setError({ field: "form", text: (reason as Error).message });
    } finally {
      setPending(false);
    }
  }
  const invalid = (field: string) => error?.field === field && "border-destructive";
  return <View className="min-h-0 flex-1 gap-3" testID="apply">
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-5 px-4 pb-4" keyboardShouldPersistTaps="handled">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-base font-semibold tracking-tight">{tr("Become a coach")}</Text>
        <Text className="text-muted-foreground">{tr("The team reads every application and answers by e-mail.")}</Text>
      </View>
      <Field label={tr("E-mail address")} error={error?.field === "email" ? error.text : undefined}>
        <Input className={cn("h-11", invalid("email"))} placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" autoComplete="email"
          value={email} onChangeText={setEmail} placeholder={tr("you@example.com")} accessibilityLabel={tr("E-mail address")} />
      </Field>
      <Field label={tr("Events you would coach")}><EventPicker value={events} onChange={setEvents} /></Field>
      <Field label={tr("Your level")}>
        <Input className="h-11" placeholderTextColor={colors.mutedForeground} value={experience} onChangeText={setExperience} maxLength={1000} placeholder={tr("Averages, competitions, WCA ID…")} accessibilityLabel={tr("Your level")} />
      </Field>
      <Field label={tr("How would you coach?")} error={error?.field === "message" ? error.text : undefined}>
        <Input className={cn("h-auto min-h-32 py-2", invalid("message"))} multiline textAlignVertical="top" value={message} onChangeText={setMessage} maxLength={2000} accessibilityLabel={tr("How would you coach?")} />
      </Field>
      {error?.field === "form" ? <Alert variant="destructive"><Text className="text-sm text-destructive">{error.text}</Text></Alert> : null}
    </ScrollView>
    <Button size="lg" disabled={pending} onPress={submit} testID="apply-send">
      <Icon as={Send} size={16} className="text-primary-foreground" /><Text>{pending ? tr("Sending…") : tr("Send my application")}</Text>
    </Button>
  </View>;
}
