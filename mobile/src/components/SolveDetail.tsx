import { Delete, PenLine } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import { annotationAlg, COLOURS, frontsOf, heldAlg, readAnnotation, readSolution, writeAnnotation, type Annotation, type Colour } from "../../../src/client/lib/solution";
import { mergeTurns } from "../../../src/client/lib/solveAnalysis";
import { FACE_COLORS } from "../../../src/shared/cubeAppearance";
import { puzzleInfo, puzzleOf } from "../../../src/shared/puzzles";
import type { SolveDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "./AlgPlayer";
import { Alg, Label, Numeric } from "./layout";
import { SheetChoice } from "./PuzzlePicker";
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

export function SolveDetail({ solve, onSave, comment, children }: { solve: ViewedSolve; /** Saves the turns written (null clears them); resolves true once saved. */ onSave: (solution: string | null) => Promise<boolean>; /** The comment's field, in place of its text while it is written. */ comment?: ReactNode; children?: ReactNode }) {
  const size = puzzleInfo(puzzleOf(solve)).cubeSize,
    // The scramble as the cube the app shows it; a scramble it cannot follow leaves no cube to play on.
    setup = useMemo(() => (solve.scramble ? heldAlg(solve.scramble.trim().split(/\s+/)) : null), [solve.scramble]),
    cube = !!size && setup !== null,
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Annotation>(() => readAnnotation(solve.solution) ?? { top: "yellow", front: "green", moves: "" }),
    draftText = writeAnnotation(draft),
    alg = (editing ? (draftText && draft.moves ? annotationAlg(draft) : "") : played(solve.solution)) ?? "",
    player = useAlgPlayer(alg, cube ? size : null, "full", { setup: setup ?? undefined });
  const recorded = readSolution(solve.solution), annotation = readAnnotation(solve.solution);
  const save = async () => {
    if (!draftText) return;
    if (await onSave(draft.moves.trim() ? draftText : null)) setEditing(false);
  };

  return <View className="gap-5">
    {cube && player && <View className="items-center gap-3">
      <PlayerCube key={alg + setup} player={player} size={240} />
      <ViewButtons player={player} />
      {alg ? <View className="self-stretch"><PlayerControls player={player} /></View> : null}
    </View>}
    <View className="gap-1">
      <Numeric className={cn("text-5xl font-medium tracking-tight", solve.penalty === "dnf" && "text-destructive", solve.penalty === "+2" && "text-warning")}>{fmtSolve(solve.time_ms, solve.penalty)}</Numeric>
      <Text className="text-sm text-muted-foreground">{[tr(puzzleInfo(puzzleOf(solve)).label), fmtDate(solve.created_at)].join(" · ")}</Text>
    </View>
    {solve.scramble ? <View className="gap-2" accessibilityLabel={tr("Scramble")}>
      <Label>{tr("Scramble")}</Label>
      <Alg text={solve.scramble} size={15} selectable />
    </View> : null}
    {editing ? <AnnotationEditor value={draft} onChange={setDraft} valid={!!draftText} onCancel={() => setEditing(false)} onSave={() => void save()} />
      : <View className="gap-2" accessibilityLabel={tr("Solution")}>
        <View className="min-h-11 flex-row items-center gap-3">
          <Label>{tr("Solution")}</Label>
          {recorded && <SolutionFigures turns={recorded} />}
          {annotation && <View className="flex-row items-center gap-1.5">
            <Swatch colour={annotation.top} /><Text className="text-xs text-muted-foreground">{tr("on top")} ·</Text>
            <Swatch colour={annotation.front} /><Text className="text-xs text-muted-foreground">{tr("in front")}</Text>
          </View>}
          <View className="flex-1" />
          {!recorded && cube && <Button variant="outline" size="sm" className="h-11 gap-1.5" onPress={() => setEditing(true)}>
            <Icon as={PenLine} size={15} />
            <Text>{annotation ? tr("Edit the turns") : tr("Write the turns")}</Text>
          </Button>}
        </View>
        {alg && player
          ? <PlayerAlg key={alg} player={player} text={recorded ? "z2 " + alg : annotation!.moves} size={16} />
          : <Text className="text-sm text-muted-foreground">{cube ? tr("No turns yet: write them to replay the solve.") : tr("No turns recorded for this solve.")}</Text>}
      </View>}
    {comment ?? (solve.comment ? <Text selectable className="text-sm text-muted-foreground">{solve.comment}</Text> : null)}
    {!editing && children}
  </View>;
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
