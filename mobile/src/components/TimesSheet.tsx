import { useAtomValue } from "jotai";
import { Ban, CalendarDays, ChevronLeft, ChevronRight, ListOrdered, MessageSquare, Pencil, Plus, Rotate3d, Trash2 } from "lucide-react-native";
import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { effective, fmtSolve, fmtTime, shortDate } from "../../../src/client/lib/format";
import { practiceSummary, sessionExtremes, solveTone } from "../../../src/client/lib/practiceSummary";
import { resumes, sessionName, type SessionSummary } from "../../../src/client/lib/sessions";
import { TONE_TEXT } from "../../../src/client/lib/tone";
import { contextKey, eventOf, type PracticeContext } from "../../../src/shared/puzzles";
import type { SolveDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api, local, localChanged } from "../api";
import { launchSessionId, setLaunchSession } from "../lib/launchSession";
import { storage } from "../platform/storage";
import { cubeSwitchLockedAtom } from "../state";
import { useColors } from "../theme";
import { Empty, Numeric } from "./layout";
import { Pill } from "./PuzzlePicker";
import { Sheet, SheetFlatList, SheetInput } from "./Sheet";
import { SolveMenu, useSolveMenu } from "./SolveMenus";
import { locale, said, tr } from "../../../src/client/i18n";

/** Every time takes one row of this height (`h-11`). */
const ROW = 44;

/* ------------------------------------------------------------------ The timer's sessions */

/** The session the timer showed last, per account and context (the web's `cubix.timer.session`). */
const LAST_KEY = "cubix.timer.session";
const lastSessions = (): Record<string, number> => { try { return JSON.parse(storage.getItem(LAST_KEY) ?? "{}") ?? {}; } catch { return {}; } };
const lastKey = (context: PracticeContext) => `${local.current()?.id ?? "guest"}:${contextKey(context)}`;
/** Remembers the timer's session of a context, to go back to it on the next launch. */
export function rememberTimerSession(context: PracticeContext, id: number) {
  const all = lastSessions(), key = lastKey(context);
  if (all[key] !== id) try { storage.setItem(LAST_KEY, JSON.stringify({ ...all, [key]: id })); } catch { /* Best effort. */ }
}
const resumeTried = new Set<string>();
/** The timer's first look at a context in this launch: back to the session it showed last, if it resumes (named, or used today). */
export function resumeTimerSession(context: PracticeContext) {
  const key = lastKey(context);
  if (resumeTried.has(key) || launchSessionId("playground", context) !== null) return;
  resumeTried.add(key);
  const id = lastSessions()[key];
  const last = id == null ? undefined : local.read.sessions(context.puzzle, context).find(x => x.id === id);
  if (last && resumes(last)) setLaunchSession("playground", context, id!);
}

/** The timer sessions of a context, newest first, with their figures, and the current one; kept up to date. */
export function useTimerSessions(context: PracticeContext) {
  const read = () => ({ list: local.read.sessions(context.puzzle, context).filter(x => x.id != null), current: launchSessionId("playground", context) });
  const [state, setState] = useState(read);
  useEffect(() => localChanged.on(() => setState(read())), [contextKey(context)]);
  return state;
}

/**
 * A new session of the timer (named `name`, if given), or back to session `id`. The timer's list reads its session
 * again on the change notice (`useSessionSolves`).
 */
async function chooseSession(context: PracticeContext, target: number | "new", name?: string) {
  const id = target === "new" ? (await api.createSession("playground", [], context.puzzle, { solveMode: context.solveMode, scrambleType: context.scrambleType }, name)).id : target;
  setLaunchSession("playground", context, id);
  rememberTimerSession(context, id);
  localChanged.emit();
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayKey = (iso: string) => new Date(iso).toDateString();
const hour = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
/** A session as its pill says it: its name, "Today", or its day. */
const pillName = (x: SessionSummary) => x.name || (sameDay(new Date(x.at), new Date()) ? tr("Today") : shortDate(x.at));

/* ------------------------------------------------------------------ The sheet */

/**
 * The session's times in a sheet: its figures, then every time newest first. A tap opens a time, holding it gives its
 * menu, swiping it to the left +2, DNF and Delete. On the timer (`context`), the session has its name (edited in
 * place), the sessions of the puzzle as pills ("New" starts one) and, behind the calendar, every day one was used.
 */
export function TimesSheet({ open, onClose, solves, title, context, calendar = false }: {
  open: boolean; onClose: () => void; solves: SolveDto[]; title: string;
  /** The timer's practice context: its sessions can be named, started and chosen. */
  context?: PracticeContext;
  /** Opens on the calendar of the sessions. */
  calendar?: boolean;
}) {
  const [showCalendar, setShowCalendar] = useState(calendar);
  useEffect(() => { if (open) setShowCalendar(calendar); }, [open, calendar]);
  const data = useMemo(() => [...solves].reverse(), [solves]);
  const extremes = useMemo(() => sessionExtremes(solves), [solves]);
  return <Sheet open={open} onClose={onClose} title={title} hideTitle contentClassName="gap-3 px-0">
    {context
      ? <TimerSessionHead context={context} count={solves.length} calendar={showCalendar} onCalendar={() => setShowCalendar(!showCalendar)} onPicked={() => setShowCalendar(false)} />
      : <View className="flex-row items-baseline gap-2 px-5 pt-1">
        <Text accessibilityRole="header" className="text-xl font-extrabold tracking-[-0.03em]">{said(title)}</Text>
        <Numeric className="text-base font-bold text-muted-foreground">{solves.length}</Numeric>
      </View>}
    {!showCalendar && <>
      <SessionFigures solves={solves} />
      <View className="mx-5 h-px bg-border" />
      <SheetFlatList data={data} keyExtractor={solve => String(solve.id)} initialNumToRender={20} getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
        ListEmptyComponent={<Empty icon={ListOrdered} title={tr("No times yet")} className="px-4 py-8">{tr("Every solve of this session lands here.")}</Empty>}
        renderItem={({ item, index }) => <TimeRow solve={item} number={solves.length - index} tone={solveTone(item, extremes)} />} />
    </>}
  </Sheet>;
}

/** The session's name (edited in place) and count, the calendar, then the sessions of the puzzle as pills or as a month. */
function TimerSessionHead({ context, count, calendar, onCalendar, onPicked }: { context: PracticeContext; count: number; calendar: boolean; onCalendar: () => void; onPicked: () => void }) {
  const colors = useColors();
  const { list, current: currentId } = useTimerSessions(context);
  const choose = (target: number | "new", name?: string) => chooseSession(context, target, name);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const current = list.find(x => x.id === currentId);
  const event = tr(eventOf(context.puzzle, context.solveMode)?.label ?? context.puzzle);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const run = (action: Promise<unknown>) => { setError(""); action.catch(e => setError((e as Error).message)); };
  // Leaving the field keeps the name; an empty one gives back the day and the event. A session not started yet starts with it.
  const commit = () => {
    if (text === null) return;
    const name = text.trim();
    setText(null);
    if (!current?.id) { if (name) run(choose("new", name)); return; }
    if ((current.name ?? "") !== name) run(api.renameSession(current.id, name || null));
  };
  const pick = (id: number | "new") => { onPicked(); if (id !== currentId) run(choose(id)); };
  return <View className="gap-3">
    <View className="flex-row items-center gap-2 px-5">
      <SheetInput accessibilityLabel={tr("Session name")} value={text ?? current?.name ?? ""} placeholder={sessionName(current ?? undefined, event)} placeholderTextColor={colors.foreground}
        maxLength={60} onChangeText={setText} onBlur={commit} submitBehavior="blurAndSubmit" returnKeyType="done"
        className="h-11 max-w-[70%] shrink rounded-lg border-0 bg-transparent px-0 text-xl font-extrabold tracking-[-0.03em]" />
      <Numeric className="text-base font-bold text-muted-foreground">{count}</Numeric>
      <Icon as={Pencil} size={15} className="text-muted-foreground" />
      <View className="flex-1" />
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Sessions calendar")} accessibilityState={{ selected: calendar }} onPress={onCalendar}
        className={cn("size-11 items-center justify-center rounded-full active:bg-muted", calendar && "bg-accent")}>
        <Icon as={CalendarDays} size={20} className="text-foreground" />
      </Pressable>
    </View>
    {calendar ? <SessionCalendar list={list} current={currentId} disabled={locked} onPick={pick} />
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5">
        <Pill primary icon={Plus} label={tr("New")} disabled={locked} accessibilityLabel={tr("New session")} onPress={() => pick("new")} />
        {list.slice(0, 50).filter(x => x.count || x.id === currentId).map(x => <Pill key={x.id} role="radio" on={x.id === currentId} label={pillName(x)} value={x.count}
          disabled={locked} accessibilityLabel={sessionName(x, event)} onPress={() => pick(x.id!)} />)}
      </ScrollView>}
    {error ? <Text className="px-5 text-sm text-destructive">{error}</Text> : null}
  </View>;
}

/** A month of sessions: a dot on each day one was used; the sessions of the day touched as pills under it. */
function SessionCalendar({ list, current, disabled, onPick }: { list: SessionSummary[]; current: number | null; disabled: boolean; onPick: (id: number) => void }) {
  const byDay = useMemo(() => {
    const days = new Map<string, SessionSummary[]>();
    for (const x of list) if (x.count || x.id === current) days.set(dayKey(x.at), [...(days.get(dayKey(x.at)) ?? []), x]);
    return days;
  }, [list, current]);
  const start = list.find(x => x.id === current)?.at ?? new Date().toISOString();
  const [month, setMonth] = useState(() => { const d = new Date(start); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(() => dayKey(start));
  // Monday first: the blanks before the 1st, then the days of the month.
  const lead = (month.getDay() + 6) % 7, length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: "narrow" }));
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const today = new Date();
  return <View className="gap-3 px-5">
    <View className="flex-row items-center">
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Previous month")} onPress={() => shift(-1)} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={ChevronLeft} size={20} /></Pressable>
      <Text className="flex-1 text-center text-base font-extrabold capitalize">{month.toLocaleDateString(locale(), { month: "long", year: "numeric" })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Next month")} disabled={month > today} onPress={() => shift(1)} className={cn("size-11 items-center justify-center rounded-full active:bg-muted", month > today && "opacity-40")}><Icon as={ChevronRight} size={20} /></Pressable>
    </View>
    <View className="flex-row flex-wrap">
      {weekdays.map((w, i) => <Text key={"w" + i} className="w-[14.28%] pb-1 text-center text-xs font-bold text-muted-foreground">{w}</Text>)}
      {cells.map((d, i) => {
        if (!d) return <View key={i} className="h-10 w-[14.28%]" />;
        const key = d.toDateString(), used = byDay.has(key), on = key === day;
        return <View key={i} className="w-[14.28%] p-0.5">
          <Pressable accessibilityRole="button" accessibilityLabel={d.toLocaleDateString(locale(), { day: "numeric", month: "long" })} accessibilityState={{ selected: on, disabled: !used }} disabled={!used} onPress={() => setDay(key)}
            className={cn("h-10 items-center justify-center rounded-xl", on && "bg-primary")}>
            <Numeric className={cn("text-[14px] font-bold", on ? "text-primary-foreground" : used ? "text-foreground" : "text-muted-foreground/50", sameDay(d, today) && !on && "text-primary")}>{d.getDate()}</Numeric>
            <View className={cn("mt-0.5 size-[5px] rounded-full", used ? on ? "bg-primary-foreground" : "bg-primary" : "bg-transparent")} />
          </Pressable>
        </View>;
      })}
    </View>
    <View className="flex-row flex-wrap gap-2">
      {(byDay.get(day) ?? []).map(x => <Pill key={x.id} role="radio" on={x.id === current} label={x.name || hour(x.at)} value={x.count} disabled={disabled} onPress={() => onPick(x.id!)} />)}
    </View>
  </View>;
}

/** The six figures of the session, each with its colour dot. */
function SessionFigures({ solves }: { solves: SolveDto[] }) {
  const figures = useMemo(() => {
    const summary = practiceSummary(solves), times = summary.times, valid = times.filter((t): t is number => t !== null);
    return [
      ["Best", fmtTime(summary.best), "bg-success"], ["Ao5", fmtTime(summary.ao5), "bg-primary"], ["Ao12", fmtTime(summary.ao12), "bg-chart-2"],
      ["Mean", fmtTime(summary.mean), "bg-warning"], ["Worst", times.includes(null) ? "DNF" : fmtTime(valid.length ? Math.max(...valid) : null), "bg-destructive"],
      ["DNF", String(times.length - valid.length), "bg-muted-foreground"],
    ] as const;
  }, [solves]);
  return <View className="flex-row flex-wrap gap-y-2.5 px-5" accessibilityLabel={tr("Statistics")}>
    {figures.map(([label, value, dot]) => <Stat key={label} label={label} value={value} dot={dot} className="w-1/3" />)}
  </View>;
}

/** A figure with its caption and colour dot. */
export function Stat({ label, value, dot, className }: { label: string; value: string; dot: string; className?: string }) {
  return <View className={cn("min-w-0 gap-0.5 pr-2", className)}>
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-2 rounded-full", dot)} />
      <Text numberOfLines={1} className="text-xs font-semibold text-muted-foreground">{said(label)}</Text>
    </View>
    <Numeric numberOfLines={1} className={cn("text-xl font-extrabold tracking-[-0.02em]", value === "–" && "text-muted-foreground/60")}>{value}</Numeric>
  </View>;
}

/** A time of the list: its number, the time in its tone, its marks and hour; swiped left, +2, DNF and Delete. */
const TimeRow = memo(function TimeRow({ solve, number, tone }: { solve: SolveDto; number: number; tone: ReturnType<typeof solveTone> }) {
  const { togglePenalty, deleteTime, busy } = useSolveMenu();
  const dnf = solve.penalty === "dnf";
  return <ReanimatedSwipeable friction={1.6} rightThreshold={36} overshootRight={false} containerStyle={{ borderRadius: 12 }}
    renderRightActions={(_progress, _translation, swipe) => <View className="flex-row gap-0.5 pl-0.5">
      <SwipeAction label="+2" icon={Plus} className="bg-warning/20" text="text-warning" disabled={busy} onPress={() => { swipe.close(); void togglePenalty(solve, "+2"); }} />
      <SwipeAction label={tr("DNF")} icon={Ban} className="bg-muted" text="text-foreground" disabled={busy} onPress={() => { swipe.close(); void togglePenalty(solve, "dnf"); }} />
      <SwipeAction label={tr("Delete")} icon={Trash2} className="rounded-r-xl bg-destructive/25" text="text-destructive" disabled={busy} onPress={() => { swipe.close(); void deleteTime(solve.id); }} />
    </View>}>
    <SolveMenu solve={solve} className="h-11 flex-row items-center gap-3 rounded-xl bg-popover px-2.5 active:bg-muted/50">
      <Numeric className="w-6 text-right text-[13px] font-semibold text-muted-foreground">{number}</Numeric>
      <Numeric className={cn("text-base font-bold", TONE_TEXT[tone], solve.penalty === "+2" && tone === "" && "text-warning")}>{fmtSolve(solve.time_ms, solve.penalty)}</Numeric>
      {dnf && <Numeric className="text-xs text-muted-foreground">({fmtTime(effective(solve.time_ms, "none"))})</Numeric>}
      {solve.comment ? <Icon as={MessageSquare} size={14} className="text-muted-foreground" accessibilityLabel={tr("Comment")} /> : null}
      {solve.solution ? <Icon as={Rotate3d} size={14} className="text-muted-foreground" accessibilityLabel={tr("Turned on a connected cube")} /> : null}
      <Numeric className="ml-auto text-xs text-muted-foreground">{hour(solve.created_at)}</Numeric>
    </SolveMenu>
  </ReanimatedSwipeable>;
});

function SwipeAction({ label, icon, className, text, disabled, onPress }: { label: string; icon: typeof Plus; className: string; text: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} className={cn("h-11 w-[58px] items-center justify-center gap-0.5", className, disabled && "opacity-50")}>
    <Icon as={icon} size={16} className={text} />
    <Text className={cn("text-xs font-extrabold", text)}>{label}</Text>
  </Pressable>;
}
