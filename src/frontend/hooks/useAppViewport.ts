import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { viewportSizeAtom } from "../state";

/** Safari's layout viewport does not shrink when the on-screen keyboard opens. */
export function useAppViewport() {
  const setViewport = useSetAtom(viewportSizeAtom);
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      setViewport(previous => previous.width === innerWidth && previous.height === innerHeight
        ? previous : { width: innerWidth, height: innerHeight });
      const editing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
      if (editing && window.innerWidth <= 700 && viewport?.scale === 1) {
        root.style.setProperty("--app-height", `${viewport.height}px`);
      } else {
        root.style.removeProperty("--app-height");
      }
    };
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--app-height");
    };
  }, [setViewport]);
}
