/** The frame around the pages: the header with the five sections on a desktop, the tab bar on phones. */
import { memo, useSyncExternalStore } from "react";
import { Bluetooth, BluetoothConnected, BluetoothSearching, BookA, BookOpen, Boxes, ChevronDown, Coffee, GraduationCap, LogIn, LogOut, Settings, Swords, Timer, Upload, UserRound, type LucideIcon } from "lucide-react";
import { store as s, run } from "./store";
import { coaching } from "./coaching/client";
import { community } from "./community/client";
import { Avatar, FADE, FOCUS, Icon, PuzzlePicker, usePhone } from "./ui";
import { Brand } from "./logo";
import { cn } from "@/lib/utils";
import { Button as UiButton, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "react-router";
import { pageUrl, readRoute, type AppRoute } from "./navigation";
import type { PuzzleId } from "../../src/shared/puzzles";
import { language, tr } from "../../src/client/i18n";
import { said } from "./base";
import { smartCube } from "../../src/client/lib/smartCube";
import { stackmat } from "../../src/client/lib/stackmat";
/** How long the pointer rests on something before its tooltip shows: the same in every part of the app. */
export const TIP_DELAY = 400;

/** A page of a section: its page id ("analysis" is the profile's analysis), its name and its Alt shortcut. */
type Page = [page: string, label: string, shortcut: string];
/**
 * The five sections, each with its pages: the timer (and the analysis of the smart cube solves), learning (the courses
 * and the drills), the algorithms, the challenges (duels, tournaments) and the player's own pages (profile, messages,
 * coaching). The Alt shortcuts keep their former numbers.
 */
export const SECTIONS: { id: string; label: string; short: string; icon: LucideIcon; pages: Page[] }[] = [
  { id: "timer", label: "Timer", short: "Timer", icon: Timer, pages: [["playground", "Timer", "Alt+1"], ["analysis", "Analysis", "Alt+9"]] },
  { id: "learn", label: "Learn", short: "Learn", icon: GraduationCap, pages: [["learn", "Courses", "Alt+3"], ["training", "Training", "Alt+4"]] },
  { id: "algorithms", label: "Algs", short: "Algs", icon: Boxes, pages: [["algorithms", "Algorithms", "Alt+2"]] },
  { id: "compete", label: "Challenges", short: "Challenges", icon: Swords, pages: [["duel", "Duel", "Alt+5"], ["tournaments", "Tournaments", "Alt+6"], ["daily", "Daily", ""]] },
  { id: "me", label: "Me", short: "Me", icon: UserRound, pages: [["profile", "Profile", ""], ["community", "Messages", "Alt+7"], ["people", "Community", ""], ["coaching", "Coaching", "Alt+8"]] },
];

/** The route the app shows: the store's once started, the address's before (the store then still holds its defaults). */
export function shownRoute(): AppRoute & { coaching: string; view: string } {
  const r = s.ready ? null : typeof location === "undefined" ? null : readRoute(location.pathname, location.search);
  if (r) return { ...r, coaching: r.coaching ?? "", view: r.view ?? "" };
  return { page: s.page, caseId: s.caseId, profileMode: s.profileMode, trainingStep: s.trainingStep, learnMethod: s.learnMethod, coaching: s.coachingView, view: s.view };
}

/** The page the app shows, as a page of the sections ("analysis" for the profile's). */
const currentPage = () => {
  const r = shownRoute();
  return r.page === "profile" && r.profileMode === "analysis" ? "analysis" : r.page === "match" ? "tournaments" : r.page === "community" && r.view.startsWith("people") ? "people" : r.page;
};
/** A guest, or, before the app starts, a device no account signed in on (boot.ts). */
const isGuest = () => (s.ready || typeof document === "undefined" ? s.user.isGuest : !document.documentElement.hasAttribute("data-account"));
/** The section of the page shown. */
export const currentSection = () => SECTIONS.find((section) => section.pages.some(([page]) => page === currentPage()));
const pageTo = (page: string) =>
  page === "analysis" ? pageUrl("profile", { profileMode: "analysis", puzzle: s.puzzle as PuzzleId }) : page === "people" ? pageUrl("community", { view: "people" }) : pageUrl(page, { puzzle: s.puzzle as PuzzleId });

/** What waits on a page: unread coaching messages; unread messages; friend requests and invitations among the contacts. */
const waiting: Record<string, () => number> = {
  coaching: () => coaching.me?.unread ?? 0,
  community: () => community.me?.unread ?? 0,
  people: () => community.waiting(),
};
const sectionWaiting = (id: string) => SECTIONS.find((x) => x.id === id)!.pages.reduce((n, [page]) => n + (waiting[page]?.() ?? 0), 0);

/** All the header and the tab bar show of the app; they are drawn again when it changes, not at every change of the page. */
const shellKey = () =>
  [s.ready, s.page, s.profileMode, s.puzzle, s.solveMode, s.user.username, s.user.isGuest, waiting.coaching!(), waiting.community!(), waiting.people!(), s.view.startsWith("people"), language()].join("|");
const useShell = () => useSyncExternalStore(s.subscribe, shellKey, shellKey);

/** A dot on a section while something waits there. */
function Dot({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <span aria-label={tr("{0} unread", { 0: n })} className={cn("pointer-events-none absolute size-2 rounded-full bg-primary", className)} />;
}

/** The pages of the current section as small tabs (none for a section of one page). Phones leave out the analysis. */
export const SectionTabs = memo(function SectionTabs({ className }: { className?: string }) {
  useShell();
  const phone = usePhone(),
    section = currentSection(),
    pages = section?.pages.filter(([page]) => !(phone && page === "analysis")) ?? [];
  if (pages.length < 2) return null;
  const here = currentPage();
  return (
    <nav aria-label={said(section!.label)} className={cn("flex items-center gap-1 max-md:gap-0", FADE, className)}>
      {pages.map(([page, label, shortcut]) => {
        const n = waiting[page]?.() ?? 0;
        return (
          <Link
            key={page}
            to={pageTo(page)}
            data-action={"nav:" + page}
            aria-current={here === page ? "page" : undefined}
            aria-keyshortcuts={shortcut || undefined}
            title={shortcut ? `${tr(label)} · ${shortcut}` : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[0.8125rem] max-md:px-1.5 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
              FOCUS,
            )}
          >
            {said(label)}
            {n > 0 && <span data-slot={page + "-unread"} className="rounded-md bg-primary px-1.5 text-[11px] leading-[18px] text-primary-foreground tabular-nums">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
});

/** The connected cube's state, and a click to connect it, cancel or disconnect. */
function useCube() {
  const cube = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot, () => smartCube.snapshot);
  return {
    ...cube,
    Icon: cube.status === "on" ? BluetoothConnected : cube.status === "connecting" ? BluetoothSearching : Bluetooth,
    label: cube.status === "on" ? tr("{0} connected · disconnect", { 0: cube.name }) : cube.status === "connecting" ? tr("Connecting… · cancel") : tr("Connect a cube"),
  };
}

const COFFEE = "https://buymeacoffee.com/vitrixxl";

/** A menu item dispatching an action. */
function Item({ action, icon: I, children, shortcut }: { action: string; icon: LucideIcon; children: React.ReactNode; shortcut?: string }) {
  return (
    <DropdownMenuItem data-action={action} onClick={run(action)}>
      <I />
      {children}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}

/**
 * The account's menu, on its face: the profile, the settings, the guides and the notation, importing times, the
 * connected cube, a coffee for the author, then signing out (or in, for a guest).
 */
export function AccountMenu() {
  const cube = useCube(),
    phone = usePhone(),
    guest = s.user.isGuest;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-action="menu:account"
        aria-label={guest ? tr("Account") : tr("{0} · account", { 0: s.user.username })}
        render={<UiButton variant="secondary" size="icon" className="shrink-0 font-bold text-lilac" />}
      >
        {guest ? <UserRound className="text-muted-foreground" /> : <span className="text-sm tracking-tight">{s.user.username.slice(0, 2).toUpperCase()}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
            <Avatar name={guest ? "?" : s.user.username} size={28} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-foreground">{guest ? tr("Guest") : s.user.username}</span>
              <span className="truncate text-xs font-normal">{guest ? tr("Times stay on this device") : tr("Signed in")}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {!guest && (
            <DropdownMenuItem data-action="nav:profile" render={<Link to={pageUrl("profile", { puzzle: s.puzzle as PuzzleId })} />}>
              <UserRound />
              {tr("Profile")}
            </DropdownMenuItem>
          )}
          <Item action="settings" icon={Settings} shortcut="Alt+S">
            {tr("Settings")}
          </Item>
          <Item action="help" icon={BookOpen}>
            {tr("Guides")}
          </Item>
          <Item action="notation" icon={BookA}>
            {tr("Notation")}
          </Item>
          <Item action="importTimes" icon={Upload}>
            {tr("Import times")}
          </Item>
          <DropdownMenuItem data-action="smartCube" data-status={cube.status} onClick={run("smartCube")}>
            <cube.Icon className={cn(cube.status === "on" && "text-success", cube.status === "connecting" && "animate-pulse text-primary")} />
            <span className="min-w-0 flex-1 truncate">{cube.status === "on" ? cube.name : cube.status === "connecting" ? tr("Connecting…") : tr("Connect a cube")}</span>
            {cube.status === "on" && cube.battery !== undefined && <DropdownMenuShortcut>{cube.battery}%</DropdownMenuShortcut>}
          </DropdownMenuItem>
          <StackmatItem />
        </DropdownMenuGroup>
        {/* Phones have no header: the coffee, in plain view here. */}
        {phone && (
          <DropdownMenuItem data-action="coffee" className="font-bold text-primary focus:text-primary" render={<a href={COFFEE} target="_blank" rel="noreferrer" />}>
            <Coffee className="text-primary" />
            {tr("Buy me a coffee")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {guest ? (
          <DropdownMenuItem data-action="nav:login" onClick={() => s.askSignIn()}>
            <LogIn />
            {tr("Sign in")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem data-action="logout" variant="destructive" onClick={run("logout")}>
            <LogOut />
            {tr("Log out")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The Stackmat on the audio input (experimental), beside the connected cube: a click listens to it or stops. */
function StackmatItem() {
  const link = useSyncExternalStore(stackmat.subscribe, () => stackmat.snapshot.link, () => stackmat.snapshot.link);
  return (
    <DropdownMenuItem data-action="stackmat" data-status={link} onClick={run("stackmat")}>
      <Timer className={cn(link === "on" && "text-success", link === "connecting" && "animate-pulse text-primary")} />
      <span className="min-w-0 flex-1 truncate">{link === "on" ? tr("Stackmat connected") : link === "connecting" ? tr("Waiting for the Stackmat…") : tr("Connect a Stackmat")}</span>
      <DropdownMenuShortcut>{link === "off" ? tr("Experimental") : tr("Stop")}</DropdownMenuShortcut>
    </DropdownMenuItem>
  );
}

/** The puzzle every page works on, as a pill: its icon, its name and a chevron. */
export function PuzzlePill() {
  const e = s.event();
  return (
    <PuzzlePicker
      align="end"
      trigger={
        <UiButton variant="outline" aria-label={tr("Puzzle: {0}", { 0: said(e.label) })} className="text-foreground">
          <Icon name={"Puzzle" + e.id} size={16} />
          <span className="max-w-32 truncate">{said(e.label)}</span>
          <ChevronDown className="text-muted-foreground" />
        </UiButton>
      }
    />
  );
}

/** A connected (or connecting) cube, beside the puzzle: its state, a click to disconnect or cancel. */
function CubeState() {
  const cube = useCube();
  if (cube.status === "off") return null;
  return (
    <UiButton variant="outline" size="icon" data-action="smartCube" data-status={cube.status} aria-label={cube.label} title={cube.label} onClick={run("smartCube")}>
      <cube.Icon className={cn(cube.status === "on" ? "text-success" : "animate-pulse text-primary")} />
    </UiButton>
  );
}

/** A guest's way in, beside the account: the sign-in dialog, over this page. */
function SignIn() {
  return (
    <UiButton data-action="nav:login" onClick={() => s.askSignIn()}>
      <LogIn />
      {tr("Sign in")}
    </UiButton>
  );
}

/**
 * Desktop navigation, across the top: the brand, the five sections by name (the current one underlined in the
 * accent), the pages of the current section on wide windows, then the puzzle and the account on the right.
 */
export const Header = memo(function Header() {
  useShell();
  const section = currentSection();
  return (
    <header className={cn("topbar rail flex shrink-0 items-center gap-5 px-6 pt-4 pb-3 lg:gap-7 lg:px-9 lg:pt-5", FADE)}>
      <Link to={pageUrl("playground", { puzzle: s.puzzle as PuzzleId })} aria-label={tr("Qbix · timer")} className={cn("flex h-10 items-center rounded-xl text-[26px]", FOCUS)}>
        <Brand />
      </Link>
      <nav aria-label={tr("Sections")} className="flex items-center gap-0.5">
        {SECTIONS.map(({ id, label, pages }) => {
          const here = section?.id === id,
            first = pages[0]!;
          return (
            <Link
              key={id}
              to={pageTo(first[0])}
              data-action={"nav:" + first[0]}
              data-section={id}
              aria-current={here ? "page" : undefined}
              aria-keyshortcuts={first[2] || undefined}
              className={cn(
                "relative rounded-xl px-3 py-2.5 text-[15px] font-semibold text-faint transition-colors hover:bg-card hover:text-foreground aria-[current=page]:text-foreground lg:px-4",
                "after:absolute after:inset-x-3 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-primary after:opacity-0 aria-[current=page]:after:opacity-100 lg:after:inset-x-4",
                FOCUS,
              )}
            >
              {said(label)}
              <Dot n={sectionWaiting(id)} className="top-2 right-1.5" />
            </Link>
          );
        })}
      </nav>
      <SectionTabs className="hidden pl-3 2xl:flex" />
      <div className="ml-auto flex items-center gap-2.5">
        {/* Support for the app, in plain view: the app is free, a coffee keeps it going. */}
        <a
          href={COFFEE}
          target="_blank"
          rel="noreferrer"
          data-action="coffee"
          // A link drawn as the app's buttons are (shape and size), in the accent colour.
          className={buttonVariants({ variant: "tint" })}
        >
          <Coffee />
          <span className="max-lg:hidden">{tr("Buy me a coffee")}</span>
          <span className="sr-only lg:hidden">{tr("Buy me a coffee")}</span>
        </a>
        <CubeState />
        <PuzzlePill />
        {isGuest() && <SignIn />}
        <AccountMenu />
      </div>
    </header>
  );
});

/** Under the header, the current section's pages on windows too narrow to hold them beside the sections. */
export function NarrowSectionTabs() {
  return <SectionTabs className="shrink-0 px-6 pb-2 lg:px-9 2xl:hidden" />;
}

/** Phones, above the page: the current section's pages; in the player's own section, their account's menu beside them. */
export const PhoneTop = memo(function PhoneTop() {
  useShell();
  const top = "shrink-0 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]";
  if (currentSection()?.id !== "me") return <SectionTabs className={top} />;
  return (
    <div className={cn("flex items-center gap-2", top)}>
      <SectionTabs className="min-w-0 flex-1 overflow-x-auto" />
      <AccountMenu />
    </div>
  );
});

/** Phone navigation: the five sections at the thumb, the current one in the accent. */
export const TabBar = memo(function TabBar() {
  useShell();
  const section = currentSection();
  return (
    <nav
      className={cn("tabbar grid shrink-0 grid-cols-5 bg-card px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)]", FADE)}
      aria-label={tr("Sections")}
    >
      {SECTIONS.map(({ id, short, icon: I, pages }) => {
        const here = section?.id === id,
          page = pages[0]![0];
        return (
          <Link
            key={id}
            data-action={"nav:" + page}
            data-section={id}
            aria-current={here ? "page" : undefined}
            to={pageTo(page)}
            className={cn("flex min-w-0 flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-semibold text-faint transition-colors", FOCUS, here && "text-foreground")}
          >
            <span className={cn("relative flex h-8 w-full max-w-14 items-center justify-center rounded-xl transition-colors", here && "bg-primary/15 text-primary")}>
              <I className="size-5" />
              <Dot n={sectionWaiting(id)} className="top-1 left-1/2 ml-2" />
            </span>
            <span className="max-w-full truncate">{said(short)}</span>
          </Link>
        );
      })}
    </nav>
  );
});
