/** The profile's one building block: a card with a heading row (title, muted meta, a link to its page) and a body. */
import React from "react";
import { ChevronRight } from "lucide-react";
import { Surface, type Props, run } from "../ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { said } from "../base";

/** The title of a profile card: between the page's heading and a section's. */
export const CARD_TITLE = "shrink-0 text-base font-semibold tracking-tight";

/**
 * The look of the profile's floating tooltips (the curve's crosshair, the heatmap's day), which follow the pointer
 * instead of an element: the same as a `Tip`.
 */
export const TIP = "pointer-events-none z-50 flex flex-col gap-0.5 rounded-md bg-foreground px-3 py-1.5 text-xs whitespace-nowrap text-background";

/** A quiet link at the end of a heading row: "View all ›". */
export function MoreLink({ actions, children, className }: { actions: string[] } & Props) {
  return (
    <Button variant="ghost" size="sm" data-action={actions.at(-1)} onClick={run(...actions)} className={cn("-mr-2 gap-0.5 text-muted-foreground hover:text-foreground", className)}>
      {children}
      <ChevronRight />
    </Button>
  );
}

/** A section of the profile: every one is built the same, heading row then body, same padding. */
export function Section({
  title,
  meta,
  open,
  more = "Details",
  aside,
  children,
  className,
  body,
  label,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** The sub-page the heading links to. */
  open?: string;
  more?: string;
  aside?: React.ReactNode;
  body?: string;
  label?: string;
} & Props) {
  return (
    <Surface className={className} aria-label={said(label)}>
      <div className="flex min-h-13 shrink-0 items-center gap-3 px-5 pt-2">
        <h2 className={CARD_TITLE}>{said(title)}</h2>
        {meta != null && <span className="min-w-0 truncate text-sm text-muted-foreground">{said(meta)}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {aside}
          {open && <MoreLink actions={["profileMode:" + open]}>{said(more)}</MoreLink>}
        </div>
      </div>
      <div className={cn("flex min-h-0 flex-col gap-5 px-5 pt-3 pb-5", body)}>{children}</div>
    </Surface>
  );
}
