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
import { Link } from "react-router";
/** The language in use: a component reading it is drawn again when it changes. */
export const useLanguage = () => useSyncExternalStore(onLanguage, language, language);
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

export { Badge as BrandBadge, Brand, Logo, Wordmark } from "./logo";
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
export const ROW = cn("rounded-xl text-left transition-colors hover:bg-muted aria-[current=page]:bg-accent aria-pressed:bg-accent", FOCUS);

/** An action as a word on a card or a line (Join, See the detail): muted, brighter under the pointer; `LINK_ACCENT` for the one expected. */
export const LINK = cn("inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-bold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50", FOCUS);
export const LINK_ACCENT = cn(LINK, "text-primary hover:text-primary/80");

/** Where something stands, in a word after a dot of its colour (Waiting, Live, Finished). */
export function StateMark({ tone = "", children, className }: { tone?: "" | "good" | "accent" | "lilac" | "off"; children: React.ReactNode; className?: string }) {
  const colour = { "": "text-muted-foreground", good: "text-success", accent: "text-primary", lilac: "text-lilac", off: "text-muted-foreground/70" }[tone];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-bold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current", colour, className)}>
      {children}
    </span>
  );
}

/** A large clickable card (a choice of method, of mode): its outline lights up under the pointer, chosen when pressed. */
export const TILE = cn(
  "rounded-[20px] bg-card text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-accent aria-checked:bg-accent",
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

/** A link of a side list (`SideNav`): its address, name, icon, whether it is the page shown, and what waits there. */
export type SideLink = { to: string; label: React.ReactNode; icon?: LucideIcon; current?: boolean; count?: number; action?: string };

/**
 * A column of links on a quiet panel, for a page's own sections (coaching, the profile): the current one raised, its
 * count in the accent. `title` heads it; `groups` are separated and may carry a small caption.
 */
export function SideNav({ title, groups, label, className }: { title?: React.ReactNode; groups: { caption?: React.ReactNode; links: SideLink[] }[]; label: string; className?: string }) {
  return (
    <nav aria-label={said(label)} className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[26px] bg-card p-3", className)}>
      {title && <h2 className="px-2.5 pt-1.5 text-lg font-extrabold">{said(title)}</h2>}
      {groups.map((group, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {group.caption && <span className="px-2.5 pb-1 text-xs font-semibold text-faint">{said(group.caption)}</span>}
          {group.links.map(({ to, label, icon: I, current, count, action }) => (
            <Link
              key={to}
              to={to}
              data-action={action}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-[14px] px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
                FOCUS,
              )}
            >
              {I && <I />}
              <span className="min-w-0 flex-1 truncate">{said(label)}</span>
              <Count n={count ?? 0} />
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
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
    <span aria-hidden="true" className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted text-primary [&_svg]:size-5", className)}>
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
      {title && <p className="text-base font-bold tracking-tight text-foreground">{said(title)}</p>}
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

/** A hint with its key drawn as a key: "Hold Space, release to start". */
export function keyed(hint: React.ReactNode) {
  const key = tr("Space");
  if (typeof hint !== "string" || !hint.includes(key)) return hint;
  const [before, after] = hint.split(key);
  return (
    <span>
      {before}
      <kbd className="mx-1 rounded-md bg-muted px-2 py-0.5 font-sans font-bold text-foreground">{key}</kbd>
      {after}
    </span>
  );
}

/** The padding every page has, and its column. */
export const PAGE = "flex h-full min-h-0 flex-col gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 md:gap-5 md:px-6 md:pt-2 md:pb-7 lg:px-9";

/**
 * The main work surface of a page (level 1): one calm card, the page's heart. Everything else stays on the page
 * background, grouped by headings and hairlines or in a quieter muted strip.
 */
export function Surface({ children, className, ...rest }: Props & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card
      className={cn(
        "min-h-0 gap-0 rounded-[26px] py-0 transition-[background-color,box-shadow] duration-200 group-data-running/app:bg-transparent",
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
    <section aria-label={said(label)} className={cn("grid shrink-0 gap-x-6 gap-y-3 rounded-[20px] bg-card px-5 py-3.5", FADE, className)}>
      {children}
    </section>
  );
}

/**
 * An action offered as a case of its own: its icon on a square, a title and a line under it, the key that does it on the
 * right. `primary` for the one expected, in the accent. Several stand side by side or in a column, never in one box.
 */
export function ActionCard({ icon: I, title, text, kbd, primary = false, pressed, action, disabled = false, onClick, className }: { icon?: LucideIcon; title: React.ReactNode; text?: React.ReactNode; kbd?: React.ReactNode; primary?: boolean; pressed?: boolean; action?: string; disabled?: boolean; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; className?: string }) {
  return (
    <button
      type="button"
      data-action={action}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
        primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card hover:bg-muted in-data-[slot=notice]:bg-muted in-data-[slot=notice]:hover:bg-accent",
        FOCUS,
        className,
      )}
    >
      {I && (
        <span aria-hidden="true" className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", primary ? "bg-primary-foreground/12" : "bg-muted text-muted-foreground")}>
          <I />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-tight font-bold">{title}</span>
        {text && <span className={cn("text-xs leading-snug", primary ? "text-primary-foreground/75" : "text-muted-foreground")}>{text}</span>}
      </span>
      {kbd && <kbd className={cn("hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 font-sans text-[11px] font-bold md:inline-flex", primary ? "bg-primary-foreground/12" : "bg-muted text-muted-foreground")}>{kbd}</kbd>}
    </button>
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
        "pointer-events-none absolute inset-0 m-auto flex items-center justify-center gap-1 rounded-[12px] bg-primary font-semibold text-primary-foreground shadow-md ring-2 ring-background transition-opacity",
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

/** Each player's own colour, the same wherever their name shows: picked from their name. */
const PERSON = [
  ["bg-primary", "text-primary"],
  ["bg-success", "text-success"],
  ["bg-lilac", "text-lilac"],
  ["bg-warning", "text-warning"],
] as const;
export const personColour = (name = "", part: 0 | 1 = 1) => PERSON[[...name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % PERSON.length]![part];

/** An account's face: its picture, or the first two letters of its name on a disc of its colour. */
export function Avatar({ name, src, size = 32, className }: { name: string | undefined; src?: string | null; size?: number; className?: string }) {
  if (src) return <img src={src} alt="" aria-hidden="true" loading="lazy" className={cn("shrink-0 rounded-full bg-muted object-cover", className)} style={{ width: size, height: size }} />;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full font-extrabold tracking-[-0.02em] text-background", personColour(name, 0), className)}
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
    <span className={cn(NUMERIC, "truncate font-bold", VALUE_SIZE[size], line, empty ? "text-faint" : TONE_TEXT[tone])}>
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
      className={cn("h-1.5 min-w-10 overflow-hidden rounded-full bg-muted", className)}
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
      <H className="text-base font-bold">{said(title)}</H>
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
            <h1 className="max-w-full min-w-0 shrink-0 truncate text-[22px] font-extrabold tracking-[-0.03em] md:text-[28px]">{said(title)}</h1>
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
      <UiButton variant={variant} size="icon" aria-label={said(label)} data-action={action} onClick={onClick}>
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
  action,
  className,
}: {
  value: string;
  options: { id: string; label: React.ReactNode; count?: number; tip?: string }[];
  onChange: (id: string) => void;
  label: string;
  /** Each option carries `data-action={action + id}`. */
  action?: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={said(label)}
      variant="default"
      size="segment"
      spacing={0.5}
      value={[value]}
      onValueChange={(next: string[]) => {
        if (next[0] && next[0] !== value) onChange(next[0]);
      }}
      className={cn("max-w-full flex-wrap rounded-[12px] bg-card p-1 inset-ring-1 inset-ring-edge", className)}
    >
      {options.map((o) => {
        const item = (
          <ToggleGroupItem
            key={o.id}
            value={o.id}
            data-action={action != null ? action + o.id : undefined}
            className="text-muted-foreground hover:bg-muted aria-pressed:bg-accent aria-pressed:text-foreground"
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

/** The dot colour of a figure by its tone: the best in mint, the worst in soft red, averages in the accent. */
export const DOT: Record<Tone | "lilac", string> = { "": "bg-warning", good: "bg-success", bad: "bg-destructive", accent: "bg-primary", warning: "bg-warning", lilac: "bg-lilac" };
/**
 * Dots for a row of figures: each tone's colour, the second current average in lilac so neighbours differ.
 */
export function dots(tones: Tone[]): string[] {
  let accents = 0;
  return tones.map((tone) => (tone === "accent" && accents++ % 2 === 1 ? DOT.lilac : DOT[tone]));
}

/**
 * A figure on its own tile (the timer's statistics, the profile's records): a coloured dot and its label, then the value
 * large. `size` "sm" for a compact tile.
 */
export function StatCard({ label, value, dot = DOT[""], size = "lg", className, style, children }: { label: React.ReactNode; value: React.ReactNode; dot?: string; size?: "sm" | "lg" } & Props) {
  const empty = value == null || (typeof value === "string" && /^[-–—]?$/.test(value.trim()));
  return (
    <div style={style} className={cn("min-w-0 rounded-[20px] bg-card", size === "lg" ? "px-5 py-4 [@media(max-height:700px)]:px-4 [@media(max-height:700px)]:py-2.5" : "px-4 py-3", className)}>
      <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot)} />
        <span className="truncate">{said(label)}</span>
      </span>
      <strong className={cn(NUMERIC, "mt-1 block truncate leading-tight font-extrabold tracking-[-0.02em]", size === "lg" ? "text-[clamp(1.375rem,2.3vw,2rem)] [@media(max-height:700px)]:text-xl" : "text-xl", empty && "text-faint")}>
        {empty ? "–" : value}
      </strong>
      {children}
    </div>
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
          <ToggleGroupItem value={e.id} aria-label={said(e.label)} data-event={e.id} size="icon" className="data-[pressed]:bg-primary/15 data-[pressed]:text-primary">
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

/** The class of a timer's milliseconds: smaller, and muted unless armed. */
export const fractionClass = (armed: boolean) => cn("text-[0.62em] tracking-[-0.03em]", !armed && "text-primary");

/**
 * The running digits: tinted with the accent, the milliseconds smaller in a muted version of it; red while holding,
 * green once ready. `live`: the characters are written by the caller into this (a box without a box of its own).
 */
export function Digits({ text, phase, className, digitsRef, live, "data-tour": tour }: { text: string; phase: string; className?: string; digitsRef?: React.Ref<HTMLDivElement>; live?: React.Ref<HTMLSpanElement>; "data-tour"?: string }) {
  const armed = phase === "holding" || phase === "ready";
  return (
    <div
      ref={digitsRef}
      data-tour={tour}
      className={cn(
        "flex items-baseline font-sans leading-[0.9] font-extrabold tracking-[-0.025em] tabular-nums whitespace-nowrap transition-[transform,color] duration-[380ms,80ms] ease-[cubic-bezier(0.2,0,0,1)] will-change-transform",
        armed ? (phase === "holding" ? "text-destructive" : "text-success") : "text-timer-ink",
        className,
      )}
      style={{ "--chars": Math.max(6, text.length) } as React.CSSProperties}
    >
      {live ? (
        <span ref={live} className="contents" />
      ) : (
        text.split("").map((ch, i) => (
          <span key={i} className={text.includes(".") && i > text.indexOf(".") ? fractionClass(armed) : undefined}>
            {said(ch)}
          </span>
        ))
      )}
    </div>
  );
}
