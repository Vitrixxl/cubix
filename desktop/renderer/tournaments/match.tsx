/**
 * A match being raced: each player's bar with the score (sets won, or solves in a single set), the scramble both players
 * solve, their two timers (Space starts the player's own, as on the timer page), and every solve so far as a move list
 * beside them. Those who are not players
 * watch it live. Once a player has won, the result, and the way back to the tournament or the group.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleAlert, Crown, Flag, Undo2 } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { PracticeTimer, timerHint, type TimerSnapshot } from "../../../src/client/lib/practiceTimer";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { eventInfo, heldScramble } from "../../../src/shared/puzzles";
import { isPolyPuzzle } from "../../../src/shared/puzzleScene";
import { Faces, PlayerBar, Side } from "../duel";
import { Cube } from "../Cube";
import { useSquare } from "../practice";
import { Alg, Avatar, Empty, FADE, LABEL, Modal, NUMERIC, PAGE, PageHead, PenaltyToggles, Surface } from "../ui";
import { Back } from "../coaching/parts";
import { ask } from "../confirm";
import { LiveDot, MoveList } from "./format";
import { community, communityUrl, eventName, formatText, scoreOf, tournamentUrl, type Match, type MatchSolve } from "../community/client";
import { live, resultTime, type Phase } from "./matchClient";
import { shownSolve } from "../../../src/client/lib/duel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "../base";
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
          // The fade follows `s.running` (see the store): the match alone is drawn again.
          s.running = snapshot.phase === "running";
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
        {live.error ? (
          <Empty icon={CircleAlert} title={said(live.error)}>
            <Button variant="outline" onClick={() => live.open(id)}>
              {tr("Try again")}</Button>
          </Empty>
        ) : (
          <RaceSkeleton />
        )}
      </div>
    );
  return <Race m={m} />;
}

/** The race on its way: the scramble, the two sides under their bars, the solves beside. */
function RaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 gap-6" aria-busy="true" aria-label={tr("Loading")}>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-[min(100%,32em)]" />
        <div className="grid flex-1 grid-cols-2 gap-8 py-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-10 w-12 rounded-lg" />
              </div>
              <Skeleton className="m-auto h-24 w-3/4" />
            </div>
          ))}
        </div>
      </div>
      <Surface className="w-64 shrink-0 gap-2 p-3 max-md:hidden xl:w-72">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </Surface>
    </div>
  );
}

/** Back to where the match belongs: its tournament, or the conversation whose card shows the battle. */
const home = (m: Match | null) =>
  m?.tournamentId ? tournamentUrl(m.tournamentId) : m?.conversationId ? communityUrl("messages/" + m.conversationId) : m?.groupId ? communityUrl(`groups/${m.groupId}`) : tournamentUrl();
/** Back where the match belongs; a battle under way has no way back but its end or forfeit. */
const BackButton = () => (live.match && community.competition?.match === live.match.id ? null : <Back to={home(live.match)} />);

/** The match's header: where it belongs, its event and format, and giving it up while playing. */
function Head({ m, forfeit }: { m: Match; forfeit: boolean }) {
  return (
    <PageHead lead={<BackButton />} title={m.tournament ? <>{m.tournament}</> : tr("Battle")} sub={[m.tournament ? tr("Round {0}", { 0: m.round }) : m.group, eventName(m.event), formatText(m)].filter(Boolean).join(" · ")}>
      {forfeit && <Forfeit />}
    </PageHead>
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
    other = m.players[right],
    mine = playing ? last?.results[seat] : null;
  const rest = (s: number) => {
    return shownSolve((current ?? last)?.results[s] ?? undefined);
  };
  const waiting = !m.present?.every(Boolean);
  // What a player is doing, under the name in the bar.
  const status = (k: number, phase: string) => {
    if (live.over) return m.winner === m.players[k]?.id ? tr("Winner") : "";
    if (!m.present?.[k]) return tr("Away");
    if (phase === "running") return tr("Solving");
    if (phase !== "idle") return tr("Ready");
    if (current?.results[k]) return current.results[1 - k] ? "" : tr("Waiting for {0}", { 0: m.players[1 - k]?.username ?? "" });
    return tr("Here");
  };
  const myHint = timerHint(timer.phase, {
    disabled: live.over ? "Match over" : waiting ? `Waiting for ${other?.username ?? "your opponent"}…` : !current ? "Drawing the scramble…" : current.results[left] ? `Waiting for ${other?.username}` : false,
    keyboard: true,
  });
  const scramble = current?.scramble ?? "";
  const setNumber = m.score.sets[0] + m.score.sets[1] + 1;
  // Until both players are here, the race waits: no timers, only who is here and who is awaited.
  if (!live.over && waiting) return <Waiting m={m} seat={seat} />;
  const side = (k: number) => {
    const p = m.players[k],
      own = playing && k === left,
      phase = own ? timer.phase : live.phases[k];
    return (
      <PlayerBar
        name={own ? tr("You") : p?.username}
        avatar={p?.avatar}
        level={
          m.sets > 1 ? (
            <span className="flex gap-1" aria-label={tr("{0} of {1} solves in this set", { 0: m.score.points[k], 1: m.points })}>
              {Array.from({ length: m.points }, (_, i) => (
                <span key={i} className={cn("h-1.5 w-4 rounded-full", i < m.score.points[k] ? "bg-primary" : "bg-muted-foreground/20")} />
              ))}
            </span>
          ) : undefined
        }
        status={status(k, phase)}
        live={phase === "running"}
        score={scoreOf(m)[k]}
        active={phase !== "idle" || (live.over && m.winner === p?.id)}
      />
    );
  };
  return (
    <div className={cn(PAGE, "match-race relative")}>
      <SetFlash m={m} />
      <Head m={m} forfeit={playing && !live.over} />
      <div className="flex min-h-0 flex-1 gap-6 max-md:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Outcome m={m} left={left} />
          <section className={cn("flex shrink-0 flex-col gap-1.5", FADE)}>
            <span className={LABEL}>
              {[m.sets > 1 && !live.over && tr("Set {0}", { 0: setNumber }), current ? tr("Solve {0}", { 0: current.number }) : tr("Scramble")].filter(Boolean).join(" · ")}
            </span>
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
          <div className={cn("grid min-h-0 flex-1 gap-8 py-2", previewed ? "grid-cols-[1fr_minmax(0,0.6fr)_1fr]" : "grid-cols-2")}>
            <Side
              bar={side(left)}
              rest={playing ? (timer.phase !== "idle" ? "0.000" : rest(left)) : live.phases[left] !== "idle" ? "0.000" : rest(left)}
              startedAt={playing ? timer.startedAt : live.started[left]}
              phase={playing ? timer.phase : live.phases[left]}
              hint={playing ? said(myHint) : undefined}
              mine={playing}
              className={playing || m.present?.[left] ? undefined : "opacity-50"}
              actions={
                playing &&
                !live.over && (
                  <>
                    <PenaltyToggles penalty={mine?.penalty} disabled={!mine} onToggle={(p) => live.penalty(p)} />
                    <Tip content={tr("Take the solve back and redo it")}>
                      <Button size="sm" variant="outline" disabled={!live.canCancel} onClick={() => live.cancel()} className="text-muted-foreground">
                        <Undo2 />
                        {tr("Redo")}</Button>
                    </Tip>
                  </>
                )
              }
            />
            {previewed && (
              <div ref={setCubeBox} className={cn("flex min-h-0 items-center justify-center", FADE)}>
                {cubeSide > 0 && scramble && !live.over && (
                  <Cube setup={scramble} cubeSize={cubeSize} puzzle={event?.puzzle} size={Math.round(Math.min(cubeSide * 0.85, 220))} held={heldScramble("normal")} />
                )}
              </div>
            )}
            <Side
              bar={side(right)}
              rest={live.phases[right] !== "idle" ? "0.000" : rest(right)}
              startedAt={live.started[right]}
              phase={live.phases[right]}
              mine={false}
              className={m.present?.[right] ? undefined : "opacity-50"}
            />
          </div>
        </div>
        <Solves m={m} left={left} />
      </div>
      <Result m={m} />
    </div>
  );
}

/** What the solves so far tell: the latest one decided, its set, and the seat that took the set with it. */
function lastOutcome(m: Match) {
  const wins = [0, 0];
  let set = 1,
    out: { solve: MatchSolve; set: number; setWon: number | null } | null = null;
  for (const solve of m.solves ?? []) {
    if (!solve.results[0] || !solve.results[1]) break;
    let setWon: number | null = null;
    if (solve.winner !== null && ++wins[solve.winner]! >= m.points) {
      setWon = solve.winner;
      wins[0] = wins[1] = 0;
    }
    out = { solve, set, setWon };
    if (setWon !== null) set++;
  }
  return out;
}
const nameOf = (m: Match, seat: number) => (m.players[seat]?.id === s.user.id ? tr("You") : (m.players[seat]?.username ?? "–"));

/** The latest solve decided, in words: who took it and by how much, and the set it closed. */
function Outcome({ m, left }: { m: Match; left: number }) {
  const out = lastOutcome(m);
  if (!out) return <p className={cn("flex h-9 shrink-0 items-center text-sm text-muted-foreground", FADE)}>{tr("The first solve decides the first point.")}</p>;
  const { solve, set, setWon } = out,
    w = solve.winner,
    times = [left, 1 - left].map((seat) => solve.results[seat]),
    a = resultTime(solve.results[0]),
    b = resultTime(solve.results[1]),
    gap = a !== null && b !== null ? Math.abs(a - b) : null,
    mine = w !== null && m.players[w]?.id === s.user.id;
  return (
    <section
      aria-live="polite"
      data-outcome={solve.number}
      className={cn(
        "flex h-9 shrink-0 items-center gap-3 rounded-lg border px-3 text-sm",
        w === null ? "bg-muted/45" : mine ? "border-success/25 bg-success/10" : "border-destructive/25 bg-destructive/10",
        FADE,
      )}
    >
      <span className={cn(LABEL, "shrink-0")}>{tr("Solve {0}", { 0: solve.number })}</span>
      <span className="truncate font-medium">
        {w === null ? tr("A tie: no point.") : setWon !== null && !live.over ? tr("{0} took it and won set {1}!", { 0: nameOf(m, w), 1: set }) : tr("{0} took it", { 0: nameOf(m, w) })}
      </span>
      <span className={cn(NUMERIC, "ml-auto shrink-0 text-muted-foreground")}>
        {times.map((r) => (r ? fmtSolve(r.ms, r.penalty) : "–")).join(" · ")}
        {gap !== null && w !== null ? ` · ${tr("by {0}", { 0: fmtTime(gap) })}` : ""}
      </span>
    </section>
  );
}

/** A set won: said large over the race for a moment. */
function SetFlash({ m }: { m: Match }) {
  const out = lastOutcome(m),
    key = out?.setWon != null ? out.solve.number : 0,
    [shown, setShown] = useState(0);
  useEffect(() => {
    if (!key || live.over) return;
    setShown(key);
    const t = setTimeout(() => setShown(0), 2600);
    return () => clearTimeout(t);
  }, [key]);
  if (!shown || !out || out.setWon === null) return null;
  const mine = m.players[out.setWon]?.id === s.user.id;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" data-slot="set-won">
      <div className="flex animate-in flex-col items-center gap-2 rounded-xl bg-popover/95 px-10 py-7 shadow-2xl ring-1 ring-foreground/10 backdrop-blur fade-in zoom-in-95 motion-reduce:animate-none">
        <Crown className={cn("size-8", mine ? "text-warning" : "text-muted-foreground")} />
        <span className="text-3xl font-semibold tracking-tight">{mine ? tr("You win set {0}", { 0: out.set }) : tr("{0} wins set {1}", { 0: nameOf(m, out.setWon), 1: out.set })}</span>
        <span className={cn(NUMERIC, "text-lg text-muted-foreground")}>
          {tr("Sets")} {m.score.sets[0]} – {m.score.sets[1]}
        </span>
      </div>
    </div>
  );
}

/** Before the race: who is here, who is awaited, and what will be raced. */
function Waiting({ m, seat }: { m: Match; seat: number | null }) {
  const other = seat === null ? null : m.players[1 - seat],
    started = (m.solves?.length ?? 0) > 0;
  return (
    <div className={PAGE}>
      <Head m={m} forfeit={seat !== null} />
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Surface className="w-full max-w-lg items-center gap-8 px-6 py-8 text-center" data-slot="match-waiting">
          <div className="flex flex-col items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-primary">
              <LiveDot />
              {tr("Waiting")}
            </span>
            <h2 className="text-2xl font-semibold tracking-tight">
              {other ? (started ? tr("Waiting for {0} to come back", { 0: other.username }) : tr("Waiting for {0}", { 0: other.username })) : tr("Waiting for the players")}
            </h2>
            <p className="max-w-[40ch] text-sm text-balance text-muted-foreground">
              {seat !== null ? tr("The race starts by itself once you are both on this page. Keep it open: {0} has been told.", { 0: other?.username ?? "" }) : tr("The race shows here once both players are on its page.")}
            </p>
          </div>
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
            {[0, 1].map((k) => {
              const p = m.players[k],
                here = !!m.present?.[k];
              const cell = (
                <div key={k} className="flex min-w-0 flex-col items-center gap-2">
                  {/* The one awaited has a ring pulsing round its face. */}
                  <span className="relative flex">
                    {!here && <span className="absolute -inset-1.5 animate-pulse rounded-full ring-2 ring-primary/30 motion-reduce:animate-none" />}
                    <Avatar name={p?.username} src={p?.avatar} size={56} className={cn(!here && "opacity-50")} />
                  </span>
                  <span className="max-w-full truncate text-sm font-medium">{p ? nameOf(m, k) : tr("Anyone")}</span>
                  <Badge variant={here ? "success" : "secondary"}>{here ? tr("Here") : tr("Not here yet")}</Badge>
                </div>
              );
              return k === 0 ? [cell, <span key="vs" className="text-sm text-muted-foreground">{tr("vs")}</span>] : cell;
            })}
          </div>
          {started && (
            <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>
              {tr("Score so far")} · {scoreOf(m).join(" – ")}
            </span>
          )}
        </Surface>
      </div>
    </div>
  );
}

/** Every solve so far as a move list beside the race: both times, the faster in green, a heading where a set starts. */
function Solves({ m, left }: { m: Match; left: number }) {
  const solves = m.solves ?? [];
  let set = 1,
    headed = 0;
  const wins = [0, 0];
  const rows = solves.map((solve) => {
    const section = m.sets > 1 && headed !== set ? tr("Set {0}", { 0: (headed = set) }) : undefined;
    if (solve.winner !== null && ++wins[solve.winner]! >= m.points) {
      set++;
      wins[0] = wins[1] = 0;
    }
    const best = solve.winner === null ? null : solve.winner === left ? 0 : 1;
    return {
      key: solve.number,
      n: solve.number,
      results: [solve.results[left], solve.results[1 - left]] as [MatchSolve["results"][number], MatchSolve["results"][number]],
      best,
      current: !live.over && solve === live.current,
      section,
      attrs: { "data-solve": solve.number },
    };
  });
  return (
    <Surface className={cn("w-64 shrink-0 xl:w-72 max-md:max-h-48 max-md:w-full", FADE)} aria-label={tr("Solves")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-1">
        <MoveList label="Solves" names={[nameOf(m, left), nameOf(m, 1 - left)]} rows={rows} />
        {!solves.length && <Empty className="p-3">{tr("No solve yet.")}</Empty>}
      </div>
    </Surface>
  );
}

/** Giving up the match, once asked. */
function Forfeit() {
  return (
    <Button
      variant="outline"
      className="text-muted-foreground hover:text-destructive"
      onClick={async () => {
        const text = tr("Your opponent wins it at once") + (live.match?.tournamentId ? tr(" and goes through to the next round") : "") + ".";
        if (await ask({ title: tr("Give up the match?"), text, action: tr("Forfeit"), cancel: tr("Keep playing") })) live.forfeit();
      }}
    >
      <Flag />
      {tr("Forfeit")}</Button>
  );
}

/** Once the match is over: who won, both players face to face with their score, and back to the tournament or the group. */
function Result({ m }: { m: Match }) {
  const [closed, setClosed] = useState(0);
  const open = m.status === "done" && closed !== m.id;
  const winner = m.players.find((p) => p?.id === m.winner),
    mine = winner && winner.id === s.user.id,
    fastest = (m.solves ?? []).flatMap((x) => x.results.map(resultTime)).filter((t): t is number => t !== null);
  return (
    <Modal
      open={open}
      onOpenChange={(next: boolean) => !next && setClosed(m.id)}
      title={<span className={cn(mine && "text-success")}>{mine ? tr("You win") : tr("{0} wins", { 0: winner?.username ?? "Nobody" })}</span>}
      description={(m.forfeit ? tr("The match was given.") : "") + (fastest.length ? tr(" Fastest solve {0}.", { 0: fmtTime(Math.min(...fastest)) }) : "")}
      className="sm:max-w-md"
    >
      <Faces
        players={[0, 1].map((k) => ({
          name: m.players[k] ? nameOf(m, k) : "–",
          avatar: m.players[k]?.avatar,
          label: m.sets > 1 ? "Sets" : "Solves",
          value: scoreOf(m)[k],
          won: !!m.winner && m.players[k]?.id === m.winner,
        }))}
      />
      <DialogFooter>
        <Button variant="ghost" className="sm:mr-auto" onClick={() => setClosed(m.id)}>
          {tr("Stay")}</Button>
        <Button onClick={() => go(home(m))}>{m.tournamentId ? tr("Back to the tournament") : tr("Back to the conversation")}</Button>
      </DialogFooter>
    </Modal>
  );
}
