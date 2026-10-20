import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { BadgeCheck, CircleHelp, History, Play, Undo2 } from "lucide-react-native";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  bucketOf, cancelDaily, dailyDay, dailyScramble, dailyStats, fetchDaily, fetchDailyHistory, dailyEventOf, DailyError,
  type DailyBoard, type DailyDay, type DailyEvent, type DailyPlace,
} from "../../../src/client/lib/daily";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { eventInfo, heldScramble, puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import { API_ORIGIN, api, authToken, local } from "../api";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { ask } from "../components/Confirm";
import { Alg, Bar, Choice, Empty, Fade, HeadButton, Numeric } from "../components/layout";
import { Sheet, SheetFlatList } from "../components/Sheet";
import { SaveError, StopSurface, timerHint, useTimerChrome } from "../components/Practice";
import { ScrambleCube } from "../components/ScrambleCube";
import { Cap, SidePanel, TimerCard } from "../components/duel/parts";
import { useLayout } from "../hooks/useLayout";
import { useTimer } from "../hooks/useTimer";
import { ensureLaunchSession } from "../lib/launchSession";
import { storage } from "../platform/storage";
import { nativeEngine } from "../scrambler";
import { goBackAtom, puzzleAtom, guidesAtom, replaceRouteAtom, routeAtom, signedInAtom } from "../state";
import { localFormat, tn, tr } from "../../../src/client/i18n";

/**
 * The daily scramble (src/client/lib/daily.ts), after the web's desktop/renderer/daily.tsx: the day's scramble of an
 * event and its one ranked attempt, the day's four figures, the field as bars. The attempt is timed on a screen of its
 * own (hold, then release), saved as a timer solve and ranked; where it stands follows in a sheet. The player's results
 * (records and days) are in the History sheet; a past day (`day` YYYY-MM-DD) shows its scramble and its field. On a
 * tablet the scramble has its cube and the results come with the day: a card at its foot, or docked beside it on a wide
 * screen, where the day's stage and its field stand side by side.
 *
 * @public Loaded on demand, by `require` (App.tsx, CoachingPage.tsx).
 */
export function DailyPage({ day }: { day?: string }) {
  const attempt = useAtomValue(attemptAtom);
  if (day && day !== dailyDay()) return <PastDay day={day} />;
  return <>
    {attempt ? <Attempt event={attempt} /> : <Today />}
    <ResultSheet />
  </>;
}

// What the page read, kept for its next opening: shown at once, then read anew. A ranking that cannot be read stays as
// it was, "offline" only when none was read yet. The fields and histories are kept by account.
const scrambles = new Map<string, string>(),
  boards = new Map<string, DailyBoard | "offline">(),
  histories = new Map<string, DailyDay[] | "offline">();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const useDaily = () => useSyncExternalStore(subscribe, () => version);

const account = () => local.current()?.id ?? "guest";
const token = () => (local.current()?.isGuest ? null : authToken.get());
const VERIFIED_KEY = "cubix.daily.verified", DONE_KEY = "cubix.daily.done";
/** The fields and results show only verified ones (made on a connected cube). */
const verifiedAtom = atom(storage.getItem(VERIFIED_KEY) === "true", (_, set, on: boolean) => { storage.setItem(VERIFIED_KEY, String(on)); set(verifiedAtom, on); });
/** The daily scramble the page shows: the puzzle chosen's. */
const useEvent = () => dailyEventOf(useAtomValue(puzzleAtom));
/** The event being solved on the attempt screen. */
const attemptAtom = atom<DailyEvent | null>(null);

type Done = { solveId: number; timeMs: number; penalty: DailyPlace["penalty"]; verified?: boolean; sent: boolean };
/**
 * The ranked attempts of this device, by day and event: the first solve of a daily scramble, sent once online (`sent`).
 * Later attempts are placed among the others, not ranked.
 */
const doneAll = (): Record<string, Done> => { try { return JSON.parse(storage.getItem(DONE_KEY) ?? "{}"); } catch { return {}; } };
function saveDone(done: Record<string, Done>) {
  // Only today's and yesterday's matter: the API ranks no older attempt.
  const oldest = dailyDay(Date.now() - 86_400_000);
  storage.setItem(DONE_KEY, JSON.stringify(Object.fromEntries(Object.entries(done).filter(([key]) => key >= oldest))));
  emit();
}
/** Sends the ranked attempts not sent yet (made offline, or whose penalty changed). */
async function flush() {
  const t = token();
  if (!t) return;
  for (const [key, v] of Object.entries(doneAll())) {
    if (v.sent) continue;
    const [day, event] = key.split(":") as [string, string];
    try { await fetchDaily(API_ORIGIN, t, event, day, { timeMs: v.timeMs, penalty: v.penalty }, true); }
    catch (e) { if (!(e instanceof DailyError)) continue; /* Refused (too fast, a day gone): not sent again. */ }
    saveDone({ ...doneAll(), [key]: { ...v, sent: true } });
  }
}

/** The day's scramble of an event and its field, in the view chosen, with the attempt kept on this device placed in it. */
async function loadDaily(event: DailyEvent, day: string, verified: boolean) {
  const key = `${day}:${event}`, kept = doneAll()[key], held = `${account()}:${key}:${verified}`;
  if (!scrambles.has(key)) void dailyScramble(day, event, nativeEngine).then(v => { scrambles.set(key, v); emit(); }, () => {});
  await flush();
  try { boards.set(held, await fetchDaily(API_ORIGIN, token(), event, day, kept ? { timeMs: kept.timeMs, penalty: kept.penalty } : undefined, false, verified)); }
  catch { if (!boards.has(held)) boards.set(held, "offline"); }
  emit();
}
/** The player's results on an event, in the view chosen. */
async function loadHistory(event: DailyEvent, verified: boolean) {
  const key = `${account()}:${event}:${verified}`, t = token();
  if (!t) return;
  try { await flush(); histories.set(key, await fetchDailyHistory(API_ORIGIN, t, event, verified)); }
  catch { if (!histories.has(key)) histories.set(key, "offline"); }
  emit();
}

const DAY = localFormat({ day: "numeric", month: "long", timeZone: "UTC" }), SHORT = localFormat({ weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** A UTC day in words: "10 October", or "Sat 10 Oct" in a list. */
const dayLabel = (day: string) => DAY.format(new Date(day + "T12:00:00Z"));
const shortDay = (day: string) => SHORT.format(new Date(day + "T12:00:00Z"));
/** An axis time: whole or tenth seconds, minutes past one. */
const axis = (ms: number) => (ms >= 60000 ? fmtTime(ms).replace(/\.\d+$/, "") : String(+(ms / 1000).toFixed(1))) + " s";
const eventLabel = (id: string) => tr(eventInfo(id)?.label ?? id);

/** Challenges › Daily: today's scramble of the event and its one action, the day's figures, the field; the player's results in the History sheet. */
function Today() {
  const { wide } = useLayout(), event = useEvent(), [history, setHistory] = useState(false);
  return <View className="flex-1">
    <AppBar>{wide ? null : <HeadButton icon={History} label={tr("History")} onPress={() => setHistory(true)} />}</AppBar>
    <SectionTabs />
    <DayWithResults day={dailyDay()} />
    {wide ? null : <Sheet open={history} onClose={() => setHistory(false)} title={tr("History")} description={eventLabel(event)}>
      <YourResults event={event} onPick={() => setHistory(false)} />
    </Sheet>}
  </View>;
}

/** A day and, on a tablet, the player's results with it: a card at its foot (portrait), a docked panel (wide). */
function DayWithResults({ day }: { day: string }) {
  const { tablet, wide } = useLayout(), event = useEvent();
  return <View className="min-h-0 flex-1 flex-row">
    <View className="min-h-0 flex-1">
      <DayView day={day} />
      {tablet && !wide ? <View className="px-7 pb-3"><YourResults event={event} peek /></View> : null}
    </View>
    {wide ? <SidePanel><YourResults event={event} docked /></SidePanel> : null}
  </View>;
}

/** A past day, opened from the results: its scramble, where the player stood, its field. */
function PastDay({ day }: { day: string }) {
  const event = useEvent();
  return <View className="flex-1">
    <PushedBar title={shortDay(day)} sub={eventLabel(event)} />
    <DayWithResults day={day} />
  </View>;
}

/** The figures of a day: time, share beaten, rank and field. */
function Figures({ board, place, cards = false }: { board: DailyBoard | null; place: DailyPlace | null; cards?: boolean }) {
  const total = board ? board.total + (place && place !== board.mine ? 1 : 0) : 0;
  // On a tablet each figure stands on a card of its own.
  const figure = (value: string | null, label: string, tone?: string) => <View className={cn("min-w-0 flex-1 items-center", cards && "rounded-2xl bg-card py-3")}>
    <Numeric numberOfLines={1} className={cn("text-xl font-extrabold tracking-[-0.02em]", value ? tone : "text-muted-foreground/60")}>{value ?? "–"}</Numeric>
    <Text className="text-xs text-muted-foreground">{label}</Text>
  </View>;
  return <View className={cn("flex-row", cards && "gap-2.5")}>
    {figure(place ? fmtSolve(place.timeMs, place.penalty) : null, tr("Time"))}
    {figure(place ? `${place.beats.toLocaleString()} %` : null, tr("Beats"), "text-success")}
    {figure(place && board ? tr("{0} of {1}", { 0: place.rank, 1: total }) : null, tr("Rank"))}
    {figure(board ? board.total.toLocaleString() : null, tr("Solvers"))}
  </View>;
}

/** Whether a result was made on a connected cube (its moves recorded, verified) or timed on the screen. */
function Verified({ on }: { on: boolean }) {
  return <Badge variant={on ? "success" : "secondary"}>
    {on ? <Icon as={BadgeCheck} size={12} className="text-success" /> : null}
    <Text className={on ? undefined : "text-muted-foreground"}>{on ? tr("Verified") : tr("Not verified")}</Text>
  </Badge>;
}

/** The field shown: every result, or only the verified ones. */
function FieldView({ board }: { board: DailyBoard | null }) {
  const [verified, setVerified] = useAtom(verifiedAtom);
  return <Choice label={tr("Results shown")} value={verified ? "verified" : "all"} onChange={id => setVerified(id === "verified")}
    options={[{ id: "all", label: tr("All"), count: board?.allTotal }, { id: "verified", label: tr("Verified"), count: board?.verifiedTotal }]} />;
}

/** The field as bars on their side: a row per bucket of times, as long as its solvers, the player's in the accent. */
function Field({ board, place }: { board: DailyBoard; place: DailyPlace | null }) {
  const { from, width, counts } = board.buckets, max = Math.max(1, ...counts), mark = bucketOf(board, place);
  if (!counts.length) return <Empty title={tr("No finished solve yet today")} className="p-2" />;
  return <View accessibilityLabel={tr("How the day's times spread, {0} solvers", { 0: board.total })} className="min-h-0 flex-1 gap-1">
    {counts.map((n, i) => <View key={i} accessibilityLabel={`${axis(from + i * width)}: ${tn(n, "{n} solver")}${i === mark ? " · " + tr("You") : ""}`}
      className="max-h-6 min-h-2 flex-1 flex-row items-center gap-2">
      <Numeric className={cn("w-12 text-right text-[11px] font-semibold", i === mark ? "text-primary" : "text-muted-foreground")}>{axis(from + i * width)}{i === counts.length - 1 ? "+" : ""}</Numeric>
      <View className="h-full max-h-3.5 min-w-0 flex-1 flex-row items-center">
        <View className={cn("h-full rounded-[4px]", i === mark ? "bg-primary" : "bg-primary/45")} style={{ width: `${(n / max) * 100}%`, minWidth: n ? 4 : 0 }} />
      </View>
      <Numeric className={cn("w-7 text-[11px]", i === mark ? "font-bold text-primary" : "text-muted-foreground")}>{i === mark ? tr("You") : n}</Numeric>
    </View>)}
  </View>;
}

/** A day of an event: the event, its scramble and one action, its figures, its field. */
function DayView({ day }: { day: string }) {
  useDaily();
  const event = useEvent();
  const verified = useAtomValue(verifiedAtom), signedIn = useAtomValue(signedInAtom), openGuide = useSetAtom(guidesAtom), solve = useSetAtom(attemptAtom);
  const today = dailyDay(), past = day !== today, key = `${day}:${event}`, kept = doneAll()[key];
  const scramble = scrambles.get(key) ?? "", board = boards.get(`${account()}:${key}:${verified}`) ?? null;
  useEffect(() => { void loadDaily(event, day, verified); }, [event, day, verified, kept?.penalty, kept?.timeMs]);
  const loaded = board && board !== "offline" ? board : null, place = loaded ? loaded.mine ?? loaded.placed : null, done = !!kept || !!loaded?.mine;
  const { tablet, wide } = useLayout(), info = eventInfo(event);
  const head = <View className="flex-row items-center justify-between gap-2">
    <Cap className="flex-1">{dayLabel(day)} · {eventLabel(event)}</Cap>
    <HeadButton icon={CircleHelp} label={tr("How the daily scramble works")} onPress={() => openGuide("timer")} />
  </View>;
  const alg = scramble ? <Alg text={scramble} size={tablet && !wide ? 21 : 18} /> : <View className="gap-2"><Skeleton className="h-5 w-11/12" /><Skeleton className="h-5 w-3/5" /></View>;
  const stage = <View className={cn("gap-2.5 rounded-3xl bg-card p-4", tablet && "gap-3.5 p-5")}>
    {/* A tablet shows the scrambled cube beside the moves. */}
    {tablet ? <View className="flex-row items-start gap-4">
      {scramble && info ? <ScrambleCube puzzle={info.puzzle} cubeSize={puzzleInfo(info.puzzle).cubeSize} scramble={scramble} held={heldScramble("normal")} size={wide ? 96 : 140} /> : null}
      <View className="min-w-0 flex-1 gap-2">{head}{alg}</View>
    </View> : <>{head}{alg}</>}
    {board === null ? <Skeleton className="h-14 rounded-2xl" />
      : (past || done) && place ? <View className="gap-1.5">
        <View className="flex-row items-baseline gap-2">
          <Numeric className="text-2xl font-extrabold text-success">{place.beats.toLocaleString()} %</Numeric>
          <Text className="text-sm text-muted-foreground">{tr("of the field beaten")}</Text>
        </View>
        <Bar ratio={place.beats / 100} fill="bg-success" className="h-1.5" />
      </View>
      : past ? <Text className="py-2 text-sm text-muted-foreground">{tr("Not tried that day")}</Text>
      : <Button size="lg" className="h-14 gap-2 rounded-2xl" onPress={() => solve(event)}>
        <Icon as={Play} size={20} className="text-primary-foreground" />
        <Text className="text-base font-bold">{tr("Solve it")}</Text>
      </Button>}
    <View className="flex-row flex-wrap items-center gap-1.5">
      {loaded?.mine ? <Verified on={loaded.mine.verified} /> : null}
      <Badge variant="secondary"><Text className="text-muted-foreground">{tr("1 attempt / day")}</Text></Badge>
      {!signedIn ? <Text className="text-xs text-muted-foreground">{tr("Guests are not ranked.")}</Text> : null}
    </View>
  </View>;
  const field = <View className="min-h-0 flex-1 gap-2 rounded-3xl bg-card px-4 pt-3 pb-3">
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" numberOfLines={1} className="shrink text-base font-bold">{past ? tr("Field of {0}", { 0: dayLabel(day) }) : tr("Today's field")}</Text>
      <FieldView board={loaded} />
    </View>
    {board === null ? <Skeleton className="min-h-16 flex-1 rounded-2xl" />
      : board === "offline" ? <Empty title={tr("The ranking comes once you are online.")} className="p-2" />
      : <Field board={board} place={place} />}
  </View>;
  // A wide screen sets the day's stage and its figures beside its field.
  if (wide) return <View className="min-h-0 flex-1 flex-row gap-4 px-7 pt-4 pb-3">
    <View className="w-[400px] gap-3">{stage}<Figures board={loaded} place={place} cards /></View>
    {field}
  </View>;
  return <View className={cn("min-h-0 flex-1 gap-2.5 px-4 pt-3 pb-3", tablet && "gap-3.5 px-7 pt-4")}>
    {stage}
    <Figures board={loaded} place={place} cards={tablet} />
    {field}
  </View>;
}

/** The result of the attempt just made (or the day's, from the results), in the sheet: `fresh` just solved. */
type Shown = { day: string; event: DailyEvent; solveId: number; timeMs: number; penalty: DailyPlace["penalty"]; ranked: boolean; fresh: boolean; board: DailyBoard | null; error?: string };
const shownAtom = atom<Shown | null>(null);
const OFFLINE = "Offline: your time is kept, the ranking comes once you are online.";

/** The field of the attempt shown, once the ranked attempts are sent. */
async function placeAttempt(r: Shown, verified: boolean): Promise<Shown> {
  await flush();
  try { return { ...r, board: await fetchDaily(API_ORIGIN, token(), r.event, r.day, { timeMs: r.timeMs, penalty: r.penalty }, false, verified), error: undefined }; }
  catch (e) { return { ...r, error: e instanceof DailyError ? e.message : tr(OFFLINE) }; }
}

/** The attempt: the day's scramble over the player's timer; the stop saves it as a timer solve and ranks it. */
function Attempt({ event }: { event: DailyEvent }) {
  useDaily();
  const close = useSetAtom(attemptAtom), show = useSetAtom(shownAtom), verified = useAtomValue(verifiedAtom);
  const day = dailyDay(), key = `${day}:${event}`, scramble = scrambles.get(key) ?? "";
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!scramble) void loadDaily(event, day, verified); }, [scramble]);
  const timer = useTimer({
    canStart: !!scramble && !saving,
    onStop: async ms => {
      setSaving(true);
      try {
        const info = eventInfo(event)!, context: PracticeContext = { puzzle: info.puzzle, solveMode: info.solveMode, scrambleType: "normal" };
        const sessionId = await ensureLaunchSession("playground", context);
        const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context });
        // The first solve of the day's scramble is the ranked attempt; later ones are only placed in the field.
        const ranked = !doneAll()[key];
        if (ranked) saveDone({ ...doneAll(), [key]: { solveId: solve.id, timeMs: ms, penalty: "none", sent: false } });
        const shown: Shown = { day, event, solveId: solve.id, timeMs: ms, penalty: "none", ranked, fresh: ranked, board: null };
        show(shown);
        close(null);
        show(await placeAttempt(shown, verified));
      } finally { setSaving(false); }
    },
  });
  useTimerChrome(timer);
  const running = timer.phase === "running";
  return <View className="flex-1">
    <Fade hidden={running}><PushedBar title={tr("Daily scramble")} sub={`${eventLabel(event)} · ${dayLabel(day)}`} back="close" onBack={() => close(null)} /></Fade>
    <View className="min-h-0 flex-1 gap-3 px-4 pt-1 pb-3">
      <Fade hidden={running}>
        {scramble ? <Alg text={scramble} size={19} /> : <Skeleton className="h-6 w-11/12" />}
      </Fade>
      <TimerCard timer={timer} rest="0.00" disabled={!scramble || saving} hint={timerHint(timer, { disabled: !scramble ? tr("One moment…") : saving ? tr("Saving…") : false })} />
      <SaveError timer={timer} />
    </View>
    <StopSurface timer={timer} />
  </View>;
}

/** After the attempt: where it stands, its penalty, cancelling a false start (once a day, soon after), and the field. */
function ResultSheet() {
  const [r, setShown] = useAtom(shownAtom), verified = useAtomValue(verifiedAtom), signedIn = useAtomValue(signedInAtom), solve = useSetAtom(attemptAtom);
  const board = r?.board ?? null, ranked = !!r?.ranked && signedIn, place = board ? (ranked ? board.mine ?? board.placed : board.placed) : null;
  // A false start or a stop missed: just solved, the API still allowing it (guests are not ranked, theirs stays local).
  const cancellable = !!r?.fresh && !!r.ranked && (signedIn ? !!board?.mine?.cancellable : true);
  useEffect(() => { if (r?.board) void placeAttempt(r, verified).then(setShown); }, [verified]);
  if (!r) return null;
  const penalty = async (p: "+2" | "dnf") => {
    const next = r.penalty === p ? "none" : p, key = `${r.day}:${r.event}`, entry = doneAll()[key];
    await api.setPenalty(r.solveId, next).catch(() => {});
    if (r.ranked && entry?.solveId === r.solveId) saveDone({ ...doneAll(), [key]: { ...entry, penalty: next, sent: false } });
    setShown(await placeAttempt({ ...r, penalty: next }, verified));
  };
  const cancel = async () => {
    if (!(await ask({ title: tr("Cancel this time?"), text: tr("Your ranked attempt goes, and you may solve the daily scramble again. Once a day, within two minutes of the solve."), action: tr("Cancel the time") }))) return;
    try {
      const t = token();
      if (t) { await flush(); await cancelDaily(API_ORIGIN, t, r.event, r.day); }
    } catch (e) {
      setShown({ ...r, fresh: false, error: e instanceof DailyError ? e.message : tr(OFFLINE) });
      return;
    }
    const { [`${r.day}:${r.event}`]: _, ...rest } = doneAll();
    saveDone(rest);
    await api.deleteSolve(r.solveId).catch(() => {});
    setShown(null);
    solve(r.event);
  };
  return <Sheet open onClose={() => setShown(null)} title={tr("Daily scramble")} description={`${eventLabel(r.event)} · ${dayLabel(r.day)}`}>
    {board ? <>
      <Figures board={board} place={place} />
      <View className="flex-row flex-wrap items-center justify-center gap-2">
        {ranked && board.mine ? <Verified on={board.mine.verified} /> : null}
        {!signedIn || !ranked ? <Text className="text-center text-sm text-muted-foreground">{!signedIn ? tr("Guests are not ranked.") : tr("Not ranked: only the first attempt of the day counts.")}</Text> : null}
      </View>
      <View className="h-48 gap-2">
        <View className="items-center"><FieldView board={board} /></View>
        <Field board={board} place={place} />
      </View>
    </> : r.error ? <Empty title={r.error} className="p-2" /> : <Skeleton className="h-48 rounded-2xl" />}
    {r.fresh ? <View className="flex-row gap-2">
      {(["+2", "dnf"] as const).map(p => <Button key={p} variant={r.penalty === p ? "default" : "secondary"} className="h-11 flex-1 rounded-xl" onPress={() => void penalty(p)}>
        <Text>{p === "dnf" ? tr("DNF") : "+2"}</Text>
      </Button>)}
    </View> : null}
    <View className="flex-row gap-2">
      {cancellable ? <Button variant="ghost" className="h-12 flex-1 gap-1.5 rounded-xl" accessibilityLabel={tr("Cancel this time")} onPress={() => void cancel()}>
        <Icon as={Undo2} size={16} className="text-destructive" /><Text className="text-destructive">{tr("Cancel")}</Text>
      </Button> : null}
      <Button className="h-12 flex-1 rounded-xl" onPress={() => setShown(null)}><Text>{tr("Close")}</Text></Button>
    </View>
  </Sheet>;
}

/**
 * The player's results on the event: best, mean, mean rank and the run of days, then each day newest first (today on
 * top while not tried), its time, rank and whether it is verified; a day opens its field. From the API once signed in,
 * else the attempts kept on this device. In the History sheet by default, which `onPick` closes as a day opens; on a
 * tablet they also come with the day: `peek`, the figures on one row and the latest two days, in a card at its foot;
 * `docked`, in the side panel, where a day opens in place of the one shown.
 */
function YourResults({ event, peek = false, docked = false, onPick }: { event: DailyEvent; peek?: boolean; docked?: boolean; onPick?: () => void }) {
  useDaily();
  const verified = useAtomValue(verifiedAtom), signedIn = useAtomValue(signedInAtom), navigate = useSetAtom(routeAtom), replace = useSetAtom(replaceRouteAtom), goBack = useSetAtom(goBackAtom), solve = useSetAtom(attemptAtom);
  const today = dailyDay(), kept = doneAll()[`${today}:${event}`];
  const history = !signedIn ? "offline" : histories.get(`${account()}:${event}:${verified}`) ?? null;
  useEffect(() => { if (signedIn) void loadHistory(event, verified); }, [event, verified, signedIn, kept?.penalty, kept?.timeMs]);
  // Offline or a guest: the attempts this device keeps (today's and yesterday's).
  const list: DailyDay[] = history && history !== "offline" ? history
    : Object.entries(doneAll()).filter(([key]) => key.endsWith(":" + event))
      .map(([key, v]) => ({ day: key.split(":")[0]!, timeMs: v.timeMs, penalty: v.penalty, verified: !!v.verified, rank: 0, beats: 0, total: 0 }))
      .sort((a, b) => b.day.localeCompare(a.day));
  const stats = dailyStats(list, today), ranked = history && history !== "offline";
  // The card at the foot of today leaves today out: its scramble and Solve it are right above.
  const rows: (DailyDay | null)[] = peek ? list.filter(v => v.day !== today).slice(0, 2) : [...(list.some(v => v.day === today) ? [] : [null]), ...list];
  // A card's ground stands out from the panel or the card around it.
  const ground = docked ? "bg-muted" : "bg-card", List = (docked ? FlatList : SheetFlatList) as typeof FlatList;
  const stat = (label: string, value: string | null, dot: string, tone?: string) => <View className={cn("min-w-0 flex-1 gap-0.5 rounded-2xl px-3.5 py-2.5", ground)}>
    <View className="flex-row items-center gap-1.5"><View className={cn("size-2 rounded-full", dot)} /><Text className="text-xs font-semibold text-muted-foreground">{label}</Text></View>
    <Numeric numberOfLines={1} className={cn("text-xl font-extrabold tracking-[-0.02em]", value ? tone : "text-muted-foreground/60")}>{value ?? "–"}</Numeric>
  </View>;
  const best = stat(tr("Best"), stats.best != null ? fmtTime(stats.best) : null, "bg-success", "text-success"),
    mean = stat(tr("Mean"), stats.mean != null ? fmtTime(stats.mean) : null, "bg-primary"),
    rank = stat(tr("Mean rank"), ranked && stats.rank != null ? stats.rank.toLocaleString() : null, "bg-muted-foreground"),
    streak = stat(tr("Streak"), tn(stats.streak, "{n} day"), "bg-warning", "text-warning");
  // A day opens over today, then (docked) replaces the past day shown; today goes back to it.
  const route = useAtomValue(routeAtom), onPast = route.page === "daily" && !!route.day;
  const toToday = () => { if (onPast) goBack(); };
  const open = (v: DailyDay | null) => {
    onPick?.();
    if (!v || v.day === today) toToday();
    else if (docked && onPast) replace({ page: "daily", day: v.day });
    else navigate({ page: "daily", day: v.day });
  };
  const row = (v: DailyDay | null) => {
    const isToday = !v || v.day === today;
    return <Pressable key={v?.day ?? "today"} accessibilityRole="button" accessibilityLabel={v ? shortDay(v.day) : tr("Today")} onPress={() => open(v)}
      className={cn("min-h-14 flex-row items-center gap-3 rounded-2xl py-2 pr-3 pl-4 active:bg-muted/50", ground, isToday && "border-l-[3px] border-primary")}>
      <Numeric className={cn("w-16 text-lg font-extrabold", !v ? "text-muted-foreground/60" : v.penalty === "dnf" ? "text-destructive" : v.timeMs + (v.penalty === "+2" ? 2000 : 0) === stats.best ? "text-success" : "")}>
        {v ? fmtSolve(v.timeMs, v.penalty) : "–"}
      </Numeric>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-bold">{isToday ? tr("Today") : shortDay(v!.day)}</Text>
        <Numeric numberOfLines={1} className="text-xs text-muted-foreground">
          {!v ? tr("Not tried yet") : v.total ? [tr("{0} of {1}", { 0: v.rank, 1: v.total }), v.penalty !== "dnf" ? tr("beats {0} %", { 0: v.beats.toLocaleString() }) : null].filter(Boolean).join(" · ") : eventLabel(event)}
        </Numeric>
      </View>
      {!v ? <Button size="sm" className="h-10 rounded-xl" onPress={() => { onPick?.(); solve(event); toToday(); }}><Text>{tr("Solve it")}</Text></Button> : <Verified on={v.verified} />}
    </Pressable>;
  };
  if (peek) return <View accessibilityLabel={tr("Your results")} className="gap-2.5 rounded-[22px] border border-border bg-popover p-4">
    <Text accessibilityRole="header" className="text-base font-bold">{tr("Your results")}</Text>
    <View className="flex-row gap-2">{best}{mean}{rank}{streak}</View>
    {history === null ? <Skeleton className="h-14 rounded-2xl" /> : rows.map(row)}
  </View>;
  return <>
    {docked ? <Text accessibilityRole="header" className="text-lg font-extrabold tracking-[-0.02em]">{tr("Your results")}</Text> : null}
    <View className="flex-row gap-2">{best}{mean}</View>
    <View className="flex-row gap-2">{rank}{streak}</View>
    <Cap className="mt-1.5">{tr("Your days")}</Cap>
    {history === null ? <Skeleton className={cn("min-h-24 rounded-2xl", docked && "flex-1")} />
      : <List data={rows} keyExtractor={v => v?.day ?? "today"} className={docked ? "min-h-0 flex-1" : undefined} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
        ListFooterComponent={!signedIn ? <Text className="px-1 pt-2 text-sm text-muted-foreground">{tr("Guests are not ranked.")}</Text> : null}
        renderItem={({ item }) => row(item)} />}
  </>;
}
