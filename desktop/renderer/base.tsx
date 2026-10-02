/**
 * The store-free half of the visual primitives: class names, figures, bars, headings and the viewport hooks. The app
 * reaches them through ui.tsx; the administration (admin/*), which has no store, imports them from here.
 */
import React, { useEffect, useState } from "react";
import { isPhone } from "../../src/client/lib/viewport";
import { TONE_TEXT, type Tone } from "../../src/client/lib/tone";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export { Logo, Wordmark } from "./logo";
export type { Tone } from "../../src/client/lib/tone";
export { isPhone } from "../../src/client/lib/viewport";

export type Props = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/** Everything but the running digits fades out while a solve runs (the root carries `data-running`). */
export const FADE = "transition-opacity duration-200 group-data-running/app:pointer-events-none group-data-running/app:opacity-0";

/** Times and figures: Geist with tabular digits. */
export const NUMERIC = "font-sans tabular-nums";

/** The small uppercase-free caption over a figure or a block. */
export const LABEL = "font-sans text-xs font-medium text-muted-foreground";

/** The width of the window and its height, kept up to date. */
export function useViewport() {
  const [v, set] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const resize = () => set({ w: innerWidth, h: innerHeight });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  return v;
}

/** Whether the window gets the phone layout: the stylesheet's `max-md:` (src/client/lib/viewport.ts). */
export const usePhone = () => isPhone(useViewport().w);

/** Above this window width the sidebar can show its labels; below it keeps to its icons. */
export const SIDEBAR_WIDE = 1100;
const FOLDED_KEY = "cubix.sidebar.folded";

/** The sidebar of a window: labelled on wide windows unless the user folded it (remembered), icons only below. */
export function WindowSidebar(props: Omit<React.ComponentProps<typeof SidebarProvider>, "open" | "onOpenChange">) {
  const wide = useViewport().w > SIDEBAR_WIDE,
    [folded, setFolded] = useState(() => localStorage.getItem(FOLDED_KEY) === "1");
  const change = (open: boolean) => {
    if (!wide) return;
    setFolded(!open);
    try {
      localStorage.setItem(FOLDED_KEY, open ? "0" : "1");
    } catch {}
  };
  return <SidebarProvider open={wide && !folded} onOpenChange={change} {...props} />;
}

/** An SVG of desktop/assets/icons drawn in the current colour: the WCA puzzle icons. */
export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current mask-contain mask-center mask-no-repeat", className)}
      style={{ width: size, height: size, maskImage: `url(/assets/icons/${name}.svg)` }}
    />
  );
}

/** A tooltip over any element. */
export function Tip({ content, children, side = "bottom" }: { content: React.ReactNode; side?: "top" | "bottom" | "left" | "right" } & { children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}

export type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";

/** Inside a page header every control is bordered (outline); elsewhere buttons stay quiet (ghost). */
export const InHead = React.createContext(false);
/** The variant a control takes where it stands, unless it names one. */
export const useQuiet = (variant?: Variant): Variant => {
  const head = React.useContext(InHead);
  return variant ?? (head ? "outline" : "ghost");
};

export function Empty({ children, className }: Props) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground", className)}>
      {children}
    </div>
  );
}

/** Moves in notation; brackets and parentheses muted. */
export function Alg({ text, size = 18, className }: { text: string; size?: number; className?: string }) {
  return (
    <div
      className={cn("alg flex min-w-0 flex-wrap gap-x-[0.5em] gap-y-[0.3em] font-sans leading-snug font-medium tracking-tight", className)}
      style={{ fontSize: size }}
    >
      {text?.split(/\s+/).map((word, i) => (
        <span key={i} className={cn(/[()\[\]]/.test(word) && "text-muted-foreground")}>
          {word}
        </span>
      ))}
    </div>
  );
}

/** The padding every page has, and its column. */
export const PAGE = "flex h-full min-h-0 flex-col gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 md:gap-5 md:px-6 md:pt-5 md:pb-5 xl:px-8";

/**
 * The main work surface of a page (level 1): one calm card, the page's heart. Everything else stays on the page
 * background, grouped by headings and hairlines or in a quieter muted strip.
 */
export function Surface({ children, className, ...rest }: Props & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card
      className={cn(
        "min-h-0 gap-0 py-0 transition-[background-color,box-shadow] duration-200 group-data-running/app:bg-transparent group-data-running/app:ring-transparent",
        className,
      )}
      {...rest}
    >
      {children}
    </Card>
  );
}

/** A secondary group of figures (level 2): a quiet muted band, no outline. */
export function Strip({ children, className, label }: Props & { label?: string }) {
  return (
    <section aria-label={label} className={cn("grid shrink-0 gap-x-6 gap-y-3 rounded-xl border bg-muted/45 px-4 py-3", FADE, className)}>
      {children}
    </section>
  );
}

/**
 * The mark on a diagram that plays its moves in 3D, "3D" beside the triangle unless `compact`. It shows on hover or
 * focus, centred, so it never hides part of the case; touch screens, which cannot hover, keep it in the bottom right
 * corner. Its parent button carries `group/play` and the click.
 */
export function PlayBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 m-auto flex items-center justify-center gap-1 rounded-full bg-primary font-semibold text-primary-foreground shadow-md ring-2 ring-background transition-opacity",
        "opacity-0 group-hover/play:opacity-100 group-focus-visible/play:opacity-100",
        "[@media(hover:none)]:inset-auto [@media(hover:none)]:right-1 [@media(hover:none)]:bottom-1 [@media(hover:none)]:h-6 [@media(hover:none)]:rounded-md [@media(hover:none)]:opacity-100",
        // The triangle carries some empty space on its left: a little less padding there keeps the content centred.
        compact ? "size-9 [@media(hover:none)]:w-6" : "h-9 w-fit pr-3.5 pl-3 text-xs [@media(hover:none)]:pr-1.5 [@media(hover:none)]:pl-1",
      )}
    >
      <Play className="size-3.5 fill-current" />
      {!compact && "3D"}
    </span>
  );
}

/** A whole page on its way: its header, the main surface and the side list, shaped like the timer. */
export function PageSkeleton({ side = true }: { side?: boolean }) {
  return (
    <div className={PAGE} aria-busy="true" aria-label="Loading">
      <header className="flex min-h-10 items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl p-6 ring-1 ring-foreground/10">
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
            <div className="flex flex-1 flex-col items-center justify-center gap-5">
              <Skeleton className="h-24 w-72 max-w-full" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-7 w-12 md:w-18" />
                ))}
              </div>
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        {side && (
          <div className="flex w-64 flex-col gap-3 max-lg:hidden">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** An account's face: the first two letters of its name on a disc of the accent. */
export function Avatar({ name, src, size = 32, className }: { name: string | undefined; src?: string | null; size?: number; className?: string }) {
  if (src) return <img src={src} alt="" aria-hidden="true" loading="lazy" className={cn("shrink-0 rounded-full bg-muted object-cover", className)} style={{ width: size, height: size }} />;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size / 2.8 }}
      aria-hidden="true"
    >
      {name?.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * How a figure reads: its label, how far it stands from the value and the value's lines: `default` (the app's captions),
 * `plain` (the profile's cards), `strong` (the administration) or `small` (the phone's session strip).
 */
const CAPTION = {
  default: [LABEL, "gap-1", "tracking-tight"],
  plain: ["text-xs text-muted-foreground", "gap-1.5", "leading-none tracking-tight"],
  strong: ["text-xs font-medium text-muted-foreground", "gap-1.5", "leading-none tracking-tight"],
  small: ["text-[11px] font-medium text-muted-foreground", "gap-0.5", "leading-none"],
} as const;

/** The size of a figure's value. */
const VALUE_SIZE = { sm: "text-sm", base: "text-base", lg: "text-lg", xl: "text-xl", "2xl": "text-2xl", "4xl": "text-4xl" } as const;

/**
 * A figure: its label small and muted, the value in Geist underneath; an empty one (a dash) is faded. `inline` sets
 * the label on the left and the value on the right, the label never cut. `aside` stands beside the value (a change),
 * `sub` under it (a breakdown).
 */
export function Figure({
  label,
  value,
  tone = "",
  size = "lg",
  caption = "default",
  inline = false,
  aside,
  sub,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: Tone;
  size?: keyof typeof VALUE_SIZE;
  caption?: keyof typeof CAPTION;
  inline?: boolean;
  aside?: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  const empty = value == null || (typeof value === "string" && /^[-–—]$/.test(value.trim())),
    [labelClass, gap, line] = CAPTION[caption];
  const shown = (
    <span className={cn(NUMERIC, "truncate font-medium", VALUE_SIZE[size], line, empty ? "text-muted-foreground/60" : TONE_TEXT[tone])}>
      {empty ? "–" : value}
    </span>
  );
  return (
    <div className={cn("flex min-w-0", inline ? "flex-row items-baseline justify-between gap-3" : cn("flex-col", gap), className)}>
      <span className={cn(labelClass, inline ? "shrink-0 whitespace-nowrap" : "truncate")}>{label}</span>
      {aside != null ? (
        <span className="flex min-w-0 items-baseline gap-2">
          {shown}
          {aside}
        </span>
      ) : (
        shown
      )}
      {sub && <span className="min-w-0 truncate text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

/** A thin bar: the accent once reached (`done`), muted while on its way; `fill` names another colour. */
export function Bar({ ratio, done = true, fill, className, label, text }: { ratio: number; done?: boolean; fill?: string; className?: string; label?: string; text?: string }) {
  const value = Math.max(0, Math.min(1, ratio));
  return (
    <div
      className={cn("h-1 min-w-10 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={label}
      aria-valuetext={text}
    >
      <div className={cn("h-full rounded-full", fill ?? (done ? "bg-primary" : "bg-muted-foreground/60"))} style={{ width: value * 100 + "%" }} />
    </div>
  );
}

/** A section title (level 2): a small heading, an optional muted count and the section's own controls; `rule` draws
 * the hairline under it. */
export function SectionHead({ title, meta, children, className, rule = false }: { title: React.ReactNode; meta?: React.ReactNode; rule?: boolean } & Props) {
  return (
    <div className={cn("flex min-h-8 shrink-0 items-center gap-2", rule && "border-b pb-2", className)}>
      <h2 className="text-sm font-medium">{title}</h2>
      {meta != null && <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{meta}</span>}
      {children && <div className="ml-auto flex items-center gap-1">{children}</div>}
    </div>
  );
}
