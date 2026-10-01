import { useAtom, useAtomValue } from "jotai";
import { Pause, Play } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { PLAYER_SPEEDS, speedLabel, type AlgPlayer } from "../../../src/client/lib/algPlayer";
import { CUBE_READING, PUZZLE_NOTATION, cubeNotation, describeMove, notationView, type NotationBlock } from "../../../src/client/lib/notation";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { notationAtom, puzzleAtom } from "../state";
import { PlayerCube, useAlgPlayer, usePlayback } from "./AlgPlayer";
import { Choice, Label, Numeric } from "./layout";
import { Sheet, SheetScrollView } from "./Sheet";

/**
 * The notation guide, as the web app's (desktop/renderer/notation.tsx): for the cubes, one block per face, slice and
 * axis with its three moves as tiles, the chosen one turning on the cube at the top; for the other puzzles, their
 * notation in a few lines. A sheet of its own (`notationAtom`), and a page of the guides.
 */
function families(puzzle: PuzzleId): { id: PuzzleId; label: string }[] {
  const cube = puzzleInfo(puzzle).cubeSize ? puzzle : "333";
  return [{ id: cube, label: "Cubes" }, ...PUZZLES.filter(p => !p.cubeSize).map(p => ({ id: p.id, label: p.label }))];
}

export function useNotation() {
  const current = useAtomValue(puzzleAtom);
  const [puzzle, setPuzzle] = useState<PuzzleId>(current);
  const [move, setMove] = useState("R");
  return { puzzle, move, setMove, setPuzzle: (id: PuzzleId) => { setPuzzle(id); setMove("R"); }, list: families(current) };
}
type Notation = ReturnType<typeof useNotation>;

/** The family chooser, then the cube and its move (cubes) or the puzzle's notation (others). `scroll` holds the tiles in a list of their own. */
export function NotationContent({ state, scroll = false }: { state: Notation; scroll?: boolean }) {
  const size = puzzleInfo(state.puzzle).cubeSize;
  const chosen = state.list.some(f => f.id === state.puzzle) ? state.puzzle : state.list[0]!.id;
  const body = size ? <CubeNotation size={size} state={state} /> : <PuzzleNotation puzzle={state.puzzle} />;
  return <>
    <Choice label="Puzzle" value={chosen} onChange={state.setPuzzle} options={state.list} />
    {size ? <MovePlayer key={`${size}:${state.move}`} move={state.move} size={size} /> : null}
    {scroll ? <SheetScrollView style={{ flex: 1 }} contentContainerClassName="gap-6 pb-10">{body}</SheetScrollView> : <View className="gap-6">{body}</View>}
  </>;
}

function CubeNotation({ size, state }: { size: number; state: Notation }) {
  return <>
    {cubeNotation(size).map(group => <View key={group.title} className="gap-2">
      <Label accessibilityRole="header">{group.title}</Label>
      <Text className="text-sm leading-[20px] text-muted-foreground">{group.lead}</Text>
      <View className="gap-4 pt-1">
        {group.blocks.map(block => <MoveBlock key={block.move} block={block} state={state} />)}
      </View>
    </View>)}
    <View className="gap-3">
      <Label accessibilityRole="header">Reading an algorithm</Label>
      {CUBE_READING.map(r => <View key={r.title} className="gap-1.5">
        <Text className="text-sm font-medium">{r.title}</Text>
        <Text className="text-sm leading-[20px] text-muted-foreground">{r.text}</Text>
        {r.examples ? <View className="flex-row flex-wrap gap-1">{r.examples.map(example => <MoveTile key={example} move={example} state={state} wide />)}</View> : null}
      </View>)}
    </View>
  </>;
}

function MoveBlock({ block, state }: { block: NotationBlock; state: Notation }) {
  return <View className="gap-1.5">
    <View className="flex-row items-baseline gap-2">
      <Numeric className="text-sm font-semibold text-foreground">{block.move}</Numeric>
      <Text className="min-w-0 flex-1 text-sm leading-[19px] text-muted-foreground">{block.name === block.move ? block.text : `${block.name}: ${block.text}`}</Text>
    </View>
    <View className="flex-row gap-1">
      {block.variants.map(move => <MoveTile key={move} move={move} state={state} />)}
    </View>
  </View>;
}

function MoveTile({ move, state, wide = false }: { move: string; state: Notation; wide?: boolean }) {
  const on = state.move === move;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${move}: ${describeMove(move, puzzleInfo(state.puzzle).cubeSize ?? 3) || "play it"}`} accessibilityState={{ selected: on }}
    onPress={() => state.setMove(move)}
    className={cn("h-11 items-center justify-center rounded-lg border border-border px-3 active:bg-muted/60", !wide && "flex-1", on && "border-primary/50 bg-primary/10")}>
    <Numeric className={cn("text-base font-medium", on ? "text-primary" : "text-foreground")}>{move}</Numeric>
  </Pressable>;
}

/** The chosen move turning on a solved cube, again and again, seen from the side it turns. */
function MovePlayer({ move, size }: { move: string; size: number }) {
  const player = useAlgPlayer(move, size, "full", { setup: "", loop: true, autoplay: 250, view: notationView(move) });
  if (!player) return null;
  return <View className="flex-row items-center gap-4">
    <PlayerCube player={player} size={128} />
    <View className="min-w-0 flex-1 gap-1.5">
      <Numeric className={cn("font-semibold text-foreground", move.length > 6 ? "text-lg" : "text-4xl leading-[44px]")}>{move}</Numeric>
      <Text className="text-sm leading-[20px] text-muted-foreground">{describeMove(move, size)}</Text>
      <LoopControls player={player} />
    </View>
  </View>;
}

function LoopControls({ player }: { player: AlgPlayer }) {
  const p = usePlayback(player);
  return <View className="-ml-2 flex-row items-center">
    <Pressable accessibilityRole="button" accessibilityLabel={player.active ? "Pause" : "Play"} onPress={player.toggle} className="size-11 items-center justify-center rounded-lg active:bg-muted/60">
      <Icon as={player.active ? Pause : Play} size={18} className="text-muted-foreground" />
    </Pressable>
    {PLAYER_SPEEDS.map(speed => <Pressable key={speed} accessibilityRole="radio" accessibilityState={{ checked: p.speed === speed }} accessibilityLabel={`Speed ${speedLabel(speed)}`}
      onPress={() => player.setSpeed(speed)} className={cn("h-11 min-w-11 items-center justify-center rounded-lg px-1.5", p.speed === speed ? "bg-muted" : "active:bg-muted/60")}>
      <Numeric className={cn("text-xs", p.speed === speed ? "text-foreground" : "text-muted-foreground")}>{speedLabel(speed)}</Numeric>
    </Pressable>)}
  </View>;
}

function PuzzleNotation({ puzzle }: { puzzle: PuzzleId }) {
  return <>
    {(PUZZLE_NOTATION[puzzle] ?? []).map(section => <View key={section.title} className="gap-1.5">
      <Label accessibilityRole="header">{section.title}</Label>
      <Text className="text-[15px] leading-[23px] text-muted-foreground">{section.text}</Text>
      {section.examples ? <View className="flex-row flex-wrap gap-x-5 gap-y-1">{section.examples.map(e => <Numeric key={e} className="text-base font-medium text-foreground">{e}</Numeric>)}</View> : null}
    </View>)}
  </>;
}

/** The notation in a sheet taking the screen's height, opened anywhere with `notationAtom`. */
export function NotationSheet() {
  const [open, setOpen] = useAtom(notationAtom);
  return <Sheet open={open} onClose={() => setOpen(false)} title="Notation" description="How moves are written" tall contentPanning={false} contentClassName="gap-4">
    {open ? <NotationBody /> : null}
  </Sheet>;
}
function NotationBody() {
  const state = useNotation();
  return <NotationContent state={state} scroll />;
}
