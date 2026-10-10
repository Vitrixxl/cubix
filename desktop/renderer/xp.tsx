/** The account's level: its bar wherever it shows, and the one that rises from the bottom and fills when XP is earned. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { store as s } from "./store";
import { NUMERIC } from "./ui";
import { cn } from "@/lib/utils";
import { level } from "../../src/client/lib/achievements";
import { tr } from "../../src/client/i18n";

/** The level and how far into the next one: "Level 12 · 450 / 1,200 XP" over its bar. */
export function LevelBar({ xp, className }: { xp: number; className?: string }) {
  const l = level(xp);
  return (
    <span className={cn("flex flex-col gap-1.5", className)}>
      <span className="flex items-baseline justify-between gap-3">
        <b className="text-sm font-extrabold text-foreground">{tr("Level {0}", { 0: l.level })}</b>
        <span className={cn(NUMERIC, "text-xs font-bold text-muted-foreground")}>
          {tr("{0} / {1} XP", { 0: l.into.toLocaleString(), 1: l.span.toLocaleString() })}
        </span>
      </span>
      <span
        role="progressbar"
        aria-label={tr("Experience")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((l.into / l.span) * 100)}
        aria-valuetext={tr("{0} XP in all", { 0: xp.toLocaleString() })}
        className="block h-1.5 overflow-hidden rounded-full bg-background"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: (l.into / l.span) * 100 + "%" }} />
      </span>
    </span>
  );
}

/**
 * The gain of XP, at the bottom of the window for a few seconds: the bar of the level appears where it was and grows to
 * where it is; a new level fills it from empty under its name.
 */
export function XpGain() {
  useSyncExternalStore(s.subscribe, () => s.version, () => s.version);
  const gain = s.xpGain,
    [shown, setShown] = useState(false),
    [grown, setGrown] = useState(false);
  useEffect(() => {
    if (!gain) return;
    setShown(true);
    setGrown(false);
    // Drawn at the old width first, then grown on the next frame so that the width transitions.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true))),
      hide = setTimeout(() => setShown(false), 4000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hide);
    };
  }, [gain?.at]);
  if (!gain || s.running) return null;
  const before = level(gain.from),
    after = level(gain.to),
    up = after.level > before.level,
    width = grown ? after.into / after.span : up ? 0 : before.into / before.span;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-all duration-300 motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div className="flex w-80 flex-col gap-2 rounded-2xl bg-popover px-4 py-3 shadow-lg ring-1 ring-foreground/10">
        <div className="flex items-baseline justify-between gap-3">
          <b className="flex items-center gap-1.5 text-sm font-extrabold">
            {up && <Sparkles className="size-4 text-primary" aria-hidden="true" />}
            {up ? tr("Level up · level {0}", { 0: after.level }) : tr("Level {0}", { 0: after.level })}
          </b>
          <span className={cn(NUMERIC, "text-sm font-extrabold text-primary")}>{tr("+{0} XP", { 0: (gain.to - gain.from).toLocaleString() })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary transition-[width] delay-300 duration-1000 ease-out motion-reduce:transition-none"
            style={{ width: width * 100 + "%" }}
          />
        </div>
        <span className={cn(NUMERIC, "text-xs font-bold text-muted-foreground")}>
          {tr("{0} / {1} XP", { 0: after.into.toLocaleString(), 1: after.span.toLocaleString() })}
        </span>
      </div>
    </div>
  );
}
