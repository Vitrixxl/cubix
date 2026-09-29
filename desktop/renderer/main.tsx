import React, { useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig } from "motion/react";
import { store as s } from "./store";
import { onEvent } from "./bridge";
import { theme } from "./theme";
import { Toasts } from "./Toasts";
import { ErrorNotification } from "./ErrorNotification";
import { Empty, MOBILE, useViewport } from "./ui";
import { Frame, Rail, TabBar } from "./shell";
import { Practice } from "./practice";
import { TrainingSetup } from "./setup";
import { Algorithms } from "./algorithms";
import { Profile } from "./profile";
import { DuelPage } from "./duel";
import { Overlay } from "./overlays";
import "./styles.css";
function App() {
  useSyncExternalStore(s.subscribe, () => s.version);
  useEffect(() => {
    void s.init();
    const unsubscribe = onEvent((event) => {
      if (event.event === "changed") void s.refresh();
      else if (event.event === "error") s.fail(event.value);
      else if (event.event === "browser-backward") s.travel();
      else if (event.event === "browser-forward") s.travel(false);
    });
    const key = (e: KeyboardEvent) => {
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
        s.overlay = "";
        if (innerWidth < 1024) s.showTimes = false;
        s.emit();
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
  const { w } = useViewport(),
    mobile = w <= MOBILE,
    // On the desktop a case opens beside the list, so the algorithms page stays in place.
    frameKey =
      s.page +
        (s.caseId && (mobile || s.page !== "algorithms") ? ":case" : "") +
        (s.page === "profile" ? ":" + s.profileMode : "") +
        (s.page === "training" ? ":" + s.trainingStep : "");
  return (
    <main
      className={
        "app " +
        (s.light ? "light " : "") +
        (s.running ? "is-running " : "") +
        (mobile ? "is-mobile" : "")
      }
      style={theme(s.themeName, s.light) as React.CSSProperties}
    >
      <MotionConfig reducedMotion="user">
        <div className="shell">
          {!mobile && <Rail />}
          <div className="content">
            {!s.ready ? (
              <Empty>{s.error || "Loading…"}</Empty>
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
          </div>
          {mobile && <TabBar />}
        </div>
      </MotionConfig>
      <Toasts light={s.light} />
      {s.overlay && <Overlay key={s.overlay} />}
      <ErrorNotification message={s.error} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
