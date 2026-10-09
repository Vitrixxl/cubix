import { lazy, Suspense, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { store as s, TIMES_OPEN_WIDTH } from "./store";
import { language, onLanguage, preferred, setLanguage } from "../../src/client/i18n";
import { onEvent } from "./bridge";
import { applyTheme, faviconPuzzle } from "./theme";
import { Toasts } from "./Toasts";
import { Confirmations } from "./confirm";
import { ErrorNotification } from "./ErrorNotification";
import { PageSkeleton, WindowSidebar, usePhone } from "./ui";
import { PageFallback } from "./skeletons";
import { Rail, TIP_DELAY, TabBar } from "./shell";
import { Practice } from "./practice";
import { CoachingSidebar } from "./coaching/rail";
import { coaching } from "./coaching/client";
import { community } from "./community/client";
import { live } from "./coaching/call";
import { LoginPage } from "./login";
import { SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Navigate, useLocation, useNavigate } from "react-router";
import { bindNavigation, go, readRoute } from "./navigation";
import { accountOnly, localePath, loginNext, loginUrl, splitLanguage } from "../../src/client/lib/route";
import { pageSeo, pageTitle } from "./seo";
import { isPhone } from "../../src/client/lib/viewport";
import type { PuzzleId } from "../../src/shared/puzzles";
import { journeyProfile } from "../../src/client/lib/journey";
import { said, useLanguage } from "./base";
/** Kept on this device for the next launch: an account's device never shows a page written ahead of time (boot.ts). */
const SIGNED_IN_KEY = "cubix.signedIn";
/**
 * A part of the app loaded on first use. A tab left open across a deploy may no longer find it on the server: the
 * page loads again, once, to get the new version.
 */
const later = <M,>(load: () => Promise<M>, pick: (module: M) => React.ComponentType<any>) =>
  lazy(() =>
    load().then(
      (module) => (sessionStorage.removeItem(RELOADED), { default: pick(module) }),
      (error) => {
        if (sessionStorage.getItem(RELOADED)) throw error;
        sessionStorage.setItem(RELOADED, "1");
        location.reload();
        return new Promise<never>(() => {});
      },
    ),
  );
const RELOADED = "cubix.reloadedForUpdate";
const Introduction = later(() => import("./introduction"), (m) => m.Introduction);
const Onboarding = later(() => import("./introduction"), (m) => m.Onboarding);
const Algorithms = later(() => import("./algorithms"), (m) => m.Algorithms);
const Profile = later(() => import("./profile"), (m) => m.Profile);
const DuelPage = later(() => import("./duel"), (m) => m.DuelPage);
const CoachingPage = later(() => import("./coaching/page"), (m) => m.CoachingPage);
const CommunityPage = later(() => import("./community/page"), (m) => m.CommunityPage);
const TournamentsPage = later(() => import("./tournaments/page"), (m) => m.TournamentsPage);
const MatchPage = later(() => import("./tournaments/match"), (m) => m.MatchPage);
const TrainingSetup = later(() => import("./setup"), (m) => m.TrainingSetup);
const Learn = later(() => import("./learn"), (m) => m.Learn);
const Overlays = later(() => import("./overlays"), (m) => m.Overlays);
const FloatingCall = later(() => import("./coaching/floating"), (m) => m.FloatingCall);
const SharedSolve = later(() => import("./SolveView"), (m) => m.SharedSolve);
function App() {
  useSyncExternalStore(s.subscribe, () => s.version, () => s.version);
  const location = useLocation(), navigate = useNavigate();
  const route = readRoute(location.pathname, location.search);
  useLayoutEffect(() => bindNavigation(navigate), [navigate]);
  useLayoutEffect(() => {
    if (s.ready && route) s.applyRoute(route);
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
      if (s.expired || /^\/(onboarding|login)$/.test(splitLanguage(window.location.pathname).path) || s.overlay === "tour") return;
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
            Digit6: "nav:tournaments",
            Digit7: "nav:community",
            Digit8: "nav:coaching",
            Digit9: "nav:analysis",
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
      } else if (!s.overlay && !s.assisted && s.page === "learn" && s.learnMethod && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
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
  useEffect(() => void (s.error && !s.ready && reveal()), [s.error]);
  // Coaching keeps its socket open while an account is signed in: messages and calls reach every page.
  useEffect(() => coaching.attach(s.ready && s.signedIn ? s.user.id : null), [s.ready, s.signedIn, s.user.id]);
  useEffect(() => community.attach(s.ready && s.signedIn && !s.user.isGuest ? s.user.id : null), [s.ready, s.signedIn, s.user.id]);
  useLayoutEffect(() => faviconPuzzle(s.event().id), [s.puzzle, s.solveMode]);
  useEffect(() => {
    if (!s.ready) return;
    try {
      localStorage.setItem(SIGNED_IN_KEY, s.user.isGuest ? "0" : "1");
    } catch {}
  }, [s.ready, s.user.isGuest]);
  // The tab's title is the page's, as written for search engines (seo.ts).
  useEffect(() => {
    const seo = pageSeo(route, s.puzzle as PuzzleId);
    document.title = seo ? pageTitle(seo) : "Qbix";
  }, [location.pathname, location.search, s.puzzle, language()]);
  const mobile = usePhone(),
    // On the desktop a case opens beside the list, so the algorithms page stays in place.
    frameKey =
      s.page +
        (s.caseId && (mobile || s.page !== "algorithms") ? ":case" : "") +
        (s.page === "profile" ? ":" + s.profileMode : "") +
        (s.page === "training" ? ":" + s.trainingStep : "") +
        (s.page === "learn" ? ":" + (s.learnMethod || "home") : "") +
        // A list and its detail (messages, students) stay in place; a coach or a call is a page of its own.
        (s.page === "coaching" ? ":" + (/^(coach|call)\//.test(s.coachingView) ? s.coachingView : s.coachingView.split("/")[0]) : "") +
        // The community is one page, a conversation opening in place; a tournament or a match is a page of its own.
        (s.page === "tournaments" || s.page === "match" ? ":" + s.view.split("/")[0] : "");
  // The login page, asked for or after an ended session; signed in, it goes on to where it was asked from.
  if (route?.page === "login" && s.ready && s.signedIn) return <Navigate to={loginNext(location.search)} replace />;
  if (route?.page === "login" || s.expired)
    return (
      <TooltipProvider delay={TIP_DELAY}>
        <Shown />
        <LoginPage />
        <Toasts light={s.light} />
      </TooltipProvider>
    );
  // A guest uses the app on this device; the pages of an account ask to sign in, and come back once signed in.
  if (s.ready && s.user.isGuest && route && accountOnly(route)) return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
  if (s.ready && s.signedIn && !s.introductionReady) return <PageSkeleton />;
  // A link to someone or something (a friend's link, a tournament, a match) waits for the end of the introduction.
  if (s.ready && s.signedIn && !journeyProfile(s.journey) && route?.page !== "onboarding")
    return <Navigate to={"/onboarding" + (route && ["community", "tournaments", "match"].includes(route.page) ? "?next=" + encodeURIComponent(location.pathname + location.search) : "")} replace />;
  if (!route) return <Navigate to="/timer" replace />;
  // A battle or a tournament under way holds the whole app until it is over or given up.
  const held = community.competition,
    arena = held?.match ? "/match/" + held.match : held?.tournament ? "/tournaments/" + held.tournament : null,
    inArena = !!arena && (location.pathname === arena || (!held?.match && location.pathname.startsWith("/match/")));
  if (arena && !inArena && route.page !== "onboarding") return <Navigate to={arena} replace />;
  // A puzzle that cannot be solved yet keeps to its course; the tour still shows every section.
  if (route.page === "onboarding") return <TooltipProvider delay={TIP_DELAY}><Suspense fallback={<PageSkeleton />}><Shown /><Onboarding key={s.user.id} /></Suspense><ErrorNotification message={said(s.error)} /></TooltipProvider>;
  return (
    <TooltipProvider delay={TIP_DELAY}>
      <MotionConfig reducedMotion="user">
        <WindowSidebar
          // Coaching has its own sidebar beside; a match takes the whole window.
          compact={s.page === "coaching" || s.page === "match"}
          data-app-shell=""
          data-running={s.running ? "" : undefined}
          className="group/app h-svh min-h-0 overflow-hidden bg-background max-md:flex-col"
          style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "calc(3rem + 1px)" } as React.CSSProperties}
        >
          {/* The coaching sidebar pushes out of the app's, side by side with it. */}
          {!mobile && !arena && (
            <div className="flex shrink-0">
              <Rail />
              {!s.user.isGuest && <CoachingSidebar open={s.page === "coaching"} />}
            </div>
          )}
          <SidebarInset className="relative min-h-0 min-w-0 overflow-hidden">
            {!s.ready ? (
              <PageFallback phone={mobile} />
            ) : (
              <div key={frameKey} className="absolute inset-0 flex min-h-0 flex-col bg-background">
                <Suspense fallback={<PageFallback phone={mobile} />}>
                  <Shown />
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
                  ) : s.page === "community" ? (
                    <CommunityPage />
                  ) : s.page === "tournaments" ? (
                    <TournamentsPage />
                  ) : s.page === "match" ? (
                    <MatchPage />
                  ) : (
                    <Profile />
                  )}
                </Suspense>
              </div>
            )}
          </SidebarInset>
          {mobile && !arena && <TabBar />}
        </WindowSidebar>
        {live.call && <Suspense fallback={null}><FloatingCall /></Suspense>}
        <Toasts light={s.light} />
        <Confirmations />
        <Suspense fallback={null}><Overlays /></Suspense>
        <ErrorNotification message={said(s.error)} />
        {s.overlay === "tour" && <Suspense fallback={null}><Introduction key={s.user.id} /></Suspense>}
      </MotionConfig>
    </TooltipProvider>
  );
}

/**
 * The page written ahead of time (desktop/prerender.tsx) stays in view while the app starts out of sight; it gives way
 * once the app draws a page itself (`Shown`), or fails to start (its error is then in view). An app that never starts
 * (no script, an old browser) leaves the page as it is, readable.
 */
const reveal = () => document.getElementById("prerendered")?.remove();
function Shown() {
  useLayoutEffect(reveal, []);
  return null;
}
// The address follows the language: English at the root, any other under its prefix (/fr/timer). A change of language
// moves the address first, then draws everything again under it (`Routed`).
onLanguage(() => {
  const path = localePath(language(), splitLanguage(location.pathname).path);
  if (path !== location.pathname) history.replaceState(history.state, "", path + location.search + location.hash);
});
onLanguage(() => s.emit());
/** A solve shared by its link opens on its own, signed in or not; anything else is the app. */
export function Root() {
  const shared = /^\/solve\/([\w-]+)$/.exec(useLocation().pathname)?.[1];
  return shared ? (
    <TooltipProvider delay={TIP_DELAY}>
      <Suspense fallback={null}><Shown /><SharedSolve token={shared} /></Suspense>
      <Toasts light={s.light} />
    </TooltipProvider>
  ) : (
    <App />
  );
}
/** The router under the language's prefix, drawn again from the address when the language changes. */
function Routed() {
  const current = useLanguage();
  return (
    <BrowserRouter key={current} basename={current === "en" ? undefined : "/" + current}>
      <Root />
    </BrowserRouter>
  );
}
/** The app opens in the language of its address (/fr/…), else the device's, its texts loaded. */
export function mount() {
  if (document.documentElement.hasAttribute("data-account") || isPhone(innerWidth)) reveal();
  void setLanguage(splitLanguage(location.pathname).language ?? preferred(), false).finally(() => createRoot(document.getElementById("root")!).render(<Routed />));
}
