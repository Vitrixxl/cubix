/** The frame around the pages: the sidebar or the phone tab bar, and the page transition. */
import { useEffect, useState } from "react";
import { motion, useIsPresent } from "motion/react";
import { BookOpen, ChevronsUpDown, Layers, Settings, Swords, Target, Timer, User, type LucideIcon } from "lucide-react";
import { store as s } from "./store";
import { Avatar, FADE, Icon, Logo, PuzzlePicker, type Props } from "./ui";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const SECTIONS: [page: string, label: string, icon: LucideIcon, shortcut: string][] = [
  ["playground", "Timer", Timer, "Alt 1"],
  ["algorithms", "Algorithms", Layers, "Alt 2"],
  ["training", "Training", Target, "Alt 3"],
  ["duel", "Duel", Swords, "Alt 5"],
  ["profile", "Profile", User, "Alt 4"],
];

const go = (action: string) => (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.blur();
  void s.action(action, e.currentTarget);
};

/**
 * Desktop navigation: a labelled column on the page background. The wordmark and the puzzle every page works on, the
 * sections by name, then the guides, the settings and the account at the bottom. Narrow windows keep the icons.
 */
export function Rail() {
  const guest = s.user.isGuest,
    e = s.event();
  return (
    <Sidebar collapsible="icon" className={cn("rail group-data-[side=left]:border-r-0", FADE)}>
      <SidebarHeader className="gap-3 pt-4">
        <div className="flex h-8 items-center gap-2.5 px-2 group-data-[collapsible=icon]:px-2">
          <Logo size={16} />
          <span className="text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">cubix</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <PuzzlePicker
              trigger={
                <SidebarMenuButton size="lg" aria-label={"Puzzle: " + e.label} className="gap-2.5 group-data-[collapsible=icon]:justify-center">
                  <Icon name={"Puzzle" + e.id} size={22} />
                  <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                    <span className="text-xs text-muted-foreground">Puzzle</span>
                    <span className="truncate font-medium">{e.label}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-0.5" aria-label="Sections">
            {SECTIONS.map(([page, label, I, shortcut]) => (
              <SidebarMenuItem key={page}>
                <SidebarMenuButton
                  data-action={"nav:" + page}
                  isActive={s.page === page}
                  aria-current={s.page === page ? "page" : undefined}
                  tooltip={`${label} · ${shortcut.replace(" ", "+")}`}
                  onClick={go("nav:" + page)}
                  className="h-9 text-muted-foreground data-active:text-foreground"
                >
                  <I />
                  <span>{label}</span>
                </SidebarMenuButton>
                <Kbd className="pointer-events-none absolute top-2 right-2 bg-transparent opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
                  {shortcut}
                </Kbd>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="pb-4">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton data-action="help" tooltip="Guides" onClick={go("help")} className="h-9 text-muted-foreground">
              <BookOpen />
              <span>Guides</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-action="settings" tooltip="Settings · Alt+S" onClick={go("settings")} className="h-9 text-muted-foreground">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
            <Kbd className="pointer-events-none absolute top-2 right-2 bg-transparent opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
              Alt S
            </Kbd>
          </SidebarMenuItem>
          <SidebarMenuItem className="mt-2">
            <SidebarMenuButton
              size="lg"
              data-action={guest ? "account:login" : "settings"}
              tooltip={guest ? "Sign in" : s.user.username}
              onClick={go(guest ? "account:login" : "settings")}
              className="gap-2.5"
            >
              {guest ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <User className="size-4" />
                </span>
              ) : (
                <Avatar user={s.user} size={32} />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{guest ? "Guest" : s.user.username}</span>
                <span className="truncate text-xs text-muted-foreground">{guest ? "Sign in to sync" : "Signed in"}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Phone navigation: a bottom tab bar, icon over word, the timer in the centre. */
const MOBILE_TABS: [page: string, label: string, icon: LucideIcon][] = [
  ["algorithms", "Algorithms", Layers],
  ["training", "Training", Target],
  ["playground", "Timer", Timer],
  ["duel", "Duel", Swords],
  ["profile", "Profile", User],
];

export function TabBar() {
  return (
    <nav className={cn("tabbar grid shrink-0 grid-cols-5 px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)]", FADE)} aria-label="Sections">
      {MOBILE_TABS.map(([page, label, I]) => (
        <button
          key={page}
          type="button"
          data-action={"nav:" + page}
          aria-current={s.page === page ? "page" : undefined}
          onClick={go("nav:" + page)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:bg-muted",
            s.page === page && "text-foreground",
          )}
        >
          <span className={cn("flex h-7 w-12 items-center justify-center rounded-lg transition-colors", s.page === page && "bg-muted text-primary")}>
            <I className="size-[18px]" />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Page frame: the new page fades in over a short slide (12px), the old one fades out where it stands. Sidebar pages
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
      className="absolute inset-0 flex min-h-0 flex-col"
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
