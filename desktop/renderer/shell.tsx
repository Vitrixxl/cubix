/** The frame around the pages: the sidebar or the phone tab bar, and the page transition. */
import { useEffect, useState } from "react";
import { motion, useIsPresent } from "motion/react";
import { BookOpen, Boxes, ChevronsUpDown, Dumbbell, LogIn, LogOut, Settings, Swords, Timer, User, UserPlus, type LucideIcon } from "lucide-react";
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The sections: a cube library for the algorithms, a dumbbell for the drills of training. */
const SECTIONS: [page: string, label: string, icon: LucideIcon, shortcut: string][] = [
  ["playground", "Timer", Timer, "Alt 1"],
  ["algorithms", "Algorithms", Boxes, "Alt 2"],
  ["training", "Training", Dumbbell, "Alt 3"],
  ["duel", "Duel", Swords, "Alt 5"],
];

const go = (action: string) => (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.blur();
  void s.action(action, e.currentTarget);
};

/** The player's face: the initials once signed in, a person for the guest. */
function Me({ size = 32 }: { size?: number }) {
  return s.user.isGuest ? (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" style={{ width: size, height: size }}>
      <User className="size-[55%]" />
    </span>
  ) : (
    <Avatar user={s.user} size={size} />
  );
}

/**
 * Desktop navigation: a labelled column on the page background. The wordmark and the puzzle every page works on, the
 * sections by name, then the guides, the settings and, last, the account: the way to the profile, its menu signing in
 * or out. Narrow windows keep the icons.
 */
export function Rail() {
  const guest = s.user.isGuest,
    e = s.event(),
    profile = s.page === "profile";
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
          <SidebarMenuItem className="account mt-2 border-t pt-2">
            <SidebarMenuButton
              size="lg"
              data-action="nav:profile"
              isActive={profile}
              aria-current={profile ? "page" : undefined}
              tooltip={(guest ? "Guest" : s.user.username) + " · Profile · Alt+4"}
              onClick={go("nav:profile")}
              className="gap-2.5 pr-9"
            >
              <Me />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{guest ? "Guest" : s.user.username}</span>
                <span className="truncate text-xs text-muted-foreground">{guest ? "Sign in to sync" : "Profile"}</span>
              </span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuAction data-action="menu:account" aria-label="Account" className="top-4.5! right-2 text-muted-foreground" />}
              >
                <ChevronsUpDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-auto min-w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{guest ? "Times stay on this device" : s.user.username}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {guest ? (
                  <>
                    <DropdownMenuItem data-action="account:login" onClick={() => void s.action("account:login")}>
                      <LogIn />
                      Sign in
                    </DropdownMenuItem>
                    <DropdownMenuItem data-action="account:register" onClick={() => void s.action("account:register")}>
                      <UserPlus />
                      Create account
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem data-action="logout" onClick={() => void s.action("logout")}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Phone navigation: a bottom tab bar, icon over word, the timer in the centre and the account last. */
const MOBILE_TABS: [page: string, label: string, icon: LucideIcon | null][] = [
  ["algorithms", "Algorithms", Boxes],
  ["training", "Training", Dumbbell],
  ["playground", "Timer", Timer],
  ["duel", "Duel", Swords],
  ["profile", "Account", null],
];

export function TabBar() {
  return (
    <nav
      className={cn("tabbar grid shrink-0 grid-cols-5 border-t bg-background px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)]", FADE)}
      aria-label="Sections"
    >
      {MOBILE_TABS.map(([page, label, I]) => {
        const here = s.page === page;
        return (
          <button
            key={page}
            type="button"
            data-action={"nav:" + page}
            aria-current={here ? "page" : undefined}
            onClick={go("nav:" + page)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:bg-muted",
              here && "text-foreground",
            )}
          >
            <span className={cn("flex h-8 w-14 items-center justify-center rounded-lg transition-colors", here && "bg-primary/12 text-primary")}>
              {I ? <I className="size-5" /> : <Me size={22} />}
            </span>
            {label}
          </button>
        );
      })}
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
