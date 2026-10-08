/**
 * The duel page: looking for an opponent, then the race split in two with the cube in the middle, each side under its
 * player's bar, and beside it the rounds as a move list over the chat.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { store as s } from "./store";
import { duel, ao5, clock, compare, opponentStatus, raceAverage, shownSolve, solveTime, ROUNDS, type DuelPhase } from "./duelClient";
import { Cube } from "./Cube";
import { useSquare } from "./practice";
import { PracticeTimer, timerHint, type TimerSnapshot } from "../../src/client/lib/practiceTimer";
import { fmtSolve, fmtTime } from "../../src/client/lib/format";
import { eventInfo, eventLabel, heldScramble } from "../../src/shared/puzzles";
import { isPolyPuzzle } from "../../src/shared/puzzleScene";
import { Ban, Plus, Send, Swords, Trophy, X, MessageSquare, Box, Undo2, LogOut, type LucideIcon } from "lucide-react";
import { PhoneSheet, TouchAction, TouchBar } from "./phone";
import { ActionToggle, Alg, Avatar, Button, Empty, Figure, FADE, LABEL, NUMERIC, MenuAction, Modal, PAGE, PageHead, PenaltyToggles, SectionHead, Strip, Surface, isPhone, useViewport } from "./ui";
import { LiveDigits } from "./practice";
import { LiveDot, MoveList, type Move } from "./tournaments/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

const ROUND_LIST = [...Array(ROUNDS).keys()];

/**
 * The player's own timer: Space (or a touch) like the timer page; every phase is relayed to the opponent. The race
 * re-renders on phase changes only; the running time is drawn by `LiveDigits`.
 */
function useDuelTimer() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>({ phase: "idle", elapsed: 0, startedAt: 0 });
  const [timer] = useState(
    () =>
      new PracticeTimer({
        canStart: () => duel.canSolve && !s.overlay,
        onStop: (ms) => duel.solve(ms),
        onChange: (snapshot) => {
          setSnapshot(snapshot);
          // A stop reaches the opponent as the solve itself.
          if (snapshot.phase !== "stopped") duel.timer(snapshot.phase);
          // The fade follows `s.running` (see the store): the race alone is drawn again.
          s.running = snapshot.phase === "running";
        },
      }),
  );
  useEffect(() => {
    timer.reset();
  }, [s.timerEpoch, timer]);
  useEffect(() => {
    const running = () => timer.snapshot.phase === "running";
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (running()) {
        e.preventDefault();
        timer.press();
        return;
      }
      if ((e.target as HTMLElement).closest?.("input,textarea,select,[role=menu],[role=dialog],[role=listbox]") || s.overlay) return;
      if (e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        timer.press();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") timer.release();
    };
    const pointer = () => {
      if (running()) timer.press();
    };
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
  const phase: DuelPhase = snapshot.phase === "stopped" ? "idle" : snapshot.phase;
  return { phase, startedAt: snapshot.startedAt, press: timer.press, release: timer.release };
}

export function DuelPage() {
  useEffect(() => {
    void duel.loadLevel(s.event().id);
  }, [s.puzzle, s.solveMode]);
  return duel.status === "racing" ? <Race /> : <Lobby />;
}

/** Before a race: the player's level on the event and the one button to start (or stop) looking for an opponent. */
function Lobby() {
  const searching = duel.status === "searching",
    [, setSecond] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setSecond((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  return (
    <div className={cn(PAGE, "duel-lobby")}>
      <PageHead title={tr("Duel")} puzzle />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-[6vh] max-md:justify-end max-md:pb-0">
        <Surface className="w-full max-w-lg gap-6 p-6" data-tour="duel">
          <div className="flex flex-col items-center gap-4 pt-2 text-center">
            {/* While searching, rings go out from the mark, as a radar would. */}
            <span className="relative flex size-16 items-center justify-center">
              {searching && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 [animation-duration:1.8s] motion-reduce:animate-none" />
                  <span className="absolute -inset-2 animate-pulse rounded-full ring-1 ring-primary/30 motion-reduce:animate-none" />
                </>
              )}
              <span className={cn("relative flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors", searching && "bg-primary/15 text-primary")}>
                <Swords className="size-7" />
              </span>
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">{searching ? tr("Looking for an opponent") : tr("Race an Ao5")}</h2>
              <p className={cn("max-w-sm text-sm text-balance", duel.notice ? "text-destructive" : "text-muted-foreground")}>
                {duel.notice || tr("The same five {0} scrambles for both of you, against a player near your level.", { 0: s.event().label })}
              </p>
            </div>
          </div>
          <Strip className="grid-cols-3">
            <Figure label={tr("Your level")} size="xl" value={duel.level === undefined ? <Skeleton className="h-6 w-16" /> : duel.level === null ? tr("New") : fmtTime(duel.level)} />
            <Figure label={tr("Searching")} size="xl" value={searching ? clock(Date.now() - duel.searchSince) : "–"} tone={searching ? "accent" : ""} />
            <Figure label={tr("Also searching")} size="xl" value={searching ? String(duel.searching) : "–"} />
          </Strip>
          <Button action={searching ? "duel:leave" : "duel:search"} variant={searching ? "ghost" : "default"} size="lg" icon={searching ? X : Swords} className={cn("w-full max-md:h-11", searching && "text-muted-foreground")}>
            {searching ? tr("Cancel") : tr("Find an opponent")}
          </Button>
        </Surface>
      </div>
    </div>
  );
}

/**
 * A player's bar, as over a chess board: the face, the name and the level beside it, what the player is doing under it
 * (with the live dot while solving), and the score in a box on the right, lit while the player's timer is on.
 */
export function PlayerBar({
  name,
  avatar,
  level,
  status,
  live = false,
  score,
  active = false,
  className,
}: {
  name?: string;
  avatar?: string | null;
  level?: React.ReactNode;
  status?: React.ReactNode;
  live?: boolean;
  score?: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-w-0 items-center gap-3", className)}>
      <Avatar name={name} src={avatar} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{said(name)}</span>
          {level != null && <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{level}</span>}
        </span>
        <span className={cn("flex h-4 items-center gap-1.5 text-xs", live ? "text-primary" : "text-muted-foreground")}>
          {live && <LiveDot className="size-1.5" />}
          {said(status)}
        </span>
      </div>
      {score != null && (
        <span className={cn(NUMERIC, "flex h-10 min-w-12 shrink-0 items-center justify-center rounded-lg px-3 text-2xl font-semibold transition-colors", active ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
          {score}
        </span>
      )}
    </div>
  );
}

/**
 * One side of the race: the player's bar (under the digits when `below`, the phone's own side), the digits (`rest` at
 * rest, running from `startedAt`), what to do next, and the player's own `actions` on the latest solve.
 */
export function Side({
  bar,
  below = false,
  rest,
  startedAt,
  phase,
  hint,
  mine,
  actions,
  className,
  ...handlers
}: {
  bar: React.ReactNode;
  below?: boolean;
  rest: string;
  startedAt: number;
  phase: string;
  hint?: string;
  mine: boolean;
  actions?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("duel-side flex min-h-0 min-w-0 touch-manipulation flex-col gap-3 select-none", below && "flex-col-reverse", mine ? "mine" : "theirs", phase, className)} {...handlers}>
      <div className={FADE}>{bar}</div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 [container-type:size] md:gap-4">
        <LiveDigits text={said(rest)} startedAt={startedAt} phase={phase} className={cn("text-[clamp(40px,min(calc(170cqw/var(--chars)),40cqh),168px)]", !mine && phase === "idle" && "text-foreground/70")} />
        <div className={cn("timer-hint min-h-5 text-sm text-muted-foreground", FADE)}>{said(hint)}</div>
        {actions && (
          <div className={cn("flex items-center gap-1", FADE)} data-no-timer>
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

/** The rounds each player won, by the better time. */
const roundsWon = (seat: number) => ROUND_LIST.filter((r) => duel.results[seat]?.[r] && duel.results[1 - seat]?.[r] && compare(solveTime(duel.results[seat]![r]!), solveTime(duel.results[1 - seat]![r]!)) === "win").length;

/** The race: the scramble across the top, the two timers either side of the cube, the rounds and the chat beside. */
function Race() {
  const timer = useDuelTimer(),
    { w } = useViewport(),
    mobile = isPhone(w),
    chatDocked = !mobile && w >= 1100,
    running = timer.phase === "running",
    opponent = duel.opponent,
    me = duel.players[duel.seat],
    round = duel.round,
    event = eventInfo(duel.event),
    cubeSize = event ? s.info(event.puzzle)?.cubeSize : 0,
    // The pyraminx and the megaminx have a 3D model too.
    previewed = !!cubeSize || isPolyPuzzle(event?.puzzle),
    scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "",
    cubeShown = !mobile && duel.showCube && previewed,
    [cubeBox, setCubeBox] = useState<HTMLDivElement | null>(null),
    cubeSide = useSquare(cubeBox);
  const myLast = duel.me[duel.latest(duel.me)];
  const mine = duel.me,
    theirs = duel.them,
    myRest = timer.phase !== "idle" ? "0.000" : shownSolve(mine[duel.latest(mine)]),
    theirRest = duel.opponentPhase !== "idle" ? "0.000" : shownSolve(theirs[duel.latest(theirs)]);
  const myHint = timerHint(timer.phase, {
    disabled: !duel.opponentHere
      ? `${opponent.name} left the race`
      : duel.over
        ? "Race over"
        : !duel.scrambles.length
          ? "Drawing the scrambles…"
          : !!mine[round] && `Waiting for ${opponent.name}`,
    keyboard: !mobile,
  });
  // What the player is doing, said as the opponent's is.
  const myStatus = opponentStatus({ opponentHere: true, over: duel.over, opponentPhase: timer.phase, them: mine, round, scrambles: duel.scrambles });
  const promptFont = mobile ? (scramble.length > 90 ? 15 : 18) : scramble.length > 220 ? 16 : scramble.length > 120 ? 19 : 24;
  const mySide = (
    <Side
      bar={<PlayerBar name={me?.name} level={me?.level ? fmtTime(me.level) : undefined} status={myStatus} live={running} score={roundsWon(duel.seat)} active={timer.phase !== "idle"} />}
      below={mobile}
      rest={myRest}
      startedAt={timer.startedAt}
      phase={timer.phase}
      hint={said(myHint)}
      mine
      actions={
        !mobile && (
          <>
            <PenaltyToggles penalty={myLast?.penalty} prefix="duel:" disabled={!myLast} />
            <Button action="duel:cancel" icon={Undo2} size="sm" variant="outline" disabled={!duel.canCancel} tip={tr("Take the solve back and redo it")} className="text-muted-foreground">
              {tr("Redo")}
            </Button>
          </>
        )
      }
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (mobile && !running) timer.press();
      }}
      onPointerUp={(e) => timer.release(e.timeStamp)}
    />
  );
  const theirSide = (
    <Side
      bar={
        <PlayerBar
          name={opponent.name}
          level={opponent.level ? fmtTime(opponent.level) : undefined}
          status={opponentStatus(duel)}
          live={duel.opponentPhase === "running"}
          score={roundsWon(1 - duel.seat)}
          active={duel.opponentPhase !== "idle"}
        />
      }
      rest={theirRest}
      startedAt={duel.opponentStart}
      phase={duel.opponentPhase}
      mine={false}
      className={duel.opponentHere ? undefined : "gone opacity-50"}
    />
  );
  return (
    <div className={cn(PAGE, "duel-race")}>
      <PageHead
        title={tr("Duel")}
        sub={tr("vs {0} · {1}", { 0: opponent.name, 1: event ? eventLabel(event.puzzle, event.solveMode) : duel.event })}
        more={
          mobile && (
            <>
              {duel.over && duel.dismissed === duel.game && <MenuAction action="duel:result" icon={Trophy}>{tr("Result")}</MenuAction>}
              {!duel.opponentHere && <MenuAction action="duel:next" icon={Swords}>{tr("New opponent")}</MenuAction>}
              <MenuAction action="duel:leave" icon={X}>{tr("Leave the race")}</MenuAction>
            </>
          )
        }
      >
        {!mobile && duel.over && duel.dismissed === duel.game && (
          <Button action="duel:result" icon={Trophy}>
            {tr("Result")}</Button>
        )}
        {!mobile && !duel.opponentHere && (
          <Button action="duel:next" icon={Swords}>
            {tr("New opponent")}</Button>
        )}
        {!mobile && previewed && (
          <ActionToggle action="duel:cube" pressed={duel.showCube} icon={Box} tip={tr("Show or hide the cube")}>
            {tr("Cube")}</ActionToggle>
        )}
        {!chatDocked && (
          <ActionToggle action="duel:chat" pressed={duel.chatOpen} icon={MessageSquare} tip={tr("Chat")}>
            {mobile ? (duel.unread ? String(duel.unread) : null) : duel.unread ? tr("Chat · {0}", { 0: duel.unread }) : tr("Chat")}
          </ActionToggle>
        )}
        {!mobile && (
          <Button action="duel:leave" icon={X}>
            {tr("Leave")}</Button>
        )}
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-6">
        {mobile ? (
          // Phones keep the race as a card: the opponent on top, the player at the bottom, the rounds under them.
          <Surface className="flex-1">
            <Scramble scramble={scramble} font={promptFont} className="px-4 pt-4" />
            <div className="grid min-h-0 flex-1 grid-rows-2 gap-2 px-4 py-2">
              {theirSide}
              {mySide}
            </div>
            <div className="shrink-0 border-t bg-muted/30 px-2 py-2">
              <Board />
              <TouchBar className="pt-1">
                <TouchAction action="duel:+2" icon={Plus} label="+2" pressed={myLast?.penalty === "+2"} disabled={!myLast} tone="warning" />
                <TouchAction action="duel:dnf" icon={Ban} label={tr("DNF")} pressed={myLast?.penalty === "dnf"} disabled={!myLast} tone="bad" />
                <TouchAction action="duel:cancel" icon={Undo2} label={tr("Redo")} disabled={!duel.canCancel} />
              </TouchBar>
            </div>
          </Surface>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <Scramble scramble={scramble} font={promptFont} className="pt-1" />
            <div className={cn("grid min-h-0 flex-1 gap-8 py-5", cubeShown ? "grid-cols-[1fr_minmax(0,0.7fr)_1fr]" : "grid-cols-2")}>
              {mySide}
              {cubeShown && (
                <div className={cn("duel-cube group/cube relative flex min-h-0 items-center justify-center", FADE)} ref={setCubeBox}>
                  {cubeSide > 0 && scramble && !duel.over && (
                    <Cube setup={scramble} cubeSize={cubeSize} puzzle={event?.puzzle} size={Math.round(Math.min(cubeSide * 0.85, 220))} held={heldScramble("normal")} />
                  )}
                  <Button action="duel:cube" icon={X} size="icon-xs" tip={tr("Hide the cube")} className="absolute top-0 right-0 text-muted-foreground opacity-0 group-hover/cube:opacity-100 focus-visible:opacity-100" />
                </div>
              )}
              {theirSide}
            </div>
          </div>
        )}
        {!mobile && (
          <Surface className={cn("w-64 shrink-0 xl:w-72", FADE)}>
            <div className="shrink-0 px-2 pt-2 pb-1">
              <Rounds />
            </div>
            {chatDocked && <Chat className="border-t" />}
          </Surface>
        )}
      </div>
      {mobile && (
        <PhoneSheet open={duel.chatOpen} onOpenChange={(open) => open !== duel.chatOpen && void s.action("duel:chat")} title={tr("Chat")} tall className="p-0">
          <Chat bare />
        </PhoneSheet>
      )}
      {!chatDocked && !mobile && (
        <Sheet open={duel.chatOpen} onOpenChange={(open: boolean) => open !== duel.chatOpen && void s.action("duel:chat")}>
          <SheetContent side="right" className="w-80 gap-0 p-0">
            <SheetTitle className="sr-only">{tr("Chat")}</SheetTitle>
            <Chat />
          </SheetContent>
        </Sheet>
      )}
      <Result />
    </div>
  );
}

/** The scramble of the round being raced, under the round's number. */
function Scramble({ scramble, font, className }: { scramble: string; font: number; className?: string }) {
  return (
    <section className={cn("duel-scramble flex shrink-0 flex-col gap-1.5", FADE, className)}>
      {!duel.over && <span className={cn(LABEL, "label")}>{tr("Round {0}", { 0: Math.min(duel.round, ROUNDS - 1) + 1 })}</span>}
      <div className="scramble max-h-[24vh] overflow-y-auto">
        {duel.over ? (
          <span className="text-sm text-muted-foreground">{tr("Five rounds raced.")}</span>
        ) : scramble ? (
          <Alg text={scramble} size={font} />
        ) : (
          <Skeleton style={{ height: font * 1.4, width: "min(100%, 36em)" }} />
        )}
      </div>
    </section>
  );
}

/** The seat with the better of two times, if they differ. */
const better = (a: number | null | undefined, b: number | null | undefined) => {
  if (a === undefined || b === undefined) return null;
  const r = compare(a, b);
  return r === "win" ? 0 : r === "loss" ? 1 : null;
};

/** The rounds as a move list: the player's time, then the opponent's, the better in green; the averages under them. */
function Rounds({ className }: { className?: string }) {
  const seats = [duel.seat, 1 - duel.seat],
    own = ao5(duel.me),
    rival = ao5(duel.them),
    rows: Move[] = ROUND_LIST.map((r) => {
      const [a, b] = seats.map((seat) => duel.results[seat]?.[r]);
      return { key: r, n: r + 1, results: [a, b], best: a && b ? better(solveTime(a), solveTime(b)) : null, current: r === duel.round && !duel.over, attrs: { "data-round": r } };
    });
  return (
    <MoveList
      label="Rounds"
      className={cn("duel-board", className)}
      names={[said(duel.players[duel.seat]?.name), said(duel.opponent.name)]}
      rows={rows}
      foot={{ label: tr("Ao5"), values: [raceAverage(own) || "–", raceAverage(rival) || "–"], best: better(own, rival) }}
    />
  );
}

/** The phone's rounds: one row per player across the five rounds, the round being raced marked, the won ones green. */
function Board() {
  const round = duel.round,
    row = "col-span-full grid grid-cols-subgrid items-center px-2";
  return (
    <div className="duel-board grid shrink-0 grid-cols-[minmax(3rem,4.5rem)_repeat(6,minmax(max-content,1fr))] gap-x-1 gap-y-0.5" role="table" aria-label={tr("Rounds")}>
      <div className={cn(row, "text-xs text-muted-foreground")} role="row">
        <span />
        {ROUND_LIST.map((r) => (
          <span key={r} className="text-center">
            {r + 1}
          </span>
        ))}
        <span className="text-center">{tr("Ao5")}</span>
      </div>
      {[duel.seat, 1 - duel.seat].map((seat) => {
        const solves = duel.results[seat] ?? [],
          other = duel.results[1 - seat] ?? [],
          own = ao5(solves),
          rival = ao5(other),
          mine = seat === duel.seat;
        return (
          <div key={seat} className={cn("duel-board-row min-h-8 rounded-lg", row, mine && "mine")} role="row">
            <span className={cn("truncate text-xs font-medium", mine && "text-primary")}>{said(duel.players[seat]?.name)}</span>
            {ROUND_LIST.map((r) => {
              const v = solves[r],
                won = !!v && !!other[r] && compare(solveTime(v), solveTime(other[r]!)) === "win";
              return (
                <span key={r} className={cn(NUMERIC, "flex h-7 items-center justify-center rounded-md px-1 text-xs", r === round && !duel.over && "bg-muted", v?.penalty === "dnf" && "text-destructive", won && "font-medium text-success", !v && "text-muted-foreground/40")}>
                  {v ? fmtSolve(v.ms, v.penalty) : "–"}
                </span>
              );
            })}
            <span className={cn(NUMERIC, "flex h-7 items-center justify-center text-xs font-medium", own !== undefined && rival !== undefined && compare(own, rival) === "win" && "text-success")}>
              {raceAverage(own) || "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A line of the race said in the chat rather than written: centred, muted, its icon before it. */
function Said({ icon: I, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-1.5 py-1 text-center text-xs text-muted-foreground">
      <I className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** Live chat with the opponent, as on a game site: "name: message" lines between what the race says, the field under them. */
function Chat({ bare = false, className }: { bare?: boolean; className?: string }) {
  const [text, setText] = useState(""),
    list = useRef<HTMLDivElement>(null),
    result = duel.over ? compare(ao5(duel.me), ao5(duel.them)) : null,
    event = eventInfo(duel.event);
  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [duel.chat.length, duel.opponentHere, duel.over]);
  return (
    <div className={cn("duel-chat flex min-h-0 flex-1 flex-col", className)}>
      {!bare && <SectionHead title="Chat" meta={duel.chat.length || undefined} className="px-4 pt-2" rule />}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-2 text-sm" ref={list}>
        <Said icon={Swords}>{tr("vs {0} · {1}", { 0: duel.opponent.name, 1: event ? eventLabel(event.puzzle, event.solveMode) : duel.event })}</Said>
        {!duel.chat.length && <Empty className="p-3">{tr("No messages yet.")}</Empty>}
        {duel.chat.map((m, i) => (
          <p key={i} className={cn("duel-chat-line leading-snug break-words", m.seat === duel.seat && "mine")}>
            <span className={cn("font-medium", m.seat === duel.seat ? "text-primary" : "text-foreground")}>{said(duel.players[m.seat]?.name)}</span>
            <span className="text-muted-foreground">: </span>
            <span className="duel-chat-text">{said(m.text)}</span>
          </p>
        ))}
        {result && <Said icon={Trophy}>{result === "win" ? tr("You win") : result === "loss" ? tr("{0} wins", { 0: duel.opponent.name }) : tr("Draw")}</Said>}
        {!duel.opponentHere && <Said icon={LogOut}>{tr("{0} left", { 0: duel.opponent.name })}</Said>}
      </div>
      <form
        className="duel-chat-form shrink-0 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          duel.say(text);
          setText("");
          // Space goes back to the timer once the message is sent.
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <InputGroup>
          <InputGroupInput
            value={text}
            maxLength={300}
            placeholder={duel.opponentHere ? tr("Message") : tr("{0} left", { 0: duel.opponent.name })}
            disabled={!duel.opponentHere}
            aria-label={tr("Message")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" size="icon-xs" disabled={!text.trim() || !duel.opponentHere} aria-label={tr("Send")}>
              <Send />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

/**
 * The two players facing each other once it is over, as a game site's end card: each face and name with its figure (the
 * Ao5, the score), the winner's in green.
 */
export function Faces({ players }: { players: { name?: string; avatar?: string | null; label: string; value: React.ReactNode; won: boolean }[] }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      {players.map((p, i) => [
        i === 1 && (
          <span key="vs" className="text-sm text-muted-foreground">
            {tr("vs")}
          </span>
        ),
        <div key={i} className="flex min-w-0 flex-col items-center gap-2 text-center">
          <Avatar name={p.name} src={p.avatar} size={56} className={cn(p.won && "ring-2 ring-success ring-offset-2 ring-offset-popover")} />
          <span className="max-w-full truncate text-sm font-medium">{said(p.name)}</span>
          <Figure label={p.label} value={p.value} size="2xl" tone={p.won ? "good" : ""} className="items-center" />
        </div>,
      ])}
    </div>
  );
}

/** Once both have raced the five rounds: who won, the averages face to face, the rounds, and a rematch or another opponent. */
function Result() {
  const open = duel.over && duel.dismissed !== duel.game;
  const own = ao5(duel.me),
    rival = ao5(duel.them),
    result = compare(own, rival),
    opponent = duel.opponent.name,
    asked = duel.rematch[duel.seat],
    offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? tr("{0} left", { 0: opponent }) : offered && !asked ? tr("{0} wants a rematch.", { 0: opponent }) : asked ? tr("Waiting for {0}", { 0: opponent }) : "";
  return (
    <Modal
      open={open}
      onOpenChange={(next: boolean) => !next && open && void s.action("duel:dismiss")}
      title={<span className={cn(result === "win" && "text-success")}>{result === "win" ? tr("You win") : result === "loss" ? tr("{0} wins", { 0: opponent }) : tr("Draw")}</span>}
      description={tr("Average of five, best and worst dropped.")}
      className="duel-result sm:max-w-md"
      sheetClassName="duel-result"
    >
      <Faces
        players={[
          { name: duel.players[duel.seat]?.name, label: "Ao5", value: raceAverage(own) || "–", won: result === "win" },
          { name: opponent, label: "Ao5", value: raceAverage(rival) || "–", won: result === "loss" },
        ]}
      />
      <Rounds />
      {note && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          {offered && !asked && duel.opponentHere && <LiveDot className="text-primary" />}
          {note}
        </p>
      )}
      <DialogFooter>
        <Button action="duel:dismiss" variant="ghost" className="sm:mr-auto">
          {tr("Close")}</Button>
        <Button action="duel:next" variant="outline">
          {tr("New opponent")}</Button>
        <Button action="duel:rematch" variant="default" disabled={!duel.opponentHere || asked}>
          {offered && !asked ? tr("Accept rematch") : tr("Rematch")}
        </Button>
      </DialogFooter>
    </Modal>
  );
}
