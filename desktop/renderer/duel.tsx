/** The duel page: looking for an opponent, then the race split in two with the cube in the middle, and the chat. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { store as s } from "./store";
import { duel, ao5, compare, solveTime, ROUNDS, type DuelPhase, type DuelSolve } from "./duelClient";
import { Cube } from "./Cube";
import { useSquare } from "./practice";
import { PracticeTimer } from "../../src/client/lib/practiceTimer";
import { fmtSolve, fmtTime } from "../../src/client/lib/format";
import { eventInfo, eventLabel, heldScramble } from "../../src/shared/puzzles";
import { Send, Swords, Trophy, X, MessageSquare, Box, Undo2 } from "lucide-react";
import { ActionToggle, Alg, Button, Figure, FADE, LABEL, MOBILE, MONO, PAGE, PageHead, useViewport } from "./ui";
import { Digits } from "./practice";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

const ROUND_LIST = [...Array(ROUNDS).keys()];

/** Re-renders every frame while `active`, for a clock that runs elsewhere. */
function useFrame(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      setTick((n) => n + 1);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** The player's own timer: Space (or a touch) like the timer page; every phase is relayed to the opponent. */
function useDuelTimer() {
  const [phase, setPhase] = useState<DuelPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const frame = useRef(0);
  const [timer] = useState(
    () =>
      new PracticeTimer({
        canStart: () => duel.canSolve && !s.overlay,
        onStop: (ms) => duel.solve(ms),
        onChange: (snapshot) => {
          const running = snapshot.phase === "running",
            next = snapshot.phase === "stopped" ? "idle" : snapshot.phase;
          setPhase(next);
          setElapsed(snapshot.elapsed);
          // A stop reaches the opponent as the solve itself.
          if (snapshot.phase !== "stopped") duel.timer(next);
          s.running = running;
          s.emit();
          cancelAnimationFrame(frame.current);
          if (running) {
            const tick = () => {
              if (timer.snapshot.phase !== "running") return;
              setElapsed(performance.now() - timer.snapshot.startedAt);
              frame.current = requestAnimationFrame(tick);
            };
            tick();
          }
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
      cancelAnimationFrame(frame.current);
      s.running = false;
    };
  }, []);
  return { phase, elapsed, press: timer.press, release: timer.release };
}

export function DuelPage() {
  useEffect(() => {
    void duel.loadLevel(s.event().id);
  }, [s.puzzle, s.solveMode]);
  return duel.status === "racing" ? <Race /> : <Lobby />;
}

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

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
      <PageHead title="Duel" puzzle sub={`One against one · ${s.event().label}`} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 pb-[8vh] text-center">
        <div className="flex max-w-md flex-col items-center gap-3">
          <span className={cn("flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground", searching && "animate-pulse bg-primary/15 text-primary")}>
            <Swords className="size-6" />
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">{searching ? "Looking for an opponent" : "Race an Ao5"}</h2>
          <p className={cn("text-sm", duel.notice ? "text-destructive" : "text-muted-foreground")}>
            {duel.notice || "The same five scrambles for both of you, against a player near your level."}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-12 text-left">
          <Figure
            label="Your level"
            size="lg"
            value={duel.level === undefined ? <Skeleton className="h-6 w-20" /> : duel.level === null ? "New" : fmtTime(duel.level)}
          />
          <Figure label="Searching" size="lg" value={searching ? clock(Date.now() - duel.searchSince) : "–"} />
          <Figure label="Also searching" size="lg" value={searching ? String(duel.searching) : "–"} />
        </div>
        <Button action={searching ? "duel:leave" : "duel:search"} variant={searching ? "outline" : "default"} size="lg" icon={searching ? X : Swords} className="h-10 px-5">
          {searching ? "Cancel" : "Find an opponent"}
        </Button>
      </div>
    </div>
  );
}

const shown = (v: DuelSolve | undefined) => (v ? fmtSolve(v.ms, v.penalty) : "0.000");

/** What the opponent is doing, in a word or two. */
function opponentStatus() {
  const round = duel.round;
  if (!duel.opponentHere) return "Left";
  if (duel.over) return "Finished";
  if (duel.opponentPhase === "running") return "Solving";
  if (duel.opponentPhase !== "idle") return "Ready";
  if (duel.them[round]) return "Done";
  return duel.scrambles.length ? `Round ${round + 1}` : "Waiting";
}

/** One side of the race: the player, the level, what they are doing, and the digits. */
function Side({ name, level, tag, digits, phase, hint, mine, className, ...handlers }: {
  name?: string;
  level?: number | null;
  tag: string;
  digits: string;
  phase: string;
  hint?: string;
  mine: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("duel-side flex min-w-0 touch-manipulation flex-col items-center justify-center gap-5 select-none [container-type:size]", mine ? "mine" : "theirs", phase, className)} {...handlers}>
      <header className={cn("flex items-center gap-2 text-sm", FADE)}>
        <strong className="font-medium">{name}</strong>
        {level ? <span className={cn(MONO, "text-muted-foreground")}>{fmtTime(level)}</span> : null}
        <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", mine ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{tag}</span>
      </header>
      <Digits text={digits} phase={phase} className={cn("text-[clamp(40px,min(calc(170cqw/var(--chars)),40cqh),168px)]", !mine && phase === "idle" && "text-foreground/70")} />
      <div className={cn("timer-hint min-h-5 text-sm text-muted-foreground", FADE)}>{hint}</div>
    </section>
  );
}

/** The race: the scramble across the top, the two timers either side of the cube, the rounds underneath. */
function Race() {
  const timer = useDuelTimer(),
    { w } = useViewport(),
    mobile = w <= MOBILE,
    chatDocked = !mobile && w >= 1100,
    running = timer.phase === "running",
    opponent = duel.opponent,
    me = duel.players[duel.seat],
    round = duel.round,
    event = eventInfo(duel.event),
    cubeSize = event ? s.info(event.puzzle)?.cubeSize : 0,
    scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "",
    cubeShown = !mobile && duel.showCube && !!cubeSize,
    [cubeBox, setCubeBox] = useState<HTMLDivElement | null>(null),
    cubeSide = useSquare(cubeBox);
  useFrame(duel.opponentPhase === "running");
  const mine = duel.me,
    theirs = duel.them,
    myDigits = running ? fmtTime(timer.elapsed) : timer.phase !== "idle" ? "0.000" : shown(mine[duel.latest(mine)]),
    theirDigits =
      duel.opponentPhase === "running"
        ? fmtTime(performance.now() - duel.opponentStart)
        : duel.opponentPhase !== "idle"
          ? "0.000"
          : shown(theirs[duel.latest(theirs)]);
  const myHint = !duel.opponentHere
    ? `${opponent.name} left the race`
    : duel.over
      ? "Race over"
      : !duel.scrambles.length
        ? "Drawing the scrambles…"
        : mine[round]
          ? `Waiting for ${opponent.name}`
          : timer.phase === "holding"
            ? "Keep holding…"
            : timer.phase === "ready"
              ? "Release to start"
              : running
                ? mobile ? "Tap to stop" : "Any key to stop"
                : mobile ? "Hold, then release to start" : "Hold Space, release to start";
  const promptFont = mobile ? (scramble.length > 90 ? 15 : 19) : scramble.length > 220 ? 16 : scramble.length > 120 ? 19 : 24;
  return (
    <div className={cn(PAGE, "duel-race")}>
      <PageHead title="Duel" sub={`vs ${opponent.name} · ${event ? eventLabel(event.puzzle, event.solveMode) : duel.event}`}>
        {duel.over && duel.dismissed === duel.game && (
          <Button action="duel:result" icon={Trophy}>
            Result
          </Button>
        )}
        {!duel.opponentHere && (
          <Button action="duel:next" icon={Swords}>
            New opponent
          </Button>
        )}
        {!mobile && !!cubeSize && (
          <ActionToggle action="duel:cube" pressed={duel.showCube} icon={Box} tip="Show or hide the cube">
            Cube
          </ActionToggle>
        )}
        {!chatDocked && (
          <ActionToggle action="duel:chat" pressed={duel.chatOpen} icon={MessageSquare} tip="Chat">
            {duel.unread ? `Chat · ${duel.unread}` : "Chat"}
          </ActionToggle>
        )}
        <Button action="duel:leave" icon={X}>
          Leave
        </Button>
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-12">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className={cn("duel-scramble flex shrink-0 flex-col gap-2", FADE)}>
            <span className={LABEL}>
              {duel.over ? "Race over" : `Round ${round + 1} of ${ROUNDS}`} · {duel.over ? "Ao5" : "Scramble"}
            </span>
            <div className="scramble max-h-[24vh] overflow-y-auto">
              {duel.over ? (
                <span className="text-muted-foreground">Five rounds raced.</span>
              ) : scramble ? (
                <Alg text={scramble} size={promptFont} faces={!!cubeSize} />
              ) : (
                <Skeleton style={{ height: promptFont * 1.4, width: "min(100%, 36em)" }} />
              )}
            </div>
          </section>
          <div className={cn("grid min-h-0 flex-1 gap-6", cubeShown ? "grid-cols-[1fr_minmax(0,0.7fr)_1fr]" : "grid-cols-2")}>
            <Side
              name={me?.name}
              level={me?.level}
              tag="You"
              digits={myDigits}
              phase={timer.phase}
              hint={myHint}
              mine
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                if (mobile && !running) timer.press();
              }}
              onPointerUp={timer.release}
            />
            {cubeShown && (
              <div className={cn("duel-cube group/cube relative flex min-h-0 items-center justify-center", FADE)} ref={setCubeBox}>
                {cubeSide > 0 && scramble && !duel.over && (
                  <Cube setup={scramble} cubeSize={cubeSize} size={Math.round(Math.min(cubeSide * 0.85, 220))} held={heldScramble("normal")} />
                )}
                <Button action="duel:cube" icon={X} size="icon-xs" tip="Hide the cube" className="absolute top-0 right-0 text-muted-foreground opacity-0 group-hover/cube:opacity-100" />
              </div>
            )}
            <Side
              name={opponent.name}
              level={opponent.level}
              tag={opponentStatus()}
              digits={theirDigits}
              phase={duel.opponentPhase}
              mine={false}
              className={duel.opponentHere ? undefined : "opacity-50"}
            />
          </div>
          <Board actions />
        </div>
        {chatDocked && (
          <aside className={cn("flex w-72 shrink-0 flex-col", FADE)}>
            <Chat />
          </aside>
        )}
      </div>
      {!chatDocked && (
        <Sheet open={duel.chatOpen} onOpenChange={(open: boolean) => open !== duel.chatOpen && void s.action("duel:chat")}>
          <SheetContent side={mobile ? "bottom" : "right"} className={cn("gap-2 p-4", mobile && "h-[70svh] rounded-t-xl")}>
            <SheetHeader className="p-0">
              <SheetTitle>Chat</SheetTitle>
            </SheetHeader>
            <Chat bare />
          </SheetContent>
        </Sheet>
      )}
      <Result />
    </div>
  );
}

const average = (v: number | null | undefined) => (v === undefined ? "" : v === null ? "DNF" : fmtTime(v));

/** The rounds: one row per player, the round being raced marked, each won round and the better Ao5 in green. */
function Board({ actions = false }: { actions?: boolean }) {
  const round = duel.round,
    columns = actions ? "grid-cols-[minmax(5rem,9rem)_repeat(5,minmax(0,1fr))_minmax(0,1fr)_minmax(0,11rem)]" : "grid-cols-[minmax(5rem,8rem)_repeat(5,minmax(0,1fr))_minmax(0,1fr)]";
  return (
    <div className={cn("duel-board flex shrink-0 flex-col gap-1", actions && FADE)} role="table" aria-label="Rounds">
      <div className={cn("grid items-center gap-2 px-2 text-xs text-muted-foreground", columns)} role="row">
        <span />
        {ROUND_LIST.map((r) => (
          <span key={r} className="text-center">
            {r + 1}
          </span>
        ))}
        <span className="text-center">Ao5</span>
        {actions && <span />}
      </div>
      {[duel.seat, 1 - duel.seat].map((seat) => {
        const solves = duel.results[seat] ?? [],
          other = duel.results[1 - seat] ?? [],
          own = ao5(solves),
          rival = ao5(other),
          mine = seat === duel.seat;
        return (
          <div key={seat} className={cn("duel-board-row grid min-h-10 items-center gap-2 rounded-lg px-2", columns, mine && "mine")} role="row">
            <span className="flex min-w-0 items-baseline gap-2">
              <strong className="truncate text-sm font-medium">{duel.players[seat]?.name}</strong>
              {mine && <small className="text-xs text-muted-foreground">you</small>}
            </span>
            {ROUND_LIST.map((r) => {
              const v = solves[r],
                won = !!v && !!other[r] && compare(solveTime(v), solveTime(other[r]!)) === "win";
              return (
                <span
                  key={r}
                  className={cn(
                    MONO,
                    "flex h-8 items-center justify-center rounded-md text-sm",
                    r === round && !duel.over && "bg-muted",
                    v?.penalty === "dnf" && "text-destructive",
                    won && "text-success",
                    !v && "text-muted-foreground/40",
                  )}
                >
                  {v ? fmtSolve(v.ms, v.penalty) : "–"}
                </span>
              );
            })}
            <span className={cn(MONO, "flex h-8 items-center justify-center text-sm font-medium", own !== undefined && rival !== undefined && compare(own, rival) === "win" && "text-success")}>
              {average(own) || "–"}
            </span>
            {actions &&
              (mine ? (
                <span className="flex items-center justify-end gap-0.5">
                  <SolveActions />
                </span>
              ) : (
                <span className="w-full text-right text-xs text-muted-foreground">{opponentStatus()}</span>
              ))}
          </div>
        );
      })}
    </div>
  );
}

/** +2, DNF and Cancel on the player's latest solve. */
function SolveActions() {
  const last = duel.me[duel.latest(duel.me)];
  return (
    <>
      <ActionToggle action="duel:+2" pressed={last?.penalty === "+2"} disabled={!last} size="sm" className="aria-pressed:text-warning">
        +2
      </ActionToggle>
      <ActionToggle action="duel:dnf" pressed={last?.penalty === "dnf"} disabled={!last} size="sm" className="aria-pressed:text-destructive">
        DNF
      </ActionToggle>
      <Button action="duel:cancel" icon={Undo2} size="sm" disabled={!duel.canCancel} tip="Take the solve back and redo it" className="text-muted-foreground">
        Cancel
      </Button>
    </>
  );
}

/** Live chat with the opponent: messages over a field and its send button. */
function Chat({ bare = false }: { bare?: boolean }) {
  const [text, setText] = useState(""),
    list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [duel.chat.length]);
  return (
    <div className="duel-chat flex min-h-0 flex-1 flex-col gap-2">
      {!bare && (
        <div className="flex h-8 items-center gap-2">
          <h2 className="text-sm font-medium">Chat</h2>
          <span className={cn(MONO, "text-sm text-muted-foreground")}>{duel.chat.length}</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto" ref={list}>
        {!duel.chat.length && <div className="py-2 text-sm text-muted-foreground">No messages yet.</div>}
        {duel.chat.map((m, i) => (
          <div key={i} className={cn("duel-chat-line flex flex-col gap-0.5", m.seat === duel.seat && "mine")}>
            <span className={cn("text-xs font-medium", m.seat === duel.seat ? "text-primary" : "text-muted-foreground")}>{duel.players[m.seat]?.name}</span>
            <span className="text-sm break-words">{m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="duel-chat-form"
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
            placeholder={duel.opponentHere ? "Message" : `${duel.opponent.name} left`}
            disabled={!duel.opponentHere}
            aria-label="Message"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" size="icon-xs" disabled={!text.trim() || !duel.opponentHere} aria-label="Send">
              <Send />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

/** Once both have raced the five rounds: who won, the rounds, and a rematch or another opponent. */
function Result() {
  const open = duel.over && duel.dismissed !== duel.game;
  const own = ao5(duel.me),
    rival = ao5(duel.them),
    result = compare(own, rival),
    opponent = duel.opponent.name,
    asked = duel.rematch[duel.seat],
    offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? `${opponent} left.` : offered && !asked ? `${opponent} wants a rematch.` : asked ? `Waiting for ${opponent}…` : "";
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && open && void s.action("duel:dismiss")}>
      <DialogContent className="duel-result gap-6 p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight">{result === "win" ? "You win" : result === "loss" ? `${opponent} wins` : "Draw"}</DialogTitle>
          <DialogDescription>Average of five, best and worst dropped.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          {[
            [duel.players[duel.seat]?.name, own, result === "win"],
            [opponent, rival, result === "loss"],
          ].map(([name, value, won], i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className={LABEL}>{name as string}</span>
              <span className={cn(MONO, "text-4xl font-medium tracking-tight", won ? "text-success" : "text-foreground/80")}>{average(value as number | null) || "–"}</span>
            </div>
          ))}
        </div>
        <Board />
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button action="duel:leave">Leave</Button>
          <Button action="duel:next" variant="outline">
            New opponent
          </Button>
          <Button action="duel:rematch" variant="default" disabled={!duel.opponentHere || asked}>
            {offered && !asked ? "Accept rematch" : "Rematch"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
