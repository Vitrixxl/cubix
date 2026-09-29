/** Dialogs and select menus drawn over the app: settings, guides, methods, search, solves and menus. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { store as s, catalog, matches } from "./store";
import { call, openExternal } from "./bridge";
import { accents } from "./theme";
import { LearningGroups } from "./LearningGroups";
import { fmtSolve } from "../../src/client/lib/format";
import { GuideContent } from "../guides/Content";
import { METHODS } from "../../src/shared/methods";
import { EVENTS, PUZZLES } from "../../src/shared/puzzles";
import { GUIDES, type Guide } from "../guides/pages";
import { Alg, Avatar, Button, Diagram, Icon, MOBILE, Row } from "./ui";
import { TimerStats } from "./stats";
/** A settings row: its name on the left, its controls as cells flush against the right edge, full row height. */
function SettingRow({ label, children }: { label: string } & { children?: React.ReactNode }) {
  return (
    <div className="settings-row">
      <strong>{label}</strong>
      <div className="settings-cells">{children}</div>
    </div>
  );
}

function Appearance() {
  return (
    <>
      <SettingRow label="Theme">
        <Button action="light:dark" active={!s.light}>
          Dark
        </Button>
        <Button action="light:light" active={s.light}>
          Light
        </Button>
      </SettingRow>
      <SettingRow label="Accent">
        {Object.entries(accents).map(([name, color]) => (
          <Button
            key={name}
            action={"theme:" + name}
            title={name}
            className={"settings-swatch " + (s.themeName === name ? "chosen" : "")}
            style={{ "--swatch": color } as React.CSSProperties}
          />
        ))}
      </SettingRow>
      <SettingRow label="Help">
        <Button action="help">Open the guides</Button>
      </SettingRow>
    </>
  );
}

function AccountForm() {
  const [username, setUser] = useState(""),
    [password, setPassword] = useState("");
  return (
    <form
      className="account-form"
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
      <div className="auth-tabs">
        <Button action="authMode:login" active={s.login}>
          Sign in
        </Button>
        <Button action="authMode:register" active={!s.login}>
          Create account
        </Button>
      </div>
      <p className="muted settings-text">
        {s.login
          ? "Your local times are merged into your account."
          : "An account keeps your times, statistics and achievements in sync between devices."}
      </p>
      <label className="auth-field">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUser(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={s.login ? "current-password" : "new-password"}
          required
        />
      </label>
      {!s.login && (
        <small className="muted settings-text">
          3–24 letters, digits or underscores. Password: 10 characters or
          more.
        </small>
      )}
      <button type="submit" className="button primary auth-submit" disabled={s.saving}>
        {s.saving ? "One moment…" : s.login ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}

/** Settings: sections under a header line, rows split by lines, every control a cell flush with them. */
function Settings() {
  const guest = s.user.isGuest;
  return (
    <div className="settings">
      <section className="settings-section">
        <h3 className="settings-head">Account</h3>
        {guest ? (
          <AccountForm />
        ) : (
          <div className="settings-row settings-user">
            <span className="settings-user-name">
              <Avatar user={s.user} size={36} />
              <span className="col">
                <strong>{s.user.username}</strong>
                <small className="muted">Joined {s.profile?.user?.joined}</small>
              </span>
            </span>
            <div className="settings-cells">
              <Button action="logout">Sign out</Button>
            </div>
          </div>
        )}
      </section>
      <section className="settings-section">
        <h3 className="settings-head">Appearance</h3>
        <Appearance />
      </section>
    </div>
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
              {GUIDES[id].name}
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

function options(): { action: string; values: any[]; current: string } {
  const info = s.info(),
    profile = s.info(s.profilePuzzle);
  switch (s.overlay) {
    case "puzzles":
      return {
        action: "puzzle",
        values: EVENTS,
        current: s.event().id,
      };
    case "profilePuzzles":
      return {
        action: "profilePuzzle",
        values: EVENTS,
        current: s.event(s.profilePuzzle, s.profileSolveMode).id,
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
              (s.achievements?.achievements ?? []).map(
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

/**
 * Where a menu opens: flush against the cell that opened it, its lines on the cell's. A rail cell opens it beside
 * itself, top lines aligned; any other cell under itself (above when there is no room), left lines aligned, or right
 * lines when it would leave the window. On phones it spans the width under the cell's row. The anchor is the
 * cell's line rectangle (store.ts), so sharing a line means overlapping it by 1px.
 */
function placeMenu(anchor: DOMRect | null, width: number, natural: number, mobile: boolean) {
  const room = innerHeight - (mobile ? 64 : 0);
  if (!anchor) {
    const height = Math.min(natural, room - 32);
    return { left: Math.max(0, (innerWidth - width) / 2), top: Math.max(16, (room - height) / 2), height, up: false };
  }
  if (!mobile && anchor.left < 2) {
    const height = Math.min(natural, room);
    return { left: anchor.right - 1, top: Math.max(0, Math.min(anchor.top, room - height)), height, up: false };
  }
  const left = mobile ? 0 : anchor.left + width > innerWidth ? Math.max(0, anchor.right - width) : anchor.left,
    below = room - anchor.bottom + 1,
    up = natural > below && anchor.top > below,
    height = Math.min(natural, up ? anchor.top + 1 : below);
  return { left, top: up ? anchor.top + 1 - height : anchor.bottom - 1, height, up };
}

export function Overlay() {
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
  if (s.overlay === "puzzles" || menu.values.length) {
    const puzzles = s.overlay === "puzzles",
      count = menu.values.length,
      lastRow = count % PUZZLE_COLUMNS || PUZZLE_COLUMNS,
      mobile = innerWidth <= MOBILE,
      width = mobile ? innerWidth : puzzles ? PUZZLE_COLUMNS * 104 + 2 : Math.max(240, s.anchor?.width ?? 0),
      // Rows (41px with their line) or puzzle cells, and the border: the menu only scrolls when the window is short.
      natural = puzzles ? Math.ceil(count / PUZZLE_COLUMNS) * (mobile ? 85 : 93) + 1 : count * 41 + 1,
      place = placeMenu(s.anchor, width, natural, mobile);
    return (
      <div className="menu-backdrop" onClick={close}>
        <div
          className={"select-menu " + (puzzles ? "puzzle-menu " : "") + (place.up ? "up" : "")}
          ref={ref}
          role="listbox"
          aria-label={puzzles ? "Puzzle" : undefined}
          style={{ left: place.left, top: place.top, width, maxHeight: place.height }}
          onClick={(e) => e.stopPropagation()}
        >
          {puzzles ? (
            <div className="puzzle-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${PUZZLE_COLUMNS}, 1fr)` }}>
              {menu.values.map((v, i) => (
                <button
                  key={v.id}
                  role="option"
                  aria-selected={v.id === menu.current}
                  data-focused={index === i}
                  className={
                    "button puzzle-option " +
                    (index === i ? "active " : "") +
                    (v.id === menu.current ? "current " : "") +
                    (i % PUZZLE_COLUMNS === PUZZLE_COLUMNS - 1 ? "edge-right " : "") +
                    (i >= count - lastRow ? "edge-bottom" : "")
                  }
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => void s.action(menu.action + ":" + v.id)}
                >
                  <Icon name={"Puzzle" + v.id} size={28} />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
          ) : (
            menu.values.map((v, i) => (
              <button
                key={v.id}
                role="option"
                aria-selected={v.id === menu.current}
                data-focused={index === i}
                className={"button menu-option " + (index === i ? "active " : "") + (v.id === menu.current ? "current" : "")}
                onMouseEnter={() => setIndex(i)}
                onClick={() => void s.action(menu.action + ":" + v.id)}
              >
                {menu.action.toLowerCase().includes("puzzle") && <Icon name={"Puzzle" + v.id} size={20} />}
                <span>{v.label}</span>
                {v.id === menu.current && <Icon name="IconCheck" />}
              </button>
            ))
          )}
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
