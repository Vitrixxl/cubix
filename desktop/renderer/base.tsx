/**
 * The store-free half of the visual primitives: class names, figures, bars, headings and the viewport hooks. The app
 * reaches them through ui.tsx; the administration (admin/*), which has no store, imports them from here.
 */
import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isPhone } from "../../src/client/lib/viewport";
import { TONE_TEXT, type Tone } from "../../src/client/lib/tone";
import { ChevronLeft, Ellipsis, Play, Search, Star, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EVENTS, eventInfo } from "../../src/shared/puzzles";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LANGUAGES, language, onLanguage, setLanguage, tr, type Language } from "../../src/client/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
/** The language in use: a component reading it is drawn again when it changes. */
export const useLanguage = () => useSyncExternalStore(onLanguage, language, () => "en" as Language);
/** The languages, each under its own name: the choice is kept on this device. */
export function LanguagePicker({ className }: { className?: string }) {
  const current = useLanguage(),
    items = LANGUAGES.map((l) => ({ value: l.id, label: l.name }));
  return (
    <Select items={items} value={current} onValueChange={(v) => void setLanguage(v as Language)}>
      <SelectTrigger aria-label={tr("Language")} data-action="language" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value} lang={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
/** A text passed to a component, in the current language; elements pass through. */
export const said = <T,>(x: T): T => (typeof x === "string" ? (tr(x) as T) : x);

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

/** The keyboard focus of anything clickable that is not a shadcn control: the same ring as a button's. */
export const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** A clickable row of a list (a link, a raw button): tinted under the pointer and while open, the button's focus ring. */
export const ROW = cn("rounded-lg text-left transition-colors hover:bg-muted/50 aria-[current=page]:bg-muted aria-pressed:bg-muted", FOCUS);

/** A large clickable card (a choice of method, of mode): its outline lights up under the pointer, chosen when pressed. */
export const TILE = cn(
  "rounded-xl border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/30 disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-primary/50 aria-pressed:bg-primary/10",
  FOCUS,
);

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

/**
 * The sidebar of a window: labelled on wide windows unless the user folded it (remembered), icons only below. A page
 * that needs the room (`compact`) folds it while it is shown; unfolding it there lasts until the page is left.
 */
export function WindowSidebar({ compact = false, ...props }: Omit<React.ComponentProps<typeof SidebarProvider>, "open" | "onOpenChange"> & { compact?: boolean }) {
  const wide = useViewport().w > SIDEBAR_WIDE,
    [folded, setFolded] = useState(() => localStorage.getItem(FOLDED_KEY) === "1"),
    [unfolded, setUnfolded] = useState(false);
  useEffect(() => {
    if (!compact) setUnfolded(false);
  }, [compact]);
  // The same function while nothing it reads changes: the sidebar's context, and all its items, stay as they are.
  const change = useCallback(
    (open: boolean) => {
      if (!wide) return;
      if (compact) return setUnfolded(open);
      setFolded(!open);
      try {
        localStorage.setItem(FOLDED_KEY, open ? "0" : "1");
      } catch {}
    },
    [wide, compact],
  );
  return <SidebarProvider open={wide && (compact ? unfolded : !folded)} onOpenChange={change} {...props} />;
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

/** An icon on a quiet square: the mark of an empty state, a card or a list row. */
export function IconTile({ icon: I, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5", className)}>
      <I />
    </span>
  );
}

/**
 * Where a list or a page has nothing, or failed: its icon on a quiet square, a title, then the sentence and the way
 * forward (`children`), centred in the room it has.
 */
export function Empty({ icon, title, children, className }: { icon?: LucideIcon; title?: React.ReactNode } & Props) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-balance text-muted-foreground", className)}>
      {icon && <IconTile icon={icon} />}
      {title && <p className="text-sm font-medium text-foreground">{said(title)}</p>}
      {children}
    </div>
  );
}

/** Moves in notation; brackets and parentheses muted. */
/** A megaminx scramble (its R++ and D-- turns), shown in rows of eleven turns. */
export const isMinxScramble = (text: string) => /\+\+|--/.test(text);
export function Alg({ text, size = 18, className }: { text: string; size?: number; className?: string }) {
  // A megaminx scramble in its usual rows, each ended by its U turn, the turns lined up in columns.
  if (isMinxScramble(text))
    return (
      <div
        className={cn("alg grid min-w-0 gap-x-[0.6em] gap-y-[0.25em] font-sans leading-snug font-medium tracking-tight tabular-nums", className)}
        style={{ fontSize: size, gridTemplateColumns: "repeat(11, max-content)" }}
      >
        {text.trim().split(/\s+/).map((word, i) => (
          <span key={i}>{word}</span>
        ))}
      </div>
    );
  return (
    <div
      className={cn("alg flex min-w-0 flex-wrap gap-x-[0.5em] gap-y-[0.3em] font-sans leading-snug font-medium tracking-tight", className)}
      style={{ fontSize: size }}
    >
      {text?.split(/\s+/).map((word, i) => (
        <span key={i} className={cn(/[()\[\]]/.test(word) && "text-muted-foreground")}>
          {said(word)}
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
    <section aria-label={said(label)} className={cn("grid shrink-0 gap-x-6 gap-y-3 rounded-xl border bg-muted/45 px-4 py-3", FADE, className)}>
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
    <div className={PAGE} aria-busy="true" aria-label={tr("Loading")}>
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
      <span className={cn(labelClass, inline ? "shrink-0 whitespace-nowrap" : "truncate")}>{said(label)}</span>
      {aside != null ? (
        <span className="flex min-w-0 items-baseline gap-2">
          {shown}
          {aside}
        </span>
      ) : (
        shown
      )}
      {sub && <span className="min-w-0 truncate text-xs text-muted-foreground">{said(sub)}</span>}
    </div>
  );
}

/**
 * A thin bar: the accent once reached (`done`), muted while on its way; `fill` names another colour. `behind` draws a
 * second, paler stretch under it (trained behind learned, booked behind paid).
 */
export function Bar({ ratio, behind, done = true, fill, className, label, text }: { ratio: number; behind?: number; done?: boolean; fill?: string; className?: string; label?: string; text?: string }) {
  const value = Math.max(0, Math.min(1, ratio)),
    pale = behind == null ? 0 : Math.max(value, Math.min(1, behind));
  return (
    <div
      className={cn("h-1 min-w-10 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={said(label)}
      aria-valuetext={text}
    >
      {behind != null ? (
        <div className="relative h-full rounded-full bg-primary/35" style={{ width: pale * 100 + "%" }}>
          <div className={cn("absolute inset-y-0 left-0 rounded-full", fill ?? "bg-primary")} style={{ width: pale ? (value / pale) * 100 + "%" : 0 }} />
        </div>
      ) : (
        <div className={cn("h-full rounded-full", fill ?? (done ? "bg-primary" : "bg-muted-foreground/60"))} style={{ width: value * 100 + "%" }} />
      )}
    </div>
  );
}

/** A section title (level 2): a small heading, an optional muted count and the section's own controls; `rule` draws
 * the hairline under it. */
export function SectionHead({ title, meta, children, className, rule = false, as: H = "h2" }: { title: React.ReactNode; meta?: React.ReactNode; rule?: boolean; as?: "h2" | "h3" } & Props) {
  return (
    <div className={cn("flex min-h-8 shrink-0 items-center gap-2", rule && "border-b pb-2", className)}>
      <H className="text-sm font-medium">{said(title)}</H>
      {meta != null && <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{meta}</span>}
      {children && <div className="ml-auto flex items-center gap-1">{children}</div>}
    </div>
  );
}

/**
 * Every page starts with the same header on the page background: the way back if any (`lead`, a `Back`), the title and
 * one short line beside it on the left, the page's controls on the right. Phones keep one row: the few controls a thumb
 * needs, and the rest in the "…" menu (`more`). Inside it every control is bordered (`InHead`).
 */
export function PageHead({ title, sub, lead, more, children, className }: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; more?: React.ReactNode } & Props) {
  return (
    <InHead.Provider value={true}>
      <header className={cn("flex min-h-10 shrink-0 items-center justify-between gap-x-2 md:justify-start md:gap-x-6", FADE, className)}>
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {lead}
          {/* One line: the title, then its subtitle on the same baseline, cut short where the row runs out. */}
          <div className="flex min-w-0 items-baseline gap-2 md:gap-3">
            <h1 className="max-w-full min-w-0 shrink-0 truncate text-xl font-semibold tracking-tight md:text-2xl">{said(title)}</h1>
            {sub && <p className="min-w-0 truncate text-xs text-muted-foreground md:text-sm">{said(sub)}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 md:justify-start">
          {children}
          {more && <MoreMenu>{more}</MoreMenu>}
        </div>
      </header>
    </InHead.Provider>
  );
}

/** The "…" of a phone header: the page's other controls as menu items. */
export function MoreMenu({ children }: Props) {
  const variant = useQuiet();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<UiButton variant={variant} size="icon" aria-label={tr("More")} data-action="menu:more" />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The way back, at the start of a page's header: one arrow, the same everywhere, roomier on phones. */
export function Back({ onClick, label = "Back", action }: { onClick: () => void; label?: string; action?: string }) {
  const variant = useQuiet("outline");
  return (
    <Tip content={said(label)}>
      <UiButton variant={variant} size="icon" aria-label={said(label)} data-action={action} className="max-md:size-10" onClick={onClick}>
        <ChevronLeft />
      </UiButton>
    </Tip>
  );
}

/**
 * One choice among a few, side by side (a segmented control): the chosen one raised. Its counts follow the labels.
 * Bordered in a header.
 */
export function Segmented({
  value,
  options,
  onChange,
  label,
  size = "sm",
  action,
  className,
}: {
  value: string;
  options: { id: string; label: React.ReactNode; count?: number; tip?: string }[];
  onChange: (id: string) => void;
  label: string;
  size?: "default" | "sm";
  /** Each option carries `data-action={action + id}`. */
  action?: string;
  className?: string;
}) {
  const head = React.useContext(InHead);
  return (
    <ToggleGroup
      aria-label={said(label)}
      variant={head ? "outline" : "default"}
      size={size}
      spacing={1}
      value={[value]}
      onValueChange={(next: string[]) => {
        if (next[0] && next[0] !== value) onChange(next[0]);
      }}
      className={className}
    >
      {options.map((o) => {
        const item = (
          <ToggleGroupItem
            key={o.id}
            value={o.id}
            data-action={action != null ? action + o.id : undefined}
            className="px-2.5 text-muted-foreground aria-pressed:text-foreground"
          >
            {said(o.label)}
            {o.count != null && <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{o.count.toLocaleString()}</span>}
          </ToggleGroupItem>
        );
        return o.tip ? (
          <Tip key={o.id} content={said(o.tip)}>
            {item}
          </Tip>
        ) : (
          item
        );
      })}
    </ToggleGroup>
  );
}

/** A row of figures: `columns` of them on one line where there is room, as many as fit otherwise. */
export function Stats({ children, className, columns }: { columns?: number } & Props) {
  const wide = !usePhone();
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-6 gap-y-4", className)}
      style={columns && wide ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {children}
    </div>
  );
}

/** The body card of a page: its toolbar on top, then the rest, scrolling inside unless `scroll` is off. */
export function PageCard({ toolbar, children, className, scroll = true }: { toolbar?: React.ReactNode; scroll?: boolean } & Props) {
  return (
    <Card className={cn("min-h-0 flex-1 gap-0 py-0", className)}>
      {toolbar && <div className="flex shrink-0 flex-wrap items-center gap-3 px-5 pt-4 pb-3">{toolbar}</div>}
      <div className={cn("min-h-0 flex-1 px-5 pb-5", scroll ? "overflow-y-auto" : "flex flex-col", !toolbar && "pt-4")}>{children}</div>
    </Card>
  );
}

/** Rows on their way, shaped like a list of people: a face, a name and a line. */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label={tr("Loading")} className={cn("flex flex-col gap-0.5 p-1.5", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Events as their WCA icons, each named in a tooltip. */
export function Events({ events, size = 16, className }: { events: string[]; size?: number; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5 text-muted-foreground", className)}>
      {events.map((id) => (
        <Tip key={id} content={said(eventInfo(id)?.label ?? id)}>
          <span className="flex">
            <Icon name={"Puzzle" + id} size={size} />
          </span>
        </Tip>
      ))}
    </span>
  );
}

/** Events picked among every WCA event: icon cells, the chosen ones tinted. `multiple` lets several be chosen. */
export function EventPicker({ value, onChange, multiple = false, className }: { value: string[]; onChange: (events: string[]) => void; multiple?: boolean; className?: string }) {
  return (
    <ToggleGroup
      multiple={multiple}
      variant="outline"
      spacing={1}
      value={value}
      onValueChange={(v: string[]) => {
        if (!multiple && !v.length) return;
        onChange(EVENTS.filter((e) => v.includes(e.id)).map((e) => e.id));
      }}
      aria-label={tr("Events")}
      className={cn("flex-wrap justify-start", className)}
    >
      {EVENTS.map((e) => (
        <Tip key={e.id} content={said(e.label)}>
          <ToggleGroupItem value={e.id} aria-label={said(e.label)} data-event={e.id} className="size-10 p-0 data-[pressed]:border-primary/60 data-[pressed]:bg-primary/10 data-[pressed]:text-primary">
            <Icon name={"Puzzle" + e.id} size={20} />
          </ToggleGroupItem>
        </Tip>
      ))}
    </ToggleGroup>
  );
}

/** Five stars, filled up to the rating (halves rounded), with the figure beside. */
export function Stars({ rating, size = 14, className, figure = true }: { rating: number | null; size?: number; className?: string; figure?: boolean }) {
  const filled = Math.round(rating ?? 0);
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={rating == null ? tr("Not rated yet") : tr("Rated {0} out of 5", { 0: rating.toFixed(1) })}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} style={{ width: size, height: size }} className={cn(i <= filled ? "fill-warning text-warning" : "text-muted-foreground/40")} />
        ))}
      </span>
      {figure && <span className={cn(NUMERIC, "text-muted-foreground")}>{rating == null ? tr("New") : rating.toFixed(1)}</span>}
    </span>
  );
}

/** A count on a navigation row or a list row, in the accent (unread, waiting) or muted; nothing when zero. */
export function Count({ n, tone = "primary", className }: { n: number; tone?: "primary" | "muted"; className?: string }) {
  if (!n) return null;
  return (
    <Badge variant={tone === "primary" ? "default" : "secondary"} className={cn(NUMERIC, "ml-auto min-w-5 px-1.5", className)}>
      {n}
    </Badge>
  );
}

/**
 * A search or filter field: its magnifier (or `icon`), the text, a × to clear it. `delay` waits that long after the last
 * key before `onChange` (a server query); without it every key counts.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  icon,
  delay = 0,
  action,
  numeric = false,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** The field's name for screen readers, the placeholder unless said. */
  label?: string;
  icon?: React.ReactNode;
  delay?: number;
  action?: string;
  numeric?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (!delay || text.trim() === value) return;
    const id = setTimeout(() => onChange(text.trim()), delay);
    return () => clearTimeout(id);
  }, [text]);
  const change = (next: string) => {
    setText(next);
    if (!delay) onChange(next);
  };
  return (
    <InputGroup className={className}>
      <InputGroupAddon>{icon ?? <Search />}</InputGroupAddon>
      <InputGroupInput
        value={text}
        onChange={(e) => change(e.target.value)}
        placeholder={said(placeholder)}
        aria-label={said(label ?? placeholder)}
        data-action={action}
        className={cn(numeric && text && NUMERIC)}
        spellCheck={false}
        autoFocus={autoFocus}
      />
      {text && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={tr("Clear the search")} onClick={() => (setText(""), onChange(""))}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
