/**
 * The duel page, an arena: the one disc to press in the middle as the timer's digits are, the friends to challenge on
 * the left and the races played on the right. Then the race: the round and the scramble across the top, both players
 * and the strip of rounds under it, the two timers either side of the cube, and beside it the rounds as a butterfly
 * over the chat. Its end rises over the race's foot.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { store as s, run } from "./store";
import { duel, ao5, clock, compare, matchRange, opponentStatus, raceAverage, roundsWon, shownSolve, solveTime, ANYONE_AFTER, DUELS_KEY, ROUNDS, type DuelPhase, type DuelRecord, type DuelSolve } from "./duelClient";
import { Cube } from "./Cube";
import { useSquare } from "./practice";
import { PracticeTimer, timerHint, type TimerSnapshot } from "../../src/client/lib/practiceTimer";
import { fmtTime } from "../../src/client/lib/format";
import { eventInfo, eventLabel, heldScramble } from "../../src/shared/puzzles";
import { isPolyPuzzle } from "../../src/shared/puzzleScene";
import { Ban, Box, Check, Copy, History, Link2, MessageSquare, Plus, Search, Send, Swords, Trophy, Undo2, Users, X } from "lucide-react";
import { PhoneSheet, TouchAction, TouchBar } from "./phone";
import { ActionToggle, Alg, Avatar, Button, Empty, FADE, NUMERIC, MenuAction, PAGE, PageHead, PenaltyToggles, Surface, isPhone, usePhone, useViewport } from "./ui";
import { LiveDigits } from "./practice";
import { StageAction, Fly, Gap, KICKER, LiveDot, NameTag, PanelHead, Record, StageMeter, RoundStrip, Stage, StageFigure, Ticket, Verdict, longest, type Cell } from "./tournaments/format";
import { community, type Conversation } from "./community/client";
import { FriendsDialog } from "./community/dialogs";
import { relative } from "./coaching/parts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button as UiButton } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { tr } from "../../src/client/i18n";
import { keyed, said } from "./base";

export { PanelHead };
const ROUND_LIST = [...Array(ROUNDS).keys()];
/** The latest solve's buttons under the player's digits: quiet words in one row (`PENS`). */
export const SOLVE_ACTION = "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground";
export const PENS = cn("flex items-center gap-1.5", FADE);
/** At this width the friends have their own pane; narrower, they open in a sheet. */
const FRIENDS_PANE = 1280;

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
          if (snapshot.phase !== "stopped") duel.timer(snapshot.phase as DuelPhase); // no inspection here
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
  const phase: DuelPhase = snapshot.phase === "stopped" ? "idle" : (snapshot.phase as DuelPhase);
  return { phase, startedAt: snapshot.startedAt, press: timer.press, release: timer.release };
}

export function DuelPage() {
  useEffect(() => {
    void duel.loadLevel(s.event().id);
  }, [s.puzzle, s.solveMode]);
  return duel.status === "racing" ? <Race /> : <Lobby />;
}

/** Before a race: the friends on the left, the disc (or the search under way) in the middle, the races played on the right. */
function Lobby() {
  const searching = duel.status === "searching",
    { w } = useViewport(),
    phone = isPhone(w),
    pane = w >= FRIENDS_PANE,
    [friends, setFriends] = useState(false),
    [, setSecond] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setSecond((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  const event = s.event(),
    waited = searching ? Date.now() - duel.searchSince : 0,
    range = matchRange(duel.level, waited),
    seconds = (ms: number) => (ms / 1000).toFixed(1);
  const friendsButton = (
    <UiButton variant={phone ? "outline" : "secondary"} size={phone ? "icon" : "default"} onClick={() => setFriends(true)} aria-label={tr("Your friends")} data-action="duel:friends">
      <Users />
      {!phone && tr("Friends")}
    </UiButton>
  );
  return (
    <div className={cn(PAGE, "duel-lobby")}>
      {phone && (
        <PageHead title={tr("Duel")} puzzle>
          {friendsButton}
          <Button action="profileMode:duels" icon={History} tip={tr("Races played")} />
        </PageHead>
      )}
      <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        {pane && (
          <Surface className="duel-friends p-4 pt-5">
            <Friends />
          </Surface>
        )}
        <Stage
          data-tour="duel"
          className="duel-stage relative"
          lead={
            <p className={cn("-mt-2 max-w-md text-sm text-balance md:-mt-4 md:text-[15px]", duel.notice ? "text-destructive" : "text-muted-foreground")}>
              {duel.notice || tr("An Ao5 race · the same five {0} scrambles for both of you", { 0: event.label })}
            </p>
          }
          figures={
            <>
              <StageFigure value={duel.level === undefined ? <Skeleton className="h-8 w-20" /> : duel.level === null ? tr("New") : fmtTime(duel.level)} label={tr("Your {0} level", { 0: event.label })} />
              <StageFigure value={range ? `${seconds(range[0])}–${seconds(range[1])}` : searching || duel.level === null ? tr("Anyone") : "–"} label="Your matching range" />
              <StageFigure value={searching ? String(duel.searching) : "–"} label="Also searching" tone={searching && duel.searching ? "good" : undefined} />
            </>
          }
        >
          {!pane && !phone && <div className="absolute top-0 right-0">{friendsButton}</div>}
          {searching ? (
            <>
              <StageMeter share={waited / ANYONE_AFTER} value={clock(waited)} label={range ? tr("Looking near your level…") : tr("Anyone on {0} will do…", { 0: event.label })} />
              <Button action="duel:leave" icon={X} variant="secondary" className="duel-cancel">
                {tr("Cancel")}
              </Button>
            </>
          ) : (
            <StageAction icon={Swords} title={tr("Play")} sub={tr("an opponent at your level")} data-action="duel:search" onClick={run("duel:search")} />
          )}
        </Stage>
        {!phone && (
          <Surface className="duel-history gap-3.5 p-4 pt-[18px]">
            <Played />
          </Surface>
        )}
      </div>
      {!pane &&
        (phone ? (
          <PhoneSheet open={friends} onOpenChange={setFriends} title={tr("Your friends")} tall>
            <Friends bare />
          </PhoneSheet>
        ) : (
          <Sheet open={friends} onOpenChange={setFriends}>
            <SheetContent side="left" className="w-80 gap-0 p-4 pt-5">
              <SheetTitle className="sr-only">{tr("Your friends")}</SheetTitle>
              <Friends />
            </SheetContent>
          </Sheet>
        ))}
    </div>
  );
}

/**
 * The friends to challenge: their faces, the one picked outlined, finding more players last; under them the challenge
 * to send (a battle on the puzzle chosen, first to three solves) and the link that adds the account as a friend.
 */
function Friends({ bare = false }: { bare?: boolean }) {
  const signedIn = s.signedIn,
    me = community.me,
    list = me?.friends ?? [],
    [picked, setPicked] = useState<string | null>(null),
    [finding, setFinding] = useState(false),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    friend = list.find((f) => f.id === picked),
    event = s.event(),
    format = { event: event.id, points: 3, sets: 1 };
  useEffect(() => {
    if (signedIn && !community.me) void community.load("me");
  }, [signedIn]);
  const challenge = async () => {
    if (!friend) return;
    setBusy(true);
    // The battle shows in the conversation with the friend, made on first need.
    const c = await community.act<Conversation>("POST", "social/conversations", { userId: friend.id }, ["conversations"]);
    const done = c && (await community.battle(c.id, { ...format, opponentId: null }));
    setBusy(false);
    if (!done) return;
    toast(tr("Challenge sent to {0}", { 0: friend.username }), { description: tr("It starts once they accept it.") });
    setPicked(null);
  };
  const link = signedIn ? community.shareLink() : "";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5" data-slot="duel-friends">
      {!bare && <PanelHead title="Your friends" meta={list.length || undefined} className="px-1" />}
      {!signedIn ? (
        <Empty icon={Users} title={tr("Challenge your friends")} className="flex-1">
          <p>{tr("Sign in to race your friends on the scrambles you pick.")}</p>
          <UiButton variant="outline" onClick={() => s.askSignIn()}>
            {tr("Sign in")}
          </UiButton>
        </Empty>
      ) : !me ? (
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="-mx-1 grid min-h-0 grid-cols-3 content-start gap-x-1.5 gap-y-2.5 overflow-y-auto px-1 pt-1.5">
          {list.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={picked === f.id}
              onClick={() => setPicked(picked === f.id ? null : f.id)}
              data-friend={f.username}
              className="grid min-w-0 justify-items-center gap-1.5 rounded-2xl px-0.5 pt-2.5 pb-2 text-center transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:ring-[1.5px] aria-pressed:ring-primary aria-pressed:ring-inset"
            >
              <Avatar name={f.username} src={f.avatar} size={52} />
              <b className="max-w-full truncate text-[13px] font-bold">{f.username}</b>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFinding(true)}
            data-action="duel:find-players"
            className="grid min-w-0 justify-items-center gap-1.5 rounded-2xl px-0.5 pt-2.5 pb-2 text-center text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-[52px] items-center justify-center rounded-full bg-muted">
              <Search className="size-5" />
            </span>
            <b className="text-[13px] font-bold text-foreground">{tr("Find")}</b>
          </button>
        </div>
      )}
      {signedIn && me && (
        <div className="mt-auto grid shrink-0 gap-2.5 rounded-[18px] bg-muted p-3.5">
          {friend ? (
            <>
              <div className="flex min-w-0 items-center gap-2.5 text-sm">
                <Avatar name={friend.username} src={friend.avatar} size={32} />
                <span className="min-w-0 truncate font-semibold">{tr("Challenge {0}", { 0: friend.username })}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
                {[event.label, tr("First to 3 solves")].map((chip) => (
                  <span key={chip} className="rounded-[9px] bg-card px-2.5 py-1">
                    {said(chip)}
                  </span>
                ))}
              </div>
              <UiButton disabled={busy} onClick={() => void challenge()} data-action="duel:challenge">
                <Swords />
                {tr("Send the challenge")}
              </UiButton>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{list.length ? tr("Pick a friend to challenge them.") : tr("No friend yet: find players, or share your link.")}</p>
          )}
          <div className="flex min-w-0 items-center gap-2 border-t border-card pt-2 text-[13px] text-muted-foreground">
            <Link2 className="size-4 shrink-0" />
            <span className="shrink-0">{tr("Your link")}</span>
            <code className="min-w-0 truncate font-sans font-semibold text-foreground/80">{link.replace(/^https?:\/\//, "")}</code>
            <UiButton
              variant="ghost"
              className="ml-auto shrink-0"
              data-action="friends:copy-link"
              onClick={() =>
                void navigator.clipboard?.writeText(link).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
              }
            >
              {copied ? <Check /> : <Copy />}
              {copied ? tr("Copied") : tr("Copy")}
            </UiButton>
          </div>
        </div>
      )}
      <FriendsDialog open={finding} onOpenChange={setFinding} />
    </div>
  );
}

const shortEvent = (id: string) => {
  const e = eventInfo(id);
  return e ? eventLabel(e.puzzle, e.solveMode) : id;
};
/** The races played on this device: the record as one bar, then each race as a ticket, newest first. */
function Played() {
  const list: DuelRecord[] = s.prefs[DUELS_KEY] ?? [],
    count = (r: DuelRecord["result"]) => list.filter((b) => b.result === r).length;
  return (
    <>
      <PanelHead title="Races played" meta={list.length || undefined} className="px-1">
        {list.length > 0 && (
          <Button action="profileMode:duels" variant="ghost" className="text-muted-foreground">
            {tr("All")}
          </Button>
        )}
      </PanelHead>
      {!list.length ? (
        <Empty icon={Swords} title={tr("No race yet")} className="flex-1">
          {tr("Your races show here, won or lost.")}
        </Empty>
      ) : (
        <>
          <div className="px-1">
            <Record won={count("win")} drawn={count("draw")} lost={count("loss")} />
          </div>
          <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1" role="list" aria-label={tr("Races played")}>
            {list.map((b) => {
              const [a, z] = roundsWon(b.mine, b.theirs),
                [mine, theirs] = b.ao5;
              return (
                <Ticket
                  key={b.id}
                  role="listitem"
                  result={b.result}
                  score={mine === null && theirs === null ? tr("DNF") : `${a}–${z}`}
                  name={said(b.opponent)}
                  level={shortEvent(b.event)}
                  sub={`${relative(Date.parse(b.at))} · ${tr("Ao5")} ${raceAverage(mine)}`}
                  aside={mine !== null && theirs !== null ? <Gap ms={mine - theirs} /> : <Gap>{b.result === "draw" ? tr("Draw") : tr("DNF")}</Gap>}
                  className="hover:bg-muted"
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** Who took each round of the race so far, the round being raced outlined. */
const cellsOf = (mine: DuelSolve[], theirs: DuelSolve[], round: number, over: boolean): Cell[] =>
  ROUND_LIST.map((r) => {
    if (mine[r] && theirs[r]) {
      const c = compare(solveTime(mine[r]!), solveTime(theirs[r]!));
      return c === "win" ? "me" : c === "loss" ? "them" : "tie";
    }
    return r === round && !over ? "now" : "";
  });

/** A player of a race across from the other: the face, the name with its level, what the player is doing under it. */
export type Racer = { name?: string; /** What the name reads, "You" for the player. */ shown?: string; avatar?: string | null; level?: React.ReactNode; status?: React.ReactNode; live?: boolean; gone?: boolean };
function RacerSide({ p, end = false }: { p: Racer; end?: boolean }) {
  const phone = usePhone();
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 text-[15px] md:text-base", end && "flex-row-reverse text-right", p.gone && "opacity-50")}>
      <Avatar name={p.name} src={p.avatar} size={36} />
      <span className={cn("flex min-w-0 flex-col", end && "items-end")}>
        <NameTag name={said(p.shown ?? p.name)} level={phone ? undefined : p.level} className="max-w-full" />
        <span className={cn("flex h-4 items-center gap-1.5 text-[12.5px] font-semibold", p.live ? "text-success" : "text-muted-foreground")}>
          {p.live && <LiveDot className="size-1.5" />}
          <span className="truncate">{said(p.status)}</span>
        </span>
      </span>
    </div>
  );
}

/** Both players face to face, the score between them in their colours over the strip of rounds. */
export function ScoreLine({ players, score, cells, label, className }: { players: [Racer, Racer]; score: [React.ReactNode, React.ReactNode]; cells: Cell[]; label: string; className?: string }) {
  return (
    <section className={cn("grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)_minmax(0,1fr)] md:gap-[22px]", FADE, className)} aria-label={said(label)}>
      <RacerSide p={players[0]} />
      <div className="grid grid-cols-[auto_minmax(48px,1fr)_auto] items-center gap-2.5 md:gap-3.5">
        <b className={cn(NUMERIC, "text-2xl font-extrabold text-primary md:text-[34px]")} data-score="mine">
          {score[0]}
        </b>
        <RoundStrip cells={cells} big label={label} />
        <b className={cn(NUMERIC, "text-2xl font-extrabold text-lilac md:text-[34px]")} data-score="theirs">
          {score[1]}
        </b>
      </div>
      <RacerSide p={players[1]} end />
    </section>
  );
}

/**
 * One side of the race: the digits (`rest` at rest, running from `startedAt`), what to do next, and the player's own
 * `actions` on the latest solve.
 */
export function Side({ rest, startedAt, phase, hint, mine, actions, className, ...handlers }: { rest: string; startedAt: number; phase: string; hint?: string; mine: boolean; actions?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("duel-side flex min-h-0 min-w-0 touch-manipulation flex-col items-center justify-center gap-3 select-none [container-type:size] md:gap-4", mine ? "mine" : "theirs", phase, className)} {...handlers}>
      <LiveDigits text={said(rest)} startedAt={startedAt} phase={phase} className={cn("text-[clamp(40px,min(calc(170cqw/var(--chars)),40cqh),140px)]", !mine && phase === "idle" && "opacity-70")} />
      <div className={cn("timer-hint min-h-5 text-sm text-muted-foreground md:text-[15px]", FADE)}>{keyed(said(hint))}</div>
      {actions && (
        <div className={PENS} data-no-timer>
          {actions}
        </div>
      )}
    </section>
  );
}

/** The race: the round and the scramble across the top, the players and the score, the two timers either side of the cube, the rounds and the chat beside. */
function Race() {
  const timer = useDuelTimer(),
    { w } = useViewport(),
    phone = isPhone(w),
    chatDocked = !phone && w >= 1100,
    running = timer.phase === "running",
    opponent = duel.opponent,
    me = duel.players[duel.seat],
    round = duel.round,
    event = eventInfo(duel.event),
    eventName = event ? eventLabel(event.puzzle, event.solveMode) : duel.event,
    cubeSize = event ? s.info(event.puzzle)?.cubeSize : 0,
    // The pyraminx and the megaminx have a 3D model too.
    previewed = !!cubeSize || isPolyPuzzle(event?.puzzle),
    scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "",
    verdict = duel.over && duel.dismissed !== duel.game,
    cubeShown = !phone && duel.showCube && previewed && !duel.over,
    [cubeBox, setCubeBox] = useState<HTMLDivElement | null>(null),
    cubeSide = useSquare(cubeBox);
  const mine = duel.me,
    theirs = duel.them,
    myLast = mine[duel.latest(mine)],
    myRest = timer.phase !== "idle" ? "0.000" : shownSolve(myLast),
    theirRest = duel.opponentPhase !== "idle" ? "0.000" : shownSolve(theirs[duel.latest(theirs)]);
  const myHint = timerHint(timer.phase, {
    disabled: !duel.opponentHere ? `${opponent.name} left the race` : duel.over ? "Race over" : !duel.scrambles.length ? "Drawing the scrambles…" : !!mine[round] && `Waiting for ${opponent.name}`,
    keyboard: !phone,
  });
  // What the player is doing, said as the opponent's is.
  const myStatus = duel.over ? tr("Finished") : running ? tr("Solving") : mine[round] ? tr("Done") : tr("Your turn");
  const promptFont = phone ? (scramble.length > 90 ? 15 : 19) : scramble.length > 220 ? 18 : scramble.length > 120 ? 22 : 28;
  const won = roundsWon(mine, theirs);
  const score = (
    <ScoreLine
      label="Rounds"
      className="duel-score"
      players={[
        { name: me?.name, shown: tr("You"), level: me?.level ? fmtTime(me.level) : undefined, status: myStatus, live: running },
        { name: opponent.name, level: opponent.level ? fmtTime(opponent.level) : undefined, status: opponentStatus(duel), live: duel.opponentPhase === "running", gone: !duel.opponentHere },
      ]}
      score={[won[0], won[1]]}
      cells={cellsOf(mine, theirs, round, duel.over)}
    />
  );
  const mySide = (
    <Side
      rest={myRest}
      startedAt={timer.startedAt}
      phase={timer.phase}
      hint={said(myHint)}
      mine
      actions={
        !phone &&
        !duel.over && (
          <>
            <PenaltyToggles penalty={myLast?.penalty} prefix="duel:" disabled={!myLast} variant="default" className={SOLVE_ACTION} />
            <Button action="duel:cancel" icon={Undo2} variant="ghost" disabled={!duel.canCancel} tip={tr("Take the solve back and redo it")} className={SOLVE_ACTION}>
              {tr("Redo")}
            </Button>
          </>
        )
      }
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (phone && !running) timer.press();
      }}
      onPointerUp={(e) => timer.release(e.timeStamp)}
    />
  );
  const theirSide = <Side rest={theirRest} startedAt={duel.opponentStart} phase={duel.opponentPhase} mine={false} className={duel.opponentHere ? undefined : "gone opacity-50"} />;
  const roundLabel = duel.over ? tr("Five rounds raced") : tr("Round {0} of {1}", { 0: Math.min(round, ROUNDS - 1) + 1, 1: ROUNDS });
  return (
    <div className={cn(PAGE, "duel-race")}>
      {phone && (
        <PageHead
          title={tr("Duel")}
          sub={tr("vs {0} · {1}", { 0: opponent.name, 1: eventName })}
          more={
            <>
              {duel.over && !verdict && <MenuAction action="duel:result" icon={Trophy}>{tr("Result")}</MenuAction>}
              {!duel.opponentHere && <MenuAction action="duel:next" icon={Swords}>{tr("New opponent")}</MenuAction>}
              <MenuAction action="duel:leave" icon={X}>{tr("Leave the race")}</MenuAction>
            </>
          }
        >
          <ActionToggle action="duel:chat" pressed={duel.chatOpen} icon={MessageSquare} tip={tr("Rounds and chat")}>
            {duel.unread ? String(duel.unread) : null}
          </ActionToggle>
        </PageHead>
      )}
      <div className="flex min-h-0 flex-1 gap-6">
        <section className="relative flex min-w-0 flex-1 flex-col gap-3 md:gap-[18px]">
          {!phone && (
            <div className={cn("flex min-h-9 shrink-0 items-center gap-2", FADE)}>
              <span className={cn(KICKER, "mr-auto truncate")}>
                {roundLabel} · {eventName}
              </span>
              {duel.over && !verdict && (
                <Button action="duel:result" icon={Trophy} variant="secondary">
                  {tr("Result")}
                </Button>
              )}
              {!duel.opponentHere && (
                <Button action="duel:next" icon={Swords} variant="secondary">
                  {tr("New opponent")}
                </Button>
              )}
              {previewed && (
                <ActionToggle action="duel:cube" pressed={duel.showCube} icon={Box} tip={tr("Show or hide the cube")}>
                  {tr("Cube")}
                </ActionToggle>
              )}
              {!chatDocked && (
                <ActionToggle action="duel:chat" pressed={duel.chatOpen} icon={MessageSquare} tip={tr("Chat")}>
                  {duel.unread ? tr("Chat · {0}", { 0: duel.unread }) : tr("Chat")}
                </ActionToggle>
              )}
              <Button action="duel:leave" icon={X} variant="ghost">
                {tr("Leave")}
              </Button>
            </div>
          )}
          <Scramble scramble={scramble} font={promptFont} label={phone ? roundLabel : undefined} />
          {score}
          {phone ? (
            // Phones: the opponent on top, the player at the bottom by the thumb, the latest solve's buttons under them.
            <Surface className="flex-1 gap-1 px-3 py-2">
              <div className={cn("grid min-h-0 flex-1 grid-rows-2 gap-1", verdict && "opacity-25")}>
                {theirSide}
                {mySide}
              </div>
              {!duel.over && (
                <TouchBar>
                  <TouchAction action="duel:+2" icon={Plus} label="+2" pressed={myLast?.penalty === "+2"} disabled={!myLast} tone="warning" />
                  <TouchAction action="duel:dnf" icon={Ban} label={tr("DNF")} pressed={myLast?.penalty === "dnf"} disabled={!myLast} tone="bad" />
                  <TouchAction action="duel:cancel" icon={Undo2} label={tr("Redo")} disabled={!duel.canCancel} />
                </TouchBar>
              )}
            </Surface>
          ) : (
            <div className={cn("grid min-h-0 flex-1 items-stretch transition-opacity", cubeShown ? "grid-cols-[1fr_minmax(0,230px)_1fr]" : "grid-cols-2", verdict && "opacity-25")}>
              {mySide}
              {cubeShown && (
                <div className={cn("duel-cube flex min-h-0 items-center justify-center", FADE)} ref={setCubeBox}>
                  {cubeSide > 0 && scramble && <Cube setup={scramble} cubeSize={cubeSize} puzzle={event?.puzzle} size={Math.round(Math.min(cubeSide * 0.9, 210))} held={heldScramble("normal")} />}
                </div>
              )}
              {theirSide}
            </div>
          )}
          {verdict && <Result />}
        </section>
        {!phone && (
          <Surface className={cn("w-72 shrink-0 gap-3 p-4 pt-[18px] xl:w-80", FADE)}>
            <PanelHead title="Rounds" meta={`${Math.min(round, ROUNDS)} / ${ROUNDS}`} />
            <Rounds />
            {chatDocked && <Chat />}
          </Surface>
        )}
      </div>
      {phone && (
        <PhoneSheet open={duel.chatOpen} onOpenChange={(open) => open !== duel.chatOpen && void s.action("duel:chat")} title={tr("Rounds and chat")} tall>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Rounds />
            <Chat />
          </div>
        </PhoneSheet>
      )}
      {!chatDocked && !phone && (
        <Sheet open={duel.chatOpen} onOpenChange={(open: boolean) => open !== duel.chatOpen && void s.action("duel:chat")}>
          <SheetContent side="right" className="w-80 gap-0 p-4">
            <SheetTitle className="sr-only">{tr("Chat")}</SheetTitle>
            <Chat />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/** The scramble of the round being raced, large. */
function Scramble({ scramble, font, label }: { scramble: string; font: number; label?: string }) {
  return (
    <section className={cn("duel-scramble flex shrink-0 flex-col gap-1", FADE)}>
      {label && <span className={KICKER}>{label}</span>}
      <div className="scramble max-h-[22vh] overflow-y-auto font-semibold">
        {duel.over ? null : scramble ? <Alg text={scramble} size={font} /> : <Skeleton style={{ height: font * 1.4, width: "min(100%, 36em)" }} />}
      </div>
    </section>
  );
}

/** A side's Ao5 as a butterfly's time: none until the five are in, a DNF when it is one. */
const asTime = (v: number | null | undefined) => (v === undefined ? null : v === null ? { ms: 0, penalty: "dnf" } : { ms: v, penalty: "none" });

/** The rounds as a butterfly, the player's times to the left, the opponent's to the right; the averages under them. */
function Rounds() {
  const mine = duel.me,
    theirs = duel.them,
    own = ao5(mine),
    rival = ao5(theirs),
    rows = ROUND_LIST.map((r) => [mine[r], theirs[r]] as [DuelSolve | undefined, DuelSolve | undefined]),
    max = longest(rows),
    average = compare(own, rival);
  return (
    <div className="duel-board grid shrink-0 gap-[9px]" role="table" aria-label={tr("Rounds")}>
      <div className="grid grid-cols-[1fr_26px_1fr] text-xs font-semibold text-muted-foreground" role="row">
        <span className="truncate" role="columnheader">
          {tr("You")}
        </span>
        <span />
        <span className="truncate text-right" role="columnheader">
          {said(duel.opponent.name)}
        </span>
      </div>
      {rows.map(([a, b], r) => (
        <Fly
          key={r}
          n={r + 1}
          times={[a, b]}
          best={a && b ? (compare(solveTime(a), solveTime(b)) === "win" ? 0 : compare(solveTime(a), solveTime(b)) === "loss" ? 1 : null) : null}
          max={max}
          current={r === duel.round && !duel.over}
          data-round={r}
          className="duel-board-row"
        />
      ))}
      <div className="mt-1 border-t border-muted pt-2">
        <Fly n={tr("Ao5")} times={[asTime(own), asTime(rival)]} best={own === undefined || rival === undefined || average === "draw" ? null : average === "win" ? 0 : 1} max={max} />
      </div>
    </div>
  );
}

const QUICK = ["Well played", "GG", "Rematch?"];
/** The chat with the opponent: what the race says and the messages in one column, quick replies over the field. */
function Chat() {
  const [text, setText] = useState(""),
    list = useRef<HTMLDivElement>(null),
    result = duel.over ? compare(ao5(duel.me), ao5(duel.them)) : null,
    event = eventInfo(duel.event),
    here = duel.opponentHere;
  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [duel.chat.length, duel.opponentHere, duel.over]);
  const said_ = (line: React.ReactNode) => <p className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground before:h-px before:flex-1 before:bg-muted after:h-px after:flex-1 after:bg-muted">{line}</p>;
  return (
    <div className="duel-chat flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-1.5 text-sm" ref={list} aria-live="polite">
        {said_(tr("vs {0} · {1}", { 0: duel.opponent.name, 1: event ? eventLabel(event.puzzle, event.solveMode) : duel.event }))}
        {duel.chat.map((m, i) => {
          const own = m.seat === duel.seat;
          return (
            <div key={i} className={cn("duel-chat-line flex items-start gap-2", own && "mine flex-row-reverse text-right")}>
              <Avatar name={duel.players[m.seat]?.name} size={24} />
              <p className={cn("duel-chat-text min-w-0 pt-[3px] leading-snug break-words", own && "text-primary")}>{said(m.text)}</p>
            </div>
          );
        })}
        {result && said_(result === "win" ? tr("You win") : result === "loss" ? tr("{0} wins", { 0: duel.opponent.name }) : tr("Draw"))}
        {!here && said_(tr("{0} left", { 0: duel.opponent.name }))}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={!here}
            onClick={(e) => {
              duel.say(tr(q));
              e.currentTarget.blur();
            }}
            className="rounded-[9px] bg-muted px-2.5 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {tr(q)}
          </button>
        ))}
      </div>
      <form
        className="duel-chat-form shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          duel.say(text);
          setText("");
          // Space goes back to the timer once the message is sent.
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <InputGroup className="h-11 rounded-[14px]">
          <InputGroupInput
            value={text}
            maxLength={300}
            placeholder={here ? tr("Message") : tr("{0} left", { 0: duel.opponent.name })}
            disabled={!here}
            aria-label={tr("Message")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" size="icon-xs" disabled={!text.trim() || !here} aria-label={tr("Send")}>
              <Send />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

/** Once both have raced the five rounds: the verdict over the race's foot, the rounds, a rematch or another opponent. */
function Result() {
  const own = ao5(duel.me),
    rival = ao5(duel.them),
    result = compare(own, rival),
    opponent = duel.opponent.name,
    asked = duel.rematch[duel.seat],
    offered = duel.rematch[1 - duel.seat],
    [a, b] = roundsWon(duel.me, duel.them);
  const note = !duel.opponentHere ? tr("{0} left", { 0: opponent }) : offered && !asked ? tr("{0} wants a rematch.", { 0: opponent }) : asked ? tr("Waiting for {0}", { 0: opponent }) : "";
  return (
    <Verdict
      className="duel-result"
      title={result === "win" ? tr("Victory") : result === "loss" ? tr("Defeat") : tr("Draw")}
      tone={result === "win" ? "good" : result === "loss" ? "bad" : undefined}
      sub={tr("Ao5 {0} against {1} · rounds {2}–{3}", { 0: raceAverage(own) || "–", 1: raceAverage(rival) || "–", 2: a, 3: b })}
      middle={
        <>
          <RoundStrip cells={cellsOf(duel.me, duel.them, ROUNDS, true)} big label="Rounds" />
          {note && (
            <p className="flex items-center justify-center gap-2 text-center text-[13px] font-semibold text-primary">
              {offered && !asked && duel.opponentHere && <LiveDot />}
              {note}
            </p>
          )}
        </>
      }
      actions={
        <>
          <Button action="duel:dismiss" icon={X} variant="ghost" tip={tr("Close")} />
          <Button action="duel:next" variant="secondary">
            {tr("New opponent")}
          </Button>
          <Button action="duel:rematch" variant="default" disabled={!duel.opponentHere || asked}>
            {offered && !asked ? tr("Accept rematch") : tr("Rematch")}
          </Button>
        </>
      }
    />
  );
}
