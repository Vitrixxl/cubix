/**
 * A choice at the top of the page, as large cards: what to train, what to learn, which method. Each card names the
 * choice, says what it holds and, for a course under way, how far it went.
 */
import { Children } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Bar, TILE, run, type Props } from "./ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { said } from "./base";
import { tr } from "../../src/client/i18n";

/**
 * The cards in the middle of the space under the page's header, both ways: two or four in a 2×2 square, three or more
 * by three; `foot` (a start) right under them. Taller than the space, they scroll from the top (`my-auto`, not
 * `justify-center`, so nothing is cut).
 */
export function Picker({ label, tour, foot, children }: { label: string; tour?: string; foot?: React.ReactNode } & Props) {
  const count = Children.toArray(children).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <div className="my-auto flex w-full flex-col items-center md:pb-[6vh]">
        <nav
          aria-label={said(label)}
          data-tour={tour}
          className={cn("grid w-full auto-rows-fr gap-3 md:gap-4", count === 2 || count === 4 ? "max-w-5xl md:grid-cols-2" : "max-w-7xl md:grid-cols-2 lg:grid-cols-3")}
        >
          {children}
        </nav>
        {foot}
      </div>
    </div>
  );
}

/** One choice: its icon, title and line, then a quieter line of figures and the progress of a course under way.
 * With `pressed`, a card among several to pick together: a check in place of the arrow. */
export function PickerCard({
  action,
  icon,
  title,
  detail,
  meta,
  badge,
  marked = false,
  progress,
  disabled = false,
  pressed,
}: {
  action: string;
  icon: React.ReactNode;
  title: string;
  detail: React.ReactNode;
  meta?: React.ReactNode;
  badge?: string;
  /** The one to pick by default (trained last, recommended): its icon takes the accent. */
  marked?: boolean;
  progress?: number;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      data-action={action}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={run(action)}
      className={cn(TILE, "group/card flex min-h-28 flex-col gap-3 p-4 md:min-h-44 md:p-5", pressed && "hover:border-primary/50 hover:bg-primary/10")}
    >
      <span className="flex items-center gap-3">
        {/* The icon on a quiet square (base.tsx IconTile), lit with the accent on the card to pick. */}
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/card:text-primary [&_svg:not([class*='size-'])]:size-5",
            (marked || pressed) && "bg-primary/15 text-primary",
          )}
        >
          {icon}
        </span>
        <span className="line-clamp-2 min-w-0 flex-1 text-base font-semibold tracking-tight text-balance md:text-lg">{said(title)}</span>
        {pressed === undefined ? (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5 group-hover/card:text-foreground" />
        ) : (
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", pressed ? "border-primary bg-primary text-primary-foreground" : "border-input group-hover/card:border-primary/60")}>
            {pressed && <Check className="size-3.5" />}
          </span>
        )}
      </span>
      <span className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{said(detail)}</span>
      {(meta || badge || progress !== undefined) && (
        <span className="mt-auto flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {/* All of it learned: said with a check, and the bar in green. */}
            {progress === 1 && (
              <Badge variant="success">
                <Check strokeWidth={3} />
                {tr("Learned")}
              </Badge>
            )}
            {badge && <Badge variant="accent">{said(badge)}</Badge>}
            {meta}
          </span>
          {progress !== undefined && <Bar ratio={progress} fill={progress === 1 ? "bg-success" : undefined} />}
        </span>
      )}
    </button>
  );
}
