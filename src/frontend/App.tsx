import { PuzzlePicker } from "./components/PuzzlePicker";
import { Suspense, lazy, useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { userAtom, statsVersionAtom, routeAtom, chatActivityAtom, themeAtom, colorModeAtom, timerRunningAtom, type Route } from "./state";

import { PlaygroundPage } from "./pages/PlaygroundPage";
import { IconGrid, IconTimer, IconUser, IconUsers, IconCube } from "./components/icons";

import { parseRoute, rememberTab, routePath, routeFromPath } from "./lib/navigation";
import { local, tokenKey } from "./api";
import { Avatar } from "./components/Avatar";

import { ChatConnection } from "./components/ChatConnection";
import { useAppViewport } from "./hooks/useAppViewport";
import { useShortcuts } from "./hooks/useShortcuts";
import { SyncIndicator } from "./components/SyncIndicator";
import { SolveContextMenu } from "./components/SolveContextMenu";
import { updatePageMetadata } from "./seo/metadata";
const CommunityPage = lazy(() => import("./pages/AccountPage").then(m => ({ default: m.CommunityPage })));
const ProfilePage = lazy(() => import("./pages/AccountPage").then(m => ({ default: m.ProfilePage })));
const AlgorithmsPage = lazy(() => import("./pages/AlgorithmsPage").then(m => ({ default: m.AlgorithmsPage })));
const TrainingPage = lazy(() => import("./pages/TrainingPage").then(m => ({ default: m.TrainingPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage").then(m => ({ default: m.MessagesPage })));

const NAV: { page: Route["page"]; label: string; icon: typeof IconGrid }[] = [
  { page: "playground", label: "Timer", icon: IconCube },
  { page: "algorithms", label: "Algorithms", icon: IconGrid },
  { page: "training", label: "Training", icon: IconTimer },
  { page: "community", label: "Friends", icon: IconUsers },
  { page: "profile", label: "Account", icon: IconUser },
];

/** Which navigation entry a route belongs to. */
function navPage(route: Route): Route["page"] {
  if (route.page === "messages") return "community";
  if (route.page === "profile" && route.username) return "community";
  return route.page;
}

export function App() {
  useAppViewport();
  useEffect(() => {
    // Custom component menus handle the event first; suppress the browser menu.
    const preventNativeMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", preventNativeMenu);
    return () => window.removeEventListener("contextmenu", preventNativeMenu);
  }, []);
  const theme = useAtomValue(themeAtom), colorMode = useAtomValue(colorModeAtom);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = colorMode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
  }, [theme, colorMode]);
  const running = useAtomValue(timerRunningAtom);
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
  useEffect(() => { updatePageMetadata(route.page); window.scrollTo(0, 0); }, [route.page]);
  const historyReady = useRef(false);
  const restoringHistory = useRef(false);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = parseRoute(event.state?.cubixRoute);
      restoringHistory.current = true;
      setRoute(next ?? routeFromPath(window.location.pathname) ?? { page: "playground" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setRoute]);

  useEffect(() => {
    rememberTab(route);
    if (!historyReady.current) {
      historyReady.current = true;
      window.history.replaceState({ ...window.history.state, cubixRoute: route }, "", routePath(route));
      return;
    }
    if (restoringHistory.current) {
      restoringHistory.current = false;
      return;
    }
    window.history.pushState({ ...window.history.state, cubixRoute: route }, "", routePath(route));
  }, [route]);

  useShortcuts(NAV.map(({ page }, i) => ({ key: String(i + 1), run: () => setRoute({ page } as Route) })));
  const active = navPage(route);

  return (
    <div className="app" data-running={running || undefined}>
      <ChatConnection />
      <main className="main">
        <Suspense fallback={<div className="boot">Loading…</div>}>
          {!user ? <div className="boot">Loading…</div> : <>
          {route.page === "algorithms" && <AlgorithmsPage />}
          {route.page === "training" && <TrainingPage />}
          {route.page === "playground" && <PlaygroundPage />}
          {route.page === "messages" && <MessagesPage solveId={route.solveId} />}
          {route.page === "community" && <CommunityPage />}
          {route.page === "profile" && <ProfilePage key={route.username ?? "self"} username={route.username} mode={route.mode} caseId={route.caseId} />}
          </>}
        </Suspense>
      </main>
      <nav className="sidebar" aria-label="Main navigation" data-timer-chrome>
        <PuzzlePicker />
        {NAV.map(({ page, label, icon: Icon }, i) => {
          const current = active === page;
          const avatar = page === "profile" && user && !user.isGuest;
          return <a key={page} href={routePath({ page } as Route)} className={`nav-item ${current ? "active" : ""}`} aria-current={current ? "page" : undefined}
            aria-keyshortcuts={`Alt+${i + 1}`} title={`${label} (Alt+${i + 1})`}
            onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setRoute({ page } as Route); } }}>
            {avatar ? <Avatar user={user} /> : <Icon />}<span className="nav-label">{label}</span>
            {page === "community" && chatActivity && <span className="chat-activity-dot" role="status" aria-label="New messages" />}
          </a>;
        })}
      </nav>
      <SolveContextMenu />
      <SyncIndicator />
    </div>
  );
}
