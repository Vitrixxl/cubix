/** The marks the profile's pages share: an achievement's badge, a battle's result, and an empty battle history. */
import { BookOpen, Flame, Gauge, Layers, Swords, Timer, type LucideIcon } from "lucide-react";
import { Button, Empty, NUMERIC } from "../ui";
import { achievementBadge } from "../../../src/client/lib/achievements";
import { catalog } from "../store";
import type { AchievementCategory, AchievementDto } from "../../../src/shared/types";
import { RESULT_MARK, type DuelRecord } from "../duelClient";
import { cn } from "@/lib/utils";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** The achievements' categories in their order: each one's name and icon (its badges, its filter). */
export const CATEGORIES: { id: AchievementCategory; label: string; icon: LucideIcon }[] = [
  { id: "speed", label: "Speed", icon: Timer },
  { id: "average", label: "Averages", icon: Gauge },
  { id: "volume", label: "Volume", icon: Layers },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "dedication", label: "Dedication", icon: Flame },
];
export const categoryOf = (a: { category: string }) => CATEGORIES.find((c) => c.id === a.category) ?? CATEGORIES[0]!;

/**
 * An achievement's badge, the same wherever one shows: its category's icon over its goal (10, 1:00, OLL…), tinted with
 * the app's colour once unlocked; until then a quiet disc whose ring fills with the progress. Small badges keep the
 * goal only.
 */
export function AchievementBadge({ a, size = 44, className }: { a: AchievementDto; size?: number; className?: string }) {
  const value = achievementBadge(a, catalog.sets),
    Icon = categoryOf(a).icon,
    small = size < 44;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 flex-col items-center justify-center rounded-full leading-none",
        a.unlocked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {!a.unlocked && (
        <svg viewBox="0 0 40 40" fill="none" strokeWidth={2.6} className="absolute inset-0 size-full -rotate-90">
          <circle cx="20" cy="20" r="18" stroke="var(--accent)" />
          <circle cx="20" cy="20" r="18" stroke="var(--primary)" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(0.5, a.ratio * 100)} 100`} />
        </svg>
      )}
      {!small && <Icon className="relative mb-0.5" style={{ width: size * 0.3, height: size * 0.3 }} strokeWidth={2.4} />}
      <b className={cn(NUMERIC, "relative font-extrabold tracking-[-0.03em]")} style={{ fontSize: Math.round(size * (value.length > 4 ? 0.2 : small ? 0.36 : 0.26)) }}>
        {value}
      </b>
    </span>
  );
}

const RESULT_TONE = { win: "bg-success/15 text-success", loss: "bg-destructive/15 text-destructive", draw: "bg-muted text-muted-foreground" } as const;

export function ResultMark({ result }: { result: DuelRecord["result"] }) {
  return (
    <span className={cn(NUMERIC, "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold", RESULT_TONE[result])} aria-label={said(result)}>
      {said(RESULT_MARK[result])}
    </span>
  );
}

/**
 * An empty battle history, centred in whatever room it is given: what a battle is, and the way to a first one.
 * `compact` (the overview's bottom row) leaves out the icon and the margins.
 */
export function NoBattles({ compact = false }: { compact?: boolean }) {
  return (
    <Empty icon={compact ? undefined : Swords} title={tr("No battles yet")} className={cn(compact && "p-0")}>
      <Button action="nav:duel" icon={Swords} variant="outline" tip={tr("Find an opponent")}>
        {tr("Play")}
      </Button>
    </Empty>
  );
}
