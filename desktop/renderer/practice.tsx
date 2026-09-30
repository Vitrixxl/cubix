/** The timer page and a running training: prompt, timer, session figures and the times list. */
import { isReviewMode, learningTrackOf } from "../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES, heldMoves } from "../../src/shared/crossPlusOne";
import { heldScramble } from "../../src/shared/puzzles";
import { trainingSessionRows } from "../../src/client/lib/practiceSummary";
import { PracticeTimer } from "../../src/client/lib/practiceTimer";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { store as s } from "./store";
import { Cube } from "./Cube";
import { fmtTime, fmtSolve, parseTypedTime, effective } from "../../src/client/lib/format";
import { Alg, Button, Diagram, Icon, MOBILE, Menu, PageHead, Skeleton, plural, useViewport } from "./ui";
function useTimer(enabled: boolean) {
  const [phase, setPhase] = useState("Idle");
  const [elapsed, setElapsed] = useState(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const frame = useRef(0);
  const [timer] = useState(() => new PracticeTimer({
    canStart: () => enabledRef.current,
    onStop: ms => { void s.save(ms); },
    onChange: snapshot => {
      const running = snapshot.phase === "running";
      setPhase(snapshot.phase === "stopped" ? "Idle" : snapshot.phase[0].toUpperCase() + snapshot.phase.slice(1));
      setElapsed(snapshot.elapsed);
      s.running = running;
      s.learningFrozen = ["holding", "ready", "running"].includes(snapshot.phase);
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
  }));
  const { press, release } = timer;
  const stop = () => { if (timer.snapshot.phase === "running") timer.press(); };
  useEffect(() => { timer.reset(); }, [s.timerEpoch, timer]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (timer.snapshot.phase === "running") {
        e.preventDefault();
        stop();
        return;
      }
      if (
        (e.target as HTMLElement).closest("input,textarea,select") ||
        s.overlay ||
        (s.entry === "typing" && s.page === "playground")
      )
        return;
      if (e.code === "Space" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        press();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    const blur = timer.cancelArming;
    const pointer = () => {
      if (timer.snapshot.phase === "running") stop();
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    addEventListener("pointerdown", pointer);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
      removeEventListener("pointerdown", pointer);
      timer.dispose();
      cancelAnimationFrame(frame.current);
      s.running = false;
      s.learningFrozen = false;
    };
  }, []);
  return { phase, elapsed, press, release };
}

/** The side of the largest square inside an element's padding box, kept up to date as it resizes. */
export function useSquare(element: HTMLElement | null) {
  const [side, setSide] = useState(0);
  useLayoutEffect(() => {
    if (!element) return void setSide(0);
    const measure = () => {
      const style = getComputedStyle(element),
        width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setSide(Math.max(0, Math.floor(Math.min(width, height))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return side;
}

export function Practice() {
  useEffect(() => {
    const tick = () => { void s.refreshLearning().catch(s.fail); };
    tick();
    const interval = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(interval); window.removeEventListener("focus", tick); };
  }, []);
  const learning = s.learningMode !== "practice";
  const reviewing = isReviewMode(s.learningMode);
  const track = learningTrackOf(s.learningMode);
  const { w, h } = useViewport(),
    mobile = w <= MOBILE,
    // First-block training runs like the timer, on its own scrambles.
    cross = s.crossTraining,
    training = s.page === "training" && !cross,
    // Wide windows keep the statistics and the times beside the stage; narrower ones open them on demand.
    timesAlways = !mobile && (training ? w >= 1200 : w >= 980),
    timesColumn = !mobile && (timesAlways || s.showTimes),
    compact = w <= 900 || h <= 760;
  const enabled =
      !s.saving &&
      !s.generating &&
      !s.error &&
      (!training || (!!s.practiceSelected.size && s.practiceSelected.has(s.training?.id))),
    timer = useTimer(enabled),
    typing = s.page === "playground" && s.entry === "typing";
  const [typed, setTyped] = useState("");
  const [cubeBox, setCubeBox] = useState<HTMLDivElement | null>(null),
    cubeSide = useSquare(cubeBox);
  const typedRef = useRef<HTMLInputElement>(null);
  // While a solve runs everything else fades out and the digits glide to the middle of the screen, then back.
  const digitsRef = useRef<HTMLDivElement>(null),
    running = timer.phase === "Running";
  useLayoutEffect(() => {
    const digits = digitsRef.current;
    if (!digits) return;
    if (!running) return void (digits.style.transform = "");
    const r = digits.getBoundingClientRect();
    digits.style.transform = `translate(${innerWidth / 2 - (r.left + r.width / 2)}px, ${innerHeight / 2 - (r.top + r.height / 2)}px)`;
  }, [running]);
  useEffect(() => {
    setTyped("");
    if (typing && !s.overlay) typedRef.current?.focus();
  }, [typing, s.overlay, s.timerEpoch]);
  const c = training ? s.find(s.training?.id) : null,
    ready = training ? !!c && s.practiceSelected.has(c.id) : true,
    cubeSize = training ? 0 : s.info()?.cubeSize,
    hasCube = training ? !!c && !c.flat && !c.diagram : !!cubeSize,
    text = (training ? s.training?.setup : s.scramble) ?? "",
    promptFont = mobile
      ? text.length > 90 ? 15 : 18
      : text.length > 220 ? 15 : text.length > 120 ? (compact ? 16 : 18) : compact ? 20 : 24,
    // On the desktop the cube has a square box of its own at the right of the scramble.
    cubePane = !mobile && ready && (hasCube || training),
    cubeShown = cubePane && s.showCube,
    previewSize = mobile ? (h < 760 ? 0 : 76) : cubeSide;
  const hint = !enabled
    ? training ? "Select cases to begin" : "One moment…"
    : timer.phase === "Holding"
      ? "Keep holding…"
      : timer.phase === "Ready"
        ? "Release to start"
        : timer.phase === "Running"
          ? mobile ? "Tap to stop" : "Any key to stop"
          : `${s.page === "playground" && s.entry === "casual" ? "Not saved · " : ""}${mobile ? "Hold, then release to start" : "Hold Space, release to start"}`;
  const digits = timer.phase === "Holding" || timer.phase === "Ready" ? "0.000" : fmtTime(timer.elapsed);
  const last = s.solves.find((v) => v.id === s.lastSolve);
  const metrics = s.metrics();
  const visual = previewSize > 0 && ready && (
    hasCube ? (
      <Cube
        setup={training ? s.training.setup : s.scramble}
        cubeSize={training ? c.cube_size ?? 3 : cubeSize}
        mask={training ? maskForStage(c.stage) : undefined}
        size={previewSize}
        replay={s.replay}
        held={!training && heldScramble(s.context().scrambleType)}
      />
    ) : training && s.training?.svg ? (
      <div
        style={{ width: previewSize, height: previewSize }}
        className="svg-diagram"
        dangerouslySetInnerHTML={{ __html: s.training.svg }}
      />
    ) : training ? (
      <Diagram c={c} size={previewSize} />
    ) : null
  );
  const showCube = cubePane && !cubeShown && (
    <Button action="cube" className="control small pane-toggle" title="Show the cube">
      <Icon name="IconCube" size={14} />
      Show cube
    </Button>
  );
  const prompt = (
    <section className={"prompt" + (training ? " training-prompt" : "")}>
      {training ? (
        ready ? (
          <div className="prompt-main">
            <div className="case-caption">
              <Button action={"case:" + c.id} className="case-title" title="Open the case">
                {c.name}
              </Button>
              <span className="case-kind">
                {learning ? s.dailyStatus : c.setLabel + (c.group && c.group !== c.setLabel ? " · " + c.group : "")}
              </span>
              <span className="case-nav">
                {showCube}
                <Button
                  action={"learn:" + c.id}
                  className={"control small " + (s.learned.has(c.id) ? "is-learned" : "")}
                  icon={s.learned.has(c.id) ? "IconCheck" : undefined}
                >
                  {s.learned.has(c.id) ? "Learned" : "Mark learned"}
                </Button>
              </span>
            </div>
            <div className="prompt-block">
              <span className="label">Setup</span>
              <div className="prompt-text">
                <Alg text={s.training.setup} size={promptFont} />
              </div>
            </div>
            {s.revealed && (
              <div className="prompt-block">
                <span className="label">Algorithm</span>
                <div className="prompt-text">
                  <Alg text={s.training.algorithm} size={Math.max(15, promptFont - 4)} />
                </div>
              </div>
            )}
            <div className="prompt-actions">
              <Button action="solution" className="control small" title="Show or hide the solution (Alt+H)">
                <Icon name="IconEye" size={14} />
                {s.revealed ? "Hide solution" : "Show solution"}
              </Button>
              {c.algorithms[0]?.youtube && (
                <Button action={"url:" + c.algorithms[0].youtube} className="control small" title="Watch finger tricks video">
                  Watch video
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="prompt-main prompt-empty">
            <strong>{reviewing ? "No learned cases yet" : learning ? "Track complete" : "Choose your cases"}</strong>
            <span className="muted">{learning ? s.dailyStatus : "Select the cases you want to practise."}</span>
            <div className="prompt-actions">
              {!learning && <Button action="trainingSetup" className="primary">Choose cases</Button>}
              {track && !reviewing && s.trackLearnedCount > 0 && (
                <Button action={"learningMode:review:" + track} className="primary">Train learned</Button>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="prompt-main">
          <span className="label prompt-label">
            <span>{cross ? `Scramble · back block in ${s.crossMoves} moves` : `Scramble · ${s.label("scrambles", s.scrambleType)}`}</span>
            {!!s.scramble && !s.generating && <span className="prompt-count">{plural(s.scramble.split(/\s+/).length, "move")}</span>}
            {showCube}
          </span>
          <div className="prompt-text scramble">
            {s.generating && !s.scramble ? (
              <span className="scramble-skeleton" aria-label="Generating a scramble">
                <Skeleton w="92%" h={promptFont * 1.1} />
                <Skeleton w="58%" h={promptFont * 1.1} />
              </span>
            ) : (
              <Alg text={s.scramble} size={promptFont} faces={!!cubeSize} />
            )}
          </div>
          {cross && <CrossSolution font={Math.max(15, promptFont - 4)} />}
        </div>
      )}
      {cubeShown && (
        <div className="cube-box" ref={setCubeBox}>
          {visual}
          <Button action="cube" icon="IconClose" className="control icon-only pane-toggle cube-hide" title="Hide the cube" />
        </div>
      )}
      {mobile && previewSize > 0 && ready && <div className="prompt-visual">{visual}</div>}
    </section>
  );
  const timesToggle = !timesAlways && (
    <Button action="times" active={s.showTimes} icon="IconTimer" className="control collapsible" title="Times (Alt+T)">
      <span className="control-label">{training ? "Session" : "Times"}</span>
    </Button>
  );
  const replay = hasCube && ready && (
    <Button action="replayCube" className="control collapsible" title="Replay the scramble on the cube">
      <Icon name="IconUndo" size={14} />
      <span className="control-label">Replay</span>
    </Button>
  );
  const statistics = (
    <section className={"panel metrics" + (metrics.length > 4 ? " metrics-full" : "")} aria-label="Statistics">
      <header className="panel-head">
        <strong>Statistics</strong>
        <span className="muted">{training ? "This session" : s.event().label}</span>
      </header>
      <div className="metrics-grid">
        {metrics.map(([label, value, tone]) => (
          <div key={label} className={"metric" + (tone ? " tone-" + tone : "") + (/^[-–—]$/.test(value.trim()) ? " is-empty" : "")}>
            <span className="label">{label}</span>
            <span className="metric-value mono">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
  return (
    <div className={"page practice " + (timer.phase === "Running" ? "running " : "") + (training ? "is-training" : "")}>
      {cross ? (
        <PageHead title="Cross + 1" puzzle lead={<ChangeTraining />} sub={`Training · first block in ${s.crossMoves} moves`}>
          <div className="segmented" role="group" aria-label="Moves">
            {CROSS_PLUS_ONE_MOVES.map((n) => (
              <Button key={n} action={"crossMoves:" + n} active={s.crossMoves === n} highlight="cross-moves" title={`Cross + 1 in ${n} moves`}>
                {n} moves
              </Button>
            ))}
          </div>
          {replay}
          <Button action="next" icon="IconShuffle" className="control collapsible" title="New scramble (Alt+N)">
            <span className="control-label">New scramble</span>
          </Button>
          {timesToggle}
        </PageHead>
      ) : training ? (
        <PageHead
          title={track ? `Learn ${track}` : reviewing ? "Review" : "Free practice"}
          puzzle
          lead={<ChangeTraining />}
          sub={track ? "Training · one new case a day" : reviewing ? "Training · every learned case" : "Training · " + plural(s.practiceSelected.size, "case")}
        >
          {learning && !reviewing && (
            <Button action="menu:learningGroups" icon="IconGrid" className="control">
              Groups
            </Button>
          )}
          {track && (
            <Button
              action={"learningMode:" + (reviewing ? track : "review:" + track)}
              active={reviewing}
              className="control"
              disabled={!reviewing && !s.trackLearnedCount}
              title={`Train every learned ${track} case`}
            >
              {mobile ? "Review" : "Train learned"}
            </Button>
          )}
          <Button action="auf" active={s.randomAuf} className="control collapsible" title="Random AUF (Alt+A)">
            <Icon name="IconShuffle" size={14} />
            <span className="control-label">Random AUF</span>
          </Button>
          {replay}
          <Button action="previous" icon="IconBack" className="control" disabled={!s.training?.canPrevious} title="Previous case (Alt+P)">
            {!mobile && "Previous"}
          </Button>
          {(!learning || reviewing) && (
            <Button action="next" icon="IconChevronRight" className="control" title="Next case (Alt+N)">
              {!mobile && "Next"}
            </Button>
          )}
          {timesToggle}
        </PageHead>
      ) : (
        <PageHead title="Timer" puzzle sub={`${s.event().label} · ${plural(s.solves.length, "solve")} this session`}>
          <Menu action="scrambles">
            <span className="menu-trigger-key">Scramble</span>
            {s.label("scrambles", s.scrambleType)}
          </Menu>
          <Menu action="entries">
            <span className="menu-trigger-key">Entry</span>
            {s.entry === "typing" ? "Typing" : s.entry === "casual" ? "Casual" : "Timer"}
          </Menu>
          {replay}
          <Button action="next" icon="IconShuffle" className="control collapsible" title="New scramble (Alt+N)">
            <span className="control-label">New scramble</span>
          </Button>
          {timesToggle}
        </PageHead>
      )}
      <div className={"practice-body" + (timesColumn ? " with-column" : "")}>
        <div className="practice-main">
          <div className="panel stage">
            {prompt}
            <section
              className={"timer " + timer.phase.toLowerCase()}
              data-phase={timer.phase}
              onPointerDown={(e) => {
                if (e.target instanceof HTMLInputElement || (e.target as HTMLElement).closest(".solve-actions, .cube-box, .pane-toggle")) return;
                if (mobile || timer.phase === "Running") timer.press();
              }}
              onPointerUp={timer.release}
            >
              {s.notice && (
                <div className="notice">
                  <Icon name={training ? "IconCheck" : "IconTrophy"} size={14} />
                  {s.notice}
                </div>
              )}
              <div className="timer-center">
                {typing ? (
                  <input
                    ref={typedRef}
                    className="typed-time mono"
                    aria-label="Time"
                    placeholder="0.000"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value.replace(/[^\d.,:]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const ms = parseTypedTime(typed);
                        if (ms && enabled) {
                          setTyped("");
                          void s.save(ms);
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="timer-digits mono" ref={digitsRef} style={{ "--chars": Math.max(6, digits.length) } as React.CSSProperties}>
                    {digits.split("").map((ch, i) => (
                      <span key={i} className={digits.includes(".") && i > digits.indexOf(".") ? "frac" : undefined}>{ch}</span>
                    ))}
                  </div>
                )}
                {!typing && s.practicePage() === "playground" && <AverageWindow />}
                <div className="timer-hint">
                  {typing
                    ? typed
                      ? parseTypedTime(typed)
                        ? `${fmtTime(parseTypedTime(typed))} · Enter to save`
                        : "Not a time"
                      : "Type your time, then Enter: 1234 is 12.34"
                    : hint}
                </div>
              </div>
              {/* The last solve's actions, there before the first solve too (disabled) so the timer never moves. */}
              <div className="solve-actions" aria-label="Last solve">
                <Button action={"penalty:" + last?.id + ":+2"} active={last?.penalty === "+2"} disabled={!last || s.saving} className="control solve-action-plus2">
                  +2
                </Button>
                <Button action={"penalty:" + last?.id + ":dnf"} active={last?.penalty === "dnf"} disabled={!last || s.saving} className="control solve-action-dnf">
                  DNF
                </Button>
                <Button
                  action={"comment:" + last?.id}
                  icon="IconComment"
                  disabled={!last || s.saving}
                  className={"control solve-action-comment " + (last?.comment ? "has-comment" : "")}
                  title="Comment"
                >
                  Comment
                </Button>
                <Button action={"delete:" + last?.id} icon="IconTrash" disabled={!last || s.saving} className="control solve-action-delete" title="Delete this solve">
                  Delete
                </Button>
              </div>
            </section>
          </div>
          {!timesColumn && statistics}
        </div>
        {timesColumn && (
          <aside className="column column-right">
            {statistics}
            <Times closable={!timesAlways} />
          </aside>
        )}
      </div>
      {mobile && s.showTimes && (
        <div
          className="sheet-backdrop"
          onClick={() => {
            s.showTimes = false;
            s.emit();
          }}
        >
          <aside className="sheet" onClick={(e) => e.stopPropagation()}>
            <Times closable />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Optimal back-block solutions under the scramble, held with white on the bottom and green in front (z2). */
function CrossSolution({ font }: { font: number }) {
  const solutions = s.revealed && s.crossSolutions?.scramble === s.scramble ? s.crossSolutions.list : undefined;
  return (
    <>
      {s.revealed && (
        <div className="prompt-block">
          <span className="label">Solution · z2, white on the bottom</span>
          {solutions ? (
            <div className="cross-solutions">
              {solutions.map((v) => (
                <div key={v.moves + v.slot} className="cross-solution">
                  <Alg text={heldMoves(v.moves)} size={font} />
                  <span className="mark">{v.slot} block</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cross-solutions" aria-hidden="true">
              <span className="skeleton-line" style={{ height: font * 1.4, width: font * 9 }} />
            </div>
          )}
        </div>
      )}
      <div className="prompt-actions">
        <Button action="solution" className="control small" title="Show or hide the solution (Alt+H)">
          <Icon name="IconEye" size={14} />
          {s.revealed ? "Hide solution" : "Show solution"}
        </Button>
      </div>
    </>
  );
}

/** Back to the training setup, from the header of a running training. */
function ChangeTraining() {
  return <Button action="trainingSetup" icon="IconBack" className="control icon-only" title="Change what to train" />;
}

function Times({ closable = true }: { closable?: boolean }) {
  const training = s.practicePage() === "training",
    extremes = sessionExtremes();
  return (
    <div className="panel column-content times-panel">
      <div className="column-head panel-head">
        <strong>{training ? "Session" : "Times"}</strong>
        <span className="mono muted">{s.solves.length}</span>
        <span className="column-head-actions">
          {training && !!s.solves.length && <Button action="undo" className="control small">Undo</Button>}
          {closable && <Button action="times" icon="IconClose" className="control small icon-only" title="Close" />}
        </span>
      </div>
      {training ? (
        <div className="scroll times-list">
          {trainingSessionRows<any, any>(
            s.cases().filter((c: any) => s.practiceSelected.has(c.id) || s.solves.some((v) => v.case_id === c.id)),
            s.solves,
          ).map(({ c, solves, best: fastest, mean: average, validCount }) => (
            <div key={c.id} className="session-case">
              <div className="session-picture">
                <Diagram c={c} size={40} />
                <span>{shortId(c)}</span>
              </div>
              <div className="session-values">
                {!solves.length ? (
                  <span className="muted">—</span>
                ) : (
                  <>
                    {validCount > 1 && <small className="mono muted">mean {fmtTime(average)}</small>}
                    <div className="row wrap">
                      {[...solves].reverse().map((v) => (
                        <Button
                          key={v.id}
                          action={"solve:" + v.id}
                          className={
                            "time-badge mono " +
                            (v.penalty === "dnf" ? "is-dnf" : effective(v.time_ms, v.penalty) === fastest ? "is-best" : "")
                          }
                        >
                          {fmtSolve(v.time_ms, v.penalty)}
                          {v.comment && <Icon name="IconComment" size={11} />}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="scroll times-list">
            {!s.solves.length && <div className="column-empty">No solves in this session yet.</div>}
            {[...s.solves].reverse().map((v, i) => (
              <div key={v.id} className={"times-row" + (v.id === extremes.best ? " is-best" : v.id === extremes.worst ? " is-worst" : "")}>
                <span className="mono muted">{s.solves.length - i}</span>
                <span className={"mono times-value " + (v.penalty === "dnf" ? "danger" : "")}>
                  {fmtSolve(v.time_ms, v.penalty)}
                  {v.comment && <Icon name="IconComment" size={11} />}
                </span>
                <span className="times-actions">
                  <Button action={"penalty:" + v.id + ":+2"} active={v.penalty === "+2"} className="times-action" title="+2">
                    +2
                  </Button>
                  <Button action={"penalty:" + v.id + ":dnf"} active={v.penalty === "dnf"} className="times-action" title="DNF">
                    DNF
                  </Button>
                  <Button action={"delete:" + v.id} icon="IconTrash" className="times-action icon-only danger-hover" title="Delete this solve" />
                  <Button action={"solve:" + v.id} icon="IconInfo" className="times-action icon-only" title="Scramble and details" />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The session's fastest and slowest solves (a DNF is the slowest), once there are two. */
function sessionExtremes() {
  if (s.solves.length < 2) return {};
  const ranked = [...s.solves].sort((a, b) => (effective(a.time_ms, a.penalty) ?? Infinity) - (effective(b.time_ms, b.penalty) ?? Infinity));
  return { best: ranked[0].id, worst: ranked[ranked.length - 1].id };
}

/**
 * The current average of five as it is counted: the last five solves, the fastest and the slowest of them dropped
 * (in brackets), the newest last. Empty slots until there are five.
 */
function AverageWindow() {
  const last = s.solves.slice(-5),
    times = last.map((v) => effective(v.time_ms, v.penalty) ?? Infinity),
    full = last.length === 5,
    fastest = full ? times.indexOf(Math.min(...times)) : -1,
    slowest = full ? times.lastIndexOf(Math.max(...times)) : -1;
  return (
    <div className="average-window mono" aria-label="Current average of 5">
      <span className="average-label">Ao5</span>
      {Array.from({ length: 5 }, (_, i) => {
        const v = last[i - (5 - last.length)];
        if (!v) return <span key={i} className="slot empty">–</span>;
        const index = i - (5 - last.length),
          dropped = index === fastest || index === slowest;
        return (
          <span key={v.id} className={"slot" + (dropped ? " dropped" : "") + (index === last.length - 1 ? " newest" : "")}>
            {dropped ? `(${fmtSolve(v.time_ms, v.penalty)})` : fmtSolve(v.time_ms, v.penalty)}
          </span>
        );
      })}
    </div>
  );
}
