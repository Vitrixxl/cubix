/**
 * A match being raced, drawn as the duel's race: where it stands and the scramble across the top, both players and the
 * score over the strip of the set's solves, their two timers either side of the cube (Space starts the player's own, as
 * on the timer page), and every solve so far as a butterfly beside them. Those who are not players watch it live. Once
 * a player has won, the verdict rises over the race's foot, with the way back to the tournament or the conversation.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { CircleAlert, Crown, Flag, Undo2, X } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { PracticeTimer, timerHint, type TimerSnapshot } from "../../../src/client/lib/practiceTimer";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { eventInfo, heldScramble } from "../../../src/shared/puzzles";
import { isPolyPuzzle } from "../../../src/shared/puzzleScene";
import { PENS, SOLVE_ACTION, ScoreLine, Side, type Racer } from "../duel";
import { Cube } from "../Cube";
import { useSquare } from "../practice";
import { Alg, Avatar, Empty, FADE, NUMERIC, PAGE, PageHead, PenaltyToggles, Surface, usePhone } from "../ui";
import { Back } from "../coaching/parts";
import { ask } from "../confirm";
import { Fly, KICKER, LiveDot, PanelHead, RoundStrip, Stage, StageFigure, Verdict, longest, type Cell } from "./format";
import { community, communityUrl, eventName, formatText, scoreOf, tournamentUrl, type Match, type MatchSolve } from "../community/client";
import { live, resultTime, type Phase } from "./matchClient";
import { shownSolve } from "../../../src/client/lib/duel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
          if (snapshot.phase !== "stopped") live.timer(snapshot.phase as Phase); // no inspection here
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
  useEffect(() => void timer.reset(), [live.solves.length]);
  const phase: Phase = snapshot.phase === "stopped" ? "idle" : (snapshot.phase as Phase);
  return { phase, startedAt: snapshot.startedAt, press: timer.press, release: timer.release };
}

export function MatchPage() {
  const id = Number(s.view.split("/")[0]);
  // Before the first paint: the match held already shows at once, never the one opened before.
  useLayoutEffect(() => {
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

/** The match's header: where it belongs, its event and format, and giving it up while playing. Phones keep the page's
 * own header; wider screens a quiet line over the race, as the duel's. */
function Head({ m, forfeit, line }: { m: Match; forfeit: boolean; line?: React.ReactNode }) {
  const phone = usePhone(),
    sub = [m.tournament ? tr("Round {0}", { 0: m.round }) : m.group, eventName(m.event), formatText(m)].filter(Boolean).join(" · ");
  if (phone) return <PageHead lead={<BackButton />} title={m.tournament ? <>{m.tournament}</> : tr("Battle")} sub={sub}>{forfeit && <Forfeit />}</PageHead>;
  return (
    <div className={cn("flex min-h-9 shrink-0 items-center gap-2", FADE)}>
      <BackButton />
      <span className={cn(KICKER, "mr-auto truncate")}>
        {[m.tournament ?? tr("Battle"), line, sub].filter(Boolean).map((part, i) => (
          <span key={i}>
            {i > 0 && " · "}
            {part}
          </span>
        ))}
      </span>
      {forfeit && <Forfeit />}
    </div>
  );
}

/** The current set's solves, who took each, the one being raced outlined; as many cells as the set can last. */
function setCells(m: Match, left: number): Cell[] {
  const wins = [0, 0];
  let cells: Cell[] = [];
  for (const solve of m.solves ?? []) {
    if (!solve.results[0] || !solve.results[1]) break;
    cells.push(solve.winner === null ? "tie" : solve.winner === left ? "me" : "them");
    if (solve.winner !== null && ++wins[solve.winner]! >= m.points && !live.over) {
      wins[0] = wins[1] = 0;
      cells = [];
    }
  }
  if (!live.over) cells.push("now");
  const length = Math.max(2 * m.points - 1, cells.length);
  return [...cells, ...Array<Cell>(length - cells.length).fill("")];
}

function Race({ m }: { m: Match }) {
  const timer = useMatchTimer(),
    phone = usePhone(),
    seat = live.seat,
    playing = seat !== null,
    // The player on the left; a spectator sees the first player there.
    left = seat ?? 0,
    right = 1 - left,
    current = live.current,
    event = eventInfo(m.event),
    cubeSize = event ? s.info(event.puzzle)?.cubeSize : 0,
    previewed = !phone && (!!cubeSize || isPolyPuzzle(event?.puzzle)),
    [cubeBox, setCubeBox] = useState<HTMLDivElement | null>(null),
    cubeSide = useSquare(cubeBox),
    [closed, setClosed] = useState(0),
    verdict = m.status === "done" && closed !== m.id,
    last = live.solves.at(-1),
    other = m.players[right],
    mine = playing ? last?.results[seat] : null;
  const rest = (k: number) => shownSolve((current ?? last)?.results[k] ?? undefined);
  const waiting = !m.present?.every(Boolean);
  // What a player is doing, under the name.
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
    keyboard: !phone,
  });
  const scramble = current?.scramble ?? "";
  const setNumber = m.score.sets[0] + m.score.sets[1] + 1;
  // Until both players are here, the race waits: no timers, only who is here and who is awaited.
  if (!live.over && waiting) return <Waiting m={m} seat={seat} />;
  const racer = (k: number): Racer => {
    const p = m.players[k],
      own = playing && k === left,
      phase = own ? timer.phase : live.phases[k];
    return {
      name: p?.username,
      shown: own ? tr("You") : undefined,
      avatar: p?.avatar,
      level: m.sets > 1 ? tr("{0} of {1}", { 0: m.score.points[k], 1: m.points }) : undefined,
      status: status(k, phase),
      live: phase === "running",
      gone: !m.present?.[k] && !own,
    };
  };
  const solveActions = (size: string) => (
    <div className={cn(PENS, size && "w-full")} data-no-timer>
      <PenaltyToggles penalty={mine?.penalty} disabled={!mine} onToggle={(p) => live.penalty(p)} variant="default" className={cn(SOLVE_ACTION, size)} />
      <Tip content={tr("Take the solve back and redo it")}>
        <Button variant="ghost" disabled={!live.canCancel} onClick={() => live.cancel()} className={cn(SOLVE_ACTION, size)}>
          <Undo2 />
          {tr("Redo")}</Button>
      </Tip>
    </div>
  );
  const mySide = (
    <Side
      rest={playing ? (timer.phase !== "idle" ? "0.000" : rest(left)) : live.phases[left] !== "idle" ? "0.000" : rest(left)}
      startedAt={playing ? timer.startedAt : live.started[left]}
      phase={playing ? timer.phase : live.phases[left]}
      hint={playing ? said(myHint) : undefined}
      mine={playing}
      className={playing || m.present?.[left] ? undefined : "opacity-50"}
      actions={!phone && playing && !live.over && solveActions("")}
      onPointerDown={(e) => {
        if (!phone || !playing || (e.target as HTMLElement).closest("button")) return;
        if (timer.phase !== "running") timer.press();
      }}
      onPointerUp={(e) => phone && playing && timer.release(e.timeStamp)}
    />
  );
  const theirSide = (
    <Side rest={live.phases[right] !== "idle" ? "0.000" : rest(right)} startedAt={live.started[right]} phase={live.phases[right]} mine={false} className={m.present?.[right] ? undefined : "opacity-50"} />
  );
  const score = scoreOf(m),
    where = [m.sets > 1 && !live.over && tr("Set {0}", { 0: setNumber }), current && !live.over && tr("Solve {0}", { 0: current.number })].filter(Boolean).join(" · ");
  return (
    <div className={cn(PAGE, "match-race relative")}>
      <SetFlash m={m} />
      <div className="flex min-h-0 flex-1 gap-6 max-md:flex-col max-md:gap-3">
        <section className="flex min-w-0 flex-1 flex-col gap-3 md:gap-[18px]">
          <Head m={m} forfeit={playing && !live.over} line={where} />
          <section className={cn("flex shrink-0 flex-col gap-1", FADE)}>
            {phone && where && <span className={KICKER}>{where}</span>}
            <div className="scramble max-h-[18vh] min-h-9 overflow-y-auto font-semibold">
              {live.over ? (
                <span className="text-sm text-muted-foreground">{m.status === "cancelled" ? tr("This match was called off.") : tr("{0} solves raced.", { 0: m.solves?.length ?? 0 })}</span>
              ) : scramble ? (
                <Alg text={scramble} size={phone ? (scramble.length > 90 ? 15 : 19) : scramble.length > 220 ? 18 : scramble.length > 120 ? 22 : 28} />
              ) : (
                <Skeleton className="h-8 w-[min(100%,32em)]" />
              )}
            </div>
          </section>
          <ScoreLine label={m.sets > 1 ? "Solves of this set" : "Solves"} players={[racer(left), racer(right)]} score={[score[left], score[right]]} cells={setCells(m, left)} />
          <Outcome m={m} left={left} />
          {phone ? (
            // Phones: the opponent on top, the player at the bottom by the thumb, the latest solve's buttons under them.
            <Surface className="flex-1 gap-2 px-3 py-2">
              <div className={cn("grid min-h-0 flex-1 grid-rows-2 gap-2", verdict && "opacity-25")}>
                {theirSide}
                {mySide}
              </div>
              {playing && !live.over && solveActions("flex-1")}
            </Surface>
          ) : (
            <div className={cn("grid min-h-0 flex-1 transition-opacity", previewed ? "grid-cols-[1fr_minmax(0,230px)_1fr]" : "grid-cols-2", verdict && "opacity-25")}>
              {mySide}
              {previewed && (
                <div ref={setCubeBox} className={cn("flex min-h-0 items-center justify-center", FADE)}>
                  {cubeSide > 0 && scramble && !live.over && <Cube setup={scramble} cubeSize={cubeSize} puzzle={event?.puzzle} size={Math.round(Math.min(cubeSide * 0.9, 210))} held={heldScramble("normal")} />}
                </div>
              )}
              {theirSide}
            </div>
          )}
          {verdict && <Result m={m} left={left} onClose={() => setClosed(m.id)} />}
        </section>
        <Solves m={m} left={left} />
      </div>
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

/** The latest solve decided, in words, as a line of the race's feed: who took it and by how much, and the set it closed. */
function Outcome({ m, left }: { m: Match; left: number }) {
  const out = lastOutcome(m);
  const line = "flex h-6 shrink-0 items-center gap-2 text-[13px] font-semibold text-muted-foreground before:h-px before:flex-1 before:bg-muted after:h-px after:flex-1 after:bg-muted";
  if (!out) return <p className={cn(line, FADE)}>{tr("The first solve decides the first point.")}</p>;
  const { solve, set, setWon } = out,
    w = solve.winner,
    times = [left, 1 - left].map((seat) => solve.results[seat]),
    a = resultTime(solve.results[0]),
    b = resultTime(solve.results[1]),
    gap = a !== null && b !== null ? Math.abs(a - b) : null,
    mine = w !== null && m.players[w]?.id === s.user.id;
  return (
    <p aria-live="polite" data-outcome={solve.number} className={cn(line, FADE)}>
      <span className={cn("truncate", w !== null && (mine ? "text-success" : "text-foreground"))}>
        {tr("Solve {0}", { 0: solve.number })} · {w === null ? tr("A tie: no point.") : setWon !== null && !live.over ? tr("{0} took it and won set {1}!", { 0: nameOf(m, w), 1: set }) : tr("{0} took it", { 0: nameOf(m, w) })}
      </span>
      <span className={cn(NUMERIC, "shrink-0")}>
        {times.map((r) => (r ? fmtSolve(r.ms, r.penalty) : "–")).join(" · ")}
        {gap !== null && w !== null ? ` · ${tr("by {0}", { 0: fmtTime(gap) })}` : ""}
      </span>
    </p>
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
      <div className="flex animate-in flex-col items-center gap-2 rounded-[26px] bg-popover px-12 py-8 shadow-xl fade-in zoom-in-95 motion-reduce:animate-none">
        <Crown className={cn("size-8", mine ? "text-warning" : "text-muted-foreground")} />
        <span className="text-4xl font-extrabold tracking-[-0.03em]">{mine ? tr("You win set {0}", { 0: out.set }) : tr("{0} wins set {1}", { 0: nameOf(m, out.setWon), 1: out.set })}</span>
        <span className={cn(NUMERIC, "text-lg font-semibold text-muted-foreground")}>
          {tr("Sets")} {m.score.sets[0]} – {m.score.sets[1]}
        </span>
      </div>
    </div>
  );
}

/** Before the race: both faces across the stage, who is here and who is awaited, and what will be raced. */
function Waiting({ m, seat }: { m: Match; seat: number | null }) {
  const other = seat === null ? null : m.players[1 - seat],
    started = (m.solves?.length ?? 0) > 0;
  return (
    <div className={PAGE}>
      <Head m={m} forfeit={seat !== null} />
      <Stage
        className="flex-1"
        data-slot="match-waiting"
        lead={
          <div className="flex max-w-[44ch] flex-col items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-primary">
              <LiveDot />
              {tr("Waiting")}
            </span>
            <h2 className="text-[clamp(24px,4vw,38px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance">
              {other ? (started ? tr("Waiting for {0} to come back", { 0: other.username }) : tr("Waiting for {0}", { 0: other.username })) : tr("Waiting for the players")}
            </h2>
            <p className="text-sm text-balance text-muted-foreground">
              {seat !== null ? tr("The race starts by itself once you are both on this page. Keep it open: {0} has been told.", { 0: other?.username ?? "" }) : tr("The race shows here once both players are on its page.")}
            </p>
          </div>
        }
        figures={
          <>
            <StageFigure value={eventName(m.event)} label="Event" />
            <StageFigure value={formatText(m)} label="Format" />
            {started && <StageFigure value={scoreOf(m).join("–")} label="Score so far" tone="accent" />}
          </>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5 md:gap-10">
          {[0, 1].map((k) => {
            const p = m.players[k],
              here = !!m.present?.[k];
            const cell = (
              <div key={k} className="flex min-w-0 flex-col items-center gap-2.5">
                {/* The one awaited has a ring pulsing round its face. */}
                <span className="relative flex">
                  {!here && <span className="absolute -inset-1.5 animate-pulse rounded-full ring-2 ring-primary/40 motion-reduce:animate-none" />}
                  <Avatar name={p?.username} src={p?.avatar} size={88} className={cn(!here && "opacity-50")} />
                </span>
                <span className="max-w-full truncate text-base font-bold">{p ? nameOf(m, k) : tr("Anyone")}</span>
                <span className={cn("flex items-center gap-1.5 text-[13px] font-semibold", here ? "text-success" : "text-muted-foreground")}>
                  <i className={cn("size-2 rounded-full", here ? "bg-success" : "bg-muted-foreground/50")} />
                  {here ? tr("Here") : tr("Not here yet")}
                </span>
              </div>
            );
            return k === 0 ? [cell, <span key="vs" className="text-lg font-extrabold text-faint">{tr("vs")}</span>] : cell;
          })}
        </div>
      </Stage>
    </div>
  );
}

/** Every solve so far as a butterfly beside the race: both times, the faster in its colour, a heading where a set starts. */
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
    return { solve, section, times: [solve.results[left], solve.results[1 - left]] as [MatchSolve["results"][number], MatchSolve["results"][number]] };
  });
  const max = longest(rows.map((r) => r.times));
  return (
    <Surface className={cn("w-72 shrink-0 gap-3 p-4 pt-[18px] max-md:max-h-36 max-md:w-full max-md:py-3 xl:w-80", FADE)} aria-label={tr("Solves")}>
      <PanelHead title="Solves" meta={solves.length || undefined} className="max-md:hidden" />
      <div className="grid grid-cols-[1fr_26px_1fr] text-xs font-semibold text-muted-foreground">
        <span className="truncate">{nameOf(m, left)}</span>
        <span />
        <span className="truncate text-right">{nameOf(m, 1 - left)}</span>
      </div>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto px-1" role="table" aria-label={tr("Solves")}>
        {rows.map(({ solve, section, times }) => [
          section && (
            <p key={"s" + solve.number} className={cn(KICKER, "pt-1.5")}>
              {section}
            </p>
          ),
          <Fly key={solve.number} n={solve.number} times={times} best={solve.winner === null ? null : solve.winner === left ? 0 : 1} max={max} current={!live.over && solve === live.current} data-solve={solve.number} />,
        ])}
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

/** Once the match is over: the verdict over the race's foot, the sets (or solves) won, and back to the tournament or the conversation. */
function Result({ m, left, onClose }: { m: Match; left: number; onClose: () => void }) {
  const winner = m.players.find((p) => p?.id === m.winner),
    seat = live.seat,
    won = !!winner && winner.id === s.user.id,
    lost = seat !== null && !!winner && !won,
    score = scoreOf(m),
    fastest = (m.solves ?? []).flatMap((x) => x.results.map(resultTime)).filter((t): t is number => t !== null);
  // The sets, or the solves of a single set, by who took them.
  const cells: Cell[] = [];
  const wins = [0, 0];
  for (const solve of m.solves ?? []) {
    if (solve.winner === null) {
      if (m.sets === 1 && solve.results[0] && solve.results[1]) cells.push("tie");
      continue;
    }
    if (m.sets === 1) cells.push(solve.winner === left ? "me" : "them");
    else if (++wins[solve.winner]! >= m.points) {
      cells.push(solve.winner === left ? "me" : "them");
      wins[0] = wins[1] = 0;
    }
  }
  return (
    <Verdict
      className="match-result"
      title={won ? tr("Victory") : lost ? tr("Defeat") : tr("{0} wins", { 0: winner?.username ?? tr("Nobody") })}
      tone={won ? "good" : lost ? "bad" : undefined}
      sub={[`${tr(m.sets > 1 ? "Sets" : "Solves")} ${score[left]}–${score[1 - left]}`, m.forfeit && tr("The match was given."), fastest.length && tr("Fastest solve {0}", { 0: fmtTime(Math.min(...fastest)) })].filter(Boolean).join(" · ")}
      middle={cells.length > 0 && <RoundStrip cells={cells} big label={m.sets > 1 ? "Sets" : "Solves"} />}
      actions={
        <>
          <Tip content={tr("Stay")}>
            <Button variant="ghost" size="icon" aria-label={tr("Stay")} onClick={onClose}>
              <X />
            </Button>
          </Tip>
          <Button onClick={() => go(home(m))}>{m.tournamentId ? tr("Back to the tournament") : tr("Back to the conversation")}</Button>
        </>
      }
    />
  );
}
