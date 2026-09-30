import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig } from "motion/react";
import { store as s } from "./store";
import { onEvent } from "./bridge";
import { applyTheme } from "./theme";
import { Toasts } from "./Toasts";
import { ErrorNotification } from "./ErrorNotification";
import { MOBILE, PageSkeleton, useViewport } from "./ui";
import { Frame, Rail, TabBar } from "./shell";
import { Practice } from "./practice";
import { TrainingSetup } from "./setup";
import { Algorithms } from "./algorithms";
import { Profile } from "./profile";
import { DuelPage } from "./duel";
import { Overlays } from "./overlays";
import { LoginPage } from "./login";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
/** Kept on this device so a relaunch draws the right screen before the engine answers. */
const SIGNED_IN_KEY = "cubix.signedIn";
function App() {
  useSyncExternalStore(s.subscribe, () => s.version);
  useEffect(() => {
    void s.init();
    const unsubscribe = onEvent((event) => {
      if (event.event === "changed") void s.refresh();
      else if (event.event === "sync") s.syncStatus(event.value);
      else if (event.event === "error") s.fail(event.value);
      else if (event.event === "browser-backward") s.travel();
      else if (event.event === "browser-forward") s.travel(false);
    });
    const key = (e: KeyboardEvent) => {
      if (!s.signedIn) return;
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
            Digit3: "nav:training",
            Digit4: "nav:profile",
            Digit5: "nav:duel",
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
        if (!s.overlay && innerWidth < 1024 && s.showTimes) {
          s.showTimes = false;
          s.emit();
        }
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
      if (!navigator.userAgent.includes("Windows")) s.travel(e.button === 3);
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
  useEffect(() => {
    if (!s.ready) return;
    try {
      localStorage.setItem(SIGNED_IN_KEY, s.signedIn ? "1" : "0");
    } catch {}
  }, [s.ready, s.signedIn]);
  const { w } = useViewport(),
    mobile = w <= MOBILE,
    // On the desktop a case opens beside the list, so the algorithms page stays in place.
    frameKey =
      s.page +
        (s.caseId && (mobile || s.page !== "algorithms") ? ":case" : "") +
        (s.page === "profile" ? ":" + s.profileMode : "") +
        (s.page === "training" ? ":" + s.trainingStep : "");
  const signedIn = s.ready ? s.signedIn : localStorage.getItem(SIGNED_IN_KEY) !== "0";
  if (!signedIn)
    return (
      <TooltipProvider delay={200}>
        <LoginPage />
        <Toasts light={s.light} />
      </TooltipProvider>
    );
  return (
    <TooltipProvider delay={400}>
      <MotionConfig reducedMotion="user">
        <SidebarProvider
          open={w > 1100}
          onOpenChange={() => {}}
          data-running={s.running ? "" : undefined}
          className="group/app h-svh min-h-0 overflow-hidden bg-background max-md:flex-col"
          style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
        >
          {!mobile && <Rail />}
          <SidebarInset className="relative min-h-0 min-w-0 overflow-hidden">
            {!s.ready ? (
              <PageSkeleton side={!mobile} />
            ) : (
              <AnimatePresence initial={false} custom={s.direction}>
                <Frame key={frameKey} mobile={mobile}>
                  {s.page === "training" && s.trainingStep === "setup" ? (
                    <TrainingSetup />
                  ) : ["playground", "training"].includes(s.page) ? (
                    <Practice />
                  ) : s.page === "algorithms" ? (
                    <Algorithms />
                  ) : s.page === "duel" ? (
                    <DuelPage />
                  ) : (
                    <Profile />
                  )}
                </Frame>
              </AnimatePresence>
            )}
          </SidebarInset>
          {mobile && <TabBar />}
        </SidebarProvider>
        <Toasts light={s.light} />
        <Overlays />
        <ErrorNotification message={s.error} />
      </MotionConfig>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
