/** The duel page: looking for an opponent, then the race split in two with the cube in the middle, and the chat. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { store as s } from "./store";
import { duel, ao5, compare, solveTime, ROUNDS, type DuelPhase, type DuelSolve } from "./duelClient";
import { Cube } from "./Cube";
import { useSquare } from "./practice";
import { PracticeTimer } from "../../src/client/lib/practiceTimer";
import { fmtSolve, fmtTime } from "../../src/client/lib/format";
import { eventInfo, eventLabel, heldScramble } from "../../src/shared/puzzles";
import { Alg, Button, Icon, MOBILE, PageHead, useViewport } from "./ui";

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
      if ((e.target as HTMLElement).closest("input,textarea,select") || s.overlay) return;
      if (e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
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
    void duel.loadLevel();
  }, [s.puzzle, s.solveMode]);
  return duel.status === "racing" ? <Race /> : <Lobby />;
}

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Before a race: the player's level on the event and one big cell to start (or stop) looking for an opponent. */
function Lobby() {
  const searching = duel.status === "searching",
    [, setSecond] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setSecond((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  const figures: [string, React.ReactNode][] = [
    [
      "Your level",
      duel.level === undefined ? <span className="skeleton-line" style={{ width: "3.2em", height: "0.8em" }} /> : duel.level === null ? "New" : fmtTime(duel.level),
    ],
    ["Searching", searching ? clock(Date.now() - duel.searchSince) : "—"],
    ["Also searching", searching ? String(duel.searching) : "—"],
  ];
  return (
    <div className="page duel-lobby">
      <PageHead title="Duel" puzzle sub={s.event().label} />
      <section className="setup-detail">
        <div className="setup-pane">
          <header className="setup-pane-head">
            <div className="setup-pane-title">
              <span className="label">One against one · {s.event().label}</span>
              <h2>{searching ? "Looking for an opponent" : "Race an Ao5"}</h2>
              <p className={duel.notice ? "danger" : "muted"}>
                {duel.notice || "The same five scrambles for both of you, against a player near your level."}
              </p>
            </div>
          </header>
          <div className="setup-figures">
            {figures.map(([label, value]) => (
              <div key={label} className="metric">
                <span className="label">{label}</span>
                <span className="metric-value mono">{value}</span>
              </div>
            ))}
          </div>
          <div className="setup-actions">
            <Button action={searching ? "duel:leave" : "duel:search"} className={"setup-start mono " + (searching ? "" : "primary")}>
              {searching ? "Cancel" : "Find an opponent"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const shown = (v: DuelSolve | undefined) => (v ? fmtSolve(v.ms, v.penalty) : "0.000");

function Digits({ text }: { text: string }) {
  return (
    <div className="timer-digits mono" style={{ "--chars": Math.max(6, text.length) } as React.CSSProperties}>
      {text.split("").map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </div>
  );
}

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
    <div className={"page duel-race " + (running ? "running" : "")}>
      <PageHead title="Duel" sub={`vs ${opponent.name} · ${event ? eventLabel(event.puzzle, event.solveMode) : duel.event}`}>
        {duel.over && duel.dismissed === duel.game && (
          <Button action="duel:result" icon="IconTrophy" className="control">
            Result
          </Button>
        )}
        {!duel.opponentHere && (
          <Button action="duel:next" icon="IconSwords" className="control">
            New opponent
          </Button>
        )}
        {!mobile && !!cubeSize && (
          <Button action="duel:cube" active={duel.showCube} icon="IconCube" className="control" title="Show or hide the cube">
            Cube
          </Button>
        )}
        {!chatDocked && (
          <Button action="duel:chat" active={duel.chatOpen} icon="IconComment" className="control" title="Chat">
            {duel.unread ? `Chat · ${duel.unread}` : "Chat"}
          </Button>
        )}
        <Button action="duel:leave" icon="IconClose" className="control" title="Leave the race">
          Leave
        </Button>
      </PageHead>
      <div className="duel-body" style={{ gridTemplateColumns: chatDocked ? "minmax(0, 1fr) var(--chat-width)" : "minmax(0, 1fr)" }}>
        <div className="duel-stage">
          <section className="duel-scramble" style={{ "--prompt-cells": scramble.length > 220 ? 4 : scramble.length > 120 ? 3 : 2 } as React.CSSProperties}>
            <span className="label">
              {duel.over ? "Race over" : `Round ${round + 1} of ${ROUNDS}`} · {duel.over ? "Ao5" : "Scramble"}
            </span>
            <div className="prompt-text scramble">
              {duel.over ? (
                <span className="muted">Five rounds raced.</span>
              ) : scramble ? (
                <Alg text={scramble} size={promptFont} />
              ) : (
                <span className="skeleton-line" style={{ height: promptFont * 1.4, width: "min(100%, 36em)" }} />
              )}
            </div>
          </section>
          <div className={"duel-split " + (cubeShown ? "with-cube" : "")}>
            <section
              className={"duel-side mine " + timer.phase}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                if (mobile && !running) timer.press();
              }}
              onPointerUp={timer.release}
            >
              <header className="duel-side-head">
                <strong>{me?.name}</strong>
                <span className="mono muted">{me?.level ? fmtTime(me.level) : ""}</span>
                <span className="duel-side-tag label">You</span>
              </header>
              <Digits text={myDigits} />
              <div className="timer-hint">{myHint}</div>
            </section>
            {cubeShown && (
              <div className="duel-cube" ref={setCubeBox}>
                {cubeSide > 0 && scramble && !duel.over && (
                  <Cube setup={scramble} cubeSize={cubeSize} size={Math.round(cubeSide * 0.8)} held={heldScramble("normal")} />
                )}
                <Button action="duel:cube" icon="IconClose" className="control icon-only pane-toggle" title="Hide the cube" />
              </div>
            )}
            <section className={"duel-side theirs " + duel.opponentPhase + (duel.opponentHere ? "" : " gone")}>
              <header className="duel-side-head">
                <strong>{opponent.name}</strong>
                <span className="mono muted">{opponent.level ? fmtTime(opponent.level) : ""}</span>
                <span className="duel-side-tag label">{opponentStatus()}</span>
              </header>
              <Digits text={theirDigits} />
              <div className="timer-hint" />
            </section>
          </div>
          <Board actions />
        </div>
        {chatDocked && (
          <aside className="column column-right duel-chat-column">
            <Chat />
          </aside>
        )}
      </div>
      {!chatDocked && duel.chatOpen && (
        <div className="sheet-backdrop" onClick={() => void s.action("duel:chat")}>
          <aside className="sheet" onClick={(e) => e.stopPropagation()}>
            <Chat closable />
          </aside>
        </div>
      )}
      <Result />
    </div>
  );
}

const average = (v: number | null | undefined) => (v === undefined ? "" : v === null ? "DNF" : fmtTime(v));

/** The rounds: one row per player, the round being raced lit, each won round and the better Ao5 in green. */
function Board({ actions = false }: { actions?: boolean }) {
  const round = duel.round;
  return (
    <div className={"duel-board " + (actions ? "with-actions" : "")} role="table" aria-label="Rounds">
      {[duel.seat, 1 - duel.seat].map((seat) => {
        const solves = duel.results[seat] ?? [],
          other = duel.results[1 - seat] ?? [],
          own = ao5(solves),
          rival = ao5(other),
          mine = seat === duel.seat;
        return (
          <div key={seat} className={"duel-board-row " + (mine ? "mine" : "")} role="row">
            <span className="duel-board-name">
              <strong>{duel.players[seat]?.name}</strong>
              {mine && <small className="muted">you</small>}
            </span>
            {ROUND_LIST.map((r) => {
              const v = solves[r],
                won = !!v && !!other[r] && compare(solveTime(v), solveTime(other[r]!)) === "win";
              return (
                <span
                  key={r}
                  className={"duel-board-cell mono " + (r === round ? "current " : "") + (v?.penalty === "dnf" ? "danger " : "") + (won ? "win" : "")}
                >
                  <span className="duel-board-round label">{r + 1}</span>
                  {v ? fmtSolve(v.ms, v.penalty) : ""}
                </span>
              );
            })}
            <span className={"duel-board-cell duel-board-ao5 mono " + (own !== undefined && rival !== undefined && compare(own, rival) === "win" ? "win" : "")}>
              <span className="duel-board-round label">Ao5</span>
              {average(own)}
            </span>
            {actions &&
              (mine ? (
                <span className="duel-board-tail duel-actions">
                  <SolveActions />
                </span>
              ) : (
                <span className="duel-board-tail duel-board-status label">{opponentStatus()}</span>
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
      <Button action="duel:+2" active={last?.penalty === "+2"} disabled={!last} className="control solve-action-plus2">
        +2
      </Button>
      <Button action="duel:dnf" active={last?.penalty === "dnf"} disabled={!last} className="control solve-action-dnf">
        DNF
      </Button>
      <Button action="duel:cancel" disabled={!duel.canCancel} className="control solve-action-delete" title="Take the solve back and redo it">
        Cancel
      </Button>
    </>
  );
}

/** Live chat with the opponent: messages over a field and its send cell. */
function Chat({ closable = false }: { closable?: boolean }) {
  const [text, setText] = useState(""),
    list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [duel.chat.length]);
  return (
    <div className="column-content duel-chat">
      <div className="column-head">
        <strong>Chat</strong>
        <span className="mono muted">{duel.chat.length}</span>
        {closable && (
          <span className="column-head-actions">
            <Button action="duel:chat" icon="IconClose" className="control icon-only" title="Close" />
          </span>
        )}
      </div>
      <div className="scroll duel-chat-list" ref={list}>
        {!duel.chat.length && <div className="column-empty">No messages yet.</div>}
        {duel.chat.map((m, i) => (
          <div key={i} className={"duel-chat-line " + (m.seat === duel.seat ? "mine" : "")}>
            <span className="duel-chat-name mono">{duel.players[m.seat]?.name}</span>
            <span className="duel-chat-text">{m.text}</span>
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
        <input
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
        <button type="submit" className="button duel-chat-send" disabled={!text.trim() || !duel.opponentHere} aria-label="Send" title="Send">
          <Icon name="IconSend" size={16} />
        </button>
      </form>
    </div>
  );
}

/** Once both have raced the five rounds: who won, the rounds, and a rematch or another opponent. */
function Result() {
  if (!duel.over || duel.dismissed === duel.game) return null;
  const own = ao5(duel.me),
    rival = ao5(duel.them),
    result = compare(own, rival),
    opponent = duel.opponent.name,
    asked = duel.rematch[duel.seat],
    offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? `${opponent} left.` : offered && !asked ? `${opponent} wants a rematch.` : asked ? `Waiting for ${opponent}…` : "";
  return (
    <div className="modal-backdrop" onClick={() => void s.action("duel:dismiss")}>
      <div className="modal duel-result" role="dialog" aria-modal="true" aria-label="Result" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{result === "win" ? "You win" : result === "loss" ? `${opponent} wins` : "Draw"}</h2>
          <Button action="duel:dismiss" icon="IconClose" className="control icon-only" title="See the race" />
        </div>
        <div className="duel-result-score">
          {[
            [duel.players[duel.seat]?.name, own, result === "win"],
            [opponent, rival, result === "loss"],
          ].map(([name, value, won], i) => (
            <div key={i} className={"duel-result-side " + (won ? "win" : "")}>
              <span className="label">{name as string}</span>
              <span className="duel-result-ao5 mono">{average(value as number | null)}</span>
              <small className="muted">Ao5</small>
            </div>
          ))}
        </div>
        <Board />
        {note && <p className="duel-result-note muted">{note}</p>}
        <div className="duel-result-actions">
          <Button action="duel:rematch" className={offered && !asked ? "primary" : ""} disabled={!duel.opponentHere || asked}>
            {offered && !asked ? "Accept rematch" : "Rematch"}
          </Button>
          <Button action="duel:next">New opponent</Button>
          <Button action="duel:leave">Leave</Button>
        </div>
      </div>
    </div>
  );
}
