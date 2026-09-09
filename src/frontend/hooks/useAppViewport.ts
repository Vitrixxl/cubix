import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { viewportSizeAtom } from "../state";

/** Use the visible viewport for browser toolbars as well as the on-screen keyboard. */
export function useAppViewport() {
  const setViewport = useSetAtom(viewportSizeAtom);
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const height = viewport?.scale === 1 ? Math.min(window.innerHeight, viewport.height) : window.innerHeight;
      const width = window.innerWidth;
      setViewport(previous => previous.width === width && previous.height === height ? previous : {width,height});
      root.style.setProperty("--app-height", `${height}px`);

    };
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--app-height");
    };
  }, [setViewport]);
}
