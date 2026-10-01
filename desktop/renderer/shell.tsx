/** The frame around the pages: the sidebar or the phone tab bar, and the page transition. */
import { useEffect, useState } from "react";
import { motion, useIsPresent } from "motion/react";
import { BookA, BookOpen, Boxes, ChevronsUpDown, Dumbbell, GraduationCap, LogOut, Settings, Swords, Timer, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { store as s, run } from "./store";
import { Avatar, FADE, Icon, PuzzlePicker, SIDEBAR_WIDE, useViewport, type Props } from "./ui";
import { Logo, Wordmark } from "./logo";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Button as UiButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router";
import { pageUrl } from "./navigation";
import type { PuzzleId } from "../../src/shared/puzzles";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
/** The sections: a mortarboard for the method courses, a cube library for the algorithms, a dumbbell for the drills. */
const SECTIONS: [page: string, label: string, icon: LucideIcon, shortcut: string][] = [
  ["playground", "Timer", Timer, "Alt 1"],
  ["algorithms", "Algorithms", Boxes, "Alt 2"],
  ["training", "Training", Dumbbell, "Alt 3"],
  ["duel", "Duel", Swords, "Alt 4"],
  ["learn", "Learn", GraduationCap, "Alt 5"],
];

/** The player's face: the account's initials. */
function Me({ size = 32 }: { size?: number }) {
  return <Avatar name={s.user.username} size={size} />;
}

/**
 * Desktop navigation: a labelled column on the page background. The wordmark and the puzzle every page works on, the
 * sections by name (the name itself leads to the timer), then the guides, the settings and, last, the account: the profile link with its own sign-out
 * icon button on its right. Narrow windows keep the icons.
 */
export function Rail() {
  const e = s.event(),
    profile = s.page === "profile",
    { open, toggleSidebar } = useSidebar(),
    // Below this width the sidebar always keeps to its icons.
    foldable = useViewport().w > SIDEBAR_WIDE;
  return (
    // Folded, the icons are named by their tooltips: these come almost at once, and move from icon to icon instantly.
    <TooltipProvider delay={open ? 400 : 80} closeDelay={0}>
    <Sidebar collapsible="icon" className={cn("rail border-sidebar-border", FADE)}>
      <SidebarHeader className="pt-4">
        {/* The name, and the button folding the sidebar to its icons; folded, the logo turns into that button on hover. */}
        <div data-brand="" className="group/brand flex h-9 items-center gap-2.5 pl-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pl-0">
          {/* The name leads to the timer, the app's home. */}
          <Link
            to={pageUrl("playground", { puzzle: s.puzzle as PuzzleId })}
            data-action="nav:home"
            aria-label="Qbix · Timer"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[collapsible=icon]:flex-none",
              foldable && "group-data-[collapsible=icon]:group-hover/brand:hidden",
            )}
          >
            <Logo size={22} />
            <Wordmark className="text-xl group-data-[collapsible=icon]:hidden" />
          </Link>
          {foldable && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <UiButton
                    variant="ghost"
                    size="icon"
                    data-action="sidebar:toggle"
                    aria-label={open ? "Collapse the sidebar" : "Expand the sidebar"}
                    onClick={toggleSidebar}
                    className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:group-hover/brand:flex"
                  />
                }
              >
                {open ? <PanelLeftClose /> : <PanelLeftOpen />}
              </TooltipTrigger>
              <TooltipContent side="right">{open ? "Collapse" : "Expand"} · Ctrl+B</TooltipContent>
            </Tooltip>
          )}
        </div>
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
                  render={<Link to={pageUrl(page, { puzzle: s.puzzle as PuzzleId })} />}
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
            <SidebarMenuButton data-action="notation" tooltip="Notation" onClick={run("notation")} className="h-9 text-muted-foreground">
              <BookA />
              <span>Notation</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-action="help" tooltip="Guides" onClick={run("help")} className="h-9 text-muted-foreground">
              <BookOpen />
              <span>Guides</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-action="settings" tooltip="Settings · Alt+S" onClick={run("settings")} className="h-9 text-muted-foreground">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
            <Kbd className="pointer-events-none absolute top-2 right-2 bg-transparent opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
              Alt S
            </Kbd>
          </SidebarMenuItem>
          {/* The puzzle every page works on, at the foot of the sidebar above the account. */}
          <SidebarMenuItem>
            <PuzzlePicker
              side="right"
              align="end"
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
          {/* The account: the profile link, and beside it on the right its own sign-out icon button. */}
          <SidebarMenuItem className="mt-1 flex items-center gap-1 border-t pt-2 group-data-[collapsible=icon]:flex-col">
            <SidebarMenuButton
              data-action="nav:profile"
              aria-current={profile ? "page" : undefined}
              tooltip={s.user.username + " · Profile"}
              render={<Link to={pageUrl("profile", { puzzle: s.puzzle as PuzzleId })} />}
              className="h-9 min-w-0 flex-1 gap-2.5 group-data-[collapsible=icon]:p-1!"
            >
              <Me size={24} />
              <span className="truncate font-medium">{s.user.username}</span>
            </SidebarMenuButton>
            <Tooltip>
              <TooltipTrigger
                render={
                  <UiButton variant="ghost" size="icon" data-action="logout" aria-label="Log out" onClick={run("logout")} className="size-9 shrink-0 text-muted-foreground group-data-[collapsible=icon]:size-8 hover:text-destructive" />
                }
              >
                <LogOut />
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
}

/**
 * Phone navigation follows the sidebar; Learn comes after Duel, the account last.
 */
const MOBILE_TABS: [page: string, label: string, icon: LucideIcon | null][] = [
  ["playground", "Timer", Timer],
  ["algorithms", "Algorithms", Boxes],
  ["training", "Training", Dumbbell],
  ["duel", "Duel", Swords],
  ["learn", "Learn", GraduationCap],
  ["profile", "Account", null],
];

export function TabBar() {
  return (
    <nav
      className={cn("tabbar grid shrink-0 grid-cols-6 border-t bg-background px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)]", FADE)}
      aria-label="Sections"
    >
      {MOBILE_TABS.map(([page, label, I]) => {
        const here = s.page === page;
        return (
          <Link
            key={page}
            data-action={"nav:" + page}
            aria-current={here ? "page" : undefined}
            to={pageUrl(page, { puzzle: s.puzzle as PuzzleId })}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-medium tracking-tight text-muted-foreground transition-colors outline-none focus-visible:bg-muted",
              here && "text-foreground",
            )}
          >
            <span className={cn("flex h-8 w-full max-w-14 items-center justify-center rounded-lg transition-colors", here && "bg-primary/12 text-primary")}>
              {I ? <I className="size-5" /> : <Me size={22} />}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Page frame. Switching sections is a vertical carousel: the new page slides in over the full height from below when
 * it comes later in the navigation order (from above otherwise) while the old one leaves the other way. Going deeper
 * into a page keeps a short sideways slide with a fade.
 */
export interface Slide {
  direction: number;
  axis: "x" | "y";
}
const SHIFT = 12,
  CAROUSEL = { duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const;
const variants = {
  enter: ({ direction, axis }: Slide) => (axis === "y" ? { opacity: 1, x: 0, y: `${direction * 100}%` } : { opacity: 0, x: direction * SHIFT, y: "0%" }),
  center: { opacity: 1, x: 0, y: "0%" },
  exit: ({ direction, axis }: Slide) =>
    axis === "y" ? { opacity: 1, y: `${-direction * 100}%`, transition: CAROUSEL } : { opacity: 0, transition: { duration: 0.12 } },
};

export function Frame({ children, slide }: { slide: Slide } & Props) {
  const present = useIsPresent();
  // Commit the empty frame first so the transition starts immediately; the page mounts one frame later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <motion.div
      className="absolute inset-0 flex min-h-0 flex-col bg-background"
      data-exiting={present ? undefined : ""}
      inert={!present}
      custom={slide}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={slide.axis === "y" ? CAROUSEL : { duration: 0.22, ease: [0.2, 0, 0, 1] }}
    >
      {mounted && children}
    </motion.div>
  );
}
