/**
 * A match being raced: the score in sets and in solves of the set under way, the scramble both players solve, their
 * two timers (Space starts the player's own, as on the timer page), and every solve so far. Those who are not players
 * watch it live. Once a player has won, the result, and the way back to the tournament or the group.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, ChevronLeft, Crown, Flag, Plus, Swords, Undo2 } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { PracticeTimer, timerHint, type TimerSnapshot } from "../../../src/client/lib/practiceTimer";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { eventInfo, heldScramble } from "../../../src/shared/puzzles";
import { isPolyPuzzle } from "../../../src/shared/puzzleScene";
import { Side } from "../duel";
import { Cube } from "../Cube";
import { useSquare } from "../practice";
import { Alg, FADE, LABEL, NUMERIC, PAGE, PageHead } from "../ui";
import { communityUrl, eventName, formatText, tournamentUrl, type Match } from "../community/client";
import { live, resultTime, type Phase } from "./matchClient";
import { shownSolve } from "../../../src/client/lib/duel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** The player's own timer: every phase goes to the other player, the stop as the solve itself. */
function useMatchTimer() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const [timer] = useState(
    () =>
      new PracticeTimer({
        canStart: () => live.canSolve && !s.overlay,
        onStop: (ms) => live.solve(ms),
        onChange: (snapshot) => {
          setSnapshot(snapshot);
          if (snapshot.phase !== "stopped") live.timer(snapshot.phase);
          s.running = snapshot.phase === "running";
          s.emit();
        },
      }),
  );
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (timer.snapshot.phase === "running") {
        e.preventDefault();
        return timer.press();
      }
      if ((e.target as HTMLElement).closest?.("input,textarea,select,[role=menu],[role=dialog],[role=alertdialog],[role=listbox]") || s.overlay) return;
      if (e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        timer.press();
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && timer.release();
    const pointer = () => timer.snapshot.phase === "running" && timer.press();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", timer.cancelArming);
    addEventListener("pointerdown", pointer);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", timer.cancelArming);
      removeEventListener("pointerdown", pointer);
      timer.dispose();
      s.running = false;
    };
  }, []);
  // A new solve starts the digits over.
  useEffect(() => timer.reset(), [live.solves.length]);
  const phase: Phase = snapshot.phase === "stopped" ? "idle" : snapshot.phase;
  return { phase, startedAt: snapshot.startedAt };
}

export function MatchPage() {
  const id = Number(s.view.split("/")[0]);
  useEffect(() => {
    live.open(id);
    // The notice that brought the player here, if any, has done its job.
    toast.dismiss("community-match-" + id);
    return () => live.close();
  }, [id]);
  const m = live.match;
  if (!m)
    return (
      <div className={PAGE}>
        <PageHead title={tr("Match")} lead={<BackButton />} />
        {live.error ? <p className="text-sm text-muted-foreground">{said(live.error)}</p> : <Skeleton className="min-h-0 flex-1 rounded-xl" />}
      </div>
    );
  return <Race m={m} />;
}

/** Back to where the match belongs: its tournament, or its group's battles. */
const home = (m: Match | null) => (m?.tournamentId ? tournamentUrl(m.tournamentId) : m?.groupId ? communityUrl(`groups/${m.groupId}/battles`) : tournamentUrl());
function BackButton() {
  return (
    <Button variant="outline" size="icon" aria-label={tr("Back")} className="size-8" onClick={() => go(home(live.match))}>
      <ChevronLeft />
    </Button>
  );
}

function Race({ m }: { m: Match }) {
  const timer = useMatchTimer(),
    seat = live.seat,
    playing = seat !== null,
    // The player on the left; a spectator sees the first player there.
    left = seat ?? 0,
    right = 1 - left,
    current = live.current,
    event = eventInfo(m.event),
    cubeSize = event ? s.info(event.puzzle)?.cubeSize : 0,
    previewed = !!cubeSize || isPolyPuzzle(event?.puzzle),
    [cubeBox, setCubeBox] = useState<HTMLDivElement | null>(null),
    cubeSide = useSquare(cubeBox),
    last = live.solves.at(-1),
    other = m.players[right];
  const rest = (s: number) => {
    return shownSolve((current ?? last)?.results[s] ?? undefined);
  };
  const waiting = !m.present?.every(Boolean);
  const hint = (s: number) => {
    if (live.over) return m.winner === m.players[s]?.id ? "Winner" : "";
    if (!m.present?.[s]) return "Not here";
    if (current?.results[s]) return current.results[1 - s] ? "" : `Waiting for ${m.players[1 - s]?.username}`;
    return "";
  };
  const myHint = timerHint(timer.phase, {
    disabled: live.over ? "Match over" : waiting ? `Waiting for ${other?.username ?? "your opponent"}…` : !current ? "Drawing the scramble…" : current.results[left] ? `Waiting for ${other?.username}` : false,
    keyboard: true,
  });
  const scramble = current?.scramble ?? "";
  const setNumber = m.score.sets[0] + m.score.sets[1] + 1;
  return (
    <div className={cn(PAGE, "match-race")}>
      <PageHead
        lead={<BackButton />}
        title={m.tournament ?? tr("Battle")}
        sub={[m.tournament ? `Round ${m.round}` : m.group, eventName(m.event), formatText(m)].filter(Boolean).join(" · ")}
      >
        {playing && !live.over && <Forfeit />}
      </PageHead>
      {/* The score: sets won, then the solves of the set under way. */}
      <section className={cn("grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 rounded-xl bg-muted/45 px-6 py-4", FADE)} aria-label={tr("Score")}>
        {[left, right].map((seatShown, i) => {
          const p = m.players[seatShown],
            won = m.winner && m.winner === p?.id;
          const cell = (
            <div key={seatShown} className={cn("flex min-w-0 items-center gap-4", i === 1 && "flex-row-reverse text-right")}>
              <span className={cn(NUMERIC, "text-5xl font-semibold tracking-tight", won && "text-success")}>{m.score.sets[seatShown]}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-1.5 truncate text-lg font-semibold">
                  {won && <Crown className="size-4 text-warning" />}
                  {p?.username ?? "–"}
                  {seatShown === seat && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">{tr("You")}</span>}
                </span>
                <span className={cn("flex gap-1", i === 1 && "justify-end")} aria-label={tr("{0} of {1} solves in this set", { 0: m.score.points[seatShown], 1: m.points })}>
                  {Array.from({ length: m.points }, (_, k) => (
                    <span key={k} className={cn("h-1.5 w-5 rounded-full", k < m.score.points[seatShown] ? "bg-primary" : "bg-muted-foreground/20")} />
                  ))}
                </span>
              </span>
            </div>
          );
          return i === 0 ? (
            [cell, <div key="mid" className="flex flex-col items-center gap-0.5 text-center">
              <span className={LABEL}>{live.over ? tr("Final score") : tr("Set {0}", { 0: setNumber })}</span>
              <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{m.sets > 1 ? tr("First to {0} sets", { 0: m.sets }) : tr("One set")}</span>
            </div>]
          ) : (
            cell
          );
        })}
      </section>
      <section className={cn("flex shrink-0 flex-col gap-2", FADE)}>
        <span className={LABEL}>{current ? tr("Solve {0}", { 0: current.number }) : tr("Scramble")}</span>
        <div className="scramble max-h-[18vh] min-h-9 overflow-y-auto">
          {live.over ? (
            <span className="text-sm text-muted-foreground">{m.status === "cancelled" ? tr("This match was called off.") : tr("{0} solves raced.", { 0: m.solves?.length ?? 0 })}</span>
          ) : scramble ? (
            <Alg text={scramble} size={scramble.length > 120 ? 19 : 24} />
          ) : (
            <Skeleton className="h-8 w-[min(100%,32em)]" />
          )}
        </div>
      </section>
      <div className={cn("grid min-h-0 flex-1 gap-6", previewed ? "grid-cols-[1fr_minmax(0,0.6fr)_1fr]" : "grid-cols-2")}>
        {playing ? (
          <Side name={m.players[left]?.username} tag="You" rest={timer.phase !== "idle" ? "0.000" : rest(left)} startedAt={timer.startedAt} phase={timer.phase} hint={said(myHint)} mine />
        ) : (
          <Side name={m.players[left]?.username} tag={m.present?.[left] ? "Here" : "Away"} rest={live.phases[left] !== "idle" ? "0.000" : rest(left)} startedAt={live.started[left]} phase={live.phases[left]} hint={hint(left)} mine={false} />
        )}
        {previewed && (
          <div ref={setCubeBox} className={cn("flex min-h-0 items-center justify-center", FADE)}>
            {cubeSide > 0 && scramble && !live.over && (
              <Cube setup={scramble} cubeSize={cubeSize} puzzle={event?.puzzle} size={Math.round(Math.min(cubeSide * 0.85, 220))} held={heldScramble("normal")} />
            )}
          </div>
        )}
        <Side
          name={m.players[right]?.username}
          tag={m.present?.[right] ? "Here" : "Away"}
          rest={live.phases[right] !== "idle" ? "0.000" : rest(right)}
          startedAt={live.started[right]}
          phase={live.phases[right]}
          hint={hint(right)}
          mine={false}
          className={m.present?.[right] ? undefined : "opacity-50"}
        />
      </div>
      <Solves m={m} left={left} actions={playing && !live.over} />
      <Result m={m} />
    </div>
  );
}

/** Every solve so far, one column each: both times, the faster in green, a line between sets. */
function Solves({ m, left, actions }: { m: Match; left: number; actions: boolean }) {
  const solves = m.solves ?? [],
    mine = live.seat !== null ? solves.at(-1)?.results[live.seat] : null;
  return (
    <section className={cn("flex shrink-0 items-center gap-4 rounded-xl bg-muted/45 px-4 py-3", FADE)} aria-label={tr("Solves")}>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {!solves.length && <span className="py-2 text-sm text-muted-foreground">{tr("No solve yet.")}</span>}
        {solves.map((solve) => (
          <div key={solve.number} className="flex w-20 shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1" data-solve={solve.number}>
            <span className={cn(NUMERIC, "text-[11px] text-muted-foreground")}>{solve.number}</span>
            {[left, 1 - left].map((seat) => {
              const r = solve.results[seat];
              return (
                <span key={seat} className={cn(NUMERIC, "text-sm", !r ? "text-muted-foreground/40" : solve.winner === seat ? "font-medium text-success" : r.penalty === "dnf" ? "text-destructive" : "text-muted-foreground")}>
                  {r ? fmtSolve(r.ms, r.penalty) : "–"}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1" data-no-timer>
          <Toggle size="sm" variant="outline" pressed={mine?.penalty === "+2"} disabled={!mine} onPressedChange={() => live.penalty("+2")} className="aria-pressed:text-warning">
            <Plus />2
          </Toggle>
          <Toggle size="sm" variant="outline" pressed={mine?.penalty === "dnf"} disabled={!mine} onPressedChange={() => live.penalty("dnf")} className="aria-pressed:text-destructive">
            <Ban />
            {tr("DNF")}</Toggle>
          <Button size="sm" variant="ghost" disabled={!live.canCancel} onClick={() => live.cancel()} className="text-muted-foreground">
            <Undo2 />
            {tr("Redo")}</Button>
        </div>
      )}
    </section>
  );
}

function Forfeit() {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" className="text-muted-foreground hover:text-destructive" />}>
        <Flag />
        {tr("Forfeit")}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("Give up the match?")}</AlertDialogTitle>
          <AlertDialogDescription>{tr("Your opponent wins it at once")}{live.match?.tournamentId ? tr(" and goes through to the next round") : ""}.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("Keep playing")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => live.forfeit()}>
            {tr("Forfeit")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Once the match is over: who won, by how many sets, and back to the tournament or the group. */
function Result({ m }: { m: Match }) {
  const [closed, setClosed] = useState(0);
  const open = m.status === "done" && closed !== m.id;
  const winner = m.players.find((p) => p?.id === m.winner),
    mine = winner && winner.id === s.user.id,
    seat = m.players.findIndex((p) => p?.id === m.winner),
    fastest = (m.solves ?? []).flatMap((x) => x.results.map(resultTime)).filter((t): t is number => t !== null);
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && setClosed(m.id)}>
      <DialogContent className="gap-6 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Swords className="size-5 text-muted-foreground" />
            {mine ? tr("You win") : tr("{0} wins", { 0: winner?.username ?? "Nobody" })}
          </DialogTitle>
          <DialogDescription>
            {m.forfeit ? tr("The match was given.") : tr("{0}–{1} in sets.", { 0: m.score.sets[seat], 1: m.score.sets[1 - seat] })}
            {fastest.length ? tr(" Fastest solve {0}.", { 0: fmtTime(Math.min(...fastest)) }) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setClosed(m.id)}>
            {tr("Stay")}</Button>
          <Button onClick={() => go(home(m))}>{m.tournamentId ? tr("Back to the tournament") : tr("Back to the group")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
