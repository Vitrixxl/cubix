/**
 * The notation guide: for the cubes, one block per face, slice and axis with its three moves (X, X', X2) as tiles,
 * the chosen one turning on the 3D cube beside them (seen from the side it turns); for the other puzzles, their
 * notation said in a few lines. Opened from the sidebar (the account menu on phones), from Learn, and as a guide.
 */
import { Pause, Play } from "lucide-react";
import { CUBE_READING, PUZZLE_NOTATION, cubeNotation, describeMove, isCubeNotation, notationView, type NotationBlock } from "../../src/client/lib/notation";
import { PUZZLES, puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { PLAYER_SPEEDS, speedLabel } from "../../src/client/lib/algPlayer";
import { store as s, run } from "./store";
import { Choice, LABEL, NUMERIC, Tip, usePhone } from "./ui";
import { PlayerCube, useAlgPlayer, usePlayback } from "./AlgPlayer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AlgPlayer } from "../../src/client/lib/algPlayer";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** The puzzles with a notation of their own; the cubes share one, shown on the cube in use. */
function families(): { id: PuzzleId; label: string }[] {
  const cube = puzzleInfo(s.puzzle as PuzzleId)?.cubeSize ? (s.puzzle as PuzzleId) : "333";
  return [{ id: cube, label: "Cubes" }, ...PUZZLES.filter((p) => !p.cubeSize).map((p) => ({ id: p.id, label: p.label }))];
}

export function NotationContent({ guide = false }: { guide?: boolean }) {
  const phone = usePhone(),
    puzzle = s.notationPuzzle,
    size = puzzleInfo(puzzle).cubeSize,
    list = families(),
    chosen = list.find((f) => f.id === puzzle) ? puzzle : size ? list[0]!.id : puzzle;
  return (
    <div className={cn("flex min-h-0 flex-col gap-5", !guide && "flex-1")}>
      <Choice prefix="notationPuzzle:" label={tr("Puzzle")} value={chosen} options={list} className="flex-wrap" />
      {size && isCubeNotation(puzzle) ? (
        <div className={cn("flex min-h-0 flex-1 gap-6", phone ? "flex-col" : "flex-row")}>
          {phone && (
            <div className="sticky top-0 z-10 -mx-5 -mt-2 bg-popover px-5 pt-2 pb-3">
              <MovePlayer key={`${size}:${s.notationMove}`} move={s.notationMove} size={size} phone />
            </div>
          )}
          <div className={cn("flex min-w-0 flex-1 flex-col gap-6", !guide && !phone && "overflow-y-auto pr-2")}>
            {cubeNotation(size).map((group) => (
              <section key={group.title} className="flex flex-col gap-2" aria-label={said(group.title)}>
                <h3 className={LABEL}>{said(group.title)}</h3>
                <p className="text-sm text-muted-foreground">{said(group.lead)}</p>
                <div className={cn("grid gap-x-6 gap-y-4 pt-1", phone || guide ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2")}>
                  {group.blocks.map((b) => (
                    <MoveBlock key={b.move} block={b} />
                  ))}
                </div>
              </section>
            ))}
            <section className="flex flex-col gap-3" aria-label={tr("Reading an algorithm")}>
              <h3 className={LABEL}>{tr("Reading an algorithm")}</h3>
              {CUBE_READING.map((r) => (
                <div key={r.title} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{said(r.title)}</span>
                  <p className="text-sm text-muted-foreground">{said(r.text)}</p>
                  {r.examples && (
                    <div className="flex flex-wrap gap-1">
                      {r.examples.map((example) => (
                        <MoveTile key={example} move={example} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
          {!phone && (
            <div className={cn("flex w-72 shrink-0 flex-col", guide && "sticky top-0 self-start")}>
              <MovePlayer key={`${size}:${s.notationMove}`} move={s.notationMove} size={size} />
            </div>
          )}
        </div>
      ) : (
        <div className={cn("flex max-w-2xl flex-col gap-5", !guide && "overflow-y-auto")}>
          {(PUZZLE_NOTATION[puzzle] ?? []).map((section) => (
            <section key={section.title} className="flex flex-col gap-1.5" aria-label={said(section.title)}>
              <h3 className={LABEL}>{said(section.title)}</h3>
              <p className="text-sm text-muted-foreground">{said(section.text)}</p>
              {section.examples && (
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {section.examples.map((example) => (
                    <span key={example} className={cn(NUMERIC, "text-base font-medium")}>
                      {said(example)}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** A face, slice or axis: its letter and what it turns, then its three moves side by side. */
function MoveBlock({ block }: { block: NotationBlock }) {
  return (
    <div className="flex flex-col gap-1.5" data-notation-block={block.move}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={cn(NUMERIC, "text-sm font-semibold")}>{said(block.move)}</span>
        <span className="min-w-0 text-sm leading-snug text-muted-foreground">{block.name === block.move ? block.text : `${block.name}: ${block.text}`}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {block.variants.map((move) => (
          <MoveTile key={move} move={move} />
        ))}
      </div>
    </div>
  );
}

/** A move to show: a click turns it on the cube. */
function MoveTile({ move }: { move: string }) {
  const on = s.notationMove === move,
    phone = usePhone();
  return (
    <button
      type="button"
      data-action={"notationMove:" + move}
      aria-pressed={on}
      aria-label={`${move}: ${describeMove(move, puzzleInfo(s.notationPuzzle).cubeSize ?? 3) || "play it"}`}
      onClick={run("notationMove:" + move)}
      className={cn(
        NUMERIC,
        "flex items-center justify-center rounded-lg border px-3 text-base font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50",
        phone ? "h-11" : "h-10",
        on && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/10",
      )}
    >
      {said(move)}
    </button>
  );
}

/** The chosen move turning on a solved cube, again and again, seen from the side it turns. */
function MovePlayer({ move, size, phone = false }: { move: string; size: number; phone?: boolean }) {
  const player = useAlgPlayer(move, size, "full", { setup: "", loop: true, autoplay: 250, view: notationView(move) });
  const text = describeMove(move, size);
  if (!player) return null;
  return (
    <div className={cn("flex items-center gap-4", phone ? "flex-row" : "flex-col")} data-notation-player>
      <PlayerCube player={player} size={phone ? 132 : 240} />
      <div className={cn("flex min-w-0 flex-col gap-2", phone ? "flex-1" : "items-center text-center")}>
        <span className={cn(NUMERIC, "font-semibold tracking-tight", move.length > 6 ? "text-lg" : "text-4xl")}>{said(move)}</span>
        {text && <p className="text-sm text-muted-foreground">{text}</p>}
        <LoopControls player={player} />
      </div>
    </div>
  );
}

function LoopControls({ player }: { player: AlgPlayer }) {
  const p = usePlayback(player),
    phone = usePhone();
  return (
    <div className="flex items-center gap-1">
      <Tip content={player.active ? "Pause" : "Play"}>
        <Button variant="ghost" size={phone ? "icon-lg" : "icon"} aria-label={player.active ? tr("Pause") : tr("Play")} onClick={player.toggle} className={cn("text-muted-foreground hover:text-foreground", phone && "size-11")}>
          {player.active ? <Pause /> : <Play />}
        </Button>
      </Tip>
      {PLAYER_SPEEDS.map((speed) => (
        <Button
          key={speed}
          variant="ghost"
          size="sm"
          aria-pressed={p.speed === speed}
          onClick={() => player.setSpeed(speed)}
          className={cn(NUMERIC, "px-2 text-xs text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground", phone && "h-11")}
        >
          {speedLabel(speed)}
        </Button>
      ))}
    </div>
  );
}
