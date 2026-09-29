/** The training setup screen: what to practise, before the timer. */
import { isLearningTrack, isReviewMode, learningCases, learningTrackOf, reviewCases, trainingModeOptions } from "../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../src/shared/crossPlusOne";
import { shortId } from "../../src/client/lib/caseState";
import { store as s, catalog, matches } from "./store";
import { Button, Diagram, Icon, PageHead, type Props, plural } from "./ui";
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
export function TrainingSetup() {
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

/** Start of a setup; `big` is the full-width one along the bottom of a pane, a plain word in mono without icon. */
function SetupStart({ action, disabled = false, big = false, children }: { action: string; disabled?: boolean; big?: boolean } & Props) {
  return (
    <Button action={action} className={"primary setup-start " + (big ? "mono" : "")} icon={big ? undefined : "IconTimer"} disabled={disabled}>
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
          <p className="muted">Scrambles whose back block (a back F2L pair with its two cross edges) takes exactly the chosen number of moves, held with white on the bottom and green in front (z2).</p>
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
        <SetupStart action="trainingStart:cross1" big />
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
        <SetupStart action={"trainingStart:cases:" + mode} disabled={review && !pool.length} big />
      </div>
    </div>
  );
}
