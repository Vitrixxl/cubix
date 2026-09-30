/** The frame around the pages: the sidebar or the phone tab bar, and the page transition. */
import { useEffect, useState } from "react";
import { motion, useIsPresent } from "motion/react";
import { store as s } from "./store";
import { Avatar, Button, Icon, Logo, type Props } from "./ui";

const SECTIONS: [page: string, label: string, icon: string, shortcut: string][] = [
  ["playground", "Timer", "IconTimer", "Alt 1"],
  ["algorithms", "Algorithms", "IconCases", "Alt 2"],
  ["training", "Training", "IconTarget", "Alt 3"],
  ["duel", "Duel", "IconSwords", "Alt 5"],
  ["profile", "Profile", "IconUser", "Alt 4"],
];

/**
 * Desktop navigation: a labelled sidebar. The wordmark, the puzzle every page works on, the sections by name, then
 * the guides, the settings and the account at the bottom. Narrow windows keep the icons with a small word under them.
 */
export function Rail() {
  const guest = s.user.isGuest;
  return (
    <nav className="nav rail" aria-label="Sections">
      <div className="rail-brand">
        <Logo size={18} />
        <span className="rail-wordmark">cubix</span>
      </div>
      <SideItem
        action="menu:puzzles"
        label={s.event().label}
        title="Choose a puzzle"
        className={"rail-puzzle " + (s.overlay === "puzzles" ? "open" : "")}
        icon={<Icon name={"Puzzle" + s.event().id} size={20} />}
        tail={<Icon name="IconChevronDown" size={12} />}
      />
      <div className="rail-group" role="list">
        {SECTIONS.map(([page, label, icon, shortcut]) => (
          <SideItem
            key={page}
            action={"nav:" + page}
            label={label}
            title={`${label} (${shortcut.replace(" ", "+")})`}
            selected={s.page === page}
            icon={<Icon name={icon} size={17} />}
            tail={<kbd className="rail-key">{shortcut}</kbd>}
          />
        ))}
      </div>
      <div className="rail-fill" />
      <div className="rail-group rail-foot">
        <SideItem action="help" label="Guides" icon={<Icon name="IconBook" size={17} />} selected={s.overlay === "guides"} />
        <SideItem
          action="settings"
          label="Settings"
          title="Settings (Alt+S)"
          selected={s.overlay === "settings"}
          icon={<Icon name="IconSettings" size={17} />}
          tail={<kbd className="rail-key">Alt S</kbd>}
        />
        <SideItem
          action={guest ? "account:login" : "settings"}
          label={guest ? "Guest" : s.user.username}
          title={guest ? "Sign in to keep your times in sync" : "Your account"}
          className="rail-account"
          icon={guest ? <span className="rail-avatar guest"><Icon name="IconUser" size={14} /></span> : <Avatar user={s.user} size={26} />}
          sub={guest ? "Sign in to sync" : "Signed in"}
        />
      </div>
    </nav>
  );
}

function SideItem({
  action,
  label,
  title,
  icon,
  tail,
  sub,
  selected = false,
  className = "",
}: { action: string; label: string; title?: string; icon: React.ReactNode; tail?: React.ReactNode; sub?: string; selected?: boolean } & Props) {
  return (
    <button
      type="button"
      className={"rail-cell " + (selected ? "selected " : "") + className}
      data-action={action}
      title={title ?? label}
      aria-current={selected ? "page" : undefined}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      <span className="rail-icon">{icon}</span>
      <span className="rail-text">
        <span className="rail-label">{label}</span>
        {sub && <span className="rail-sub">{sub}</span>}
      </span>
      {tail && <span className="rail-tail">{tail}</span>}
    </button>
  );
}

/** Phone navigation: a bottom tab bar, icon over word, the timer in the centre. */
const MOBILE_TABS: [page: string, label: string, icon: string][] = [
  ["algorithms", "Algorithms", "IconCases"],
  ["training", "Training", "IconTarget"],
  ["playground", "Timer", "IconTimer"],
  ["duel", "Duel", "IconSwords"],
  ["profile", "Profile", "IconUser"],
];

export function TabBar() {
  return (
    <nav className="nav tabbar" aria-label="Sections">
      {MOBILE_TABS.map(([page, label, icon]) => (
        <Button key={page} action={"nav:" + page} title={label} className={"tab-item " + (s.page === page ? "selected" : "")}>
          <Icon name={icon} size={20} />
          <span>{label}</span>
        </Button>
      ))}
    </nav>
  );
}

/**
 * Page frame: the new page fades in over a short slide (12px), the old one fades out where it stands. Rail pages
 * move vertically in the order of the sidebar; going deeper into a page moves sideways.
 */
const SHIFT = 12;
const variants = {
  enter: ({ direction, axis }: { direction: number; axis: string }) => ({
    opacity: 0,
    transform: axis === "x" ? `translateX(${direction * SHIFT}px)` : `translateY(${direction * SHIFT}px)`,
  }),
  center: { opacity: 1, transform: "translate(0px, 0px)" },
  exit: { opacity: 0, transition: { duration: 0.12 } },
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
      custom={{ direction: s.direction, axis: mobile ? "x" : s.axis }}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
    >
      {mounted && children}
    </motion.div>
  );
}
