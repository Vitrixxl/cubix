import { Nav, NAV } from "./components/Nav";
import { Suspense, lazy, useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { userAtom, statsVersionAtom, routeAtom, chatActivityAtom, themeAtom, colorModeAtom, timerRunningAtom, type Route } from "./state";

import { PlaygroundPage } from "./pages/PlaygroundPage";

import { parseRoute, rememberTab, routePath, routeFromPath } from "./lib/navigation";
import { local, tokenKey } from "./api";

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
      <Nav active={active} onNavigate={page => setRoute({ page } as Route)} user={user} chatActivity={chatActivity} />
      <SolveContextMenu />
      <SyncIndicator />
    </div>
  );
}
