/**
 * Native setup and tour. The setup walks through a welcome, the level, the puzzles the player can solve, the ones to
 * learn (methods inline under each chosen puzzle), goals (one-tap suggestions or a custom one) and a summary; it saves
 * with `api.updateJourney` like the web. The tour opens each step's page once the page stack has stopped sliding, then
 * dims everything but the step's tab and the view it points at inside the page (`useTourTarget`).
 */
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Check, Flag, Gauge, Layers, Plus, Timer, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { LEVELS, PROFILE_KEY, TOUR_STEPS, goalKey, goalTitle, journeyProfile, learningPlan, parseGoalTarget, validDueDate, type Experience, type Journey, type PersonalGoal } from "../../../src/client/lib/journey";
import { METHODS } from "../../../src/shared/methods";
import { EVENTS, PUZZLES, puzzleInfo, type PuzzleId, type SolveMode } from "../../../src/shared/puzzles";
import { api, local } from "../api";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { editingGoalAtom, introductionAtom, journeyAtom, levelDescription, suggestedGoals } from "../journey";
import { eventAtom, replaceRouteAtom, scrambleTypeAtom, userAtom } from "../state";
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

/** Small toggles of the goal form, the chosen ones outlined in the accent. */
function Choices<T extends string>({ label, options, value, onChange, multiple = false }: { label: string; options: readonly { id: T; label: string }[]; value: readonly T[]; onChange: (id: T) => void; multiple?: boolean }) {
  const colors = useColors();
  return <View style={{ gap: 8 }} accessibilityLabel={label}>
    <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(o => {
        const on = value.includes(o.id);
        return <Pressable key={o.id} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: on }} onPress={() => onChange(o.id)}
          style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 10) : colors.card, borderRadius: 10, paddingHorizontal: 12, minHeight: 40, justifyContent: "center" }}>
          <Text className="text-sm font-medium">{o.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

/** A level as a large card: its name and a line saying who it is for. */
function LevelCard({ label, description, selected, onPress }: { label: string; description: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}
    style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? alpha(colors.primary, 10) : colors.card, borderRadius: 12, padding: 16 }}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text className="text-base font-semibold">{label}</Text>
      <Text className="text-sm text-muted-foreground">{description}</Text>
    </View>
    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
      {selected ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
    </View>
  </Pressable>;
}

/** The puzzles as a grid of tiles; under it, each chosen puzzle with its methods to pick, so nothing hides a level down. */
function PuzzleChooser({ value, methods, onToggle, onMethod, methodsLabel, first }: {
  value: PuzzleId[]; methods: Partial<Record<PuzzleId, string[]>>; onToggle: (id: PuzzleId) => void; onMethod: (puzzle: PuzzleId, method: string) => void; methodsLabel: string; first?: boolean;
}) {
  const colors = useColors();
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel="Puzzles">
      {PUZZLES.map(p => {
        const on = value.includes(p.id), lead = first && value[0] === p.id;
        return <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onToggle(p.id)}
          style={{ width: "31.5%", minHeight: 56, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 10) : colors.card, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 8, gap: 2 }}>
          <Text className="text-[15px] font-semibold">{p.label}</Text>
          {lead ? <Text className="text-[11px] text-primary">First</Text> : null}
        </Pressable>;
      })}
    </View>
    {value.map(p => METHODS[p].length ? <View key={p} style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
      <Text className="text-sm font-medium">{puzzleInfo(p).label} <Text className="text-sm text-muted-foreground">{methodsLabel}</Text></Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {METHODS[p].map(m => {
          const on = methods[p]?.includes(m.id) ?? false;
          return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onMethod(p, m.id)}
            style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 10) : "transparent", borderRadius: 8, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }}>
            <Text className="text-sm">{m.name}</Text>
          </Pressable>;
        })}
      </View>
    </View> : null)}
  </View>;
}

function GoalForm({ puzzle: first, initial, onSave, busy, submitLabel }: { puzzle: PuzzleId; initial?: PersonalGoal; onSave: (goal: PersonalGoal) => void; busy: boolean; submitLabel?: string }) {
  const [kind, setKind] = useState(initial?.kind ?? "time"), [puzzle, setPuzzle] = useState(initial?.puzzle ?? first);
  const [metric, setMetric] = useState<"single" | "ao5">(initial?.kind === "time" ? initial.metric : "single");
  const [mode, setMode] = useState<SolveMode>(initial?.kind === "time" ? initial.solveMode : "standard");
  const [target, setTarget] = useState(initial?.kind === "time" ? String(initial.targetMs / 1000) : "20");
  const [setId, setSetId] = useState(initial?.kind === "learning" ? initial.setId ?? "" : "");
  const [due, setDue] = useState(initial?.dueDate ?? ""), [error, setError] = useState("");
  const catalog = local.read.catalog(puzzle);
  const submit = () => {
    const targetMs = parseGoalTarget(target);
    if (kind === "time" && targetMs === null) { setError("Enter a time in seconds or m:ss."); return; }
    if (due && !validDueDate(due)) { setError("Use a valid YYYY-MM-DD date."); return; }
    setError("");
    const base = { puzzle, createdAt: initial?.createdAt ?? new Date().toISOString(), ...(due ? { dueDate: due } : {}) };
    onSave(kind === "time" ? { ...base, kind, metric, solveMode: mode, targetMs: targetMs! } : { ...base, kind, setId: setId || null });
  };
  return <View style={{ gap: 16 }} pointerEvents={busy ? "none" : "auto"}>
    <Choices label="Goal type" value={[kind]} options={[{ id: "time", label: "Time" }, { id: "learning", label: "Learning" }]} onChange={setKind} />
    <Choices label="Puzzle" value={[puzzle]} options={PUZZLES} onChange={p => { setPuzzle(p); setSetId(""); setMode("standard"); }} />
    {kind === "time" ? <>
      <Choices label="Result" value={[metric]} options={[{ id: "single", label: "Single" }, { id: "ao5", label: "Average of 5" }]} onChange={setMetric} />
      <Choices label="Event" value={[mode]} options={EVENTS.filter(e => e.puzzle === puzzle).map(e => ({ id: e.solveMode, label: e.label }))} onChange={setMode} />
      <View style={{ gap: 8 }}><Text className="text-sm font-medium text-muted-foreground">Target (seconds)</Text><Input accessibilityLabel="Target (seconds)" keyboardType="decimal-pad" value={target} onChangeText={setTarget} /></View>
    </> : <Choices label="Learn" value={[setId]} options={[{ id: "", label: "Solve this puzzle" }, ...catalog.sets.filter(s => catalog.cases.some(c => c.set === s.id)).map(s => ({ id: s.id, label: s.label }))]} onChange={setSetId} />}
    <View style={{ gap: 8 }}><Text className="text-sm font-medium text-muted-foreground">Deadline (optional)</Text><Input accessibilityLabel="Deadline (YYYY-MM-DD)" placeholder="YYYY-MM-DD" value={due} onChangeText={setDue} /></View>
    {!!error && <Text accessibilityRole="alert" className="text-destructive">{error}</Text>}
    <Button disabled={busy} onPress={submit}><Text>{busy ? "Saving…" : submitLabel ?? (initial ? "Save goal" : "Add goal")}</Text></Button>
  </View>;
}

/** A line of the summary: a caption and its value. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 4 }}>
    <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
    {typeof children === "string" ? <Text className="text-base">{children}</Text> : children}
  </View>;
}

const STEPS = ["welcome", "level", "known", "learning", "goals", "summary"] as const;
const STEP_TITLES: Record<typeof STEPS[number], [string, string]> = {
  welcome: ["Welcome to Cubix", "A minute to set up"],
  level: ["Your level", "Where you are today"],
  known: ["What can you solve?", "Skip if none yet"],
  learning: ["What to learn", "The first one comes first"],
  goals: ["Your goals", "Optional"],
  summary: ["All set", "Check and save"],
};
const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter(i => i !== item) : [...list, item];
const withoutKey = <T,>(record: Partial<Record<PuzzleId, T>>, key: PuzzleId) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Partial<Record<PuzzleId, T>>;

function Editor({ goalOnly }: { goalOnly: boolean }) {
  const colors = useColors(), insets = useSafeAreaInsets();
  const journey = useAtomValue(journeyAtom), existing = journeyProfile(journey), owner = useAtomValue(userAtom)?.id;
  const key = useAtomValue(editingGoalAtom), initial = journey[key];
  const setIntro = useSetAtom(introductionAtom), setEvent = useSetAtom(eventAtom), setScramble = useSetAtom(scrambleTypeAtom), replace = useSetAtom(replaceRouteAtom);
  // Editing a saved setup skips the welcome.
  const [step, setStep] = useState(existing ? 1 : 0), [direction, setDirection] = useState(1), [level, setLevel] = useState<Experience>(existing?.level ?? "new");
  const [known, setKnown] = useState<PuzzleId[]>(existing?.knownPuzzles ?? []), [knownMethods, setKnownMethods] = useState(existing?.knownMethods ?? {});
  const plan = learningPlan(existing);
  const [learningPuzzles, setLearningPuzzles] = useState<PuzzleId[]>(plan.puzzles), [learningMethods, setLearningMethods] = useState(plan.methods);
  const priority = learningPuzzles[0] ?? null, priorityMethod = priority ? learningMethods[priority]?.[0] : undefined;
  // Goals picked in the goals step, by suggestion id or `custom:<n>`; each gets its own key when saved.
  const [drafts, setDrafts] = useState<Record<string, PersonalGoal>>({}), [custom, setCustom] = useState(false);
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
      if (!goalOnly) { if (priority) { setEvent(priority); setScramble("normal"); } replace(priority && (level === "new" || !known.includes(priority)) ? { page: "learn", ...(priorityMethod ? { method: priorityMethod } : {}) } : { page: "playground" }); }
      setIntro(tour ? "tour" : null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const finish = (tour: boolean) => void save({
    [PROFILE_KEY]: { kind: "profile", level, knownPuzzles: known, knownMethods, priority, learningPuzzles, learningMethods, ...(priorityMethod ? { priorityMethod } : {}), completedAt: existing?.completedAt ?? new Date().toISOString() },
    ...Object.fromEntries(Object.values(drafts).map(goal => [goalKey(), goal])),
  }, tour);

  if (goalOnly) return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "center", padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, backgroundColor: "rgba(0,0,0,.65)" }}>
      <View accessibilityViewIsModal style={{ maxHeight: "100%", flexShrink: 1, width: "100%", maxWidth: 640, alignSelf: "center", backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: "hidden" }}>
        <View style={{ paddingLeft: 20, paddingRight: 8, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderColor: colors.border }}>
          <Text accessibilityRole="header" className="flex-1 text-lg font-semibold">{key ? "Edit goal" : "Add goal"}</Text>
          <Button variant="ghost" size="icon" disabled={busy} onPress={close} accessibilityLabel="Close"><Icon as={X} size={18} /></Button>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
          <GoalForm puzzle={existing?.priority ?? "333"} initial={initial?.kind !== "profile" ? initial ?? undefined : undefined} busy={busy} onSave={goal => void save({ [key || goalKey()]: goal })} />
          {!!error && <Text accessibilityRole="alert" className="text-destructive">{error}</Text>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;

  const goalPuzzle = priority ?? known[0] ?? "333";
  const catalog = local.read.catalog(goalPuzzle);
  const suggestions = suggestedGoals(level, goalPuzzle, known.includes(goalPuzzle), catalog.sets.filter(s => catalog.cases.some(c => c.set === s.id)));
  const titleOf = (goal: PersonalGoal) => goalTitle(goal, local.read.catalog(goal.puzzle).sets);
  const puzzleList = (list: PuzzleId[], methods: Partial<Record<PuzzleId, string[]>>) => list.length
    ? list.map(p => `${puzzleInfo(p).label}${methods[p]?.length ? ` (${methods[p]!.map(id => METHODS[p].find(m => m.id === id)?.name).filter(Boolean).join(", ")})` : ""}`).join(" · ")
    : "None yet";
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
                <Text className="text-base leading-6">A timer, an algorithm library and a trainer for every WCA puzzle. Tell Cubix where you are and it sets things up for you.</Text>
                {([[Gauge, "Your level", "So suggestions fit you."], [Layers, "Your puzzles", "What you can solve and what to learn next."], [Flag, "Your goals", "Times to beat and sets to learn, tracked for you."]] as const).map(([I, head, line]) =>
                  <View key={head} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, backgroundColor: colors.card }}>
                    <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }}><Icon as={I} size={18} className="text-muted-foreground" /></View>
                    <View style={{ flex: 1 }}><Text className="text-[15px] font-medium">{head}</Text><Text className="text-sm text-muted-foreground">{line}</Text></View>
                  </View>)}
              </>}
              {name === "level" && LEVELS.map(l => <LevelCard key={l.id} label={l.label} description={levelDescription[l.id]} selected={level === l.id} onPress={() => setLevel(l.id)} />)}
              {name === "known" && <PuzzleChooser value={known} methods={knownMethods} methodsLabel="methods you use"
                onToggle={p => { setKnown(v => toggle(v, p)); if (known.includes(p)) setKnownMethods(v => withoutKey(v, p)); }}
                onMethod={(p, m) => setKnownMethods(v => ({ ...v, [p]: toggle(v[p] ?? [], m) }))} />}
              {name === "learning" && <PuzzleChooser value={learningPuzzles} methods={learningMethods} methodsLabel="methods to learn" first
                onToggle={p => { setLearningPuzzles(v => toggle(v, p)); if (learningPuzzles.includes(p)) setLearningMethods(v => withoutKey(v, p)); }}
                onMethod={(p, m) => setLearningMethods(v => ({ ...v, [p]: toggle(v[p] ?? [], m) }))} />}
              {name === "goals" && <>
                <Text className="text-sm text-muted-foreground">Tap a suggestion to add it, or write your own.</Text>
                {suggestions.map(({ id, goal }) => {
                  const on = !!drafts[id];
                  return <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setDrafts(d => { const next = { ...d }; if (on) delete next[id]; else next[id] = goal; return next; })}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 10) : colors.card, borderRadius: 12, padding: 14 }}>
                    <Icon as={goal.kind === "time" ? Timer : BookOpen} size={18} className={on ? "text-primary" : "text-muted-foreground"} />
                    <Text className="flex-1 text-[15px]">{titleOf(goal)}</Text>
                    <Icon as={on ? Check : Plus} size={18} className={on ? "text-primary" : "text-muted-foreground"} />
                  </Pressable>;
                })}
                {Object.entries(drafts).filter(([id]) => id.startsWith("custom:")).map(([id, goal]) => <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, paddingLeft: 14, backgroundColor: alpha(colors.primary, 10) }}>
                  <Text className="flex-1 text-[15px]">{titleOf(goal)}</Text>
                  <Button variant="ghost" size="icon" accessibilityLabel="Remove goal" onPress={() => setDrafts(d => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)))}><Icon as={X} size={16} /></Button>
                </View>)}
                {custom ? <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 12 }}>
                  <GoalForm puzzle={goalPuzzle} busy={busy} submitLabel="Add goal" onSave={goal => { setDrafts(d => ({ ...d, [`custom:${Object.keys(d).length}:${Date.now()}`]: goal })); setCustom(false); }} />
                  <Button variant="ghost" onPress={() => setCustom(false)}><Text>Cancel</Text></Button>
                </View> : <Button variant="outline" onPress={() => setCustom(true)}><Icon as={Plus} size={16} /><Text>Custom goal</Text></Button>}
              </>}
              {name === "summary" && <View style={{ gap: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, backgroundColor: colors.card }}>
                <SummaryRow label="Level">{LEVELS.find(l => l.id === level)?.label ?? level}</SummaryRow>
                <SummaryRow label="Can solve">{puzzleList(known, knownMethods)}</SummaryRow>
                <SummaryRow label="Learning">{puzzleList(learningPuzzles, learningMethods)}</SummaryRow>
                <SummaryRow label="Goals">{Object.values(drafts).length ? <View style={{ gap: 4 }}>{Object.values(drafts).map((goal, i) => <Text key={i} className="text-base">{titleOf(goal)}</Text>)}</View> : "No goal for now"}</SummaryRow>
              </View>}
            </View>
          </StepTransition>
          {!!error && <Text accessibilityRole="alert" className="text-destructive">{error}</Text>}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border }}>
          {step > 0 ? <Button variant="ghost" disabled={busy} onPress={() => { setCustom(false); go(step - 1); }}><Text>Back</Text></Button> : null}
          {last ? <>
            <Button variant="outline" className="flex-1" disabled={busy} onPress={() => finish(false)}><Text>Skip</Text></Button>
            <Button className="flex-1" disabled={busy} onPress={() => finish(true)}><Text>{busy ? "Saving…" : "Start the tour"}</Text></Button>
          </> : <Button className="flex-1" disabled={busy} onPress={() => { setCustom(false); go(step + 1); }}><Text>{step === 0 ? "Get started" : "Continue"}</Text></Button>}
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

function Tour() {
  const colors = useColors(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const [step, setStep] = useState(0), [direction, setDirection] = useState(1);
  const replace = useSetAtom(replaceRouteAtom), setIntro = useSetAtom(introductionAtom);
  const settled = useAtomValue(settledPageAtom), version = useAtomValue(tourTargetsVersionAtom);
  const current = TOUR_STEPS[step]!, last = step === TOUR_STEPS.length - 1;
  const overlay = useRef<View>(null);
  const [frame, setFrame] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [measured, setMeasured] = useState<{ step: number; tab: Rect | null; inner: Rect | null } | null>(null);
  useEffect(() => {
    replace({ page: current.page });
    AccessibilityInfo.announceForAccessibility?.(`${current.title}. ${current.body}`);
  }, [step]);
  // Measure once the step's page has stopped sliding, and again whenever a tagged view comes or goes.
  useEffect(() => {
    if (settled !== current.page) return;
    let live = true;
    const timer = setTimeout(() => {
      void Promise.all([measureTourTarget(`tab:${current.target}`), measureTourTarget(current.inner)])
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
          {TOUR_STEPS.map((_, i) => <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === step ? colors.primary : i < step ? alpha(colors.primary, 45) : colors.muted }} />)}
        </View>
        <Text className="text-xs text-muted-foreground">{step + 1} / {TOUR_STEPS.length}</Text>
        <Button variant="ghost" size="icon" className="-mr-2 size-9" onPress={end} accessibilityLabel="End tour"><Icon as={X} size={17} /></Button>
      </View>
      <StepTransition identity={step} direction={direction}>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" className="text-lg font-semibold">{current.title}</Text>
          <Text className="text-[15px] leading-6 text-muted-foreground">{current.body}</Text>
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
  const setKey = useSetAtom(editingGoalAtom);
  useEffect(() => () => { setIntro(null); setKey(""); }, [user?.id, setIntro, setKey]);
  useEffect(() => {
    if (!user || user.isGuest) return;
    if (introduced.current === user.id) return;
    introduced.current = user.id;
    if (!journeyProfile(journey)) void local.restore().then(() => {
      if (local.current().id === user.id && !journeyProfile(local.read.journey())) setIntro(value => value ?? "setup");
    });
  }, [user, journey, setIntro]);
  return intro === "tour" ? <Tour /> : intro ? <Editor key={`${user?.id}:${intro}`} goalOnly={intro === "goal"} /> : null;
}
