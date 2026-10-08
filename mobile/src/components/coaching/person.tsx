import { CalendarDays, GraduationCap, MessageSquare, Timer, TrendingDown, TrendingUp, UserRound } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Svg, { Polyline, Rect } from "react-native-svg";
import { fmtTime, plural } from "../../../../src/client/lib/format";
import { heatmap, type HeatCell } from "../../../../src/client/lib/profile";
import { sets as catalogSets, cases as catalogCases } from "../../../../src/client/local/catalog";
import { eventInfo, type EventId } from "../../../../src/shared/puzzles";
import { localFormat, tr } from "../../../../src/client/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { alpha, useColors } from "../../theme";
import { PuzzleIcon } from "../PuzzlePicker";
import { Sheet, SheetInput } from "../Sheet";
import { Bar, Empty, Figure, Numeric, SectionHead, Surface } from "../layout";
import { coaching, useCoaching, type Booking, type History, type PersonProfile } from "./client";
import { CancelButton, MoveButton, Offer } from "./sessions";
import { Face, Stars, Strip, day, relative, span, useAction, useCoachingNav } from "./parts";

/**
 * Someone the account coaches (or is coached by), after the web's coaching/person.tsx: a card with the session and what
 * matters at a glance, and their whole file in a sheet: figures, activity, progress per puzzle, cases learned, the
 * coach's notes and every session together.
 */
const sinceFormat = localFormat({ month: "long", year: "numeric" });
const since = (iso: string) => sinceFormat.format(new Date(iso));

function usePerson(id: string) {
  useCoaching();
  useEffect(() => { if (id) void coaching.load(`person:${id}`); }, [id]);
  return coaching.people.get(id);
}

/** The card of a booked session: who, when, why, and the way to their profile or their conversation. */
export function SessionCard({ b, onProfile }: { b: Booking; onProfile: () => void }) {
  const p = usePerson(b.with.id), nav = useCoachingNav();
  const done = p?.sessions.filter(x => x.status === "booked" && x.endsAt <= Date.now()).length;
  return <View className="gap-3">
    <View className="flex-row items-center gap-3">
      <Face name={b.with.username} src={b.with.avatar} size={40} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-semibold">{b.with.username}</Text>
        {p ? <Text className="text-xs text-muted-foreground">{tr("{0} · on Qbix since {1}", { 0: b.role === "coach" ? tr("Student") : tr("Coach"), 1: since(p.since) })}</Text> : <Skeleton className="mt-1 h-3 w-36" />}
      </View>
    </View>
    <View className="gap-1 rounded-lg bg-muted/50 px-3 py-2">
      <Numeric className="font-medium">{span(b.startsAt, b.endsAt)}</Numeric>
      <Text className="text-xs text-muted-foreground">{relative(b.startsAt)}</Text>
      {b.note ? <Text className="pt-1">“{b.note}”</Text> : null}
    </View>
    <Strip className="px-3 py-2.5">
      <Figure className="w-1/3" label={tr("Together")} value={done == null ? null : String(done)} />
      <Figure className="w-1/3" label={tr("Solves")} value={p ? String(p.practice.solves) : null} />
      <Figure className="w-1/3" label={tr("Days · 30")} value={p ? String(p.practice.activeDays) : null} />
    </Strip>
    <View className="flex-row gap-2">
      {b.conversationId ? <Button variant="outline" className="h-11 flex-1" onPress={() => nav.go(b.role === "coach" ? "students/" + b.studentId : "messages/" + b.conversationId)}>
        <Icon as={MessageSquare} size={16} /><Text>{tr("Message")}</Text>
      </Button> : null}
      <Button className="h-11 flex-1" onPress={onProfile}>
        <Icon as={UserRound} size={16} className="text-primary-foreground" /><Text>{tr("View profile")}</Text>
      </Button>
    </View>
    {b.role === "coach" && b.status === "booked" && b.endsAt > Date.now() ? <>
      {b.proposal ? <Offer b={b} /> : null}
      <View className="flex-row gap-2"><MoveButton b={b} label /><CancelButton b={b} label /></View>
    </> : null}
  </View>;
}

/**
 * Someone's whole file in a sheet: their figures, their activity over a year, how each puzzle goes, the cases they
 * learned, the coach's notes (written here) and every session together. `inChat`: opened from their conversation,
 * which it then does not offer again.
 */
export function PersonDialog({ id, name, open, onClose, inChat = false }: { id: string; name: string; open: boolean; onClose: () => void; inChat?: boolean }) {
  return <Sheet open={open} onClose={onClose} title={name} hideTitle scroll>
    {open ? <PersonBody id={id} name={name} inChat={inChat} close={onClose} /> : null}
  </Sheet>;
}

function PersonBody({ id, name, inChat, close }: { id: string; name: string; inChat: boolean; close: () => void }) {
  const p = usePerson(id), nav = useCoachingNav(), now = Date.now();
  const booked = p?.sessions.filter(b => b.status === "booked") ?? [], done = booked.filter(b => b.endsAt <= now), rated = done.filter(b => b.review),
    minutes = done.reduce((sum, b) => sum + (b.endsAt - b.startsAt) / 60_000, 0);
  return <View className="gap-4" testID="person-dialog">
    <View className="flex-row items-center gap-4">
      <Face name={name} src={p?.avatar} size={64} />
      <View className="min-w-0 flex-1 items-start gap-1.5">
        <Text accessibilityRole="header" numberOfLines={1} className="text-xl font-semibold tracking-tight">{name}</Text>
        <Text className="text-sm text-muted-foreground">
          {p ? [p.role === "student" ? tr("Your student") : tr("Your coach"), tr("on Qbix since {0}", { 0: since(p.since) }),
            p.practice.lastAt ? tr("last solve {0}", { 0: relative(new Date(p.practice.lastAt).getTime(), now) }) : tr("no solve yet")].join(" · ") : tr("Loading…")}
        </Text>
        {p && !inChat ? <Button variant="outline" size="sm" className="mt-1 h-10" onPress={() => { close(); nav.go(p.role === "student" ? "students/" + p.id : "messages/" + p.conversationId); }}>
          <Icon as={MessageSquare} size={16} /><Text>{tr("Message")}</Text>
        </Button> : null}
      </View>
    </View>
    {!p ? <View accessibilityLabel={tr("Loading")} className="gap-4">
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </View> : <>
      <Strip>
        <Figure className="w-1/3" label={tr("Sessions")} value={String(done.length)} />
        <Figure className="w-1/3" label={tr("Coming")} value={String(booked.length - done.length)} />
        <Figure className="w-1/3" label={tr("Together")} value={minutes ? `${(minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} h` : "–"} />
        <Figure className="w-1/3" label={tr("Rating")} value={rated.length ? <Stars rating={rated.reduce((sum, b) => sum + b.review!.rating, 0) / rated.length} size={12} figure={false} /> : "–"} />
        <Figure className="w-1/3" label={tr("Solves")} value={String(p.practice.solves)} />
        <Figure className="w-1/3" label={tr("Active days · 30")} value={String(p.practice.activeDays)} />
      </Strip>
      <Activity days={p.history.days} />
      <Surface className="gap-3 p-4" accessibilityLabel={tr("Puzzles")}>
        <SectionHead title={tr("Puzzles")} />
        {!p.practice.puzzles.length ? <Empty icon={Timer} className="p-4">{tr("No timed solve yet.")}</Empty>
          : <View className="gap-5">{p.practice.puzzles.map(x => <PuzzleCard key={x.puzzle} x={x} history={p.history.puzzles[x.puzzle]} />)}</View>}
      </Surface>
      <Learned ids={p.history.learned} />
      {p.note !== null ? <PrivateNotes conversation={p.conversationId} note={p.note} /> : null}
      <Surface className="gap-3 p-4" accessibilityLabel={tr("Sessions together")}>
        <SectionHead title={tr("Sessions together")} meta={p.sessions.length || undefined} />
        {!p.sessions.length ? <Empty icon={CalendarDays} className="p-4">{tr("No session yet.")}</Empty> : <View className="gap-0.5">
          {p.sessions.map(b => <View key={b.id} className={cn("gap-1 py-2", b.status === "cancelled" && "opacity-60")}>
            <View className="flex-row items-center gap-2">
              <Numeric className="text-sm">{span(b.startsAt)}</Numeric>
              <View className="ml-auto">
                {b.status === "cancelled" ? <Badge variant="secondary"><Text>{tr("Cancelled")}</Text></Badge>
                  : b.endsAt > now ? <Badge variant="outline"><Text>{day(b.startsAt) === day(now) ? tr("Today") : tr("Coming")}</Text></Badge>
                    : b.review ? <Stars rating={b.review.rating} size={11} figure={false} /> : null}
              </View>
            </View>
            {b.note ? <Text className="text-xs text-muted-foreground">{b.note}</Text> : null}
            {b.review?.comment ? <Text className="text-xs text-muted-foreground italic">“{b.review.comment}”</Text> : null}
          </View>)}
        </View>}
      </Surface>
    </>}
  </View>;
}

/** Solves per day over the last year, a week per column from Monday; a tap on a day names its count in the head. */
export function Activity({ days }: { days: History["days"] }) {
  const { cells, weeks, months, level, total } = useMemo(() => heatmap(new Map(days.map(([key, count]) => [key, { count, times: [] }])), null), [days]);
  const [picked, setPicked] = useState<HeatCell | null>(null), [width, setWidth] = useState(0);
  const colors = useColors(), step = 10, cell = 8;
  const fills = [colors.muted, ...[35, 60, 85, 100].map(o => alpha(colors.primary, o))];
  return <Surface className="gap-3 p-4" accessibilityLabel={tr("Activity")}>
    <SectionHead title={tr("Activity")} meta={<Text className="text-xs text-muted-foreground">{picked ? `${plural(picked.count, "solve")} · ${day(picked.date.getTime())}` : tr("{0} in the last year", { 0: plural(total, "solve") })}</Text>} />
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <View className="h-4">
        {width ? months.filter(m => m.week < weeks - 2).map(m => <Text key={m.week} className="absolute top-0 text-xs leading-none text-muted-foreground" style={{ left: (m.week / weeks) * width }}>{m.label}</Text>) : null}
      </View>
      <Pressable accessibilityRole="image" accessibilityLabel={tr("{0} in the last year", { 0: plural(total, "solve") })} style={{ aspectRatio: weeks / 7 }}
        onPress={e => {
          if (!width) return;
          const w = Math.floor((e.nativeEvent.locationX / width) * weeks), d = Math.min(6, Math.floor((e.nativeEvent.locationY / width) * weeks));
          const c = cells[w * 7 + d];
          setPicked(p => (!c || c.hidden || p?.key === c.key ? null : c));
        }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${weeks * step} ${7 * step}`}>
          {cells.map((c, i) => c.hidden ? null : <Rect key={c.key} x={Math.floor(i / 7) * step} y={(i % 7) * step} width={cell} height={cell} rx={1.5}
            fill={fills[level(c.count)]} stroke={picked?.key === c.key ? colors.foreground : undefined} strokeWidth={picked?.key === c.key ? 1 : 0} />)}
        </Svg>
      </Pressable>
    </View>
  </Surface>;
}

/** One puzzle: its best, Ao5 and Ao12, and the last solves as a line, with how much faster the recent half went. */
export function PuzzleCard({ x, history }: { x: PersonProfile["practice"]["puzzles"][number]; history?: History["puzzles"][string] }) {
  const colors = useColors();
  const times = (history?.recent ?? []).filter((t): t is number => t != null);
  const half = Math.floor(times.length / 2), mean = (list: number[]) => list.reduce((sum, t) => sum + t, 0) / list.length,
    change = times.length >= 10 ? mean(times.slice(half)) - mean(times.slice(0, half)) : null;
  const low = Math.min(...times), high = Math.max(...times), range = high - low || 1;
  const line = (list: (number | null)[]) => list.map((t, i) => (t == null ? "" : `${(i / (times.length - 1)) * 100},${4 + ((t - low) / range) * 32}`)).filter(Boolean).join(" ");
  const ao5 = times.map((_, i) => (i < 4 ? null : times.slice(i - 4, i + 1).reduce((sum, t) => sum + t, 0) / 5));
  return <View className="gap-2" testID={"puzzle-" + x.puzzle}>
    <View className="flex-row items-center gap-3">
      {eventInfo(x.puzzle) ? <PuzzleIcon puzzle={x.puzzle as EventId} size={22} /> : null}
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium">{tr(eventInfo(x.puzzle)?.label ?? x.puzzle)}</Text>
        <Text className="text-xs text-muted-foreground">{plural(x.solves, "solve")}</Text>
      </View>
      {change != null && Math.abs(change) >= 10 ? <View accessibilityLabel={tr("Last solves against the ones before")} className="flex-row items-center gap-1">
        <Icon as={change < 0 ? TrendingDown : TrendingUp} size={14} className={change < 0 ? "text-success" : "text-destructive"} />
        <Numeric className={cn("text-xs font-medium", change < 0 ? "text-success" : "text-destructive")}>{change < 0 ? "−" : "+"}{fmtTime(Math.abs(change))}</Numeric>
      </View> : null}
    </View>
    {times.length >= 2 ? <Svg width="100%" height={40} viewBox="0 0 100 40" preserveAspectRatio="none" accessibilityLabel={tr("The last solves, faint, under their running Ao5")}>
      <Polyline points={line(times)} fill="none" stroke={colors.primary} strokeWidth={1} opacity={0.35} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <Polyline points={line(ao5)} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </Svg> : null}
    <View className="flex-row justify-between gap-3">
      {([["best", x.best], ["ao5", x.ao5], ["ao12", history?.ao12 ?? null]] as const).map(([label, value]) =>
        <Numeric key={label} className="text-xs text-muted-foreground">{label} <Text className="text-xs font-medium text-foreground">{value == null ? "–" : fmtTime(value)}</Text></Numeric>)}
    </View>
  </View>;
}

/** The cases learned, per set of the catalogue, against the size of the set. */
export function Learned({ ids }: { ids: string[] }) {
  const sets = useMemo(() => {
    const setOf = new Map(catalogCases.map(c => [c.id, c.set]));
    const counts = new Map<string, number>();
    for (const id of ids) {
      const set = setOf.get(id);
      if (set) counts.set(set, (counts.get(set) ?? 0) + 1);
    }
    return catalogSets.filter(set => counts.has(set.id)).map(set => ({ ...set, learned: counts.get(set.id)! }));
  }, [ids]);
  return <Surface className="gap-3 p-4" accessibilityLabel={tr("Cases learned")}>
    <SectionHead title={tr("Cases learned")} meta={ids.length || undefined} />
    {!sets.length ? <Empty icon={GraduationCap} className="p-4">{tr("No case learned yet.")}</Empty> : <View className="gap-2.5">
      {sets.map(set => <View key={set.id} className="gap-1.5">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text numberOfLines={1} className="text-xs font-medium">{tr(set.label)}</Text>
          <Numeric className="text-xs text-muted-foreground">{set.learned} / {set.count}</Numeric>
        </View>
        <Bar ratio={set.learned / set.count} />
      </View>)}
    </View>}
  </Surface>;
}

/**
 * The coach's private notes on a student: the web edits them as rich text kept as Markdown; here the same Markdown is
 * written as plain text (no toolbar, no rendering). Saved a moment after typing stops and when the field is left.
 */
export function PrivateNotes({ conversation, note, inSheet = true }: { conversation: number; note: string; inSheet?: boolean }) {
  const [text, setText] = useState(note), saved = useRef(note), timer = useRef<ReturnType<typeof setTimeout>>(undefined), focused = useRef(false);
  const [state, setState] = useState<"saved" | "unsaved" | "saving">("saved");
  const { toast } = useAction();
  const latest = useRef(text);
  latest.current = text;
  async function save() {
    clearTimeout(timer.current);
    const value = latest.current.trim();
    if (value === saved.current) return setState("saved");
    setState("saving");
    try {
      await coaching.saveNote(conversation, value);
      saved.current = value;
    } catch (e) {
      toast({ error: true, title: (e as Error).message });
    }
    setState(latest.current.trim() === saved.current ? "saved" : "unsaved");
  }
  // Notes saved elsewhere show here, unless they are being written here.
  useEffect(() => {
    if (focused.current || note === saved.current) return;
    saved.current = note;
    setText(note);
  }, [note]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const Input = inSheet ? SheetInput : TextInput;
  const colors = useColors();
  return <Surface className="gap-2 p-4" accessibilityLabel={tr("Private notes")}>
    <SectionHead title={tr("Private notes")}>
      <Text className="text-xs text-muted-foreground">{state === "saving" ? tr("Saving…") : state === "unsaved" ? tr("Unsaved") : tr("Only you see them")}</Text>
    </SectionHead>
    <Input value={text} multiline textAlignVertical="top" accessibilityLabel={tr("Private notes")} placeholder={tr("Goals, weak points, homework…")} placeholderTextColor={colors.mutedForeground}
      onChangeText={value => {
        setText(value);
        setState("unsaved");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 1500);
      }}
      onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; void save(); }}
      className="min-h-40 rounded-lg border border-input bg-input/30 px-3 py-2.5 font-sans text-base text-foreground" />
  </Surface>;
}
