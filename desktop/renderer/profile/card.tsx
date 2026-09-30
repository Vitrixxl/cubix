/** The profile's one building block: a card with a heading row (title, muted meta, a link to its page) and a body. */
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { store as s } from "../store";
import { InHead, MOBILE, MONO, type Props, useViewport } from "../ui";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Runs a store action from a click, leaving the focus so Space never presses it again. */
export const go = (...actions: string[]) => (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.blur();
  void (async () => {
    for (const action of actions) await s.action(action);
  })();
};

/** A quiet link at the end of a heading row: "View all ›". */
export function MoreLink({ actions, children, className }: { actions: string[] } & Props) {
  return (
    <Button variant="ghost" size="sm" data-action={actions.at(-1)} onClick={go(...actions)} className={cn("-mr-2 gap-0.5 text-muted-foreground hover:text-foreground", className)}>
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
    <Card className={cn("gap-0 py-0", className)} aria-label={label}>
      <div className="flex min-h-13 shrink-0 items-center gap-3 px-5 pt-2">
        <h2 className="shrink-0 text-base font-semibold tracking-tight">{title}</h2>
        {meta != null && <span className="min-w-0 truncate text-sm text-muted-foreground">{meta}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {aside}
          {open && <MoreLink actions={["profileMode:" + open]}>{more}</MoreLink>}
        </div>
      </div>
      <div className={cn("flex min-h-0 flex-col gap-5 px-5 pt-3 pb-5", body)}>{children}</div>
    </Card>
  );
}

/** A small heading inside a section, with an optional link on the right. */
export function SubHead({ title, children }: { title: React.ReactNode } & Props) {
  return (
    <div className="flex h-8 items-center gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children && <div className="ml-auto flex items-center">{children}</div>}
    </div>
  );
}

/** A figure: label over the value, the value in mono. */
export function Stat({ label, value, tone, className }: { label: React.ReactNode; value: React.ReactNode; tone?: "good" | "accent" | "bad"; className?: string }) {
  const empty = value == null || value === "–" || value === "-";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          MONO,
          "truncate text-xl leading-none font-medium tracking-tight",
          empty ? "text-muted-foreground/60" : tone === "good" ? "text-success" : tone === "accent" ? "text-primary" : tone === "bad" ? "text-destructive" : "",
        )}
      >
        {empty ? "–" : value}
      </span>
    </div>
  );
}

/** A row of figures: `columns` of them on one line where there is room, as many as fit otherwise. */
export function Stats({ children, className, columns }: { columns?: number } & Props) {
  const wide = useViewport().w > MOBILE;
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-6 gap-y-4", className)}
      style={columns && wide ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {children}
    </div>
  );
}

/** Sub-page heading: back to the overview, the title and its meta, the page's controls on the right (outlined). */
export function SubPageHead({ title, meta, children, back = true }: { title: React.ReactNode; meta?: React.ReactNode; back?: boolean } & Props) {
  return (
    <InHead.Provider value={true}>
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          {back && (
            <Button variant="ghost" size="icon" aria-label="Back to the profile" data-action="profileMode:overview" onClick={go("profileMode:overview")} className="-ml-2">
              <ChevronLeft />
            </Button>
          )}
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {meta != null && <span className="truncate pl-1 text-sm text-muted-foreground">{meta}</span>}
        </div>
        {children && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>}
      </header>
    </InHead.Provider>
  );
}

/** Where a count goes in a sentence: mono, full colour. */
export const Num = ({ children }: Props) => <span className={cn(MONO, "font-medium text-foreground")}>{children}</span>;
