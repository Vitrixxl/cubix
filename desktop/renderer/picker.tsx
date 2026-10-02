/**
 * A choice in the middle of the page, as large cards: what to train, what to learn, which method. Each card names the
 * choice, says what it holds and, for a course under way, how far it went.
 */
import { Children } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Bar, run, type Props } from "./ui";
import { cn } from "@/lib/utils";

/** The cards, centred on the page: two or four in a 2×2 square, three in a row; `foot` (a start) right under them. */
export function Picker({ label, tour, foot, children }: { label: string; tour?: string; foot?: React.ReactNode } & Props) {
  const count = Children.toArray(children).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-4 md:justify-center md:py-8">
      <nav aria-label={label} data-tour={tour} className={cn("grid w-full gap-3 md:gap-4", count === 3 ? "max-w-4xl md:grid-cols-3" : "max-w-3xl md:grid-cols-2")}>
        {children}
      </nav>
      {foot}
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
      className={cn(
        "group/card flex min-h-28 flex-col gap-3 rounded-2xl border bg-card p-4 text-left outline-none transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:min-h-44 md:p-6",
        pressed && "border-primary/50 bg-primary/10 hover:border-primary/50 hover:bg-primary/10",
      )}
    >
      <span className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover/card:text-primary [&_svg:not([class*='size-'])]:size-5",
            (marked || pressed) && "bg-primary/15 text-primary",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</span>
        {pressed === undefined ? (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5 group-hover/card:text-foreground" />
        ) : (
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", pressed ? "border-primary bg-primary text-primary-foreground" : "border-input group-hover/card:border-primary/60")}>
            {pressed && <Check className="size-3.5" />}
          </span>
        )}
      </span>
      <span className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{detail}</span>
      {(meta || badge || progress !== undefined) && (
        <span className="mt-auto flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {badge && <span className="rounded-full bg-primary/12 px-2 py-0.5 font-medium text-primary">{badge}</span>}
            {meta}
          </span>
          {progress !== undefined && <Bar ratio={progress} className="max-w-56" />}
        </span>
      )}
    </button>
  );
}
