/**
 * Native setup and tour. The setup walks through a welcome, the puzzles the player can solve (methods inline under
 * each chosen one) and the times of another timer; any other puzzle opens on its course. It saves with `api.updateJourney` like the web. The tour opens each step's page once the page stack has stopped sliding, then
 * dims everything but the step's tab and the view it points at inside the page (`useTourTarget`).
 */
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ArrowLeft, ArrowRight, Ban, Check, GraduationCap, Plus, Shapes, Timer, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtTime, parseTypedTime } from "../../../src/client/lib/format";
import { PROFILE_KEY, TOUR_STEPS, journeyProfile, type Journey } from "../../../src/client/lib/journey";
import { METHODS } from "../../../src/shared/methods";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { api, local } from "../api";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { introductionAtom, journeyAtom } from "../journey";
import { eventAtom, puzzleAtom, replaceRouteAtom, scrambleTypeAtom, tabOf, trainingSetupModeAtom, trainingStepAtom, userAtom, type Page } from "../state";
import { alpha, useColors } from "../theme";
import { ImportTimes } from "./ImportTimes";
import { IconTile, Label } from "./layout";
import { Logo } from "./Logo";
import { PuzzleIcon } from "./PuzzlePicker";
import { measureTourTarget, settledPageAtom, tourTargetsVersionAtom, type Rect } from "../tour";
import { tr } from "../../../src/client/i18n";

/** A step's content slides in a little from the side it comes from (forward: from the right) and fades in. */
function StepTransition({ children, identity, direction = 1 }: { children: ReactNode; identity: string | number; direction?: number }) {
  const progress = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [identity, progress, reduced]);
  return <Animated.View style={{ opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [direction * 24, 0] }) }] }}>{children}</Animated.View>;
}

/** A puzzle tile: its WCA glyph and name, ticked when chosen. */
function Tile({ label, checked, glyph, onPress }: { label: string; checked: boolean; glyph: ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress}
    className={cn("h-18 w-[23.5%] items-center justify-center gap-1.5 rounded-lg border px-1 active:bg-muted/50", checked ? "border-primary/50 bg-primary/10" : "border-border bg-card")}>
    {glyph}
    <Text numberOfLines={1} className="text-xs font-medium tracking-tight">{label}</Text>
    {checked ? <Icon as={Check} size={14} strokeWidth={3} className="absolute top-1.5 right-1.5 text-primary" /> : null}
  </Pressable>;
}

type MethodMap = Partial<Record<PuzzleId, string[]>>;

/** Puzzles as tiles, then the methods and the best single of each chosen one, in the order they were picked. */
function PuzzleStep({ value, methods, bests, onToggle, onNone, onMethod, onBest }: {
  value: PuzzleId[]; methods: MethodMap; bests: Partial<Record<PuzzleId, string>>; onToggle: (id: PuzzleId) => void; onNone: () => void;
  onMethod: (puzzle: PuzzleId, method: string) => void; onBest: (puzzle: PuzzleId, text: string) => void;
}) {
  const colors = useColors();
  return <View className="gap-4">
    <View className="flex-row flex-wrap justify-between gap-y-1.5" accessibilityLabel={tr("Puzzles you can solve")}>
      <Tile label={tr("None yet")} checked={!value.length} onPress={onNone} glyph={<Icon as={Ban} size={24} strokeWidth={1.5} className={!value.length ? "text-primary" : "text-muted-foreground"} />} />
      {PUZZLES.map(p => {
        const on = value.includes(p.id);
        return <Tile key={p.id} label={tr(p.label)} checked={on} onPress={() => onToggle(p.id)} glyph={<PuzzleIcon puzzle={p.id} size={24} color={on ? colors.primary : colors.mutedForeground} />} />;
      })}
    </View>
    <View className="gap-1" accessibilityLabel={tr("Methods")}>
      <Label>{tr("Methods you know")}</Label>
      {value.length ? value.map(id => <View key={id} className="gap-2 border-b border-border py-2.5 last:border-b-0">
        <View className="flex-row items-center gap-2">
          <PuzzleIcon puzzle={id} size={18} color={colors.mutedForeground} />
          <Text className="min-w-0 flex-1 text-sm font-medium">{tr(puzzleInfo(id).label)}</Text>
          <PbInput puzzle={tr(puzzleInfo(id).label)} value={bests[id] ?? ""} onChange={text => onBest(id, text)} />
        </View>
        {METHODS[id].length ? <View className="flex-row flex-wrap gap-1.5" accessibilityLabel={tr("{0} methods", { 0: tr(puzzleInfo(id).label) })}>
          {METHODS[id].map(m => {
            const on = methods[id]?.includes(m.id) ?? false;
            return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${tr(puzzleInfo(id).label)} ${tr(m.name)}`} onPress={() => onMethod(id, m.id)}
              className={cn("h-11 flex-row items-center gap-1.5 rounded-lg border px-3 active:bg-muted/50", on ? "border-primary/50 bg-primary/10" : "border-border")}>
              <Icon as={on ? Check : Plus} size={14} strokeWidth={on ? 3 : 2} className={on ? "text-primary" : "text-muted-foreground"} />
              <Text className={cn("text-sm", on ? "text-foreground" : "text-muted-foreground")}>{tr(m.name)}</Text>
            </Pressable>;
          })}
        </View> : null}
      </View>) : <Text className="py-2.5 text-sm text-muted-foreground">{tr("Nothing yet? Qbix starts you on the 3×3 course.")}</Text>}
    </View>
  </View>;
}

/** The best single on a puzzle, typed as 12.34 or 1:05.21; optional, and flagged while it does not read as a time. */
function PbInput({ puzzle, value, onChange }: { puzzle: string; value: string; onChange: (text: string) => void }) {
  const invalid = !!value.trim() && parseTypedTime(value) === null;
  return <View className="flex-row items-center gap-2">
    <Text className="text-xs text-muted-foreground">{tr("PB")}</Text>
    <Input value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder={tr("PB · 12.34")} accessibilityLabel={tr("Your best {0} single", { 0: puzzle })}
      aria-invalid={invalid} className={cn("h-11 w-28 text-right tabular-nums", invalid && "border-destructive")} />
  </View>;
}

const STEPS = [
  { label: "Welcome", title: "Welcome to Qbix", sub: "A few seconds to set the app up for you" },
  { label: "Puzzles", title: "What can you solve?", sub: "The puzzles you already solve, then the methods you use" },
  { label: "Times", title: "Bring your times", sub: "Your history from another timer, if you have one" },
] as const;
const LAST = STEPS.length - 1;
const WELCOME = [
  { icon: Shapes, title: "Your puzzles and methods", text: "What you can solve today" },
  { icon: GraduationCap, title: "Learn the others", text: "A new puzzle starts with its course" },
  { icon: Timer, title: "Then time and train", text: "Everything opens once it is solved" },
];
const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter(i => i !== item) : [...list, item];
const withoutKey = <T,>(record: Partial<Record<PuzzleId, T>>, key: PuzzleId) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Partial<Record<PuzzleId, T>>;

/**
 * The introduction, as the web's on a phone: Welcome, the puzzles (methods and best single inline under each chosen
 * one), then the times of another timer. Opened again on a saved profile, it starts on the puzzles and can be cancelled.
 */
function Editor() {
  const insets = useSafeAreaInsets();
  const journey = useAtomValue(journeyAtom), existing = journeyProfile(journey), owner = useAtomValue(userAtom)?.id;
  const setIntro = useSetAtom(introductionAtom), setEvent = useSetAtom(eventAtom), setScramble = useSetAtom(scrambleTypeAtom), replace = useSetAtom(replaceRouteAtom);
  const current = useAtomValue(puzzleAtom);
  // Editing a saved setup skips the welcome.
  const [step, setStep] = useState(existing ? 1 : 0), [direction, setDirection] = useState(1);
  const [known, setKnown] = useState<PuzzleId[]>(existing?.knownPuzzles ?? []), [knownMethods, setKnownMethods] = useState<MethodMap>(existing?.knownMethods ?? {});
  const [bests, setBests] = useState<Partial<Record<PuzzleId, string>>>(() => Object.fromEntries(Object.entries(existing?.bests ?? {}).map(([p, ms]) => [p, fmtTime(ms)])));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const go = (next: number) => { if (next < 0 || next > LAST) return; setDirection(next > step ? 1 : -1); setStep(next); setError(""); };
  const cancel = () => { if (!busy) setIntro(null); };
  const save = async (changes: Journey, tour = false) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.updateJourney(changes);
      if (local.current().id !== owner) return;
      Keyboard.dismiss();
      // A puzzle the player can solve opens on the timer; with none, the current one opens on its course.
      const puzzle = known.includes(current) ? current : known[0] ?? current;
      if (puzzle !== current) { setEvent(puzzle); setScramble("normal"); }
      replace(known.includes(puzzle) ? { page: "playground" } : { page: "learn" });
      setIntro(tour ? "tour" : null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const finish = (tour: boolean) => {
    const typed = known.filter(p => bests[p]?.trim()).map(p => [p, parseTypedTime(bests[p]!)] as const);
    const wrong = typed.find(([, ms]) => ms === null);
    if (wrong) return setError(tr("{0}: type your best like 12.34 or 1:05.21, or leave it empty.", { 0: tr(puzzleInfo(wrong[0]).label) }));
    void save({
      [PROFILE_KEY]: { kind: "profile", knownPuzzles: known, knownMethods, priority: null, ...(typed.length ? { bests: Object.fromEntries(typed) } : {}), completedAt: existing?.completedAt ?? new Date().toISOString() },
    }, tour);
  };
  const advance = () => step < LAST ? go(step + 1) : finish(!existing);
  const { title, sub } = STEPS[step]!;

  return <View className="absolute inset-0 bg-background">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View accessibilityViewIsModal className="w-full max-w-[640px] flex-1 self-center">
        <View className="h-14 flex-row items-center gap-2.5 px-4">
          <Logo size={20} />
          <View className="flex-1" />
          {existing ? <Button variant="ghost" className="h-11" disabled={busy} onPress={cancel}><Text>{tr("Cancel")}</Text></Button> : null}
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-4 pt-2 pb-4" contentContainerStyle={step === 0 ? { flexGrow: 1, justifyContent: "center" } : undefined}>
          <StepTransition identity={step} direction={direction}>
            <View className="gap-4">
              <View className="gap-1">
                <Text accessibilityRole="header" className="font-sans text-2xl font-semibold tracking-tight">{tr(title)}</Text>
                <Text className="text-sm text-muted-foreground">{tr(sub)}</Text>
              </View>
              {step === 0 && <View className="gap-2">
                {WELCOME.map((r, i) => <View key={r.title} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <IconTile icon={r.icon} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium"><Text className="text-sm text-muted-foreground">{i + 1}  </Text>{tr(r.title)}</Text>
                    <Text numberOfLines={1} className="text-xs text-muted-foreground">{tr(r.text)}</Text>
                  </View>
                </View>)}
              </View>}
              {step === 1 && <PuzzleStep value={known} methods={knownMethods} bests={bests}
                onNone={() => { setKnown([]); setKnownMethods({}); setBests({}); }}
                onBest={(p, text) => setBests(v => ({ ...v, [p]: text }))}
                onToggle={p => { setKnown(v => toggle(v, p)); setKnownMethods(v => withoutKey(v, p)); setBests(v => withoutKey(v, p)); }}
                onMethod={(p, m) => setKnownMethods(v => ({ ...v, [p]: toggle(v[p] ?? [], m) }))} />}
              {/* Imported puzzles are solved ones: they join the known puzzles. */}
              {step === 2 && <ImportTimes onImported={puzzles => setKnown(v => [...v, ...puzzles.filter(p => !v.includes(p))])} />}
            </View>
          </StepTransition>
          {!!error && <Alert variant="destructive">{error}</Alert>}
        </ScrollView>
        <View className="flex-row items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" className={cn("h-11", step === 0 && "opacity-0")} disabled={busy || step === 0} onPress={() => go(step - 1)}>
            <Icon as={ArrowLeft} size={16} /><Text>{tr("Back")}</Text>
          </Button>
          <View className="flex-row items-center gap-2">
            {step === LAST && !existing && <Button variant="outline" className="h-11" disabled={busy} onPress={() => finish(false)}><Text>{tr("Skip")}</Text></Button>}
            <Button className="h-11" disabled={busy} onPress={advance}>
              <Text>{busy ? tr("Saving…") : step === 0 ? tr("Get started") : step === LAST ? existing ? tr("Save") : tr("Start the tour") : tr("Continue")}</Text>
              {!busy && <Icon as={ArrowRight} size={16} className="text-primary-foreground" />}
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </View>;
}

// --- Tour -------------------------------------------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 });
/** A rounded rectangle as an SVG path, to cut out of the dimmed layer. */
export function roundedRect({ x, y, width: w, height: h }: Rect, radius = 12) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/**
 * Where the tour card goes: on the side of the page with the most room around the highlighted view (between the status
 * bar and the tab bar), at the bottom when nothing inside the page is highlighted.
 */
export function dockSide(inner: Rect | null, top: number, bottom: number): "top" | "bottom" {
  if (!inner) return "bottom";
  return inner.y - top > bottom - (inner.y + inner.height) ? "top" : "bottom";
}

/** Follows `target`, gliding from the previous rectangle (even one hidden meanwhile) over a quarter of a second. */
function useGlidingRect(target: Rect | null, reduced: boolean) {
  const [shown, setShown] = useState<Rect | null>(target);
  const current = useRef<Rect | null>(target);
  useEffect(() => {
    if (!target) { setShown(null); return; }
    const from = current.current;
    if (!from || reduced || typeof requestAnimationFrame !== "function") { current.current = target; setShown(target); return; }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 260), e = 1 - (1 - t) ** 3;
      const rect = { x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e), width: lerp(from.width, target.width, e), height: lerp(from.height, target.height, e) };
      current.current = rect;
      setShown(rect);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target?.x, target?.y, target?.width, target?.height, reduced]);
  return shown;
}

/** The shared steps in the order of the phone's tabs: the timer, Train, Battle, Learn, Profile. */
const PAGE_ORDER: Page[] = ["playground", "training", "duel", "learn", "algorithms", "profile"];
const TOUR = [...TOUR_STEPS].sort((a, b) => PAGE_ORDER.indexOf(a.page) - PAGE_ORDER.indexOf(b.page));

function Tour() {
  const colors = useColors(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const [step, setStep] = useState(0), [direction, setDirection] = useState(1);
  const replace = useSetAtom(replaceRouteAtom), setIntro = useSetAtom(introductionAtom);
  const settled = useAtomValue(settledPageAtom), version = useAtomValue(tourTargetsVersionAtom);
  const current = TOUR[step]!, last = step === TOUR.length - 1;
  const resetTraining = useSetAtom(trainingStepAtom), resetSetup = useSetAtom(trainingSetupModeAtom);
  const overlay = useRef<View>(null);
  const [frame, setFrame] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [measured, setMeasured] = useState<{ step: number; tab: Rect | null; inner: Rect | null } | null>(null);
  useEffect(() => {
    // Training shows its ways to practise, not a session left open.
    if (current.page === "training") { resetTraining("setup"); resetSetup(""); }
    replace({ page: current.page });
    AccessibilityInfo.announceForAccessibility?.(`${tr(current.title)}. ${tr(current.body)}`);
  }, [step]);
  // Measure once the step's page has stopped sliding, and again whenever a tagged view comes or goes.
  useEffect(() => {
    if (settled !== current.page) return;
    let live = true;
    const timer = setTimeout(() => {
      void Promise.all([measureTourTarget(`tab:${tabOf(current.page)}`), measureTourTarget(current.inner)])
        .then(([tab, inner]) => { if (live) setMeasured({ step, tab, inner }); });
    }, 60);
    return () => { live = false; clearTimeout(timer); };
  }, [settled, step, version, current]);
  const go = (next: number) => { setDirection(next > step ? 1 : -1); setStep(next); };
  const end = () => setIntro(null);

  const relative = (r: Rect | null) => r && { x: r.x - frame.x, y: r.y - frame.y, width: r.width, height: r.height };
  const fresh = measured?.step === step ? measured : null;
  // The tab bar stays put: the previous step's tab stays lit while the next page slides in, then the light glides over.
  const tab = relative(measured?.tab ?? null);
  const top = insets.top, bottom = tab ? tab.y - 6 : frame.height - 72;
  // Only the visible part of the inner view; a view scrolled out of sight leaves the tab alone highlighted.
  let inner = relative(fresh?.inner ?? null);
  if (inner) {
    const y0 = Math.max(inner.y, top + 4), y1 = Math.min(inner.y + inner.height, bottom - 4);
    inner = y1 - y0 >= 32 ? { ...inner, y: y0, height: y1 - y0 } : null;
  }
  const innerShown = useGlidingRect(inner && grow(inner, 4), reduced), tabShown = useGlidingRect(tab && grow(tab, 2), reduced);
  const side = dockSide(inner, top, bottom);
  const { width, height } = frame;
  const holes = [tabShown, innerShown].filter((r): r is Rect => !!r).map(r => roundedRect(r)).join("");

  return <View ref={overlay} collapsable={false} accessibilityViewIsModal style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    onLayout={() => overlay.current?.measureInWindow?.((x, y, w, h) => setFrame(f => f.x === x && f.y === y && f.width === w && f.height === h ? f : { x, y, width: w, height: h }))}>
    {width > 0 && <Svg width={width} height={height} style={{ position: "absolute" }}><Path fill="rgba(0,0,0,.72)" fillRule="evenodd" d={`M0 0H${width}V${height}H0Z${holes}`} /></Svg>}
    {[innerShown, tabShown].map((r, i) => r && <View key={i} pointerEvents="none" style={{ position: "absolute", left: r.x, top: r.y, width: r.width, height: r.height, borderWidth: 2, borderColor: colors.primary, borderRadius: 12 }} />)}
    <View style={{ position: "absolute", left: 12, right: 12, ...(side === "top" ? { top: top + 12 } : { bottom: Math.max(0, height - bottom) + 12 }), padding: 16, gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 5, flex: 1 }} importantForAccessibility="no-hide-descendants">
          {TOUR.map((_, i) => <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === step ? colors.primary : i < step ? alpha(colors.primary, 45) : colors.muted }} />)}
        </View>
        <Text className="text-xs text-muted-foreground">{step + 1} / {TOUR.length}</Text>
        <Button variant="ghost" size="icon" className="-mr-2 size-9" onPress={end} accessibilityLabel={tr("End tour")}><Icon as={X} size={17} /></Button>
      </View>
      <StepTransition identity={step} direction={direction}>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" className="text-lg font-semibold">{tr(current.title)}</Text>
          <Text className="text-base text-muted-foreground">{tr(current.body)}</Text>
        </View>
      </StepTransition>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Button variant="ghost" onPress={() => step ? go(step - 1) : end()}><Text>{step ? tr("Back") : tr("Skip tour")}</Text></Button>
        <Button onPress={() => last ? end() : go(step + 1)}><Text>{last ? tr("Done") : tr("Next")}</Text></Button>
      </View>
    </View>
  </View>;
}

export function Introduction() {
  const [intro, setIntro] = useAtom(introductionAtom), journey = useAtomValue(journeyAtom), user = useAtomValue(userAtom);
  const introduced = useRef<string | null>(null);
  useEffect(() => () => setIntro(null), [user?.id, setIntro]);
  useEffect(() => {
    if (!user || user.isGuest) return;
    if (introduced.current === user.id) return;
    introduced.current = user.id;
    if (!journeyProfile(journey)) void local.restore().then(() => {
      if (local.current().id === user.id && !journeyProfile(local.read.journey())) setIntro(value => value ?? "setup");
    });
  }, [user, journey, setIntro]);
  return intro === "tour" ? <Tour /> : intro ? <Editor key={`${user?.id}:${intro}`} /> : null;
}
