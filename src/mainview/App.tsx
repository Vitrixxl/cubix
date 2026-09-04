import { Suspense, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { userAtom, statsVersionAtom, routeAtom, type Route } from "./state";
import { AlgorithmsPage } from "./pages/AlgorithmsPage";
import { TrainingPage } from "./pages/TrainingPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { IconCube, IconGrid, IconPalette, IconTimer, IconUser, IconUsers } from "./components/icons";
import { ThemeController, ThemePicker } from "./components/ThemePicker";

import { api, ApiError, authToken, tokenKey } from "./api";
import { Avatar, CommunityPage, ProfilePage } from "./pages/AccountPage";

const NAV: { page: Route["page"]; label: string; icon: typeof IconGrid }[] = [
  { page: "algorithms", label: "Algorithms", icon: IconGrid },
  { page: "training", label: "Training", icon: IconTimer },
  { page: "playground", label: "Playground", icon: IconCube },
  { page: "community", label: "Community", icon: IconUsers },
];

const PAGE_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

export function App() {
  const [user, setUser] = useAtom(userAtom);
  const [, bumpStats] = useAtom(statsVersionAtom);
  const [bootError, setBootError] = useState("");
  const [bootRetry, setBootRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBootError("");
    (async () => {
      if (authToken.get()) {
        try { const current = await api.me(); if (active) setUser(current); return; }
        catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; authToken.clear(); }
      }
      const result = await api.guest();
      if (active) { authToken.set(result.token); setUser(result.user); bumpStats(v => v + 1); }
    })().catch(e => { if (active) setBootError(e.message); });
    return () => { active = false; };
  }, [bootRetry, setUser, bumpStats]);
  const [route, setRoute] = useAtom(routeAtom);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === tokenKey || event.key === null) window.location.reload(); };
    const expired = () => { authToken.clear(); window.location.reload(); };
    window.addEventListener("storage", changed);
    window.addEventListener("cubix-session-expired", expired);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("cubix-session-expired", expired); };
  }, []);
  const [themesOpen, setThemesOpen] = useState(false);
  const historyReady = useRef(false);
  const restoringHistory = useRef(false);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = event.state?.cubixRoute as Route | undefined;
      restoringHistory.current = true;
      setRoute(next ?? { page: "algorithms" });
      setThemesOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setRoute]);

  useEffect(() => {
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

  return (
    <div className="app">
      <ThemeController />
      <nav className="sidebar">
        <motion.div className="brand" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <span className="brand-mark" />
          Cubix
        </motion.div>
        <LayoutGroup id="nav">
          {NAV.map(({ page, label, icon: Icon }, i) => {
            const active = route.page === page;
            return (
              <motion.button
                key={page}
                className={`nav-item ${active ? "active" : ""}`}
                aria-label={label}
                title={label}
                onClick={() => setRoute({ page } as Route)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 + i * 0.05, duration: 0.25 }}
              >
                {active && <motion.span className="nav-pill" layoutId="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <Icon />
                {label}
              </motion.button>
            );
          })}
        </LayoutGroup>
        <motion.button aria-label="Themes" title="Themes" className="nav-item themes-button" onClick={() => setThemesOpen(true)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.22, duration: 0.25 }}>
          <IconPalette />
          Themes
        </motion.button>
        <button aria-label="My account" title="My account" className={`nav-item account-nav ${route.page === "profile" ? "active" : ""}`} onClick={() => setRoute({ page: "profile" })}>
          {user && !user.isGuest ? <Avatar user={user} /> : <IconUser />}
          <span>{user && !user.isGuest ? user.displayName : "My account"}<small>{user && !user.isGuest ? `@${user.username}` : "Sign in or create an account"}</small></span>
        </button>
        <div className="sidebar-footer">
          Hold <kbd>Space</kbd> to arm the timer, release to start, press any key to stop.
        </div>
      </nav>
      <main className="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${route.page}:${user?.id ?? "loading"}:${user?.isGuest}`}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={PAGE_TRANSITION}
            style={{ minHeight: "100%" }}
          >
            <Suspense fallback={<div className="boot">Loading…</div>}>
              {!user ? <div className="page"><p role={bootError ? "alert" : "status"}>{bootError || "Loading your workspace…"}</p>{bootError && <button className="btn" onClick={() => setBootRetry(v => v + 1)}>Try again</button>}</div> : <>
              {route.page === "algorithms" && <AlgorithmsPage />}
              {route.page === "training" && <TrainingPage />}
              {route.page === "playground" && <PlaygroundPage />}
              {route.page === "community" && <CommunityPage />}
              {route.page === "profile" && <ProfilePage key={route.username ?? "self"} username={route.username} />}
              </>}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <ThemePicker open={themesOpen} onClose={() => setThemesOpen(false)} />
    </div>
  );
}
