import { trainingModeOptions } from "../../src/client/lib/dailyLearning";
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
import { AnimatePresence, MotionConfig, motion, useIsPresent } from "motion/react";
import { store as s, catalog, matches } from "./store";
import { call } from "./bridge";
import { accents, theme } from "./theme";
import { Icon, ActionButton } from "./ui";
import { Cube } from "./Cube";
import { UpdateNotification } from "./UpdateNotification";
import { ErrorNotification } from "./ErrorNotification";
import { StartupNotification } from "./StartupNotification";
import { HistoryChart, type ChartRange } from "./HistoryChart";
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
    <ActionButton
      icon={icon}
      data-action={action}
      title={title ?? (typeof children === "string" ? children : action)}
      aria-label={title ?? (typeof children === "string" ? children : action)}
      className={`${active ? "active" : ""} ${className}`}
      style={style}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {children}
    </ActionButton>
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
const TABS: [page: string, label: string, icon: string, shortcut: string][] = [
  ["playground", "Timer", "IconCube", "Alt+1"],
  ["algorithms", "Algorithms", "IconGrid", "Alt+2"],
  ["training", "Training", "IconTimer", "Alt+3"],
  ["profile", "Account", "IconUser", "Alt+4"],
];
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-shell">
        <Button
          action="menu:puzzles"
          className="puzzle-button"
          icon={"Puzzle" + s.puzzle}
          title="Choose a puzzle"
        >
          <span className="desktop-label">{s.label("puzzles", s.puzzle)}</span>
          <Icon name="IconChevronDown" size={12} />
        </Button>
      </div>
      <div className="nav-shell nav-tabs" role="tablist" aria-label="Sections">
        {TABS.map(([page, label, icon, shortcut]) => (
          <Button
            key={page}
            action={"nav:" + page}
            title={`${label} (${shortcut})`}
            className={"nav-tab " + (s.page === page ? "selected" : "unselected")}
            icon={page === "profile" && !s.user.isGuest ? undefined : icon}
          >
            {page === "profile" && !s.user.isGuest && (
              <Avatar user={s.user} size={18} />
            )}
            <span className="nav-label">{label}</span>
          </Button>
        ))}
      </div>
      <div className="nav-shell">
        <Button
          action="settings"
          className={"nav-tab " + (s.overlay === "settings" ? "selected" : "unselected")}
          icon="IconSettings"
          title="Settings (Alt+S)"
        />
      </div>
    </nav>
  );
}
/**
 * Full-window page frame: the pages sit side by side and slide together like a carousel.
 * Animating `transform` lets Motion hand the tween to the compositor (WAAPI), so the slide
 * keeps moving even while the incoming page does its first heavy render on the main thread.
 */
const SLIDE = {
  enter: (direction: number) => ({ transform: `translateX(${direction * 100}%)` }),
  center: { transform: "translateX(0%)" },
  exit: (direction: number) => ({ transform: `translateX(${direction * -100}%)` }),
};
function Frame({ children }: Props) {
  const present = useIsPresent();
  // Commit the empty frame first so the slide starts immediately; the page mounts one frame later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <motion.div
      className="page-frame"
      data-exiting={present ? undefined : ""}
      inert={!present}
      custom={s.direction}
      variants={SLIDE}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {mounted && children}
    </motion.div>
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
function Practice() {
  useEffect(() => {
    const tick = () => { void s.refreshLearning().catch(s.fail); };
    tick();
    const interval = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(interval); window.removeEventListener("focus", tick); };
  }, []);
  const learning = s.learningMode !== "practice";
  const reviewing = s.learningMode === "review";
  const { w, h } = useViewport(),
    training = s.page === "training",
    wide = w >= 1024 && h >= 600,
    rail = Math.max(220, Math.min(280, Math.min(w - 96, 1200) / 4.28)),
    centerWidth = w - (wide ? rail * 2 + 96 : 28),
    font = Math.max(40, Math.min(w <= 700 ? 84 : 108, centerWidth * 0.15, h * 0.12)),
    gap = h < 650 ? 6 : Math.max(10, Math.min(24, h * 0.022));
  const toolbarRef = useRef<HTMLDivElement>(null);
  const aboveRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(76);
  const [aboveHeight, setAboveHeight] = useState(180);
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === toolbarRef.current) setToolbarHeight(entry.contentRect.height);
        if (entry.target === aboveRef.current) setAboveHeight(entry.contentRect.height);
      }
    });
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    if (aboveRef.current) observer.observe(aboveRef.current);
    return () => observer.disconnect();
  }, []);
  const enabled =
      !s.saving &&
      !s.generating &&
      !s.error &&
      (!training || (!!s.practiceSelected.size && s.practiceSelected.has(s.training?.id))),
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
    minText = setupFont * 1.6 + (s.revealed ? algoFont * 1.6 : 0),
    fixed = s.revealed ? 170 : 138;
  const previewBudget = aboveHeight - (training ? fixed + minText : 104),
    previewSize = (training && h <= 550) || previewBudget < 32 ? 0 : Math.min(training ? 150 : h < 700 ? 96 : 156, previewBudget),
    textBudget = Math.max(minText, aboveHeight - fixed - previewSize),
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
          "--toolbar-height": toolbarHeight + "px",
          "--gap": gap + "px",
          "--rail": rail + "px",
        } as React.CSSProperties
      }
    >
      <div
        className="practice-center"
        style={{ width: centerWidth, left: (w - centerWidth) / 2, paddingTop: s.notice ? 48 : 12 }}
      >
        {s.notice && (
          <div className="notice">
            <Icon name={training ? "IconCheck" : "IconTrophy"} />
            {s.notice}
          </div>
        )}
        <div ref={aboveRef} className={"practice-above" + (training ? " training-above" + (s.revealed ? " revealed" : "") : "")}>
          {training ? (
            c && s.practiceSelected.has(c.id) ? (
              <>
                <Row className={"case-caption" + (learning ? " daily-caption" : "")}>
                  {!learning && <Button action="previous" icon="IconBack" />}
                  <Button action={"case:" + c.id} className="case-title">
                    {c.name}
                  </Button>
                  <span className={learning ? "muted daily-status" : "muted case-kind"}>
                    {learning ? s.dailyStatus : c.setLabel + (c.group && c.group !== c.setLabel ? " · " + c.group : "")}
                  </span>
                  {!learning && <Button action="next" icon="IconChevronRight" />}
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
                {previewSize > 0 && (hasCube ? (
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
                ))}
              </>
            ) : (
              <>
                <Icon name="IconGrid" size={34} />
                <h2>{reviewing ? "No learned cases yet" : learning ? "Track complete" : "Choose your cases"}</h2>
                <p className="muted">{learning ? s.dailyStatus : "Select the cases you want to practise."}</p>
                {!learning && <Button action="cases" active>Choose cases</Button>}
              </>
            )
          ) : (
            <>
              {hasCube && previewSize > 0 && (
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
                    aboveHeight - (hasCube ? previewSize : 0) - 40,
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
        <div className="practice-below">
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
      <div className="practice-toolbar" ref={toolbarRef}>
        <Row>
          {training ? (
            <>
              {<Button action="menu:learningModes">{reviewing ? "Review learned" : learning ? `Learn ${s.learningMode}` : w <= 700 || h <= 550 ? "Practice" : "Free practice"}<Icon name="IconChevronDown" size={12} /></Button>}
              {learning && !reviewing && <Button action="menu:learningGroups" icon="IconGrid">Groups</Button>}
              {!learning && !wide && (
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
              {reviewing && <Button action="next" icon="IconChevronRight">Next</Button>}
              <Button
                action="auf"
                active={s.randomAuf}
                className={s.randomAuf ? "soft" : ""}
              >
                {w <= 700 || h <= 550 ? "AUF" : "Random AUF"}
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
          {training && !learning && (
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
        ((s.showCases && training && !learning) || s.showTimes) && (
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
              s.cases().filter((c: any) => s.practiceSelected.has(c.id) || s.solves.some(v => v.case_id === c.id)),
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
          <Button action="methods" icon="IconBook" title="Solving methods">
            Methods
          </Button>
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
        <TimerStats compact data={s.caseHistory} empty="No attempts on this case yet." />
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
function AccountForm() {
  const [username, setUser] = useState(""),
    [password, setPassword] = useState("");
  return (
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
          s.overlay = "";
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
  );
}
const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
/** The next achievement to reach, by progress. */
function nextAchievement() {
  return (s.achievements?.achievements ?? [])
    .filter((a: any) => !a.unlocked)
    .sort((a: any, b: any) => b.ratio - a.ratio)[0];
}
function Progress({ ratio, done = true }: { ratio: number; done?: boolean }) {
  return (
    <div
      className={"progress " + (done ? "unlocked" : "")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, ratio)) * 100)}
    >
      <div style={{ width: Math.max(0, Math.min(1, ratio)) * 100 + "%" }} />
    </div>
  );
}
function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.filter((v): v is number => v != null).slice(-40);
  if (points.length < 2) return null;
  const low = Math.min(...points),
    high = Math.max(low + 1, Math.max(...points));
  const d = points
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${(i / (points.length - 1)) * 100} ${2 + (1 - (v - low) / (high - low)) * 28}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
/** Labelled bars inside an overview card, e.g. one per stage or per pending goal. */
function MiniBars({
  rows,
}: {
  rows: { label: string; value: string; ratio: number; done?: boolean }[];
}) {
  if (!rows.length) return null;
  return (
    <div className="mini-bars">
      {rows.map((r) => (
        <div key={r.label} className="mini-bar">
          <span className="mini-bar-label">{r.label}</span>
          <Progress ratio={r.ratio} done={r.done ?? true} />
          <span className="mono mini-bar-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Solves per day over the last weeks, one column per week, Monday at the top. */
function ActivityHeatmap({ dates, weeks = 16 }: { dates: string[]; weeks?: number }) {
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const key = dayKey(new Date(iso));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date(),
    end = new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    offset = (end.getDay() + 6) % 7,
    start = new Date(end);
  start.setDate(end.getDate() - offset - (weeks - 1) * 7);
  const peak = Math.max(1, ...counts.values()),
    cells: { key: string; count: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    cells.push({ key, count: counts.get(key) ?? 0, future: d > end });
  }
  return (
    <div
      className="heatmap"
      role="img"
      aria-label={`Solves per day over the last ${weeks} weeks`}
      style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {cells.map((c) => (
        <span
          key={c.key}
          title={`${c.key}: ${plural(c.count, "solve")}`}
          className={"heat " + (c.future ? "future" : "")}
          style={
            c.count
              ? {
                  background: `color-mix(in srgb, var(--accent) ${30 + Math.round((c.count / peak) * 70)}%, var(--surface2))`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
/** Overview card: one headline figure, two supporting metrics and a one-line detail. */
function StatCard({
  icon,
  label,
  value,
  suffix,
  metrics,
  detail,
  progress,
  action,
  children,
}: {
  icon: string;
  label: string;
  value: string;
  suffix?: string;
  metrics: { label: string; value: string }[];
  detail: string;
  progress?: number;
  action?: string;
} & Props) {
  const inner = (
    <>
      <div className="stat-card-head">
        <span className="stat-card-icon">
          <Icon name={icon} size={15} />
        </span>
        <span className="stat-card-label">{label}</span>
        {action && <Icon name="IconChevronRight" size={14} />}
      </div>
      <div className="stat-card-body">
        <div className="stat-card-value mono">
          {value}
          {suffix && <span className="stat-card-suffix">{suffix}</span>}
        </div>
        <div className="stat-card-metrics">
          {metrics.map((m) => (
            <div key={m.label} className="stat-card-metric">
              <small className="muted">{m.label}</small>
              <span className="mono">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
      {children}
      <div className="stat-card-foot">
        <small className="muted">{detail}</small>
        {progress !== undefined && <Progress ratio={progress} />}
      </div>
    </>
  );
  const title = `${label}: ${value}${suffix ?? ""}. ${detail}`;
  return action ? (
    <button
      type="button"
      data-action={action}
      className="stat-card clickable"
      aria-label={title}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {inner}
    </button>
  ) : (
    <div className="stat-card" aria-label={title}>
      {inner}
    </div>
  );
}
function ProfileFilters({ scramble = false }: { scramble?: boolean }) {
  return (
    <Row className="profile-filters">
      <Button action="menu:profilePuzzles" active icon={"Puzzle" + s.profilePuzzle}>
        {s.label("puzzles", s.profilePuzzle)}
        <Icon name="IconChevronDown" size={12} />
      </Button>
      {scramble && (
        <Button action="menu:profileScrambles" active>
          {s.label("scrambles", s.profileScramble)}
          <Icon name="IconChevronDown" size={12} />
        </Button>
      )}
      <Button action="menu:profileModes" active>
        {s.label("solveModes", s.profileSolveMode)}
        <Icon name="IconChevronDown" size={12} />
      </Button>
    </Row>
  );
}
function Overview() {
  const p = s.profile,
    timer = p.playground?.summary ?? { count: 0 },
    cases = s.cases(s.profilePuzzle),
    learned = cases.filter((c: any) => s.learned.has(c.id)).length,
    trained = p.cases?.length ?? 0,
    unlocked = s.achievements?.unlocked ?? 0,
    total = s.achievements?.total ?? 0,
    next = nextAchievement(),
    stages = [...new Set<string>(cases.map((c: any) => c.stage))].map((stage) => {
      const members = cases.filter((c: any) => c.stage === stage),
        done = members.filter((c: any) => s.learned.has(c.id)).length;
      return { label: stage, value: `${done} / ${members.length}`, ratio: members.length ? done / members.length : 0 };
    }),
    goals = (s.achievements?.achievements ?? [])
      .filter((a: any) => !a.unlocked)
      .sort((a: any, b: any) => b.ratio - a.ratio)
      .slice(0, 3)
      .map((a: any) => ({ label: a.title, value: `${Math.round(a.ratio * 100)}%`, ratio: a.ratio })),
    activity = [
      ...(p.playground?.history ?? []).map((v: any) => v.at),
      ...(p.cases ?? []).flatMap((c: any) => (c.history ?? []).map((v: any) => v.at)),
    ].filter(Boolean);
  const latest = [timer.lastAt, ...(p.cases ?? []).map((c: any) => c.summary?.lastAt)]
    .filter((at): at is string => !!at)
    .sort()
    .at(-1);
  return (
    <div className="overview">
      {s.user.isGuest && (
        <div className="guest-banner">
          <Icon name="IconUser" size={18} />
          <div className="col">
            <strong>You are practising as a guest</strong>
            <small className="muted">
              Times stay on this device. An account syncs them between devices
              and keeps your achievements.
            </small>
          </div>
          <Row>
            <Button action="account:login">Sign in</Button>
            <Button action="account:register" className="primary">
              Create account
            </Button>
          </Row>
        </div>
      )}
      <div className="stat-grid">
        <StatCard
          icon="IconCube"
          label="Timer"
          value={timer.count ? fmtTime(timer.best) : "—"}
          metrics={[
            { label: "Ao5", value: fmtTime(timer.ao5) },
            { label: "Ao12", value: fmtTime(timer.ao12) },
            { label: "Mean", value: fmtTime(timer.mean) },
          ]}
          detail={
            timer.count
              ? `Best of ${plural(timer.count, "solve")} · ${s.label("scrambles", s.profileScramble)}`
              : "No solves in this selection yet"
          }
          action="profileMode:playground"
        >
          <Sparkline values={(p.playground?.history ?? []).map((v: any) => v.time)} />
        </StatCard>
        <StatCard
          icon="IconTimer"
          label="Training"
          value={String(trained)}
          suffix={` / ${cases.length}`}
          metrics={[
            { label: "Learned", value: String(learned) },
            { label: "Solves", value: String(p.trainingSolves ?? 0) },
          ]}
          detail={`${plural(trained, "case")} trained · ${cases.length ? Math.round((learned / cases.length) * 100) : 0}% learned`}
          progress={cases.length ? learned / cases.length : 0}
          action="profileMode:training"
        >
          <MiniBars rows={stages.slice(0, 4)} />
        </StatCard>
        <StatCard
          icon="IconTrophy"
          label="Achievements"
          value={String(unlocked)}
          suffix={` / ${total}`}
          metrics={[
            { label: "Remaining", value: String(total - unlocked) },
            { label: "Next goal", value: next ? `${Math.round(next.ratio * 100)}%` : "100%" },
          ]}
          detail={next ? `Next: ${next.title} · ${next.detail}` : "Everything unlocked"}
          progress={total ? unlocked / total : 0}
          action="profileMode:achievements"
        >
          <MiniBars rows={goals} />
        </StatCard>
        <StatCard
          icon="IconCalendar"
          label="Activity"
          value={String(p.activeDays ?? 0)}
          suffix={` ${(p.activeDays ?? 0) === 1 ? "day" : "days"}`}
          metrics={[
            { label: "Total solves", value: String(p.totalSolves ?? 0) },
            {
              label: "Per active day",
              value: p.activeDays ? (p.totalSolves / p.activeDays).toFixed(1) : "—",
            },
          ]}
          detail={latest ? `Last practice: ${shortDate(latest)}` : "No practice recorded yet"}
        >
          <ActivityHeatmap dates={activity} />
        </StatCard>
      </div>
    </div>
  );
}
function StatStrip({ summary }: { summary: any }) {
  return (
    <div className="stat-strip">
      {[
        ["Best", fmtTime(summary.best), "accent"],
        ["Ao5", fmtTime(summary.ao5), ""],
        ["Ao12", fmtTime(summary.ao12), ""],
        ["Mean", fmtTime(summary.mean), ""],
        ["Best Ao5", fmtTime(summary.bestAo5), ""],
        ["Best Ao12", fmtTime(summary.bestAo12), ""],
        ["Solves", String(summary.count), ""],
      ].map(([label, value, cls]) => (
        <div key={label} className="stat-tile">
          <small className="muted">{label}</small>
          <span className={"mono " + cls}>{value}</span>
        </div>
      ))}
    </div>
  );
}
/** Solve statistics with a shared visible period for the chart and history. */
function TimerStats({
  data,
  empty,
  compact = false,
}: {
  data: any;
  empty: React.ReactNode;
  compact?: boolean;
}) {
  if (!data?.summary?.count) return <Empty>{empty}</Empty>;
  const history = data.history ?? [];
  return <TimerStatsView key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`} data={data} compact={compact} />;
}
function TimerStatsView({ data, compact }: { data: any; compact: boolean }) {
  const history: any[] = data.history ?? [];
  const [range, setRange] = useState<ChartRange>([0, history.length - 1]);
  const rows = history.slice(range[0], range[1] + 1).reverse();
  const zoomed = range[0] > 0 || range[1] < history.length - 1;
  return (
    <div className={"stats " + (compact ? "compact" : "")}>
      <StatStrip summary={data.summary} />
      <div className="stats-grid">
        <div className="panel chart-panel">
          <Row className="between">
            <h3>Progress</h3>
            <Row className="chart-legend">
              <span className="accent">━ Single</span>
              <span style={{ color: "var(--series)" }}>━ Ao5</span>
            </Row>
          </Row>
          <HistoryChart history={history} averages={data.ao5 ?? []} range={range} onRange={setRange} />
        </div>
        <div className="panel history-panel">
          <Row className="between">
            <h3>{zoomed ? "Selected times" : "Recent times"}</h3>
            <span className="muted">{plural(rows.length, "solve")}</span>
          </Row>
          <div className="scroll history-solves" key={range.join(":")}>
            {rows.map((v: any, i: number) => {
              const index = range[1] - i,
                previous = history[index - 1],
                pb =
                  v.time != null &&
                  v.time === v.best &&
                  (!previous || previous.best == null || previous.best > v.time);
              return (
                <button
                  key={v.id}
                  className="button history-row"
                  onClick={() => void s.action("solve:" + v.id)}
                  title={v.comment || undefined}
                >
                  <span className="muted">{index + 1}</span>
                  <span className={"mono " + (v.time == null ? "muted" : "")}>
                    {v.time == null ? "DNF" : fmtTime(v.time)}
                  </span>
                  <span className="history-tags">
                    {pb && <span className="tag">PB</span>}
                    {v.penalty === "+2" && <span className="tag muted">+2</span>}
                    {v.comment && <Icon name="IconComment" size={12} />}
                  </span>
                  <span className="muted">{v.displayDate}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
function TrainingProgress() {
  const p = s.profile,
    cases = s.cases(s.profilePuzzle),
    learned = cases.filter((c: any) => s.learned.has(c.id)).length;
  return (
    <>
      <Row className="wrap profile-toolbar-row">
        <Row>
          {["all", ...new Set(cases.map((c: any) => c.stage))].map((stage) => (
            <Button
              key={stage as string}
              action={"profileStage:" + stage}
              active={s.profileStage === stage}
            >
              {stage === "all" ? "All" : (stage as string)}
            </Button>
          ))}
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
        <small className="muted">
          {p.cases?.length ?? 0} / {cases.length} trained · {learned} learned
        </small>
      </Row>
      <div className="scroll col profile-cases">
        {s.allSets(s.profilePuzzle).map((set: any) => {
          const chosen = cases.filter(
            (c: any) =>
              c.set === set.id &&
              (s.profileStage === "all" || s.profileStage === c.stage) &&
              matches(c, s.query),
          );
          if (!chosen.length) return null;
          const key = "profile:" + set.id,
            trained = chosen.filter((c: any) =>
              p.cases?.some((v: any) => v.summary?.caseId === c.id),
            ).length;
          return (
            <section key={key}>
              <Button action={"collapse:" + key} className="profile-set-title">
                <Icon
                  name={s.collapsed.has(key) ? "IconChevronRight" : "IconChevronDown"}
                  size={12}
                />
                {set.label}
                <small className="mono muted">
                  {trained} / {chosen.length}
                </small>
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
                        className={"profile-tile " + (st ? "" : "untrained")}
                      >
                        <Diagram c={c} size={72} />
                        <strong>{shortId(c)}</strong>
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
      </div>
    </>
  );
}
function Settings() {
  const guest = s.user.isGuest;
  return (
    <div className="col settings">
      <div className="panel col">
        {guest ? (
          <>
            <h3>Account</h3>
            <AccountForm />
          </>
        ) : (
          <Row className="between wrap">
            <Row>
              <Avatar user={s.user} size={44} />
              <div className="col">
                <strong>{s.user.username}</strong>
                <small className="muted">Joined {s.profile?.user?.joined}</small>
              </div>
            </Row>
            <Button action="logout">Sign out</Button>
          </Row>
        )}
      </div>
      <div className="panel col">
        <h3>Appearance</h3>
        <Appearance />
      </div>
    </div>
  );
}
const PROFILE_SECTIONS: [mode: string, label: string, icon: string][] = [
  ["overview", "Overview", "IconChart"],
  ["playground", "Timer", "IconCube"],
  ["training", "Training", "IconTimer"],
  ["achievements", "Achievements", "IconTrophy"],
];
function Profile() {
  const p = s.profile;
  if (!p) return <Empty>Loading…</Empty>;
  const guest = s.user.isGuest,
    sections = PROFILE_SECTIONS,
    mode = sections.some(([m]) => m === s.profileMode) ? s.profileMode : "overview",
    title = sections.find(([m]) => m === mode)?.[1] ?? "Overview";
  return (
    <div className="page profile-page">
      <div className="profile-layout">
        <aside className="profile-side">
          <Row className="profile-header">
            <Avatar user={guest ? { username: "G" } : p.user} size={44} />
            <div className="col">
              <strong>{guest ? "Guest" : p.user.username}</strong>
              <small className="muted">
                {guest ? "Times stay on this device" : `Joined ${p.user.joined}`}
              </small>
            </div>
          </Row>
          <nav className="profile-nav" aria-label="Account sections">
            {sections.map(([m, label, icon]) => (
              <Button
                key={m}
                action={"profileMode:" + m}
                icon={icon}
                className={"profile-nav-item " + (mode === m ? "selected" : "")}
              >
                {label}
                {m === "achievements" && (
                  <span className="mono muted count">{s.achievements?.unlocked ?? 0}</span>
                )}
              </Button>
            ))}
          </nav>
          {guest && (
            <Button action="account:login" className="primary profile-cta">
              Sign in
            </Button>
          )}
        </aside>
        <section className="profile-main" aria-label={title}>
          <header className="profile-toolbar">
            <h2>{title}</h2>
            {["overview", "training"].includes(mode) && <ProfileFilters />}
            {mode === "playground" && <ProfileFilters scramble />}
            {mode === "achievements" && s.achievements && (
              <Row className="achievement-total">
                <span className="mono muted">
                  {s.achievements.unlocked} / {s.achievements.total}
                </span>
                <Progress
                  ratio={s.achievements.total ? s.achievements.unlocked / s.achievements.total : 0}
                />
              </Row>
            )}
          </header>
          {mode === "playground" ? (
            <TimerStats
              data={p.playground}
              empty={
                <div className="col center">
                  <span>No times in this selection yet.</span>
                  <Button action="nav:playground" className="primary">
                    Open the timer
                  </Button>
                </div>
              }
            />
          ) : mode === "training" ? (
            <TrainingProgress />
          ) : mode === "achievements" ? (
            <Achievements />
          ) : (
            <Overview />
          )}
        </section>
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
      <Row className="wrap profile-toolbar-row">
        <Button action="menu:achievementGroups" active>
          {s.achievementGroup === "all" ? "All puzzles" : s.achievementGroup}
          <Icon name="IconChevronDown" size={12} />
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
      <div className="scroll col achievements">
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
                <div className="achievement-list">
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
                        <Progress ratio={a.ratio} done={a.unlocked} />
                      </div>
                    </Row>
                  ))}
                </div>
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
      </div>
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
            const button = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
            if (button) return void s.action(button.dataset.action!);
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
          <GuideContent page={s.page as Guide} puzzle={s.guidePuzzle} method={s.guideMethod} />
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
    case "learningModes":
      return { action: "learningMode", values: trainingModeOptions(s.puzzle).map(({ value, label }) => ({ id: value, label })), current: s.learningMode };
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
  if (s.overlay === "learningGroups") return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" role="dialog" aria-label="Group order" onClick={e => e.stopPropagation()}>
        <Row className="between"><h2>Group order · {s.learningMode}</h2><Button action="close" icon="IconClose" title="Close group order" /></Row>
        <div className="scroll learning-groups">
          {s.learningGroups.map((group, i) => <Row key={group} className="between" >
            <span style={{ flex: 1, minWidth: 0 }}>{i + 1}. {group}</span>
            <Button action={`moveLearningGroup:${i}:-1`} title={`Move ${group} up`} disabled={i === 0}>↑</Button>
            <Button action={`moveLearningGroup:${i}:1`} title={`Move ${group} down`} disabled={i === s.learningGroups.length - 1}>↓</Button>
          </Row>)}
        </div>
      </div>
    </div>
  );
  const solve = s.overlaySolve;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        ref={ref}
        className={
          "modal " +
          (s.overlay === "search"
            ? "search-modal"
            : s.overlay === "profileCase"
              ? "stats-modal"
              : s.overlay === "settings"
                ? "settings-modal"
                : "")
        }
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
                  : s.overlay === "settings"
                    ? "Settings"
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
        ) : s.overlay === "settings" ? (
          <Settings />
        ) : s.overlay === "profileCase" ? (
          <TimerStats compact data={s.caseHistory} empty="No attempts on this case yet." />
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
            KeyS: "settings",
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
      ) : (
        <MotionConfig reducedMotion="user">
          <AnimatePresence initial={false} custom={s.direction}>
            <Frame key={guide ? s.page : s.page + (s.caseId ? ":case" : "")}>
              {guide ? (
                <Guides />
              ) : ["playground", "training"].includes(s.page) ? (
                <Practice />
              ) : s.page === "algorithms" ? (
                s.caseId ? (
                  <Detail />
                ) : (
                  <Catalog />
                )
              ) : (
                <Profile />
              )}
            </Frame>
          </AnimatePresence>
        </MotionConfig>
      )}
      {!guide && <Nav />}
      <UpdateNotification busy={!s.ready || s.running || s.saving || !!s.pendingSolve} light={s.light} />
      {s.overlay && <Overlay key={s.overlay} />}
      <ErrorNotification message={s.error} />
      <StartupNotification />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
