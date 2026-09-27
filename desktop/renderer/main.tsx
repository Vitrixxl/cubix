import { isLearningTrack, isReviewMode, learningCases, learningTrackOf, reviewCases, trainingModeOptions } from "../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES, slotWithWhiteDown, withWhiteDown } from "../../src/shared/crossPlusOne";
import { trainingSessionRows } from "../../src/client/lib/practiceSummary";
import { catalogSections } from "../../src/client/lib/practiceCatalog";
import { PracticeTimer } from "../../src/client/lib/practiceTimer";
import { shortId, maskForStage } from "../../src/client/lib/caseState";
import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig, motion, useIsPresent } from "motion/react";
import { store as s, catalog, matches } from "./store";
import { call, onEvent, openExternal } from "./bridge";
import { accents, theme } from "./theme";
import { Icon, ActionButton } from "./ui";
import { Cube } from "./Cube";
import { Toasts } from "./Toasts";
import { ErrorNotification } from "./ErrorNotification";
import { HistoryChart, type ChartRange } from "./HistoryChart";
import { LearningGroups } from "./LearningGroups";
import {
  fmtTime,
  fmtSolve,
  parseTypedTime,
  effective,
  averageOf,
  best,
} from "../../src/client/lib/format";
import { GuideContent } from "../guides/Content";
import { METHODS } from "../../src/shared/methods";
import { PUZZLES } from "../../src/shared/puzzles";
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
  highlight,
}: {
  action: string;
  active?: boolean;
  /**
   * Animated active background: a layout id makes it glide between the buttons sharing it,
   * `true` fades it in and out on a lone toggle.
   */
  highlight?: string | boolean;
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
      className={`${active ? "active" : ""} ${highlight ? "highlighted" : ""} ${className}`}
      style={style}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {typeof highlight === "string" ? (
        active && (
          <motion.span
            layoutId={highlight}
            className="button-highlight"
            transition={HIGHLIGHT}
          />
        )
      ) : (
        highlight && (
          <AnimatePresence initial={false}>
            {active && (
              <motion.span
                className="button-highlight"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={HIGHLIGHT}
              />
            )}
          </AnimatePresence>
        )
      )}
      {children}
    </ActionButton>
  );
}
const HIGHLIGHT = { type: "spring", bounce: 0.18, duration: 0.4 } as const;
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
const MOBILE = 700;
function TabIcon({ page, icon, size = 17 }: { page: string; icon: string; size?: number }) {
  return page === "profile" && !s.user.isGuest ? <Avatar user={s.user} size={size + 1} /> : <Icon name={icon} size={size} />;
}
/** Desktop navigation: a slim column with the puzzle on top, the sections, then help and settings at the bottom. */
function Sidebar() {
  return (
    <nav className="nav sidebar" aria-label="Sections">
      <Button action="menu:puzzles" className="side-puzzle" title="Choose a puzzle">
        <span className="side-puzzle-glyph">
          <Icon name={"Puzzle" + s.puzzle} size={18} />
        </span>
        <span className="side-label side-puzzle-name">{s.label("puzzles", s.puzzle)}</span>
        <Icon name="IconChevronDown" size={12} />
      </Button>
      <div className="side-group" role="tablist">
        {TABS.map(([page, label, icon, shortcut]) => (
          <Button
            key={page}
            action={"nav:" + page}
            title={`${label} (${shortcut})`}
            className={"side-item " + (s.page === page ? "selected" : "")}
          >
            <TabIcon page={page} icon={icon} />
            <span className="side-label">{label}</span>
          </Button>
        ))}
      </div>
      <div className="side-group side-foot">
        <Button action="help" className="side-item" title="Guides">
          <Icon name="IconBook" size={17} />
          <span className="side-label">Guides</span>
        </Button>
        <Button
          action="settings"
          className={"side-item " + (s.overlay === "settings" ? "selected" : "")}
          title="Settings (Alt+S)"
        >
          <Icon name="IconSettings" size={17} />
          <span className="side-label">Settings</span>
        </Button>
      </div>
    </nav>
  );
}
/** Phone navigation: a bottom tab bar with the timer in the centre. */
const MOBILE_TABS: [action: string, label: string, icon: string][] = [
  ["nav:algorithms", "Algorithms", "IconGrid"],
  ["nav:training", "Training", "IconTimer"],
  ["nav:playground", "Timer", "IconCube"],
  ["nav:profile", "Account", "IconUser"],
  ["settings", "Settings", "IconSettings"],
];
function TabBar() {
  return (
    <nav className="nav tabbar" aria-label="Sections">
      {MOBILE_TABS.map(([action, label, icon]) => {
        const selected = action === "settings" ? s.overlay === "settings" : s.page === action.slice(4);
        return (
          <Button key={action} action={action} title={label} className={"tab-item " + (selected ? "selected" : "")}>
            <TabIcon page={action.slice(4)} icon={icon} size={20} />
            <span>{label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
/** The app-wide puzzle, shown in page headers on phones where there is no sidebar. */
function PuzzleControl() {
  return (
    <Button action="menu:puzzles" className="control head-puzzle" title="Choose a puzzle">
      <Icon name={"Puzzle" + s.puzzle} size={16} />
      {s.label("puzzles", s.puzzle)}
      <Icon name="IconChevronDown" size={12} />
    </Button>
  );
}
/** Every page starts with the same row: title on the left, the page controls on the right. */
function PageHead({
  title,
  sub,
  lead,
  puzzle = false,
  children,
}: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; puzzle?: boolean } & Props) {
  const mobile = useViewport().w <= MOBILE;
  return (
    <header className="page-head">
      <div className="page-title">
        {lead}
        <div className="page-title-text">
          <h1>{title}</h1>
          {sub && <span className="page-sub">{sub}</span>}
        </div>
        {mobile && puzzle && <PuzzleControl />}
      </div>
      {React.Children.toArray(children).some(Boolean) && <div className="page-controls">{children}</div>}
    </header>
  );
}
/** A menu trigger of the page header: current value and a chevron. */
function Menu({ action, children, icon }: { action: string; icon?: string } & Props) {
  return (
    <Button action={"menu:" + action} className="control" icon={icon}>
      {children}
      <Icon name="IconChevronDown" size={12} />
    </Button>
  );
}
/**
 * Page frame. Phones slide pages sideways like a carousel; the desktop slides them up and down, in the
 * order of the sidebar. Animating `transform` keeps it on the compositor.
 */
const SLIDE = {
  enter: (direction: number) => ({ transform: `translateX(${direction * 100}%)` }),
  center: { transform: "translateX(0%)" },
  exit: (direction: number) => ({ transform: `translateX(${direction * -100}%)` }),
};
/** The desktop slides pages vertically, in the order of the sidebar. */
const SLIDE_Y = {
  enter: (direction: number) => ({ transform: `translateY(${direction * 100}%)` }),
  center: { transform: "translateY(0%)" },
  exit: (direction: number) => ({ transform: `translateY(${direction * -100}%)` }),
};
function Frame({ children, mobile }: { mobile: boolean } & Props) {
  const present = useIsPresent();
  // Commit the empty frame first so the transition starts immediately; the page mounts one frame later.
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
      variants={mobile ? SLIDE : SLIDE_Y}
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
  const reviewing = isReviewMode(s.learningMode);
  const track = learningTrackOf(s.learningMode);
  const { w, h } = useViewport(),
    mobile = w <= MOBILE,
    // First-block training runs like the timer, on its own scrambles.
    cross = s.crossTraining,
    training = s.page === "training" && !cross,
    // Wide windows keep the session in view; narrower ones open it on demand.
    timesAlways = !mobile && (training ? w >= 1360 : w >= 1000),
    timesColumn = !mobile && (timesAlways || s.showTimes),
    compact = w <= 900 || h <= 700;
  const enabled =
      !s.saving &&
      !s.generating &&
      !s.error &&
      (!training || (!!s.practiceSelected.size && s.practiceSelected.has(s.training?.id))),
    timer = useTimer(enabled),
    typing = s.page === "playground" && s.entry === "typing";
  const [typed, setTyped] = useState("");
  const typedRef = useRef<HTMLInputElement>(null);
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
      ? text.length > 90 ? 15 : 19
      : text.length > 220 ? 16 : text.length > 120 ? (compact ? 17 : 20) : compact ? 22 : 27,
    previewSize = mobile ? (h < 760 ? 0 : 76) : h < 700 ? 92 : w < 1200 ? 112 : 132;
  const hint = !enabled
    ? "Select cases to begin"
    : timer.phase === "Holding"
      ? "Keep holding…"
      : timer.phase === "Ready"
        ? "Release to start"
        : timer.phase === "Running"
          ? mobile ? "Tap to stop" : "Any key to stop"
          : `${s.page === "playground" && s.entry === "casual" ? "Not saved · " : ""}${mobile ? "Hold, then release to start" : "Hold Space, release to start"}`;
  const last = s.solves.find((v) => v.id === s.lastSolve);
  const metrics = s.metrics();
  const preview = previewSize > 0 && ready && (
    <div className="prompt-visual">
      {hasCube ? (
        <Cube
          setup={training ? s.training.setup : s.scramble}
          cubeSize={training ? c.cube_size ?? 3 : cubeSize}
          mask={training ? maskForStage(c.stage) : undefined}
          size={previewSize}
          replay={s.replay}
        />
      ) : training && s.training?.svg ? (
        <div
          style={{ width: previewSize, height: previewSize }}
          className="svg-diagram"
          dangerouslySetInnerHTML={{ __html: s.training.svg }}
        />
      ) : training ? (
        <Diagram c={c} size={previewSize} />
      ) : null}
    </div>
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
  return (
    <div className={"page practice " + (timer.phase === "Running" ? "running" : "")}>
      {cross ? (
        <PageHead
          title="Training"
          puzzle
          lead={<ChangeTraining />}
          sub={`Cross + 1 · ${s.crossMoves} moves`}
        >
          <div className="segmented" role="group" aria-label="Moves">
            {CROSS_PLUS_ONE_MOVES.map((n) => (
              <Button key={n} action={"crossMoves:" + n} active={s.crossMoves === n} highlight="cross-moves" title={`Cross + 1 in ${n} moves`}>
                {n} moves
              </Button>
            ))}
          </div>
          <span className="control-gap" />
          {replay}
          <Button action="next" icon="IconShuffle" className="control collapsible" title="New scramble (Alt+N)">
            <span className="control-label">New scramble</span>
          </Button>
          {timesToggle}
        </PageHead>
      ) : training ? (
        <PageHead
          title="Training"
          puzzle
          lead={<ChangeTraining />}
          sub={track ? `Learn ${track}` : reviewing ? "Review learned" : "Free practice · " + plural(s.practiceSelected.size, "case")}
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
          {reviewing && <Button action="next" icon="IconChevronRight" className="control">Next</Button>}
          <Button action="auf" active={s.randomAuf} className="control collapsible" title="Random AUF (Alt+A)">
            <Icon name="IconShuffle" size={14} />
            <span className="control-label">Random AUF</span>
          </Button>
          {replay}
          {timesToggle}
        </PageHead>
      ) : (
        <PageHead
          title="Timer"
          puzzle
          sub={`${s.label("puzzles", s.puzzle)} · ${s.label("solveModes", s.solveMode)}`}
        >
          <Menu action="scrambles">{s.label("scrambles", s.scrambleType)}</Menu>
          <Menu action="modes">{s.label("solveModes", s.solveMode)}</Menu>
          <Menu action="entries">{s.entry === "typing" ? "Typing" : s.entry === "casual" ? "Casual" : "Timer"}</Menu>
          <span className="control-gap" />
          {replay}
          <Button action="next" icon="IconShuffle" className="control collapsible" title="New scramble (Alt+N)">
            <span className="control-label">New scramble</span>
          </Button>
          {timesToggle}
        </PageHead>
      )}
      <div
        className="practice-body"
        style={{
          gridTemplateColumns: ["minmax(0, 1fr)", timesColumn && "var(--times-width)"]
            .filter(Boolean)
            .join(" "),
        }}
      >
        <div className="stage">
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
                      <Button
                        action={"learn:" + c.id}
                        className={"control " + (s.learned.has(c.id) ? "is-learned" : "")}
                        icon={s.learned.has(c.id) ? "IconCheck" : undefined}
                      >
                        {s.learned.has(c.id) ? "Learned" : "Mark learned"}
                      </Button>
                      {!learning && <Button action="previous" icon="IconBack" className="control icon-only" title="Previous case (Alt+P)" />}
                      {!learning && <Button action="next" icon="IconChevronRight" className="control icon-only" title="Next case (Alt+N)" />}
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
                        <Alg text={s.training.algorithm} size={Math.max(15, promptFont - 5)} />
                      </div>
                    </div>
                  )}
                  <div className="prompt-actions">
                    <Button action="solution" className="control" title="Show or hide the solution (Alt+H)">
                      <Icon name="IconEye" size={14} />
                      {s.revealed ? "Hide solution" : "Show solution"}
                    </Button>
                    {c.algorithms[0]?.youtube && (
                      <Button action={"url:" + c.algorithms[0].youtube} className="control" title="Watch finger tricks video">
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
                <span className="label">
                  Scramble · {cross ? `cross + 1 in ${s.crossMoves} moves` : s.label("scrambles", s.scrambleType)}
                </span>
                <div className="prompt-text scramble">
                  {s.generating && !s.scramble ? (
                    <span className="muted">Generating…</span>
                  ) : (
                    <Alg text={s.scramble} size={promptFont} />
                  )}
                </div>
                {cross && <CrossSolution font={Math.max(15, promptFont - 5)} />}
              </div>
            )}
            {preview}
          </section>
          <section
            className={"timer " + timer.phase.toLowerCase()}
            data-phase={timer.phase}
            onPointerDown={(e) => {
              if (e.target instanceof HTMLInputElement || (e.target as HTMLElement).closest(".solve-actions")) return;
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
            {typing ? (
              <input
                ref={typedRef}
                className="typed-time"
                aria-label="Time"
                placeholder="0.00"
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
              <div className="timer-digits mono">
                {(timer.phase === "Holding" || timer.phase === "Ready" ? "0.000" : fmtTime(timer.elapsed))
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
            <div className="solve-actions">
              {last && !s.saving && (
                <>
                  <Button action={"penalty:" + last.id + ":+2"} active={last.penalty === "+2"} className="control">
                    +2
                  </Button>
                  <Button action={"penalty:" + last.id + ":dnf"} active={last.penalty === "dnf"} className="control">
                    DNF
                  </Button>
                  <Button
                    action={"comment:" + last.id}
                    icon="IconComment"
                    className={"control icon-only " + (last.comment ? "has-comment" : "")}
                    title="Comment"
                  />
                  <Button action={"delete:" + last.id} icon="IconTrash" className="control icon-only danger-hover" title="Delete this solve" />
                </>
              )}
            </div>
          </section>
          <section className={"metrics" + (metrics.length > 4 ? " metrics-full" : "")}>
            {metrics.map(([label, value, tone]) => (
              <div key={label} className={"metric" + (tone ? " tone-" + tone : "")}>
                <span className="label">{label}</span>
                <span className="metric-value mono">{value}</span>
              </div>
            ))}
          </section>
        </div>
        {timesColumn && (
          <aside className="column column-right">
            <Times closable={!timesAlways} />
          </aside>
        )}
      </div>
      {mobile && s.showTimes && (
        <div
          className="sheet-backdrop"
          onClick={() => {
            s.showCases = s.showTimes = false;
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
/** Optimal cross + 1 solutions under the scramble, held with white on the bottom as for a cross. */
function CrossSolution({ font }: { font: number }) {
  const solutions = s.revealed && s.crossSolutions?.scramble === s.scramble ? s.crossSolutions.list : undefined;
  return (
    <>
      {s.revealed && (
        <div className="prompt-block">
          <span className="label">Solution · x2, white on the bottom</span>
          {solutions ? (
            <div className="cross-solutions">
              {solutions.map((v) => (
                <div key={v.moves + v.slot} className="cross-solution">
                  <Alg text={withWhiteDown(v.moves)} size={font} />
                  <span className="mark">{slotWithWhiteDown(v.slot)} pair</span>
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
        <Button action="solution" className="control" title="Show or hide the solution (Alt+H)">
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
type SetupMode = { id: string; label: string; detail: string; icon: string };
function setupModes(): SetupMode[] {
  const learned = (cases: any[]) => cases.filter((c) => s.learned.has(c.id)).length;
  return [
    ...(s.puzzle === "333" ? [{ id: "cross1", label: "Cross + 1", detail: `First block · ${s.crossMoves} moves`, icon: "IconCube" }] : []),
    ...trainingModeOptions(s.puzzle).map(({ value, label }) => {
      const pool = isLearningTrack(value) ? learningCases(catalog.cases, value) : [];
      return {
        id: value as string,
        label,
        icon: value === "practice" ? "IconGrid" : value === "review" ? "IconCheck" : "IconBook",
        detail:
          value === "practice"
            ? plural(s.selected.size, "case") + " selected"
            : value === "review"
              ? plural(reviewCases(catalog.cases, s.learned, s.puzzle).length, "learned case")
              : `${learned(pool)} / ${pool.length} learned`,
      };
    }),
  ];
}
/** The mode the setup screen opens on: the one trained last. */
function defaultSetupMode() {
  if (s.trainingKind === "cross1" && s.puzzle === "333") return "cross1";
  const mode = s.learningMode;
  return isReviewMode(mode) ? "review" : learningTrackOf(mode) ?? "practice";
}
/** Training starts here: the modes on the left, the chosen one on the right with what it needs and its start button. */
function TrainingSetup() {
  const modes = setupModes(),
    current = modes.find((m) => m.id === (s.setupMode || defaultSetupMode())) ?? modes[0]!;
  return (
    <div className="page training-setup">
      <PageHead title="Training" puzzle sub="Choose what to practise" />
      <div className="setup-body">
        <nav className="setup-modes" aria-label="Training modes">
          {modes.map((m) => (
            <Button key={m.id} action={"setupMode:" + m.id} className={"setup-mode " + (m === current ? "selected" : "")} title={m.label}>
              <Icon name={m.icon} size={16} />
              <span className="setup-mode-text">
                <strong>{m.label}</strong>
                <span>{m.detail}</span>
              </span>
            </Button>
          ))}
        </nav>
        <section className="setup-detail" key={current.id}>
          {current.id === "cross1" ? <CrossSetup /> : current.id === "practice" ? <CasesSetup /> : <LearningSetup mode={current.id} />}
        </section>
      </div>
    </div>
  );
}
function SetupStart({ action, disabled = false, children }: { action: string; disabled?: boolean } & Props) {
  return (
    <Button action={action} className="primary setup-start" icon="IconTimer" disabled={disabled}>
      {children ?? "Start"}
    </Button>
  );
}
function CrossSetup() {
  return (
    <div className="setup-pane">
      <header className="setup-pane-head">
        <div className="setup-pane-title">
          <span className="label">First block</span>
          <h2>Cross + 1</h2>
          <p className="muted">Scrambles whose white cross and one back F2L pair take exactly the chosen number of moves, held with white on the bottom (x2).</p>
        </div>
      </header>
      <div className="setup-field">
        <span className="label">Moves</span>
        <div className="move-choice" role="radiogroup" aria-label="Moves">
          {CROSS_PLUS_ONE_MOVES.map((n) => (
            <Button key={n} action={"crossMoves:" + n} className={"move-option " + (s.crossMoves === n ? "selected" : "")} title={`${n} moves`}>
              <span className="move-count mono">{n}</span>
              <span>moves</span>
            </Button>
          ))}
        </div>
      </div>
      <div className="setup-actions">
        <SetupStart action="trainingStart:cross1" />
      </div>
    </div>
  );
}
function CasesSetup() {
  const cases = s.cases();
  return (
    <div className="setup-pane setup-cases">
      <header className="setup-pane-head">
        <div className="setup-pane-title">
          <span className="label">Free practice</span>
          <h2>{plural(s.selected.size, "case")} selected</h2>
        </div>
        <div className="setup-pane-controls">
          <input
            className="setup-search"
            placeholder="Search cases…"
            aria-label="Search cases"
            value={s.query}
            onChange={(e) => {
              s.query = e.target.value;
              s.emit();
            }}
          />
          <Button action="clear" className="control" disabled={!s.selected.size}>
            Clear
          </Button>
          <SetupStart action="trainingStart:cases:practice" disabled={!s.selected.size} />
        </div>
      </header>
      <div className="scroll setup-scroll">
        {s.allSets().map((set: any) => {
          const chosen = cases.filter((c: any) => c.set === set.id && matches(c, s.query)),
            count = chosen.filter((c: any) => s.selected.has(c.id)).length,
            open = s.selectorOpen[set.id] ?? (count > 0 || !!s.query);
          if (!chosen.length) return null;
          const groups = [...new Set(chosen.map((c: any) => c.group))] as string[];
          return (
            <section key={set.id} className={"setup-set " + (open ? "open" : "")}>
              <div className="setup-set-head">
                <Button action={"selectSet:" + set.id} className="check-button" title={"Select " + set.label}>
                  <span className={"checkbox " + (count ? "checked" : "")}>
                    {count ? <Icon name={count === chosen.length ? "IconCheck" : "IconMinus"} size={11} /> : null}
                  </span>
                </Button>
                <Button action={"selectorToggle:" + set.id} className="setup-set-title">
                  <span className="setup-set-stage label">{set.stage}</span>
                  <strong>{set.label}</strong>
                  <span className="mono muted">
                    {count} / {chosen.length}
                  </span>
                  <Icon name={open ? "IconChevronDown" : "IconChevronRight"} size={12} />
                </Button>
              </div>
              {open &&
                groups.map((group) => {
                  const members = chosen.filter((c: any) => c.group === group);
                  return (
                    <div key={group} className="setup-group">
                      {groups.length > 1 && (
                        <Button action={"selectGroup:" + set.id + ":" + group} className="setup-group-title">
                          {group}
                          <span className="mono muted">
                            {members.filter((c: any) => s.selected.has(c.id)).length} / {members.length}
                          </span>
                        </Button>
                      )}
                      <div className="setup-grid">
                        {members.map((c: any) => (
                          <Button
                            key={c.id}
                            action={"select:" + c.id}
                            className={"setup-tile " + (s.selected.has(c.id) ? "chosen" : "")}
                            title={c.name}
                          >
                            <Diagram c={c} size={60} />
                            <span>{shortId(c)}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
function LearningSetup({ mode }: { mode: string }) {
  const review = mode === "review",
    track = isLearningTrack(mode) ? mode : undefined,
    pool = track ? learningCases(catalog.cases, track) : reviewCases(catalog.cases, s.learned, s.puzzle),
    learned = pool.filter((c) => s.learned.has(c.id)).length;
  const figures: [string, number][] = review
    ? [["Learned cases", pool.length]]
    : [["Cases", pool.length], ["Learned", learned], ["Left", pool.length - learned]];
  return (
    <div className="setup-pane">
      <header className="setup-pane-head">
        <div className="setup-pane-title">
          <span className="label">{review ? "Review" : "Daily learning"}</span>
          <h2>{review ? "Review learned" : `Learn ${track}`}</h2>
          <p className="muted">
            {review ? "Every case you marked as learned, drawn at random." : `One new ${track} case a day, group by group, until the set is learned.`}
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
        <SetupStart action={"trainingStart:cases:" + mode} disabled={review && !pool.length} />
      </div>
    </div>
  );
}
function Times({ closable = true }: { closable?: boolean }) {
  const training = s.practicePage() === "training";
  return (
    <div className="column-content">
      <div className="column-head">
        <strong>{training ? "Session" : "Times"}</strong>
        <span className="mono muted">{s.solves.length}</span>
        <span className="column-head-actions">
          {training && !!s.solves.length && <Button action="undo" className="control">Undo</Button>}
          {closable && <Button action="times" icon="IconClose" className="control icon-only" title="Close" />}
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
          <div className="times-head">
            <span>#</span>
            <span>Time</span>
          </div>
          <div className="scroll times-list">
            {!s.solves.length && <div className="column-empty">No solves in this session yet.</div>}
            {[...s.solves].reverse().map((v, i) => (
              <div key={v.id} className="times-row">
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
/** Algorithms: the case list on the left and the chosen case on the right; phones open the case as a page. */
function Algorithms() {
  const mobile = useViewport().w <= MOBILE;
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all");
  const learned = sections.reduce((sum, section) => sum + section.learnedCount, 0);
  const total = sections.reduce((sum, section) => sum + section.all.length, 0);
  if (mobile && s.caseId) return <Detail />;
  return (
    <div className="page algorithms-page">
      <PageHead title="Algorithms" puzzle sub={`${learned} of ${total} learned`}>
        <Button action="search" className="control" title="Search cases (Ctrl+K)">
          <span className="control-label">Search</span>
          <kbd>Ctrl K</kbd>
        </Button>
        <Button action="methods" icon="IconBook" className="control collapsible" title="Solving methods">
          <span className="control-label">Methods</span>
        </Button>
      </PageHead>
      <div className="master-detail">
        <CaseList />
        {!mobile && (
          <div className="md-detail">{s.caseId && s.find(s.caseId) ? <CaseDetail key={s.caseId} /> : <SetSummary />}</div>
        )}
      </div>
    </div>
  );
}
function currentSection() {
  const sections = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, s.learningFilter),
    stages: string[] = sections.map((section) => section.stage),
    stage = stages.includes(s.catalogStage) ? s.catalogStage : stages[0];
  return { sections, stages, stage, section: sections.find((section) => section.stage === stage) };
}
function CaseList() {
  const scroll = useScrollPosition(`catalog:${s.puzzle}:${s.catalogStage}`);
  const { sections, stages, stage, section } = currentSection();
  const all = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all").find((x) => x.stage === stage);
  const setLearned = all ? all.learnedCount : 0,
    setTotal = all ? all.all.length : 0;
  return (
    <div className="md-list">
      <div className="md-list-head">
        <div className="tabs" role="tablist" aria-label="Stage">
          {stages.map((st) => (
            <Button key={st} action={"stage:" + st} className={"tab " + (st === stage ? "selected" : "")}>
              {st}
            </Button>
          ))}
        </div>
        {section && section.variants.length > 1 && (
          <div className="segmented" role="group" aria-label="Set">
            {section.variants.map((v: any) => (
              <Button key={v.id} action={"set:" + v.id} active={v.id === section.active.id}>
                {v.label.startsWith(stage + " ") ? v.label.slice(stage.length + 1) : v.label}
                <span className="mono muted">{v.count}</span>
              </Button>
            ))}
          </div>
        )}
        <div className="md-filter">
          <div className="segmented" role="group" aria-label="Filter">
            {[
              ["all", "All", setTotal],
              ["learned", "Learned", setLearned],
              ["not-learned", "To learn", setTotal - setLearned],
            ].map(([id, label, count]) => (
              <Button key={id as string} action={"learningFilter:" + id} active={s.learningFilter === id}>
                {label}
                <span className="mono muted">{count}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div ref={scroll} className="scroll md-list-scroll">
        {section && !section.groups.length && (
          <Empty>
            {s.learningFilter === "learned" ? "No learned cases in this set yet." : "Every case of this set is learned."}
          </Empty>
        )}
        {section?.groups.map(([group, members]: [string, any[]]) => {
          const key = section.active.id + ":" + group,
            closed = s.collapsed.has(key);
          return (
            <section key={group} className="list-group">
              <div className="list-group-head">
                <Button action={"collapse:" + key} className="list-group-title">
                  <Icon name={closed ? "IconChevronRight" : "IconChevronDown"} size={12} />
                  <span>{group}</span>
                  <span className="mono muted">{members.length}</span>
                </Button>
                <Button action={"train:" + key} icon="IconTimer" className="list-group-train" title={`Train ${group}`}>
                  Train
                </Button>
              </div>
              {!closed && members.map((c: any) => <CaseRow key={c.id} c={c} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
function CaseRow({ c }: { c: any }) {
  const st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id);
  return (
    <div className={"case-row" + (s.caseId === c.id ? " selected" : "")}>
      <Button action={"case:" + c.id} className="case-row-open" title={c.id}>
        <span className="case-row-diagram">
          <Diagram c={c} size={36} />
        </span>
        <span className="case-row-name">
          <strong>{shortId(c)}</strong>
          {c.name !== c.id && <span>{c.name}</span>}
        </span>
        <span className="mono case-row-time">{st ? fmtTime(st.best) : "—"}</span>
      </Button>
      <Button
        action={"learn:" + c.id}
        className={"case-check " + (learned ? "yes" : "")}
        title={learned ? "Learned" : "Mark learned"}
      >
        <span className="checkbox">{learned && <Icon name="IconCheck" size={11} />}</span>
      </Button>
    </div>
  );
}
/** Right pane before a case is chosen: where the chosen set stands. */
function SetSummary() {
  const { stage, section } = currentSection();
  const all = catalogSections<any, any>(s.cases(), s.allSets(), s.sets, s.learned, "all").find((x) => x.stage === stage);
  if (!all) return <Empty>No cases for this puzzle.</Empty>;
  const trained = all.all.filter((c: any) => s.stats.some((v) => v.caseId === c.id)).length;
  return (
    <div className="set-summary">
      <span className="label">{stage}</span>
      <h2>{all.active.label}</h2>
      {all.active.description && <p className="muted">{all.active.description}</p>}
      <div className="summary-figures">
        <div className="metric">
          <span className="label">Cases</span>
          <span className="metric-value mono">{all.all.length}</span>
        </div>
        <div className="metric">
          <span className="label">Learned</span>
          <span className="metric-value mono">{all.learnedCount}</span>
        </div>
        <div className="metric">
          <span className="label">Trained</span>
          <span className="metric-value mono">{trained}</span>
        </div>
      </div>
      <Progress ratio={all.all.length ? all.learnedCount / all.all.length : 0} />
      {section?.groups.length ? (
        <div className="row">
          <Button action={"train:" + all.active.id + ":" + section.groups[0][0]} icon="IconTimer" className="primary">
            Train {section.groups[0][0]}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
const SOURCES: Record<string, string> = { speedcubedb: "SpeedCubeDB", jperm: "J Perm", f2ltrainer: "F2L Trainer" };
/** One case in full: diagram, setup, algorithms and its statistics. */
function CaseDetail() {
  const c = s.find(s.caseId),
    mobile = useViewport().w <= MOBILE;
  const ids = s
      .cases()
      .filter((v: any) => v.set === c.set)
      .map((v: any) => v.id),
    index = ids.indexOf(c.id),
    st = s.stats.find((v) => v.caseId === c.id),
    learned = s.learned.has(c.id);
  return (
    <div className="detail">
      <div className="scroll detail-scroll">
        <div className="detail-hero">
          <div className="detail-visual">
            {c.cube ? (
              <Cube setup={c.setup} cubeSize={c.cube_size ?? 3} mask={maskForStage(c.stage)} size={mobile ? 150 : 216} replay={s.replay} />
            ) : (
              <Diagram c={c} size={mobile ? 136 : 196} />
            )}
          </div>
          <div className="detail-meta">
            <span className="label">
              {c.setLabel} · {c.group}
            </span>
            <h2 className="detail-title">{c.id}</h2>
            {c.name !== c.id && <p className="detail-name">{c.name}</p>}
            <div className="detail-figures">
              <div className="metric">
                <span className="label">Best</span>
                <span className="metric-value mono">{st ? fmtTime(st.best) : "—"}</span>
              </div>
              <div className="metric">
                <span className="label">Mean</span>
                <span className="metric-value mono">{st ? fmtTime(st.mean) : "—"}</span>
              </div>
              <div className="metric">
                <span className="label">Attempts</span>
                <span className="metric-value mono">{st?.count ?? 0}</span>
              </div>
            </div>
            <div className="row detail-buttons">
              <Button action="train" icon="IconTimer" className="primary">
                Train
              </Button>
              <Button action={"learn:" + c.id} className={"control " + (learned ? "is-learned" : "")} icon={learned ? "IconCheck" : undefined}>
                {learned ? "Learned" : "Mark learned"}
              </Button>
              {c.cube && (
                <Button action="replayCube" className="control" title="Replay the setup on the cube">
                  <Icon name="IconUndo" size={14} />
                  Replay
                </Button>
              )}
            </div>
          </div>
        </div>
        <section className="detail-section detail-setup">
          <h3 className="label">Setup</h3>
          <Alg text={c.setup} size={17} />
          {c.notes && <p className="muted">{c.notes}</p>}
        </section>
        <section className="detail-section detail-algorithms">
          <h3 className="label">Algorithms</h3>
          <div className="algorithm-list">
            {c.algorithms.map((a: any, i: number) => (
              <div key={i} className="algorithm-row">
                <span className="mono muted algorithm-index">{i + 1}</span>
                <Alg text={a.alg} size={16} />
                <span className="algorithm-meta">
                  {i === 0 && <span className="mark">Primary</span>}
                  {a.stm != null && <span className="muted">{a.stm} STM</span>}
                  <span className="muted">{SOURCES[a.source] ?? a.source}</span>
                  {a.youtube && (
                    <Button action={"url:" + a.youtube} className="control">
                      Video
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="detail-section detail-stats">
          <h3 className="label">Statistics</h3>
          <TimerStats compact data={s.caseHistory} empty="No attempts on this case yet." />
        </section>
      </div>
      <div className="detail-foot">
        <Button action="caseStep:previous" icon="IconBack" className="control icon-only" disabled={index === 0} title="Previous case (←)" />
        <span className="mono muted">
          {index + 1} / {ids.length}
        </span>
        <Button
          action="caseStep:next"
          icon="IconChevronRight"
          className="control icon-only"
          disabled={index === ids.length - 1}
          title="Next case (→)"
        />
      </div>
    </div>
  );
}
/** Phones: the case opened as a page of its own. */
function Detail() {
  const c = s.find(s.caseId);
  if (!c) return <Empty>Case unavailable.</Empty>;
  return (
    <div className="page detail-page">
      <PageHead
        lead={<Button action="back" icon="IconBack" className="control icon-only" title="Back (Alt+B)" />}
        title={c.id}
        sub={c.setLabel}
      />
      <CaseDetail />
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
    high = Math.max(low + 1, Math.max(...points)),
    x = (i: number) => (i / (points.length - 1)) * 100,
    y = (v: number) => 4 + (1 - (v - low) / (high - low)) * 26,
    line = points.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" "),
    best = points.indexOf(low),
    last = points.length - 1;
  const dot = (i: number, cls: string) => (
    <i className={"sparkline-dot " + cls} style={{ left: x(i) + "%", top: (y(points[i]) / 32) * 100 + "%" }} />
  );
  return (
    <div className="sparkline" aria-hidden="true">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none">
        <path d={`${line} L100 32 L0 32 Z`} fill="var(--accent)" fillOpacity="0.07" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {best !== last && dot(best, "best")}
      {dot(last, "last")}
    </div>
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
type ActivitySolve = { at: string; time: number | null; timer: boolean };
type DayStats = { count: number; best: number | null; ao5: number | null; ao12: number | null };
const HEAT_GAP = 3,
  HEAT_LABEL = 28;
const heatColor = (ratio: number) =>
  `color-mix(in srgb, var(--accent) ${30 + Math.round(ratio * 70)}%, var(--surface2))`;
/** Best rolling average of `size` over a day's timer solves, in order. */
const bestAverage = (times: (number | null)[], size: number) =>
  best(times.slice(size - 1).map((_, i) => averageOf(times.slice(i, i + size))));
/** GitHub-style activity: solves per day, one column per week (Monday on top), up to a year wide. */
function Activity({
  solves,
  summary,
  detail,
}: {
  solves: ActivitySolve[];
  summary: { label: string; value: string }[];
  detail: string;
}) {
  const ref = useRef<HTMLElement>(null),
    [fit, setFit] = useState({ weeks: 53, cell: 12 }),
    [hover, setHover] = useState<{ key: string; rect: DOMRect } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const avail = el.getBoundingClientRect().width - HEAT_LABEL - HEAT_GAP,
        weeks = Math.max(1, Math.min(53, Math.floor((avail + HEAT_GAP) / (9 + HEAT_GAP)))),
        cell = Math.max(
          9,
          Math.min(innerHeight <= 640 ? 10 : innerHeight < 800 ? 12 : 17, Math.floor((avail + HEAT_GAP) / weeks - HEAT_GAP)),
        );
      setFit((f) => (f.weeks === weeks && f.cell === cell ? f : { weeks, cell }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, []);
  const days = new Map<string, { count: number; times: (number | null)[] }>();
  for (const solve of solves) {
    const key = dayKey(new Date(solve.at)),
      day = days.get(key) ?? { count: 0, times: [] };
    day.count++;
    if (solve.timer) day.times.push(solve.time);
    days.set(key, day);
  }
  const { weeks, cell } = fit,
    today = new Date(),
    end = new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    offset = (end.getDay() + 6) % 7,
    start = new Date(end);
  start.setDate(end.getDate() - offset - (weeks - 1) * 7);
  const peak = Math.max(1, ...[...days.values()].map((d) => d.count)),
    cells: { key: string; date: Date; count: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    cells.push({ key, date: d, count: days.get(key)?.count ?? 0, future: d > end });
  }
  // A month label sits over the first week starting in that month, unless the next label is too close.
  const months: { week: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const month = cells[w * 7].date.getMonth();
    if (w && month === cells[(w - 1) * 7].date.getMonth()) continue;
    if (months.length && w - months.at(-1)!.week < 3) months.pop();
    months.push({ week: w, label: cells[w * 7].date.toLocaleDateString(undefined, { month: "short" }) });
  }
  const shown = cells.reduce((sum, c) => sum + c.count, 0),
    width = HEAT_LABEL + weeks * (cell + HEAT_GAP),
    hovered = hover && cells.find((c) => c.key === hover.key),
    times = (hover && days.get(hover.key)?.times) ?? [],
    stats: DayStats | null = hovered
      ? { count: hovered.count, best: best(times), ao5: bestAverage(times, 5), ao12: bestAverage(times, 12) }
      : null;
  return (
    <section ref={ref} className="activity" aria-label="Activity">
      <div className="activity-block" style={{ width }}>
        <div className="activity-head">
          <h3>
            {plural(shown, "solve")} in the last {weeks >= 52 ? "year" : plural(weeks, "week")}
          </h3>
          <div className="activity-summary">
            {summary.map((m) => (
              <span key={m.label}>
                <span className="mono">{m.value}</span> <small className="muted">{m.label}</small>
              </span>
            ))}
          </div>
        </div>
        <div
          className="heatmap"
          role="img"
          aria-label={`Solves per day over the last ${weeks} weeks`}
          onMouseLeave={() => setHover(null)}
          style={{
            gridTemplateColumns: `${HEAT_LABEL}px repeat(${weeks}, ${cell}px)`,
            gridTemplateRows: `auto repeat(7, ${cell}px)`,
            gap: HEAT_GAP,
          }}
        >
          {months.map((m) => (
            <span key={m.week} className="heat-label" style={{ gridRow: 1, gridColumn: m.week + 2 }}>
              {m.label}
            </span>
          ))}
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <span key={d} className="heat-label" style={{ gridRow: 2 + i * 2, gridColumn: 1 }}>
              {d}
            </span>
          ))}
          {cells.map((c, i) => (
            <span
              key={c.key}
              className={"heat " + (c.future ? "future" : "")}
              onMouseEnter={(e) =>
                c.future ? setHover(null) : setHover({ key: c.key, rect: e.currentTarget.getBoundingClientRect() })
              }
              style={{
                gridRow: 2 + (i % 7),
                gridColumn: 2 + Math.floor(i / 7),
                background: c.count ? heatColor(c.count / peak) : undefined,
              }}
            />
          ))}
        </div>
        <div className="activity-foot">
          <small className="muted">{detail}</small>
          <Row className="heat-legend">
            <small className="muted">Less</small>
            {[0, 0.25, 0.5, 0.75, 1].map((r) => (
              <span
                key={r}
                className="heat"
                style={{ width: cell, height: cell, background: r ? heatColor(r) : undefined }}
              />
            ))}
            <small className="muted">More</small>
          </Row>
        </div>
      </div>
      {hover && hovered && stats &&
        createPortal(
          <div
            className={
              "heat-tip " +
              (hover.rect.left < 120 ? "start" : hover.rect.right > window.innerWidth - 120 ? "end" : "")
            }
            style={{
              left: hover.rect.left + hover.rect.width / 2,
              top: hover.rect.top - 8,
            }}
          >
            <small className="muted">
              {hovered.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </small>
            <strong>{plural(stats.count, "solve")}</strong>
            {[
              ["Best", stats.best],
              ["Best Ao5", stats.ao5],
              ["Best Ao12", stats.ao12],
            ].map(([label, value]) => (
              <span key={label as string} className="heat-tip-row">
                <span className="muted">{label}</span>
                <span className="mono">{fmtTime(value as number | null)}</span>
              </span>
            ))}
          </div>,
          ref.current?.closest(".app") ?? document.body,
        )}
    </section>
  );
}
function ProfileFilters({ scramble = false }: { scramble?: boolean }) {
  return (
    <Row className="profile-filters">
      <Button action="menu:profilePuzzles" className="control" icon={"Puzzle" + s.profilePuzzle}>
        {s.label("puzzles", s.profilePuzzle)}
        <Icon name="IconChevronDown" size={12} />
      </Button>
      {scramble && (
        <Button action="menu:profileScrambles" className="control">
          {s.label("scrambles", s.profileScramble)}
          <Icon name="IconChevronDown" size={12} />
        </Button>
      )}
      <Button action="menu:profileModes" className="control">
        {s.label("solveModes", s.profileSolveMode)}
        <Icon name="IconChevronDown" size={12} />
      </Button>
    </Row>
  );
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Section link of the overview: a plain button that opens a profile page. */
function Go({ action, className = "", label, children }: { action: string; label: string } & Props) {
  return (
    <button
      type="button"
      data-action={action}
      className={"ov-go " + className}
      aria-label={label}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {children}
    </button>
  );
}
/** Ring gauge: a track and an accent arc, with the caption in the middle. */
function Ring({ ratio, size = 58, stroke = 5, children }: { ratio: number; size?: number; stroke?: number } & Props) {
  const r = (size - stroke) / 2,
    c = 2 * Math.PI * r;
  return (
    <span className="ring" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamp01(ratio))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-label mono">{children}</span>
    </span>
  );
}
function overviewData() {
  const p = s.profile,
    timer = p.playground?.summary ?? { count: 0 },
    cases = s.cases(s.profilePuzzle),
    learned = cases.filter((c: any) => s.learned.has(c.id)).length,
    trained = p.cases?.length ?? 0,
    trainingSolves: number = p.trainingSolves ?? 0,
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
      .slice(0, 8)
      .map((a: any) => ({ label: a.title, value: `${Math.round(a.ratio * 100)}%`, ratio: a.ratio })),
    activity: ActivitySolve[] = [
      ...(p.playground?.history ?? []).map((v: any) => ({ at: v.at, time: v.time, timer: true })),
      ...(p.cases ?? []).flatMap((c: any) => (c.history ?? []).map((v: any) => ({ at: v.at, time: v.time, timer: false }))),
    ].filter((v) => v.at),
    latest = [timer.lastAt, ...(p.cases ?? []).map((c: any) => c.summary?.lastAt)]
      .filter((at): at is string => !!at)
      .sort()
      .at(-1),
    learnedRatio = cases.length ? learned / cases.length : 0,
    unlockedRatio = total ? unlocked / total : 0;
  return {
    timer,
    history: (p.playground?.history ?? []) as any[],
    timerTimes: (p.playground?.history ?? []).map((v: any) => v.time as number | null),
    timerDetail: timer.count
      ? `Best of ${plural(timer.count, "solve")} · ${s.label("scrambles", s.profileScramble)}`
      : "No solves in this selection yet",
    cases,
    learned,
    trained,
    trainingSolves,
    learnedRatio,
    trainingDetail: `${plural(trained, "case")} trained · ${Math.round(learnedRatio * 100)}% learned`,
    unlocked,
    total,
    unlockedRatio,
    next,
    achievementDetail: next ? `Next: ${next.title} · ${next.detail}` : "Everything unlocked",
    stages,
    goals,
    activity,
    latest,
  };
}
type OverviewData = ReturnType<typeof overviewData>;
/** Best single in front, best Ao5 and Ao12 side by side beneath it. */
function TimerBests({ d }: { d: OverviewData }) {
  const t = d.timer,
    figure = (label: string, value: number | null, className = "") => (
      <span key={label} className={"ov-hero-figure " + className}>
        <span className="ov-hero-value mono">{t.count ? fmtTime(value) : "—"}</span>
        <small className="muted">{label}</small>
      </span>
    );
  return (
    <span className="ov-bests">
      {figure("Best single", t.best, "lead")}
      <span className="ov-bests-row">
        {figure("Best Ao5", t.bestAo5)}
        {figure("Best Ao12", t.bestAo12)}
      </span>
    </span>
  );
}
/** Latest solves, newest first, as many as the column can show. */
function RecentSolves({ d }: { d: OverviewData }) {
  const history = d.history,
    recent = history.slice(-30).reverse();
  if (!recent.length) return null;
  return (
    <span className="ov-recent">
      <small className="muted ov-recent-title">Recent solves</small>
      {recent.map((v, i) => {
        const index = history.length - 1 - i,
          previous = history[index - 1],
          pb = v.time != null && v.time === v.best && (!previous || previous.best == null || previous.best > v.time);
        return (
          <span key={v.id} className="ov-recent-row">
            <span className={"mono " + (v.time == null ? "muted" : pb ? "accent" : "")}>
              {v.time == null ? "DNF" : fmtTime(v.time)}
            </span>
            <span className="history-tags">
              {pb && <span className="tag">PB</span>}
              {v.penalty === "+2" && <span className="tag muted">+2</span>}
            </span>
            <span className="muted">{v.displayDate}</span>
          </span>
        );
      })}
    </span>
  );
}
type GaugeSection = { action: string; label: string; ratio: number; value: string; suffix: string; detail: string; rows: OverviewData["stages"] };
const gaugeSections = (d: OverviewData): GaugeSection[] => [
  {
    action: "profileMode:training",
    label: "Training",
    ratio: d.learnedRatio,
    value: String(d.trained),
    suffix: `/ ${d.cases.length} cases`,
    detail: `${d.learned} learned · ${plural(d.trainingSolves, "solve")}`,
    rows: d.stages,
  },
  {
    action: "profileMode:achievements",
    label: "Achievements",
    ratio: d.unlockedRatio,
    value: String(d.unlocked),
    suffix: `/ ${d.total} unlocked`,
    detail: d.achievementDetail,
    rows: d.goals,
  },
];
/** Ring, figure and detail on one line, bars underneath. */
function GaugeCard({ g }: { g: GaugeSection }) {
  return (
    <Go action={g.action} className="ov-card ov-ring-card" label={`${g.label}: ${g.value} ${g.suffix}. ${g.detail}`}>
      <span className="ov-card-head">
        <span className="ov-card-title">{g.label}</span>
        <Icon name="IconChevronRight" size={14} />
      </span>
      <span className="ov-ring-head">
        <Ring ratio={g.ratio}>{Math.round(g.ratio * 100)}%</Ring>
        <span className="ov-ring-text">
          <span className="ov-ring-value mono">
            {g.value}
            <span className="stat-card-suffix">{g.suffix}</span>
          </span>
          <small className="muted">{g.detail}</small>
        </span>
      </span>
      <MiniBars rows={g.rows} />
    </Go>
  );
}
/** Overview in two columns: activity over the timer on the left, training over achievements on the right. */
function Overview() {
  const p = s.profile,
    d = overviewData(),
    [training, achievements] = gaugeSections(d);
  return (
    <div className="overview">
      <div className="ov-col ov-col-main">
        <section className="ov-card ov-activity">
          <Activity
            solves={d.activity}
            summary={[
              { label: (p.activeDays ?? 0) === 1 ? "active day" : "active days", value: String(p.activeDays ?? 0) },
              { label: "total solves", value: (p.totalSolves ?? 0).toLocaleString() },
              { label: "per active day", value: p.activeDays ? (p.totalSolves / p.activeDays).toFixed(1) : "—" },
            ]}
            detail={d.latest ? `Last practice: ${shortDate(d.latest)}` : "No practice recorded yet"}
          />
        </section>
        <Go action="profileMode:playground" className="ov-card ov-timer" label={`Timer: ${d.timerDetail}`}>
          <span className="ov-card-head">
            <span className="ov-card-title">Timer</span>
            <small className="muted">{d.timerDetail}</small>
            <Icon name="IconChevronRight" size={14} />
          </span>
          <TimerBests d={d} />
          <span className="ov-timer-chart">
            {d.timerTimes.filter((v: number | null) => v != null).length >= 2 ? (
              <Sparkline values={d.timerTimes} />
            ) : (
              <span className="ov-chart-empty muted">Your progress curve appears after two timed solves.</span>
            )}
          </span>
        </Go>
      </div>
      <div className="ov-col ov-col-side">
        <GaugeCard g={training} />
        <GaugeCard g={achievements} />
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
type SolveSort = "newest" | "oldest" | "fastest" | "slowest";
const SOLVE_SORTS: { id: SolveSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "fastest", label: "Fastest first" },
  { id: "slowest", label: "Slowest first" },
];
/** Rows drawn before the table asks for more; long timer histories stay light. */
const SOLVE_PAGE = 100;
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
  // The table order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<SolveSort>("newest"),
    [commented, setCommented] = useState(false);
  if (!data?.summary?.count) return <Empty>{empty}</Empty>;
  const history = data.history ?? [];
  return (
    <TimerStatsView
      key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`}
      data={data}
      compact={compact}
      table={{ sort, setSort, commented, setCommented }}
    />
  );
}
type SolveTableState = {
  sort: SolveSort;
  setSort: (sort: SolveSort) => void;
  commented: boolean;
  setCommented: (commented: boolean) => void;
};
function TimerStatsView({ data, compact, table }: { data: any; compact: boolean; table: SolveTableState }) {
  const history: any[] = data.history ?? [];
  const [range, setRange] = useState<ChartRange>([0, history.length - 1]);
  const zoomed = range[0] > 0 || range[1] < history.length - 1,
    count = range[1] - range[0] + 1,
    total = <span className="muted solves-count">{zoomed ? `${count} of ${history.length} solves` : plural(count, "solve")}</span>;
  return (
    <div className={"stats " + (compact ? "compact" : "")}>
      <StatStrip summary={data.summary} />
      <div className="stats-grid">
        {s.statsView === "table" ? (
          <SolvesTable history={history} range={range} total={total} {...table} />
        ) : (
          <div className="panel chart-panel">
            <Row className="between">
              <Row>
                <StatsViewToggle />
                {total}
              </Row>
              <Row className="chart-legend">
                <span className="accent">━ Single</span>
                <span style={{ color: "var(--series)" }}>━ Ao5</span>
              </Row>
            </Row>
            <HistoryChart history={history} averages={data.ao5 ?? []} range={range} onRange={setRange} />
          </div>
        )}
      </div>
    </div>
  );
}
/** Chart or table: the solves of the period drawn over time, or listed with their actions. */
function StatsViewToggle() {
  const id = useId();
  return (
    <Row className="stats-view-toggle">
      {[
        ["chart", "Chart", "IconChart"],
        ["table", "Table", "IconGrid"],
      ].map(([view, label, icon]) => (
        <Button key={view} action={"statsView:" + view} active={s.statsView === view} highlight={"stats-view" + id} icon={icon} title={label}>
          <span className="stats-view-label">{label}</span>
        </Button>
      ))}
    </Row>
  );
}
/** Every solve of the visible period, sorted as asked, each with its penalty, comment and delete buttons. */
function SolvesTable({
  history,
  range,
  total,
  sort,
  setSort,
  commented,
  setCommented,
}: { history: any[]; range: ChartRange; total: React.ReactNode } & SolveTableState) {
  const [shown, setShown] = useState(SOLVE_PAGE);
  const byTime = (a: any, b: any, direction: 1 | -1) =>
    a.time == null ? (b.time == null ? 0 : 1) : b.time == null ? -1 : (a.time - b.time) * direction;
  const rows = history
    .slice(range[0], range[1] + 1)
    .map((v, i) => {
      const index = range[0] + i,
        previous = history[index - 1];
      return {
        v,
        index,
        pb: v.time != null && v.time === v.best && (!previous || previous.best == null || previous.best > v.time),
      };
    })
    .filter((r) => !commented || r.v.comment);
  if (sort === "newest") rows.reverse();
  else if (sort === "fastest") rows.sort((a, b) => byTime(a.v, b.v, 1) || b.index - a.index);
  else if (sort === "slowest") rows.sort((a, b) => byTime(a.v, b.v, -1) || b.index - a.index);
  const commentCount = history.filter((v) => v.comment).length;
  return (
    <div className="panel history-panel">
      <Row className="between solves-bar">
        <Row>
          <StatsViewToggle />
          {total}
        </Row>
        <Row>
          <LocalSelect label="Sort solves" value={sort} options={SOLVE_SORTS} onChange={setSort} />
          <button
            type="button"
            className={"button " + (commented ? "soft" : "")}
            aria-pressed={commented}
            aria-label="Show only commented solves"
            title="Show only commented solves"
            onClick={(e) => {
              e.currentTarget.blur();
              setCommented(!commented);
            }}
          >
            <Icon name="IconComment" size={14} />
            <span className="solves-label">Commented</span>
            <span className="mono muted">{commentCount}</span>
          </button>
        </Row>
      </Row>
      <div className="solves-head muted">
        <span>#</span>
        <span>Time</span>
        <span>Date</span>
        <span>Actions</span>
      </div>
      <div className="scroll history-solves" key={`${range.join(":")}:${sort}:${commented}`}>
        {!rows.length && (
          <Empty>{commented ? "No commented solve yet. Add one with the bubble on a time." : "No solves match."}</Empty>
        )}
        {rows.slice(0, shown).map(({ v, index, pb }) => (
          <div key={v.id} className="solve-row">
            <button
              type="button"
              className="button history-row"
              title="Show the scramble and details"
              onClick={() => void s.action("solve:" + v.id)}
            >
              <span className="muted">{index + 1}</span>
              <span className={"mono " + (v.time == null ? "danger" : pb ? "accent" : "")}>
                {v.time == null ? "DNF" : fmtTime(v.time)}
              </span>
              <span className="history-tags">
                {pb && <span className="tag">PB</span>}
                {v.penalty === "+2" && <span className="tag muted">+2</span>}
              </span>
              <span className="muted">{v.displayDate}</span>
            </button>
            <span className="solve-row-actions">
              <Button action={`penalty:${v.id}:+2`} className={v.penalty === "+2" ? "soft" : ""} title="+2 penalty">
                +2
              </Button>
              <Button action={`penalty:${v.id}:dnf`} className={v.penalty === "dnf" ? "soft" : ""} title="Did not finish">
                DNF
              </Button>
              <Button
                action={"comment:" + v.id}
                icon="IconComment"
                className={v.comment ? "accent" : ""}
                title={v.comment ? "Edit comment" : "Add comment"}
              />
              <Button action={"delete:" + v.id} icon="IconTrash" className="danger" title="Delete solve" />
            </span>
            {v.comment && <p className="solve-comment">{v.comment}</p>}
          </div>
        ))}
        {rows.length > shown && (
          <button type="button" className="button solves-more" onClick={() => setShown(shown + SOLVE_PAGE)}>
            Show more ({rows.length - shown} left)
          </button>
        )}
      </div>
    </div>
  );
}
/**
 * A select menu held by its component rather than the app overlay, so it can open inside a dialog
 * without replacing it. It looks and moves like the app's select menus.
 */
function LocalSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    [anchor, setAnchor] = useState<DOMRect | null>(null),
    [index, setIndex] = useState(0);
  const pick = (id: T) => {
    setAnchor(null);
    onChange(id);
  };
  useEffect(() => {
    if (!anchor) return;
    // Captured before the app overlay's listener, so Escape does not also close a surrounding dialog.
    const key = (e: KeyboardEvent) => {
      if (!["Escape", "ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") setAnchor(null);
      else if (e.key === "Enter") pick(options[index].id);
      else
        setIndex((i) =>
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? options.length - 1
              : (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length,
        );
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [anchor, index]);
  const host = trigger.current?.closest(".app"),
    height = options.length * 42 + 18,
    below = anchor && anchor.bottom + 6 + height <= innerHeight - 12;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button active"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        onClick={(e) => {
          e.currentTarget.blur();
          setIndex(Math.max(0, options.findIndex((o) => o.id === value)));
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());
        }}
      >
        {options.find((o) => o.id === value)?.label}
        <Icon name="IconChevronDown" size={12} />
      </button>
      {anchor &&
        host &&
        createPortal(
          <div className="menu-backdrop local-menu" onClick={() => setAnchor(null)}>
            <div
              className="select-menu"
              role="listbox"
              aria-label={label}
              style={{
                left: Math.min(innerWidth - 292, Math.max(12, anchor.right - 280)),
                top: below ? anchor.bottom + 6 : Math.max(12, anchor.y - height - 6),
                transformOrigin: below ? "top right" : "bottom right",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {options.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  style={{ "--i": i } as React.CSSProperties}
                  className={"button menu-option " + (index === i ? "active" : "")}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => pick(o.id)}
                >
                  <span>{o.label}</span>
                  {o.id === value && <Icon name="IconCheck" />}
                </button>
              ))}
            </div>
          </div>,
          host,
        )}
    </>
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
const PROFILE_SECTIONS: Record<string, string> = {
  playground: "Timer",
  training: "Training",
  achievements: "Achievements",
};
/** Account page: the overview, or one of its sections opened from it as a page of its own. */
function Profile() {
  const p = s.profile;
  if (!p) return <Empty>Loading…</Empty>;
  const guest = s.user.isGuest,
    mode = s.profileMode in PROFILE_SECTIONS ? s.profileMode : "overview",
    title = PROFILE_SECTIONS[mode] ?? "Overview";
  return (
    <div className="page profile-page">
      {mode === "overview" ? (
        <PageHead
          lead={<Avatar user={guest ? { username: "G" } : p.user} size={36} />}
          title={guest ? "Guest" : p.user.username}
          sub={guest ? "Times stay on this device" : `Joined ${p.user.joined}`}
        >
          {guest && (
            <>
              <Button action="account:login" className="control">
                Sign in
              </Button>
              <Button action="account:register" className="primary">
                Create account
              </Button>
              <span className="control-gap" />
            </>
          )}
          <ProfileFilters />
        </PageHead>
      ) : (
        <PageHead
          lead={<Button action="back" icon="IconBack" className="control icon-only" title="Back to the overview" />}
          title={title}
          sub={s.label("puzzles", s.profilePuzzle)}
        >
          {mode === "training" && <ProfileFilters />}
          {mode === "playground" && <ProfileFilters scramble />}
          {mode === "achievements" && s.achievements && (
            <div className="achievement-total">
              <span className="mono muted">
                {s.achievements.unlocked} / {s.achievements.total}
              </span>
              <Progress ratio={s.achievements.total ? s.achievements.unlocked / s.achievements.total : 0} />
            </div>
          )}
        </PageHead>
      )}
      <section className="profile-main" aria-label={title}>
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
  );
}
function Achievements() {
  const items = s.achievements?.achievements ?? [],
    groups = [...new Set(items.map((a: any) => a.group))] as string[];
  let shown = 0;
  return (
    <>
      <Row className="wrap profile-toolbar-row">
        <Button action="menu:achievementGroups" className="control">
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
/** The guides open over the app: their list on the left, the chosen guide on the right. */
function GuidesDialog({ close }: { close: () => void }) {
  const page = (s.guidePage in GUIDES ? s.guidePage : "overviewGuide") as Guide;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal guides-modal" role="dialog" aria-modal="true" aria-label="Guides" onClick={(e) => e.stopPropagation()}>
        <nav className="guides-nav" aria-label="Guides">
          <span className="label guides-nav-title">Guides</span>
          {(Object.keys(GUIDES) as Guide[]).map((id) => (
            <Button key={id} action={"guidePage:" + id} className={"guides-nav-item " + (id === page ? "selected" : "")}>
              {GUIDE_NAMES[id]}
            </Button>
          ))}
        </nav>
        <div className="guides-main">
          <Button action="close" icon="IconClose" className="control icon-only guides-close" title="Close the guides" />
          <article
            className="scroll guides-body guide-content"
            onClick={(e) => {
              const button = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
              if (button) return void s.action(button.dataset.action!);
              const a = (e.target as HTMLElement).closest("a");
              if (!a) return;
              e.preventDefault();
              const href = a.getAttribute("href") ?? "",
                entry = Object.entries(GUIDES).find(([, v]) => v.path === href);
              if (entry) void s.action("guidePage:" + entry[0]);
              else if (href.startsWith("http")) void openExternal(href);
              else void s.action("nav:" + (href === "/training/" ? "training" : href === "/algorithms/" ? "algorithms" : "playground"));
            }}
          >
            <GuideContent page={page} puzzle={s.guidePuzzle} method={s.guideMethod} />
          </article>
        </div>
      </div>
    </div>
  );
}
const GUIDE_NAMES: Record<Guide, string> = {
  overviewGuide: "About Cubix",
  timerGuide: "Timer",
  algorithmsGuide: "Algorithms",
  trainingGuide: "Training",
  methodsGuide: "Solving methods",
  averagesGuide: "Ao5 and Ao12",
};
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
          (s.overlay === "scrambles" ? info : profile).scrambles.includes(v.id) &&
          // Cross + 1 scrambles belong to the training page; their times still show in the profile.
          (s.overlay !== "scrambles" || !v.id.startsWith("cross1-")),
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
const PUZZLE_COLUMNS = 4;
/** Overlays drawn as a dialog; the others are select menus anchored to their button. */
const isDialog = () => !!s.overlay && (s.overlay === "puzzles" || !options().values.length);
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
      // The puzzle dialog is a grid: arrows move by cell and row and stop at the edges.
      const step = { ArrowDown: PUZZLE_COLUMNS, ArrowUp: -PUZZLE_COLUMNS, ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (s.overlay === "puzzles" && step) {
        e.preventDefault();
        setIndex((i) => Math.min(count - 1, Math.max(0, i + step)));
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
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
  if (s.overlay === "puzzles") return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal puzzle-modal" role="dialog" aria-modal="true" aria-label="Puzzle" onClick={(e) => e.stopPropagation()}>
        <Row className="between"><h2>Puzzle</h2><Button action="close" icon="IconClose" title="Close puzzle choice" /></Row>
        <div className="puzzle-grid" ref={ref} role="listbox" style={{ gridTemplateColumns: `repeat(${PUZZLE_COLUMNS}, 1fr)` }}>
          {menu.values.map((v, i) => (
            <button
              key={v.id}
              role="option"
              aria-selected={v.id === menu.current}
              data-focused={index === i}
              className={"button puzzle-option " + (index === i ? "active " : "") + (v.id === menu.current ? "current" : "")}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void s.action(menu.action + ":" + v.id)}
            >
              <Icon name={"Puzzle" + v.id} size={30} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  if (menu.values.length) {
    const anchor = s.anchor,
      left = Math.min(
        innerWidth - 292,
        Math.max(12, anchor?.x ?? (innerWidth - 280) / 2),
      ),
      // Rows, padding and border: the menu only scrolls when the window is too short.
      height = Math.min(menu.values.length * 42 + 18, innerHeight - 32),
      below = !!anchor && anchor.bottom + 6 + height <= innerHeight - 12,
      top = anchor
        ? below
          ? anchor.bottom + 6
          : Math.max(12, anchor.y - height - 6)
        : Math.max(12, (innerHeight - height) / 2);
    return (
      <div className="menu-backdrop" onClick={close}>
        <div
          className="select-menu"
          ref={ref}
          role="listbox"
          style={{ left, top, maxHeight: height, transformOrigin: anchor ? (below ? "top left" : "bottom left") : "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.values.map((v, i) => (
            <button
              key={v.id}
              role="option"
              aria-selected={v.id === menu.current}
              data-focused={index === i}
              style={{ "--i": i } as React.CSSProperties}
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
  if (s.overlay === "guides") return <GuidesDialog close={close} />;
  if (s.overlay === "methods") {
    const methods = METHODS[s.guidePuzzle],
      method = methods.find((m) => m.id === s.guideMethod) ?? methods[0]!;
    return (
      <div className="modal-backdrop" onClick={close}>
        <div className="modal methods-modal" role="dialog" aria-modal="true" aria-label="Solving methods" onClick={(e) => e.stopPropagation()}>
          <Row className="between"><h2>Solving methods</h2><Button action="close" icon="IconClose" title="Close solving methods" /></Row>
          <div className="row wrap methods-tabs" role="group" aria-label="Puzzle">
            {PUZZLES.map((p) => (
              <Button key={p.id} action={"guidePuzzle:" + p.id} active={p.id === s.guidePuzzle} highlight="methods-puzzle">{p.label}</Button>
            ))}
          </div>
          <div className="row wrap methods-tabs" role="group" aria-label="Method">
            {methods.map((m) => (
              <Button key={m.id} action={"guideMethod:" + m.id} active={m === method} highlight="methods-method">{m.name}</Button>
            ))}
          </div>
          <div className="methods-body">
            <h3>{method.name}</h3>
            <p className="muted">{method.summary}</p>
            <ol>
              {method.steps.map((step, i) => (
                <li key={step.title}><span className="mono">{i + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    );
  }
  if (s.overlay === "learningGroups") return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal learning-groups-modal" role="dialog" aria-modal="true" aria-label="Group order" onClick={e => e.stopPropagation()}>
        <Row className="between"><h2>Group order · {s.learningMode}</h2><Button action="close" icon="IconClose" title="Close group order" /></Row>
        <LearningGroups key={s.learningMode} />
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
              <p className="muted solve-date">{solve.displayDate}</p>
              <div className="solve-scramble">
                <Alg text={solve.scramble} size={16} />
              </div>
              {solve.comment && <p className="solve-comment-text">{solve.comment}</p>}
              <Row className="wrap solve-actions-row">
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
    const unsubscribe = onEvent((event) => {
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
            KeyC: "trainingSetup",
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
    // Mouse back/forward buttons; Windows reports them as app commands instead (see electron/main.ts).
    const mouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (!navigator.userAgent.includes("Windows")) s.travel(e.button === 3);
    };
    addEventListener("keydown", key);
    addEventListener("mouseup", mouse);
    return () => {
      unsubscribe();
      removeEventListener("keydown", key);
      removeEventListener("mouseup", mouse);
    };
  }, []);
  const { w } = useViewport(),
    mobile = w <= MOBILE,
    // On the desktop a case opens beside the list, so the algorithms page stays in place.
    frameKey =
      s.page +
        (s.caseId && (mobile || s.page !== "algorithms") ? ":case" : "") +
        (s.page === "profile" ? ":" + s.profileMode : "") +
        (s.page === "training" ? ":" + s.trainingStep : "");
  return (
    <main
      className={
        "app " + (s.light ? "light " : "") + (s.running ? "is-running " : "") + (mobile ? "is-mobile" : "")
      }
      style={theme(s.themeName, s.light) as React.CSSProperties}
    >
      <MotionConfig reducedMotion="user">
        <div className={"shell" + (w < 1100 ? " side-compact" : "")}>
          {!mobile && <Sidebar />}
          <div className="content">
            {!s.ready ? (
              <Empty>{s.error || "Loading…"}</Empty>
            ) : (
              <AnimatePresence initial={false} custom={s.direction}>
                <Frame key={frameKey} mobile={mobile}>
                  {s.page === "training" && s.trainingStep === "setup" ? (
                    <TrainingSetup />
                  ) : ["playground", "training"].includes(s.page) ? (
                    <Practice />
                  ) : s.page === "algorithms" ? (
                    <Algorithms />
                  ) : (
                    <Profile />
                  )}
                </Frame>
              </AnimatePresence>
            )}
          </div>
          {mobile && <TabBar />}
        </div>
      </MotionConfig>
      <Toasts light={s.light} />
      {s.overlay && <Overlay key={s.overlay} />}
      <ErrorNotification message={s.error} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
