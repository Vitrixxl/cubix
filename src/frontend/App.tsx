import { MobileNavigationMenu } from "./components/MobileNavigationMenu";
import { PuzzlePicker } from "./components/PuzzlePicker";
import { Fragment, Suspense, useEffect, useInsertionEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { AnimatePresence, LayoutGroup, MotionConfig, MotionGlobalConfig, motion } from "motion/react";
import { puzzleAtom, solveModeAtom, animationsEnabledAtom, colorModeAtom, userAtom, statsVersionAtom, routeAtom, chatActivityAtom, type Route } from "./state";
import { AlgorithmsPage } from "./pages/AlgorithmsPage";
import { TrainingPage } from "./pages/TrainingPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { IconCube, IconGrid, IconPalette, IconTimer, IconUser, IconUsers, IconMessage, IconSun, IconMoon } from "./components/icons";
import { ThemeController, ThemePicker } from "./components/ThemePicker";

import { parseRoute, rememberTab } from "./lib/navigation";
import { api, local, tokenKey } from "./api";
import { Avatar, CommunityPage, ProfilePage } from "./pages/AccountPage";

import { ChatConnection } from "./components/ChatConnection";
import { MessagesPage } from "./pages/MessagesPage";
import { useTimerChrome } from "./hooks/useTimerChrome";
import { useAppViewport } from "./hooks/useAppViewport";

import { useShortcuts } from "./hooks/useShortcuts";
import { ShortcutKey } from "./components/ShortcutKey";
import { SyncIndicator } from "./components/SyncIndicator";
import { SolveContextMenu } from "./components/SolveContextMenu";

const NAV: { page: Route["page"]; label: string; icon: typeof IconGrid }[] = [
  { page: "algorithms", label: "Algorithms", icon: IconGrid },
  { page: "training", label: "Training", icon: IconTimer },
  { page: "playground", label: "Playground", icon: IconCube },
  { page: "messages", label: "Messages", icon: IconMessage },
  { page: "community", label: "Community", icon: IconUsers },
];

const PAGE_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

export function App() {
  useAppViewport();
  const [cube] = useAtom(puzzleAtom);
  const [solveMode] = useAtom(solveModeAtom);
  useEffect(() => {
    // Custom component menus handle the event first; suppress the browser menu.
    const preventNativeMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", preventNativeMenu);
    return () => window.removeEventListener("contextmenu", preventNativeMenu);
  }, []);
  const [animationsEnabled] = useAtom(animationsEnabledAtom);
  const [colorMode, setColorMode] = useAtom(colorModeAtom);
  const toggleColorMode = () => setColorMode(mode => mode === "light" ? "dark" : "light");
  useInsertionEffect(() => {
    // MotionConfig's skip flag is captured at mount; this flag also updates existing elements.
    const previous = MotionGlobalConfig.skipAnimations;
    MotionGlobalConfig.skipAnimations = !animationsEnabled;
    document.documentElement.dataset.animations = animationsEnabled ? "on" : "off";
    return () => { MotionGlobalConfig.skipAnimations = previous; };
  }, [animationsEnabled]);
  const navigationMotion = useTimerChrome("down");
  const [user, setUser] = useAtom(userAtom);
  const [, bumpStats] = useAtom(statsVersionAtom);
  useEffect(() => {
    const refresh = () => { setUser(local.current()); bumpStats(v => v + 1); };
    refresh();
    void local.restore();
    const changed = (event: StorageEvent) => {
      if (event.key === tokenKey || event.key?.startsWith("cubix.local.v1:") || event.key === null) refresh();
    };
    const reconnect = () => { void local.restore(); };
    const visible = () => { if (document.visibilityState === "visible") reconnect(); };
    window.addEventListener("cubix-local-changed", refresh);
    window.addEventListener("storage", changed);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", visible);
    const retry = setInterval(reconnect,30000);
    return () => {
      window.removeEventListener("cubix-local-changed", refresh);
      window.removeEventListener("storage", changed);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(retry);
    };
  }, [setUser,bumpStats]);
  const [route, setRoute] = useAtom(routeAtom);
  const [chatActivity, setChatActivity] = useAtom(chatActivityAtom);
  useEffect(() => { if (route.page === "messages") setChatActivity(false); }, [route.page, chatActivity, setChatActivity]);
  const [themesOpen, setThemesOpen] = useState(false);
  const historyReady = useRef(false);
  const restoringHistory = useRef(false);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = parseRoute(event.state?.cubixRoute);
      restoringHistory.current = true;
      setRoute(next ?? { page: "algorithms" });
      setThemesOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setRoute]);

  useEffect(() => {
    rememberTab(route);
    if (!historyReady.current) {
      historyReady.current = true;
      window.history.replaceState({ ...window.history.state, cubixRoute: route }, "");
      return;
    }
    if (restoringHistory.current) {
      restoringHistory.current = false;
      return;
    }
    window.history.pushState({ ...window.history.state, cubixRoute: route }, "");
  }, [route]);

  useShortcuts([
    ...NAV.map(({ page }, i) => ({ key: String(i + 1), run: () => setRoute({ page } as Route) })),
    { key: "6", run: () => setThemesOpen(true) },
    { key: "7", run: () => setRoute({ page: "profile" }) },
    { key: "8", run: toggleColorMode },
  ]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="app" data-cube={cube}>
      <ChatConnection />
      <ThemeController />
      <motion.nav {...navigationMotion} className="sidebar" aria-label="Main navigation">
        <LayoutGroup id="nav">
          <PuzzlePicker />
          <span className="nav-divider context-divider" aria-hidden="true" />
          {NAV.map(({ page, label, icon: Icon }, i) => {
            const active = route.page === page;
            return (
              <Fragment key={page}>
                {i === 3 && <span className="nav-divider secondary-navigation" aria-hidden="true" />}
                <button className={`nav-item ${i>=3?"secondary-navigation":""} ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}
                  aria-label={label} aria-keyshortcuts={`Alt+${i + 1}`} onClick={() => setRoute({ page } as Route)}>
                  {active && <span className="nav-indicator" />}
                  <Icon /><span className="nav-label">{label}</span>
                  <span className="nav-tooltip" aria-hidden="true">{label}<ShortcutKey letter={String(i + 1)} /></span>
                  {page === "messages" && chatActivity && <span className="chat-activity-dot" role="status" aria-label="New activity in messages" />}
                </button>
              </Fragment>
            );
          })}
          <span className="nav-divider secondary-navigation" aria-hidden="true" />
          <button aria-label="Themes" aria-keyshortcuts="Alt+6" className="nav-item secondary-navigation" onClick={() => setThemesOpen(true)}>
            <IconPalette /><span className="nav-tooltip" aria-hidden="true">Themes<ShortcutKey letter="6" /></span>
          </button>
          <button type="button" role="switch" aria-label="Light mode" aria-checked={colorMode === "light"} aria-keyshortcuts="Alt+8" className="nav-item color-mode-nav secondary-navigation" onClick={toggleColorMode}>
            {colorMode === "light" ? <IconMoon aria-hidden="true" /> : <IconSun aria-hidden="true" />}
            <span className="nav-tooltip" aria-hidden="true">{colorMode === "light" ? "Switch to dark mode" : "Switch to light mode"}<ShortcutKey letter="8" /></span>
          </button>
          <button aria-label="My account" aria-keyshortcuts="Alt+7" aria-current={route.page === "profile" ? "page" : undefined}
            className={`nav-item account-nav secondary-navigation ${route.page === "profile" ? "active" : ""}`} onClick={() => setRoute({ page: "profile" })}>
            {route.page === "profile" && <span className="nav-indicator" />}
            {user && !user.isGuest ? <Avatar user={user} /> : <IconUser />}
            <span className="nav-label">My account</span>
            <span className="nav-tooltip" aria-hidden="true">My account<ShortcutKey letter="7" /></span>
          </button>
          <MobileNavigationMenu onThemes={()=>setThemesOpen(true)}/>
        </LayoutGroup>
      </motion.nav>
      <main className="main" key={route.page === "playground" ? "playground" : route.page === "messages" || route.page === "community" ? "social" : `${cube}:${solveMode}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${route.page}:${user?.id ?? "loading"}:${user?.isGuest}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={PAGE_TRANSITION}
            className="page-transition"
          >
            <Suspense fallback={<div className="boot">Loading…</div>}>
              {!user ? <div className="boot">Loading your workspace…</div> : <>
              {route.page === "algorithms" && <AlgorithmsPage />}
              {route.page === "training" && <TrainingPage />}
              {route.page === "playground" && <PlaygroundPage />}
              {route.page === "messages" && <MessagesPage solveId={route.solveId} />}
              {route.page === "community" && <CommunityPage />}
              {route.page === "profile" && <ProfilePage key={route.username ?? "self"} username={route.username} mode={route.mode} caseId={route.caseId} />}
              </>}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <ThemePicker open={themesOpen} onClose={() => setThemesOpen(false)} />
      <SolveContextMenu />
      <SyncIndicator />
    </div>
    </MotionConfig>
  );
}
