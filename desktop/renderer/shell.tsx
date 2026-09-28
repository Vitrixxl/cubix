/** The frame around the pages: the rail or the phone tab bar, and the page transition. */
import { useEffect, useState } from "react";
import { motion, useIsPresent } from "motion/react";
import { store as s } from "./store";
import { Avatar, Button, Icon, type Props } from "./ui";
const TABS: [page: string, label: string, icon: string, shortcut: string][] = [
  ["playground", "Timer", "IconCube", "Alt+1"],
  ["algorithms", "Algorithms", "IconGrid", "Alt+2"],
  ["training", "Training", "IconTimer", "Alt+3"],
  ["profile", "Account", "IconUser", "Alt+4"],
];

function TabIcon({ page, icon, size = 17 }: { page: string; icon: string; size?: number }) {
  return page === "profile" && !s.user.isGuest ? <Avatar user={s.user} size={size + 1} /> : <Icon name={icon} size={size} />;
}

/**
 * Desktop navigation: a rail of square cells, one column of the page grid. The puzzle sits in a cell as tall
 * as the page header so their lines meet, then one cell per section, then guides and settings at the bottom.
 * A cell names itself in a flush label cell on hover.
 */
export function Rail() {
  return (
    <nav className="nav rail" aria-label="Sections">
      <RailCell action="menu:puzzles" label={s.label("puzzles", s.puzzle)} hint="Choose a puzzle" className="rail-puzzle">
        <Icon name={"Puzzle" + s.puzzle} size={22} />
      </RailCell>
      <div className="rail-group" role="tablist">
        {TABS.map(([page, label, icon, shortcut]) => (
          <RailCell key={page} action={"nav:" + page} label={label} hint={shortcut} selected={s.page === page}>
            <TabIcon page={page} icon={icon} size={18} />
          </RailCell>
        ))}
      </div>
      <div className="rail-fill" />
      <div className="rail-group rail-foot">
        <RailCell action="help" label="Guides">
          <Icon name="IconBook" size={18} />
        </RailCell>
        <RailCell action="settings" label="Settings" hint="Alt+S" selected={s.overlay === "settings"}>
          <Icon name="IconSettings" size={18} />
        </RailCell>
      </div>
    </nav>
  );
}

function RailCell({
  action,
  label,
  hint,
  selected = false,
  className = "",
  children,
}: { action: string; label: string; hint?: string; selected?: boolean } & Props) {
  return (
    <button
      type="button"
      className={"rail-cell " + (selected ? "selected " : "") + className}
      data-action={action}
      aria-label={label}
      aria-current={selected ? "page" : undefined}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {children}
      <span className="rail-tip" aria-hidden="true">
        {label}
        {hint && <span className="rail-tip-hint">{hint}</span>}
      </span>
    </button>
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

export function TabBar() {
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

/**
 * Page frame. Phones slide pages sideways like a carousel; the desktop slides the pages of its rail up and
 * down, in their order, and slides sideways when going deeper into a page. Animating `transform` keeps it on the compositor.
 */
const SLIDE = {
  enter: (direction: number) => ({ transform: `translateX(${direction * 100}%)` }),
  center: { transform: "translateX(0%)" },
  exit: (direction: number) => ({ transform: `translateX(${direction * -100}%)` }),
};

/** The desktop slides pages vertically, in the order of the rail. */
const SLIDE_Y = {
  enter: (direction: number) => ({ transform: `translateY(${direction * 100}%)` }),
  center: { transform: "translateY(0%)" },
  exit: (direction: number) => ({ transform: `translateY(${direction * -100}%)` }),
};

export function Frame({ children, mobile }: { mobile: boolean } & Props) {
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
      variants={mobile || s.axis === "x" ? SLIDE : SLIDE_Y}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {mounted && children}
    </motion.div>
  );
}
