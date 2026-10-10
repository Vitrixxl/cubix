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
import { PageSkeleton, usePhone } from "./ui";
import { AppSkeleton, CaseDialogSkeleton, PageFallback, SettingsSkeleton } from "./skeletons";
import { Header, NarrowSectionTabs, PhoneTop, TIP_DELAY, TabBar } from "./shell";
import { Practice } from "./practice";
import { coaching } from "./coaching/client";
import { community } from "./community/client";
import { live } from "./coaching/call";
import { SignInDialog } from "./login";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Navigate, useLocation, useNavigate } from "react-router";
import { bindNavigation, go, readRoute, type AppRoute } from "./navigation";
import { onIntent, whenIdle } from "./prefetch";
import { accountOnly, localePath, loginNext, splitLanguage } from "../../src/client/lib/route";
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
/** Each page's code, loaded on first use (or ahead, see `warm`). */
const CODE = {
  algorithms: () => import("./algorithms"),
  profile: () => import("./profile"),
  duel: () => import("./duel"),
  coaching: () => import("./coaching/page"),
  community: () => import("./community/page"),
  tournaments: () => import("./tournaments/page"),
  match: () => import("./tournaments/match"),
  daily: () => import("./daily"),
  training: () => import("./setup"),
  learn: () => import("./learn"),
};
/**
 * What a link opens, fetched ahead (prefetch.ts): the page's code and, for the pages that read the server, their list
 * (read only, at most once a minute). The timer and a drill's session are in the app's first part already.
 */
const warmed = new Map<string, number>();
function warm(route: AppRoute, data: boolean) {
  const load = route.page === "training" && route.trainingStep === "practice" ? undefined : CODE[route.page as keyof typeof CODE];
  // A chunk that fails here is asked again, and reported, by the page itself when opened.
  void load?.().catch(() => {});
  if (!data || !s.ready || !s.signedIn || s.user.isGuest) return;
  const key = route.page === "coaching" ? (coaching.isCoach ? "dashboard" : "coaches") : route.page === "community" ? "conversations" : route.page === "tournaments" && !route.view ? "tournaments" : "";
  if (!key || Date.now() - (warmed.get(route.page) ?? 0) < 60_000) return;
  warmed.set(route.page, Date.now());
  void (route.page === "coaching" ? coaching.load(key as "dashboard" | "coaches") : community.load(key)).catch(() => {});
}
function prefetchLinks() {
  onIntent((link) => {
    const route = readRoute(link.pathname, link.search);
    if (route) warm(route, true);
  });
  // The sections of the header, likeliest to be opened next: their code once the browser has nothing else to do.
  whenIdle(() => ["learn", "algorithms", "duel", "profile"].forEach((page) => warm(readRoute("/" + page, "")!, false)));
}
const Introduction = later(() => import("./introduction"), (m) => m.Introduction);
const Onboarding = later(() => import("./introduction"), (m) => m.Onboarding);
const Algorithms = later(CODE.algorithms, (m) => m.Algorithms);
const Profile = later(CODE.profile, (m) => m.Profile);
const DuelPage = later(CODE.duel, (m) => m.DuelPage);
const CoachingPage = later(CODE.coaching, (m) => m.CoachingPage);
const CommunityPage = later(CODE.community, (m) => m.CommunityPage);
const TournamentsPage = later(CODE.tournaments, (m) => m.TournamentsPage);
const MatchPage = later(CODE.match, (m) => m.MatchPage);
const DailyPage = later(CODE.daily, (m) => m.DailyPage);
const TrainingSetup = later(CODE.training, (m) => m.TrainingSetup);
const Learn = later(CODE.learn, (m) => m.Learn);
const Overlays = later(() => import("./overlays"), (m) => m.Overlays);
const CaseDialog = later(() => import("./algorithms"), (m) => m.CaseDialog);
/** Whether a case's dialog was opened yet: its part of the app loads then, and stays for the next. */
let caseOpened = false;
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
  // Signing in is a dialog over a page. The address /login opens it over the page it names (`redirect`), else the
  // timer; a page of an account opens it for a guest, who stays on the page they were on.
  const account = (path: string) => { const url = new URL(path, "https://x"), r = readRoute(url.pathname, url.search); return !!r && accountOnly(r); };
  const asked = route?.page === "login" ? loginNext(location.search) : s.ready && s.user.isGuest && route && accountOnly(route) ? location.pathname + location.search : null;
  useEffect(() => {
    if (!s.ready || asked === null) return;
    if (s.signedIn) return go(asked, true);
    s.askSignIn(account(asked) ? asked : "");
    if (route?.page === "login") go(account(asked) ? "/timer" : asked, true);
    else if ((history.state?.idx ?? 0) > 0) go(-1);
    else go("/timer", true);
  }, [asked, s.ready]);
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
      if (s.expired || /^\/onboarding$/.test(splitLanguage(window.location.pathname).path) || s.overlay === "tour" || s.overlay === "signin") return;
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
        (s.page === "tournaments" || s.page === "match" ? ":" + s.view.split("/")[0] : "") +
        (s.page === "community" && s.view.startsWith("people") ? ":people" : "");
  // On its way to the page under the sign-in dialog (above).
  if (asked !== null) return <AppSkeleton phone={mobile} />;
  if (s.ready && s.signedIn && !s.introductionReady) return <AppSkeleton phone={mobile} />;
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
        <div data-app-shell="" data-running={s.running ? "" : undefined} className="group/app flex h-svh min-h-0 flex-col overflow-hidden">
          {/* A battle or a tournament under way takes the whole window. */}
          {!mobile && !arena && <Header />}
          {!mobile && !arena && <NarrowSectionTabs />}
          {mobile && !arena && <PhoneTop />}
          <div className="flex min-h-0 flex-1">
          <main data-slot="app-main" className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            {!s.ready ? (
              <PageFallback phone={mobile} />
            ) : (
              <div key={frameKey} className="absolute inset-0 flex min-h-0 flex-col">
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
                  ) : s.page === "daily" ? (
                    <DailyPage />
                  ) : (
                    <Profile />
                  )}
                </Suspense>
              </div>
            )}
          </main>
          </div>
          {mobile && !arena && <TabBar />}
        </div>
        {live.call && <Suspense fallback={null}><FloatingCall /></Suspense>}
        <Toasts light={s.light} />
        <Confirmations />
        <SignInDialog />
        <Suspense fallback={s.overlay === "settings" ? <SettingsSkeleton phone={mobile} /> : null}><Overlays /></Suspense>
        {(caseOpened ||= !!(s.caseDialog || (s.page === "algorithms" && s.caseId))) && <Suspense fallback={<CaseDialogSkeleton phone={mobile} />}><CaseDialog /></Suspense>}
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
  prefetchLinks();
  if (document.documentElement.hasAttribute("data-account") || isPhone(innerWidth)) reveal();
  void setLanguage(splitLanguage(location.pathname).language ?? preferred(), false).finally(() => createRoot(document.getElementById("root")!).render(<Routed />));
}
