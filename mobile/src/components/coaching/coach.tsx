import * as ImagePicker from "expo-image-picker";
import { CalendarDays, ExternalLink, ImageUp, Save, TriangleAlert, UserRoundX, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { plural } from "../../../../src/client/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useColors } from "../../theme";
import { ask } from "../Confirm";
import { Bar, Empty, Figure, ListSkeleton, Numeric, Segmented, SectionHead, Surface } from "../layout";
import { CoachingMessages } from "./CoachingMessages";
import { coaching, euros, price, useCoaching } from "./client";
import { SessionRow, useMinute } from "./sessions";
import { Count, EventPicker, Face, Field, Strip, day, span, useAction, useCoachingNav } from "./parts";
import { tr } from "../../../../src/client/i18n";

/** The coach's side (the web's coaching/coach.tsx): the dashboard with the weeks ahead, the students and the public profile. */

function useDashboard() {
  useEffect(() => { void coaching.load("dashboard"); }, []);
  return useCoaching().dashboard;
}
const WEEK_NAMES = ["This week", "Next week", "In 2 weeks", "In 3 weeks"];

/** What is coming: the figures of the weeks ahead, each week's load against its free slots, and the next sessions. */
export function Dashboard() {
  const d = useDashboard(), now = useMinute(), nav = useCoachingNav();
  if (!d) return <View accessibilityLabel={tr("Loading")} className="flex-1 gap-4">
    <Skeleton className="h-28 rounded-xl" />
    <View className="gap-5 rounded-xl border border-border p-4">
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 4 }, (_, i) => <View key={i} className="gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-1.5" /></View>)}
    </View>
    <View className="gap-2 rounded-xl border border-border p-4"><Skeleton className="h-4 w-32" /><ListSkeleton rows={3} /></View>
  </View>;
  const c = d.coach, week = d.weeks[0]!, month = d.weeks.reduce((sum, w) => sum + w.incomeCents, 0), most = Math.max(1, ...d.weeks.map(w => w.sessions + w.openSlots));
  const todo = [
    !c.windows?.length && !c.overrides?.some(o => o.open) && ["Add your hours so players can book you.", "schedule", "Set my hours"],
    !c.headline && ["Introduce yourself on your public page.", "profile", "Edit my profile"],
    !c.accepting && ["Your bookings are paused.", "profile", "Open bookings"],
  ].filter(Boolean) as [string, string, string][];
  return <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-4 px-4 pb-4" testID="dashboard">
    {todo.map(([text, view, action]) => <Alert key={view + text} variant="warning" icon={TriangleAlert}
      action={<Button size="sm" variant="outline" className="h-10" onPress={() => nav.go(view)}><Text>{tr(action)}</Text></Button>}>{tr(text)}</Alert>)}
    <Strip accessibilityLabel={tr("Dashboard")}>
      <Figure className="w-1/3 pr-2" label={tr("Sessions · 7 days")} value={String(week.sessions)} size="lg" />
      <Figure className="w-1/3 pr-2" label={tr("Booked · 7 days")} value={`${(week.minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} h`} size="lg" />
      <Figure className="w-1/3" label={tr("Expected · 4 weeks")} value={euros(month)} tone="accent" size="lg" />
      <Figure className="w-1/3 pr-2" label={tr("Free slots · 7 days")} value={String(week.openSlots)} size="lg" />
      <Figure className="w-1/3 pr-2" label={tr("Students")} value={String(d.students.length)} size="lg" />
      <Figure className="w-1/3" label={tr("Rating")} value={c.rating == null ? "–" : c.rating.toFixed(1)} tone="warning" size="lg" />
    </Strip>
    <Surface className="px-4 pt-2 pb-4" accessibilityLabel={tr("Forecast")}>
      <SectionHead title={tr("Forecast")} />
      <View className="gap-4 pt-2">
        {d.weeks.map((w, i) => <View key={w.from} className="gap-1.5" testID={"week-" + i}>
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="font-medium">{tr(WEEK_NAMES[i]!)}</Text>
            <Numeric className="text-xs text-muted-foreground">{day(w.from)} – {day(w.to - 1)}</Numeric>
          </View>
          {/* Booked in the accent, the free slots paler behind, the rest of the busiest week empty. */}
          <Bar ratio={w.sessions / most} behind={(w.sessions + w.openSlots) / most} className="h-1.5" />
          <View className="flex-row justify-between">
            <Numeric className="text-xs text-muted-foreground"><Text className="text-xs font-medium text-foreground">{plural(w.sessions, "session")}</Text> · {plural(w.openSlots, "free slot")}</Numeric>
            <Numeric className="text-xs text-foreground">{euros(w.incomeCents)}</Numeric>
          </View>
        </View>)}
      </View>
    </Surface>
    <Surface className="px-4 pt-2 pb-2">
      <SectionHead title={tr("Next sessions")} meta={d.upcoming.length} />
      {!d.upcoming.length ? <Empty icon={CalendarDays}>{tr("No session booked yet.")}</Empty>
        : <View className="gap-0.5">{d.upcoming.map(b => <SessionRow key={b.id} b={b} now={now} compact />)}</View>}
    </Surface>
  </ScrollView>;
}

/** The students: the list, then one student's conversation; their name there opens their file. */
export function StudentsView({ id }: { id: string }) {
  const d = useDashboard(), nav = useCoachingNav();
  useEffect(() => {
    void coaching.load("conversations");
    void coaching.load("bookings");
  }, []);
  const student = d?.students.find(st => st.id === id);
  if (id) return student ? <CoachingMessages conversationId={student.conversationId} />
    : <Empty icon={d ? UserRoundX : Users} title={d ? tr("This student is not among yours.") : undefined} />;
  if (!d) return <ListSkeleton />;
  if (!d.students.length) return <Empty icon={Users}>{tr("Players who book you or write to you appear here.")}</Empty>;
  return <FlatList data={d.students} keyExtractor={st => st.id} className="-mx-4" testID="students"
    renderItem={({ item: st }) => <Pressable accessibilityRole="button" accessibilityLabel={st.username} onPress={() => nav.go("students/" + st.id)}
      className="min-h-16 flex-row items-center gap-3 px-4 py-2.5 active:bg-muted/50">
      <Face name={st.username} src={st.avatar} size={40} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("text-base", st.unread ? "font-semibold" : "font-medium")}>{st.username}</Text>
        <Text numberOfLines={1} className="text-sm text-muted-foreground">{plural(st.done, "session") + (st.nextAt ? " " + tr("· next {0}", { 0: span(st.nextAt) }) : "")}</Text>
      </View>
      <Count n={st.unread} />
    </Pressable>} />;
}

/** What players see of the coach: a line, a few paragraphs, the events, the languages, the price and whether they book. */
export function CoachProfile() {
  const coach = useCoaching().me?.coach;
  if (!coach) return <View accessibilityLabel={tr("Loading")} className="gap-5">
    <View className="flex-row items-center gap-4"><Skeleton className="size-18 rounded-full" /><Skeleton className="h-8 w-40" /></View>
    <Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-36" />
  </View>;
  return <ProfileForm key={coach.id} />;
}

function ProfileForm() {
  const coach = coaching.me!.coach!, nav = useCoachingNav(), colors = useColors();
  const [headline, setHeadline] = useState(coach.headline), [bio, setBio] = useState(coach.bio), [events, setEvents] = useState(coach.events),
    [languages, setLanguages] = useState(coach.languages.join(", ")), [amount, setAmount] = useState(coach.priceCents ? String(coach.priceCents / 100) : ""),
    [accepting, setAccepting] = useState(coach.accepting), [newStudents, setNewStudents] = useState(coach.newStudents);
  const { pending, run } = useAction();
  const cents = Math.round(Number(amount.replace(",", ".") || 0) * 100), valid = Number.isFinite(cents) && cents >= 0 && cents <= 100_000;
  const save = () => valid && !pending && run(() => coaching.saveProfile({
    headline: headline.trim(), bio: bio.trim(), events,
    languages: languages.split(",").map(l => l.trim()).filter(Boolean).slice(0, 10),
    priceCents: cents, accepting, newStudents,
  }), tr("Profile saved"));
  const input = { placeholderTextColor: colors.mutedForeground, className: "h-11" };
  return <View className="min-h-0 flex-1 gap-3" testID="coach-profile">
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-5 px-4 pb-4" keyboardShouldPersistTaps="handled">
      <Picture />
      <Field label={tr("Bookings")}>
        <Segmented label={tr("Bookings")} value={accepting ? "open" : "paused"} onChange={v => setAccepting(v === "open")} options={[{ id: "open", label: tr("Open") }, { id: "paused", label: tr("Paused") }]} />
      </Field>
      <Field label={tr("New students")} help={newStudents ? tr("Anyone can book your free slots.") : tr("Only players you already coached see your slots.")}>
        <Segmented label={tr("New students")} value={newStudents ? "open" : "closed"} onChange={v => setNewStudents(v === "open")} options={[{ id: "open", label: tr("Welcome") }, { id: "closed", label: tr("My students only") }]} />
      </Field>
      <Field label={tr("Headline")}>
        <Input {...input} value={headline} onChangeText={setHeadline} maxLength={80} placeholder={tr("Sub-10 CFOP coach, F2L and lookahead")} accessibilityLabel={tr("Headline")} />
      </Field>
      <Field label={tr("About you")}>
        <Input {...input} className="h-auto min-h-36 py-2" multiline textAlignVertical="top" value={bio} onChangeText={setBio} maxLength={2000}
          placeholder={tr("Your results, how a session goes, who you help best…")} accessibilityLabel={tr("About you")} />
      </Field>
      <Field label={tr("Events")}><EventPicker value={events} onChange={setEvents} /></Field>
      <Field label={tr("Languages")}>
        <Input {...input} value={languages} onChangeText={setLanguages} placeholder={tr("English, French")} accessibilityLabel={tr("Languages")} />
      </Field>
      <Field label={tr("Price per session")} help={tr("{0} · payment comes later", { 0: cents ? price(cents) : tr("Free") })}>
        <View className="flex-row items-center gap-2">
          <Input {...input} className={cn("h-11 flex-1 tabular-nums", !valid && "border-destructive")} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" accessibilityLabel={tr("Price per session")} />
          <Text className="text-sm text-muted-foreground">{tr("€ · {0} min", { 0: coach.sessionMinutes })}</Text>
        </View>
      </Field>
    </ScrollView>
    <View className="flex-row gap-2">
      <Button variant="outline" size="lg" onPress={() => nav.go("coach/" + coach.id)}>
        <Icon as={ExternalLink} size={16} /><Text>{tr("Public page")}</Text>
      </Button>
      <Button size="lg" className="flex-1" disabled={!valid || pending} onPress={save} testID="profile-save">
        <Icon as={Save} size={16} className="text-primary-foreground" /><Text>{pending ? tr("Saving…") : tr("Save")}</Text>
      </Button>
    </View>
  </View>;
}

/** The coach's picture, set at once: a picture from the phone, cut square in the system's cropper. */
function Picture() {
  const coach = useCoaching().me!.coach!, { pending, run } = useAction();
  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    // ponytail: no resizing on the phone (no image manipulator): a big crop may pass the server's 2 MB, which says so.
    if (asset) await run(async () => coaching.setAvatar(await (await fetch(asset.uri)).blob()), tr("Picture saved"));
  }
  return <Field label={tr("Picture")} help={tr("Players see it beside your name. A face works best.")}>
    <View className="flex-row items-center gap-4">
      <Face name={coach.username} src={coach.avatar} size={72} />
      <View className="flex-row gap-2">
        <Button variant="outline" size="sm" className="h-10" disabled={pending} onPress={pick}>
          <Icon as={ImageUp} size={16} /><Text>{coach.avatar ? tr("Change") : tr("Add a picture")}</Text>
        </Button>
        {coach.avatar ? <Button variant="ghost" size="sm" className="h-10" disabled={pending}
          onPress={async () => (await ask({ title: tr("Remove your picture?"), action: tr("Remove") })) && run(() => coaching.setAvatar(null), tr("Picture removed"))}>
          <Text>{tr("Remove")}</Text>
        </Button> : null}
      </View>
    </View>
  </Field>;
}
