import { ChartNoAxesColumn, Delete, PenLine } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import { annotationAlg, COLOURS, frontsOf, heldAlg, readAnnotation, readSolution, writeAnnotation, type Annotation, type Colour } from "../../../src/client/lib/solution";
import { mergeTurns, type PhaseId } from "../../../src/client/lib/solveAnalysis";
import { FACE_COLORS } from "../../../src/shared/cubeAppearance";
import { puzzleInfo, puzzleOf } from "../../../src/shared/puzzles";
import type { SolveDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "./AlgPlayer";
import { Alg, Label, Numeric } from "./layout";
import { analyseSolution, SolveBar, SplitTime, StepLegend } from "./analysis/steps";
import { SheetChoice } from "./PuzzlePicker";
import { useLayout } from "../hooks/useLayout";
import type { SolveSummary } from "./SolveMenus";
import { locale, tr } from "../../../src/client/i18n";

/**
 * A solve on its own, as the web's SolveView.tsx: its time, scramble and solution, the solution played in 3D on the
 * scrambled cube when it is known, recorded by a smart cube or written by hand. The turns can be written here (how the
 * cube was held, then its turns); `children` are the solve's actions, hidden while writing.
 */
export type ViewedSolve = SolveSummary & Partial<Pick<SolveDto, "solution" | "puzzle_id" | "cube_size">>;

/** Each colour as the 3D cube draws it (its faces seen yellow on top, blue in front). */
const SWATCH: Record<Colour, string> = { white: FACE_COLORS.D, yellow: FACE_COLORS.U, green: FACE_COLORS.B, blue: FACE_COLORS.F, red: FACE_COLORS.R, orange: FACE_COLORS.L };
const colourName = (c: Colour) => c.charAt(0).toUpperCase() + c.slice(1);
export const Swatch = ({ colour }: { colour: Colour }) => <View accessibilityLabel={colourName(colour)} className="size-3 rounded-[3px] border border-foreground/20" style={{ backgroundColor: SWATCH[colour] }} />;

/** How the solution plays on the cube the app shows the scramble on; null when there is none to play. */
function played(solution: string | null | undefined) {
  const recorded = readSolution(solution);
  if (recorded) return heldAlg(recorded.map(turn => turn.move));
  const annotation = readAnnotation(solution);
  return annotation?.moves ? annotationAlg(annotation) : null;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });

export function SolveDetail({ solve, onSave, comment, aside, onStep, action, fill = false, children }: {
  solve: ViewedSolve;
  /** Saves the turns written (null clears them); resolves true once saved. */
  onSave: (solution: string | null) => Promise<boolean>;
  /** The comment's field, in place of its text while it is written. */
  comment?: ReactNode;
  /** Beside the time: the penalty. */
  aside?: ReactNode;
  /** Opens the analysis of a step of a smart cube solve (its steps bar is tappable then). */
  onStep?: (id: PhaseId) => void;
  /** At the end of the steps' card, or of the screen without one: the comment's button. */
  action?: ReactNode;
  /** The whole height of a screen: the cube takes the room left, the solution scrolls in its box. */
  fill?: boolean;
  children?: ReactNode;
}) {
  const size = puzzleInfo(puzzleOf(solve)).cubeSize,
    // The scramble as the cube the app shows it; a scramble it cannot follow leaves no cube to play on.
    setup = useMemo(() => (solve.scramble ? heldAlg(solve.scramble.trim().split(/\s+/)) : null), [solve.scramble]),
    cube = !!size && setup !== null,
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Annotation>(() => readAnnotation(solve.solution) ?? { top: "yellow", front: "green", moves: "" }),
    draftText = writeAnnotation(draft),
    alg = (editing ? (draftText && draft.moves ? annotationAlg(draft) : "") : played(solve.solution)) ?? "",
    player = useAlgPlayer(alg, cube ? size : null, "full", { setup: setup ?? undefined }),
    [room, setRoom] = useState(0);
  const recorded = readSolution(solve.solution), annotation = readAnnotation(solve.solution),
    analysis = useMemo(() => (size === 3 && recorded ? analyseSolution(solve.scramble, solve.solution) : null), [solve.scramble, solve.solution]);
  const save = async () => {
    if (!draftText) return;
    if (await onSave(draft.moves.trim() ? draftText : null)) setEditing(false);
  };
  // On a screen the cube takes the height left; while turns are written, everything scrolls.
  const grow = fill && !editing;
  // A wide screen puts the cube and its player on the left, the rest docked in a card column at the right.
  const { wide } = useLayout(), split = grow && wide && cube && !!player;

  const head = <>
    <View className="flex-row items-end justify-between gap-3">
      <View className="min-w-0 shrink gap-1">
        <SplitTime text={fmtSolve(solve.time_ms, solve.penalty)} size={52} className={cn(solve.penalty === "dnf" && "text-destructive", solve.penalty === "+2" && "text-warning")} />
        <Text numberOfLines={1} className="text-sm text-muted-foreground">{[tr(puzzleInfo(puzzleOf(solve)).label), fmtDate(solve.created_at), ...(recorded?.at(-1)?.at ? [tr("smart cube")] : [])].join(" · ")}</Text>
      </View>
      {aside}
    </View>
    {solve.scramble ? <View className="gap-0.5" accessibilityLabel={tr("Scramble")}>
      <Label className="font-bold tracking-widest uppercase">{tr("Scramble")}</Label>
      <Alg text={solve.scramble} size={14} selectable />
    </View> : null}
  </>;
  const stage = <>
    {cube && player && <View className={cn("items-center", grow && "min-h-0 flex-1")} onLayout={grow ? e => setRoom(Math.floor(Math.min(e.nativeEvent.layout.height, e.nativeEvent.layout.width))) : undefined}>
      {(grow ? room > 40 : true) && <PlayerCube key={alg + setup} player={player} size={grow ? room : 220} />}
      <ViewButtons player={player} compact className="absolute bottom-0" />
    </View>}
    {cube && player && alg ? <PlayerControls player={player} /> : null}
  </>;
  const rest = <>
    {editing ? <AnnotationEditor value={draft} onChange={setDraft} valid={!!draftText} onCancel={() => setEditing(false)} onSave={() => void save()} />
      : <View className="gap-1" accessibilityLabel={tr("Solution")}>
        <View className="min-h-9 flex-row items-center gap-3">
          <Label className="font-bold tracking-widest uppercase">{tr("Solution")}</Label>
          {annotation && <View className="flex-row items-center gap-1.5">
            <Swatch colour={annotation.top} /><Text className="text-xs text-muted-foreground">{tr("on top")} ·</Text>
            <Swatch colour={annotation.front} /><Text className="text-xs text-muted-foreground">{tr("in front")}</Text>
          </View>}
          <View className="flex-1" />
          {recorded && <SolutionFigures turns={recorded} />}
          {!recorded && cube && <Button variant="outline" size="sm" className="h-10 gap-1.5" onPress={() => setEditing(true)}>
            <Icon as={PenLine} size={15} />
            <Text>{annotation ? tr("Edit the turns") : tr("Write the turns")}</Text>
          </Button>}
        </View>
        {alg && player
          ? <ScrollView className={cn(fill && !split && "max-h-16")} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <PlayerAlg key={alg} player={player} text={recorded ? "z2 " + alg : annotation!.moves} size={15} />
          </ScrollView>
          : !cube ? <Text className="text-sm text-muted-foreground">{tr("No turns recorded for this solve.")}</Text> : null}
      </View>}
    {analysis ? <View className="gap-2 rounded-2xl bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Label className="font-bold tracking-widest uppercase">{tr("Steps")}</Label>
        {onStep && <Button variant="secondary" size="sm" className="h-9 gap-1.5 rounded-full" onPress={() => onStep(analysis.phases.find(p => !p.skip)!.id)}>
          <Icon as={ChartNoAxesColumn} size={15} /><Text>{tr("Analysis")}</Text>
        </Button>}
      </View>
      <SolveBar analysis={analysis} onSelect={onStep} height={14} />
      <View className="flex-row items-center gap-2"><StepLegend analysis={analysis} />{action}</View>
    </View> : action ? <View className="flex-row justify-end">{action}</View> : null}
    {comment ?? (solve.comment ? <Text selectable numberOfLines={fill && !split ? 2 : undefined} className="text-sm text-muted-foreground">{solve.comment}</Text> : null)}
    {!editing && children}
  </>;
  if (split) return <View className="min-h-0 flex-1 flex-row gap-4">
    <View className="min-w-0 flex-1 gap-2.5">{stage}</View>
    <ScrollView className="w-[400px] grow-0 rounded-[26px] bg-popover" contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">{head}{rest}</ScrollView>
  </View>;
  const body = <>{head}{stage}{rest}</>;
  return grow ? <View className="min-h-0 flex-1 gap-2.5">{body}</View>
    : fill ? <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-4" keyboardShouldPersistTaps="handled">{body}</ScrollView>
    : <View className="gap-4">{body}</View>;
}

/** The turns of a recorded solution, and its pace when timed. */
function SolutionFigures({ turns }: { turns: { move: string; at?: number }[] }) {
  const count = mergeTurns(turns.map(turn => turn.move)).length, ms = turns.at(-1)!.at;
  return <Numeric className="text-xs text-muted-foreground">{tr("{0} turns", { 0: count })}{ms ? ` · ${(count / (ms / 1000)).toFixed(2)} TPS` : ""}</Numeric>;
}

/** The keys of the turn pad: face turns, wide turns, slices and rotations. */
const PAD = [
  ["R", "L", "U", "D", "F", "B"],
  ["r", "l", "u", "d", "f", "b"],
  ["M", "E", "S", "x", "y", "z"],
];

/** A pad key: a face appends a turn, a modifier toggles on the last turn, ⌫ removes it. */
function padPress(tokens: string[], key: string): string[] {
  const last = tokens.at(-1);
  if (key === "back") return tokens.slice(0, -1);
  if (key !== "'" && key !== "2") return [...tokens, key];
  if (!last) return tokens;
  const base = last.replace(/(2'|2|')$/, ""), suffix = last.slice(base.length);
  return [...tokens.slice(0, -1), base + (suffix === key ? "" : key)];
}

/**
 * The turns written by hand: how the cube was held (the colours on top and in front), then the turns, put in with the
 * pad only, never typed freely. A modifier toggles on the last turn (R, R', R2).
 */
function AnnotationEditor({ value, onChange, valid, onCancel, onSave }: { value: Annotation; onChange: (a: Annotation) => void; valid: boolean; onCancel: () => void; onSave: () => void }) {
  const tokens = value.moves.trim().split(/\s+/).filter(Boolean),
    press = (k: string) => onChange({ ...value, moves: padPress(tokens, k).join(" ") });
  const colours = (list: readonly Colour[]) => list.map(c => ({ id: c, label: colourName(c), prefix: <Swatch colour={c} /> }));
  const key = (id: string, label: ReactNode, onPress: () => void, accessibilityLabel?: string) =>
    <Button key={id} variant="outline" size="sm" className="h-11 min-w-0 flex-1 px-0" onPress={onPress} accessibilityLabel={accessibilityLabel}>{label}</Button>;
  return <View className="gap-3" accessibilityLabel={tr("Write the turns")}>
    <SheetChoice<Colour> label={tr("On top")} columns={3} value={value.top} options={colours(COLOURS)}
      onChange={top => onChange({ ...value, top, front: frontsOf(top).includes(value.front) ? value.front : frontsOf(top)[0]! })} />
    <SheetChoice<Colour> label={tr("In front")} columns={4} value={value.front} options={colours(frontsOf(value.top))} onChange={front => onChange({ ...value, front })} />
    <View accessibilityLabel={tr("Turns")} className="min-h-16 flex-row flex-wrap content-start gap-1 rounded-md border border-input bg-muted/30 p-2">
      {tokens.length ? tokens.map((t, i) => <View key={i} className="rounded-sm bg-muted px-1.5 py-0.5"><Text className="font-mono text-sm font-medium">{t}</Text></View>)
        : <Text className="self-center text-xs text-muted-foreground">x2 y R U R' U' r M' …</Text>}
    </View>
    <View className="gap-1">
      {PAD.map((row, r) => <View key={r} className="flex-row gap-1">
        {row.map(k => key(k, <Text className="font-medium">{k}</Text>, () => press(k)))}
        {r === 0 ? key("'", <Text>′</Text>, () => press("'"), tr("Counter-clockwise"))
          : r === 1 ? key("2", <Text>2</Text>, () => press("2"), tr("Half turn"))
          : key("back", <Icon as={Delete} size={17} />, () => press("back"), tr("Remove the last turn"))}
      </View>)}
    </View>
    <View className="flex-row justify-end gap-2">
      <Button variant="ghost" onPress={onCancel}><Text>{tr("Cancel")}</Text></Button>
      <Button disabled={!valid} onPress={onSave}><Text>{tr("Save")}</Text></Button>
    </View>
  </View>;
}
