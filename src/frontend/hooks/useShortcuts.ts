import { useEffect } from "react";

export interface Shortcut { key: string; run: () => void; }

export function matchesShortcut(event: Pick<KeyboardEvent, "key" | "code">, shortcut: string): boolean {
  // Printed letters follow the user's layout (A is KeyQ on AZERTY).
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase() === shortcut.toLowerCase();
  // Option/Alt may produce symbols or dead keys; number-row keys vary by layout too.
  return event.code === `Key${shortcut.toUpperCase()}` || event.code === `Digit${shortcut}`;
}

/** Alt shortcuts leave ordinary typing and browser navigation alone. */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('[aria-modal="true"], .timer-surface.holding, .timer-surface.ready, .timer-surface.running')) return;
      const shortcut = shortcuts.find(item => matchesShortcut(event, item.key));
      if (shortcut) { event.preventDefault(); shortcut.run(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, enabled]);
}
