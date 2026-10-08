/** The frame around the pages: the sidebar or the phone tab bar. */
import { memo, useSyncExternalStore } from "react";
import { Bluetooth, BluetoothConnected, BluetoothSearching, BookA, BookOpen, Boxes, ChartColumn, ChevronDown, Coffee, Dumbbell, GraduationCap, Headset, LogOut, MessagesSquare, Settings, Swords, Timer, Trophy, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { store as s, run } from "./store";
import { coaching } from "./coaching/client";
import { community } from "./community/client";
import { Avatar, FADE, FOCUS, Icon, PuzzlePicker, SIDEBAR_WIDE, Tip, useViewport } from "./ui";
import { Logo, Wordmark } from "./logo";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Button as UiButton } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Link } from "react-router";
import { pageUrl } from "./navigation";
import type { PuzzleId } from "../../src/shared/puzzles";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { language, tr } from "../../src/client/i18n";
import { said } from "./base";
import { smartCube } from "../../src/client/lib/smartCube";
/** How long the pointer rests on something before its tooltip shows: the same in every part of the app. */
export const TIP_DELAY = 400;

type Section = [page: string, label: string, icon: LucideIcon, shortcut: string];
/**
 * The sections, in groups: the timer on its own, then studying (a cube library for the algorithms, a mortarboard for
 * the method courses, a dumbbell for the drills), competing, and the others (messages, coaching). Their shortcuts
 * follow this order.
 */
const SECTIONS: [group: string | null, sections: Section[]][] = [
  [
    null,
    [
      ["playground", "Timer", Timer, "Alt 1"],
      // The profile's analysis of the smart cube solves, a section of its own.
      ["analysis", "Analysis", ChartColumn, "Alt 9"],
    ],
  ],
  [
    "Study",
    [
      ["algorithms", "Algorithms", Boxes, "Alt 2"],
      ["learn", "Learn", GraduationCap, "Alt 3"],
      ["training", "Training", Dumbbell, "Alt 4"],
    ],
  ],
  [
    "Compete",
    [
      ["duel", "Duel", Swords, "Alt 5"],
      ["tournaments", "Tournaments", Trophy, "Alt 6"],
    ],
  ],
  [
    "Together",
    [
      ["community", "Messages", MessagesSquare, "Alt 7"],
      ["coaching", "Coaching", Headset, "Alt 8"],
    ],
  ],
];

/** What waits in a section: unread coaching messages; in the community, unread messages, friend requests and group
 * invitations. */
const waiting: Record<string, () => number> = {
  coaching: () => coaching.me?.unread ?? 0,
  community: () => (community.me ? community.me.unread + community.me.incoming.length + community.me.invitations.length : 0),
};
/**
 * All the sidebar and the tab bar show of the app: the page, the puzzle, the account, what waits in each section and the
 * language. They are drawn again when it changes, not at every change of the page beside them.
 */
const shellKey = () =>
  [s.page, s.profileMode, s.puzzle, s.solveMode, s.user.username, waiting.coaching!(), waiting.community!(), language()].join("|");
const useShell = () => useSyncExternalStore(s.subscribe, shellKey);
/** A section's count beside its name; folded to its icons, the sidebar keeps a dot on the icon. */
function UnreadBadge({ page }: { page: string }) {
  const count = waiting[page]?.() ?? 0;
  if (!count) return null;
  return (
    <>
      <SidebarMenuBadge data-slot={page + "-unread"} className="right-2 bg-primary text-primary-foreground group-hover/menu-item:opacity-0 peer-data-[size=default]/menu-button:top-2">
        {count}
      </SidebarMenuBadge>
      <UnreadDot page={page} className="top-1.5 left-6 hidden ring-sidebar group-data-[collapsible=icon]:block" />
    </>
  );
}

/** The dot on a section's icon while something waits there; `className` places it and rings it in its ground. */
function UnreadDot({ page, className }: { page: string; className: string }) {
  const count = waiting[page]?.() ?? 0;
  if (!count) return null;
  return <span data-slot={page + "-unread"} aria-label={tr("{0} unread", { 0: count })} className={cn("pointer-events-none absolute size-2 rounded-full bg-primary ring-2", className)} />;
}

/** The player's face: the account's initials. */
function Me({ size = 32 }: { size?: number }) {
  return <Avatar name={s.user.username} size={size} />;
}

/** The connected cube, from any page: its state, and a click to connect it, cancel or disconnect. */
function CubeLink() {
  const { status, name, battery } = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot),
    I = status === "on" ? BluetoothConnected : status === "connecting" ? BluetoothSearching : Bluetooth,
    label = status === "on" ? name : status === "connecting" ? tr("Connecting…") : tr("Connect a cube"),
    tip = status === "on" ? tr("{0} connected · disconnect", { 0: name }) : status === "connecting" ? tr("Connecting… · cancel") : tr("Connect a cube");
  return (
    <SidebarMenuItem>
      <SidebarMenuButton data-action="smartCube" data-status={status} tooltip={tip} onClick={run("smartCube")} className="h-9 text-muted-foreground">
        <I className={cn(status === "on" && "text-success", status === "connecting" && "animate-pulse text-primary")} />
        <span className="min-w-0 flex-1 truncate">{said(label)}</span>
        {status === "on" && battery !== undefined && <span className="text-xs tabular-nums">{battery}%</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Desktop navigation: a labelled column on the page background. The puzzle every page works on, as the app's mark
 * beside its name, the sections by name, then the guides, the settings, a coffee for the author and, last, the account:
 * the profile link with its own sign-out icon button on its right. Narrow windows keep the icons.
 */
export const Rail = memo(function Rail() {
  useShell();
  const e = s.event(),
    profile = s.page === "profile" && s.profileMode !== "analysis",
    { open, toggleSidebar } = useSidebar(),
    // Below this width the sidebar always keeps to its icons.
    foldable = useViewport().w > SIDEBAR_WIDE;
  return (
    // Folded, the icons are named by their tooltips: these come almost at once, and move from icon to icon instantly.
    <TooltipProvider delay={open ? TIP_DELAY : 80} closeDelay={0}>
    <Sidebar collapsible="icon" className={cn("rail border-sidebar-border", FADE)}>
      <SidebarHeader className="pt-4">
        {/* The puzzle's mark, drawn as the puzzle every page works on (picked just under it), the name, and the
            button folding the sidebar to its icons; folded, the mark and that button stand one above the other. */}
        <div data-brand="" className="flex h-9 items-center gap-1.5 pl-1 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:pl-0">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center">
            <Logo size={22} puzzle={e.id} />
          </span>
          <Wordmark className="min-w-0 flex-1 text-xl group-data-[collapsible=icon]:hidden" />
          {foldable && (
            <Tip side="right" content={<>{open ? tr("Collapse") : tr("Expand")} {tr("· Ctrl+B")}</>}>
              <UiButton
                variant="ghost"
                size="icon"
                data-action="sidebar:toggle"
                aria-label={open ? tr("Collapse the sidebar") : tr("Expand the sidebar")}
                onClick={toggleSidebar}
                className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:size-8"
              >
                {open ? <PanelLeftClose /> : <PanelLeftOpen />}
              </UiButton>
            </Tip>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {/* The puzzle every page works on, above the sections; folded, its icon alone. */}
        <SidebarGroup className="pt-2 pb-1">
          <PuzzlePicker
            trigger={
              <UiButton
                variant="outline"
                aria-label={tr("Puzzle: {0}", { 0: said(e.label) })}
                className="h-9 w-full justify-start gap-2 px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              >
                <Icon name={"Puzzle" + e.id} size={16} />
                <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">{said(e.label)}</span>
                <ChevronDown className="text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </UiButton>
            }
          />
        </SidebarGroup>
        {SECTIONS.map(([group, sections]) => (
          <SidebarGroup key={group ?? "timer"} className="py-1 first:pt-2">
            {group && <SidebarGroupLabel>{said(group)}</SidebarGroupLabel>}
            <SidebarMenu className="gap-0.5" aria-label={group ? said(group) : tr("Sections")}>
              {sections.map(([page, label, I, shortcut]) => {
                // The analysis is the profile's, opened as a section.
                const here = page === "analysis" ? s.page === "profile" && s.profileMode === "analysis" : s.page === page,
                  to = page === "analysis" ? pageUrl("profile", { profileMode: "analysis", puzzle: s.puzzle as PuzzleId }) : pageUrl(page, { puzzle: s.puzzle as PuzzleId });
                return (
                  <SidebarMenuItem key={page}>
                    <SidebarMenuButton
                      data-action={"nav:" + page}
                      isActive={here}
                      aria-current={here ? "page" : undefined}
                      tooltip={`${tr(label)} · ${shortcut.replace(" ", "+")}`}
                      render={<Link to={to} />}
                      className="h-9 text-muted-foreground data-active:text-foreground"
                    >
                      <I />
                      <span>{said(label)}</span>
                    </SidebarMenuButton>
                    <UnreadBadge page={page} />
                    <Kbd className="pointer-events-none absolute top-2 right-2 bg-transparent opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
                      {said(shortcut)}
                    </Kbd>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="pb-4">
        <SidebarMenu className="gap-0.5">
          <CubeLink />
          <SidebarMenuItem>
            <SidebarMenuButton data-action="notation" tooltip={tr("Notation")} onClick={run("notation")} className="h-9 text-muted-foreground">
              <BookA />
              <span>{tr("Notation")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-action="help" tooltip={tr("Guides")} onClick={run("help")} className="h-9 text-muted-foreground">
              <BookOpen />
              <span>{tr("Guides")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-action="settings" tooltip={tr("Settings · Alt+S")} onClick={run("settings")} className="h-9 text-muted-foreground">
              <Settings />
              <span>{tr("Settings")}</span>
            </SidebarMenuButton>
            <Kbd className="pointer-events-none absolute top-2 right-2 bg-transparent opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
              {tr("Alt S")}</Kbd>
          </SidebarMenuItem>
          {/* Support for the app, above the account. */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={tr("Buy me a coffee")}
              render={<a href="https://buymeacoffee.com/vitrixxl" target="_blank" rel="noreferrer" />}
              className="h-9 text-muted-foreground"
            >
              <Coffee className="text-primary" />
              <span>{tr("Buy me a coffee")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* The account: the profile link, and beside it on the right its own sign-out icon button. */}
          <SidebarMenuItem className="mt-1 flex items-center gap-1 border-t pt-2 group-data-[collapsible=icon]:flex-col">
            <SidebarMenuButton
              data-action="nav:profile"
              aria-current={profile ? "page" : undefined}
              tooltip={s.user.username + " · " + tr("Profile")}
              render={<Link to={pageUrl("profile", { puzzle: s.puzzle as PuzzleId })} />}
              className="h-9 min-w-0 flex-1 gap-2.5 group-data-[collapsible=icon]:p-1!"
            >
              <Me size={24} />
              <span className="truncate font-medium">{s.user.username}</span>
            </SidebarMenuButton>
            <Tip side="right" content={tr("Log out")}>
              <UiButton variant="ghost" size="icon" data-action="logout" aria-label={tr("Log out")} onClick={run("logout")} className="size-9 shrink-0 text-muted-foreground group-data-[collapsible=icon]:size-8 hover:text-destructive">
                <LogOut />
              </UiButton>
            </Tip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
});

/**
 * Phone navigation follows the sidebar, the account last. Seven tabs share a phone's width: each takes a short name.
 */
const MOBILE_TABS: [page: string, label: string, icon: LucideIcon | null][] = [
  ["playground", "Timer", Timer],
  ["algorithms", "Algs", Boxes],
  ["learn", "Learn", GraduationCap],
  ["training", "Train", Dumbbell],
  ["duel", "Duel", Swords],
  ["coaching", "Coach", Headset],
  ["profile", "Account", null],
];

export const TabBar = memo(function TabBar() {
  useShell();
  return (
    <nav
      className={cn("tabbar grid shrink-0 grid-cols-7 border-t bg-background px-0.5 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)]", FADE)}
      aria-label={tr("Sections")}
    >
      {MOBILE_TABS.map(([page, label, I]) => {
        const here = s.page === page,
          className = cn(
            "flex min-w-0 flex-col items-center gap-1 rounded-lg py-1 text-xs font-medium tracking-tighter text-muted-foreground transition-colors",
            FOCUS,
            here && "text-foreground",
          );
        return (
          <Link key={page} data-action={"nav:" + page} aria-current={here ? "page" : undefined} to={pageUrl(page, { puzzle: s.puzzle as PuzzleId })} className={className}>
            <span className={cn("relative flex h-8 w-full max-w-14 items-center justify-center rounded-lg transition-colors", here && "bg-primary/15 text-primary")}>
              {I ? <I className="size-5" /> : <Me size={22} />}
              <UnreadDot page={page} className="top-1 left-1/2 ml-1.5 ring-background" />
            </span>
            <span className="max-w-full truncate">{said(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
});

