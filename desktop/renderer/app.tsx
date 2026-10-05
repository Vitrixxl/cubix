import { lazy, Suspense, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig } from "motion/react";
import { store as s, TIMES_OPEN_WIDTH } from "./store";
import { onEvent } from "./bridge";
import { applyTheme, faviconPuzzle } from "./theme";
import { Toasts } from "./Toasts";
import { ErrorNotification } from "./ErrorNotification";
import { PageSkeleton, WindowSidebar, usePhone } from "./ui";
import { Frame, Rail, TabBar } from "./shell";
import { Practice } from "./practice";
import { TrainingSetup } from "./setup";
import { Algorithms } from "./algorithms";
import { Profile } from "./profile";
import { DuelPage } from "./duel";
import { CoachingPage } from "./coaching/page";
import { CoachingSidebar } from "./coaching/rail";
import { coaching } from "./coaching/client";
import { FloatingCall } from "./coaching/floating";
import { Learn } from "./learn";
import { Overlays } from "./overlays";
import { LoginPage } from "./login";
import { SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Navigate, useLocation, useNavigate } from "react-router";
import { bindNavigation, go, pageUrl, readRoute } from "./navigation";
import type { PuzzleId } from "../../src/shared/puzzles";
import { journeyProfile } from "../../src/client/lib/journey";
/** Kept on this device so a relaunch draws the right screen before the engine answers. */
const SIGNED_IN_KEY = "cubix.signedIn";
const Introduction = lazy(() => import("./introduction").then(m => ({ default: m.Introduction })));
const Onboarding = lazy(() => import("./introduction").then(m => ({ default: m.Onboarding })));
function App() {
  useSyncExternalStore(s.subscribe, () => s.version);
  const location = useLocation(), navigate = useNavigate();
  const route = readRoute(location.pathname, location.search);
  useLayoutEffect(() => bindNavigation(navigate), [navigate]);
  useLayoutEffect(() => {
    if (s.ready && route && route.page !== "onboarding") s.applyRoute(route);
  }, [location.pathname, location.search, s.ready]);
  useEffect(() => {
    void s.init();
    const unsubscribe = onEvent((event) => {
      if (event.event === "changed") void s.refresh();
      else if (event.event === "sync") s.syncStatus(event.value);
      else if (event.event === "error") s.fail(event.value);
      // A newer version took over the data: reload onto it, never in the middle of a solve.
      else if (event.event === "replaced") {
        const reload = () => (s.running ? setTimeout(reload, 500) : window.location.reload());
        reload();
      }
      else if (event.event === "browser-backward") go(-1);
      else if (event.event === "browser-forward") go(1);
    });
    const key = (e: KeyboardEvent) => {
      if (!s.signedIn) return;
      if (window.location.pathname === "/onboarding" || s.overlay === "tour") return;
      const typing = (e.target as HTMLElement).closest("input,textarea");
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        void s.action("search");
        return;
      }
      if (typing && !e.altKey) return;
      if (e.altKey) {
        const action = (
          {
            Digit1: "nav:playground",
            Digit2: "nav:algorithms",
            Digit3: "nav:learn",
            Digit4: "nav:training",
            Digit5: "nav:duel",
            Digit6: "nav:coaching",
            KeyS: "settings",
            KeyN: "next",
            KeyP: "previous",
            KeyC: "trainingSetup",
            KeyT: "times",
            KeyA: "auf",
            KeyH: "solution",
            KeyB: "back",
            ArrowLeft: "historyBack",
            ArrowRight: "historyForward",
          } as any
        )[e.code];
        if (action) {
          e.preventDefault();
          void s.action(action);
        }
      } else if (e.key === "Escape") {
        // Dialogs and menus close themselves; with none open, Escape folds the times away.
        if (!s.overlay && innerWidth < TIMES_OPEN_WIDTH && s.showTimes) {
          s.showTimes = false;
          s.emit();
        }
      } else if (!s.overlay && s.page === "learn" && s.learnMethod && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        void s.action(e.key === "ArrowLeft" ? "previous" : "next");
      } else if (
        !s.overlay &&
        s.page === "algorithms" &&
        s.caseId &&
        ["ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        void s.action(
          "caseStep:" + (e.key === "ArrowLeft" ? "previous" : "next"),
        );
      }
    };
    // Mouse back/forward buttons; Windows reports them as app commands instead (see electron/main.ts).
    const mouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (!navigator.userAgent.includes("Windows")) go(e.button === 3 ? -1 : 1);
    };
    addEventListener("keydown", key);
    addEventListener("mouseup", mouse);
    return () => {
      unsubscribe();
      removeEventListener("keydown", key);
      removeEventListener("mouseup", mouse);
    };
  }, []);
  useLayoutEffect(() => applyTheme(s.themeName, s.light), [s.themeName, s.light]);
  // Coaching keeps its socket open while an account is signed in: messages and calls reach every page.
  useEffect(() => coaching.attach(s.ready && s.signedIn ? s.user.id : null), [s.ready, s.signedIn, s.user.id]);
  useLayoutEffect(() => faviconPuzzle(s.event().id), [s.puzzle, s.solveMode]);
  useEffect(() => {
    if (!s.ready) return;
    try {
      localStorage.setItem(SIGNED_IN_KEY, s.signedIn ? "1" : "0");
    } catch {}
  }, [s.ready, s.signedIn]);
  const mobile = usePhone(),
    // On the desktop a case opens beside the list, so the algorithms page stays in place.
    frameKey =
      s.page +
        (s.caseId && (mobile || s.page !== "algorithms") ? ":case" : "") +
        (s.page === "profile" ? ":" + s.profileMode : "") +
        (s.page === "training" ? ":" + s.trainingStep : "") +
        (s.page === "learn" ? ":" + (s.learnMethod || s.learnSection || "home") : "") +
        // A list and its detail (messages, students) stay in place; a coach or a call is a page of its own.
        (s.page === "coaching" ? ":" + (/^(coach|call)\//.test(s.coachingView) ? s.coachingView : s.coachingView.split("/")[0]) : "");
  const slide = { direction: s.direction, axis: s.axis };
  // Until the engine answers, the last launch decides; a first visit opens on the login page.
  const signedIn = s.ready ? s.signedIn : localStorage.getItem(SIGNED_IN_KEY) === "1";
  if (!signedIn)
    return (
      <TooltipProvider delay={200}>
        <LoginPage />
        <Toasts light={s.light} />
      </TooltipProvider>
    );
  if (s.ready && !s.introductionReady) return <PageSkeleton />;
  if (s.ready && !journeyProfile(s.journey) && route?.page !== "onboarding") return <Navigate to="/onboarding" replace />;
  if (!route) return <Navigate to="/timer" replace />;
  // A puzzle that cannot be solved yet keeps to its course; the tour still shows every section.
  if (s.ready && s.overlay !== "tour" && s.lockedPage(route.page, route.puzzle)) return <Navigate to={pageUrl("learn", { puzzle: route.puzzle ?? (s.puzzle as PuzzleId) })} replace />;
  if (route.page === "onboarding") return <TooltipProvider><Suspense fallback={<PageSkeleton />}><Onboarding key={s.user.id} /></Suspense><ErrorNotification message={s.error} /></TooltipProvider>;
  return (
    <TooltipProvider delay={400}>
      <MotionConfig reducedMotion="user">
        <WindowSidebar
          compact={s.page === "coaching"}
          data-app-shell=""
          data-running={s.running ? "" : undefined}
          className="group/app h-svh min-h-0 overflow-hidden bg-background max-md:flex-col"
          style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "calc(3rem + 1px)" } as React.CSSProperties}
        >
          {/* The coaching sidebar pushes out of the app's, side by side with it. */}
          {!mobile && (
            <div className="flex shrink-0">
              <Rail />
              <CoachingSidebar open={s.page === "coaching"} />
            </div>
          )}
          <SidebarInset className="relative min-h-0 min-w-0 overflow-hidden">
            {!s.ready ? (
              <PageSkeleton side={!mobile} />
            ) : (
              <AnimatePresence initial={false} custom={slide}>
                <Frame key={frameKey} slide={slide}>
                  {s.page === "training" && s.trainingStep === "setup" ? (
                    <TrainingSetup />
                  ) : ["playground", "training"].includes(s.page) ? (
                    <Practice />
                  ) : s.page === "algorithms" ? (
                    <Algorithms />
                  ) : s.page === "learn" ? (
                    <Learn />
                  ) : s.page === "duel" ? (
                    <DuelPage />
                  ) : s.page === "coaching" ? (
                    <CoachingPage />
                  ) : (
                    <Profile />
                  )}
                </Frame>
              </AnimatePresence>
            )}
          </SidebarInset>
          {mobile && <TabBar />}
        </WindowSidebar>
        <FloatingCall />
        <Toasts light={s.light} />
        <Overlays />
        <ErrorNotification message={s.error} />
        {s.overlay === "tour" && <Suspense fallback={null}><Introduction key={s.user.id} /></Suspense>}
      </MotionConfig>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
