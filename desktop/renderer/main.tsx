import { trainingSessionRows } from "../../src/client/lib/practiceSummary";
import { catalogSections } from "../../src/client/lib/practiceCatalog";
import { PracticeTimer } from "../../src/client/lib/practiceTimer";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { store as s, catalog, matches } from "./store";
import { call } from "./bridge";
import { accents, theme } from "./theme";
import { Cube } from "./Cube";
import {
  fmtTime,
  fmtSolve,
  parseTypedTime,
  effective,
} from "../../src/client/lib/format";
import { GuideContent } from "../guides/Content";
import { GUIDES, type Guide } from "../guides/pages";
import "./styles.css";
type Props = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="icon"
      style={{
        width: size,
        height: size,
        maskImage: `url(../assets/icons/${name}.svg)`,
      }}
    />
  );
}
function Button({
  action,
  children,
  active = false,
  icon,
  className = "",
  style,
  title,
  disabled = false,
}: {
  action: string;
  active?: boolean;
  icon?: string;
  title?: string;
  disabled?: boolean;
} & Props) {
  return (
    <button
      type="button"
      data-action={action}
      title={title ?? (typeof children === "string" ? children : action)}
      aria-label={title ?? (typeof children === "string" ? children : action)}
      className={`button ${active ? "active" : ""} ${className}`}
      style={style}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {icon && <Icon name={icon} />} {children}
    </button>
  );
}
function Row({ children, className = "", style }: Props) {
  return (
    <div className={"row " + className} style={style}>
      {children}
    </div>
  );
}
function Heading({ children }: Props) {
  return <div className="heading">{children}</div>;
}
function Empty({ children }: Props) {
  return <div className="empty">{children}</div>;
}
function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="mono value">{value}</div>
    </div>
  );
}
function Diagram({ c, size = 96 }: { c: any; size?: number }) {
  if (!c) return null;
  return c.cube ? (
    <Cube scene={c.cube} size={size} animated={false} />
  ) : (
    <img
      className="diagram"
      src={"../assets/" + c.asset}
      width={size}
      height={size}
      alt={c.id}
    />
  );
}
function Learned({ id }: { id: string }) {
  return (
    <Button
      action={"learn:" + id}
      className={"learned " + (s.learned.has(id) ? "yes" : "")}
      icon={s.learned.has(id) ? "IconCheck" : undefined}
    >
      {s.learned.has(id) ? "Learned" : "To learn"}
    </Button>
  );
}
function Alg({ text, size = 18 }: { text: string; size?: number }) {
  return (
    <div className="alg mono" style={{ fontSize: size }}>
      {text?.split(/\s+/).map((word, i) => (
        <span key={i} className={/[()\[\]]/.test(word) ? "muted" : ""}>
          {word}
        </span>
      ))}
    </div>
  );
}
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-shell">
        <Button
          action="menu:puzzles"
          className="puzzle-button"
          icon={"Puzzle" + s.puzzle}
        >
          <span className="desktop-label">{s.label("puzzles", s.puzzle)}</span>
          <Icon name="IconChevronDown" size={12} />
        </Button>
      </div>
      <div className="nav-shell nav-tabs">
        {[
          ["playground", "Timer", "IconCube"],
          ["algorithms", "Algorithms", "IconGrid"],
          ["training", "Training", "IconTimer"],
          ["profile", "Account", "IconUser"],
        ].map(([page, label, icon]) => (
          <Button
            key={page}
            action={"nav:" + page}
            title={label}
            className={s.page === page ? "selected" : "unselected"}
            icon={page === "profile" && !s.user.isGuest ? undefined : icon}
          >
            {page === "profile" && !s.user.isGuest && (
              <Avatar user={s.user} size={20} />
            )}{" "}
            {s.page === page ? label : null}
          </Button>
        ))}
      </div>
    </nav>
  );
}
function Avatar({ user, size = 60 }: { user: any; size?: number }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {user?.username?.slice(0, 2).toUpperCase()}
    </div>
  );
}
function useViewport() {
  const [v, set] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const resize = () => set({ w: innerWidth, h: innerHeight });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  return v;
}
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
    };
  }, []);
  return { phase, elapsed, press, release };
}
function Practice() {
  const { w, h } = useViewport(),
    training = s.page === "training",
    wide = w >= 1024 && h >= 600,
    rail = Math.max(220, Math.min(280, Math.min(w - 96, 1200) / 4.28)),
    centerWidth = w - (wide ? rail * 2 + 96 : 28),
    font =
      w <= 700
        ? Math.max(56, Math.min(84, w * 0.15))
        : Math.max(60, Math.min(108, w * 0.07)),
    gap = Math.max(14, Math.min(28, h * 0.026));
  let timerTop = h / 2 - (font * 1.1) / 2 - 38;
  const timerHeight = font * 1.1 + 120,
    enabled =
      !s.saving &&
      !s.generating &&
      !s.error &&
      (!training || !!s.selected.size),
    timer = useTimer(enabled),
    typing = !training && s.entry === "typing";
  const [typed, setTyped] = useState("");
  const typedRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTyped("");
    if (typing && !s.overlay) typedRef.current?.focus();
  }, [typing, s.overlay, s.timerEpoch]);
  const c = training ? s.find(s.training?.id) : null,
    cubeSize = training ? 0 : s.info()?.cubeSize,
    hasCube = training ? c && !c.flat && !c.diagram : !!cubeSize,
    small = h < 700,
    setupFont = small ? 16 : 19,
    algoFont = small ? 15 : 17,
    minText = setupFont * 3.2 + (s.revealed ? algoFont * 3.2 : 0),
    fixed = 42 + 31 + (s.revealed ? 71 : 40) + 8;
  const previewSize = training
    ? Math.max(56, Math.min(150, timerTop - gap - fixed - minText))
    : h < 700
      ? 96
      : 156;
  if (training && c) {
    const overflow = gap + fixed + previewSize + minText - timerTop;
    if (overflow > 0)
      timerTop += Math.min(
        overflow,
        Math.max(0, h - 118 - (timerTop + timerHeight + gap + 64)),
      );
  }
  const textBudget = Math.max(minText, timerTop - gap - fixed - previewSize),
    setupHeight = s.revealed
      ? (textBudget * setupFont) / (setupFont + algoFont)
      : textBudget;
  const hint = !enabled
    ? "Select cases to begin"
    : timer.phase === "Holding"
      ? "Keep holding…"
      : timer.phase === "Ready"
        ? "Release to start"
        : timer.phase === "Running"
          ? w <= 700
            ? "Tap to stop"
            : "Any key to stop"
          : `${!training && s.entry === "casual" ? "Not saved · " : ""}${w <= 700 ? "Hold, then release to start" : "Hold Space, release to start"}`;
  const last = s.solves.find((v) => v.id === s.lastSolve);
  return (
    <div
      className={"practice " + (timer.phase === "Running" ? "running" : "")}
      style={
        {
          "--timer-top": timerTop + "px",
          "--gap": gap + "px",
          "--rail": rail + "px",
        } as React.CSSProperties
      }
    >
      <div
        className="practice-center"
        style={{ width: centerWidth, left: (w - centerWidth) / 2 }}
      >
        {s.notice && (
          <div className="notice">
            <Icon name={training ? "IconCheck" : "IconTrophy"} />
            {s.notice}
          </div>
        )}
        <div className="practice-above" style={{ bottom: h - timerTop + gap }}>
          {training ? (
            c && s.selected.size ? (
              <>
                <Row className="case-caption">
                  <Button action="previous" icon="IconBack" />
                  <Button action={"case:" + c.id} className="case-title">
                    {c.name}
                  </Button>
                  <span className="muted case-kind">
                    {c.setLabel}
                    {c.group && c.group !== c.setLabel ? " · " + c.group : ""}
                  </span>
                  <Button action="next" icon="IconChevronRight" />
                </Row>
                <div className="practice-alg">
                  <Heading>Setup</Heading>
                  <div style={{ maxHeight: setupHeight }}>
                    <Alg text={s.training.setup} size={setupFont} />
                  </div>
                </div>
                {s.revealed && (
                  <div className="practice-alg">
                    <Heading>Algorithm</Heading>
                    <div style={{ maxHeight: textBudget - setupHeight }}>
                      <Alg text={s.training.algorithm} size={algoFont} />
                    </div>
                  </div>
                )}
                <Button action="solution">
                  {s.revealed ? "Hide solution" : "Show solution"}
                  <Icon name="IconEye" size={14} />
                </Button>
                {hasCube ? (
                  <Cube
                    setup={s.training.setup}
                    cubeSize={c.cube_size ?? 3}
                    mask={maskForStage(c.stage)}
                    size={previewSize}
                    replay={s.replay}
                  />
                ) : s.training.svg ? (
                  <div
                    style={{ width: previewSize, height: previewSize }}
                    className="svg-diagram"
                    dangerouslySetInnerHTML={{ __html: s.training.svg }}
                  />
                ) : (
                  <Diagram c={c} size={previewSize} />
                )}
              </>
            ) : (
              <>
                <Icon name="IconGrid" size={34} />
                <h2>Choose your cases</h2>
                <p className="muted">Select the cases you want to practise.</p>
                <Button action="cases" active>
                  Choose cases
                </Button>
              </>
            )
          ) : (
            <>
              {hasCube && (
                <Cube
                  setup={s.scramble}
                  cubeSize={cubeSize}
                  size={previewSize}
                  replay={s.replay}
                />
              )}
              <Heading>
                {s.label("puzzles", s.puzzle)} ·{" "}
                {s.label("scrambles", s.scrambleType)}
              </Heading>
              <div
                className="scramble"
                style={{
                  maxHeight: Math.max(
                    40,
                    timerTop - gap - (hasCube ? previewSize : 0) - 48,
                  ),
                }}
              >
                {s.generating && !s.scramble ? (
                  <span className="muted">Generating…</span>
                ) : (
                  <Alg
                    text={s.scramble}
                    size={
                      !cubeSize || cubeSize > 3
                        ? Math.max(16, Math.min(20, w * 0.015))
                        : Math.max(22, Math.min(30, w * 0.022))
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>
        <div
          className={"timer " + timer.phase.toLowerCase()}
          data-phase={timer.phase}
          style={
            {
              top: timerTop,
              "--timer-font": font + "px",
            } as React.CSSProperties
          }
          onPointerDown={(e) => {
            if (e.target instanceof HTMLInputElement) return;
            if (w <= 700 || timer.phase === "Running") timer.press();
          }}
          onPointerUp={timer.release}
        >
          {typing ? (
            <input
              ref={typedRef}
              className="typed-time"
              aria-label="Time"
              placeholder="0.00"
              value={typed}
              onChange={(e) =>
                setTyped(e.target.value.replace(/[^\d.,:]/g, ""))
              }
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
            <div className="timer-digits mono">
              {(timer.phase === "Holding" || timer.phase === "Ready"
                ? "0.000"
                : fmtTime(timer.elapsed)
              )
                .split("")
                .map((ch, i) => (
                  <span key={i}>{ch}</span>
                ))}
            </div>
          )}
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
        <div
          className="practice-below"
          style={{ top: timerTop + timerHeight - 44 }}
        >
          <Row className="solve-actions">
            {last && !s.saving && (
              <>
                <Button
                  action={"delete:" + last.id}
                  icon="IconClose"
                  className="danger"
                />
                <Button
                  action={"penalty:" + last.id + ":dnf"}
                  active={last.penalty === "dnf"}
                >
                  DNF
                </Button>
                <Button
                  action={"penalty:" + last.id + ":+2"}
                  active={last.penalty === "+2"}
                  icon="IconFlag"
                >
                  +2
                </Button>
                <Button
                  action={"comment:" + last.id}
                  icon="IconComment"
                  className={last.comment ? "accent" : ""}
                />
              </>
            )}
          </Row>
          <div
            className="practice-metrics"
            style={{
              marginTop: gap,
              gap: Math.max(16, Math.min(40, w * 0.035)),
            }}
          >
            {s.metrics().map(([label, value]) => (
              <Kpi key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      </div>
      <div className="practice-toolbar">
        <Row>
          {training ? (
            <>
              {!wide && (
                <Button action="cases" active={s.showCases} icon="IconGrid">
                  Cases
                </Button>
              )}
              {c && (
                <Button
                  action={"learn:" + c.id}
                  className={s.learned.has(c.id) ? "good" : ""}
                  icon={s.learned.has(c.id) ? "IconCheck" : undefined}
                >
                  {s.learned.has(c.id) ? "Learned" : "Mark learned"}
                </Button>
              )}
              <Button
                action="auf"
                active={s.randomAuf}
                className={s.randomAuf ? "soft" : ""}
              >
                Random AUF
                <Icon name="IconShuffle" size={15} />
              </Button>
            </>
          ) : (
            <>
              {[
                ["scrambles", s.label("scrambles", s.scrambleType)],
                ["modes", s.label("solveModes", s.solveMode)],
                [
                  "entries",
                  s.entry === "typing"
                    ? "Typing"
                    : s.entry === "casual"
                      ? "Casual"
                      : "Timer",
                ],
              ].map(([key, label]) => (
                <Button key={key} action={"menu:" + key}>
                  {label}
                  <Icon name="IconChevronDown" size={12} />
                </Button>
              ))}
            </>
          )}
        </Row>
        <Row>
          {hasCube && (
            <Button action="replayCube">
              Replay
              <Icon name="IconUndo" size={15} />
            </Button>
          )}
          {!training && (
            <Button action="next" icon="IconShuffle">
              New scramble
            </Button>
          )}
          <Button action="times" active={s.showTimes} icon="IconTimer">
            Times
          </Button>
        </Row>
      </div>
      {wide ? (
        <>
          {training && (
            <aside className="rail left">
              {s.showCases ? (
                <Selector />
              ) : (
                <Button action="cases" icon="IconGrid">
                  Cases
                </Button>
              )}
            </aside>
          )}
          {s.showTimes && (
            <aside className="rail right">
              <Times />
            </aside>
          )}
        </>
      ) : (
        ((s.showCases && training) || s.showTimes) && (
          <div
            className="sheet-backdrop"
            onClick={() => {
              s.showCases = s.showTimes = false;
              s.emit();
            }}
          >
            <aside className="sheet" onClick={(e) => e.stopPropagation()}>
              {s.showTimes ? <Times /> : <Selector />}
            </aside>
          </div>
        )
      )}
    </div>
  );
}
function Times() {
  const training = s.page === "training";
  return (
    <div className="rail-content">
      <Row className="between rail-title">
        <strong>{training ? "Session" : "Times"}</strong>
        <Button action="times" icon="IconClose" />
      </Row>
      <Row className="between muted times-count">
        <span>{s.solves.length} solves</span>
        {training && <Button action="undo">Undo</Button>}
      </Row>
      <div className="scroll times-list">
        {training
          ? trainingSessionRows<any, any>(
              s.cases().filter((c: any) => s.selected.has(c.id) || s.solves.some(v => v.case_id === c.id)),
              s.solves,
            ).map(({ c, solves, best: fastest, mean: average, validCount }) => {
                return (
                  <Row key={c.id} className="session-case">
                    <div className="session-picture">
                      <Diagram c={c} size={44} />
                      <span>{shortId(c)}</span>
                    </div>
                    <div className="session-values">
                      {!solves.length ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          {validCount > 1 && (
                            <small className="mono muted">
                              mean {fmtTime(average)}
                            </small>
                          )}
                          <Row className="wrap">
                            {[...solves].reverse().map((v) => (
                              <Button
                                key={v.id}
                                action={"solve:" + v.id}
                                className={
                                  "time-badge mono " +
                                  (v.penalty === "dnf"
                                    ? "danger"
                                    : effective(v.time_ms, v.penalty) ===
                                        fastest
                                      ? "soft"
                                      : "")
                                }
                              >
                                {fmtSolve(v.time_ms, v.penalty)}
                                {v.comment && (
                                  <Icon name="IconComment" size={11} />
                                )}
                              </Button>
                            ))}
                          </Row>
                        </>
                      )}
                    </div>
                  </Row>
                );
              })
          : [...s.solves].reverse().map((v, i) => (
              <Button key={v.id} action={"solve:" + v.id} className="time-row">
                <span className="muted">{s.solves.length - i}</span>
                <span
                  className={"mono " + (v.penalty === "dnf" ? "danger" : "")}
                >
                  {fmtSolve(v.time_ms, v.penalty)}
                </span>
                {v.comment && <Icon name="IconComment" size={12} />}
              </Button>
            ))}
      </div>
    </div>
  );
}
function Selector() {
  const cases = s.cases();
  return (
    <div className="rail-content">
      <Row className="between rail-title">
        <strong>Cases</strong>
        <Button action="cases" icon="IconClose" />
      </Row>
      <Row className="between">
        <span className="muted">{s.selected.size} selected</span>
        <Button action="clear">Clear</Button>
      </Row>
      <input
        placeholder="Search cases…"
        aria-label="Search cases"
        value={s.query}
        onChange={(e) => {
          s.query = e.target.value;
          s.emit();
        }}
      />
      <div className="scroll">
        {s.allSets().map((set: any) => {
          const all = cases.filter((c: any) => c.set === set.id),
            chosen = all.filter((c: any) => matches(c, s.query)),
            count = chosen.filter((c: any) => s.selected.has(c.id)).length,
            open = s.selectorOpen[set.id] ?? (count > 0 || !!s.query);
          if (!chosen.length) return null;
          const groups = [
            ...new Set(chosen.map((c: any) => c.group)),
          ] as string[];
          return (
            <section key={set.id} className="selector-set">
              <Heading>{set.stage}</Heading>
              <Row>
                <Button action={"selectSet:" + set.id} className="check-button">
                  <span className={"checkbox " + (count ? "checked" : "")}>
                    {count ? (count === chosen.length ? "✓" : "−") : ""}
                  </span>
                </Button>
                <Button
                  action={"selectorToggle:" + set.id}
                  className="selector-title"
                >
                  {set.label}
                  <span className="mono muted">
                    {count}/{chosen.length}
                  </span>
                  <Icon name={open ? "IconMinus" : "IconPlus"} size={14} />
                </Button>
              </Row>
              {open &&
                groups.map((group) => (
                  <React.Fragment key={group}>
                    {groups.length > 1 && (
                      <Button
                        action={"selectGroup:" + set.id + ":" + group}
                        className="selector-group"
                      >
                        {group}
                        <span className="mono muted">
                          {
                            chosen.filter(
                              (c: any) =>
                                c.group === group && s.selected.has(c.id),
                            ).length
                          }
                          /{chosen.filter((c: any) => c.group === group).length}
                        </span>
                      </Button>
                    )}
                    <div className="selector-grid">
                      {chosen
                        .filter((c: any) => c.group === group)
                        .map((c: any) => (
                          <Button
                            key={c.id}
                            action={"select:" + c.id}
                            className={
                              "selector-tile " +
                              (s.selected.has(c.id) ? "soft" : "")
                            }
                          >
                            <Diagram c={c} size={58} />
                            <span>
                              {shortId(c)}
                            </span>
                            {s.selected.has(c.id) && (
                              <span className="selected-check">✓</span>
                            )}
                          </Button>
                        ))}
                    </div>
                  </React.Fragment>
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
function useScrollPosition(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTop = s.scrollPositions.get(key) ?? 0;
    const save = () => s.scrollPositions.set(key, element.scrollTop);
    element.addEventListener("scroll", save);
    return () => element.removeEventListener("scroll", save);
  }, [key]);
  return ref;
}
function Catalog() {
  const scroll = useScrollPosition(`catalog:${s.puzzle}`);
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, s.learningFilter);
  const stages = sections.map(section => section.stage);
  const learned = sections.reduce((sum, section) => sum + section.learnedCount, 0);
  const total = sections.reduce((sum, section) => sum + section.all.length, 0);
  return (
    <div className="page catalog-page">
      <Row className="wrap catalog-toolbar">
        <Row>
          {stages.map((stage) => (
            <Button
              key={stage}
              action={"stage:" + stage}
              active={(s.catalogStage || stages[0]) === stage}
            >
              {stage}
            </Button>
          ))}
        </Row>
        <Row>
          <Button
            action="learningFilter:learned"
            active={s.learningFilter === "learned"}
          >
            Learned <span className="mono">{learned}</span>
          </Button>
          <Button
            action="learningFilter:not-learned"
            active={s.learningFilter === "not-learned"}
          >
            Not learned <span className="mono">{total - learned}</span>
          </Button>
        </Row>
      </Row>
      <div ref={scroll} className="scroll catalog-scroll">
        {sections.map(({ stage, active: set, variants, groups }) => {
          return (
            <section
              id={"stage-" + stage}
              key={stage}
              className="catalog-stage"
            >
              <Row className="between wrap stage-title">
                <h2>{stage}</h2>
                <Row>
                  {variants.map((v: any) => (
                      <Button
                        key={v.id}
                        action={"set:" + v.id}
                        active={v.id === set.id}
                      >
                        {v.label.startsWith(stage + " ")
                          ? v.label.slice(stage.length + 1)
                          : v.label}
                        <span className="mono muted">{v.count}</span>
                      </Button>
                    ))}
                </Row>
              </Row>
              {!groups.length && (
                <Empty>
                  {s.learningFilter === "learned"
                    ? "No learned cases in this set yet."
                    : "No not learned cases in this set."}
                </Empty>
              )}
              {groups.map(([group, members]) => {
                const key = set.id + ":" + group;
                return (
                  <section key={group} className="catalog-group">
                    <Row className="between group-title">
                      <Button
                        action={"collapse:" + key}
                        icon={
                          s.collapsed.has(key)
                            ? "IconChevronRight"
                            : "IconChevronDown"
                        }
                      >
                        {group}
                        <small>
                          {members.length}
                        </small>
                      </Button>
                      <Button action={"train:" + key} icon="IconTimer">
                        Train all
                      </Button>
                    </Row>
                    {!s.collapsed.has(key) && (
                      <div className="catalog-grid">
                        {members.map((c: any) => {
                            const st = s.stats.find((v) => v.caseId === c.id);
                            return (
                              <div key={c.id} className="catalog-tile">
                                {st && <span className="trained-dot" />}
                                <Button
                                  action={"case:" + c.id}
                                  className="tile-open"
                                >
                                  <Diagram c={c} />
                                  <strong>
                                    {shortId(c)}
                                  </strong>
                                  {c.name !== c.id && (
                                    <span className="tile-name">{c.name}</span>
                                  )}
                                  <span className="mono muted tile-stats">
                                    {st
                                      ? `${fmtTime(st.best)} · ${fmtTime(st.mean)}`
                                      : "—"}
                                  </span>
                                </Button>
                                <Learned id={c.id} />
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </section>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
function Detail() {
  const c = s.find(s.caseId);
  if (!c) return <Empty>Case unavailable.</Empty>;
  const ids = s
      .cases()
      .filter((v: any) => v.set === c.set)
      .map((v: any) => v.id),
    index = ids.indexOf(c.id);
  return (
    <div className="page detail-page">
      <Row>
        <Button action="back" icon="IconBack">
          {c.setLabel}
        </Button>
      </Row>
      <div className="scroll detail-scroll">
        <Row className="detail-hero">
          <div className="col center">
            {c.cube ? (
              <>
                <Cube
                  setup={c.setup}
                  cubeSize={c.cube_size ?? 3}
                  mask={maskForStage(c.stage)}
                  size={180}
                  replay={s.replay}
                />
                <Button action="replayCube">
                  Replay scramble
                  <Icon name="IconUndo" size={14} />
                </Button>
              </>
            ) : (
              <Diagram c={c} size={150} />
            )}
          </div>
          <div className="col">
            <h1>{c.id}</h1>
            {c.name !== c.id && <p>{c.name}</p>}
            <small className="muted">{c.group}</small>
            <Button action={"learn:" + c.id} className="good">
              {s.learned.has(c.id) ? "Learned" : "To learn"}
            </Button>
          </div>
        </Row>
        <section>
          <Heading>Setup</Heading>
          <Alg text={c.setup} />
          {c.notes && <p className="muted">{c.notes}</p>}
        </section>
        <section>
          <Heading>Algorithms</Heading>
          {c.algorithms.map((a: any, i: number) => (
            <Row key={i} className="algorithm-row wrap between">
              <Alg text={a.alg} />
              <Row>
                {i === 0 && <span className="badge soft">Primary</span>}
                {a.stm != null && <small className="muted">{a.stm} STM</small>}
                <small className="muted">
                  {(
                    {
                      speedcubedb: "SpeedCubeDB",
                      jperm: "J Perm",
                      f2ltrainer: "F2L Trainer",
                    } as any
                  )[a.source] ?? a.source}
                </small>
                {a.youtube && (
                  <Button action={"url:" + a.youtube}>Video</Button>
                )}
              </Row>
            </Row>
          ))}
        </section>
        <Heading>Statistics</Heading>
        <ProfileStats data={s.caseHistory} />
      </div>
      <Row className="detail-actions between">
        <Row>
          <Button
            action="caseStep:previous"
            icon="IconBack"
            disabled={index === 0}
          />
          <span className="muted">
            {index + 1} / {ids.length}
          </span>
          <Button
            action="caseStep:next"
            icon="IconChevronRight"
            disabled={index === ids.length - 1}
          />
        </Row>
        <Row>
          <Button
            action={"learn:" + c.id}
            className={s.learned.has(c.id) ? "good" : ""}
          >
            {s.learned.has(c.id) ? "Learned" : "Mark learned"}
          </Button>
          <Button action="train" icon="IconTimer" className="primary">
            Train
          </Button>
        </Row>
      </Row>
    </div>
  );
}
function Appearance() {
  return (
    <div className="appearance">
      <Row className="setting between">
        <strong>Theme</strong>
        <Row>
          <Button action="light:dark" active={!s.light}>
            Dark
          </Button>
          <Button action="light:light" active={s.light}>
            Light
          </Button>
        </Row>
      </Row>
      <Row className="setting between">
        <strong>Accent</strong>
        <Row>
          {Object.entries(accents).map(([name, color]) => (
            <Button
              key={name}
              action={"theme:" + name}
              title={name}
              className={"swatch " + (s.themeName === name ? "chosen" : "")}
              style={{ background: color }}
            />
          ))}
        </Row>
      </Row>
      <Row className="setting between">
        <strong>Help</strong>
        <Button action="help" active>
          Open the guides
        </Button>
      </Row>
    </div>
  );
}
function Account() {
  const [username, setUser] = useState(""),
    [password, setPassword] = useState("");
  return (
    <div className="page guest-page">
      <div className="scroll col">
        <h1>Account</h1>
        <p className="muted">
          Practise as a guest, or sign in to keep your times, statistics and
          achievements on every device.
        </p>
        <form
          className="col account-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (s.saving) return;
            s.saving = true;
            s.emit();
            try {
              const v = await call(
                s.login ? "login" : "register",
                username,
                password,
              );
              s.user = v.user;
              s.sessions.clear();
              setPassword("");
              await s.refresh();
            } catch (e) {
              s.fail(e);
            } finally {
              s.saving = false;
              s.emit();
            }
          }}
        >
          <Row>
            <Button action="authMode:login" active={s.login}>
              Sign in
            </Button>
            <Button action="authMode:register" active={!s.login}>
              Create account
            </Button>
          </Row>
          <p className="muted">
            {s.login
              ? "Your local times are merged into your account."
              : "An account keeps your times, statistics and achievements in sync between devices."}
          </p>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={s.login ? "current-password" : "new-password"}
              required
            />
          </label>
          {!s.login && (
            <small className="muted">
              3–24 letters, digits or underscores. Password: 10 characters or
              more.
            </small>
          )}
          <button type="submit" className="button primary" disabled={s.saving}>
            {s.saving ? "One moment…" : s.login ? "Sign in" : "Create account"}
          </button>
        </form>
        <Appearance />
      </div>
    </div>
  );
}
function ProfileStats({ data }: { data: any }) {
  if (!data?.summary?.count) return <Empty>No solves yet.</Empty>;
  const summary = data.summary,
    history = data.history ?? [];
  return (
    <div className="col stats">
      <Row className="wrap">
        {[
          ["Best", "best"],
          ["Mean", "mean"],
          ["Ao5", "ao5"],
          ["Ao12", "ao12"],
          ["Best Ao5", "bestAo5"],
          ["Best Ao12", "bestAo12"],
        ].map(([label, key]) => (
          <Kpi key={key} label={label} value={fmtTime(summary[key])} />
        ))}
      </Row>
      <Row className="between">
        <Row>
          <span className="accent">━ Single</span>
          <span style={{ color: "var(--series)" }}>━ Ao5</span>
        </Row>
        <Button action="menu:chartTable">Table</Button>
      </Row>
      <Chart data={data} />
      <Row className="between">
        <h3>Recent times</h3>
        <span className="muted">{history.length} solves</span>
      </Row>
      <div className="history-solves">
        <Row className="history-row muted">
          <span>#</span>
          <span>Time</span>
          <span>Date</span>
        </Row>
        {[...history]
          .reverse()
          .slice(0, 20)
          .map((v: any, i: number) => (
            <button
              key={v.id}
              className="button history-row"
              onClick={() => void s.action("solve:" + v.id)}
            >
              <span>{history.length - i}</span>
              <span>{v.time == null ? "DNF" : fmtTime(v.time)}</span>
              <span>{v.displayDate}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
function Chart({ data }: { data: any }) {
  const values = (data?.history ?? []).map((v: any) => v.time),
    averages = data?.ao5 ?? [],
    all = [...values, ...averages].filter((v: any) => v != null),
    low = all.length ? Math.min(...all) : 0,
    high = Math.max(low + 1, all.length ? Math.max(...all) : 1),
    range = (high - low) * 1.24,
    lo = low - (high - low) * 0.12;
  const path = (series: any[]) => {
    let pen = false;
    return series
      .map((v, i) => {
        if (v == null) {
          pen = false;
          return "";
        }
        const p = `${pen ? "L" : "M"}${44 + (i / Math.max(1, values.length - 1)) * 740} ${12 + (1 - (v - lo) / range) * 202}`;
        pen = true;
        return p;
      })
      .join(" ");
  };
  return (
    <svg
      className="chart"
      viewBox="0 0 800 240"
      preserveAspectRatio="none"
      role="img"
      aria-label="Solve times"
    >
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M44 ${12 + (i / 3) * 202} H784`}
          stroke="var(--line)"
        />
      ))}
      <path
        d={path(values)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
      />
      <path
        d={path(averages)}
        fill="none"
        stroke="var(--series)"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function Profile() {
  const p = s.profile;
  if (!p) return <Empty>Loading…</Empty>;
  const cases = s.cases(s.profilePuzzle);
  return (
    <div className="page profile-page">
      <Row className="profile-header">
        <Avatar user={p.user} />
        <div className="col">
          <h1>{p.user.username}</h1>
          <p className="muted">Joined {p.user.joined}</p>
        </div>
        <Button action="edit" active>
          {s.editing ? "Close" : "Settings"}
        </Button>
      </Row>
      <div className="scroll col">
        {s.editing && (
          <>
            <Button action="logout">Sign out</Button>
            <Appearance />
          </>
        )}
        <Row className="wrap">
          <Row>
            {[
              ["playground", "Timer"],
              ["training", "Training"],
              ["achievements", "Achievements"],
            ].map(([key, label]) => (
              <Button
                key={key}
                action={"profileMode:" + key}
                active={s.profileMode === key}
              >
                {label}
                {key === "achievements" && (
                  <span className="mono muted">
                    {s.achievements?.unlocked ?? 0}
                  </span>
                )}
              </Button>
            ))}
          </Row>
          {s.profileMode !== "achievements" && (
            <>
              <Button action="menu:profilePuzzles" active>
                {s.label("puzzles", s.profilePuzzle)}
                <Icon name="IconChevronDown" />
              </Button>
              {s.profileMode === "playground" && (
                <Button action="menu:profileScrambles" active>
                  {s.label("scrambles", s.profileScramble)}
                  <Icon name="IconChevronDown" />
                </Button>
              )}
              <Button action="menu:profileModes" active>
                {s.label("solveModes", s.profileSolveMode)}
                <Icon name="IconChevronDown" />
              </Button>
            </>
          )}
        </Row>
        <Row className="wrap profile-summary">
          {s.profileMode === "achievements" && (
            <Kpi
              label="Unlocked"
              value={`${s.achievements?.unlocked ?? 0} / ${s.achievements?.total ?? 0}`}
            />
          )}
          <Kpi label="Solves" value={p.totalSolves ?? 0} />
          {s.profileMode !== "achievements" && (
            <>
              <Kpi label="Training" value={p.trainingSolves ?? 0} />
              <Kpi label="Cases" value={p.cases?.length ?? 0} />
            </>
          )}
          <Kpi label="Active days" value={p.activeDays ?? 0} />
        </Row>
        {s.profileMode === "achievements" ? (
          <Achievements />
        ) : s.profileMode === "training" ? (
          <>
            <Row className="wrap">
              {["all", ...new Set(cases.map((c: any) => c.stage))].map(
                (stage) => (
                  <Button
                    key={stage as string}
                    action={"profileStage:" + stage}
                    active={s.profileStage === stage}
                  >
                    {stage === "all" ? "All" : (stage as string)}
                  </Button>
                ),
              )}
              <input
                placeholder="Search cases…"
                value={s.query}
                onChange={(e) => {
                  s.query = e.target.value;
                  s.emit();
                }}
              />
              <small className="muted">
                {p.cases?.length ?? 0} / {cases.length} trained
              </small>
            </Row>
            {s.allSets(s.profilePuzzle).map((set: any) => {
              const chosen = cases.filter(
                (c: any) =>
                  c.set === set.id &&
                  (s.profileStage === "all" || s.profileStage === c.stage) &&
                  matches(c, s.query),
              );
              if (!chosen.length) return null;
              const key = "profile:" + set.id;
              return (
                <section key={key}>
                  <Button
                    action={"collapse:" + key}
                    className="profile-set-title"
                  >
                    {set.label}
                  </Button>
                  {!s.collapsed.has(key) && (
                    <div className="profile-grid">
                      {chosen.map((c: any) => {
                        const st = p.cases?.find(
                          (v: any) => v.summary?.caseId === c.id,
                        );
                        return (
                          <Button
                            key={c.id}
                            action={"profileCase:" + c.id}
                            className={
                              "profile-tile " + (st ? "" : "untrained")
                            }
                          >
                            <Diagram c={c} size={72} />
                            <strong>
                              {shortId(c)}
                            </strong>
                            <small className="mono accent">
                              {st ? fmtTime(st.summary.best) : "—"}
                            </small>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        ) : (
          <ProfileStats data={p.playground} />
        )}
      </div>
    </div>
  );
}
function Achievements() {
  const items = s.achievements?.achievements ?? [],
    groups = [...new Set(items.map((a: any) => a.group))] as string[];
  let shown = 0;
  return (
    <>
      <Row className="wrap">
        <Button action="menu:achievementGroups" active>
          {s.achievementGroup === "all" ? "All puzzles" : s.achievementGroup}
          <Icon name="IconChevronDown" />
        </Button>
        {["all", "unlocked", "locked"].map((f) => (
          <Button
            key={f}
            action={"achievementFilter:" + f}
            active={s.achievementFilter === f}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </Row>
      {groups
        .filter(
          (group) =>
            s.achievementGroup === "all" || s.achievementGroup === group,
        )
        .map((group) => {
          const members = items.filter((a: any) => a.group === group),
            visible = members.filter(
              (a: any) =>
                s.achievementFilter === "all" ||
                a.unlocked === (s.achievementFilter === "unlocked"),
            );
          shown += visible.length;
          if (!visible.length) return null;
          return (
            <section className="achievement-group" key={group}>
              <Row className="achievement-heading">
                <Icon
                  name={
                    members[0].puzzle
                      ? "Puzzle" + members[0].puzzle
                      : "IconTrophy"
                  }
                  size={18}
                />
                <strong>{group}</strong>
                <small className="mono muted">
                  {members.filter((a: any) => a.unlocked).length} /{" "}
                  {members.length}
                </small>
              </Row>
              {visible.map((a: any) => (
                <Row
                  key={a.id}
                  className={
                    "achievement-row " + (a.unlocked ? "unlocked" : "")
                  }
                >
                  <div className="achievement-icon">
                    <Icon
                      name={a.unlocked ? "IconTrophy" : "IconLock"}
                      size={18}
                    />
                  </div>
                  <div className="col">
                    <Row className="between">
                      <strong>{a.title}</strong>
                      <span className="mono muted">
                        {a.unlockedDate ?? a.detail}
                      </span>
                    </Row>
                    <p className="muted">{a.description}</p>
                    <div className="progress">
                      <div
                        style={{
                          width: Math.max(0, Math.min(1, a.ratio)) * 100 + "%",
                        }}
                      />
                    </div>
                  </div>
                </Row>
              ))}
            </section>
          );
        })}
      {!shown && (
        <Empty>
          {s.achievementFilter === "unlocked"
            ? "Nothing unlocked here yet. Keep practising!"
            : "Everything here is unlocked."}
        </Empty>
      )}
    </>
  );
}
function Guides() {
  return (
    <div className="guides">
      <div className="scroll">
        <header className="guide-header">
          <Button action="nav:playground">CUBIX</Button>
          <Button action="nav:playground" className="primary">
            Open cube timer
          </Button>
        </header>
        <article
          className="guide-content"
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            if (!a) return;
            e.preventDefault();
            const href = a.getAttribute("href") ?? "",
              entry = Object.entries(GUIDES).find(([, v]) => v.path === href);
            if (entry) void s.action("nav:" + entry[0]);
            else if (href.startsWith("http")) void window.cubix.open(href);
            else
              void s.action(
                "nav:" +
                  (href === "/training/"
                    ? "training"
                    : href === "/algorithms/"
                      ? "algorithms"
                      : "playground"),
              );
          }}
        >
          <GuideContent page={s.page as Guide} />
        </article>
      </div>
    </div>
  );
}
function options(): { action: string; values: any[]; current: string } {
  const info = s.info(),
    profile = s.info(s.profilePuzzle);
  switch (s.overlay) {
    case "puzzles":
      return {
        action: "puzzle",
        values: catalog.puzzles.puzzles,
        current: s.puzzle,
      };
    case "profilePuzzles":
      return {
        action: "profilePuzzle",
        values: catalog.puzzles.puzzles,
        current: s.profilePuzzle,
      };
    case "modes":
    case "profileModes":
      return {
        action: s.overlay === "modes" ? "mode" : "profileSolveMode",
        values: catalog.puzzles.solveModes.filter(
          (v: any) =>
            !v.puzzles ||
            v.puzzles.includes(
              s.overlay === "modes" ? s.puzzle : s.profilePuzzle,
            ),
        ),
        current: s.overlay === "modes" ? s.solveMode : s.profileSolveMode,
      };
    case "scrambles":
    case "profileScrambles":
      return {
        action: s.overlay === "scrambles" ? "scrambleType" : "profileScramble",
        values: catalog.puzzles.scrambles.filter((v: any) =>
          (s.overlay === "scrambles" ? info : profile).scrambles.includes(v.id),
        ),
        current: s.overlay === "scrambles" ? s.scrambleType : s.profileScramble,
      };
    case "entries":
      return {
        action: "entry",
        values: [
          { id: "timer", label: "Timer" },
          { id: "typing", label: "Typing" },
          { id: "casual", label: "Casual" },
        ],
        current: s.entry,
      };
    case "achievementGroups":
      return {
        action: "achievementGroup",
        values: [
          { id: "all", label: "All puzzles" },
          ...[
            ...new Set(
              (s.achievements?.achievements ?? s.achievements?.items ?? []).map(
                (v: any) => v.group,
              ),
            ),
          ].map((id) => ({ id, label: id })),
        ],
        current: s.achievementGroup,
      };
    default:
      return { action: "", values: [], current: "" };
  }
}
function Overlay() {
  const menu = options(),
    ref = useRef<HTMLDivElement>(null),
    [comment, setComment] = useState(s.overlaySolve?.comment ?? ""),
    [index, setIndex] = useState(
      Math.max(
        0,
        menu.values.findIndex((v) => v.id === menu.current),
      ),
    );
  const results = s
    .cases()
    .filter((c: any) => matches(c, s.search))
    .slice(0, 50);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const count =
        menu.values.length || (s.overlay === "search" ? results.length : 0);
      if (e.key === "Escape") {
        s.overlay = "";
        s.emit();
        return;
      }
      if (!count) return;
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        setIndex((i) =>
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? count - 1
              : (i + (e.key === "ArrowDown" ? 1 : -1) + count) % count,
        );
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (menu.values.length)
          void s.action(menu.action + ":" + menu.values[index].id);
        else if (results[index]) void s.action("case:" + results[index].id);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [index, menu, results]);
  useLayoutEffect(() => {
    ref.current
      ?.querySelector('[data-focused="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const close = () => {
    s.overlay = "";
    s.emit();
  };
  if (menu.values.length) {
    const anchor = s.anchor,
      left = Math.min(
        innerWidth - 292,
        Math.max(12, anchor?.x ?? (innerWidth - 280) / 2),
      ),
      height = Math.min(menu.values.length * 42 + 16, innerHeight - 32),
      top = anchor
        ? Math.max(12, anchor.y - height - 8)
        : Math.max(12, (innerHeight - height) / 2);
    return (
      <div className="menu-backdrop" onClick={close}>
        <div
          className="select-menu"
          ref={ref}
          role="listbox"
          style={{ left, top, maxHeight: height }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.values.map((v, i) => (
            <button
              key={v.id}
              role="option"
              aria-selected={v.id === menu.current}
              data-focused={index === i}
              className={"button menu-option " + (index === i ? "active" : "")}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void s.action(menu.action + ":" + v.id)}
            >
              {menu.action.toLowerCase().includes("puzzle") && (
                <Icon name={"Puzzle" + v.id} size={22} />
              )}
              <span>{v.label}</span>
              {v.id === menu.current && <Icon name="IconCheck" />}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const solve = s.overlaySolve;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        ref={ref}
        className={"modal " + (s.overlay === "search" ? "search-modal" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        <Row className="between">
          <h2>
            {s.overlay === "search"
              ? "Search cases"
              : s.overlay === "comment"
                ? "Comment"
                : s.overlay === "profileCase"
                  ? s.caseId
                  : "Solve"}
          </h2>
          <Button action="close" icon="IconClose" />
        </Row>
        {s.overlay === "search" ? (
          <>
            <input
              autoFocus
              placeholder="Search a case: oll fish, pll t, f2l 6…"
              value={s.search}
              onChange={(e) => {
                s.search = e.target.value;
                setIndex(0);
                s.emit();
              }}
            />
            <div className="scroll">
              {results.map((c: any, i: number) => (
                <button
                  key={c.id}
                  data-focused={i === index}
                  className={
                    "button search-result " + (i === index ? "active" : "")
                  }
                  onClick={() => void s.action("case:" + c.id)}
                >
                  <Diagram c={c} size={44} />
                  <div className="col">
                    <strong>
                      {c.id} · {c.name}
                    </strong>
                    <small className="muted">
                      {c.setLabel} · {c.group}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : s.overlay === "chartTable" ? (
          <div className="scroll">
            <ProfileStats
              data={s.caseId ? s.caseHistory : s.profile?.playground}
            />
          </div>
        ) : s.overlay === "profileCase" ? (
          <ProfileStats data={s.caseHistory} />
        ) : s.overlay === "comment" ? (
          <form
            className="col"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await call("setComment", solve.id, comment);
                close();
                await s.refresh();
              } catch (e) {
                s.fail(e);
              }
            }}
          >
            <textarea
              autoFocus
              placeholder="What happened on this solve?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button className="button primary" type="submit">
              Save
            </button>
          </form>
        ) : (
          solve && (
            <>
              <div className="solve-large mono">
                {fmtSolve(solve.time_ms, solve.penalty)}
              </div>
              <p className="muted">{solve.displayDate}</p>
              <Alg text={solve.scramble} size={15} />
              {solve.comment && <p>{solve.comment}</p>}
              <Row className="wrap">
                <Button
                  action={"penalty:" + solve.id + ":+2"}
                  active={solve.penalty === "+2"}
                >
                  +2
                </Button>
                <Button
                  action={"penalty:" + solve.id + ":dnf"}
                  active={solve.penalty === "dnf"}
                >
                  DNF
                </Button>
                <Button action={"comment:" + solve.id} icon="IconComment">
                  Comment
                </Button>
                <Button
                  action={"delete:" + solve.id}
                  className="danger"
                  icon="IconTrash"
                >
                  Delete
                </Button>
              </Row>
            </>
          )
        )}
      </div>
    </div>
  );
}
function App() {
  useSyncExternalStore(s.subscribe, () => s.version);
  useEffect(() => {
    void s.init();
    const unsubscribe = window.cubix.onEvent((event) => {
      if (event.event === "changed") void s.refresh();
      else if (event.event === "sync") {
        s.sync = event.value;
        s.emit();
      } else if (event.event === "error") s.fail(event.value);
      else if (event.event === "browser-backward") s.travel();
      else if (event.event === "browser-forward") s.travel(false);
    });
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input,textarea");
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        void s.action("search");
        return;
      }
      if (typing && !e.altKey) return;
      if (e.altKey) {
        const action = (
          {
            Digit1: "nav:playground",
            Digit2: "nav:algorithms",
            Digit3: "nav:training",
            Digit4: "nav:profile",
            KeyN: "next",
            KeyP: "previous",
            KeyC: "cases",
            KeyT: "times",
            KeyA: "auf",
            KeyH: "solution",
            KeyB: "back",
            ArrowLeft: "historyBack",
            ArrowRight: "historyForward",
          } as any
        )[e.code];
        if (action) {
          e.preventDefault();
          void s.action(action);
        }
      } else if (e.key === "Escape") {
        s.overlay = "";
        if (innerWidth < 1024) s.showCases = s.showTimes = false;
        s.emit();
      } else if (
        !s.overlay &&
        s.page === "algorithms" &&
        s.caseId &&
        ["ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        void s.action(
          "caseStep:" + (e.key === "ArrowLeft" ? "previous" : "next"),
        );
      }
    };
    addEventListener("keydown", key);
    return () => {
      unsubscribe();
      removeEventListener("keydown", key);
    };
  }, []);
  const guide = s.page.endsWith("Guide");
  return (
    <main
      className={
        "app " + (s.light ? "light " : "") + (s.running ? "is-running" : "")
      }
      style={theme(s.themeName, s.light) as React.CSSProperties}
    >
      {!s.ready ? (
        <Empty>{s.error || "Loading…"}</Empty>
      ) : guide ? (
        <Guides />
      ) : ["playground", "training"].includes(s.page) ? (
        <Practice key={s.page} />
      ) : s.page === "algorithms" ? (
        s.caseId ? (
          <Detail />
        ) : (
          <Catalog />
        )
      ) : s.user.isGuest ? (
        <Account />
      ) : (
        <Profile />
      )}
      {!guide && <Nav />}
      {s.overlay && <Overlay key={s.overlay} />}{" "}
      {s.error && (
        <div role="alert" className="error">
          {s.error}
          <button
            className="button"
            onClick={() => {
              void s.retry();
            }}
          >
            Retry
          </button>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
