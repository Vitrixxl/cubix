/**
 * Native setup and tour. The setup walks through a welcome and the puzzles the player can solve (methods inline under
 * each chosen one); any other puzzle opens on its course. It saves with `api.updateJourney` like the web. The tour opens each step's page once the page stack has stopped sliding, then
 * dims everything but the step's tab and the view it points at inside the page (`useTourTarget`).
 */
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { GraduationCap, Layers, Timer, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { fmtTime, parseTypedTime } from "../../../src/client/lib/format";
import { PROFILE_KEY, TOUR_STEPS, journeyProfile, type Journey } from "../../../src/client/lib/journey";
import { METHODS } from "../../../src/shared/methods";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { api, local } from "../api";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { introductionAtom, journeyAtom } from "../journey";
import { eventAtom, puzzleAtom, replaceRouteAtom, scrambleTypeAtom, tabOf, trainingSetupModeAtom, trainingStepAtom, userAtom, type Page } from "../state";
import { alpha, useColors } from "../theme";
import { measureTourTarget, settledPageAtom, tourTargetsVersionAtom, type Rect } from "../tour";

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

/** The puzzles as a grid of tiles; under it, each chosen puzzle with its methods to pick and its best single (optional),
 * so nothing hides a level down. */
function PuzzleChooser({ value, methods, bests, onToggle, onMethod, onBest, methodsLabel }: {
  value: PuzzleId[]; methods: Partial<Record<PuzzleId, string[]>>; bests: Partial<Record<PuzzleId, string>>; onToggle: (id: PuzzleId) => void; onMethod: (puzzle: PuzzleId, method: string) => void; onBest: (puzzle: PuzzleId, text: string) => void; methodsLabel: string;
}) {
  const colors = useColors();
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel="Puzzles">
      {PUZZLES.map(p => {
        const on = value.includes(p.id);
        return <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onToggle(p.id)}
          style={{ width: "31.5%", minHeight: 56, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 10) : colors.card, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 8, gap: 2 }}>
          <Text className="text-[15px] font-semibold">{p.label}</Text>
        </Pressable>;
      })}
    </View>
    {value.map(p => <View key={p} style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
      <Text className="text-sm font-medium">{puzzleInfo(p).label}{METHODS[p].length ? <Text className="text-sm text-muted-foreground"> {methodsLabel}</Text> : null}</Text>
      {METHODS[p].length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {METHODS[p].map(m => {
          const on = methods[p]?.includes(m.id) ?? false;
          return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onMethod(p, m.id)}
            style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 10) : "transparent", borderRadius: 8, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }}>
            <Text className="text-sm">{m.name}</Text>
          </Pressable>;
        })}
      </View> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text className="flex-1 text-sm text-muted-foreground">Best single, if you know it</Text>
        <Input value={bests[p] ?? ""} onChangeText={text => onBest(p, text)} keyboardType="decimal-pad" placeholder="12.34" accessibilityLabel={`Your best ${puzzleInfo(p).label} single`}
          aria-invalid={!!bests[p]?.trim() && parseTypedTime(bests[p]!) === null} className="w-28 text-right tabular-nums" />
      </View>
    </View>)}
  </View>;
}

const STEPS = ["welcome", "known"] as const;
const STEP_TITLES: Record<typeof STEPS[number], [string, string]> = {
  welcome: ["Welcome to Qbix", "A few seconds to set up"],
  known: ["What can you solve?", "Skip if none yet"],
};
const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter(i => i !== item) : [...list, item];
const withoutKey = <T,>(record: Partial<Record<PuzzleId, T>>, key: PuzzleId) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Partial<Record<PuzzleId, T>>;

function Editor() {
  const colors = useColors(), insets = useSafeAreaInsets();
  const journey = useAtomValue(journeyAtom), existing = journeyProfile(journey), owner = useAtomValue(userAtom)?.id;
  const setIntro = useSetAtom(introductionAtom), setEvent = useSetAtom(eventAtom), setScramble = useSetAtom(scrambleTypeAtom), replace = useSetAtom(replaceRouteAtom);
  const current = useAtomValue(puzzleAtom);
  // Editing a saved setup skips the welcome.
  const [step, setStep] = useState(existing ? 1 : 0), [direction, setDirection] = useState(1);
  const [known, setKnown] = useState<PuzzleId[]>(existing?.knownPuzzles ?? []), [knownMethods, setKnownMethods] = useState(existing?.knownMethods ?? {});
  const [bests, setBests] = useState<Partial<Record<PuzzleId, string>>>(() => Object.fromEntries(Object.entries(existing?.bests ?? {}).map(([p, ms]) => [p, fmtTime(ms)])));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const name = STEPS[step]!;
  const go = (next: number) => { setDirection(next > step ? 1 : -1); setStep(next); setError(""); };
  const close = () => { if (!busy) setIntro(null); };
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
    if (wrong) return setError(`${puzzleInfo(wrong[0]).label}: type your best like 12.34 or 1:05.21, or leave it empty.`);
    void save({
      [PROFILE_KEY]: { kind: "profile", knownPuzzles: known, knownMethods, priority: null, ...(typed.length ? { bests: Object.fromEntries(typed) } : {}), completedAt: existing?.completedAt ?? new Date().toISOString() },
    }, tour);
  };

  const [title, sub] = STEP_TITLES[name];
  const last = step === STEPS.length - 1;

  return <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View accessibilityViewIsModal style={{ flex: 1, width: "100%", maxWidth: 640, alignSelf: "center" }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <Text accessibilityRole="header" numberOfLines={1} className="shrink-0 text-xl font-semibold tracking-tight">{title}</Text>
              <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">{sub}</Text>
            </View>
            <Text className="text-xs text-muted-foreground">{step + 1} / {STEPS.length}</Text>
            {existing ? <Button variant="ghost" size="icon" disabled={busy} onPress={close} accessibilityLabel="Close"><Icon as={X} size={18} /></Button> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 4 }} importantForAccessibility="no-hide-descendants">
            {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? colors.primary : colors.muted }} />)}
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
          <StepTransition identity={step} direction={direction}>
            <View style={{ gap: 12 }}>
              {name === "welcome" && <>
                <Text className="text-base leading-[24px]">A timer, an algorithm library and a trainer for every WCA puzzle. Tell Qbix what you can solve and it sets things up for you.</Text>
                {([[Layers, "Your puzzles and methods", "What you can solve today."], [GraduationCap, "Learn the others", "A new puzzle starts with its course."], [Timer, "Then time and train", "Everything opens once it is solved."]] as const).map(([I, head, line]) =>
                  <View key={head} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, backgroundColor: colors.card }}>
                    <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }}><Icon as={I} size={18} className="text-muted-foreground" /></View>
                    <View style={{ flex: 1 }}><Text className="text-[15px] font-medium">{head}</Text><Text className="text-sm text-muted-foreground">{line}</Text></View>
                  </View>)}
              </>}
              {name === "known" && <PuzzleChooser value={known} methods={knownMethods} bests={bests} methodsLabel="methods you use"
                onBest={(p, text) => setBests(v => ({ ...v, [p]: text }))}
                onToggle={p => { setKnown(v => toggle(v, p)); if (known.includes(p)) { setKnownMethods(v => withoutKey(v, p)); setBests(v => withoutKey(v, p)); } }}
                onMethod={(p, m) => setKnownMethods(v => ({ ...v, [p]: toggle(v[p] ?? [], m) }))} />}
            </View>
          </StepTransition>
          {!!error && <Text accessibilityRole="alert" className="text-destructive">{error}</Text>}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border }}>
          {step > 0 ? <Button variant="ghost" disabled={busy} onPress={() => go(step - 1)}><Text>Back</Text></Button> : null}
          {last ? existing ? <Button className="flex-1" disabled={busy} onPress={() => finish(false)}><Text>{busy ? "Saving…" : "Save"}</Text></Button> : <>
            <Button variant="outline" className="flex-1" disabled={busy} onPress={() => finish(false)}><Text>Skip the tour</Text></Button>
            <Button className="flex-1" disabled={busy} onPress={() => finish(true)}><Text>{busy ? "Saving…" : "Start the tour"}</Text></Button>
          </> : <Button className="flex-1" disabled={busy} onPress={() => go(step + 1)}><Text>{step === 0 ? "Get started" : "Continue"}</Text></Button>}
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
    AccessibilityInfo.announceForAccessibility?.(`${current.title}. ${current.body}`);
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
        <Button variant="ghost" size="icon" className="-mr-2 size-9" onPress={end} accessibilityLabel="End tour"><Icon as={X} size={17} /></Button>
      </View>
      <StepTransition identity={step} direction={direction}>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" className="text-lg font-semibold">{current.title}</Text>
          <Text className="text-[15px] leading-[24px] text-muted-foreground">{current.body}</Text>
        </View>
      </StepTransition>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Button variant="ghost" onPress={() => step ? go(step - 1) : end()}><Text>{step ? "Back" : "Skip tour"}</Text></Button>
        <Button onPress={() => last ? end() : go(step + 1)}><Text>{last ? "Done" : "Next"}</Text></Button>
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
