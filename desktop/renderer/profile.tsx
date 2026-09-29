/** The account page: overview, timer, training and achievements. */
import { shortId } from "../../src/client/lib/caseState";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { store as s, matches } from "./store";
import { fmtSolve, fmtTime, best, bestAverage } from "../../src/client/lib/format";
import { Avatar, Button, Diagram, Empty, Icon, Menu, PageHead, Progress, type Props, Row, plural } from "./ui";
import { TimerStats } from "./stats";
import { DUELS_KEY, ROUNDS, battleRecord, type DuelRecord } from "./duelClient";
import { eventInfo, eventLabel } from "../../src/shared/puzzles";
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** The next achievement to reach, by progress. */
function nextAchievement() {
  return (s.achievements?.achievements ?? [])
    .filter((a: any) => !a.unlocked)
    .sort((a: any, b: any) => b.ratio - a.ratio)[0];
}

/** How many rows of `row` px, `gap` px apart, fit in the element's height. */
function useFit(row: number, gap = 0) {
  const ref = useRef<HTMLElement>(null),
    [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setFit(Math.max(0, Math.floor((el.clientHeight + gap) / (row + gap))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [row, gap]);
  return [ref, fit] as const;
}

const CHART_SOLVES = 100;

/** The last solves and their Ao5 over a time axis, the best of them ringed and the latest dotted. */
function TimerChart({ times, averages }: { times: (number | null)[]; averages: (number | null)[] }) {
  const from = Math.max(0, times.length - CHART_SOLVES),
    singles = times.slice(from),
    ao5 = averages.slice(from),
    finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v),
    values = [...singles, ...ao5].filter(finite);
  const low = Math.min(...values),
    high = Math.max(low + 1, Math.max(...values)),
    x = (i: number) => (singles.length === 1 ? 50 : (i / (singles.length - 1)) * 100),
    y = (v: number) => 6 + (1 - (v - low) / (high - low)) * 88,
    // A DNF or a missing average breaks the line rather than joining its neighbours.
    line = (points: (number | null)[]) =>
      points.map((v, i) => (finite(v) ? `${finite(points[i - 1]) ? "L" : "M"}${x(i)} ${y(v)}` : "")).join(" "),
    kept = singles.filter(finite),
    best = singles.indexOf(Math.min(...kept)),
    last = singles.findLastIndex(finite);
  const dot = (i: number, cls: string) => (
    <i className={"sparkline-dot " + cls} style={{ left: x(i) + "%", top: y(singles[i]!) + "%" }} />
  );
  return (
    <span className="ov-chart" aria-hidden="true">
      <span className="ov-chart-axis">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="mono" style={{ top: 6 + (i / 3) * 88 + "%" }}>
            {fmtTime(high - ((high - low) * i) / 3)}
          </span>
        ))}
      </span>
      <span className="ov-chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M0 ${6 + (i / 3) * 88} H100`} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={line(ao5)} fill="none" stroke="var(--series)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={line(singles)} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {best !== last && dot(best, "best")}
        {dot(last, "last")}
      </span>
    </span>
  );
}

const RECENT_ROW = 32;

/** The hour for today's solves, the day for older ones. */
const solvedAt = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : shortDate(iso);
};

/** The latest timer solves, newest first, as many as the column holds. */
function RecentSolves({ history }: { history: any[] }) {
  // The first row is the column's title.
  const [ref, fit] = useFit(RECENT_ROW),
    shown = history.slice(Math.max(0, history.length - Math.max(0, fit - 1))).reverse();
  return (
    <span ref={ref} className="ov-recent">
      <small className="ov-recent-row ov-recent-title muted">Last solves</small>
      {shown.map((v, i) => (
        <span key={v.id ?? i} className="ov-recent-row">
          <small className="mono muted">{history.length - i}</small>
          <span className={"mono " + (v.time == null ? "danger" : "")}>{v.time == null ? "DNF" : fmtTime(v.time)}</span>
          <small className="muted">{solvedAt(v.at)}</small>
        </span>
      ))}
    </span>
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
      <Menu action="profilePuzzles" icon={"Puzzle" + s.event(s.profilePuzzle, s.profileSolveMode).id}>
        {s.event(s.profilePuzzle, s.profileSolveMode).label}
      </Menu>
      {scramble && <Menu action="profileScrambles">{s.label("scrambles", s.profileScramble)}</Menu>}
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
      .slice(0, 40)
      .map((a: any) => ({ label: a.title, value: `${Math.round(a.ratio * 100)}%`, ratio: a.ratio })),
    recent = (s.achievements?.achievements ?? [])
      .filter((a: any) => a.unlocked && a.unlockedAt)
      .sort((a: any, b: any) => (a.unlockedAt < b.unlockedAt ? 1 : -1))
      .slice(0, 3),
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
    timerAverages: (p.playground?.ao5 ?? []) as (number | null)[],
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
    recent,
    activity,
    latest,
  };
}

type OverviewData = ReturnType<typeof overviewData>;

/** The timer's figures as a row of cells, the best single leading. */
function TimerFigures({ d }: { d: OverviewData }) {
  const t = d.timer;
  return (
    <span className="ov-figures">
      {[
        ["Best single", t.best, "lead"],
        ["Best Ao5", t.bestAo5, ""],
        ["Best Ao12", t.bestAo12, ""],
        ["Ao5", t.ao5, ""],
        ["Ao12", t.ao12, ""],
        ["Mean", t.mean, ""],
      ].map(([label, value, className]) => (
        <span key={label} className={"ov-figure " + className}>
          <small className="muted">{label}</small>
          <span className="ov-figure-value mono">{t.count ? fmtTime(value as number | null) : "—"}</span>
        </span>
      ))}
    </span>
  );
}

type GaugeSection = { action: string; label: string; ratio: number; value: string; suffix: string; detail: string };

const gaugeSections = (d: OverviewData): GaugeSection[] => [
  {
    action: "profileMode:training",
    label: "Training",
    ratio: d.learnedRatio,
    value: String(d.trained),
    suffix: `/ ${d.cases.length} cases`,
    detail: `${d.learned} learned · ${plural(d.trainingSolves, "solve")}`,
  },
  {
    action: "profileMode:achievements",
    label: "Achievements",
    ratio: d.unlockedRatio,
    value: String(d.unlocked),
    suffix: `/ ${d.total} unlocked`,
    detail: d.achievementDetail,
  },
];

/** Ring, figure and detail on one line, the section's own content underneath. */
function GaugeCard({ g, className = "", children }: { g: GaugeSection; className?: string } & Props) {
  return (
    <Go action={g.action} className={"ov-card ov-ring-card " + className} label={`${g.label}: ${g.value} ${g.suffix}. ${g.detail}`}>
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
      {children}
    </Go>
  );
}

const GOAL_ROW = 18,
  GOAL_GAP = 9;

/** The closest achievements, as many as the pane holds, over the latest ones unlocked. */
function AchievementGoals({ d }: { d: OverviewData }) {
  const [ref, fit] = useFit(GOAL_ROW, GOAL_GAP);
  return (
    <>
      <span ref={ref} className="ov-goals">
        <MiniBars rows={d.goals.slice(0, fit)} />
      </span>
      {d.recent.length > 0 && (
        <span className="ov-unlocked">
          <small className="muted">Recently unlocked</small>
          {d.recent.map((a: any) => (
            <span key={a.id} className="ov-unlocked-row">
              <Icon name="IconTrophy" size={14} />
              <span className="ov-unlocked-title">{a.title}</span>
              <small className="muted">{a.unlockedDate}</small>
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/** Battles raced on this device, newest first. */
const battles = (): DuelRecord[] => s.prefs[DUELS_KEY] ?? [];
const RESULT_MARK = { win: "W", loss: "L", draw: "D" } as const;
const ao5Text = (v: number | null) => (v === null ? "DNF" : fmtTime(v));
const battleEvent = (b: DuelRecord) => {
  const e = eventInfo(b.event);
  return e ? eventLabel(e.puzzle, e.solveMode) : b.event;
};
const record = battleRecord;

/** The latest battles, as many as the pane holds: result, opponent and both averages. */
function RecentBattles() {
  const list = battles(),
    [ref, fit] = useFit(RECENT_ROW);
  return (
    <Go action="profileMode:duels" className="ov-card ov-battles" label={`Battles: ${list.length ? record(list) : "none yet"}`}>
      <span className="ov-card-head">
        <span className="ov-card-title">Battles</span>
        <small className="muted">{list.length ? record(list) : "No battles yet"}</small>
        <Icon name="IconChevronRight" size={14} />
      </span>
      <span ref={ref} className="ov-battle-list">
        {!list.length && <small className="muted">Race another cuber from Duel: your results land here.</small>}
        {list.slice(0, fit).map((b) => (
          <span key={b.id} className="ov-battle">
            <span className={"battle-mark mono " + b.result}>{RESULT_MARK[b.result]}</span>
            <span className="ov-battle-name">{b.opponent}</span>
            <span className="mono">
              {ao5Text(b.ao5[0])} <span className="muted">vs</span> {ao5Text(b.ao5[1])}
            </span>
            <small className="muted">{solvedAt(b.at)}</small>
          </span>
        ))}
      </span>
    </Go>
  );
}

/** Every battle kept on this device: result, opponent, event, both averages and the five rounds. */
function Battles() {
  const list = battles();
  if (!list.length)
    return (
      <div className="empty col center">
        <span>No battles yet.</span>
        <Button action="nav:duel" className="primary">
          Find an opponent
        </Button>
      </div>
    );
  return (
    <div className="battles">
      <div className="battle-row battle-head label">
        <span />
        <span>Opponent</span>
        <span>You</span>
        <span>Them</span>
        <span className="battle-rounds">Rounds</span>
        <span>Date</span>
      </div>
      <div className="scroll">
        {list.map((b) => (
          <div key={b.id} className="battle-row">
            <span className={"battle-mark mono " + b.result}>{RESULT_MARK[b.result]}</span>
            <span className="battle-who">
              <strong>{b.opponent}</strong>
              <small className="muted">{battleEvent(b)}</small>
            </span>
            <span className={"mono " + (b.result === "win" ? "good" : "")}>{ao5Text(b.ao5[0])}</span>
            <span className={"mono " + (b.result === "loss" ? "good" : "")}>{ao5Text(b.ao5[1])}</span>
            <span className="battle-rounds mono">
              {[...Array(ROUNDS).keys()].map((r) => (
                <span key={r} className="battle-round">
                  <span>{b.mine[r] ? fmtSolve(b.mine[r]!.ms, b.mine[r]!.penalty) : "—"}</span>
                  <span className="muted">{b.theirs[r] ? fmtSolve(b.theirs[r]!.ms, b.theirs[r]!.penalty) : "—"}</span>
                </span>
              ))}
            </span>
            <small className="muted">{shortDate(b.at)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Overview as a grid of panes whose lines meet: activity and training on top, the timer (figures, curve and latest
 * solves) and achievements filling the rest.
 */
function Overview() {
  const p = s.profile,
    d = overviewData(),
    [training, achievements] = gaugeSections(d),
    charted = d.timerTimes.filter((v: number | null) => v != null).length >= 2;
  return (
    <div className="overview">
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
      <GaugeCard g={training} className="ov-training">
        <MiniBars rows={d.stages} />
      </GaugeCard>
      <Go action="profileMode:playground" className="ov-card ov-timer" label={`Timer: ${d.timerDetail}`}>
        <span className="ov-card-head">
          <span className="ov-card-title">Timer</span>
          <small className="muted">{d.timerDetail}</small>
          {charted && (
            <span className="chart-legend">
              <span className="accent">━ Single</span>
              <span style={{ color: "var(--series)" }}>━ Ao5</span>
            </span>
          )}
          <Icon name="IconChevronRight" size={14} />
        </span>
        <TimerFigures d={d} />
        <span className="ov-timer-body">
          <span className="ov-timer-chart">
            {charted ? (
              <TimerChart times={d.timerTimes} averages={d.timerAverages} />
            ) : (
              <span className="ov-chart-empty muted">Your progress curve appears after two timed solves.</span>
            )}
          </span>
          {d.history.length > 0 && <RecentSolves history={d.history} />}
        </span>
      </Go>
      <GaugeCard g={achievements} className="ov-achievements">
        <AchievementGoals d={d} />
      </GaugeCard>
      <RecentBattles />
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

const PROFILE_SECTIONS: Record<string, string> = {
  playground: "Timer",
  training: "Training",
  achievements: "Achievements",
  duels: "Battles",
};

/** Account page: the overview, or one of its sections opened from it as a page of its own. */
export function Profile() {
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
          sub={mode === "duels" ? record(battles()) : s.event(s.profilePuzzle, s.profileSolveMode).label}
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
        ) : mode === "duels" ? (
          <Battles />
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
        <Menu action="achievementGroups">{s.achievementGroup === "all" ? "All puzzles" : s.achievementGroup}</Menu>
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
