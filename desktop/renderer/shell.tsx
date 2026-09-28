/** The frame around the pages: sidebar or phone tab bar, and the page transition. */
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

/** Desktop navigation: a slim column with the puzzle on top, the sections, then help and settings at the bottom. */
export function Sidebar() {
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
