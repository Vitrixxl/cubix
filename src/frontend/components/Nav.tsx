import type { Route } from "../state";
import { PuzzlePicker } from "./PuzzlePicker";
import { Avatar } from "./Avatar";
import { IconGrid, IconTimer, IconUser, IconUsers, IconCube } from "./icons";
import { routePath } from "../lib/navigation";
import type { UserDto } from "../../shared/types";

export const NAV: { page: Route["page"]; label: string; icon: typeof IconGrid }[] = [
  { page: "playground", label: "Timer", icon: IconCube },
  { page: "algorithms", label: "Algorithms", icon: IconGrid },
  { page: "training", label: "Training", icon: IconTimer },
  { page: "community", label: "Friends", icon: IconUsers },
  { page: "profile", label: "Account", icon: IconUser },
];

interface Props { active: Route["page"]; onNavigate: (page: Route["page"]) => void; user: UserDto | null; chatActivity: boolean; }

/** Two floating islands: the puzzle alone on the left, icon tabs on the right where only the active one shows its label. */
export function Nav({ active, onNavigate, user, chatActivity }: Props) {
  return <nav className="nav" aria-label="Main navigation" data-timer-chrome>
    <div className="nav-island"><PuzzlePicker /></div>
    <div className="nav-island nav-links">
      {NAV.map(({ page, label, icon: Icon }, index) => {
        const current = active === page;
        const avatar = page === "profile" && user && !user.isGuest;
        return <a key={page} href={routePath({ page } as Route)} className={`nav-item ${current ? "active" : ""}`} aria-current={current ? "page" : undefined}
          aria-keyshortcuts={`Alt+${index + 1}`} title={`${label} (Alt+${index + 1})`}
          onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(page); } }}>
          {avatar ? <Avatar user={user} /> : <Icon />}<span className="nav-label">{label}</span>
          {page === "community" && chatActivity && <span className="chat-activity-dot" role="status" aria-label="New messages" />}
        </a>;
      })}
    </div>
  </nav>;
}
